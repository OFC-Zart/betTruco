-- =====================================================================
-- Mesas fixas: toda turma tem Mesa 1 e Mesa 2 sempre prontas. Quando a
-- partida acaba, a mesa volta sozinha, vazia, pra colocar quem joga agora.
-- Cada partida continua sendo uma linha própria em "mesas" (o histórico e
-- o ranking leem os jogadores dela); o que renasce é o lugar com o mesmo
-- número. Quem está na turma escolhe quem joga; só admin cria e remove mesa.
-- =====================================================================

-- turmas que já existem ganham o que falta entre as mesas 1 e 2
insert into public.mesas (group_id, numero, criado_por)
select g.id, n, g.criado_por
from public.groups g
cross join generate_series(1, 2) as n
where not exists (
  select 1 from public.mesas m
  where m.group_id = g.id and m.numero = n and m.status <> 'encerrada'
);

create or replace function public.criar_turma(p_nome text)
returns public.groups language plpgsql as $$
declare
  v_eu uuid := _eu();
  g groups;
begin
  insert into groups (nome, codigo_convite, criado_por)
  values (btrim(p_nome), _gerar_codigo(p_nome), v_eu)
  returning * into g;
  insert into group_members (group_id, user_id, papel) values (g.id, v_eu, 'admin');
  insert into items (group_id, nome, emoji) values
    (g.id, 'Cerveja', '🍺'),
    (g.id, 'Coca', '🥤'),
    (g.id, 'Salgadinho', '🍟');
  insert into mesas (group_id, numero, criado_por) values (g.id, 1, v_eu), (g.id, 2, v_eu);
  return g;
end $$;

-- só admin acrescenta mesa fixa (o número é o menor livre)
create or replace function public.criar_mesa(p_group uuid, p_nome text default null)
returns uuid language plpgsql as $$
declare
  v_num integer;
  v_id uuid;
begin
  perform _exigir_membro(p_group);
  if not is_admin(p_group) then raise exception 'Só admin cria mesa nova'; end if;
  perform pg_advisory_xact_lock(hashtext('mesa:' || p_group::text));
  select min(n) into v_num
  from generate_series(1, 999) n
  where not exists (
    select 1 from mesas where group_id = p_group and numero = n and status <> 'encerrada'
  );
  insert into mesas (group_id, numero, nome, criado_por)
  values (p_group, v_num, nullif(btrim(coalesce(p_nome, '')), ''), app_uid())
  returning id into v_id;
  return v_id;
end $$;

-- Sentar em uma mesa tira a pessoa das outras mesas livres. Se ela está
-- jogando em outra, avisa em vez de tirar.
create or replace function public._liberar_de_outras_mesas(p_group uuid, p_user uuid, p_mesa uuid)
returns void language plpgsql as $$
declare
  v_num integer;
begin
  select m.numero into v_num
  from mesa_players mp join mesas m on m.id = mp.mesa_id
  where mp.user_id = p_user and m.group_id = p_group and m.id <> p_mesa and m.status = 'em_jogo'
  limit 1;
  if found then
    raise exception '% está jogando na Mesa %', (select apelido from profiles where id = p_user), v_num;
  end if;
  delete from mesa_votos v using mesas m
  where v.mesa_id = m.id and v.eleitor_id = p_user
    and m.group_id = p_group and m.id <> p_mesa and m.status = 'aberta';
  delete from mesa_players mp using mesas m
  where mp.mesa_id = m.id and mp.user_id = p_user
    and m.group_id = p_group and m.id <> p_mesa and m.status = 'aberta';
end $$;

-- qualquer pessoa da turma põe alguém na mesa
create or replace function public.sentar(p_mesa uuid, p_posicao integer, p_quem uuid default null)
returns void language plpgsql as $$
declare
  v_eu uuid := _eu();
  v_alvo uuid := coalesce(p_quem, v_eu);
  me mesas;
begin
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  perform _exigir_membro(me.group_id);
  if me.status = 'encerrada' then raise exception 'Essa partida já acabou'; end if;
  if me.status = 'em_jogo' and not is_admin(me.group_id) then
    raise exception 'Partida rolando: só admin troca jogador agora';
  end if;
  if p_posicao not between 0 and 3 then raise exception 'Lugar inválido'; end if;
  if not exists (select 1 from group_members where group_id = me.group_id and user_id = v_alvo) then
    raise exception 'Essa pessoa não é da turma';
  end if;
  if exists (select 1 from mesa_players where mesa_id = p_mesa and posicao = p_posicao and user_id <> v_alvo) then
    raise exception 'Esse lugar já está ocupado';
  end if;
  perform _liberar_de_outras_mesas(me.group_id, v_alvo, p_mesa);
  delete from mesa_players where mesa_id = p_mesa and user_id = v_alvo;
  insert into mesa_players (mesa_id, group_id, user_id, posicao, dupla)
  values (p_mesa, me.group_id, v_alvo, p_posicao, case when p_posicao % 2 = 0 then 'A' else 'B' end);
  update mesas set marcador_id = coalesce(marcador_id, v_eu), atualizado_em = now() where id = p_mesa;
end $$;

create or replace function public.levantar(p_mesa uuid, p_posicao integer)
returns void language plpgsql as $$
declare
  me mesas;
  pl mesa_players;
begin
  perform _eu();
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  perform _exigir_membro(me.group_id);
  if me.status <> 'aberta' and not is_admin(me.group_id) then
    raise exception 'Partida rolando: só admin troca jogador agora';
  end if;
  select * into pl from mesa_players where mesa_id = p_mesa and posicao = p_posicao;
  if not found then return; end if;
  delete from mesa_players where id = pl.id;
  delete from mesa_votos where mesa_id = p_mesa and eleitor_id = pl.user_id;
  update mesas set atualizado_em = now() where id = p_mesa;
end $$;

-- Monta a mesa de uma vez (lugares 0 a 3, nulo = vazio): é o que permite trocar
-- dois de lugar e sortear as duplas sem passar por um estado inválido.
-- Com a partida rolando: admin muda tudo; quem marca só troca dentro da dupla.
create or replace function public.definir_assentos(
  p_mesa uuid, p_0 uuid default null, p_1 uuid default null, p_2 uuid default null, p_3 uuid default null
)
returns void language plpgsql as $$
declare
  v_eu uuid := _eu();
  me mesas;
  v_lugares uuid[] := array[p_0, p_1, p_2, p_3];
  v_novos uuid[] := array_remove(array[p_0, p_1, p_2, p_3], null);
  v_quem uuid;
begin
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  perform _exigir_membro(me.group_id);
  if me.status = 'encerrada' then raise exception 'Essa partida já acabou'; end if;
  if (select count(distinct x) from unnest(v_novos) x) <> cardinality(v_novos) then
    raise exception 'A mesma pessoa não senta em dois lugares';
  end if;
  if exists (
    select 1 from unnest(v_novos) x
    where not exists (select 1 from group_members where group_id = me.group_id and user_id = x)
  ) then
    raise exception 'Essa pessoa não é da turma';
  end if;
  if me.status = 'em_jogo' and not is_admin(me.group_id) then
    if not _pode_pontuar(p_mesa) then
      raise exception 'Partida rolando: só quem marca troca a ordem';
    end if;
    if array(select x from unnest(array[p_0, p_2]) x where x is not null order by x)
         is distinct from array(select user_id from mesa_players where mesa_id = p_mesa and dupla = 'A' order by user_id)
       or array(select x from unnest(array[p_1, p_3]) x where x is not null order by x)
         is distinct from array(select user_id from mesa_players where mesa_id = p_mesa and dupla = 'B' order by user_id) then
      raise exception 'Durante a partida só dá pra trocar de lugar dentro da dupla';
    end if;
  end if;
  foreach v_quem in array v_novos loop
    perform _liberar_de_outras_mesas(me.group_id, v_quem, p_mesa);
  end loop;
  delete from mesa_players where mesa_id = p_mesa;
  insert into mesa_players (mesa_id, group_id, user_id, posicao, dupla)
  select p_mesa, me.group_id, u.quem, (u.i - 1)::int, case when (u.i - 1) % 2 = 0 then 'A' else 'B' end
  from unnest(v_lugares) with ordinality as u(quem, i)
  where u.quem is not null;
  delete from mesa_votos where mesa_id = p_mesa and eleitor_id <> all (v_novos);
  update mesas set marcador_id = coalesce(marcador_id, v_eu), atualizado_em = now() where id = p_mesa;
end $$;

-- Qualquer um da turma começa. Quem começa marca os pontos, a não ser que a
-- mesa já tenha votado em alguém.
create or replace function public.iniciar_partida(
  p_mesa uuid,
  p_nome_a text,
  p_nome_b text,
  p_unidade text default null,
  p_item uuid default null,
  p_qtd integer default 0,
  p_carteador integer default null,
  p_pontos_alvo integer default null,
  p_melhor_de_3 boolean default null
)
returns uuid language plpgsql as $$
declare
  v_eu uuid := _eu();
  me mesas;
  g groups;
  v_id uuid;
  v_ocupado text;
begin
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  perform _exigir_membro(me.group_id);
  if me.status <> 'aberta' then raise exception 'Essa mesa já começou ou fechou'; end if;
  if not exists (select 1 from mesa_players where mesa_id = p_mesa and dupla = 'A')
     or not exists (select 1 from mesa_players where mesa_id = p_mesa and dupla = 'B') then
    raise exception 'Precisa de pelo menos um jogador em cada dupla';
  end if;
  select pf.apelido || ' está jogando na Mesa ' || m.numero into v_ocupado
  from mesa_players eu
  join mesa_players mp on mp.user_id = eu.user_id and mp.mesa_id <> eu.mesa_id
  join mesas m on m.id = mp.mesa_id and m.group_id = me.group_id and m.status = 'em_jogo'
  join profiles pf on pf.id = eu.user_id
  where eu.mesa_id = p_mesa
  limit 1;
  if v_ocupado is not null then raise exception '%', v_ocupado; end if;
  if coalesce(p_qtd, 0) > 0 and p_unidade = 'item'
     and not exists (select 1 from items where id = p_item and group_id = me.group_id) then
    raise exception 'Item inválido';
  end if;
  select * into g from groups where id = me.group_id;

  insert into truco_matches (
    mesa_id, group_id, nome_dupla_a, nome_dupla_b, pontos_alvo, melhor_de_3,
    valendo_unidade, valendo_item_id, valendo_qtd, carteador_pos
  ) values (
    p_mesa, me.group_id,
    coalesce(nullif(btrim(p_nome_a), ''), 'Dupla A'),
    coalesce(nullif(btrim(p_nome_b), ''), 'Dupla B'),
    coalesce(p_pontos_alvo, g.truco_pontos_alvo),
    coalesce(p_melhor_de_3, g.truco_melhor_de_3),
    case when coalesce(p_qtd, 0) > 0 then p_unidade end,
    case when coalesce(p_qtd, 0) > 0 and p_unidade = 'item' then p_item end,
    greatest(coalesce(p_qtd, 0), 0),
    coalesce(
      (select posicao from mesa_players where mesa_id = p_mesa and posicao = p_carteador),
      (select min(posicao) from mesa_players where mesa_id = p_mesa)
    )
  ) returning id into v_id;

  update mesas set
    status = 'em_jogo',
    atualizado_em = now(),
    marcador_id = case
      when exists (select 1 from mesa_votos where mesa_id = p_mesa) then marcador_id
      else v_eu
    end
  where id = p_mesa;
  return v_id;
end $$;

-- a partida acabou: a mesa volta na hora, vazia, pra colocar quem joga agora
create or replace function public._reabrir_mesa(p_mesa uuid)
returns void language plpgsql as $$
declare
  me mesas;
begin
  select * into me from mesas where id = p_mesa;
  insert into mesas (group_id, numero, nome, criado_por)
  values (me.group_id, me.numero, me.nome, me.criado_por)
  on conflict (group_id, numero) where status <> 'encerrada' do nothing;
end $$;

-- p_venc nulo = partida anulada (ninguém deve nada)
create or replace function public._finalizar_partida(p_match uuid, p_venc text)
returns void language plpgsql as $$
declare
  m truco_matches;
begin
  update truco_matches set
    status = case when p_venc is null then 'cancelada' else 'encerrada' end,
    vencedor = p_venc,
    encerrada_em = now(),
    updated_at = now()
  where id = p_match and status = 'em_jogo'
  returning * into m;
  if not found then return; end if;

  update mesas set status = 'encerrada', encerrada_em = now(), atualizado_em = now()
  where id = m.mesa_id;

  -- cada perdedor deve "valendo_qtd" a um vencedor (pareado pela ordem da mesa)
  if p_venc is not null and m.valendo_unidade is not null and m.valendo_qtd > 0 then
    insert into debts (group_id, origem_tipo, origem_id, devedor_id, credor_id, unidade, item_id, quantidade)
    select m.group_id, 'truco', m.id, l.user_id, w.user_id, m.valendo_unidade, m.valendo_item_id, m.valendo_qtd
    from (
      select user_id, row_number() over (order by posicao) as rn
      from mesa_players where mesa_id = m.mesa_id and dupla <> p_venc
    ) l
    join (
      select user_id, row_number() over (order by posicao) as rn, count(*) over () as c
      from mesa_players where mesa_id = m.mesa_id and dupla = p_venc
    ) w on w.rn = ((l.rn - 1) % w.c) + 1
    on conflict do nothing;
  end if;

  perform _fechar_apostas_da_mesa(m.mesa_id, p_venc);
  perform _reabrir_mesa(m.mesa_id);
end $$;

-- Remover a mesa fixa da turma: só admin. Com partida rolando, ela é anulada.
create or replace function public.encerrar_mesa(p_mesa uuid)
returns void language plpgsql as $$
declare
  me mesas;
  v_match uuid;
begin
  perform _eu();
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  if me.status = 'encerrada' then return; end if;
  if not is_admin(me.group_id) then raise exception 'As mesas são fixas: só admin remove'; end if;
  select id into v_match from truco_matches where mesa_id = p_mesa and status = 'em_jogo';
  if v_match is not null then
    perform _finalizar_partida(v_match, null);
    -- a anulação reabriu a mesa: aqui a ideia é ela sumir
    delete from mesas where group_id = me.group_id and numero = me.numero and status = 'aberta';
  else
    update mesas set status = 'encerrada', encerrada_em = now(), atualizado_em = now() where id = p_mesa;
    perform _fechar_apostas_da_mesa(p_mesa, null);
  end if;
end $$;

-- limpar o histórico não leva embora as mesas fixas (voltam vazias)
create or replace function public.admin_limpar_historico(p_group uuid)
returns void language plpgsql as $$
declare
  v_fixas record;
  v_lista jsonb;
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin limpa o histórico'; end if;
  perform pg_advisory_xact_lock(hashtext('acerto:' || p_group::text));
  select coalesce(jsonb_agg(jsonb_build_object('numero', numero, 'nome', nome)), '[]'::jsonb) into v_lista
  from mesas where group_id = p_group and status <> 'encerrada';
  delete from debts where group_id = p_group;
  delete from wagers where group_id = p_group;
  delete from mesas where group_id = p_group;
  for v_fixas in select * from jsonb_to_recordset(v_lista) as x(numero integer, nome text) loop
    insert into mesas (group_id, numero, nome, criado_por) values (p_group, v_fixas.numero, v_fixas.nome, app_uid());
  end loop;
end $$;

-- quem sai da turma também sai das mesas livres
create or replace function public.remover_membro(p_group uuid, p_user uuid)
returns void language plpgsql as $$
declare
  v_eu uuid := _eu();
begin
  if p_user <> v_eu and not is_admin(p_group) then
    raise exception 'Só admin remove outra pessoa';
  end if;
  if exists (select 1 from group_members where group_id = p_group and user_id = p_user and papel = 'admin')
     and (select count(*) from group_members where group_id = p_group and papel = 'admin') = 1
     and (select count(*) from group_members where group_id = p_group) > 1 then
    raise exception 'Promova outro admin antes de sair';
  end if;
  delete from mesa_players mp using mesas m
  where mp.mesa_id = m.id and mp.user_id = p_user and m.group_id = p_group and m.status = 'aberta';
  delete from group_members where group_id = p_group and user_id = p_user;
end $$;

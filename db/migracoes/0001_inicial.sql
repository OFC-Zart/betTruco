-- =====================================================================
-- Placar da Resenha — schema inicial (Postgres puro: Neon na Vercel ou local)
-- Só registro: fichas e itens. Nenhum dinheiro passa por aqui.
--
-- Toda escrita passa por funções que conferem permissão. Quem chama é
-- identificado por app_uid(), que o servidor preenche a cada transação
-- (set_config('app.user_id', ...)) depois de validar o cookie de sessão.
-- Este arquivo roda sozinho no primeiro acesso (lib/server/db.ts).
-- =====================================================================

-- ---------------------------------------------------------------------
-- PESSOAS E LOGIN
-- ---------------------------------------------------------------------

-- Toda pessoa da turma. "Visitante" = amigo sem app: não tem login, quem
-- cuida dele (dono da mesa, admin ou quem criou) senta, aposta e recebe por ele.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  apelido text not null check (char_length(btrim(apelido)) between 1 and 24),
  avatar text not null default '🃏' check (char_length(avatar) <= 16),
  cor text not null default '#39FF14' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  visitante boolean not null default false,
  criado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Login (usuário + senha). Só quem tem app; visitante não tem linha aqui.
create table public.usuarios (
  id uuid primary key references public.profiles (id) on delete cascade,
  login text not null unique check (login ~ '^[a-z0-9_.]{3,20}$'),
  senha_hash text not null,
  created_at timestamptz not null default now()
);

create table public.sessoes (
  token_hash text primary key, -- sha256 do token guardado no cookie
  user_id uuid not null references public.usuarios (id) on delete cascade,
  expira_em timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessoes_user_idx on public.sessoes (user_id);

create or replace function public.app_uid()
returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------
-- TURMA
-- ---------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 1 and 40),
  codigo_convite text not null unique,
  -- quanto vale 1 ficha, em centavos (só referência; nada é cobrado)
  valor_ficha_centavos integer not null default 100 check (valor_ficha_centavos between 0 and 100000),
  truco_pontos_alvo integer not null default 12 check (truco_pontos_alvo between 1 and 30),
  truco_melhor_de_3 boolean not null default true,
  -- sobe a cada mudança na turma: as telas só recarregam quando muda
  versao bigint not null default 0,
  criado_por uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  papel text not null default 'membro' check (papel in ('admin', 'membro')),
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 24),
  emoji text not null default '🎁' check (char_length(emoji) <= 16),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index items_group_idx on public.items (group_id);

-- ---------------------------------------------------------------------
-- MESAS E TRUCO
-- ---------------------------------------------------------------------

create table public.mesas (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  numero integer not null check (numero > 0),
  nome text check (nome is null or char_length(nome) <= 30),
  jogo text not null default 'truco' check (jogo in ('truco')),
  status text not null default 'aberta' check (status in ('aberta', 'em_jogo', 'encerrada')),
  criado_por uuid not null references public.profiles (id),
  -- o "dono" da mesa: quem marca os pontos (escolhido na votação; começa com quem criou)
  marcador_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  encerrada_em timestamptz
);
create index mesas_group_idx on public.mesas (group_id, status);
-- número único só entre as mesas abertas (a mesa 1 volta a existir depois)
create unique index mesas_numero_aberta_uidx on public.mesas (group_id, numero) where status <> 'encerrada';

create table public.mesa_players (
  id uuid primary key default gen_random_uuid(),
  mesa_id uuid not null references public.mesas (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- ordem da mesa: 0..3. Posições pares = dupla A, ímpares = dupla B
  posicao integer not null check (posicao between 0 and 3),
  dupla text not null check (dupla in ('A', 'B')),
  created_at timestamptz not null default now(),
  check (dupla = case when posicao % 2 = 0 then 'A' else 'B' end),
  unique (mesa_id, posicao),
  unique (mesa_id, user_id)
);
create index mesa_players_group_idx on public.mesa_players (group_id);

-- votação rápida de quem marca os pontos
create table public.mesa_votos (
  mesa_id uuid not null references public.mesas (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  eleitor_id uuid not null references public.profiles (id) on delete cascade,
  candidato_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mesa_id, eleitor_id)
);

create table public.truco_matches (
  id uuid primary key default gen_random_uuid(),
  mesa_id uuid not null references public.mesas (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  nome_dupla_a text not null check (char_length(nome_dupla_a) between 1 and 24),
  nome_dupla_b text not null check (char_length(nome_dupla_b) between 1 and 24),
  pontos_alvo integer not null default 12 check (pontos_alvo between 1 and 30),
  melhor_de_3 boolean not null default true,
  -- o que está valendo, POR PESSOA da dupla perdedora (null = só pela honra)
  valendo_unidade text check (valendo_unidade in ('fichas', 'item')),
  valendo_item_id uuid references public.items (id),
  valendo_qtd integer not null default 0 check (valendo_qtd between 0 and 100000),
  placar_a integer not null default 0 check (placar_a >= 0),
  placar_b integer not null default 0 check (placar_b >= 0),
  carteador_pos integer not null default 0 check (carteador_pos between 0 and 3),
  quedas_a integer not null default 0,
  quedas_b integer not null default 0,
  status text not null default 'em_jogo' check (status in ('em_jogo', 'encerrada', 'cancelada')),
  vencedor text check (vencedor in ('A', 'B')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  encerrada_em timestamptz,
  check (valendo_unidade is distinct from 'item' or valendo_item_id is not null)
);
create index truco_matches_group_idx on public.truco_matches (group_id, status);
create index truco_matches_mesa_idx on public.truco_matches (mesa_id);
create unique index truco_matches_uma_por_mesa_uidx on public.truco_matches (mesa_id) where status = 'em_jogo';

create table public.truco_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.truco_matches (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  dupla text check (dupla in ('A', 'B')),
  pontos integer not null default 0,
  tipo text not null check (tipo in ('+1', '-1', 'truco', 'seis', 'nove', 'doze', 'desfazer', 'carta')),
  -- foto do placar antes da jogada, usada pelo "desfazer"
  antes jsonb not null,
  desfeito boolean not null default false,
  criado_por uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index truco_events_match_idx on public.truco_events (match_id, id desc);

-- ---------------------------------------------------------------------
-- APOSTAS E DÍVIDAS
-- ---------------------------------------------------------------------

create table public.wagers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  mesa_id uuid references public.mesas (id) on delete set null,
  tipo text not null default 'texto_livre' check (tipo in ('texto_livre', 'dupla_vence')),
  texto text check (texto is null or char_length(texto) <= 140),
  alvo_dupla text check (alvo_dupla in ('A', 'B')),
  modalidade text not null default 'outro'
    check (modalidade in ('truco', 'valorant', 'futebol', 'sinuca', 'baralho', 'outro')),
  unidade text not null check (unidade in ('fichas', 'item')),
  item_id uuid references public.items (id),
  quantidade integer not null check (quantidade between 1 and 100000),
  criado_por uuid not null references public.profiles (id), -- quem digitou (pode ser o dono da mesa por um visitante)
  -- lado A = quem propôs ("aposto que..."); lado B = quem topou
  lado_a_user uuid not null references public.profiles (id),
  lado_b_user uuid references public.profiles (id),
  aberto boolean not null default true, -- true = qualquer um da turma pode topar
  status text not null default 'aberto'
    check (status in ('aberto', 'valendo', 'aguardando', 'resolvido', 'empate', 'cancelado')),
  resultado_proposto text check (resultado_proposto in ('A', 'B', 'empate')),
  vencedor_lado text check (vencedor_lado in ('A', 'B')),
  resolvido_por uuid references public.profiles (id),
  marcado_em timestamptz,
  confirmado_em timestamptz,
  created_at timestamptz not null default now(),
  check (unidade <> 'item' or item_id is not null),
  check (tipo <> 'dupla_vence' or (mesa_id is not null and alvo_dupla is not null)),
  check (tipo <> 'texto_livre' or texto is not null)
);
create index wagers_group_idx on public.wagers (group_id, status);
create index wagers_mesa_idx on public.wagers (mesa_id);

create table public.debts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  origem_tipo text not null check (origem_tipo in ('wager', 'truco')),
  origem_id uuid not null,
  devedor_id uuid not null references public.profiles (id),
  credor_id uuid not null references public.profiles (id),
  unidade text not null check (unidade in ('fichas', 'item')),
  item_id uuid references public.items (id),
  quantidade integer not null check (quantidade > 0),
  quitado_qtd integer not null default 0,
  quitado_em timestamptz,
  created_at timestamptz not null default now(),
  check (devedor_id <> credor_id),
  check (quitado_qtd between 0 and quantidade),
  check (unidade <> 'item' or item_id is not null),
  -- impede dívida duplicada se dois tocarem ao mesmo tempo
  unique (origem_tipo, origem_id, devedor_id, credor_id)
);
create index debts_group_idx on public.debts (group_id);

-- ---------------------------------------------------------------------
-- FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------

create or replace function public._eu()
returns uuid language plpgsql stable as $$
declare
  v uuid := app_uid();
begin
  if v is null then
    raise exception 'Faça login primeiro';
  end if;
  return v;
end $$;

create or replace function public.is_member(p_group uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from group_members where group_id = p_group and user_id = app_uid()
  );
$$;

create or replace function public.is_admin(p_group uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from group_members
    where group_id = p_group and user_id = app_uid() and papel = 'admin'
  );
$$;

create or replace function public._exigir_membro(p_group uuid)
returns void language plpgsql stable as $$
begin
  perform _eu();
  if not is_member(p_group) then
    raise exception 'Você não faz parte dessa turma';
  end if;
end $$;

create or replace function public._eh_jogador(p_mesa uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from mesa_players where mesa_id = p_mesa and user_id = app_uid()
  );
$$;

-- quem marca: o dono da mesa (marcador). Sem marcador, qualquer jogador sentado.
-- Admin sempre pode (pra corrigir erro).
create or replace function public._pode_pontuar(p_mesa uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from mesas m
    where m.id = p_mesa
      and (
        m.marcador_id = app_uid()
        or (m.marcador_id is null and _eh_jogador(p_mesa))
        or is_admin(m.group_id)
      )
  );
$$;

-- dono da mesa, quem criou a mesa ou admin: organiza assentos e visitantes
create or replace function public._organiza_mesa(p_mesa uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from mesas m
    where m.id = p_mesa
      and (m.marcador_id = app_uid() or m.criado_por = app_uid() or is_admin(m.group_id))
  );
$$;

-- Em nome de quem a ação é feita. Sem p_por (ou p_por = eu): eu mesmo.
-- Por outra pessoa: só por VISITANTE da turma, e só se eu for admin, quem
-- criou o visitante ou o dono da mesa da aposta.
create or replace function public._quem(p_por uuid, p_group uuid, p_mesa uuid)
returns uuid language plpgsql stable as $$
declare
  v_eu uuid := _eu();
  p profiles;
begin
  if p_por is null or p_por = v_eu then
    return v_eu;
  end if;
  select * into p from profiles where id = p_por;
  if not found or not p.visitante
     or not exists (select 1 from group_members where group_id = p_group and user_id = p_por) then
    raise exception 'Só dá pra agir por visitante (amigo sem app) da turma';
  end if;
  if is_admin(p_group) or p.criado_por = v_eu
     or (p_mesa is not null and exists (select 1 from mesas where id = p_mesa and marcador_id = v_eu)) then
    return p_por;
  end if;
  raise exception 'Só o dono da mesa, um admin ou quem cadastrou o visitante age por ele';
end $$;

create or replace function public._proximo_carteador(p_mesa uuid, p_pos integer)
returns integer language sql stable as $$
  select coalesce(
    (select posicao from mesa_players where mesa_id = p_mesa and posicao > p_pos order by posicao limit 1),
    (select min(posicao) from mesa_players where mesa_id = p_mesa),
    0
  );
$$;

create or replace function public._gerar_codigo(p_nome text)
returns text language plpgsql volatile as $$
declare
  v_chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_prefixo text;
  v_cod text;
begin
  v_prefixo := upper(regexp_replace(
    translate(coalesce(p_nome, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '[^A-Za-z]', '', 'g'));
  v_prefixo := left(v_prefixo || 'BAR', 3);
  loop
    v_cod := v_prefixo || '-';
    for i in 1..3 loop
      v_cod := v_cod || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;
    exit when not exists (select 1 from groups where codigo_convite = v_cod);
  end loop;
  return v_cod;
end $$;

-- ---------------------------------------------------------------------
-- PERFIL, TURMA E VISITANTES
-- ---------------------------------------------------------------------

-- p_id: editar um visitante que eu cuido (sem p_id = meu perfil)
create or replace function public.salvar_perfil(
  p_apelido text, p_avatar text, p_cor text default null, p_whatsapp text default null, p_id uuid default null
)
returns public.profiles language plpgsql as $$
declare
  v_eu uuid := _eu();
  v_alvo uuid := coalesce(p_id, v_eu);
  v profiles;
begin
  if v_alvo <> v_eu then
    perform _quem(v_alvo, (select group_id from group_members where user_id = v_alvo limit 1), null);
  end if;
  update profiles set
    apelido = btrim(p_apelido),
    avatar = coalesce(nullif(btrim(p_avatar), ''), avatar),
    cor = coalesce(nullif(p_cor, ''), cor),
    whatsapp = nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), '')
  where id = v_alvo
  returning * into v;
  return v;
end $$;

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
  return g;
end $$;

-- Cadastro novo cai direto na turma principal (a mais antiga). Se ainda não
-- existe nenhuma, cria "Resenha" e quem se cadastrou vira o dono (admin).
create or replace function public.entrar_turma_padrao()
returns uuid language plpgsql as $$
declare
  v_eu uuid := _eu();
  v_group uuid;
begin
  perform pg_advisory_xact_lock(hashtext('turma-padrao'));
  select id into v_group from groups order by created_at limit 1;
  if v_group is null then
    return (criar_turma('Resenha')).id;
  end if;
  insert into group_members (group_id, user_id, papel)
  values (v_group, v_eu, 'membro')
  on conflict do nothing;
  return v_group;
end $$;

create or replace function public.entrar_turma(p_codigo text)
returns uuid language plpgsql as $$
declare
  v_eu uuid := _eu();
  v_group uuid;
begin
  select id into v_group from groups
  where replace(codigo_convite, '-', '') = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_group is null then
    raise exception 'Código não encontrado. Confere com quem te chamou.';
  end if;
  insert into group_members (group_id, user_id, papel)
  values (v_group, v_eu, 'membro')
  on conflict do nothing;
  return v_group;
end $$;

-- amigo sem app: vira uma pessoa da turma, só com nome
create or replace function public.criar_visitante(p_group uuid, p_apelido text, p_avatar text default null)
returns uuid language plpgsql as $$
declare
  v_eu uuid := _eu();
  v_id uuid;
begin
  perform _exigir_membro(p_group);
  if exists (
    select 1 from profiles p join group_members gm on gm.user_id = p.id
    where gm.group_id = p_group and lower(p.apelido) = lower(btrim(p_apelido))
  ) then
    raise exception 'Já tem alguém com esse nome na turma';
  end if;
  insert into profiles (apelido, avatar, cor, visitante, criado_por)
  values (btrim(p_apelido), coalesce(nullif(btrim(p_avatar), ''), '🙂'), '#888888', true, v_eu)
  returning id into v_id;
  insert into group_members (group_id, user_id, papel) values (p_group, v_id, 'membro');
  return v_id;
end $$;

create or replace function public.atualizar_turma(
  p_group uuid, p_nome text, p_valor_ficha_centavos integer,
  p_pontos_alvo integer, p_melhor_de_3 boolean
)
returns public.groups language plpgsql as $$
declare
  g groups;
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin mexe nas configurações'; end if;
  update groups set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    valor_ficha_centavos = coalesce(p_valor_ficha_centavos, valor_ficha_centavos),
    truco_pontos_alvo = coalesce(p_pontos_alvo, truco_pontos_alvo),
    truco_melhor_de_3 = coalesce(p_melhor_de_3, truco_melhor_de_3)
  where id = p_group
  returning * into g;
  return g;
end $$;

create or replace function public.novo_codigo(p_group uuid)
returns text language plpgsql as $$
declare
  v_cod text;
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin troca o código'; end if;
  select _gerar_codigo(nome) into v_cod from groups where id = p_group;
  update groups set codigo_convite = v_cod where id = p_group;
  return v_cod;
end $$;

create or replace function public.definir_papel(p_group uuid, p_user uuid, p_papel text)
returns void language plpgsql as $$
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin muda papéis'; end if;
  if p_papel not in ('admin', 'membro') then raise exception 'Papel inválido'; end if;
  if p_papel = 'admin' and (select visitante from profiles where id = p_user) then
    raise exception 'Visitante não pode ser admin (crie um login pra ele antes)';
  end if;
  if p_papel = 'membro' and (
    select count(*) from group_members where group_id = p_group and papel = 'admin' and user_id <> p_user
  ) = 0 then
    raise exception 'A turma precisa de pelo menos um admin';
  end if;
  update group_members set papel = p_papel where group_id = p_group and user_id = p_user;
end $$;

-- admin remove alguém, ou a própria pessoa sai. As dívidas continuam registradas.
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
  delete from group_members where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.salvar_item(p_group uuid, p_item uuid, p_nome text, p_emoji text)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin mexe nos itens'; end if;
  if p_item is null then
    insert into items (group_id, nome, emoji)
    values (p_group, btrim(p_nome), coalesce(nullif(btrim(p_emoji), ''), '🎁'))
    returning id into v_id;
  else
    update items set nome = btrim(p_nome), emoji = coalesce(nullif(btrim(p_emoji), ''), emoji), ativo = true
    where id = p_item and group_id = p_group
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- item some das opções mas continua nas dívidas antigas
create or replace function public.remover_item(p_item uuid)
returns void language plpgsql as $$
declare
  v_group uuid;
begin
  perform _eu();
  select group_id into v_group from items where id = p_item;
  if v_group is null or not is_admin(v_group) then raise exception 'Só admin mexe nos itens'; end if;
  update items set ativo = false where id = p_item;
end $$;

-- ---------------------------------------------------------------------
-- MESAS
-- ---------------------------------------------------------------------

create or replace function public.criar_mesa(p_group uuid, p_nome text default null)
returns uuid language plpgsql as $$
declare
  v_num integer;
  v_id uuid;
begin
  perform _exigir_membro(p_group);
  -- serializa a criação de mesas da turma para o número não repetir
  perform pg_advisory_xact_lock(hashtext('mesa:' || p_group::text));
  select min(n) into v_num
  from generate_series(1, 999) n
  where not exists (
    select 1 from mesas where group_id = p_group and numero = n and status <> 'encerrada'
  );
  insert into mesas (group_id, numero, nome, criado_por, marcador_id)
  values (p_group, v_num, nullif(btrim(coalesce(p_nome, '')), ''), app_uid(), app_uid())
  returning id into v_id;
  return v_id;
end $$;

-- Sem p_quem: eu mesmo sento. Com p_quem: o dono da mesa (ou admin / quem
-- criou a mesa) senta outra pessoa da turma — ex.: um visitante.
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
  if me.status = 'encerrada' then raise exception 'Essa mesa já fechou'; end if;
  if me.status = 'em_jogo' and not is_admin(me.group_id) then
    raise exception 'Partida rolando: só admin troca jogador agora';
  end if;
  if p_posicao not between 0 and 3 then raise exception 'Lugar inválido'; end if;
  if v_alvo <> v_eu then
    if not _organiza_mesa(p_mesa) then
      raise exception 'Só o dono da mesa coloca outra pessoa sentada';
    end if;
    if not exists (select 1 from group_members where group_id = me.group_id and user_id = v_alvo) then
      raise exception 'Essa pessoa não é da turma';
    end if;
  end if;
  if exists (select 1 from mesa_players where mesa_id = p_mesa and posicao = p_posicao and user_id <> v_alvo) then
    raise exception 'Esse lugar já está ocupado';
  end if;
  delete from mesa_players where mesa_id = p_mesa and user_id = v_alvo;
  insert into mesa_players (mesa_id, group_id, user_id, posicao, dupla)
  values (p_mesa, me.group_id, v_alvo, p_posicao, case when p_posicao % 2 = 0 then 'A' else 'B' end);
  update mesas set atualizado_em = now() where id = p_mesa;
end $$;

create or replace function public.levantar(p_mesa uuid, p_posicao integer)
returns void language plpgsql as $$
declare
  v_eu uuid := _eu();
  me mesas;
  pl mesa_players;
begin
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  perform _exigir_membro(me.group_id);
  if me.status <> 'aberta' and not is_admin(me.group_id) then
    raise exception 'Partida rolando: só admin troca jogador agora';
  end if;
  select * into pl from mesa_players where mesa_id = p_mesa and posicao = p_posicao;
  if not found then return; end if;
  if pl.user_id <> v_eu and not _organiza_mesa(p_mesa) then
    raise exception 'Você não pode tirar essa pessoa da mesa';
  end if;
  delete from mesa_players where id = pl.id;
  delete from mesa_votos where mesa_id = p_mesa and eleitor_id = pl.user_id;
  update mesas set atualizado_em = now() where id = p_mesa;
end $$;

-- Votação rápida: cada jogador sentado (com app) vota em quem marca.
-- O mais votado vira o dono da mesa; empate fica com quem recebeu voto primeiro.
create or replace function public.votar_marcador(p_mesa uuid, p_candidato uuid)
returns uuid language plpgsql as $$
declare
  v_eu uuid := _eu();
  me mesas;
  v_novo uuid;
begin
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  if me.status = 'encerrada' then raise exception 'Essa mesa já fechou'; end if;
  if not _eh_jogador(p_mesa) then raise exception 'Só quem está sentado vota'; end if;
  if (select visitante from profiles where id = p_candidato)
     or not (
       exists (select 1 from mesa_players where mesa_id = p_mesa and user_id = p_candidato)
       or p_candidato = me.criado_por
     ) then
    raise exception 'Vote em alguém da mesa que tenha o app';
  end if;
  insert into mesa_votos (mesa_id, group_id, eleitor_id, candidato_id)
  values (p_mesa, me.group_id, v_eu, p_candidato)
  on conflict (mesa_id, eleitor_id) do update set candidato_id = excluded.candidato_id, created_at = now();

  select candidato_id into v_novo from mesa_votos
  where mesa_id = p_mesa
  group by candidato_id
  order by count(*) desc, min(created_at)
  limit 1;
  update mesas set marcador_id = v_novo, atualizado_em = now() where id = p_mesa;
  return v_novo;
end $$;

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
  me mesas;
  g groups;
  v_id uuid;
begin
  perform _eu();
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  if not _pode_pontuar(p_mesa) then raise exception 'Só o dono da mesa (quem marca) começa a partida'; end if;
  if me.status <> 'aberta' then raise exception 'Essa mesa já começou ou fechou'; end if;
  if not exists (select 1 from mesa_players where mesa_id = p_mesa and dupla = 'A')
     or not exists (select 1 from mesa_players where mesa_id = p_mesa and dupla = 'B') then
    raise exception 'Precisa de pelo menos um jogador em cada dupla';
  end if;
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
    coalesce(p_carteador, (select min(posicao) from mesa_players where mesa_id = p_mesa))
  ) returning id into v_id;

  update mesas set status = 'em_jogo', atualizado_em = now() where id = p_mesa;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- RESULTADOS E DÍVIDAS (internas)
-- ---------------------------------------------------------------------

create or replace function public._aplicar_resultado(p_wager uuid, p_res text, p_por uuid)
returns void language plpgsql as $$
declare
  w wagers;
begin
  select * into w from wagers where id = p_wager for update;
  if w.status not in ('valendo', 'aguardando') then return; end if;
  if p_res = 'empate' then
    update wagers set status = 'empate', vencedor_lado = null, resultado_proposto = 'empate',
      resolvido_por = coalesce(p_por, resolvido_por), confirmado_em = now()
    where id = w.id;
  else
    update wagers set status = 'resolvido', vencedor_lado = p_res, resultado_proposto = p_res,
      resolvido_por = coalesce(p_por, resolvido_por), confirmado_em = now()
    where id = w.id;
    insert into debts (group_id, origem_tipo, origem_id, devedor_id, credor_id, unidade, item_id, quantidade)
    values (
      w.group_id, 'wager', w.id,
      case when p_res = 'A' then w.lado_b_user else w.lado_a_user end,
      case when p_res = 'A' then w.lado_a_user else w.lado_b_user end,
      w.unidade, w.item_id, w.quantidade
    )
    on conflict do nothing;
  end if;
end $$;

-- apostas "qual dupla ganha" se resolvem pelo resultado da mesa
create or replace function public._fechar_apostas_da_mesa(p_mesa uuid, p_venc text)
returns void language plpgsql as $$
declare
  w record;
begin
  update wagers set status = 'cancelado'
  where mesa_id = p_mesa and tipo = 'dupla_vence' and status = 'aberto';
  for w in
    select id, alvo_dupla from wagers
    where mesa_id = p_mesa and tipo = 'dupla_vence' and status in ('valendo', 'aguardando')
    for update
  loop
    perform _aplicar_resultado(
      w.id,
      case when p_venc is null then 'empate' when w.alvo_dupla = p_venc then 'A' else 'B' end,
      null
    );
  end loop;
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
end $$;

-- ---------------------------------------------------------------------
-- PONTUAÇÃO
-- ---------------------------------------------------------------------

create or replace function public.marcar_ponto(p_match uuid, p_dupla text, p_tipo text)
returns public.truco_matches language plpgsql as $$
declare
  m truco_matches;
  ev truco_events;
  v_antes jsonb;
  v_pts integer;
  v_meta integer;
  v_venc text;
begin
  perform _eu();
  select * into m from truco_matches where id = p_match for update;
  if not found then raise exception 'Partida não encontrada'; end if;
  if not _pode_pontuar(m.mesa_id) then
    raise exception 'Só o dono da mesa (quem foi escolhido pra marcar) marca ponto';
  end if;
  if m.status <> 'em_jogo' then raise exception 'Essa partida já acabou'; end if;

  v_antes := jsonb_build_object(
    'placar_a', m.placar_a, 'placar_b', m.placar_b,
    'quedas_a', m.quedas_a, 'quedas_b', m.quedas_b,
    'carteador_pos', m.carteador_pos
  );

  if p_tipo = 'desfazer' then
    select * into ev from truco_events
    where match_id = m.id and not desfeito and tipo <> 'desfazer'
    order by id desc limit 1
    for update;
    if not found then raise exception 'Nada para desfazer'; end if;
    update truco_events set desfeito = true where id = ev.id;
    update truco_matches set
      placar_a = (ev.antes ->> 'placar_a')::int,
      placar_b = (ev.antes ->> 'placar_b')::int,
      quedas_a = (ev.antes ->> 'quedas_a')::int,
      quedas_b = (ev.antes ->> 'quedas_b')::int,
      carteador_pos = (ev.antes ->> 'carteador_pos')::int,
      updated_at = now()
    where id = m.id
    returning * into m;
    insert into truco_events (match_id, group_id, dupla, pontos, tipo, antes, criado_por)
    values (m.id, m.group_id, ev.dupla, -ev.pontos, 'desfazer', v_antes, app_uid());
    return m;
  end if;

  if p_tipo = 'carta' then
    m.carteador_pos := _proximo_carteador(m.mesa_id, m.carteador_pos);
    update truco_matches set carteador_pos = m.carteador_pos, updated_at = now() where id = m.id;
    insert into truco_events (match_id, group_id, dupla, pontos, tipo, antes, criado_por)
    values (m.id, m.group_id, null, 0, 'carta', v_antes, app_uid());
    return m;
  end if;

  if p_dupla is null or p_dupla not in ('A', 'B') then raise exception 'Escolha a dupla'; end if;
  v_pts := case p_tipo
    when '+1' then 1 when '-1' then -1 when 'truco' then 3
    when 'seis' then 6 when 'nove' then 9 when 'doze' then 12
  end;
  if v_pts is null then raise exception 'Jogada inválida'; end if;

  if p_dupla = 'A' then
    m.placar_a := greatest(0, least(m.pontos_alvo, m.placar_a + v_pts));
  else
    m.placar_b := greatest(0, least(m.pontos_alvo, m.placar_b + v_pts));
  end if;
  -- ponto marcado = mão terminou = passa a vez de dar carta
  if v_pts > 0 then
    m.carteador_pos := _proximo_carteador(m.mesa_id, m.carteador_pos);
  end if;

  if m.placar_a >= m.pontos_alvo or m.placar_b >= m.pontos_alvo then
    if p_dupla = 'A' then m.quedas_a := m.quedas_a + 1; else m.quedas_b := m.quedas_b + 1; end if;
    v_meta := case when m.melhor_de_3 then 2 else 1 end;
    if greatest(m.quedas_a, m.quedas_b) >= v_meta then
      v_venc := p_dupla;
    else
      m.placar_a := 0;
      m.placar_b := 0;
    end if;
  end if;

  update truco_matches set
    placar_a = m.placar_a, placar_b = m.placar_b,
    quedas_a = m.quedas_a, quedas_b = m.quedas_b,
    carteador_pos = m.carteador_pos, updated_at = now()
  where id = m.id;
  insert into truco_events (match_id, group_id, dupla, pontos, tipo, antes, criado_por)
  values (m.id, m.group_id, p_dupla, v_pts, p_tipo, v_antes, app_uid());

  if v_venc is not null then
    perform _finalizar_partida(m.id, v_venc);
    select * into m from truco_matches where id = p_match;
  end if;
  return m;
end $$;

-- vencedor nulo = partida anulada
create or replace function public.encerrar_partida(p_match uuid, p_vencedor text)
returns void language plpgsql as $$
declare
  m truco_matches;
begin
  perform _eu();
  select * into m from truco_matches where id = p_match for update;
  if not found then raise exception 'Partida não encontrada'; end if;
  if not _pode_pontuar(m.mesa_id) then raise exception 'Só o dono da mesa (ou um admin) encerra'; end if;
  if m.status <> 'em_jogo' then raise exception 'Essa partida já acabou'; end if;
  if p_vencedor is not null and p_vencedor not in ('A', 'B') then raise exception 'Vencedor inválido'; end if;
  perform _finalizar_partida(p_match, p_vencedor);
end $$;

-- fecha mesa abandonada. Com partida rolando, só admin (e a partida é anulada).
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
  if not (_organiza_mesa(p_mesa) or _eh_jogador(p_mesa)) then
    raise exception 'Só o dono da mesa, quem criou ou um admin fecha a mesa';
  end if;
  if me.status = 'em_jogo' and not is_admin(me.group_id) then
    raise exception 'Partida rolando: encerre pela tela de pontos ou chame um admin';
  end if;
  select id into v_match from truco_matches where mesa_id = p_mesa and status = 'em_jogo';
  if v_match is not null then
    perform _finalizar_partida(v_match, null);
  else
    update mesas set status = 'encerrada', encerrada_em = now(), atualizado_em = now() where id = p_mesa;
    perform _fechar_apostas_da_mesa(p_mesa, null);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- PALPITES / APOSTAS POR FORA
-- (p_por = fazer em nome de um visitante; veja _quem)
-- ---------------------------------------------------------------------

-- aposta ligada a mesa que já começou não pode mais ser retirada nem mudada
create or replace function public._mesa_comecou(p_mesa uuid)
returns boolean language sql stable as $$
  select p_mesa is not null and exists (select 1 from mesas where id = p_mesa and status <> 'aberta');
$$;

create or replace function public.criar_aposta(
  p_group uuid,
  p_tipo text,
  p_texto text,
  p_modalidade text,
  p_unidade text,
  p_item uuid,
  p_quantidade integer,
  p_mesa uuid default null,
  p_alvo_dupla text default null,
  p_contra uuid default null,
  p_por uuid default null
)
returns uuid language plpgsql as $$
declare
  v_eu uuid := _eu();
  v_lado uuid;
  me mesas;
  v_id uuid;
begin
  perform _exigir_membro(p_group);
  v_lado := _quem(p_por, p_group, p_mesa);
  if p_unidade = 'item' and not exists (
    select 1 from items where id = p_item and group_id = p_group and ativo
  ) then
    raise exception 'Escolha um item da turma';
  end if;
  if p_contra is not null then
    if p_contra = v_lado then raise exception 'Não dá pra apostar contra si mesmo'; end if;
    if not exists (select 1 from group_members where group_id = p_group and user_id = p_contra) then
      raise exception 'Essa pessoa não é da turma';
    end if;
  end if;
  if p_mesa is not null then
    select * into me from mesas where id = p_mesa;
    if not found or me.group_id <> p_group then raise exception 'Mesa inválida'; end if;
    if me.status = 'encerrada' then raise exception 'Essa mesa já fechou'; end if;
  end if;
  if p_tipo = 'dupla_vence' and (p_mesa is null or p_alvo_dupla not in ('A', 'B')) then
    raise exception 'Escolha a mesa e a dupla';
  end if;
  if p_tipo = 'texto_livre' and coalesce(btrim(p_texto), '') = '' then
    raise exception 'Escreve no que você está apostando';
  end if;

  insert into wagers (
    group_id, mesa_id, tipo, texto, alvo_dupla, modalidade, unidade, item_id, quantidade,
    criado_por, lado_a_user, lado_b_user, aberto
  ) values (
    p_group, p_mesa, p_tipo, nullif(btrim(coalesce(p_texto, '')), ''),
    case when p_tipo = 'dupla_vence' then p_alvo_dupla end,
    case when p_tipo = 'dupla_vence' then 'truco' else coalesce(p_modalidade, 'outro') end,
    p_unidade, case when p_unidade = 'item' then p_item end, p_quantidade,
    v_eu, v_lado, p_contra, p_contra is null
  ) returning id into v_id;
  return v_id;
end $$;

-- cada um muda a própria aposta enquanto ninguém topou e a partida não começou
create or replace function public.editar_aposta(
  p_wager uuid,
  p_unidade text,
  p_item uuid,
  p_quantidade integer,
  p_alvo_dupla text default null,
  p_texto text default null,
  p_por uuid default null
)
returns void language plpgsql as $$
declare
  w wagers;
  v_lado uuid;
begin
  select * into w from wagers where id = p_wager for update;
  if not found then raise exception 'Aposta não encontrada'; end if;
  v_lado := _quem(p_por, w.group_id, w.mesa_id);
  if w.lado_a_user <> v_lado then raise exception 'Só quem fez a aposta muda ela'; end if;
  if w.status <> 'aberto' then raise exception 'Alguém já topou: agora não muda mais'; end if;
  if _mesa_comecou(w.mesa_id) then raise exception 'A partida já começou: aposta travada'; end if;
  if p_unidade = 'item' and not exists (
    select 1 from items where id = p_item and group_id = w.group_id and ativo
  ) then
    raise exception 'Escolha um item da turma';
  end if;
  update wagers set
    unidade = p_unidade,
    item_id = case when p_unidade = 'item' then p_item end,
    quantidade = p_quantidade,
    alvo_dupla = case when tipo = 'dupla_vence' then coalesce(p_alvo_dupla, alvo_dupla) end,
    texto = case when tipo = 'texto_livre' then coalesce(nullif(btrim(coalesce(p_texto, '')), ''), texto) end
  where id = w.id;
end $$;

create or replace function public.topar_aposta(p_wager uuid, p_por uuid default null)
returns void language plpgsql as $$
declare
  w wagers;
  v_lado uuid;
begin
  select * into w from wagers where id = p_wager for update;
  if not found then raise exception 'Aposta não encontrada'; end if;
  perform _exigir_membro(w.group_id);
  v_lado := _quem(p_por, w.group_id, w.mesa_id);
  if w.status <> 'aberto' then raise exception 'Alguém já topou essa (ou ela foi cancelada)'; end if;
  if w.lado_a_user = v_lado then raise exception 'Não dá pra topar a própria aposta'; end if;
  if w.lado_b_user is not null and w.lado_b_user <> v_lado then
    raise exception 'Essa aposta foi feita pra outra pessoa';
  end if;
  if w.mesa_id is not null and (select status from mesas where id = w.mesa_id) = 'encerrada' then
    raise exception 'Essa mesa já fechou';
  end if;
  update wagers set lado_b_user = v_lado, status = 'valendo' where id = w.id;
end $$;

-- quem propôs retira; quem foi desafiado recusa. Depois que a partida da
-- mesa começa, não dá mais pra retirar.
create or replace function public.cancelar_aposta(p_wager uuid, p_por uuid default null)
returns void language plpgsql as $$
declare
  w wagers;
  v_lado uuid;
begin
  select * into w from wagers where id = p_wager for update;
  if not found then raise exception 'Aposta não encontrada'; end if;
  v_lado := _quem(p_por, w.group_id, w.mesa_id);
  if w.status <> 'aberto' then raise exception 'Essa aposta já está valendo: não dá mais pra retirar'; end if;
  if _mesa_comecou(w.mesa_id) then raise exception 'A partida já começou: não dá mais pra retirar'; end if;
  if v_lado not in (w.lado_a_user, coalesce(w.lado_b_user, w.lado_a_user)) then
    raise exception 'Você não pode cancelar essa';
  end if;
  update wagers set status = 'cancelado' where id = w.id;
end $$;

-- um dos lados marca; o outro confirma (ou confirma sozinho em 24h)
create or replace function public.marcar_resultado(p_wager uuid, p_resultado text, p_por uuid default null)
returns void language plpgsql as $$
declare
  w wagers;
  v_lado uuid;
begin
  select * into w from wagers where id = p_wager for update;
  if not found then raise exception 'Aposta não encontrada'; end if;
  v_lado := _quem(p_por, w.group_id, w.mesa_id);
  if v_lado not in (w.lado_a_user, w.lado_b_user) then
    raise exception 'Só quem está na aposta marca o resultado';
  end if;
  if w.status <> 'valendo' then raise exception 'Essa aposta não está valendo'; end if;
  if w.tipo = 'dupla_vence' then raise exception 'Essa se resolve sozinha quando a partida acabar'; end if;
  if p_resultado not in ('A', 'B', 'empate') then raise exception 'Resultado inválido'; end if;
  update wagers set status = 'aguardando', resultado_proposto = p_resultado,
    resolvido_por = v_lado, marcado_em = now()
  where id = w.id;
end $$;

create or replace function public.confirmar_resultado(p_wager uuid, p_por uuid default null)
returns void language plpgsql as $$
declare
  w wagers;
  v_lado uuid;
begin
  select * into w from wagers where id = p_wager for update;
  if not found then raise exception 'Aposta não encontrada'; end if;
  v_lado := _quem(p_por, w.group_id, w.mesa_id);
  if w.status <> 'aguardando' then raise exception 'Não tem resultado pra confirmar'; end if;
  if v_lado not in (w.lado_a_user, w.lado_b_user) or v_lado = w.resolvido_por then
    raise exception 'Quem confirma é o outro lado';
  end if;
  perform _aplicar_resultado(w.id, w.resultado_proposto, null);
end $$;

create or replace function public.contestar_resultado(p_wager uuid, p_por uuid default null)
returns void language plpgsql as $$
declare
  w wagers;
  v_lado uuid;
begin
  select * into w from wagers where id = p_wager for update;
  if not found then raise exception 'Aposta não encontrada'; end if;
  v_lado := _quem(p_por, w.group_id, w.mesa_id);
  if w.status <> 'aguardando' then raise exception 'Não tem resultado pra contestar'; end if;
  if v_lado not in (w.lado_a_user, w.lado_b_user) or v_lado = w.resolvido_por then
    raise exception 'Quem contesta é o outro lado';
  end if;
  update wagers set status = 'valendo', resultado_proposto = null, resolvido_por = null, marcado_em = null
  where id = w.id;
end $$;

-- confirma resultados sem contestação há mais de 24h (as telas chamam ao abrir)
create or replace function public.auto_confirmar()
returns integer language plpgsql as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select id, resultado_proposto from wagers
    where status = 'aguardando' and marcado_em < now() - interval '24 hours'
    for update skip locked
  loop
    perform _aplicar_resultado(r.id, r.resultado_proposto, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- ACERTOS
-- ---------------------------------------------------------------------

-- O credor marca que recebeu p_qtd do devedor. Primeiro compensa o que
-- ele mesmo devia ao devedor (mesmo tipo), depois abate as dívidas mais
-- antigas. Fichas e itens nunca se misturam. p_credor = visitante que eu cuido.
create or replace function public.receber(
  p_group uuid, p_devedor uuid, p_unidade text, p_item uuid, p_qtd integer, p_credor uuid default null
)
returns void language plpgsql as $$
declare
  v_eu uuid;
  v_ida integer;
  v_volta integer;
  v_resto integer;
  v_pega integer;
  d record;
begin
  perform _exigir_membro(p_group);
  v_eu := _quem(p_credor, p_group, null);
  perform pg_advisory_xact_lock(hashtext('acerto:' || p_group::text));

  select coalesce(sum(quantidade - quitado_qtd), 0) into v_ida from debts
  where group_id = p_group and devedor_id = p_devedor and credor_id = v_eu
    and unidade = p_unidade and item_id is not distinct from p_item and quitado_qtd < quantidade;
  select coalesce(sum(quantidade - quitado_qtd), 0) into v_volta from debts
  where group_id = p_group and devedor_id = v_eu and credor_id = p_devedor
    and unidade = p_unidade and item_id is not distinct from p_item and quitado_qtd < quantidade;

  if p_qtd is null or p_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
  if p_qtd > v_ida - v_volta then raise exception 'Isso é mais do que te devem'; end if;

  update debts set quitado_qtd = quantidade, quitado_em = now()
  where group_id = p_group and devedor_id = v_eu and credor_id = p_devedor
    and unidade = p_unidade and item_id is not distinct from p_item and quitado_qtd < quantidade;

  v_resto := v_volta + p_qtd;
  for d in
    select id, quantidade, quitado_qtd from debts
    where group_id = p_group and devedor_id = p_devedor and credor_id = v_eu
      and unidade = p_unidade and item_id is not distinct from p_item and quitado_qtd < quantidade
    order by created_at, id
    for update
  loop
    exit when v_resto <= 0;
    v_pega := least(v_resto, d.quantidade - d.quitado_qtd);
    update debts set
      quitado_qtd = quitado_qtd + v_pega,
      quitado_em = case when quitado_qtd + v_pega = quantidade then now() else quitado_em end
    where id = d.id;
    v_resto := v_resto - v_pega;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- VERSÃO DA TURMA (as telas consultam a cada ~2s e só recarregam se mudou)
-- ---------------------------------------------------------------------

create or replace function public._subir_versao()
returns trigger language plpgsql as $$
declare
  v_group uuid;
begin
  v_group := case when tg_op = 'DELETE' then old.group_id else new.group_id end;
  update groups set versao = versao + 1 where id = v_group;
  return null;
end $$;

create or replace function public._subir_versao_turma()
returns trigger language plpgsql as $$
begin
  new.versao := greatest(new.versao, old.versao + 1);
  return new;
end $$;

create or replace function public._subir_versao_perfil()
returns trigger language plpgsql as $$
begin
  update groups set versao = versao + 1
  where id in (select group_id from group_members where user_id = new.id);
  return null;
end $$;

create trigger groups_versao before update on public.groups
  for each row execute function _subir_versao_turma();
create trigger profiles_versao after update on public.profiles
  for each row execute function _subir_versao_perfil();
create trigger group_members_versao after insert or update or delete on public.group_members
  for each row execute function _subir_versao();
create trigger items_versao after insert or update or delete on public.items
  for each row execute function _subir_versao();
create trigger mesas_versao after insert or update or delete on public.mesas
  for each row execute function _subir_versao();
create trigger mesa_players_versao after insert or update or delete on public.mesa_players
  for each row execute function _subir_versao();
create trigger mesa_votos_versao after insert or update or delete on public.mesa_votos
  for each row execute function _subir_versao();
create trigger truco_matches_versao after insert or update or delete on public.truco_matches
  for each row execute function _subir_versao();
create trigger wagers_versao after insert or update or delete on public.wagers
  for each row execute function _subir_versao();
create trigger debts_versao after insert or update or delete on public.debts
  for each row execute function _subir_versao();

-- =====================================================================
-- Mão às escuras (mão de ferro): no 11 a 11 a mão é jogada sem ver as
-- cartas, em melhor de 3 vazas; quem ganhar 2 vazas leva a queda.
-- Entra sozinha no 11 a 11 e também pode ser ligada/desligada na mão.
-- =====================================================================

alter table public.truco_matches add column escuras boolean not null default false;
-- vazas da mão às escuras, em ordem (ex.: 'AB' = 1ª da A, 2ª da B)
alter table public.truco_matches add column vazas text not null default '' check (vazas ~ '^[AB]{0,3}$');

alter table public.truco_events drop constraint truco_events_tipo_check;
alter table public.truco_events add constraint truco_events_tipo_check
  check (tipo in ('+1', '-1', 'truco', 'seis', 'nove', 'doze', 'desfazer', 'carta', 'escuras', 'vaza'));

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
    'carteador_pos', m.carteador_pos,
    'escuras', m.escuras, 'vazas', m.vazas
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
      escuras = coalesce((ev.antes ->> 'escuras')::boolean, false),
      vazas = coalesce(ev.antes ->> 'vazas', ''),
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

  -- liga/desliga a mão às escuras na mão (o 11 a 11 liga sozinho)
  if p_tipo = 'escuras' then
    update truco_matches set escuras = not m.escuras, vazas = '', updated_at = now()
    where id = m.id
    returning * into m;
    insert into truco_events (match_id, group_id, dupla, pontos, tipo, antes, criado_por)
    values (m.id, m.group_id, null, 0, 'escuras', v_antes, app_uid());
    return m;
  end if;

  if p_dupla is null or p_dupla not in ('A', 'B') then raise exception 'Escolha a dupla'; end if;

  if p_tipo = 'vaza' then
    if not m.escuras then raise exception 'A mão às escuras não está ligada'; end if;
    m.vazas := m.vazas || p_dupla;
    -- quem fez 2 vazas leva a mão às escuras, e com ela a queda
    if length(m.vazas) - length(replace(m.vazas, p_dupla, '')) >= 2 then
      v_pts := m.pontos_alvo - case when p_dupla = 'A' then m.placar_a else m.placar_b end;
      if p_dupla = 'A' then m.placar_a := m.pontos_alvo; else m.placar_b := m.pontos_alvo; end if;
      m.carteador_pos := _proximo_carteador(m.mesa_id, m.carteador_pos);
    else
      update truco_matches set vazas = m.vazas, updated_at = now() where id = m.id returning * into m;
      insert into truco_events (match_id, group_id, dupla, pontos, tipo, antes, criado_por)
      values (m.id, m.group_id, p_dupla, 0, 'vaza', v_antes, app_uid());
      return m;
    end if;
  else
    v_pts := case p_tipo
      when '+1' then 1 when '-1' then -1 when 'truco' then 3
      when 'seis' then 6 when 'nove' then 9 when 'doze' then 12
    end;
    if v_pts is null then raise exception 'Jogada inválida'; end if;
    if m.escuras and v_pts > 0 then
      raise exception 'Mão às escuras: marque as vazas (ou desligue o às escuras)';
    end if;
    if p_dupla = 'A' then
      m.placar_a := greatest(0, least(m.pontos_alvo, m.placar_a + v_pts));
    else
      m.placar_b := greatest(0, least(m.pontos_alvo, m.placar_b + v_pts));
    end if;
    -- ponto marcado = mão terminou = passa a vez de dar carta
    if v_pts > 0 then
      m.carteador_pos := _proximo_carteador(m.mesa_id, m.carteador_pos);
    end if;
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
    m.escuras := false;
    m.vazas := '';
  else
    -- 11 a 11 (um ponto do fim pras duas): vai direto pro às escuras
    m.escuras := m.placar_a = m.pontos_alvo - 1 and m.placar_b = m.pontos_alvo - 1;
    m.vazas := '';
  end if;

  update truco_matches set
    placar_a = m.placar_a, placar_b = m.placar_b,
    quedas_a = m.quedas_a, quedas_b = m.quedas_b,
    carteador_pos = m.carteador_pos,
    escuras = m.escuras, vazas = m.vazas,
    updated_at = now()
  where id = m.id;
  insert into truco_events (match_id, group_id, dupla, pontos, tipo, antes, criado_por)
  values (m.id, m.group_id, p_dupla, v_pts, p_tipo, v_antes, app_uid());

  if v_venc is not null then
    perform _finalizar_partida(m.id, v_venc);
  end if;
  select * into m from truco_matches where id = p_match;
  return m;
end $$;

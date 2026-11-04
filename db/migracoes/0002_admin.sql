-- =====================================================================
-- Admin na aba Acertos: quitar ou apagar dívidas (ex.: limpar testes)
-- e apagar apostas.
-- =====================================================================

-- dívida encerrada pelo admin (aparece como "quitada pelo admin" no histórico)
alter table public.debts add column zerada boolean not null default false;

-- Quita uma dívida (p_divida) ou TODAS as pendentes da turma (p_divida nulo).
-- O histórico continua. Devolve quantas foram quitadas.
create or replace function public.admin_quitar_dividas(p_group uuid, p_divida uuid default null)
returns integer language plpgsql as $$
declare
  n integer;
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin quita dívida dos outros'; end if;
  perform pg_advisory_xact_lock(hashtext('acerto:' || p_group::text));
  update debts set quitado_qtd = quantidade, quitado_em = now(), zerada = true
  where group_id = p_group and quitado_qtd < quantidade
    and (p_divida is null or id = p_divida);
  get diagnostics n = row_count;
  return n;
end $$;

-- Apaga uma dívida (p_divida) ou TODAS da turma (p_divida nulo), sem deixar
-- histórico. Se a dívida veio de uma aposta, a aposta some junto.
-- Devolve quantas dívidas foram apagadas.
create or replace function public.admin_apagar_dividas(p_group uuid, p_divida uuid default null)
returns integer language plpgsql as $$
declare
  n integer;
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin apaga dívida'; end if;
  perform pg_advisory_xact_lock(hashtext('acerto:' || p_group::text));
  with apagadas as (
    delete from debts
    where group_id = p_group and (p_divida is null or id = p_divida)
    returning origem_tipo, origem_id
  ), apostas as (
    delete from wagers w
    using apagadas a
    where a.origem_tipo = 'wager' and w.id = a.origem_id and w.group_id = p_group
    returning w.id
  )
  select count(*) into n from apagadas;
  return n;
end $$;

-- Apaga uma aposta (qualquer status) e a dívida que ela gerou.
create or replace function public.admin_apagar_aposta(p_wager uuid)
returns void language plpgsql as $$
declare
  w wagers;
begin
  perform _eu();
  select * into w from wagers where id = p_wager for update;
  if not found then raise exception 'Aposta não encontrada'; end if;
  if not is_admin(w.group_id) then raise exception 'Só admin apaga aposta'; end if;
  delete from debts where origem_tipo = 'wager' and origem_id = w.id;
  delete from wagers where id = w.id;
end $$;

-- Apaga uma mesa inteira: partidas, jogadas, votos, apostas ligadas a ela e
-- as dívidas que tudo isso gerou.
create or replace function public.admin_apagar_mesa(p_mesa uuid)
returns void language plpgsql as $$
declare
  me mesas;
begin
  perform _eu();
  select * into me from mesas where id = p_mesa for update;
  if not found then raise exception 'Mesa não encontrada'; end if;
  if not is_admin(me.group_id) then raise exception 'Só admin apaga mesa'; end if;
  perform pg_advisory_xact_lock(hashtext('acerto:' || me.group_id::text));
  delete from debts
  where origem_tipo = 'truco' and origem_id in (select id from truco_matches where mesa_id = p_mesa);
  delete from debts
  where origem_tipo = 'wager' and origem_id in (select id from wagers where mesa_id = p_mesa);
  delete from wagers where mesa_id = p_mesa;
  delete from mesas where id = p_mesa; -- jogadores, votos, partidas e jogadas vão junto
end $$;

-- Limpa TODO o histórico da turma (mesas, partidas, apostas e dívidas).
-- Pessoas, itens e configurações continuam.
create or replace function public.admin_limpar_historico(p_group uuid)
returns void language plpgsql as $$
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin limpa o histórico'; end if;
  perform pg_advisory_xact_lock(hashtext('acerto:' || p_group::text));
  delete from debts where group_id = p_group;
  delete from wagers where group_id = p_group;
  delete from mesas where group_id = p_group;
end $$;

-- =====================================================================
-- Dívidas não se compensam: se A deve 1 🍺 pra B e B deve 1 🍺 pra A,
-- os dois continuam devendo até cada credor marcar que recebeu.
-- =====================================================================

-- O credor marca que recebeu p_qtd do devedor. Abate só o que o devedor
-- deve a ele, das dívidas mais antigas pras mais novas. O que o credor deve
-- ao devedor não é tocado. Fichas e itens nunca se misturam.
-- p_credor = visitante que eu cuido.
create or replace function public.receber(
  p_group uuid, p_devedor uuid, p_unidade text, p_item uuid, p_qtd integer, p_credor uuid default null
)
returns void language plpgsql as $$
declare
  v_eu uuid;
  v_devido integer;
  v_resto integer;
  v_pega integer;
  d record;
begin
  perform _exigir_membro(p_group);
  v_eu := _quem(p_credor, p_group, null);
  perform pg_advisory_xact_lock(hashtext('acerto:' || p_group::text));

  select coalesce(sum(quantidade - quitado_qtd), 0) into v_devido from debts
  where group_id = p_group and devedor_id = p_devedor and credor_id = v_eu
    and unidade = p_unidade and item_id is not distinct from p_item and quitado_qtd < quantidade;

  if p_qtd is null or p_qtd <= 0 then raise exception 'Quantidade inválida'; end if;
  if p_qtd > v_devido then raise exception 'Isso é mais do que te devem'; end if;

  v_resto := p_qtd;
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

-- =====================================================================
-- Várias turmas: admin adiciona quem já tem conta e pode apagar a turma.
-- =====================================================================

-- Admin coloca na turma alguém que já tem conta, pelo nome de usuário.
create or replace function public.adicionar_membro(p_group uuid, p_login text)
returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin adiciona pessoas'; end if;
  select id into v_id from usuarios where login = lower(btrim(coalesce(p_login, '')));
  if v_id is null then
    raise exception 'Não achei ninguém com esse usuário. Confere o nome ou manda o link de convite';
  end if;
  if exists (select 1 from group_members where group_id = p_group and user_id = v_id) then
    raise exception 'Essa pessoa já está na turma';
  end if;
  insert into group_members (group_id, user_id, papel) values (p_group, v_id, 'membro');
  return v_id;
end $$;

-- Apaga a turma inteira (mesas, apostas, dívidas, itens e a lista de membros).
-- As contas das pessoas continuam e elas seguem nas outras turmas.
create or replace function public.admin_apagar_turma(p_group uuid)
returns void language plpgsql as $$
begin
  perform _eu();
  if not is_admin(p_group) then raise exception 'Só admin apaga a turma'; end if;
  perform pg_advisory_xact_lock(hashtext('turma-padrao'));
  delete from groups where id = p_group;
end $$;

-- ---------------------------------------------------------------------
-- Apelido não repete dentro da mesma turma (sem diferenciar maiúscula).
-- O login (usuário) já é único no site todo (unique em usuarios.login).
-- ---------------------------------------------------------------------

-- ao entrar numa turma (cadastro, convite, adicionar, visitante)
create or replace function public._apelido_unico_na_entrada()
returns trigger language plpgsql as $$
declare
  v_apelido text;
begin
  select apelido into v_apelido from profiles where id = new.user_id;
  if exists (
    select 1 from group_members gm join profiles p on p.id = gm.user_id
    where gm.group_id = new.group_id and gm.user_id <> new.user_id
      and lower(btrim(p.apelido)) = lower(btrim(v_apelido))
  ) then
    raise exception 'Já tem alguém chamado "%" nessa turma. Escolha outro apelido.', v_apelido;
  end if;
  return new;
end $$;

create trigger group_members_apelido_unico before insert on public.group_members
  for each row execute function _apelido_unico_na_entrada();

-- ao trocar o apelido (vale pra todas as turmas da pessoa)
create or replace function public._apelido_unico_na_troca()
returns trigger language plpgsql as $$
declare
  v_turma text;
begin
  select g.nome into v_turma
  from group_members eu
  join group_members outro on outro.group_id = eu.group_id and outro.user_id <> new.id
  join profiles p on p.id = outro.user_id
  join groups g on g.id = eu.group_id
  where eu.user_id = new.id and lower(btrim(p.apelido)) = lower(btrim(new.apelido))
  limit 1;
  if v_turma is not null then
    raise exception 'Já tem alguém chamado "%" na turma "%". Escolha outro apelido.', new.apelido, v_turma;
  end if;
  return new;
end $$;

create trigger profiles_apelido_unico before update of apelido on public.profiles
  for each row when (lower(btrim(new.apelido)) is distinct from lower(btrim(old.apelido)))
  execute function _apelido_unico_na_troca();

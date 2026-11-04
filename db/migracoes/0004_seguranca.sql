-- =====================================================================
-- Segurança: registro de tentativas pra limitar abuso (senha errada,
-- cadastros em massa, consultas de usuário). Fica no banco porque na
-- Vercel cada acesso pode cair num servidor diferente.
-- =====================================================================

create table public.tentativas (
  chave text not null, -- ex.: "login:leo", "ip:1.2.3.4:cadastro"
  em timestamptz not null default now()
);
create index tentativas_chave_idx on public.tentativas (chave, em);

-- sessões vencidas não servem pra nada: limpa de vez em quando
create index sessoes_expira_idx on public.sessoes (expira_em);

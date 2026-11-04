import { randomInt } from "node:crypto";
import { banco, ErroApp, type Exec } from "@/lib/server/db";
import { abrirSessao, comoUsuario, conferirSenha, fecharSessao, hashSenha, responder } from "@/lib/server/sessao";

export const dynamic = "force-dynamic";

type Corpo = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function validarLogin(v: unknown) {
  const login = texto(v).toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(login)) {
    throw new ErroApp("Usuário: 3 a 20 letras/números, sem espaço nem acento (pode . e _)");
  }
  return login;
}
function validarSenha(v: unknown) {
  const senha = typeof v === "string" ? v : "";
  if (senha.length < 4) throw new ErroApp("A senha precisa de pelo menos 4 caracteres");
  if (senha.length > 72) throw new ErroApp("Senha comprida demais");
  return senha;
}
async function loginLivre(q: Exec, login: string) {
  const [r] = await q.query("select 1 from usuarios where login = $1", [login]);
  if (r) throw new ErroApp("Esse usuário já existe. Escolhe outro (ou entre na aba “Já tenho conta”).", 409);
}

const ACOES: Record<string, (c: Corpo) => Promise<unknown>> = {
  // cria a conta, já entra e cai direto na turma
  async cadastro(c) {
    const login = validarLogin(c.login);
    const senha = validarSenha(c.senha);
    const apelido = texto(c.apelido) || login;
    if (apelido.length > 24) throw new ErroApp("Apelido com no máximo 24 letras");
    const hash = await hashSenha(senha);
    const b = await banco();
    return b.transacao(async (q) => {
      await loginLivre(q, login);
      const [p] = await q.query<{ id: string }>(
        "insert into profiles (apelido, avatar, cor) values ($1, coalesce(nullif($2, ''), '🃏'), coalesce(nullif($3, ''), '#39FF14')) returning id",
        [apelido, texto(c.avatar), texto(c.cor)],
      );
      await q.query("insert into usuarios (id, login, senha_hash) values ($1, $2, $3)", [p.id, login, hash]);
      await q.query("select set_config('app.user_id', $1, true)", [p.id]);
      let turma: string | null = null;
      const codigo = texto(c.codigo);
      if (codigo) {
        [{ id: turma }] = await q.query<{ id: string }>("select entrar_turma($1) as id", [codigo]);
      } else {
        [{ id: turma }] = await q.query<{ id: string }>("select entrar_turma_padrao() as id");
      }
      await abrirSessao(q, p.id);
      return { ok: true, turma };
    });
  },

  async entrar(c) {
    const login = texto(c.login).toLowerCase();
    const senha = typeof c.senha === "string" ? c.senha : "";
    const b = await banco();
    return b.transacao(async (q) => {
      const [u] = await q.query<{ id: string; senha_hash: string }>(
        "select id, senha_hash from usuarios where login = $1",
        [login],
      );
      if (!u || !(await conferirSenha(senha, u.senha_hash))) {
        throw new ErroApp("Usuário ou senha não conferem", 401);
      }
      let turma: string | null = null;
      if (texto(c.codigo)) {
        await q.query("select set_config('app.user_id', $1, true)", [u.id]);
        [{ id: turma }] = await q.query<{ id: string }>("select entrar_turma($1) as id", [texto(c.codigo)]);
      }
      await q.query("delete from sessoes where user_id = $1 and expira_em < now()", [u.id]);
      await abrirSessao(q, u.id);
      return { ok: true, turma };
    });
  },

  async sair() {
    const b = await banco();
    await b.transacao((q) => fecharSessao(q));
    return { ok: true };
  },

  // o cadastro pergunta enquanto a pessoa digita: esse usuário está livre?
  async disponivel(c) {
    const login = texto(c.login).toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(login)) {
      return { disponivel: false, motivo: "Use 3 a 20 letras/números, sem espaço nem acento (pode . e _)" };
    }
    const b = await banco();
    return b.transacao(async (q) => {
      const [r] = await q.query("select 1 from usuarios where login = $1", [login]);
      return { disponivel: !r };
    });
  },

  async senha(c) {
    const nova = validarSenha(c.nova);
    const hash = await hashSenha(nova);
    return comoUsuario(async (q, uid) => {
      const [u] = await q.query<{ senha_hash: string }>("select senha_hash from usuarios where id = $1", [uid]);
      if (!u || !(await conferirSenha(typeof c.atual === "string" ? c.atual : "", u.senha_hash))) {
        throw new ErroApp("A senha atual não confere");
      }
      await q.query("update usuarios set senha_hash = $1 where id = $2", [hash, uid]);
      return { ok: true };
    });
  },

  // admin gera uma senha provisória pra quem esqueceu
  async resetar(c) {
    const provisoria = `resenha${randomInt(1000, 9999)}`;
    const hash = await hashSenha(provisoria);
    return comoUsuario(async (q) => {
      const [ok] = await q.query<{ ok: boolean }>(
        "select is_admin($1) and exists (select 1 from group_members where group_id = $1 and user_id = $2) as ok",
        [c.turma, c.pessoa],
      );
      if (!ok?.ok) throw new ErroApp("Só admin da turma reseta senha", 403);
      const r = await q.query("update usuarios set senha_hash = $1 where id = $2 returning id", [hash, c.pessoa]);
      if (!r.length) throw new ErroApp("Essa pessoa não tem login (é visitante)");
      await q.query("delete from sessoes where user_id = $1", [c.pessoa]);
      return { ok: true, senha: provisoria };
    });
  },

  // visitante resolveu baixar o app: ganha usuário e senha e mantém o histórico
  async converter(c) {
    const login = validarLogin(c.login);
    const senha = validarSenha(c.senha);
    const hash = await hashSenha(senha);
    return comoUsuario(async (q) => {
      await q.query("select _quem($1, $2, null)", [c.pessoa, c.turma]); // valida permissão
      await loginLivre(q, login);
      await q.query("insert into usuarios (id, login, senha_hash) values ($1, $2, $3)", [c.pessoa, login, hash]);
      await q.query("update profiles set visitante = false where id = $1", [c.pessoa]);
      return { ok: true };
    });
  },
};

export async function POST(req: Request, { params }: { params: Promise<{ acao: string }> }) {
  const { acao } = await params;
  return responder(async () => {
    const fn = ACOES[acao];
    if (!fn) throw new ErroApp("Ação desconhecida", 404);
    const corpo = (await req.json().catch(() => ({}))) as Corpo;
    return fn(corpo);
  });
}

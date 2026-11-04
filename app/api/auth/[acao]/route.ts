import { randomInt } from "node:crypto";
import { banco, ErroApp, type Exec } from "@/lib/server/db";
import { anotar, esquecer, frear, ipDe } from "@/lib/server/freio";
import {
  abrirSessao,
  comoUsuario,
  conferirSenha,
  fecharSessao,
  hashDoTokenAtual,
  hashSenha,
  responder,
} from "@/lib/server/sessao";

export const dynamic = "force-dynamic";

type Corpo = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// senhas fáceis demais de adivinhar
const OBVIAS = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "654321", "111111", "000000", "121212",
  "senha1", "senha123", "abc123", "abcdef", "qwerty", "123mudar", "resenha", "truco1", "truco123",
]);

function validarLogin(v: unknown) {
  const login = texto(v).toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(login)) {
    throw new ErroApp("Usuário: 3 a 20 letras/números, sem espaço nem acento (pode . e _)");
  }
  return login;
}
/** Regras pra senha NOVA (quem já tem senha curta continua entrando normal). */
function validarSenha(v: unknown, login?: string) {
  const senha = typeof v === "string" ? v : "";
  if (senha.length < 6) throw new ErroApp("A senha precisa de pelo menos 6 caracteres");
  if (senha.length > 72) throw new ErroApp("Senha comprida demais");
  if (OBVIAS.has(senha.toLowerCase()) || (login && senha.toLowerCase().includes(login))) {
    throw new ErroApp("Essa senha é fácil demais de adivinhar. Escolhe outra.");
  }
  return senha;
}
async function loginLivre(q: Exec, login: string) {
  const [r] = await q.query("select 1 from usuarios where login = $1", [login]);
  if (r) throw new ErroApp("Esse usuário já existe. Escolhe outro (ou entre na aba “Já tenho conta”).", 409);
}

// hash de mentira: conferir a senha leva o mesmo tempo exista ou não o usuário
let hashFalso: Promise<string> | null = null;
const pegarHashFalso = () => (hashFalso ??= hashSenha("senha-que-ninguem-usa-" + randomInt(1e9)));

const ACOES: Record<string, (c: Corpo, req: Request) => Promise<unknown>> = {
  // cria a conta, já entra e cai direto na turma
  async cadastro(c, req) {
    const login = validarLogin(c.login);
    const senha = validarSenha(c.senha, login);
    const apelido = texto(c.apelido) || login;
    if (apelido.length > 24) throw new ErroApp("Apelido com no máximo 24 letras");
    const hash = await hashSenha(senha);
    const chaveIp = `ip:${ipDe(req)}:cadastro`;
    const b = await banco();
    return b.transacao(async (q) => {
      await frear(q, [{ chave: chaveIp, max: 6, minutos: 60 }]);
      await loginLivre(q, login);
      const [p] = await q.query<{ id: string }>(
        "insert into profiles (apelido, avatar, cor) values ($1, coalesce(nullif($2, ''), '🃏'), coalesce(nullif($3, ''), '#39FF14')) returning id",
        [apelido, texto(c.avatar).slice(0, 16), texto(c.cor)],
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
      await anotar(q, [chaveIp]);
      await abrirSessao(q, p.id);
      return { ok: true, turma };
    });
  },

  async entrar(c, req) {
    const login = texto(c.login).toLowerCase();
    const senha = typeof c.senha === "string" ? c.senha.slice(0, 200) : "";
    const chaveLogin = `login:${login}`;
    const chaveIp = `ip:${ipDe(req)}:login`;
    const b = await banco();
    // trava chute de senha: por usuário e por rede
    const u = await b.transacao(async (q) => {
      await frear(q, [
        { chave: chaveLogin, max: 8, minutos: 15 },
        { chave: chaveIp, max: 30, minutos: 15 },
      ]);
      const [linha] = await q.query<{ id: string; senha_hash: string }>("select id, senha_hash from usuarios where login = $1", [login]);
      return linha ?? null;
    });
    const confere = await conferirSenha(senha, u?.senha_hash ?? (await pegarHashFalso()));
    if (!u || !confere) {
      await b.transacao((q) => anotar(q, [chaveLogin, chaveIp]));
      throw new ErroApp("Usuário ou senha não conferem", 401);
    }
    return b.transacao(async (q) => {
      await esquecer(q, chaveLogin);
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
  async disponivel(c, req) {
    const login = texto(c.login).toLowerCase();
    if (!/^[a-z0-9_.]{3,20}$/.test(login)) {
      return { disponivel: false, motivo: "Use 3 a 20 letras/números, sem espaço nem acento (pode . e _)" };
    }
    const chaveIp = `ip:${ipDe(req)}:disponivel`;
    const b = await banco();
    return b.transacao(async (q) => {
      await frear(q, [{ chave: chaveIp, max: 120, minutos: 10 }]);
      await anotar(q, [chaveIp]);
      const [r] = await q.query("select 1 from usuarios where login = $1", [login]);
      return { disponivel: !r };
    });
  },

  // troca a própria senha e derruba as outras sessões abertas (outros aparelhos)
  async senha(c) {
    const b = await banco();
    const { uid, login, senhaHash } = await comoUsuario(async (q, uid) => {
      await frear(q, [{ chave: `senha:${uid}`, max: 8, minutos: 15 }]);
      const [u] = await q.query<{ login: string; senha_hash: string }>("select login, senha_hash from usuarios where id = $1", [uid]);
      return { uid, login: u?.login, senhaHash: u?.senha_hash };
    });
    if (!senhaHash || !(await conferirSenha(typeof c.atual === "string" ? c.atual : "", senhaHash))) {
      await b.transacao((q) => anotar(q, [`senha:${uid}`]));
      throw new ErroApp("A senha atual não confere");
    }
    const hash = await hashSenha(validarSenha(c.nova, login));
    const tokenAtual = await hashDoTokenAtual();
    return comoUsuario(async (q) => {
      await q.query("update usuarios set senha_hash = $1 where id = $2", [hash, uid]);
      await q.query("delete from sessoes where user_id = $1 and token_hash <> $2", [uid, tokenAtual ?? ""]);
      await esquecer(q, `senha:${uid}`);
      return { ok: true };
    });
  },

  // admin gera uma senha provisória pra quem esqueceu
  async resetar(c) {
    const provisoria = `resenha${randomInt(1000, 9999)}${randomInt(10, 99)}`;
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
    const senha = validarSenha(c.senha, login);
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
    const fn = Object.hasOwn(ACOES, acao) ? ACOES[acao] : undefined;
    if (!fn) throw new ErroApp("Ação desconhecida", 404);
    const lido: unknown = await req.json().catch(() => ({}));
    const corpo = (lido && typeof lido === "object" && !Array.isArray(lido) ? lido : {}) as Corpo;
    return fn(corpo, req);
  });
}

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { banco, ErroApp, type Exec } from "./db";

export const COOKIE = "resenha_sessao";
const DIAS = 365;

const scryptAsync = promisify(scrypt) as (s: string, salt: Buffer, n: number) => Promise<Buffer>;

export async function hashSenha(senha: string) {
  const salt = randomBytes(16);
  const k = await scryptAsync(senha, salt, 64);
  return `scrypt$${salt.toString("base64")}$${k.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardado: string) {
  const [alg, salt, k] = guardado.split("$");
  if (alg !== "scrypt" || !salt || !k) return false;
  const esperado = Buffer.from(k, "base64");
  const calc = await scryptAsync(senha, Buffer.from(salt, "base64"), esperado.length);
  return timingSafeEqual(calc, esperado);
}

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** Cria a sessão no banco e grava o cookie. */
export async function abrirSessao(q: Exec, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await q.query(
    `insert into sessoes (token_hash, user_id, expira_em) values ($1, $2, now() + interval '${DIAS} days')`,
    [sha(token), userId],
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DIAS * 86400,
  });
}

export async function fecharSessao(q: Exec) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q.query("delete from sessoes where token_hash = $1", [sha(token)]);
  jar.delete(COOKIE);
}

/**
 * Roda `fn` numa transação como o usuário do cookie. As funções do banco
 * leem quem é pelo app_uid() (set_config abaixo).
 */
export async function comoUsuario<T>(fn: (q: Exec, uid: string) => Promise<T>): Promise<T> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) throw new ErroApp("Faça login primeiro", 401);
  const b = await banco();
  return b.transacao(async (q) => {
    const [s] = await q.query<{ user_id: string }>(
      "select user_id from sessoes where token_hash = $1 and expira_em > now()",
      [sha(token)],
    );
    if (!s) throw new ErroApp("Sua sessão expirou. Entre de novo.", 401);
    await q.query("select set_config('app.user_id', $1, true)", [s.user_id]);
    return fn(q, s.user_id);
  });
}

/** Envolve uma rota: transforma erros em JSON { erro } com o status certo. */
export async function responder(fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    if (r instanceof Response) return r;
    return NextResponse.json(r ?? { ok: true });
  } catch (e) {
    const { status, erro } = traduzir(e);
    const res = NextResponse.json({ erro }, { status });
    if (status === 401) res.cookies.delete(COOKIE);
    return res;
  }
}

function traduzir(e: unknown): { status: number; erro: string } {
  if (e instanceof ErroApp) return { status: e.status, erro: e.message };
  const err = e as { code?: string; message?: string };
  switch (err.code) {
    case "P0001": // raise exception das funções: mensagem já é pra gente ler
      return { status: 400, erro: err.message ?? "Não deu" };
    case "23505":
      return { status: 409, erro: "Isso já existe" };
    case "23514":
    case "22001":
      return { status: 400, erro: "Algum campo ficou inválido (confere tamanho/formato)" };
    case "22P02":
      return { status: 400, erro: "Dado inválido" };
  }
  console.error(e);
  return { status: 500, erro: "Deu ruim no servidor. Tenta de novo." };
}

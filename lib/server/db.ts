import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Banco de dados do app.
 * - Na Vercel: Postgres do Neon (variável DATABASE_URL, criada sozinha ao
 *   conectar o banco na aba Storage).
 * - No seu PC (sem DATABASE_URL): Postgres embutido (PGlite) salvo na pasta
 *   .dados-local — não precisa instalar nada.
 * As tabelas são criadas/atualizadas sozinhas no primeiro acesso.
 */

export interface Exec {
  query<T = Record<string, unknown>>(texto: string, params?: unknown[]): Promise<T[]>;
  /** vários comandos de uma vez (usado nas migrations) */
  exec(texto: string): Promise<void>;
}

export interface Banco {
  tipo: "neon" | "local";
  transacao<T>(fn: (q: Exec) => Promise<T>): Promise<T>;
}

export class ErroApp extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// A integração da Vercel pode criar a variável com um prefixo qualquer
// (ex.: STORAGE_URL). Sem DATABASE_URL/POSTGRES_URL, usa a primeira
// variável terminada em _URL que aponte pra um Postgres (preferindo a com pool).
function acharUrlBanco() {
  const fixa = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (fixa) return fixa;
  const candidatas = Object.entries(process.env)
    .filter(([k, v]) => k.endsWith("_URL") && v && /^postgres(ql)?:\/\//.test(v))
    .sort(([a], [b]) => Number(/UNPOOLED|NON_POOLING/.test(a)) - Number(/UNPOOLED|NON_POOLING/.test(b)));
  return candidatas[0]?.[1];
}

const URL_BANCO = acharUrlBanco();

export function tipoBanco(): "neon" | "local" | "faltando" {
  if (URL_BANCO) return "neon";
  return process.env.VERCEL ? "faltando" : "local";
}

const g = globalThis as unknown as { __bancoResenha?: Promise<Banco> };

export function banco(): Promise<Banco> {
  if (!g.__bancoResenha) {
    g.__bancoResenha = criar().catch((e) => {
      g.__bancoResenha = undefined; // tenta de novo na próxima
      throw e;
    });
  }
  return g.__bancoResenha;
}

async function criar(): Promise<Banco> {
  let b: Banco;
  if (URL_BANCO) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: URL_BANCO, max: 5, idleTimeoutMillis: 10_000 });
    try {
      // na Vercel, devolve as conexões ociosas antes da função "dormir"
      const { attachDatabasePool } = await import("@vercel/functions");
      attachDatabasePool(pool);
    } catch {}
    b = {
      tipo: "neon",
      async transacao(fn) {
        const c = await pool.connect();
        try {
          await c.query("begin");
          const r = await fn({
            query: async (t, p) => (await c.query(t, p)).rows,
            exec: async (t) => {
              await c.query(t);
            },
          });
          await c.query("commit");
          return r;
        } catch (e) {
          await c.query("rollback").catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      },
    };
  } else {
    if (process.env.VERCEL) {
      throw new ErroApp("Banco não conectado. Na Vercel: aba Storage → Neon → Connect e depois Redeploy.", 503);
    }
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(path.join(process.cwd(), ".dados-local"));
    await db.waitReady;
    b = {
      tipo: "local",
      transacao: (fn) =>
        db.transaction((tx) =>
          fn({
            query: async (t, p) => (await tx.query(t, p)).rows as never[],
            exec: async (t) => {
              await tx.exec(t);
            },
          }),
        ),
    };
  }
  await migrar(b);
  return b;
}

/** Aplica, em ordem, os arquivos de db/migracoes que ainda não rodaram. */
async function migrar(b: Banco) {
  const dir = path.join(process.cwd(), "db", "migracoes");
  const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  await b.transacao(async (q) => {
    await q.query("select pg_advisory_xact_lock(424242)");
    await q.exec("create table if not exists _migracoes (nome text primary key, aplicada_em timestamptz not null default now())");
    const feitas = new Set((await q.query<{ nome: string }>("select nome from _migracoes")).map((r) => r.nome));
    for (const f of arquivos) {
      if (feitas.has(f)) continue;
      await q.exec(readFileSync(path.join(dir, f), "utf8"));
      await q.query("insert into _migracoes (nome) values ($1)", [f]);
    }
  });
}

/** Linhas de uma consulta como JSON (datas viram texto ISO, igual em qualquer banco). */
export async function lista<T>(q: Exec, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await q.query<{ j: T[] }>(`select coalesce(jsonb_agg(t), '[]'::jsonb) as j from (${sql}) t`, params);
  return r[0].j;
}

export async function umSo<T>(q: Exec, sql: string, params: unknown[] = []): Promise<T | null> {
  return (await lista<T>(q, sql, params))[0] ?? null;
}

/** Roda as consultas uma por vez (numa transação a conexão é única). */
export async function emSequencia<T extends readonly unknown[]>(fns: { [K in keyof T]: () => Promise<T[K]> }): Promise<T> {
  const r: unknown[] = [];
  for (const f of fns as readonly (() => Promise<unknown>)[]) r.push(await f());
  return r as unknown as T;
}

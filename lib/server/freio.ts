import { ErroApp, type Exec } from "./db";

// Limite de tentativas (senha errada, cadastros, consultas). Guardado no
// banco porque na Vercel cada acesso pode cair num servidor diferente.

export interface Regra {
  chave: string;
  max: number;
  minutos: number;
}

/** Barra com 429 se alguma regra já passou do limite na janela de tempo. */
export async function frear(q: Exec, regras: Regra[]) {
  for (const r of regras) {
    const [c] = await q.query<{ n: number }>(
      "select count(*)::int as n from tentativas where chave = $1 and em > now() - make_interval(mins => $2)",
      [r.chave, r.minutos],
    );
    if (c && c.n >= r.max) {
      throw new ErroApp(`Muitas tentativas seguidas. Espera uns ${r.minutos} minutos e tenta de novo.`, 429);
    }
  }
}

/** Anota uma tentativa (e de vez em quando faz a faxina do que é velho). */
export async function anotar(q: Exec, chaves: string[]) {
  for (const chave of chaves) await q.query("insert into tentativas (chave) values ($1)", [chave]);
  if (Math.random() < 0.02) {
    await q.query("delete from tentativas where em < now() - interval '1 day'");
    await q.query("delete from sessoes where expira_em < now()");
  }
}

export async function esquecer(q: Exec, chave: string) {
  await q.query("delete from tentativas where chave = $1", [chave]);
}

/** IP de quem pediu. Na Vercel, x-real-ip vem da própria Vercel (não dá pra falsificar). */
export function ipDe(req: Request) {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

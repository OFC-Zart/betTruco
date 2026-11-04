import { chaveValor } from "./format";
import type { Debt, Valor } from "./types";

export const aberto = (d: Debt) => d.quantidade - d.quitado_qtd;

/**
 * Saldo líquido entre mim e cada pessoa, separado por tipo (fichas, cada item).
 * qtd > 0: a pessoa me deve; qtd < 0: eu devo pra ela.
 * Nunca converte cerveja em fichas.
 */
export function saldosComigo(debts: Debt[], euId: string) {
  const porPessoa = new Map<string, Map<string, Valor>>();
  for (const d of debts) {
    const resto = aberto(d);
    if (resto <= 0) continue;
    let outro: string;
    let sinal: number;
    if (d.credor_id === euId) {
      outro = d.devedor_id;
      sinal = 1;
    } else if (d.devedor_id === euId) {
      outro = d.credor_id;
      sinal = -1;
    } else continue;
    const m = porPessoa.get(outro) ?? new Map<string, Valor>();
    const k = chaveValor(d);
    const v = m.get(k) ?? { unidade: d.unidade, item_id: d.item_id, quantidade: 0 };
    v.quantidade += sinal * resto;
    m.set(k, v);
    porPessoa.set(outro, m);
  }
  // tira os zerados
  for (const [p, m] of porPessoa) {
    for (const [k, v] of m) if (v.quantidade === 0) m.delete(k);
    if (!m.size) porPessoa.delete(p);
  }
  return porPessoa;
}

/** Soma o que tenho a receber e a pagar, agrupado por tipo. */
export function totais(saldos: Map<string, Map<string, Valor>>) {
  const receber = new Map<string, Valor>();
  const pagar = new Map<string, Valor>();
  for (const m of saldos.values()) {
    for (const [k, v] of m) {
      const alvo = v.quantidade > 0 ? receber : pagar;
      const t = alvo.get(k) ?? { ...v, quantidade: 0 };
      t.quantidade += Math.abs(v.quantidade);
      alvo.set(k, t);
    }
  }
  return { receber: [...receber.values()], pagar: [...pagar.values()] };
}

/**
 * Menor número de acertos para zerar a turma, tipo por tipo
 * (guloso: maior devedor paga o maior credor).
 */
export function simplificarTurma(debts: Debt[]) {
  const saldos = new Map<string, { valor: Omit<Valor, "quantidade">; por: Map<string, number> }>();
  for (const d of debts) {
    const resto = aberto(d);
    if (resto <= 0) continue;
    const k = chaveValor(d);
    const s = saldos.get(k) ?? { valor: { unidade: d.unidade, item_id: d.item_id }, por: new Map() };
    s.por.set(d.credor_id, (s.por.get(d.credor_id) ?? 0) + resto);
    s.por.set(d.devedor_id, (s.por.get(d.devedor_id) ?? 0) - resto);
    saldos.set(k, s);
  }
  const acertos: { de: string; para: string; valor: Valor }[] = [];
  for (const { valor, por } of saldos.values()) {
    const cred = [...por].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const dev = [...por].filter(([, v]) => v < 0).map(([p, v]) => [p, -v] as [string, number]).sort((a, b) => b[1] - a[1]);
    let i = 0;
    let j = 0;
    while (i < dev.length && j < cred.length) {
      const q = Math.min(dev[i][1], cred[j][1]);
      acertos.push({ de: dev[i][0], para: cred[j][0], valor: { ...valor, quantidade: q } });
      dev[i][1] -= q;
      cred[j][1] -= q;
      if (dev[i][1] === 0) i++;
      if (cred[j][1] === 0) j++;
    }
  }
  return acertos;
}

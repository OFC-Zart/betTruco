import { chaveValor } from "./format";
import type { Debt, Valor } from "./types";

export const aberto = (d: Debt) => d.quantidade - d.quitado_qtd;

/**
 * O que está pendente entre mim e cada pessoa, separado por tipo (fichas, cada item)
 * e por sentido. Nada se compensa: se eu devo 1 🍺 pra alguém e essa pessoa me deve
 * 1 🍺, as duas dívidas continuam aparecendo.
 * qtd > 0: a pessoa me deve; qtd < 0: eu devo pra ela.
 */
export function pendenciasCom(debts: Debt[], euId: string) {
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
    const k = `${sinal > 0 ? "receber" : "pagar"}:${chaveValor(d)}`;
    const v = m.get(k) ?? { unidade: d.unidade, item_id: d.item_id, quantidade: 0 };
    v.quantidade += sinal * resto;
    m.set(k, v);
    porPessoa.set(outro, m);
  }
  return porPessoa;
}

/** Soma o que tenho a receber e a pagar, agrupado por tipo. */
export function totais(pendencias: Map<string, Map<string, Valor>>) {
  const receber = new Map<string, Valor>();
  const pagar = new Map<string, Valor>();
  for (const m of pendencias.values()) {
    for (const [k, v] of m) {
      const alvo = v.quantidade > 0 ? receber : pagar;
      const t = alvo.get(k) ?? { ...v, quantidade: 0 };
      t.quantidade += Math.abs(v.quantidade);
      alvo.set(k, t);
    }
  }
  return { receber: [...receber.values()], pagar: [...pagar.values()] };
}

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

export interface ParPendente {
  devedor: string;
  credor: string;
  valores: Valor[];
}

/** Tudo o que está pendente na turma: quem deve pra quem, sem compensar nada. */
export function paresPendentes(debts: Debt[]): ParPendente[] {
  const pares = new Map<string, ParPendente & { porTipo: Map<string, Valor> }>();
  for (const d of debts) {
    const resto = aberto(d);
    if (resto <= 0) continue;
    const k = `${d.devedor_id}>${d.credor_id}`;
    const par = pares.get(k) ?? { devedor: d.devedor_id, credor: d.credor_id, valores: [], porTipo: new Map<string, Valor>() };
    const v = par.porTipo.get(chaveValor(d)) ?? { unidade: d.unidade, item_id: d.item_id, quantidade: 0 };
    v.quantidade += resto;
    par.porTipo.set(chaveValor(d), v);
    par.valores = [...par.porTipo.values()];
    pares.set(k, par);
  }
  return [...pares.values()].map(({ devedor, credor, valores }) => ({ devedor, credor, valores }));
}

/** Soma o valor de todos os pares, por tipo (fichas e cada item separados). */
export function somaPares(pares: ParPendente[]): Valor[] {
  const soma = new Map<string, Valor>();
  for (const par of pares) {
    for (const v of par.valores) {
      const t = soma.get(chaveValor(v)) ?? { ...v, quantidade: 0 };
      t.quantidade += v.quantidade;
      soma.set(chaveValor(v), t);
    }
  }
  return [...soma.values()];
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

import type { Item, Modalidade, Valor } from "./types";

export const MODALIDADES: { id: Modalidade; nome: string; emoji: string }[] = [
  { id: "truco", nome: "Truco", emoji: "🃏" },
  { id: "valorant", nome: "Valorant", emoji: "🎯" },
  { id: "futebol", nome: "Futebol", emoji: "⚽" },
  { id: "sinuca", nome: "Sinuca", emoji: "🎱" },
  { id: "baralho", nome: "Baralho", emoji: "♠️" },
  { id: "outro", nome: "Outro", emoji: "🎲" },
];

export const modalidade = (id: string) => MODALIDADES.find((m) => m.id === id) ?? MODALIDADES[5];

/** Chave de agrupamento: fichas e cada item ficam sempre separados. */
export const chaveValor = (v: Pick<Valor, "unidade" | "item_id">) =>
  v.unidade === "fichas" ? "fichas" : `item:${v.item_id}`;

export function textoValor(v: Valor, items: Item[], curto = false): string {
  if (v.unidade === "fichas") {
    return `${v.quantidade} ${v.quantidade === 1 ? "ficha" : "fichas"}`;
  }
  const it = items.find((i) => i.id === v.item_id);
  if (!it) return `${v.quantidade} item`;
  if (curto) return `${v.quantidade} ${it.emoji}`;
  const nome = it.nome.toLowerCase();
  return `${v.quantidade} ${it.emoji} ${v.quantidade === 1 ? nome : plural(nome)}`;
}

function plural(s: string) {
  if (/[aeiou]$/.test(s)) return s + "s";
  if (s.endsWith("ão")) return s.slice(0, -2) + "ões";
  if (/[rsz]$/.test(s)) return s + "es";
  return s;
}

export function reais(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "há 3 min", "há 2 h", "ontem"... */
export function tempoAtras(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "agora";
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

export function juntarLista(partes: string[]) {
  if (partes.length <= 1) return partes.join("");
  return partes.slice(0, -1).join(", ") + " e " + partes[partes.length - 1];
}

export function vibrar(ms: number | number[] = 25) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // alguns navegadores bloqueiam sem gesto do usuário
    }
  }
}

/** Número do WhatsApp para wa.me: assume Brasil (55) se vier só DDD + número. */
export function numeroWhats(n: string | null) {
  if (!n) return "";
  const d = n.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

export const AVATARES = ["🃏", "🍺", "🎮", "🎯", "🎱", "⚽", "👑", "🐐", "🦈", "🔥", "💀", "🤠", "🥷", "🐺", "🦊", "🍀"];
export const CORES = ["#D9A441", "#D71A28", "#F2D58C", "#FFFFFF", "#00E5FF", "#FF3DFF", "#39FF14", "#B388FF"];

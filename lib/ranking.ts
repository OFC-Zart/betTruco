import { aberto } from "./acertos";
import type { Debt, Item, MesaPlayer, TrucoMatch, Wager } from "./types";

export type PartidaComJogadores = TrucoMatch & { mesas: { numero: number; nome: string | null; mesa_players: MesaPlayer[] } | null };

export interface Linha {
  id: string; // user id ou "u1|u2" para duplas
  valor: number;
  extra?: string;
}

const top = (m: Map<string, Linha>, n = 3) => [...m.values()].sort((a, b) => b.valor - a.valor).slice(0, n);

export function calcularRanking(partidas: PartidaComJogadores[], apostas: Wager[], dividas: Debt[], itens: Item[]) {
  const vitorias = new Map<string, Linha>();
  const jogos = new Map<string, number>();
  const duplas = new Map<string, { v: number; j: number }>();

  for (const p of partidas) {
    if (p.status !== "encerrada" || !p.vencedor) continue;
    const players = p.mesas?.mesa_players ?? [];
    for (const d of ["A", "B"] as const) {
      const ids = players.filter((x) => x.dupla === d && x.user_id).map((x) => x.user_id!);
      const ganhou = p.vencedor === d;
      for (const u of ids) {
        jogos.set(u, (jogos.get(u) ?? 0) + 1);
        const l = vitorias.get(u) ?? { id: u, valor: 0 };
        if (ganhou) l.valor++;
        vitorias.set(u, l);
      }
      if (ids.length === 2) {
        const k = [...ids].sort().join("|");
        const s = duplas.get(k) ?? { v: 0, j: 0 };
        s.j++;
        if (ganhou) s.v++;
        duplas.set(k, s);
      }
    }
  }
  for (const l of vitorias.values()) l.extra = `${l.valor} de ${jogos.get(l.id)} partidas`;

  const melhorDupla = new Map<string, Linha>();
  for (const [k, s] of duplas) {
    // vitórias pesam mais; aproveitamento desempata
    melhorDupla.set(k, { id: k, valor: s.v + s.v / s.j / 10, extra: `${s.v}V em ${s.j} (${Math.round((100 * s.v) / s.j)}%)` });
  }

  const palpite = new Map<string, { v: number; t: number }>();
  for (const w of apostas) {
    if (w.status !== "resolvido" || !w.lado_b_user) continue;
    for (const [u, lado] of [[w.lado_a_user, "A"], [w.lado_b_user, "B"]] as const) {
      const s = palpite.get(u) ?? { v: 0, t: 0 };
      s.t++;
      if (w.vencedor_lado === lado) s.v++;
      palpite.set(u, s);
    }
  }
  const vidente = new Map<string, Linha>();
  for (const [u, s] of palpite) {
    vidente.set(u, { id: u, valor: s.v / s.t + s.t / 1000, extra: `${Math.round((100 * s.v) / s.t)}% (${s.v}/${s.t})` });
  }

  const cerveja = itens.find((i) => /cerveja/i.test(i.nome)) ?? itens[0];
  const devendo = new Map<string, Linha>();
  let maisAntiga: Debt | null = null;
  for (const d of dividas) {
    const resto = aberto(d);
    if (resto <= 0) continue;
    if (!maisAntiga || d.created_at < maisAntiga.created_at) maisAntiga = d;
    if (cerveja && d.unidade === "item" && d.item_id === cerveja.id) {
      const l = devendo.get(d.devedor_id) ?? { id: d.devedor_id, valor: 0 };
      l.valor += resto;
      l.extra = `${l.valor} ${cerveja.emoji}`;
      devendo.set(d.devedor_id, l);
    }
  }

  return {
    reiDoTruco: top(vitorias).filter((l) => l.valor > 0),
    melhorDupla: top(melhorDupla).filter((l) => l.valor > 0),
    vidente: top(vidente),
    patrocinador: top(devendo),
    cerveja,
    caloteiro: maisAntiga,
  };
}

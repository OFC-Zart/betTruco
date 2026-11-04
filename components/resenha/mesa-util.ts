import type { Mesa, MesaPlayer, Profile, TrucoMatch } from "@/lib/types";

export type MesaCompleta = Mesa & { mesa_players: MesaPlayer[]; truco_matches: TrucoMatch[] };

/** A partida "da vez": a que está rolando, ou a última. */
export function partidaAtual(m: { truco_matches: TrucoMatch[] }) {
  const lista = [...(m.truco_matches ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return lista.find((x) => x.status === "em_jogo") ?? lista[0] ?? null;
}

type Perfil = (id: string) => Profile | undefined;

export function nomeJogador(p: MesaPlayer | undefined, perfil: Perfil) {
  if (!p) return "—";
  return perfil(p.user_id)?.apelido ?? "?";
}

/** Sugestão de nome da dupla: "Leo & Ana". */
export function sugestaoDupla(players: MesaPlayer[], dupla: "A" | "B", perfil: Perfil) {
  const nomes = players
    .filter((p) => p.dupla === dupla)
    .sort((a, b) => a.posicao - b.posicao)
    .map((p) => nomeJogador(p, perfil));
  return nomes.join(" & ").slice(0, 24) || `Dupla ${dupla}`;
}

export const nomeMesa = (m: Pick<Mesa, "numero" | "nome">) => `Mesa ${m.numero}${m.nome ? ` · ${m.nome}` : ""}`;

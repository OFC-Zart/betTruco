import type { Mesa, MesaPlayer, Profile, TrucoMatch } from "@/lib/types";

/** Resultado da última partida daquele número de mesa (aparece no Ao vivo). */
export type UltimaPartida = Pick<TrucoMatch, "nome_dupla_a" | "nome_dupla_b" | "vencedor">;

export type MesaCompleta = Mesa & { mesa_players: MesaPlayer[]; truco_matches: TrucoMatch[]; ultima?: UltimaPartida | null };

/** Quem está sentado em outra mesa da turma. */
export interface Ocupado {
  user_id: string;
  numero: number;
  status: Mesa["status"];
}

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

/** Próximo lugar a dar as cartas (a revanche começa nele). */
export function proximoLugar(players: MesaPlayer[], pos: number) {
  const ordem = players.map((p) => p.posicao).sort((a, b) => a - b);
  return ordem.find((x) => x > pos) ?? ordem[0] ?? 0;
}

export const nomeMesa = (m: Pick<Mesa, "numero" | "nome">) => `Mesa ${m.numero}${m.nome ? ` · ${m.nome}` : ""}`;

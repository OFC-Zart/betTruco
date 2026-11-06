"use client";

import { useState } from "react";
import { Undo2, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tempoAtras, textoValor, vibrar } from "@/lib/format";
import type { Dupla, MesaPlayer, TipoJogada, TrucoEvent, TrucoMatch } from "@/lib/types";
import { useTurma } from "./turma-provider";
import { useToast } from "./toast";
import { Avatar, Quedas, Selo, Sheet } from "./ui";
import { type MesaCompleta, nomeJogador, sugestaoDupla } from "./mesa-util";

/** Quem marca os pontos: uma linha só; trocar abre a votação rápida. */
export function Votacao({
  mesa,
  votos,
  aoMudar,
}: {
  mesa: MesaCompleta;
  votos: { eleitor_id: string; candidato_id: string }[];
  aoMudar: () => void;
}) {
  const { euId, perfil, rpc, nome } = useTurma();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const souJogador = mesa.mesa_players.some((p) => p.user_id === euId);
  const candidatos = [
    ...mesa.mesa_players.filter((p) => !perfil(p.user_id)?.visitante).map((p) => p.user_id),
    mesa.criado_por,
  ].filter((id, i, a) => a.indexOf(id) === i);
  const meuVoto = votos.find((v) => v.eleitor_id === euId)?.candidato_id;
  const conta = (id: string) => votos.filter((v) => v.candidato_id === id).length;
  const dono = perfil(mesa.marcador_id);

  async function votar(id: string) {
    const r = await rpc<string>("votar_marcador", { p_mesa: mesa.id, p_candidato: id });
    if (r) {
      vibrar(25);
      toast(`Voto em ${nome(id)} ✔`, "ok");
      aoMudar();
    }
  }

  return (
    <div className="mt-3 rounded-2xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="text-xl">🎙️</span>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {dono ? (mesa.marcador_id === euId ? "Você marca os pontos" : `${dono.apelido} marca os pontos`) : "Qualquer jogador marca"}
        </div>
        {souJogador && candidatos.length > 1 && (
          <button type="button" onClick={() => setAberto(!aberto)} className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold text-ambar">
            {aberto ? "Fechar" : "Trocar"}
          </button>
        )}
      </div>
      {aberto && (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidatos.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => votar(id)}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-transform active:scale-95",
                meuVoto === id ? "border-neon bg-neon/15 text-neon" : "bg-black/30",
              )}
            >
              <Avatar p={perfil(id)} tamanho="sm" className="size-6 text-xs" />
              {id === euId ? "Eu" : perfil(id)?.apelido}
              {conta(id) > 0 && <span className="font-placar text-xs text-ambar">{conta(id)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// quanto a mão está valendo: o marcador escolhe aqui e toca na dupla que levou
const MAOS: { tipo: TipoJogada; label: string; pts: number }[] = [
  { tipo: "+1", label: "NORMAL", pts: 1 },
  { tipo: "truco", label: "TRUCO", pts: 3 },
  { tipo: "seis", label: "SEIS", pts: 6 },
  { tipo: "nove", label: "NOVE", pts: 9 },
  { tipo: "doze", label: "DOZE", pts: 12 },
];

const CHAVE_NARRAR = "resenha:narrar";

function falar(texto: string) {
  if (!("speechSynthesis" in window)) return;
  const fala = new SpeechSynthesisUtterance(texto.replaceAll("&", " e "));
  fala.lang = "pt-BR";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(fala);
}

export function Placar({
  mesa,
  p,
  podeEditar,
  aoAtualizar,
}: {
  mesa: MesaCompleta;
  p: TrucoMatch;
  podeEditar: boolean;
  aoAtualizar: (m?: TrucoMatch) => void;
}) {
  const { perfil, itens, rpc } = useTurma();
  const [ocupado, setOcupado] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [mao, setMao] = useState<TipoJogada>("+1");
  const [narrar, setNarrar] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_NARRAR) === "1";
    } catch {
      return false;
    }
  });
  const valorMao = MAOS.find((m) => m.tipo === mao) ?? MAOS[0];
  const nomeDupla = (d: Dupla) => (d === "A" ? p.nome_dupla_a : p.nome_dupla_b);

  function narrarPlacar(r: TrucoMatch) {
    if (!narrar) return;
    if (r.status !== "em_jogo") falar(r.vencedor ? `${r.vencedor === "A" ? r.nome_dupla_a : r.nome_dupla_b} venceu!` : "Partida anulada");
    else falar(`${r.nome_dupla_a} ${r.placar_a}, ${r.nome_dupla_b} ${r.placar_b}`);
  }

  async function jogar(dupla: Dupla | null, tipo: TipoJogada) {
    if (ocupado) return;
    setOcupado(true);
    vibrar(tipo === "+1" ? 20 : [20, 30, 40]);
    const r = await rpc<TrucoMatch>("marcar_ponto", { p_match: p.id, p_dupla: dupla, p_tipo: tipo });
    setOcupado(false);
    if (r) {
      if (r.status !== "em_jogo") vibrar([60, 40, 60, 40, 200]);
      if (dupla && tipo !== "-1") setMao("+1");
      if (tipo !== "carta") narrarPlacar(r);
      aoAtualizar(r);
    }
  }

  function escolherMao(tipo: TipoJogada, label: string) {
    const nova = mao === tipo ? "+1" : tipo;
    setMao(nova);
    vibrar(15);
    if (narrar && nova !== "+1") falar(label);
  }

  function alternarNarrar() {
    const novo = !narrar;
    setNarrar(novo);
    try {
      localStorage.setItem(CHAVE_NARRAR, novo ? "1" : "0");
    } catch {}
    if (novo) falar("Narração ligada");
  }

  async function encerrar(v: Dupla | null) {
    const r = await rpc("encerrar_partida", { p_match: p.id, p_vencedor: v });
    if (r !== undefined) {
      setEncerrando(false);
      aoAtualizar();
    }
  }

  const jogadores = (d: Dupla) =>
    mesa.mesa_players.filter((x) => x.dupla === d).sort((a, b) => a.posicao - b.posicao);

  return (
    <div className={cn("rounded-3xl border bg-card p-3 transition-colors", p.escuras && "border-alerta/50 shadow-[0_0_40px_-12px_hsl(var(--alerta)/0.6)]")}>
      {/* placar */}
      <div className="grid grid-cols-2 gap-2">
        {(["A", "B"] as const).map((d) => {
          const pts = d === "A" ? p.placar_a : p.placar_b;
          const onze = pts === p.pontos_alvo - 1;
          const lista = jogadores(d);
          const nomeProprio = nomeDupla(d) !== sugestaoDupla(mesa.mesa_players, d, perfil);
          return (
            <div
              key={`${d}${pts}`}
              className={cn(
                "flex animate-flash flex-col items-center rounded-2xl border px-1.5 py-2.5 text-center",
                d === "A" ? "border-neon/30" : "border-ambar/30",
              )}
            >
              {nomeProprio && (
                <div className={cn("w-full truncate font-display text-base leading-tight tracking-wide", d === "A" ? "text-neon" : "text-ambar")}>{nomeDupla(d)}</div>
              )}
              <div className="flex min-h-[3.25rem] w-full flex-col justify-center">
                {lista.length ? (
                  lista.map((x) => (
                    <div key={x.id} className={cn("break-words text-lg font-bold leading-tight", !nomeProprio && (d === "A" ? "text-neon" : "text-ambar"))}>
                      {x.posicao === p.carteador_pos && <span title="Dá as cartas">🃏 </span>}
                      {nomeJogador(x, perfil)}
                    </div>
                  ))
                ) : (
                  <div className="text-lg font-bold">{nomeDupla(d)}</div>
                )}
              </div>
              <div className="mt-1 font-placar text-8xl leading-none tabular-nums text-foreground brilho-neon">
                <span className="inline-block animate-pulo">{pts}</span>
              </div>
              {p.melhor_de_3 && <Quedas n={d === "A" ? p.quedas_a : p.quedas_b} className="justify-center" />}
              {onze && !p.escuras && <Selo cor="alerta" className="mt-1.5">MÃO DE ONZE</Selo>}
            </div>
          );
        })}
      </div>

      {podeEditar && !p.escuras && (
        <>
          {/* quanto vale a mão */}
          <div className="mt-4 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Quanto vale a mão</div>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {MAOS.map((m) => {
              const on = mao === m.tipo;
              return (
                <button
                  key={m.tipo}
                  type="button"
                  disabled={ocupado}
                  aria-pressed={on}
                  onClick={() => escolherMao(m.tipo, m.label)}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center rounded-2xl border-2 transition-all duration-150 active:scale-95",
                    on
                      ? m.pts === 1
                        ? "border-neon bg-neon/20 text-neon"
                        : "scale-105 border-alerta bg-alerta text-white shadow-[0_0_20px_-4px_hsl(var(--alerta))]"
                      : "bg-black/30 text-muted-foreground",
                  )}
                >
                  <span className="font-placar text-2xl leading-none">{m.pts}</span>
                  <span className="mt-0.5 font-display text-xs leading-none tracking-wide">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* quem levou: dois botões grandes e bem separados */}
          <div className="mt-2 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Quem levou</div>
          <div className="mt-2 grid grid-cols-2 gap-5">
            {(["A", "B"] as const).map((d) => (
              <Button
                key={d}
                variant={d === "A" ? "default" : "ambar"}
                disabled={ocupado}
                onClick={() => jogar(d, mao)}
                className={cn(
                  "h-32 flex-col gap-1 rounded-3xl px-2 shadow-lg transition-transform active:scale-95",
                  valorMao.pts > 1 && "ring-2 ring-alerta ring-offset-2 ring-offset-card",
                )}
              >
                <span className="font-placar text-6xl leading-none">+{valorMao.pts}</span>
                <span className="w-full truncate text-sm font-bold leading-tight">{nomeDupla(d)}</span>
              </Button>
            ))}
          </div>
        </>
      )}

      {p.escuras ? (
        <PainelEscuras p={p} podeEditar={podeEditar} ocupado={ocupado} jogar={jogar} />
      ) : (
        podeEditar && (
          <Button
            variant="outline"
            className="mt-4 h-12 w-full border-alerta/40 font-display text-lg tracking-widest text-alerta"
            disabled={ocupado}
            onClick={() => jogar(null, "escuras")}
          >
            🌑 ÀS ESCURAS
          </Button>
        )
      )}

      {podeEditar && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="outline" className="h-12 px-1 text-xs" disabled={ocupado || p.placar_a === 0} onClick={() => jogar("A", "-1")}>
              −1 <span className="max-w-[4rem] truncate">{nomeDupla("A")}</span>
            </Button>
            <Button variant="outline" className="h-12" disabled={ocupado} onClick={() => jogar(null, "desfazer")}>
              <Undo2 /> Voltar
            </Button>
            <Button variant="outline" className="h-12 px-1 text-xs" disabled={ocupado || p.placar_b === 0} onClick={() => jogar("B", "-1")}>
              −1 <span className="max-w-[4rem] truncate">{nomeDupla("B")}</span>
            </Button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Button variant="outline" className="h-11 px-1 text-xs" disabled={ocupado} onClick={() => jogar(null, "carta")}>
              🃏 Passar
            </Button>
            <Button variant="outline" className="h-11 px-1 text-xs" onClick={alternarNarrar} aria-pressed={narrar}>
              {narrar ? <Volume2 className="text-neon" /> : <VolumeX />} Narrar
            </Button>
            <Button variant="outline" className="h-11 px-1 text-xs text-alerta" onClick={() => setEncerrando(true)}>
              <X /> Encerrar
            </Button>
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span>
          Até {p.pontos_alvo}
          {p.melhor_de_3 ? " · melhor de 3" : ""}
        </span>
        {p.valendo_unidade ? (
          <span className="font-semibold text-ambar">
            Valendo {textoValor({ unidade: p.valendo_unidade, item_id: p.valendo_item_id, quantidade: p.valendo_qtd }, itens)} por pessoa
          </span>
        ) : (
          <span>Só pela honra</span>
        )}
      </div>

      <Sheet aberto={encerrando} aoFechar={() => setEncerrando(false)} titulo="Encerrar partida">
        <p className="mb-4 text-sm text-muted-foreground">
          Quem ganhou? Isso gera as dívidas e resolve as apostas de “qual dupla ganha”. A mesa continua aberta pra próxima.
        </p>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={() => encerrar("A")}>
            🏆 {p.nome_dupla_a} venceu
          </Button>
          <Button size="lg" variant="ambar" onClick={() => encerrar("B")}>
            🏆 {p.nome_dupla_b} venceu
          </Button>
          <Button size="lg" variant="outline" onClick={() => encerrar(null)}>
            Anular (ninguém deve nada)
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export function OrdemMesa({ players, carteadorPos }: { players: MesaPlayer[]; carteadorPos: number }) {
  const { perfil } = useTurma();
  const ordem = [...players].sort((a, b) => a.posicao - b.posicao);
  const i = ordem.findIndex((x) => x.posicao === carteadorPos);
  const proximo = ordem[(i + 1) % ordem.length];
  return (
    <div className="mt-3 rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        <span>Ordem da mesa</span>
        <span>próximo: {nomeJogador(proximo, perfil)}</span>
      </div>
      <div className="flex gap-2">
        {ordem.map((x) => (
          <div
            key={x.id}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors",
              x.posicao === carteadorPos ? "border-neon bg-neon/10" : "bg-black/20",
            )}
          >
            <span className="text-lg">{x.posicao === carteadorPos ? "🃏" : x.dupla === "A" ? "♠" : "♦"}</span>
            <span className="w-full truncate text-xs font-semibold">{nomeJogador(x, perfil)}</span>
            <span className={cn("text-[10px] font-bold", x.dupla === "A" ? "text-neon" : "text-ambar")}>{x.dupla}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const NOME_JOGADA: Record<string, string> = {
  "+1": "",
  "-1": "correção",
  truco: "Truco",
  seis: "Seis",
  nove: "Nove",
  doze: "Doze",
};

export function Historico({ eventos, p }: { eventos: TrucoEvent[]; p: TrucoMatch }) {
  const { nome } = useTurma();
  if (!eventos.length) return null;
  const dupla = (d: Dupla | null) => (d === "A" ? p.nome_dupla_a : d === "B" ? p.nome_dupla_b : "");
  return (
    <ul className="flex flex-col divide-y rounded-2xl border bg-card">
      {eventos.map((e) => (
        <li key={e.id} className={cn("flex items-center gap-2 px-3 py-2 text-sm", e.desfeito && "text-muted-foreground line-through")}>
          {e.tipo === "carta" ? (
            <span>🃏 passou a vez de dar carta</span>
          ) : e.tipo === "escuras" ? (
            <span>🌑 ligou/desligou o às escuras</span>
          ) : e.tipo === "vaza" ? (
            <span>
              🌑 {e.pontos > 0 ? <b className="text-neon">venceu às escuras</b> : "vaza"} — {dupla(e.dupla)}
            </span>
          ) : e.tipo === "desfazer" ? (
            <span className="text-muted-foreground">↩ desfez a última jogada</span>
          ) : (
            <span>
              <b className={cn("font-placar", e.pontos > 0 ? "text-neon" : "text-alerta")}>
                {e.pontos > 0 ? `+${e.pontos}` : `−${Math.abs(e.pontos)}`}
              </b>{" "}
              {NOME_JOGADA[e.tipo]}
              {NOME_JOGADA[e.tipo] ? " — " : "— "}
              {dupla(e.dupla)}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {nome(e.criado_por)} · {tempoAtras(e.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Mão às escuras (11 a 11): melhor de 3 vazas; quem fizer 2 leva a queda. */
function PainelEscuras({
  p,
  podeEditar,
  ocupado,
  jogar,
}: {
  p: TrucoMatch;
  podeEditar: boolean;
  ocupado: boolean;
  jogar: (d: Dupla | null, t: TipoJogada) => void;
}) {
  const nome = (d: Dupla) => (d === "A" ? p.nome_dupla_a : p.nome_dupla_b);
  const conta = (d: Dupla) => p.vazas.split("").filter((v) => v === d).length;
  return (
    <div className="mt-3 rounded-2xl border border-alerta/50 bg-black p-3 text-center">
      <div className="font-display text-2xl tracking-widest text-alerta">🌑 ÀS ESCURAS</div>
      <div className="text-xs text-muted-foreground">
        Ninguém vê as cartas · melhor de 3 vazas · quem fizer 2 leva a queda
      </div>
      <div className="mt-3 flex justify-center gap-3">
        {[0, 1, 2].map((i) => {
          const v = p.vazas[i] as Dupla | undefined;
          return (
            <div
              key={i}
              className={cn(
                "flex size-14 flex-col items-center justify-center rounded-xl border text-[10px] leading-tight",
                !v && "border-dashed text-muted-foreground",
                v === "A" && "border-neon bg-neon/15 text-neon",
                v === "B" && "border-ambar bg-ambar/15 text-ambar",
              )}
            >
              <span className="font-placar text-lg">{i + 1}ª</span>
              <span className="w-full truncate px-1">{v ? nome(v) : "vaza"}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {nome("A")} {conta("A")} × {conta("B")} {nome("B")}
      </div>
      {podeEditar && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button className="h-14 flex-col gap-0 leading-tight" disabled={ocupado} onClick={() => jogar("A", "vaza")}>
              <span className="text-xs font-normal">vaza pra</span>
              <span className="w-full truncate font-display text-lg tracking-wide">{p.nome_dupla_a}</span>
            </Button>
            <Button variant="ambar" className="h-14 flex-col gap-0 leading-tight" disabled={ocupado} onClick={() => jogar("B", "vaza")}>
              <span className="text-xs font-normal">vaza pra</span>
              <span className="w-full truncate font-display text-lg tracking-wide">{p.nome_dupla_b}</span>
            </Button>
          </div>
          <button className="mt-3 text-xs text-muted-foreground underline" disabled={ocupado} onClick={() => jogar(null, "escuras")}>
            sair do às escuras
          </button>
        </>
      )}
    </div>
  );
}

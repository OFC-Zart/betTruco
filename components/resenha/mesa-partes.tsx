"use client";

import { useState } from "react";
import { Undo2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { tempoAtras, textoValor, vibrar } from "@/lib/format";
import type { Dupla, MesaPlayer, TipoJogada, TrucoEvent, TrucoMatch, Unidade } from "@/lib/types";
import { useTurma } from "./turma-provider";
import { useToast } from "./toast";
import { Avatar, Chips, Label, Quedas, Selo, Sheet, Stepper } from "./ui";
import { type MesaCompleta, nomeJogador, sugestaoDupla } from "./mesa-util";

/** Quem pode organizar a mesa (sentar outros, visitantes): dono, quem criou ou admin. */
export function useOrganiza(mesa: MesaCompleta) {
  const { euId, isAdmin } = useTurma();
  return mesa.marcador_id === euId || mesa.criado_por === euId || isAdmin;
}

// Lugares em volta da mesa: 0 embaixo, 1 esquerda, 2 em cima, 3 direita.
// Parceiros ficam de frente (0 e 2 = dupla A; 1 e 3 = dupla B).
const LUGAR: Record<number, string> = {
  0: "col-start-2 row-start-3",
  1: "col-start-1 row-start-2",
  2: "col-start-2 row-start-1",
  3: "col-start-3 row-start-2",
};

export function Assentos({ mesa, aoMudar }: { mesa: MesaCompleta; aoMudar: () => void }) {
  const { euId, isAdmin, perfil, rpc } = useTurma();
  const organiza = useOrganiza(mesa);
  const [escolhendoPos, setEscolhendoPos] = useState<number | null>(null);
  const souJogador = mesa.mesa_players.some((p) => p.user_id === euId);
  const aberta = mesa.status === "aberta" || (isAdmin && mesa.status === "em_jogo");

  async function sentar(pos: number, quem?: string) {
    const r = await rpc("sentar", { p_mesa: mesa.id, p_posicao: pos, p_quem: quem ?? null });
    if (r !== undefined) {
      vibrar(25);
      aoMudar();
    }
  }
  async function levantar(pos: number) {
    if ((await rpc("levantar", { p_mesa: mesa.id, p_posicao: pos })) !== undefined) aoMudar();
  }

  return (
    <>
      <div className="grid grid-cols-3 grid-rows-3 gap-2">
        <div className="col-start-2 row-start-2 flex aspect-square flex-col items-center justify-center rounded-3xl border-2 border-neon/30 bg-[radial-gradient(circle,hsl(140_60%_14%),hsl(140_50%_7%))] text-center shadow-[inset_0_0_30px_rgba(0,0,0,0.6)]">
          <span className="text-2xl">♠<span className="text-alerta">♥</span></span>
          <span className="font-display text-sm tracking-widest text-neon/80">A × B</span>
        </div>
        {[0, 1, 2, 3].map((pos) => {
          const p = mesa.mesa_players.find((x) => x.posicao === pos);
          const dupla: Dupla = pos % 2 === 0 ? "A" : "B";
          const pf = p ? perfil(p.user_id) : undefined;
          const podeTirar = p && aberta && (p.user_id === euId || organiza);
          return (
            <div
              key={pos}
              className={cn(
                "flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center",
                LUGAR[pos],
                p ? "bg-card" : "border-dashed bg-black/20",
              )}
            >
              <span className={cn("text-[10px] font-bold tracking-widest", dupla === "A" ? "text-neon" : "text-ambar")}>DUPLA {dupla}</span>
              {p ? (
                <>
                  <Avatar p={pf} tamanho="sm" />
                  <span className="w-full truncate text-xs font-semibold">{p.user_id === euId ? "Você" : nomeJogador(p, perfil)}</span>
                  {pf?.visitante && <span className="text-[9px] uppercase tracking-wider text-muted-foreground">visitante</span>}
                  {podeTirar && (
                    <button onClick={() => levantar(pos)} className="text-[10px] text-muted-foreground underline">
                      {p.user_id === euId ? "levantar" : "tirar"}
                    </button>
                  )}
                </>
              ) : aberta ? (
                <>
                  <button onClick={() => sentar(pos)} className="rounded-lg bg-neon/15 px-2 py-1 text-xs font-bold text-neon">
                    {souJogador ? "Mudar pra cá" : "Sentar"}
                  </button>
                  {organiza && (
                    <button onClick={() => setEscolhendoPos(pos)} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <UserPlus className="size-3" /> pôr alguém
                    </button>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">vazio</span>
              )}
            </div>
          );
        })}
      </div>
      {escolhendoPos !== null && (
        <PorAlguem
          mesa={mesa}
          aoFechar={() => setEscolhendoPos(null)}
          aoEscolher={async (id) => {
            await sentar(escolhendoPos, id);
            setEscolhendoPos(null);
          }}
        />
      )}
    </>
  );
}

/** Dono da mesa coloca alguém sentado: amigo da turma ou visitante (sem app). */
function PorAlguem({ mesa, aoFechar, aoEscolher }: { mesa: MesaCompleta; aoFechar: () => void; aoEscolher: (id: string) => void }) {
  const { turma, membros, euId, rpc, recarregar } = useTurma();
  const [nome, setNome] = useState("");
  const sentados = new Set(mesa.mesa_players.map((p) => p.user_id));
  const livres = membros.filter((m) => !sentados.has(m.user_id) && m.user_id !== euId);

  async function criarVisitante() {
    const id = await rpc<string>("criar_visitante", { p_group: turma.id, p_apelido: nome.trim() });
    if (id) {
      await recarregar();
      aoEscolher(id);
    }
  }

  return (
    <Sheet aberto aoFechar={aoFechar} titulo="Quem senta aqui?">
      <Label>Amigo sem app (visitante)</Label>
      <div className="flex gap-2">
        <Input autoFocus placeholder="Nome, ex.: Tio Jorge" value={nome} maxLength={24} onChange={(e) => setNome(e.target.value)} />
        <Button onClick={criarVisitante} disabled={!nome.trim()}>
          Criar
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ele entra no placar, nas apostas e nos acertos. Quem marca a mesa aposta e recebe por ele.
      </p>
      {livres.length > 0 && (
        <>
          <Label>Ou alguém da turma</Label>
          <div className="grid grid-cols-2 gap-2">
            {livres.map((m) => (
              <button key={m.user_id} onClick={() => aoEscolher(m.user_id)} className="flex items-center gap-2 rounded-xl border bg-black/30 p-2 text-left">
                <Avatar p={m.profile} tamanho="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{m.profile.apelido}</span>
                {m.profile.visitante && <span className="text-[9px] uppercase text-muted-foreground">visit.</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Votação rápida de quem marca os pontos (o dono da mesa). */
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
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Quem marca os pontos</div>
          <div className="truncate font-semibold">
            {dono ? (mesa.marcador_id === euId ? "Você é o dono da mesa" : `${dono.apelido} é o dono da mesa`) : "Ninguém ainda — qualquer jogador marca"}
          </div>
        </div>
      </div>
      {souJogador && mesa.status !== "encerrada" && candidatos.length > 1 && (
        <>
          <div className="mb-2 mt-3 text-xs text-muted-foreground">Votação rápida — toque em quem você quer que marque:</div>
          <div className="flex flex-wrap gap-2">
            {candidatos.map((id) => (
              <button
                key={id}
                onClick={() => votar(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
                  meuVoto === id ? "border-neon bg-neon/15 text-neon" : "bg-black/30",
                )}
              >
                <Avatar p={perfil(id)} tamanho="sm" className="size-5 text-xs" />
                {id === euId ? "Eu" : perfil(id)?.apelido}
                {conta(id) > 0 && <span className="font-placar text-xs text-ambar">{conta(id)}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function IniciarPartida({ mesa, aoMudar }: { mesa: MesaCompleta; aoMudar: () => void }) {
  const { turma, perfil, itensAtivos, rpc } = useTurma();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [nomeA, setNomeA] = useState("");
  const [nomeB, setNomeB] = useState("");
  const [valendo, setValendo] = useState<string>("nada");
  const [qtd, setQtd] = useState(1);
  const [carteador, setCarteador] = useState<string>("");
  const [alvo, setAlvo] = useState(String(turma.truco_pontos_alvo));
  const [md3, setMd3] = useState(turma.truco_melhor_de_3 ? "sim" : "nao");

  const temA = mesa.mesa_players.some((p) => p.dupla === "A");
  const temB = mesa.mesa_players.some((p) => p.dupla === "B");

  function abrir() {
    setNomeA(sugestaoDupla(mesa.mesa_players, "A", perfil));
    setNomeB(sugestaoDupla(mesa.mesa_players, "B", perfil));
    const cerveja = itensAtivos.find((i) => /cerveja/i.test(i.nome));
    setValendo(cerveja?.id ?? "nada");
    setCarteador(String(Math.min(...mesa.mesa_players.map((p) => p.posicao))));
    setAberto(true);
  }

  async function comecar() {
    const unidade: Unidade | null = valendo === "nada" ? null : valendo === "fichas" ? "fichas" : "item";
    const r = await rpc("iniciar_partida", {
      p_mesa: mesa.id,
      p_nome_a: nomeA,
      p_nome_b: nomeB,
      p_unidade: unidade,
      p_item: unidade === "item" ? valendo : null,
      p_qtd: unidade ? qtd : 0,
      p_carteador: Number(carteador),
      p_pontos_alvo: Number(alvo),
      p_melhor_de_3: md3 === "sim",
    });
    if (r !== undefined) {
      vibrar([30, 50, 30]);
      toast("Valendo! Boa sorte 🃏", "ok");
      setAberto(false);
      aoMudar();
    }
  }

  return (
    <>
      <Button size="lg" className="mt-4 w-full font-display text-2xl tracking-wider" disabled={!temA || !temB} onClick={abrir}>
        COMEÇAR PARTIDA
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {!temA || !temB
          ? "Precisa de pelo menos uma pessoa em cada dupla."
          : "Depois de começar, as apostas desta mesa ficam travadas (não dá pra retirar)."}
      </p>
      <Sheet aberto={aberto} aoFechar={() => setAberto(false)} titulo="Começar partida">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Dupla A</Label>
            <Input value={nomeA} maxLength={24} onChange={(e) => setNomeA(e.target.value)} />
          </div>
          <div>
            <Label>Dupla B</Label>
            <Input value={nomeB} maxLength={24} onChange={(e) => setNomeB(e.target.value)} />
          </div>
        </div>
        <Label>O que está valendo (por pessoa)</Label>
        <Chips
          valor={valendo}
          aoMudar={setValendo}
          opcoes={[
            { id: "nada", label: "🫡 Só a honra" },
            { id: "fichas", label: "🪙 Fichas" },
            ...itensAtivos.map((i) => ({ id: i.id, label: `${i.emoji} ${i.nome}` })),
          ]}
        />
        {valendo !== "nada" && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cada perdedor paga</span>
            <Stepper valor={qtd} aoMudar={setQtd} />
          </div>
        )}
        <Label>Quem dá a primeira carta</Label>
        <Chips
          valor={carteador}
          aoMudar={setCarteador}
          opcoes={[...mesa.mesa_players].sort((a, b) => a.posicao - b.posicao).map((p) => ({ id: String(p.posicao), label: `🃏 ${nomeJogador(p, perfil)}` }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Até</Label>
            <Chips valor={alvo} aoMudar={setAlvo} opcoes={["12", "15", "24"].map((x) => ({ id: x, label: `${x} pts` }))} />
          </div>
          <div>
            <Label>Melhor de 3</Label>
            <Chips valor={md3} aoMudar={setMd3} opcoes={[{ id: "sim", label: "Sim" }, { id: "nao", label: "Não" }]} />
          </div>
        </div>
        <Button size="lg" className="mt-6 w-full font-display text-2xl tracking-wider" onClick={comecar}>
          VALENDO! 🃏
        </Button>
      </Sheet>
    </>
  );
}

const BOTOES: { tipo: TipoJogada; label: string; pts: number }[] = [
  { tipo: "truco", label: "TRUCO", pts: 3 },
  { tipo: "seis", label: "SEIS", pts: 6 },
  { tipo: "nove", label: "NOVE", pts: 9 },
  { tipo: "doze", label: "DOZE", pts: 12 },
];

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

  async function jogar(dupla: Dupla | null, tipo: TipoJogada) {
    if (ocupado) return;
    setOcupado(true);
    vibrar(tipo === "+1" ? 20 : [20, 30, 40]);
    const r = await rpc<TrucoMatch>("marcar_ponto", { p_match: p.id, p_dupla: dupla, p_tipo: tipo });
    setOcupado(false);
    if (r) {
      if (r.status !== "em_jogo") vibrar([60, 40, 60, 40, 200]);
      aoAtualizar(r);
    }
  }

  async function encerrar(v: Dupla | null) {
    const r = await rpc("encerrar_partida", { p_match: p.id, p_vencedor: v });
    if (r !== undefined) {
      setEncerrando(false);
      aoAtualizar();
    }
  }

  const jogadores = (d: Dupla) =>
    mesa.mesa_players
      .filter((x) => x.dupla === d)
      .sort((a, b) => a.posicao - b.posicao)
      .map((x) => nomeJogador(x, perfil))
      .join(" & ");

  return (
    <div className="rounded-3xl border bg-card p-3">
      <div className="grid grid-cols-2 gap-3">
        {(["A", "B"] as const).map((d) => {
          const pts = d === "A" ? p.placar_a : p.placar_b;
          const onze = pts === p.pontos_alvo - 1;
          return (
            <div key={d} className="flex flex-col">
              <div key={`${d}${pts}`} className="animate-flash rounded-2xl px-1 py-2 text-center">
                <div className={cn("truncate font-display text-2xl tracking-wide", d === "A" ? "text-neon" : "text-ambar")}>
                  {d === "A" ? p.nome_dupla_a : p.nome_dupla_b}
                </div>
                <div className="truncate text-xs text-muted-foreground">{jogadores(d)}</div>
                <div className="my-1 font-placar text-8xl leading-none tabular-nums text-foreground brilho-neon">
                  <span className="inline-block animate-pulo">{pts}</span>
                </div>
                {p.melhor_de_3 && <Quedas n={d === "A" ? p.quedas_a : p.quedas_b} className="justify-center" />}
                {onze && <Selo cor="alerta" className="mt-1">MÃO DE ONZE</Selo>}
              </div>
              {podeEditar && (
                <div className="mt-2 flex flex-col gap-2">
                  <Button size="lg" className="h-16 font-placar text-3xl" disabled={ocupado} onClick={() => jogar(d, "+1")}>
                    +1
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    {BOTOES.map((b) => (
                      <Button key={b.tipo} variant="ambar" className="h-12 flex-col gap-0 font-display text-lg leading-none tracking-wider" disabled={ocupado} onClick={() => jogar(d, b.tipo)}>
                        {b.label}
                        <span className="font-placar text-[10px]">+{b.pts}</span>
                      </Button>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" disabled={ocupado || pts === 0} onClick={() => jogar(d, "-1")}>
                    −1 (correção)
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

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

      {podeEditar && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="outline" disabled={ocupado} onClick={() => jogar(null, "desfazer")}>
            <Undo2 /> Desfazer
          </Button>
          <Button variant="outline" disabled={ocupado} onClick={() => jogar(null, "carta")}>
            🃏 Passar
          </Button>
          <Button variant="outline" className="text-alerta" onClick={() => setEncerrando(true)}>
            <X /> Encerrar
          </Button>
        </div>
      )}

      <Sheet aberto={encerrando} aoFechar={() => setEncerrando(false)} titulo="Encerrar partida">
        <p className="mb-4 text-sm text-muted-foreground">
          Quem ganhou? Isso fecha a mesa, gera as dívidas e resolve as apostas de “qual dupla ganha”.
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
              "flex flex-1 flex-col items-center gap-1 rounded-xl border p-2 text-center",
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

"use client";

import { useRef, useState } from "react";
import { Check, Dices, Eraser, Settings2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { textoValor, vibrar } from "@/lib/format";
import type { Dupla, Profile, Unidade } from "@/lib/types";
import { useTurma } from "./turma-provider";
import { useToast } from "./toast";
import { Avatar, Chips, Label, Sheet, Stepper } from "./ui";
import { type MesaCompleta, type Ocupado, sugestaoDupla } from "./mesa-util";

export type Lugares = (string | null)[];

// Lugares em volta da mesa: 0 embaixo, 1 esquerda, 2 em cima, 3 direita.
// Parceiros ficam de frente (0 e 2 = dupla A; 1 e 3 = dupla B).
const LUGAR: Record<number, string> = {
  0: "col-start-2 row-start-3",
  1: "col-start-1 row-start-2",
  2: "col-start-2 row-start-1",
  3: "col-start-3 row-start-2",
};

const doServidor = (mesa: MesaCompleta): Lugares =>
  [0, 1, 2, 3].map((pos) => mesa.mesa_players.find((p) => p.posicao === pos)?.user_id ?? null);

/** Lugares da mesa com resposta na hora: muda na tela e manda pro servidor, em ordem. */
function useLugares(mesa: MesaCompleta, aoMudar: () => void | Promise<void>) {
  const { rpc } = useTurma();
  const [otimista, setOtimista] = useState<Lugares | null>(null);
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const pedidos = useRef(0);

  function aplicar(novo: Lugares) {
    setOtimista(novo);
    vibrar(20);
    const n = ++pedidos.current;
    fila.current = fila.current.then(async () => {
      const r = await rpc("definir_assentos", { p_mesa: mesa.id, p_0: novo[0], p_1: novo[1], p_2: novo[2], p_3: novo[3] });
      await aoMudar();
      if (n === pedidos.current || r === undefined) setOtimista(null);
    });
  }
  return { lugares: otimista ?? doServidor(mesa), aplicar };
}

/** Qual lugar da mesa está embaixo do dedo. */
function lugarEm(x: number, y: number) {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-assento]");
  return el ? Number(el.dataset.assento) : null;
}

/** O nome que acompanha o dedo, um pouco acima dele pra não ficar escondido. */
function Fantasma({ x, y, p }: { x: number; y: number; p?: Profile }) {
  return (
    <div
      className="pointer-events-none fixed z-[60] flex -translate-x-1/2 -translate-y-1/2 scale-110 flex-col items-center rounded-2xl border-2 border-neon bg-card/95 px-3 py-2 shadow-2xl"
      style={{ left: x, top: y - 48 }}
    >
      <Avatar p={p} />
      <span className="mt-1 max-w-24 truncate text-sm font-bold">{p?.apelido}</span>
    </div>
  );
}

/** Mesa de cima: arraste um jogador em cima de outro (ou toque nos dois) pra trocar de lugar. */
function Tabuleiro({
  lugares,
  aoTrocar,
  aoTirar,
  selecionado,
  aoSelecionar,
  proximo,
  aoEscolherVazio,
  aoDoisToques,
  alvoExterno,
}: {
  lugares: Lugares;
  aoTrocar: (a: number, b: number) => void;
  /** sem isso, não aparece o botão de tirar da mesa */
  aoTirar?: (pos: number) => void;
  selecionado: number | null;
  aoSelecionar: (pos: number | null) => void;
  proximo?: number | null;
  aoEscolherVazio?: (pos: number) => void;
  /** dois toques seguidos no mesmo lugar */
  aoDoisToques?: (pos: number) => void;
  /** lugar embaixo de um nome que está sendo arrastado da lista */
  alvoExterno?: number | null;
}) {
  const { euId, perfil } = useTurma();
  const arraste = useRef<{ pos: number; x: number; y: number; ativo: boolean } | null>(null);
  const ignorarClique = useRef(false);
  const ultimoToque = useRef<{ pos: number; em: number } | null>(null);
  const [fantasma, setFantasma] = useState<{ pos: number; x: number; y: number } | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  function aoApertar(e: React.PointerEvent<HTMLDivElement>, pos: number) {
    if (!lugares[pos]) return;
    ignorarClique.current = false;
    arraste.current = { pos, x: e.clientX, y: e.clientY, ativo: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    const a = arraste.current;
    if (!a) return;
    if (!a.ativo) {
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 8) return;
      a.ativo = true;
      aoSelecionar(null);
      vibrar(15);
    }
    setFantasma({ pos: a.pos, x: e.clientX, y: e.clientY });
    const destino = lugarEm(e.clientX, e.clientY);
    setAlvo(destino !== a.pos ? destino : null);
  }
  function aoSoltar(e: React.PointerEvent<HTMLDivElement>) {
    const a = arraste.current;
    arraste.current = null;
    setFantasma(null);
    setAlvo(null);
    if (!a?.ativo) return;
    ignorarClique.current = true;
    const destino = lugarEm(e.clientX, e.clientY);
    if (destino !== null && destino !== a.pos) aoTrocar(a.pos, destino);
  }
  function aoCancelar() {
    arraste.current = null;
    setFantasma(null);
    setAlvo(null);
  }
  function aoTocar(pos: number, agora: number) {
    if (ignorarClique.current) {
      ignorarClique.current = false;
      return;
    }
    const anterior = ultimoToque.current;
    if (aoDoisToques && anterior?.pos === pos && agora - anterior.em < 400) {
      ultimoToque.current = null;
      aoSelecionar(null);
      aoDoisToques(pos);
      return;
    }
    // toque que completa uma troca não conta como o primeiro dos dois toques
    ultimoToque.current = selecionado === null ? { pos, em: agora } : null;
    if (selecionado !== null) {
      if (selecionado !== pos) aoTrocar(selecionado, pos);
      aoSelecionar(null);
    } else if (lugares[pos]) {
      vibrar(10);
      aoSelecionar(pos);
    } else {
      aoEscolherVazio?.(pos);
    }
  }

  const pfFantasma = fantasma ? perfil(lugares[fantasma.pos]) : undefined;

  return (
    <>
      <div className="grid grid-cols-3 grid-rows-3 gap-2">
        <div className="col-start-2 row-start-2 flex flex-col items-center justify-center rounded-3xl border-2 border-neon/30 bg-[radial-gradient(circle,hsl(var(--alerta)/0.28),hsl(0_0%_4%))] text-center shadow-[inset_0_0_30px_rgba(0,0,0,0.6)]">
          <span className="text-2xl">♠<span className="text-alerta">♥</span></span>
          <span className="font-display text-sm tracking-widest text-neon/80">A × B</span>
        </div>
        {[0, 1, 2, 3].map((pos) => {
          const id = lugares[pos];
          const dupla: Dupla = pos % 2 === 0 ? "A" : "B";
          const pf = perfil(id);
          return (
            <div
              key={pos}
              role="button"
              tabIndex={0}
              data-assento={pos}
              aria-label={`Lugar ${pos + 1}, dupla ${dupla}: ${pf?.apelido ?? "vazio"}`}
              onPointerDown={(e) => aoApertar(e, pos)}
              onPointerMove={aoMover}
              onPointerUp={aoSoltar}
              onPointerCancel={aoCancelar}
              onClick={(e) => aoTocar(pos, e.timeStamp)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  aoTocar(pos, e.timeStamp);
                }
              }}
              className={cn(
                "relative flex min-h-[5.5rem] cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-2xl border-2 p-1.5 text-center transition-all duration-150 sem-callout",
                LUGAR[pos],
                id ? "touch-none bg-card active:scale-95" : "touch-manipulation border-dashed bg-black/20",
                id && (dupla === "A" ? "border-neon/40" : "border-ambar/40"),
                selecionado === pos && "scale-105 border-neon bg-neon/15 shadow-[0_0_20px_-4px_hsl(var(--neon)/0.8)]",
                proximo === pos && "border-neon bg-neon/10",
                (alvo === pos || alvoExterno === pos) && "scale-105 border-alerta bg-alerta/15",
                fantasma?.pos === pos && "opacity-30",
              )}
            >
              <span className={cn("text-[10px] font-bold tracking-widest", dupla === "A" ? "text-neon" : "text-ambar")}>
                {dupla} · {pos + 1}º
              </span>
              {id ? (
                <>
                  <span key={id} className="animate-pulo">
                    <Avatar p={pf} />
                  </span>
                  <span className="line-clamp-2 w-full break-words text-sm font-bold leading-tight">{id === euId ? "Você" : (pf?.apelido ?? "?")}</span>
                  {aoTirar && (
                    <button
                      type="button"
                      aria-label={`Tirar ${pf?.apelido ?? ""} da mesa`}
                      className="absolute right-0.5 top-0.5 rounded-full p-1.5 text-muted-foreground active:text-alerta"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        aoTirar(pos);
                      }}
                    >
                      <X className="size-3.5" />
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
      {fantasma && <Fantasma x={fantasma.x} y={fantasma.y} p={pfFantasma} />}
    </>
  );
}

/** Montar a mesa: toque no nome e a pessoa senta no próximo lugar vazio. */
export function MontarMesa({
  mesa,
  ocupados,
  aoMudar,
}: {
  mesa: MesaCompleta;
  ocupados: Ocupado[];
  aoMudar: () => void | Promise<void>;
}) {
  const { turma, membros, euId, perfil, rpc, recarregar } = useTurma();
  const toast = useToast();
  const { lugares, aplicar } = useLugares(mesa, aoMudar);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [proximo, setProximo] = useState<number | null>(null);
  const [visitante, setVisitante] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  // arrastar um nome da lista até um lugar
  const pegando = useRef<{ id: string; x: number; y: number; ativo: boolean } | null>(null);
  const ignorarToqueNome = useRef(false);
  const [arrastado, setArrastado] = useState<{ id: string; x: number; y: number } | null>(null);
  const [alvoNome, setAlvoNome] = useState<number | null>(null);

  const sentados = lugares.filter(Boolean) as string[];

  function trocar(a: number, b: number) {
    const novo = [...lugares];
    [novo[a], novo[b]] = [novo[b], novo[a]];
    setProximo(null);
    aplicar(novo);
  }
  function tirar(pos: number) {
    const novo = [...lugares];
    novo[pos] = null;
    setSelecionado(null);
    aplicar(novo);
  }
  function porNaMesa(id: string, destinoPedido?: number | null) {
    const novo = [...lugares];
    const destino = destinoPedido ?? (selecionado !== null ? selecionado : proximo !== null && !novo[proximo] ? proximo : novo.indexOf(null));
    if (destino === -1) {
      toast("Mesa cheia. Toque em alguém sentado e depois no nome de quem entra.");
      return;
    }
    novo[destino] = id;
    setSelecionado(null);
    setProximo(null);
    aplicar(novo);
  }
  /** Dois toques num lugar: eu sento nele (se já estou na mesa, mudo ou troco com quem está lá). */
  function sentarAqui(pos: number) {
    setProximo(null);
    const novo = [...lugares];
    const meu = novo.indexOf(euId);
    if (meu === pos) return;
    if (novo[pos] && meu < 0) {
      toast("Esse lugar já está ocupado. Dá dois toques num lugar vazio.");
      return;
    }
    if (meu >= 0) novo[meu] = novo[pos];
    novo[pos] = euId;
    aplicar(novo);
  }
  function tocarPessoa(id: string) {
    if (ignorarToqueNome.current) {
      ignorarToqueNome.current = false;
      return;
    }
    const pos = lugares.indexOf(id);
    if (pos >= 0) tirar(pos);
    else porNaMesa(id);
  }
  function pegarNome(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    ignorarToqueNome.current = false;
    pegando.current = { id, x: e.clientX, y: e.clientY, ativo: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moverNome(e: React.PointerEvent<HTMLButtonElement>) {
    const a = pegando.current;
    if (!a) return;
    if (!a.ativo) {
      if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < 8) return;
      a.ativo = true;
      setSelecionado(null);
      vibrar(15);
    }
    setArrastado({ id: a.id, x: e.clientX, y: e.clientY });
    setAlvoNome(lugarEm(e.clientX, e.clientY));
  }
  function soltarNome(e: React.PointerEvent<HTMLButtonElement>) {
    const a = pegando.current;
    pegando.current = null;
    setArrastado(null);
    setAlvoNome(null);
    if (!a?.ativo) return;
    ignorarToqueNome.current = true;
    const destino = lugarEm(e.clientX, e.clientY);
    if (destino === null) return;
    // quem já está na mesa muda de lugar; quem estava no lugar de um novo sai
    const atual = lugares.indexOf(a.id);
    if (atual === destino) return;
    if (atual >= 0) trocar(atual, destino);
    else porNaMesa(a.id, destino);
  }
  function cancelarNome() {
    pegando.current = null;
    setArrastado(null);
    setAlvoNome(null);
  }
  function sortear() {
    const nomes = [...sentados];
    for (let i = nomes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nomes[i], nomes[j]] = [nomes[j], nomes[i]];
    }
    const novo: Lugares = [null, null, null, null];
    nomes.forEach((id, i) => {
      novo[i] = id;
    });
    setSelecionado(null);
    setProximo(null);
    aplicar(novo);
    toast("Duplas sorteadas 🎲", "ok");
  }
  async function criarVisitante(e: React.FormEvent) {
    e.preventDefault();
    if (!visitante?.trim() || criando) return;
    setCriando(true);
    const id = await rpc<string>("criar_visitante", { p_group: turma.id, p_apelido: visitante.trim() });
    setCriando(false);
    if (id) {
      await recarregar();
      setVisitante(null);
      porNaMesa(id);
    }
  }

  const ordenados = [...membros].sort((a, b) => {
    const peso = (m: typeof a) => (m.user_id === euId ? 0 : m.profile.visitante ? 2 : 1);
    return peso(a) - peso(b) || a.profile.apelido.localeCompare(b.profile.apelido, "pt-BR");
  });

  return (
    <>
      <Tabuleiro
        lugares={lugares}
        aoTrocar={trocar}
        aoTirar={tirar}
        selecionado={selecionado}
        aoSelecionar={setSelecionado}
        proximo={proximo}
        aoEscolherVazio={(pos) => setProximo(proximo === pos ? null : pos)}
        aoDoisToques={sentarAqui}
        alvoExterno={alvoNome}
      />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {selecionado !== null ? (
          <b className="text-neon">Toque no lugar pra onde vai, ou no nome de quem entra</b>
        ) : (
          "Arraste o nome até o lugar. Dois toques num lugar e você senta."
        )}
      </p>

      <div className="mt-3 rounded-2xl border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quem joga</span>
          <span className="flex gap-1">
            <button
              type="button"
              disabled={sentados.length < 2}
              onClick={sortear}
              className="flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold text-ambar transition-transform active:scale-95 disabled:opacity-30"
            >
              <Dices className="size-4" /> Sortear
            </button>
            <button
              type="button"
              disabled={sentados.length === 0}
              onClick={() => aplicar([null, null, null, null])}
              aria-label="Limpar a mesa"
              className="flex size-9 items-center justify-center rounded-full border text-muted-foreground transition-transform active:scale-95 disabled:opacity-30"
            >
              <Eraser className="size-4" />
            </button>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {ordenados.map((m) => {
            const sentado = lugares.includes(m.user_id);
            const fora = ocupados.find((o) => o.user_id === m.user_id);
            const jogando = !sentado && fora?.status === "em_jogo";
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={jogando}
                onClick={() => tocarPessoa(m.user_id)}
                onPointerDown={(e) => pegarNome(e, m.user_id)}
                onPointerMove={moverNome}
                onPointerUp={soltarNome}
                onPointerCancel={cancelarNome}
                className={cn(
                  "flex h-12 max-w-full touch-none select-none items-center gap-2 rounded-full border-2 pl-1.5 pr-3 text-sm font-semibold transition-all active:scale-95 sem-callout",
                  sentado ? "border-neon bg-neon/15 text-neon" : "bg-black/30",
                  jogando && "opacity-40",
                  arrastado?.id === m.user_id && "opacity-30",
                )}
              >
                <Avatar p={m.profile} tamanho="sm" />
                <span className="truncate">{m.user_id === euId ? "Eu" : m.profile.apelido}</span>
                {sentado && <Check className="size-4 shrink-0" />}
                {!sentado && fora && (
                  <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                    {jogando ? `jogando na ${fora.numero}` : `Mesa ${fora.numero}`}
                  </span>
                )}
              </button>
            );
          })}
          {visitante === null && (
            <button
              type="button"
              onClick={() => setVisitante("")}
              className="flex h-12 items-center gap-2 rounded-full border-2 border-dashed px-4 text-sm font-semibold text-muted-foreground transition-all active:scale-95"
            >
              <UserPlus className="size-4" /> Visitante
            </button>
          )}
        </div>
        {visitante !== null && (
          <form onSubmit={criarVisitante} className="mt-3 flex gap-2">
            <Input
              autoFocus
              placeholder="Nome do amigo sem app"
              maxLength={24}
              value={visitante}
              onChange={(e) => setVisitante(e.target.value)}
            />
            <Button disabled={!visitante.trim() || criando}>Pôr</Button>
            <Button type="button" variant="ghost" aria-label="Cancelar" onClick={() => setVisitante(null)}>
              <X />
            </Button>
          </form>
        )}
      </div>
      {arrastado && <Fantasma x={arrastado.x} y={arrastado.y} p={perfil(arrastado.id)} />}
    </>
  );
}

/** Durante a partida: trocar de lugar. Quem marca troca dentro da dupla; admin muda tudo. */
export function AjustarOrdem({ mesa, ocupados, aoMudar }: { mesa: MesaCompleta; ocupados: Ocupado[]; aoMudar: () => void | Promise<void> }) {
  const { isAdmin } = useTurma();
  const toast = useToast();
  const { lugares, aplicar } = useLugares(mesa, aoMudar);
  const [selecionado, setSelecionado] = useState<number | null>(null);

  return (
    <details className="mt-3 rounded-2xl border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-semibold text-muted-foreground">⇄ {isAdmin ? "Trocar jogadores ou a ordem" : "Trocar a ordem da dupla"}</summary>
      <div className="mt-3">
        {isAdmin ? (
          <MontarMesa mesa={mesa} ocupados={ocupados} aoMudar={aoMudar} />
        ) : (
          <>
            <Tabuleiro
              lugares={lugares}
              selecionado={selecionado}
              aoSelecionar={setSelecionado}
              aoTrocar={(a, b) => {
                if (a % 2 !== b % 2) {
                  toast("Durante a partida só dá pra trocar dentro da dupla", "erro");
                  return;
                }
                const novo = [...lugares];
                [novo[a], novo[b]] = [novo[b], novo[a]];
                aplicar(novo);
              }}
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">Arraste um parceiro pra cima do outro.</p>
          </>
        )}
      </div>
    </details>
  );
}

// ------------------------------------------------------------------
// Começar a partida: um toque só, com o que foi usado da última vez
// ------------------------------------------------------------------

interface Ajustes {
  valendo: string;
  qtd: number;
  alvo: string;
  md3: string;
}

const chaveAjustes = (turma: string) => `resenha:ajustes:${turma}`;

function lerAjustes(turma: string): Partial<Ajustes> {
  try {
    return JSON.parse(localStorage.getItem(chaveAjustes(turma)) ?? "{}") as Partial<Ajustes>;
  } catch {
    return {};
  }
}

export function IniciarPartida({ mesa, aoMudar }: { mesa: MesaCompleta; aoMudar: () => void }) {
  const { turma, perfil, itens, itensAtivos, rpc } = useTurma();
  const toast = useToast();
  const [ajustes, setAjustes] = useState<Ajustes>(() => {
    const s = lerAjustes(turma.id);
    const cerveja = itensAtivos.find((i) => /cerveja/i.test(i.nome));
    const valido = s.valendo === "nada" || s.valendo === "fichas" || itensAtivos.some((i) => i.id === s.valendo);
    return {
      valendo: valido && s.valendo ? s.valendo : (cerveja?.id ?? "nada"),
      qtd: s.qtd && s.qtd > 0 ? s.qtd : 1,
      alvo: s.alvo ?? String(turma.truco_pontos_alvo),
      md3: s.md3 ?? (turma.truco_melhor_de_3 ? "sim" : "nao"),
    };
  });
  const [abrirAjustes, setAbrirAjustes] = useState(false);
  const [nomeA, setNomeA] = useState("");
  const [nomeB, setNomeB] = useState("");
  const [carteador, setCarteador] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const temA = mesa.mesa_players.some((p) => p.dupla === "A");
  const temB = mesa.mesa_players.some((p) => p.dupla === "B");
  const ordem = [...mesa.mesa_players].sort((a, b) => a.posicao - b.posicao);
  const pos = carteador !== null && ordem.some((p) => String(p.posicao) === carteador) ? Number(carteador) : (ordem[0]?.posicao ?? 0);
  const quemDa = ordem.find((p) => p.posicao === pos);
  const unidade: Unidade | null = ajustes.valendo === "nada" ? null : ajustes.valendo === "fichas" ? "fichas" : "item";
  const sugestaoA = sugestaoDupla(mesa.mesa_players, "A", perfil);
  const sugestaoB = sugestaoDupla(mesa.mesa_players, "B", perfil);

  async function comecar() {
    if (ocupado) return;
    setOcupado(true);
    const r = await rpc("iniciar_partida", {
      p_mesa: mesa.id,
      p_nome_a: nomeA.trim() || sugestaoA,
      p_nome_b: nomeB.trim() || sugestaoB,
      p_unidade: unidade,
      p_item: unidade === "item" ? ajustes.valendo : null,
      p_qtd: unidade ? ajustes.qtd : 0,
      p_carteador: pos,
      p_pontos_alvo: Number(ajustes.alvo),
      p_melhor_de_3: ajustes.md3 === "sim",
    });
    setOcupado(false);
    if (r !== undefined) {
      try {
        localStorage.setItem(chaveAjustes(turma.id), JSON.stringify(ajustes));
      } catch {}
      vibrar([30, 50, 30]);
      toast("Valendo! Boa sorte 🃏", "ok");
      setAbrirAjustes(false);
      aoMudar();
    }
  }

  const atualizar = (parte: Partial<Ajustes>) => setAjustes((a) => ({ ...a, ...parte }));
  const resumoValendo = unidade
    ? `${textoValor({ unidade, item_id: unidade === "item" ? ajustes.valendo : null, quantidade: ajustes.qtd }, itens)} por pessoa`
    : "Só a honra";

  return (
    <>
      {/* fica sempre à vista, acima do menu, sem precisar rolar a tela */}
      <div className={cn("mt-4", temA && temB && "sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30")}>
        <Button
          size="lg"
          className={cn("h-16 w-full font-display text-3xl tracking-wider transition-transform active:scale-[0.98]", temA && temB && "shadow-[0_0_30px_-8px_hsl(var(--neon)/0.8)]")}
          disabled={!temA || !temB || ocupado}
          onClick={comecar}
        >
          COMEÇAR 🃏
        </Button>
      </div>
      {temA && temB ? (
        <button
          type="button"
          onClick={() => setAbrirAjustes(true)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border bg-black/20 px-3 py-2.5 text-xs text-muted-foreground active:bg-accent"
        >
          <span className="min-w-0 truncate">
            <b className="text-ambar">{resumoValendo}</b> · até {ajustes.alvo}
            {ajustes.md3 === "sim" ? " · melhor de 3" : ""}
            {quemDa ? ` · 🃏 ${perfil(quemDa.user_id)?.apelido ?? ""}` : ""}
          </span>
          <Settings2 className="size-4 shrink-0" />
        </button>
      ) : (
        <p className="mt-2 text-center text-xs text-muted-foreground">Falta pelo menos uma pessoa em cada dupla.</p>
      )}

      <Sheet aberto={abrirAjustes} aoFechar={() => setAbrirAjustes(false)} titulo="Ajustar a partida">
        <Label>O que está valendo (por pessoa)</Label>
        <Chips
          valor={ajustes.valendo}
          aoMudar={(v) => atualizar({ valendo: v })}
          opcoes={[
            { id: "nada", label: "🫡 Só a honra" },
            { id: "fichas", label: "🪙 Fichas" },
            ...itensAtivos.map((i) => ({ id: i.id, label: `${i.emoji} ${i.nome}` })),
          ]}
        />
        {ajustes.valendo !== "nada" && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Cada perdedor paga</span>
            <Stepper valor={ajustes.qtd} aoMudar={(n) => atualizar({ qtd: n })} />
          </div>
        )}
        <Label>Quem dá a primeira carta</Label>
        <Chips
          valor={String(pos)}
          aoMudar={setCarteador}
          opcoes={ordem.map((p) => ({ id: String(p.posicao), label: `🃏 ${perfil(p.user_id)?.apelido ?? "?"}` }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Até</Label>
            <Chips valor={ajustes.alvo} aoMudar={(v) => atualizar({ alvo: v })} opcoes={["12", "15", "24"].map((x) => ({ id: x, label: x }))} />
          </div>
          <div>
            <Label>Melhor de 3</Label>
            <Chips valor={ajustes.md3} aoMudar={(v) => atualizar({ md3: v })} opcoes={[{ id: "sim", label: "Sim" }, { id: "nao", label: "Não" }]} />
          </div>
        </div>
        <Label>Nome das duplas (opcional)</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder={sugestaoA} value={nomeA} maxLength={24} onChange={(e) => setNomeA(e.target.value)} />
          <Input placeholder={sugestaoB} value={nomeB} maxLength={24} onChange={(e) => setNomeB(e.target.value)} />
        </div>
        <Button size="lg" className="mt-6 w-full font-display text-2xl tracking-wider" disabled={ocupado} onClick={comecar}>
          COMEÇAR 🃏
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">Fica guardado pra próxima partida.</p>
      </Sheet>
    </>
  );
}

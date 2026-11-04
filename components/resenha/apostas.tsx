"use client";

import { useState } from "react";
import { Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODALIDADES, modalidade, textoValor, tempoAtras, vibrar } from "@/lib/format";
import type { Dupla, Mesa, Modalidade, Unidade, Wager, WagerComMesa } from "@/lib/types";
import { useAgora } from "@/lib/use-agora";
import { useTurma } from "./turma-provider";
import { useToast } from "./toast";
import { Avatar, Chips, Label, Selo, Sheet, Stepper } from "./ui";

export interface MesaRef {
  id: string;
  numero: number;
  nome: string | null;
  marcador_id?: string | null;
  status?: Mesa["status"];
  nomeA?: string;
  nomeB?: string;
}

const ABERTOS: Wager["status"][] = ["aberto", "valendo", "aguardando"];
export const apostaAtiva = (w: Wager) => ABERTOS.includes(w.status);

/** Nomes das duplas: vêm da mesa embutida ou de quem chamou. */
function nomesDuplas(w: Wager | WagerComMesa, duplas?: { a: string; b: string }) {
  if (duplas) return duplas;
  const m = "mesas" in w ? w.mesas?.truco_matches?.[0] : undefined;
  return { a: m?.nome_dupla_a ?? "Dupla A", b: m?.nome_dupla_b ?? "Dupla B" };
}

export function CardAposta({
  w,
  duplas,
  mesa,
  mostrarMesa = true,
  aoMudar,
}: {
  w: Wager | WagerComMesa;
  duplas?: { a: string; b: string };
  /** dados da mesa quando o card está dentro dela (dono e status) */
  mesa?: Pick<Mesa, "marcador_id" | "status">;
  mostrarMesa?: boolean;
  aoMudar?: () => void;
}) {
  const { euId, itens, nome, perfil, rpc, possoAgirPor, visitantesQueCuido } = useTurma();
  const toast = useToast();
  const agora = useAgora();
  const [marcando, setMarcando] = useState(false);
  const [escolhendoTopo, setEscolhendoTopo] = useState(false);
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const d = nomesDuplas(w, duplas);
  const mesaResumo = "mesas" in w ? w.mesas : null;
  const marcador = mesa?.marcador_id ?? mesaResumo?.marcador_id ?? null;
  const statusMesa = mesa?.status ?? mesaResumo?.status;
  // depois que a partida da mesa começa, ninguém retira nem muda aposta
  const travada = Boolean(w.mesa_id && statusMesa && statusMesa !== "aberta");

  const meuA = possoAgirPor(w.lado_a_user, marcador);
  const meuB = possoAgirPor(w.lado_b_user, marcador);
  const meuLado = meuA ? w.lado_a_user : meuB ? w.lado_b_user : null;
  const por = (id: string | null) => (id && id !== euId ? id : null);

  // quem eu posso colocar pra topar (eu + visitantes que eu cuido)
  const podemTopar = [euId, ...visitantesQueCuido(marcador).map((m) => m.user_id)].filter(
    (id) => id !== w.lado_a_user && (!w.lado_b_user || w.lado_b_user === id),
  );

  async function acao(fn: string, extra: Record<string, unknown> = {}, ok?: string) {
    setOcupado(true);
    const r = await rpc(fn, { p_wager: w.id, ...extra });
    setOcupado(false);
    if (r !== undefined) {
      vibrar(30);
      if (ok) toast(ok, "ok");
      setMarcando(false);
      setEscolhendoTopo(false);
      aoMudar?.();
    }
  }

  const ganhou = (lado: Dupla | "empate" | null) =>
    lado === "empate" ? "empate" : `${nome(lado === "A" ? w.lado_a_user : w.lado_b_user)} ganhou`;

  const titulo =
    w.tipo === "dupla_vence" ? (
      <>
        <span className="text-neon">{w.alvo_dupla === "A" ? d.a : d.b}</span> ganha
        {mostrarMesa && mesaResumo ? ` a Mesa ${mesaResumo.numero}` : ""}
      </>
    ) : (
      <>“{w.texto}”</>
    );

  const horasRestantes = w.marcado_em
    ? Math.max(0, Math.ceil(24 - (agora - new Date(w.marcado_em).getTime()) / 3_600_000))
    : 0;
  const ladoQueMarcou = w.resolvido_por;
  const possoConfirmar =
    w.status === "aguardando" &&
    [w.lado_a_user, w.lado_b_user].some((l) => l && l !== ladoQueMarcou && possoAgirPor(l, marcador));
  const ladoConfirma = [w.lado_a_user, w.lado_b_user].find((l) => l && l !== ladoQueMarcou && possoAgirPor(l, marcador)) ?? null;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-3",
        w.status === "valendo" && "border-neon/30",
        w.status === "aguardando" && "border-ambar/40",
        !apostaAtiva(w) && "opacity-80",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{modalidade(w.modalidade).emoji}</span>
        <span>{tempoAtras(w.created_at)}</span>
        {mostrarMesa && mesaResumo && w.tipo === "texto_livre" && <span>· Mesa {mesaResumo.numero}</span>}
        {travada && apostaAtiva(w) && (
          <span className="flex items-center gap-0.5 text-ambar">
            <Lock className="size-3" /> travada
          </span>
        )}
        <span className="ml-auto">
          <StatusSelo w={w} />
        </span>
      </div>

      <div className="mt-2 text-[15px] font-semibold leading-snug">
        <span className="text-muted-foreground">{nome(w.lado_a_user)}: </span>
        {titulo}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Avatar p={perfil(w.lado_a_user)} tamanho="sm" />
        <span className="text-xs text-muted-foreground">vs</span>
        {w.lado_b_user ? (
          <>
            <Avatar p={perfil(w.lado_b_user)} tamanho="sm" />
            <span className="truncate text-sm">{nome(w.lado_b_user)}</span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">qualquer um</span>
        )}
        <span className="ml-auto rounded-lg bg-ambar/15 px-2 py-1 font-placar text-sm text-ambar">{textoValor(w, itens)}</span>
      </div>

      {w.status === "aberto" && w.lado_b_user && !meuB && (
        <p className="mt-2 text-xs text-muted-foreground">esperando {nome(w.lado_b_user)} topar…</p>
      )}
      {w.status === "aguardando" && (
        <p className="mt-2 text-xs text-ambar">
          {nome(w.resolvido_por)} marcou: <b>{ganhou(w.resultado_proposto)}</b> · confirma sozinho em {horasRestantes}h
        </p>
      )}
      {w.status === "resolvido" && (
        <p className="mt-2 text-sm font-semibold text-neon">🏆 {nome(w.vencedor_lado === "A" ? w.lado_a_user : w.lado_b_user)} levou</p>
      )}
      {w.status === "empate" && <p className="mt-2 text-sm text-muted-foreground">🤝 Anulada — ninguém deve nada</p>}

      {/* ações */}
      <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
        {w.status === "aberto" && podemTopar.length > 0 && !escolhendoTopo && (
          <Button
            variant="ambar"
            className="flex-1 font-display text-xl tracking-wider"
            disabled={ocupado}
            onClick={() =>
              podemTopar.length === 1
                ? acao("topar_aposta", { p_por: por(podemTopar[0]) }, "TOPO! Tá valendo 🤝")
                : setEscolhendoTopo(true)
            }
          >
            TOPO!
          </Button>
        )}
        {escolhendoTopo && (
          <div className="w-full">
            <div className="mb-1 text-xs text-muted-foreground">Topar como:</div>
            <div className="flex flex-wrap gap-2">
              {podemTopar.map((id) => (
                <Button key={id} variant="ambar" size="sm" disabled={ocupado} onClick={() => acao("topar_aposta", { p_por: por(id) }, "TOPO! Tá valendo 🤝")}>
                  {id === euId ? "Eu" : perfil(id)?.apelido}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setEscolhendoTopo(false)}>
                voltar
              </Button>
            </div>
          </div>
        )}
        {w.status === "aberto" && meuA && !travada && (
          <Button variant="outline" disabled={ocupado} onClick={() => setEditando(true)}>
            <Pencil /> Mudar
          </Button>
        )}
        {w.status === "aberto" && meuLado && !travada && (
          <Button
            variant="outline"
            disabled={ocupado}
            onClick={() => acao("cancelar_aposta", { p_por: por(meuLado) }, meuA ? "Aposta retirada" : "Recusada")}
          >
            {meuA ? "Retirar" : "Recusar"}
          </Button>
        )}
        {w.status === "valendo" && w.tipo === "texto_livre" && meuLado && !marcando && (
          <Button variant="outline" className="flex-1" onClick={() => setMarcando(true)}>
            Marcar resultado
          </Button>
        )}
        {w.status === "valendo" && w.tipo === "dupla_vence" && (
          <p className="text-xs text-muted-foreground">Resolve sozinha quando a partida acabar.</p>
        )}
        {marcando && meuLado && (
          <div className="w-full">
            {meuLado !== euId && <div className="mb-1 text-xs text-muted-foreground">Marcando por {nome(meuLado)}:</div>}
            <div className="grid grid-cols-3 gap-2">
              <Button
                disabled={ocupado}
                onClick={() => acao("marcar_resultado", { p_resultado: meuA ? "A" : "B", p_por: por(meuLado) }, "Marcado! Agora o outro lado confirma.")}
              >
                Ganhou
              </Button>
              <Button
                variant="destructive"
                disabled={ocupado}
                onClick={() => acao("marcar_resultado", { p_resultado: meuA ? "B" : "A", p_por: por(meuLado) }, "Marcado! Agora o outro lado confirma.")}
              >
                Perdeu
              </Button>
              <Button variant="outline" disabled={ocupado} onClick={() => acao("marcar_resultado", { p_resultado: "empate", p_por: por(meuLado) }, "Empate marcado")}>
                Empate
              </Button>
            </div>
          </div>
        )}
        {possoConfirmar && (
          <>
            <Button className="flex-1" disabled={ocupado} onClick={() => acao("confirmar_resultado", { p_por: por(ladoConfirma) }, "Confirmado ✔")}>
              Confirmar
            </Button>
            <Button variant="outline" disabled={ocupado} onClick={() => acao("contestar_resultado", { p_por: por(ladoConfirma) }, "Contestado: volta a valer")}>
              Contestar
            </Button>
          </>
        )}
      </div>

      {editando && (
        <EditarAposta
          w={w}
          duplas={d}
          por={por(w.lado_a_user)}
          aoFechar={() => setEditando(false)}
          aoSalvar={() => {
            setEditando(false);
            aoMudar?.();
          }}
        />
      )}
    </div>
  );
}

function StatusSelo({ w }: { w: Wager }) {
  switch (w.status) {
    case "aberto":
      return <Selo cor="ambar">TOPA?</Selo>;
    case "valendo":
      return <Selo>VALENDO</Selo>;
    case "aguardando":
      return <Selo cor="ambar">CONFIRMAR</Selo>;
    case "resolvido":
      return <Selo cor="cinza">RESOLVIDA</Selo>;
    case "empate":
      return <Selo cor="cinza">ANULADA</Selo>;
    default:
      return <Selo cor="cinza">CANCELADA</Selo>;
  }
}

/** Escolha de valor: atalhos (5, 10, 20, 50, 1🍺), tipo (fichas/itens) e quantidade. */
function EscolhaValor({
  unidade,
  itemId,
  qtd,
  aoMudar,
}: {
  unidade: Unidade;
  itemId: string | null;
  qtd: number;
  aoMudar: (v: { unidade: Unidade; itemId: string | null; qtd: number }) => void;
}) {
  const { itensAtivos } = useTurma();
  const cerveja = itensAtivos.find((i) => /cerveja/i.test(i.nome)) ?? itensAtivos[0];
  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {[5, 10, 20, 50].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => aoMudar({ unidade: "fichas", itemId: null, qtd: q })}
            className={cn("h-12 rounded-xl border font-placar text-lg", unidade === "fichas" && qtd === q ? "border-ambar bg-ambar/15 text-ambar" : "bg-black/30")}
          >
            {q}
          </button>
        ))}
        {cerveja && (
          <button
            type="button"
            onClick={() => aoMudar({ unidade: "item", itemId: cerveja.id, qtd: 1 })}
            className={cn("h-12 rounded-xl border text-lg", unidade === "item" && itemId === cerveja.id && qtd === 1 ? "border-ambar bg-ambar/15" : "bg-black/30")}
          >
            1 {cerveja.emoji}
          </button>
        )}
      </div>
      <Chips
        className="mt-3"
        valor={unidade === "fichas" ? "fichas" : (itemId ?? "")}
        aoMudar={(v) => (v === "fichas" ? aoMudar({ unidade: "fichas", itemId: null, qtd }) : aoMudar({ unidade: "item", itemId: v, qtd }))}
        opcoes={[{ id: "fichas", label: "🪙 fichas" }, ...itensAtivos.map((i) => ({ id: i.id, label: `${i.emoji} ${i.nome}` }))]}
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Quantidade</span>
        <Stepper valor={qtd} aoMudar={(n) => aoMudar({ unidade, itemId, qtd: n })} />
      </div>
    </>
  );
}

function EditarAposta({
  w,
  duplas,
  por,
  aoFechar,
  aoSalvar,
}: {
  w: Wager;
  duplas: { a: string; b: string };
  por: string | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const { rpc } = useTurma();
  const toast = useToast();
  const [valor, setValor] = useState({ unidade: w.unidade, itemId: w.item_id, qtd: w.quantidade });
  const [alvo, setAlvo] = useState<Dupla>(w.alvo_dupla ?? "A");
  const [texto, setTexto] = useState(w.texto ?? "");
  async function salvar() {
    const r = await rpc("editar_aposta", {
      p_wager: w.id,
      p_unidade: valor.unidade,
      p_item: valor.unidade === "item" ? valor.itemId : null,
      p_quantidade: valor.qtd,
      p_alvo_dupla: w.tipo === "dupla_vence" ? alvo : null,
      p_texto: w.tipo === "texto_livre" ? texto : null,
      p_por: por,
    });
    if (r !== undefined) {
      toast("Aposta atualizada", "ok");
      aoSalvar();
    }
  }
  return (
    <Sheet aberto aoFechar={aoFechar} titulo="Mudar aposta">
      <p className="mb-2 text-xs text-muted-foreground">Dá pra mudar enquanto ninguém topou e a partida não começou.</p>
      {w.tipo === "dupla_vence" ? (
        <div className="grid grid-cols-2 gap-2">
          {(["A", "B"] as const).map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => setAlvo(x)}
              className={cn("rounded-2xl border p-3 font-display text-xl tracking-wide", alvo === x ? "border-neon bg-neon/15 text-neon" : "bg-black/30")}
            >
              {x === "A" ? duplas.a : duplas.b}
            </button>
          ))}
        </div>
      ) : (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={140}
          rows={2}
          className="w-full resize-none rounded-xl border border-input bg-black/40 p-3 text-base"
        />
      )}
      <Label>Valendo</Label>
      <EscolhaValor unidade={valor.unidade} itemId={valor.itemId} qtd={valor.qtd} aoMudar={setValor} />
      <Button size="lg" className="mt-6 w-full" onClick={salvar}>
        Salvar
      </Button>
    </Sheet>
  );
}

/** Formulário rápido (meta: < 10 s). Com `mesa`, permite "qual dupla ganha". */
export function NovaAposta({
  aberto,
  aoFechar,
  mesa,
  mesasAbertas = [],
  aoCriar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  mesa?: MesaRef;
  mesasAbertas?: MesaRef[];
  aoCriar?: () => void;
}) {
  const { turma, euId, membros, rpc, visitantesQueCuido } = useTurma();
  const toast = useToast();
  const temPartida = Boolean(mesa?.nomeA);
  const [tipo, setTipo] = useState<"dupla_vence" | "texto_livre">(temPartida ? "dupla_vence" : "texto_livre");
  const [alvo, setAlvo] = useState<Dupla | null>(null);
  const [texto, setTexto] = useState("");
  const [mod, setMod] = useState<Modalidade>(mesa ? "truco" : "outro");
  const [valor, setValor] = useState<{ unidade: Unidade; itemId: string | null; qtd: number }>({ unidade: "fichas", itemId: null, qtd: 10 });
  const [contra, setContra] = useState<string>("aberto");
  const [mesaId, setMesaId] = useState<string>(mesa?.id ?? "nenhuma");
  const [como, setComo] = useState<string>(euId);
  const [ocupado, setOcupado] = useState(false);

  const marcador = mesa?.marcador_id ?? mesasAbertas.find((m) => m.id === mesaId)?.marcador_id ?? null;
  const cuidados = visitantesQueCuido(marcador);

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    if (tipo === "dupla_vence" && !alvo) return toast("Escolhe a dupla", "erro");
    if (tipo === "texto_livre" && !texto.trim()) return toast("Escreve no que vai apostar", "erro");
    setOcupado(true);
    const r = await rpc("criar_aposta", {
      p_group: turma.id,
      p_tipo: tipo,
      p_texto: tipo === "texto_livre" ? texto : null,
      p_modalidade: mod,
      p_unidade: valor.unidade,
      p_item: valor.unidade === "item" ? valor.itemId : null,
      p_quantidade: valor.qtd,
      p_mesa: mesaId === "nenhuma" ? null : mesaId,
      p_alvo_dupla: tipo === "dupla_vence" ? alvo : null,
      p_contra: contra === "aberto" ? null : contra,
      p_por: como === euId ? null : como,
    });
    setOcupado(false);
    if (r !== undefined) {
      vibrar([20, 40, 20]);
      toast(contra === "aberto" ? "Lançado! Agora é só alguém dar TOPO 🤝" : "Desafio mandado!", "ok");
      setTexto("");
      setAlvo(null);
      setContra("aberto");
      setComo(euId);
      aoFechar();
      aoCriar?.();
    }
  }

  return (
    <Sheet aberto={aberto} aoFechar={aoFechar} titulo={mesa ? `Aposta · Mesa ${mesa.numero}` : "Novo palpite"}>
      <form onSubmit={lancar}>
        {cuidados.length > 0 && (
          <>
            <Label>Apostando como</Label>
            <Chips
              valor={como}
              aoMudar={setComo}
              opcoes={[{ id: euId, label: "🙋 Eu" }, ...cuidados.map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` }))]}
            />
          </>
        )}

        {temPartida && (
          <Chips
            className={cuidados.length ? "mt-3" : ""}
            valor={tipo}
            aoMudar={setTipo}
            opcoes={[
              { id: "dupla_vence", label: "🏆 Qual dupla ganha" },
              { id: "texto_livre", label: "✍️ Outra coisa" },
            ]}
          />
        )}

        {tipo === "dupla_vence" && mesa ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["A", "B"] as const).map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setAlvo(x)}
                className={cn("rounded-2xl border p-4 font-display text-2xl tracking-wide", alvo === x ? "border-neon bg-neon/15 text-neon" : "bg-black/30")}
              >
                {x === "A" ? mesa.nomeA : mesa.nomeB}
                <div className="font-sans text-xs text-muted-foreground">vai ganhar</div>
              </button>
            ))}
          </div>
        ) : (
          <>
            <Label>Aposto que…</Label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder={mesa ? "vai ter mão de onze" : "ele não mata o cara nesse round"}
              className="w-full resize-none rounded-xl border border-input bg-black/40 p-3 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!mesa && (
              <>
                <Label>Modalidade</Label>
                <Chips valor={mod} aoMudar={setMod} opcoes={MODALIDADES.map((m) => ({ id: m.id, label: `${m.emoji} ${m.nome}` }))} />
              </>
            )}
          </>
        )}

        <Label>Valendo</Label>
        <EscolhaValor unidade={valor.unidade} itemId={valor.itemId} qtd={valor.qtd} aoMudar={setValor} />

        <Label>Contra quem</Label>
        <Chips
          valor={contra}
          aoMudar={setContra}
          opcoes={[
            { id: "aberto", label: "🙋 Aberto (quem topar)" },
            ...membros.filter((m) => m.user_id !== como).map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` })),
          ]}
        />

        {!mesa && mesasAbertas.length > 0 && (
          <>
            <Label>Ligar a uma mesa (opcional)</Label>
            <Chips
              valor={mesaId}
              aoMudar={setMesaId}
              opcoes={[{ id: "nenhuma", label: "Nenhuma" }, ...mesasAbertas.map((m) => ({ id: m.id, label: `Mesa ${m.numero}${m.nome ? ` · ${m.nome}` : ""}` }))]}
            />
          </>
        )}

        {mesa && mesa.status && mesa.status !== "aberta" && (
          <p className="mt-4 text-xs text-ambar">🔒 A partida já começou: depois de lançar, não dá pra retirar nem mudar.</p>
        )}
        <Button size="lg" className="mt-6 w-full font-display text-2xl tracking-wider" disabled={ocupado}>
          {contra === "aberto" ? "LANÇAR" : "DESAFIAR"}
        </Button>
      </form>
    </Sheet>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/resenha/cabecalho";
import { CardAposta } from "@/components/resenha/apostas";
import { InstalarApp } from "@/components/resenha/instalar-app";
import { useTurma } from "@/components/resenha/turma-provider";
import { AoVivo, Quedas, Rodape, Selo, Titulo, Vazio } from "@/components/resenha/ui";
import { type MesaCompleta, nomeJogador, partidaAtual } from "@/components/resenha/mesa-util";
import { useTela } from "@/lib/api";
import { textoValor, vibrar } from "@/lib/format";
import type { Dupla, WagerComMesa } from "@/lib/types";

interface Dados {
  mesas: MesaCompleta[];
  apostas: WagerComMesa[];
}

export default function AoVivoPage() {
  const { turma, isAdmin, perfil, itens, rpc, garantirPerfis, euId } = useTurma();
  const { dados, recarregar } = useTela<Dados>(`/api/tela/aovivo?turma=${turma.id}`, 2500);
  const [criando, setCriando] = useState(false);
  const mesas = dados?.mesas ?? null;
  const apostas = dados?.apostas ?? [];

  useEffect(() => {
    if (!dados) return;
    garantirPerfis([
      ...dados.mesas.flatMap((m) => [...m.mesa_players.map((p) => p.user_id), m.marcador_id]),
      ...dados.apostas.flatMap((w) => [w.lado_a_user, w.lado_b_user]),
    ]);
  }, [dados, garantirPerfis]);

  async function novaMesa() {
    setCriando(true);
    const id = await rpc<string>("criar_mesa", { p_group: turma.id });
    setCriando(false);
    if (id) {
      vibrar(30);
      recarregar();
    }
  }

  const rolando = mesas?.filter((m) => m.status === "em_jogo").length ?? 0;
  const minhaMesa = mesas?.find((m) => m.mesa_players.some((p) => p.user_id === euId));

  return (
    <>
      <Cabecalho
        titulo="AO VIVO"
        sub={
          mesas
            ? rolando
              ? `${rolando} ${rolando === 1 ? "mesa rolando" : "mesas rolando"} agora`
              : minhaMesa
                ? `Você está na Mesa ${minhaMesa.numero}`
                : "Toque numa mesa e escolha quem joga"
            : "…"
        }
      />

      <InstalarApp chave="resenha:instalar-dispensado" className="mb-4" />

      <div className="flex flex-col gap-3">
        {mesas === null && (
          <>
            <div className="h-36 animate-pulse rounded-2xl bg-card" />
            <div className="h-36 animate-pulse rounded-2xl bg-card" />
          </>
        )}
        {mesas?.length === 0 && (
          <Vazio emoji="🃏">{isAdmin ? "Nenhuma mesa. Adiciona uma aqui embaixo." : "Nenhuma mesa ainda. Pede pro admin adicionar."}</Vazio>
        )}
        {mesas?.map((m, i) => (
          <div key={m.numero} className="animate-entrar" style={{ animationDelay: `${i * 60}ms` }}>
            <CardMesa m={m} apostas={apostas.filter((a) => a.mesa_id === m.id).length} perfil={perfil} itens={itens} />
          </div>
        ))}
      </div>

      {isAdmin && (
        <Button variant="outline" className="mt-3 w-full border-dashed text-muted-foreground" disabled={criando} onClick={novaMesa}>
          <Plus /> Adicionar outra mesa
        </Button>
      )}

      {apostas.length > 0 && (
        <>
          <Titulo>💰 Apostas abertas</Titulo>
          <div className="sem-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {apostas.map((w) => (
              <div key={w.id} className="w-[85%] shrink-0 snap-center">
                <CardAposta w={w} aoMudar={recarregar} />
              </div>
            ))}
          </div>
        </>
      )}
      <Rodape />
    </>
  );
}

function CardMesa({
  m,
  apostas,
  perfil,
  itens,
}: {
  m: MesaCompleta;
  apostas: number;
  perfil: ReturnType<typeof useTurma>["perfil"];
  itens: ReturnType<typeof useTurma>["itens"];
}) {
  const p = partidaAtual(m);
  const jogando = m.status === "em_jogo" && p;
  const carteador = p ? m.mesa_players.find((x) => x.posicao === p.carteador_pos) : undefined;
  const onze = p && (p.placar_a === p.pontos_alvo - 1 || p.placar_b === p.pontos_alvo - 1);
  const dono = perfil(m.marcador_id);
  const sentados = m.mesa_players.length;
  const nomes = (d: Dupla) =>
    m.mesa_players
      .filter((x) => x.dupla === d)
      .sort((a, b) => a.posicao - b.posicao)
      .map((x) => nomeJogador(x, perfil));

  return (
    <Link
      href={`/mesa/${m.id}`}
      className={`block rounded-2xl border bg-card p-4 transition-all active:scale-[0.98] active:bg-accent ${jogando ? "border-neon/30 shadow-[0_0_24px_-8px_hsl(var(--neon)/0.35)]" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl tracking-wide">MESA {m.numero}</span>
        {m.nome && <span className="truncate text-sm text-muted-foreground">· {m.nome}</span>}
        <span className="ml-auto flex items-center gap-1">
          {jogando ? (
            <AoVivo />
          ) : sentados === 0 ? (
            <Selo cor="cinza">LIVRE</Selo>
          ) : sentados === 4 ? (
            <Selo>PRONTA</Selo>
          ) : (
            <Selo cor="ambar">{sentados}/4</Selo>
          )}
          {!jogando && <ChevronRight className="size-5 text-muted-foreground" />}
        </span>
      </div>

      {jogando ? (
        <>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0 text-right">
              {nomes("A").map((n) => (
                <div key={n} className="break-words font-semibold leading-tight">{n}</div>
              ))}
              {p.melhor_de_3 && <Quedas n={p.quedas_a} className="justify-end" />}
            </div>
            <div className="font-placar text-5xl tabular-nums leading-none">
              <span key={`a${p.placar_a}`} className="inline-block animate-pulo text-neon brilho-neon">{p.placar_a}</span>
              <span className="mx-1 text-muted-foreground">×</span>
              <span key={`b${p.placar_b}`} className="inline-block animate-pulo text-neon brilho-neon">{p.placar_b}</span>
            </div>
            <div className="min-w-0">
              {nomes("B").map((n) => (
                <div key={n} className="break-words font-semibold leading-tight">{n}</div>
              ))}
              {p.melhor_de_3 && <Quedas n={p.quedas_b} />}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>🃏 {nomeJogador(carteador, perfil)} dá as cartas</span>
            {p.valendo_unidade && (
              <span className="text-ambar">
                {textoValor({ unidade: p.valendo_unidade, item_id: p.valendo_item_id, quantidade: p.valendo_qtd }, itens, true)} por pessoa
              </span>
            )}
            {p.escuras ? <Selo cor="alerta">🌑 ÀS ESCURAS</Selo> : onze && <Selo cor="alerta">MÃO DE ONZE</Selo>}
          </div>
        </>
      ) : sentados === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">Toque pra escolher quem joga</div>
      ) : (
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm font-semibold">
          <span className="min-w-0 break-words text-right text-neon">{nomes("A").join(" & ") || "—"}</span>
          <span className="font-display text-muted-foreground">×</span>
          <span className="min-w-0 break-words text-ambar">{nomes("B").join(" & ") || "—"}</span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs empty:hidden">
        {jogando && dono && <span className="text-muted-foreground">🎙️ {dono.apelido} marca</span>}
        {!jogando && m.ultima?.vencedor && (
          <span className="min-w-0 truncate text-muted-foreground">
            🏆 Última: {m.ultima.vencedor === "A" ? m.ultima.nome_dupla_a : m.ultima.nome_dupla_b}
          </span>
        )}
        {apostas > 0 && (
          <span className="font-semibold text-ambar">
            💰 {apostas} {apostas === 1 ? "aposta" : "apostas"}
          </span>
        )}
      </div>
    </Link>
  );
}

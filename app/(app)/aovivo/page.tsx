"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cabecalho } from "@/components/resenha/cabecalho";
import { CardAposta } from "@/components/resenha/apostas";
import { InstalarApp } from "@/components/resenha/instalar-app";
import { useTurma } from "@/components/resenha/turma-provider";
import { AoVivo, Quedas, Rodape, Selo, Sheet, Titulo, Vazio } from "@/components/resenha/ui";
import { type MesaCompleta, nomeJogador, partidaAtual } from "@/components/resenha/mesa-util";
import { useTela } from "@/lib/api";
import { textoValor, vibrar } from "@/lib/format";
import type { WagerComMesa } from "@/lib/types";

interface Dados {
  mesas: MesaCompleta[];
  apostas: WagerComMesa[];
}

export default function AoVivoPage() {
  const { turma, perfil, itens, rpc, garantirPerfis } = useTurma();
  const router = useRouter();
  const { dados, recarregar } = useTela<Dados>(`/api/tela/aovivo?turma=${turma.id}`, 2500);
  const [criando, setCriando] = useState(false);
  const [nomeNova, setNomeNova] = useState("");
  const mesas = dados?.mesas ?? null;
  const apostas = dados?.apostas ?? [];

  useEffect(() => {
    if (!dados) return;
    garantirPerfis([
      ...dados.mesas.flatMap((m) => [...m.mesa_players.map((p) => p.user_id), m.marcador_id]),
      ...dados.apostas.flatMap((w) => [w.lado_a_user, w.lado_b_user]),
    ]);
  }, [dados, garantirPerfis]);

  async function criarMesa() {
    const id = await rpc<string>("criar_mesa", { p_group: turma.id, p_nome: nomeNova || null });
    if (id) {
      vibrar(30);
      setCriando(false);
      setNomeNova("");
      router.push(`/mesa/${id}`);
    }
  }

  const rolando = mesas?.filter((m) => m.status === "em_jogo").length ?? 0;

  return (
    <>
      <Cabecalho
        titulo="AO VIVO"
        sub={
          mesas
            ? rolando
              ? `${rolando} ${rolando === 1 ? "mesa rolando" : "mesas rolando"} agora · toque pra ver`
              : "Nenhuma partida rolando agora"
            : "…"
        }
      />

      <InstalarApp chave="resenha:instalar-dispensado" className="mb-4" />

      <Button size="lg" className="w-full font-display text-2xl tracking-wider" onClick={() => setCriando(true)}>
        <Plus className="!size-6" /> NOVA MESA
      </Button>

      <div className="mt-4 flex flex-col gap-3">
        {mesas === null && (
          <>
            <div className="h-36 animate-pulse rounded-2xl bg-card" />
            <div className="h-36 animate-pulse rounded-2xl bg-card" />
          </>
        )}
        {mesas?.length === 0 && (
          <Vazio emoji="🃏">
            Nenhuma mesa aberta. Cria uma, senta e chama a galera — quem não for jogar acompanha o placar daqui.
          </Vazio>
        )}
        {mesas?.map((m) => (
          <CardMesa key={m.id} m={m} apostas={apostas.filter((a) => a.mesa_id === m.id).length} perfil={perfil} itens={itens} />
        ))}
      </div>

      <Titulo>🎯 Palpites abertos</Titulo>
      {apostas.length === 0 ? (
        <Vazio emoji="🎯">
          Nada valendo agora. <Link href="/palpites" className="text-neon">Lançar um palpite</Link>
        </Vazio>
      ) : (
        <div className="sem-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {apostas.map((w) => (
            <div key={w.id} className="w-[85%] shrink-0 snap-center">
              <CardAposta w={w} aoMudar={recarregar} />
            </div>
          ))}
        </div>
      )}
      <Rodape />

      <Sheet aberto={criando} aoFechar={() => setCriando(false)} titulo="Nova mesa">
        <p className="mb-3 text-sm text-muted-foreground">
          O número é automático e você começa como <b className="text-foreground">dono da mesa</b> (quem marca os pontos).
          Depois a mesa pode votar em outra pessoa.
        </p>
        <Input placeholder='Nome (opcional), ex.: "Mesa do fundo"' value={nomeNova} maxLength={30} onChange={(e) => setNomeNova(e.target.value)} />
        <Button size="lg" className="mt-4 w-full font-display text-2xl tracking-wider" onClick={criarMesa}>
          ABRIR MESA DE TRUCO 🃏
        </Button>
      </Sheet>
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

  return (
    <Link
      href={`/mesa/${m.id}`}
      className={`block rounded-2xl border bg-card p-4 transition-colors active:bg-accent ${jogando ? "border-neon/30 shadow-[0_0_24px_-8px_hsl(var(--neon)/0.35)]" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className="font-display text-2xl tracking-wide">MESA {m.numero}</span>
        {m.nome && <span className="truncate text-sm text-muted-foreground">· {m.nome}</span>}
        <span className="ml-auto">{jogando ? <AoVivo /> : <Selo cor="ambar">SENTANDO {m.mesa_players.length}/4</Selo>}</span>
      </div>

      {jogando ? (
        <>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="min-w-0 text-right">
              <div className="truncate font-semibold">{p.nome_dupla_a}</div>
              {p.melhor_de_3 && <Quedas n={p.quedas_a} className="justify-end" />}
            </div>
            <div className="font-placar text-5xl tabular-nums leading-none">
              <span key={`a${p.placar_a}`} className="inline-block animate-pulo text-neon brilho-neon">{p.placar_a}</span>
              <span className="mx-1 text-muted-foreground">×</span>
              <span key={`b${p.placar_b}`} className="inline-block animate-pulo text-neon brilho-neon">{p.placar_b}</span>
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{p.nome_dupla_b}</div>
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
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">
          {m.mesa_players.length ? m.mesa_players.map((x) => nomeJogador(x, perfil)).join(", ") : "Mesa vazia — chega mais!"}
        </div>
      )}
      <div className="mt-2 flex items-center gap-3 text-xs">
        {dono && <span className="text-muted-foreground">🎙️ {dono.apelido} marca</span>}
        {apostas > 0 && (
          <span className="font-semibold text-ambar">
            💰 {apostas} {apostas === 1 ? "aposta por fora" : "apostas por fora"}
          </span>
        )}
      </div>
    </Link>
  );
}

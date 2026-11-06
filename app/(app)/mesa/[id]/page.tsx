"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Plus, RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardAposta, NovaAposta } from "@/components/resenha/apostas";
import { Historico, OrdemMesa, Placar, Votacao } from "@/components/resenha/mesa-partes";
import { AjustarOrdem, IniciarPartida, MontarMesa } from "@/components/resenha/montar-mesa";
import { type MesaCompleta, nomeMesa, type Ocupado, partidaAtual, proximoLugar, sugestaoDupla } from "@/components/resenha/mesa-util";
import { useTurma } from "@/components/resenha/turma-provider";
import { AoVivo, Rodape, Selo, Titulo, Vazio } from "@/components/resenha/ui";
import { useTela } from "@/lib/api";
import { textoValor, vibrar } from "@/lib/format";
import type { Debt, TrucoEvent, TrucoMatch, WagerComMesa } from "@/lib/types";

interface Dados {
  mesa: MesaCompleta | null;
  votos: { eleitor_id: string; candidato_id: string }[];
  apostas: WagerComMesa[];
  eventos: TrucoEvent[];
  dividas: Debt[];
  ocupados: Ocupado[];
  proxima: MesaCompleta | null;
}

export default function MesaPage() {
  const { id } = useParams<{ id: string }>();
  const { dados, erro, recarregar } = useTela<Dados>(`/api/tela/mesa?id=${id}`, 2000);
  const { garantirPerfis } = useTurma();

  useEffect(() => {
    if (!dados?.mesa) return;
    garantirPerfis([
      ...dados.mesa.mesa_players.map((p) => p.user_id),
      dados.mesa.marcador_id,
      ...dados.apostas.flatMap((w) => [w.lado_a_user, w.lado_b_user]),
    ]);
  }, [dados, garantirPerfis]);

  if (erro && !dados)
    return (
      <div className="mt-10">
        <Vazio emoji="🤷">
          {erro} <Link href="/aovivo" className="text-neon">Voltar</Link>
        </Vazio>
      </div>
    );
  if (!dados?.mesa) return <div className="mt-10 h-64 animate-pulse rounded-3xl bg-card" />;
  return <Mesa key={dados.mesa.id} dados={dados as Dados & { mesa: MesaCompleta }} recarregar={recarregar} />;
}

function Mesa({ dados, recarregar }: { dados: Dados & { mesa: MesaCompleta }; recarregar: () => void | Promise<void> }) {
  const { euId, isAdmin, perfil } = useTurma();
  const [apostando, setApostando] = useState(false);
  const [local, setLocal] = useState<TrucoMatch | null>(null);
  const { mesa, votos, apostas, eventos, dividas, ocupados, proxima } = dados;

  // placar devolvido pelo toque aparece na hora, antes da próxima atualização
  const doServidor = partidaAtual(mesa);
  const p = local && doServidor && local.id === doServidor.id && local.updated_at > doServidor.updated_at ? local : doServidor;

  const souJogador = mesa.mesa_players.some((x) => x.user_id === euId);
  const souDono = mesa.marcador_id === euId;
  const podeMarcar = souDono || (!mesa.marcador_id && souJogador) || isAdmin;
  const jogando = mesa.status === "em_jogo" && p?.status === "em_jogo";
  const montando = mesa.status === "aberta";
  // a mesa e o placar local podem discordar por um instante: quem decide é a partida
  const acabou = !montando && Boolean(p) && !jogando;

  function atualizarPartida(m?: TrucoMatch) {
    if (m) setLocal(m);
    void recarregar();
  }

  const duplas = p
    ? { a: p.nome_dupla_a, b: p.nome_dupla_b }
    : { a: sugestaoDupla(mesa.mesa_players, "A", perfil), b: sugestaoDupla(mesa.mesa_players, "B", perfil) };

  return (
    <>
      <div className="flex items-center gap-2 pt-2">
        <Link href="/aovivo" className="-ml-2 rounded-full p-2 text-muted-foreground active:bg-accent" aria-label="Voltar">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-4xl leading-none tracking-wide">{nomeMesa(mesa).toUpperCase()}</h1>
        {jogando ? <AoVivo /> : montando ? <Selo cor="ambar">{mesa.mesa_players.length === 4 ? "PRONTA" : `${mesa.mesa_players.length}/4`}</Selo> : <Selo cor="cinza">FIM</Selo>}
      </div>
      {jogando && (
        <div className="mb-3 mt-1 pl-8 text-xs text-muted-foreground">
          {podeMarcar
            ? souDono || souJogador
              ? "🎙️ Você marca os pontos"
              : "🛠 Você é admin: pode corrigir o placar"
            : souJogador
              ? "🎮 Você está jogando"
              : "👀 Você está assistindo ao vivo"}
        </div>
      )}
      {!jogando && <div className="mb-3" />}

      {montando && (
        <>
          <MontarMesa mesa={mesa} ocupados={ocupados} aoMudar={recarregar} />
          <IniciarPartida mesa={mesa} aoMudar={() => void recarregar()} />
        </>
      )}

      {p && !montando && (
        <>
          {acabou && <FimDePartida p={p} mesa={mesa} proxima={proxima} dividas={dividas} />}
          <Placar mesa={mesa} p={p} podeEditar={podeMarcar && jogando} aoAtualizar={atualizarPartida} />
          {jogando && <OrdemMesa players={mesa.mesa_players} carteadorPos={p.carteador_pos} />}
          {jogando && podeMarcar && <AjustarOrdem mesa={mesa} ocupados={ocupados} aoMudar={recarregar} />}
          {jogando && <Votacao mesa={mesa} votos={votos} aoMudar={() => void recarregar()} />}
        </>
      )}

      <Titulo
        direita={
          mesa.status !== "encerrada" && (
            <Button size="sm" variant="ambar" onClick={() => setApostando(true)}>
              <Plus /> Apostar
            </Button>
          )
        }
      >
        💰 Apostas da mesa
      </Titulo>
      <div className="flex flex-col gap-3">
        {apostas.length === 0 && (
          <Vazio emoji="💰">
            Ninguém apostou nessa mesa ainda.
            {montando && <> Aposta agora: depois que a partida começa, não dá pra retirar.</>}
          </Vazio>
        )}
        {apostas.map((w) => (
          <CardAposta key={w.id} w={w} mesa={mesa} mostrarMesa={false} duplas={duplas} aoMudar={() => void recarregar()} />
        ))}
      </div>

      {p && eventos.length > 0 && (
        <>
          <Titulo>📜 Últimas jogadas</Titulo>
          <Historico eventos={eventos} p={p} />
        </>
      )}

      <Rodape />

      <NovaAposta
        key={`${p?.id ?? "sem-partida"}:${duplas.a}:${duplas.b}`}
        aberto={apostando}
        aoFechar={() => setApostando(false)}
        mesa={{
          id: mesa.id,
          numero: mesa.numero,
          nome: mesa.nome,
          marcador_id: mesa.marcador_id,
          status: mesa.status,
          nomeA: duplas.a,
          nomeB: duplas.b,
        }}
        aoCriar={() => void recarregar()}
      />
    </>
  );
}

const NAIPES = ["♠", "♥", "♦", "♣"];

/** Resultado, com revanche em um toque e o caminho pra trocar os jogadores. */
function FimDePartida({ p, mesa, proxima, dividas }: { p: TrucoMatch; mesa: MesaCompleta; proxima: MesaCompleta | null; dividas: Debt[] }) {
  const router = useRouter();
  const { itens, nome, rpc } = useTurma();
  const [ocupado, setOcupado] = useState(false);

  // a mesa volta vazia: a revanche só aparece enquanto ninguém sentou nela
  const podeRevanche = proxima?.status === "aberta" && proxima.mesa_players.length === 0 && mesa.mesa_players.length > 0;

  async function revanche() {
    if (!proxima || ocupado) return;
    setOcupado(true);
    const lugar = (pos: number) => mesa.mesa_players.find((x) => x.posicao === pos)?.user_id ?? null;
    const sentou = await rpc("definir_assentos", { p_mesa: proxima.id, p_0: lugar(0), p_1: lugar(1), p_2: lugar(2), p_3: lugar(3) });
    const r =
      sentou === undefined
        ? undefined
        : await rpc("iniciar_partida", {
            p_mesa: proxima.id,
            p_nome_a: p.nome_dupla_a,
            p_nome_b: p.nome_dupla_b,
            p_unidade: p.valendo_unidade,
            p_item: p.valendo_item_id,
            p_qtd: p.valendo_qtd,
            p_carteador: proximoLugar(mesa.mesa_players, p.carteador_pos),
            p_pontos_alvo: p.pontos_alvo,
            p_melhor_de_3: p.melhor_de_3,
          });
    setOcupado(false);
    if (r !== undefined) {
      vibrar([30, 50, 30]);
      router.replace(`/mesa/${proxima.id}`);
    }
  }

  return (
    <div className="relative mb-3 overflow-hidden rounded-3xl border border-neon/40 bg-neon/10 p-4 text-center">
      {p.vencedor && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {Array.from({ length: 14 }, (_, i) => (
            <span
              key={i}
              className={`absolute top-0 animate-cair text-xl ${i % 2 ? "text-alerta" : "text-neon"}`}
              style={{ left: `${4 + i * 7}%`, animationDelay: `${(i % 5) * 0.18}s` }}
            >
              {NAIPES[i % 4]}
            </span>
          ))}
        </div>
      )}
      {p.vencedor ? (
        <>
          <div className="text-4xl">🏆</div>
          <div className="font-display text-4xl leading-none tracking-wide text-neon brilho-neon">
            {(p.vencedor === "A" ? p.nome_dupla_a : p.nome_dupla_b).toUpperCase()} VENCEU!
          </div>
        </>
      ) : (
        <div className="font-display text-3xl tracking-wide text-muted-foreground">PARTIDA ANULADA</div>
      )}
      {dividas.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {dividas.map((d) => (
            <li key={d.id}>
              {nome(d.devedor_id)} deve <b className="text-ambar">{textoValor(d, itens)}</b> pra {nome(d.credor_id)}
            </li>
          ))}
        </ul>
      )}
      {proxima && (
        <div className="relative mt-4 flex flex-col gap-2">
          <Button asChild size="lg" className="h-14 w-full font-display text-2xl tracking-wider">
            <Link href={`/mesa/${proxima.id}`} replace>
              <Users className="!size-5" /> {proxima.status === "em_jogo" ? `VER A MESA ${proxima.numero} AO VIVO` : "PRÓXIMA PARTIDA"}
            </Link>
          </Button>
          {podeRevanche && (
            <Button size="lg" variant="outline" className="w-full" disabled={ocupado} onClick={revanche}>
              <RotateCcw /> Revanche: mesmos jogadores
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

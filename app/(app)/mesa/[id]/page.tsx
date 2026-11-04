"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardAposta, NovaAposta } from "@/components/resenha/apostas";
import { Assentos, Historico, IniciarPartida, OrdemMesa, Placar, Votacao, useOrganiza } from "@/components/resenha/mesa-partes";
import { type MesaCompleta, nomeMesa, partidaAtual } from "@/components/resenha/mesa-util";
import { useTurma } from "@/components/resenha/turma-provider";
import { AoVivo, Rodape, Selo, Titulo, Vazio } from "@/components/resenha/ui";
import { useTela } from "@/lib/api";
import { textoValor } from "@/lib/format";
import type { Debt, TrucoEvent, TrucoMatch, WagerComMesa } from "@/lib/types";

interface Dados {
  mesa: MesaCompleta | null;
  votos: { eleitor_id: string; candidato_id: string }[];
  apostas: WagerComMesa[];
  eventos: TrucoEvent[];
  dividas: Debt[];
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
  return <Mesa dados={dados as Dados & { mesa: MesaCompleta }} recarregar={recarregar} />;
}

function Mesa({ dados, recarregar }: { dados: Dados & { mesa: MesaCompleta }; recarregar: () => void }) {
  const router = useRouter();
  const { euId, isAdmin, itens, nome, rpc } = useTurma();
  const [apostando, setApostando] = useState(false);
  const [local, setLocal] = useState<TrucoMatch | null>(null);
  const { mesa, votos, apostas, eventos, dividas } = dados;
  const organiza = useOrganiza(mesa);

  // placar devolvido pelo toque aparece na hora, antes da próxima atualização
  const doServidor = partidaAtual(mesa);
  const p = local && doServidor && local.id === doServidor.id && local.updated_at > doServidor.updated_at ? local : doServidor;

  const souJogador = mesa.mesa_players.some((x) => x.user_id === euId);
  const souDono = mesa.marcador_id === euId;
  const podeMarcar = souDono || (!mesa.marcador_id && souJogador) || isAdmin;
  const jogando = mesa.status === "em_jogo" && p?.status === "em_jogo";
  const podeFechar = mesa.status === "aberta" ? souJogador || organiza : mesa.status === "em_jogo" && isAdmin;

  function atualizarPartida(m?: TrucoMatch) {
    if (m) setLocal(m);
    recarregar();
  }

  async function fecharMesa() {
    const msg = jogando ? "Anular a partida e fechar a mesa? Ninguém deve nada." : "Fechar essa mesa?";
    if (!confirm(msg)) return;
    if ((await rpc("encerrar_mesa", { p_mesa: mesa.id })) !== undefined) router.push("/aovivo");
  }

  return (
    <>
      <div className="flex items-center gap-2 pt-2">
        <Link href="/aovivo" className="-ml-2 rounded-full p-2 text-muted-foreground" aria-label="Voltar">
          <ChevronLeft className="size-6" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-4xl leading-none tracking-wide">{nomeMesa(mesa).toUpperCase()}</h1>
        </div>
        {jogando ? <AoVivo /> : mesa.status === "aberta" ? <Selo cor="ambar">SENTANDO</Selo> : <Selo cor="cinza">ENCERRADA</Selo>}
      </div>
      <div className="mb-4 mt-1 pl-8 text-xs text-muted-foreground">
        {souDono
          ? "🎙️ Você é o dono da mesa: você marca os pontos"
          : podeMarcar
            ? isAdmin && !souJogador
              ? "🛠 Você é admin: pode corrigir o placar"
              : "🎮 Você está jogando e pode marcar"
            : souJogador
              ? "🎮 Você está jogando — quem marca é o dono da mesa"
              : "👀 Você está assistindo ao vivo"}
      </div>

      {mesa.status === "aberta" && (
        <>
          <Assentos mesa={mesa} aoMudar={recarregar} />
          <Votacao mesa={mesa} votos={votos} aoMudar={recarregar} />
          {podeMarcar ? (
            <IniciarPartida mesa={mesa} aoMudar={recarregar} />
          ) : (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {souJogador
                ? "Quando estiver todo mundo sentado, o dono da mesa começa a partida."
                : "Escolhe um lugar pra jogar, ou só assiste — o placar aparece aqui quando começar."}
            </p>
          )}
        </>
      )}

      {p && mesa.status !== "aberta" && (
        <>
          {p.status !== "em_jogo" && (
            <div className="mb-3 rounded-3xl border border-neon/40 bg-neon/10 p-4 text-center">
              {p.vencedor ? (
                <>
                  <div className="text-4xl">🏆</div>
                  <div className="font-display text-4xl tracking-wide text-neon brilho-neon">
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
            </div>
          )}
          <Placar mesa={mesa} p={p} podeEditar={podeMarcar && jogando} aoAtualizar={atualizarPartida} />
          {jogando && <OrdemMesa players={mesa.mesa_players} carteadorPos={p.carteador_pos} />}
          {jogando && <Votacao mesa={mesa} votos={votos} aoMudar={recarregar} />}
          {isAdmin && jogando && (
            <details className="mt-3 rounded-2xl border bg-card p-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">🛠 Admin: trocar jogadores</summary>
              <div className="mt-3">
                <Assentos mesa={mesa} aoMudar={recarregar} />
              </div>
            </details>
          )}
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
            {mesa.status === "aberta" && <> Aposta agora: depois que a partida começa, não dá pra retirar.</>}
          </Vazio>
        )}
        {apostas.map((w) => (
          <CardAposta
            key={w.id}
            w={w}
            mesa={mesa}
            mostrarMesa={false}
            duplas={p ? { a: p.nome_dupla_a, b: p.nome_dupla_b } : undefined}
            aoMudar={recarregar}
          />
        ))}
      </div>

      {p && eventos.length > 0 && (
        <>
          <Titulo>📜 Últimas jogadas</Titulo>
          <Historico eventos={eventos} p={p} />
        </>
      )}

      {podeFechar && (
        <Button variant="ghost" className="mt-6 w-full text-muted-foreground" onClick={fecharMesa}>
          {jogando ? "🛠 Fechar mesa abandonada (anula a partida)" : "Fechar mesa"}
        </Button>
      )}

      <Rodape />

      <NovaAposta
        key={p?.id ?? "sem-partida"}
        aberto={apostando}
        aoFechar={() => setApostando(false)}
        mesa={{
          id: mesa.id,
          numero: mesa.numero,
          nome: mesa.nome,
          marcador_id: mesa.marcador_id,
          status: mesa.status,
          nomeA: p?.nome_dupla_a ?? "Dupla A",
          nomeB: p?.nome_dupla_b ?? "Dupla B",
        }}
        aoCriar={recarregar}
      />
    </>
  );
}

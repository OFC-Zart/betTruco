"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/resenha/cabecalho";
import { AcoesMembro, AdicionarMembro, ListaMembros } from "@/components/resenha/membros";
import { type MesaCompleta, nomeJogador, nomeMesa, partidaAtual } from "@/components/resenha/mesa-util";
import { useTurma } from "@/components/resenha/turma-provider";
import { useToast } from "@/components/resenha/toast";
import { Chips, Rodape, Selo, Titulo, Vazio } from "@/components/resenha/ui";
import { useTela } from "@/lib/api";
import { aberto } from "@/lib/acertos";
import { tempoAtras, textoValor, vibrar } from "@/lib/format";
import type { Debt, Member, WagerComMesa } from "@/lib/types";

interface Dados {
  dividas: Debt[];
  apostas: WagerComMesa[];
  mesas: MesaCompleta[];
}

type Secao = "dividas" | "apostas" | "mesas" | "pessoas";

const STATUS_APOSTA: Record<WagerComMesa["status"], string> = {
  aberto: "aberta",
  valendo: "valendo",
  aguardando: "esperando confirmar",
  resolvido: "resolvida",
  empate: "anulada",
  cancelado: "cancelada",
};

export default function AdminPage() {
  const { isAdmin } = useTurma();
  if (!isAdmin) {
    return (
      <>
        <Cabecalho titulo="ADMIN" />
        <Vazio emoji="🔒">Só admin entra aqui.</Vazio>
      </>
    );
  }
  return <Painel />;
}

function Painel() {
  const { turma, membros, euId, isAdmin, itens, nome, perfil, rpc, possoAgirPor, garantirPerfis, recarregar: recarregarTurma } = useTurma();
  const router = useRouter();
  const toast = useToast();
  const { dados, recarregar } = useTela<Dados>(`/api/tela/admin?turma=${turma.id}`, 5000);
  const [secao, setSecao] = useState<Secao>("dividas");
  const [pessoa, setPessoa] = useState("todos");
  const [aberta, setAberta] = useState<Member | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!dados) return;
    garantirPerfis([
      ...dados.dividas.flatMap((d) => [d.devedor_id, d.credor_id]),
      ...dados.apostas.flatMap((w) => [w.lado_a_user, w.lado_b_user]),
    ]);
  }, [dados, garantirPerfis]);

  async function acao(fn: string, args: Record<string, unknown>, ok: string) {
    setOcupado(true);
    const r = await rpc(fn, args);
    setOcupado(false);
    if (r !== undefined) {
      vibrar(30);
      toast(ok, "ok");
      recarregar();
    }
  }

  const daPessoa = (ids: (string | null)[]) => pessoa === "todos" || ids.includes(pessoa);
  const dividas = (dados?.dividas ?? []).filter((d) => daPessoa([d.devedor_id, d.credor_id]));
  const pendentes = dividas.filter((d) => aberto(d) > 0);
  const apostas = (dados?.apostas ?? []).filter((w) => daPessoa([w.lado_a_user, w.lado_b_user]));
  const mesas = dados?.mesas ?? [];
  const pendentesTotal = (dados?.dividas ?? []).filter((d) => aberto(d) > 0).length;

  return (
    <>
      <Cabecalho titulo="ADMIN" sub="Só admin vê esta aba" />

      <div className="grid grid-cols-4 gap-2 text-center">
        <Numero n={membros.length} rotulo="pessoas" />
        <Numero n={mesas.filter((m) => m.status !== "encerrada").length} rotulo="mesas" />
        <Numero n={(dados?.apostas ?? []).filter((w) => ["aberto", "valendo", "aguardando"].includes(w.status)).length} rotulo="apostas ativas" />
        <Numero n={pendentesTotal} rotulo="dívidas pendentes" alerta />
      </div>

      <Chips
        className="mt-4"
        valor={secao}
        aoMudar={setSecao}
        opcoes={[
          { id: "dividas", label: "💸 Dívidas" },
          { id: "apostas", label: "🎯 Apostas" },
          { id: "mesas", label: "🃏 Mesas" },
          { id: "pessoas", label: "👥 Pessoas" },
        ]}
      />

      {(secao === "dividas" || secao === "apostas") && (
        <Chips
          className="mt-2"
          valor={pessoa}
          aoMudar={setPessoa}
          opcoes={[
            { id: "todos", label: "Todo mundo" },
            ...membros.map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` })),
          ]}
        />
      )}

      {!dados && <div className="mt-4 h-40 animate-pulse rounded-2xl bg-card" />}

      {dados && secao === "dividas" && (
        <>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <b className="text-foreground">Quitar</b> marca como pago e fica no histórico. <b className="text-foreground">Apagar</b> some
            de vez — se a dívida veio de uma aposta, a aposta some junto.
          </p>
          {pessoa === "todos" && dividas.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={ocupado || pendentes.length === 0}
                onClick={() =>
                  confirm(`Quitar as ${pendentes.length} dívidas pendentes? Elas ficam no histórico como quitadas.`) &&
                  acao("admin_quitar_dividas", { p_group: turma.id }, "Tudo quitado ✔")
                }
              >
                Quitar todas ({pendentes.length})
              </Button>
              <Button
                variant="destructive"
                disabled={ocupado}
                onClick={() =>
                  confirm(`Apagar as ${dividas.length} dívidas (e as apostas que geraram elas)? Não dá pra desfazer.`) &&
                  acao("admin_apagar_dividas", { p_group: turma.id }, "Dívidas apagadas")
                }
              >
                <Trash2 /> Apagar todas
              </Button>
            </div>
          )}
          <ul className="mt-3 flex flex-col divide-y rounded-2xl border bg-card">
            {dividas.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma dívida.</li>}
            {dividas.map((d) => {
              const resto = aberto(d);
              return (
                <li key={d.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{nome(d.devedor_id)}</b> → <b>{nome(d.credor_id)}</b> <span className="text-ambar">{textoValor(d, itens)}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {d.origem_tipo === "truco" ? "🃏 Truco" : "🎯 Aposta"} · {tempoAtras(d.created_at)} ·{" "}
                      <span className={resto === 0 ? "text-neon" : "text-alerta"}>
                        {resto === 0 ? (d.zerada ? "quitada (admin)" : "quitada") : "pendente"}
                      </span>
                    </span>
                  </span>
                  {resto > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupado}
                      onClick={() => acao("admin_quitar_dividas", { p_group: turma.id, p_divida: d.id }, "Quitada ✔")}
                    >
                      Quitar
                    </Button>
                  )}
                  <BotaoApagar
                    disabled={ocupado}
                    rotulo="Apagar dívida"
                    pergunta={
                      d.origem_tipo === "wager"
                        ? "Apagar essa dívida? A aposta que gerou ela some junto."
                        : "Apagar essa dívida? (a partida continua no histórico)"
                    }
                    aoConfirmar={() => acao("admin_apagar_dividas", { p_group: turma.id, p_divida: d.id }, "Dívida apagada")}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {dados && secao === "apostas" && (
        <ul className="mt-3 flex flex-col divide-y rounded-2xl border bg-card">
          {apostas.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma aposta.</li>}
          {apostas.map((w) => (
            <li key={w.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <b>{nome(w.lado_a_user)}</b>:{" "}
                {w.tipo === "dupla_vence"
                  ? `dupla ${w.alvo_dupla} ganha${w.mesas ? ` (Mesa ${w.mesas.numero})` : ""}`
                  : `“${w.texto}”`}
                <span className="block text-[11px] text-muted-foreground">
                  <span className="text-ambar">{textoValor(w, itens)}</span> · vs {w.lado_b_user ? nome(w.lado_b_user) : "ninguém"} ·{" "}
                  {STATUS_APOSTA[w.status]} · {tempoAtras(w.created_at)}
                </span>
              </span>
              <BotaoApagar
                disabled={ocupado}
                rotulo="Apagar aposta"
                pergunta="Apagar essa aposta? Se ela gerou dívida, a dívida some junto."
                aoConfirmar={() => acao("admin_apagar_aposta", { p_wager: w.id }, "Aposta apagada")}
              />
            </li>
          ))}
        </ul>
      )}

      {dados && secao === "mesas" && (
        <>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          As mesas ficam sempre abertas: quando a partida acaba, a mesa volta sozinha. Daqui você adiciona, remove e apaga partidas antigas.
        </p>
        <Button className="mt-3 w-full" variant="ambar" disabled={ocupado} onClick={() => acao("criar_mesa", { p_group: turma.id }, "Mesa adicionada")}>
          Adicionar mesa
        </Button>
        <ul className="mt-3 flex flex-col divide-y rounded-2xl border bg-card">
          {mesas.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nenhuma mesa.</li>}
          {mesas.map((m) => {
            const p = partidaAtual(m);
            return (
              <li key={m.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <Link href={`/mesa/${m.id}`} className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <b className="truncate">{nomeMesa(m)}</b>
                    {m.status === "em_jogo" ? (
                      <Selo>AO VIVO</Selo>
                    ) : m.status === "aberta" ? (
                      <Selo cor="ambar">FIXA</Selo>
                    ) : (
                      <Selo cor="cinza">PARTIDA ANTIGA</Selo>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {p ? `${p.nome_dupla_a} ${p.placar_a} × ${p.placar_b} ${p.nome_dupla_b} · ` : ""}
                    {m.mesa_players.map((x) => nomeJogador(x, perfil)).join(", ") || "sem jogadores"} · {tempoAtras(m.created_at)}
                  </span>
                </Link>
                {m.status !== "encerrada" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado}
                    onClick={() =>
                      confirm(m.status === "em_jogo" ? "Remover a mesa e anular a partida? Ninguém deve nada." : "Remover essa mesa da turma?") &&
                      acao("encerrar_mesa", { p_mesa: m.id }, "Mesa removida")
                    }
                  >
                    Remover
                  </Button>
                )}
                {m.status === "encerrada" && (
                  <BotaoApagar
                    disabled={ocupado}
                    rotulo="Apagar partida"
                    pergunta="Apagar essa partida? Somem as jogadas, as apostas ligadas a ela e as dívidas que ela gerou."
                    aoConfirmar={() => acao("admin_apagar_mesa", { p_mesa: m.id }, "Partida apagada")}
                  />
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}

      {secao === "pessoas" && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">
            Toque numa pessoa pra tornar/tirar admin, gerar senha provisória, criar login de visitante ou remover da turma.
          </p>
          <div className="mt-3">
            <ListaMembros lista={membros} euId={euId} aoAbrir={setAberta} />
          </div>
          <AdicionarMembro />
          <p className="mt-2 text-xs text-muted-foreground">
            Quem ainda não tem conta entra pelo link de convite (Turma → Membros).
          </p>
          {aberta && (
            <AcoesMembro
              m={aberta}
              podeCuidar={possoAgirPor(aberta.user_id)}
              isAdmin={isAdmin}
              euId={euId}
              aoFechar={() => setAberta(null)}
            />
          )}
        </>
      )}

      <Titulo>🧨 Zona de perigo</Titulo>
      <div className="rounded-2xl border border-alerta/40 bg-alerta/5 p-4">
        <p className="text-sm">
          <b>Limpar todo o histórico:</b> apaga todas as partidas, apostas e dívidas, e as mesas ficam vazias. As pessoas, os itens e as configurações
          continuam. Bom pra apagar os testes antes de começar pra valer.
        </p>
        <Button
          variant="destructive"
          className="mt-3 w-full"
          disabled={ocupado}
          onClick={() =>
            confirm("Apagar TODO o histórico da turma (partidas, apostas e dívidas)?") &&
            confirm("Certeza? Não dá pra desfazer e some pra todo mundo.") &&
            acao("admin_limpar_historico", { p_group: turma.id }, "Histórico limpo 🧹")
          }
        >
          <Trash2 /> Limpar todo o histórico
        </Button>
        <p className="mt-5 text-sm">
          <b>Apagar a turma “{turma.nome}”:</b> some a turma inteira (mesas, apostas, dívidas, itens e a lista de membros). As
          contas das pessoas continuam e elas seguem nas outras turmas.
        </p>
        <Button
          variant="destructive"
          className="mt-3 w-full"
          disabled={ocupado}
          onClick={async () => {
            if (!confirm(`Apagar a turma "${turma.nome}" inteira?`)) return;
            if (!confirm("Certeza? Não dá pra desfazer e some pra todo mundo da turma.")) return;
            setOcupado(true);
            const r = await rpc("admin_apagar_turma", { p_group: turma.id });
            setOcupado(false);
            if (r !== undefined) {
              toast("Turma apagada", "ok");
              try {
                localStorage.removeItem("resenha:turma");
              } catch {}
              await recarregarTurma();
              router.replace("/aovivo");
            }
          }}
        >
          <Trash2 /> Apagar esta turma
        </Button>
      </div>
      <Rodape />
    </>
  );
}

function Numero({ n, rotulo, alerta }: { n: number; rotulo: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl border bg-card px-1 py-2">
      <div className={`font-placar text-2xl leading-none ${alerta && n > 0 ? "text-alerta" : "text-neon"}`}>{n}</div>
      <div className="mt-1 text-[10px] leading-tight text-muted-foreground">{rotulo}</div>
    </div>
  );
}

function BotaoApagar({
  rotulo,
  pergunta,
  disabled,
  aoConfirmar,
}: {
  rotulo: string;
  pergunta: string;
  disabled?: boolean;
  aoConfirmar: () => void;
}) {
  return (
    <Button size="sm" variant="ghost" aria-label={rotulo} disabled={disabled} onClick={() => confirm(pergunta) && aoConfirmar()}>
      <Trash2 className="text-alerta" />
    </Button>
  );
}

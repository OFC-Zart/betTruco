"use client";

import { useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/resenha/cabecalho";
import { useTurma } from "@/components/resenha/turma-provider";
import { useToast } from "@/components/resenha/toast";
import { Avatar, Chips, Rodape, Sheet, Stepper, Vazio } from "@/components/resenha/ui";
import { useTela } from "@/lib/api";
import { aberto, paresPendentes, pendenciasCom, somaPares, totais } from "@/lib/acertos";
import { juntarLista, numeroWhats, reais, tempoAtras, textoValor, vibrar } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Debt, Valor } from "@/lib/types";

type Filtro = "pendentes" | "quitados" | "tudo";
const TODOS = "turma";

export default function AcertosPage() {
  const { turma, euId, itens, nome, perfil, membros, rpc, visitantesQueCuido, possoAgirPor } = useTurma();
  const toast = useToast();
  const { dados, recarregar } = useTela<{ dividas: Debt[] }>(`/api/tela/acertos?turma=${turma.id}`, 5000);
  const dividas = dados?.dividas ?? null;
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [pessoa, setPessoa] = useState<string>("todos");
  const [recebendo, setRecebendo] = useState<{ devedor: string; credor: string } | null>(null);
  // de quem estou vendo os acertos: a turma toda, eu, ou um visitante que eu cuido
  const [dono, setDono] = useState<string>(euId);
  const cuidados = visitantesQueCuido();
  const verTodos = dono === TODOS;
  const souEu = dono === euId;
  const nomeDono = souEu ? "Você" : (perfil(dono)?.apelido ?? "");

  const pendencias = useMemo(() => pendenciasCom(dividas ?? [], dono), [dividas, dono]);
  const tot = useMemo(() => totais(pendencias), [pendencias]);
  const pares = useMemo(() => paresPendentes(dividas ?? []), [dividas]);
  const paresVisiveis = pares.filter((x) => pessoa === "todos" || x.devedor === pessoa || x.credor === pessoa);
  const totalTurma = useMemo(() => somaPares(paresVisiveis), [paresVisiveis]);

  const txt = (vs: Valor[]) => juntarLista(vs.map((v) => textoValor({ ...v, quantidade: Math.abs(v.quantidade) }, itens)));
  const fichasEmReais = (vs: Valor[]) => {
    const f = vs.find((v) => v.unidade === "fichas");
    return f && turma.valor_ficha_centavos ? ` (≈ ${reais(Math.abs(f.quantidade) * turma.valor_ficha_centavos)})` : "";
  };

  function cobrar(outro: string, devendo: Valor[], credor: string = dono) {
    const p = perfil(outro);
    const quem = credor === euId ? "me" : `pro ${perfil(credor)?.apelido ?? ""}`;
    const msg =
      `Fala, ${p?.apelido ?? ""}! 🍻 Pelo Placar da Resenha (${turma.nome}) você tá devendo ${quem} ${txt(devendo)}. ` +
      `Bora acertar na próxima? 😅`;
    window.open(`https://wa.me/${numeroWhats(p?.whatsapp ?? null)}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  const pessoas = [...pendencias.keys()].filter((p) => pessoa === "todos" || p === pessoa);
  const registros = (dividas ?? []).filter(
    (d) =>
      (verTodos || d.devedor_id === dono || d.credor_id === dono) &&
      (pessoa === "todos" || d.devedor_id === pessoa || d.credor_id === pessoa) &&
      (filtro === "tudo" || (filtro === "quitados" ? aberto(d) === 0 : aberto(d) > 0)),
  );

  return (
    <>
      <Cabecalho titulo="ACERTOS" sub="Quem deve o quê pra quem" />

      <div className="mb-3">
        <Chips
          valor={dono}
          aoMudar={(v) => {
            setDono(v);
            setPessoa("todos");
          }}
          opcoes={[
            { id: euId, label: "🙋 Os meus" },
            { id: TODOS, label: "👥 Todos da turma" },
            ...cuidados.map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` })),
          ]}
        />
      </div>

      {verTodos ? (
        <div className="rounded-2xl border border-ambar/30 bg-ambar/5 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-ambar">
            {pessoa === "todos" ? "Em aberto na turma" : `Em aberto com ${perfil(pessoa)?.apelido ?? ""}`}
          </div>
          <Totais vs={totalTurma} itens={itens} cor="text-ambar" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-neon/30 bg-neon/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-neon">{souEu ? "Tenho" : "Tem"} a receber</div>
            <Totais vs={tot.receber} itens={itens} cor="text-neon" />
          </div>
          <div className="rounded-2xl border border-alerta/30 bg-alerta/5 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-alerta">{souEu ? "Tenho" : "Tem"} a pagar</div>
            <Totais vs={tot.pagar} itens={itens} cor="text-alerta" />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <Chips
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { id: "pendentes", label: "Pendentes" },
            { id: "quitados", label: "Quitados" },
            { id: "tudo", label: "Tudo" },
          ]}
        />
        <Chips
          valor={pessoa}
          aoMudar={setPessoa}
          opcoes={[
            { id: "todos", label: verTodos ? "Todo mundo" : "Com qualquer pessoa" },
            ...membros.filter((m) => m.user_id !== dono).map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` })),
          ]}
        />
      </div>

      {dividas === null && <div className="mt-4 h-32 animate-pulse rounded-2xl bg-card" />}

      {dividas && filtro === "pendentes" && verTodos && (
        <div className="mt-4 flex flex-col gap-3">
          {paresVisiveis.length === 0 && <Vazio emoji="🤝">Ninguém devendo nada. Que turma honesta!</Vazio>}
          {paresVisiveis.map((x) => {
            const posso = possoAgirPor(x.credor);
            return (
              <div key={`${x.devedor}>${x.credor}`} className="rounded-2xl border bg-card p-3">
                <div className="flex items-center gap-3">
                  <span className="flex shrink-0 -space-x-2">
                    <Avatar p={perfil(x.devedor)} />
                    <Avatar p={perfil(x.credor)} />
                  </span>
                  <div className="min-w-0 flex-1 text-sm leading-snug">
                    <b>{nome(x.devedor)}</b> deve <b className="text-ambar">{txt(x.valores)}</b> pra <b>{nome(x.credor)}</b>
                    <span className="text-xs text-muted-foreground">{fichasEmReais(x.valores)}</span>
                  </div>
                </div>
                {posso && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button onClick={() => setRecebendo({ devedor: x.devedor, credor: x.credor })}>Recebi</Button>
                    <Button variant="outline" onClick={() => cobrar(x.devedor, x.valores, x.credor)}>
                      <MessageCircle /> Cobrar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dividas && filtro === "pendentes" && !verTodos && (
        <div className="mt-4 flex flex-col gap-3">
          {pessoas.length === 0 && <Vazio emoji="🤝">Tudo acertado por aqui. Que turma honesta!</Vazio>}
          {pessoas.map((outro) => {
            const vs = [...pendencias.get(outro)!.values()];
            const meDeve = vs.filter((v) => v.quantidade > 0);
            const devo = vs.filter((v) => v.quantidade < 0);
            const apelido = perfil(outro)?.apelido ?? "Alguém";
            return (
              <div key={outro} className="rounded-2xl border bg-card p-3">
                <div className="flex items-center gap-3">
                  <Avatar p={perfil(outro)} />
                  <div className="min-w-0 flex-1 text-sm leading-snug">
                    {meDeve.length > 0 && (
                      <div>
                        <b>{apelido}</b> {souEu ? "te deve" : `deve pro ${nomeDono}`} <b className="text-neon">{txt(meDeve)}</b>
                        <span className="text-xs text-muted-foreground">{fichasEmReais(meDeve)}</span>
                      </div>
                    )}
                    {devo.length > 0 && (
                      <div>
                        {souEu ? "Você deve" : `${nomeDono} deve`} <b className="text-alerta">{txt(devo)}</b> pro <b>{apelido}</b>
                        <span className="text-xs text-muted-foreground">{fichasEmReais(devo)}</span>
                      </div>
                    )}
                  </div>
                </div>
                {meDeve.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button onClick={() => setRecebendo({ devedor: outro, credor: dono })}>Recebi</Button>
                    <Button variant="outline" onClick={() => cobrar(outro, meDeve)}>
                      <MessageCircle /> Cobrar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {dividas && filtro !== "pendentes" && (
        <ul className="mt-4 flex flex-col divide-y rounded-2xl border bg-card">
          {registros.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">Nada por aqui.</li>}
          {registros.map((d) => {
            const resto = aberto(d);
            return (
              <li key={d.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <b>{nome(d.devedor_id)}</b> → <b>{nome(d.credor_id)}</b> <span className="text-ambar">{textoValor(d, itens)}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {d.origem_tipo === "truco" ? "🃏 Truco" : "🎯 Aposta"} · {tempoAtras(d.created_at)}
                    {d.quitado_qtd > 0 && resto > 0 && ` · pago ${d.quitado_qtd} de ${d.quantidade}`}
                  </span>
                </span>
                <span className={cn("text-xs font-semibold", resto === 0 ? "text-neon" : "text-alerta")}>{resto === 0 ? (d.zerada ? "✔ quitada (admin)" : "✔ quitado") : "pendente"}</span>
              </li>
            );
          })}
        </ul>
      )}

      <Rodape />

      {recebendo && (
        <Receber
          outro={recebendo.devedor}
          valores={pares.find((x) => x.devedor === recebendo.devedor && x.credor === recebendo.credor)?.valores ?? []}
          aoFechar={() => setRecebendo(null)}
          aoReceber={async (v, q) => {
            const r = await rpc("receber", {
              p_group: turma.id,
              p_devedor: recebendo.devedor,
              p_unidade: v.unidade,
              p_item: v.item_id,
              p_qtd: q,
              p_credor: recebendo.credor === euId ? null : recebendo.credor,
            });
            if (r !== undefined) {
              vibrar(30);
              toast("Anotado ✔", "ok");
              recarregar();
            }
          }}
        />
      )}
    </>
  );
}

function Totais({ vs, itens, cor }: { vs: Valor[]; itens: ReturnType<typeof useTurma>["itens"]; cor: string }) {
  if (!vs.length) return <div className="mt-2 font-placar text-2xl text-muted-foreground">0</div>;
  return (
    <ul className="mt-1 space-y-0.5">
      {vs.map((v) => (
        <li key={v.unidade + v.item_id} className={cn("font-placar text-xl leading-tight", cor)}>
          {textoValor(v, itens, true)}
        </li>
      ))}
    </ul>
  );
}

function Receber({
  outro,
  valores,
  aoFechar,
  aoReceber,
}: {
  outro: string;
  valores: Valor[];
  aoFechar: () => void;
  aoReceber: (v: Valor, qtd: number) => Promise<void>;
}) {
  const { perfil, itens } = useTurma();
  const [qtds, setQtds] = useState<Record<string, number>>(() =>
    Object.fromEntries(valores.map((v) => [v.unidade + v.item_id, v.quantidade])),
  );
  return (
    <Sheet aberto aoFechar={aoFechar} titulo={`Recebi do ${perfil(outro)?.apelido ?? ""}`}>
      <p className="mb-3 text-sm text-muted-foreground">Pode marcar só uma parte. Só quem recebe marca.</p>
      <div className="flex flex-col gap-3">
        {valores.map((v) => {
          const k = v.unidade + v.item_id;
          return (
            <div key={k} className="flex items-center gap-2 rounded-2xl border bg-black/20 p-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{textoValor(v, itens)}</div>
                <div className="text-xs text-muted-foreground">em aberto</div>
              </div>
              <Stepper valor={qtds[k]} max={v.quantidade} aoMudar={(n) => setQtds({ ...qtds, [k]: n })} />
              <Button
                onClick={async () => {
                  await aoReceber(v, qtds[k]);
                  aoFechar();
                }}
              >
                OK
              </Button>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

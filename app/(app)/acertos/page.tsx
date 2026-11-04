"use client";

import { useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/resenha/cabecalho";
import { useTurma } from "@/components/resenha/turma-provider";
import { useToast } from "@/components/resenha/toast";
import { Avatar, Chips, Rodape, Sheet, Stepper, Titulo, Vazio } from "@/components/resenha/ui";
import { useTela } from "@/lib/api";
import { aberto, saldosComigo, simplificarTurma, totais } from "@/lib/acertos";
import { juntarLista, numeroWhats, reais, tempoAtras, textoValor, vibrar } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Debt, Valor } from "@/lib/types";

type Filtro = "pendentes" | "quitados" | "tudo";

export default function AcertosPage() {
  const { turma, euId, itens, nome, perfil, membros, rpc, visitantesQueCuido } = useTurma();
  const toast = useToast();
  const { dados, recarregar } = useTela<{ dividas: Debt[] }>(`/api/tela/acertos?turma=${turma.id}`, 5000);
  const dividas = dados?.dividas ?? null;
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [pessoa, setPessoa] = useState<string>("todos");
  const [recebendo, setRecebendo] = useState<string | null>(null);
  // de quem estou vendo os acertos: eu, ou um visitante que eu cuido
  const [dono, setDono] = useState<string>(euId);
  const cuidados = visitantesQueCuido();
  const souEu = dono === euId;
  const nomeDono = souEu ? "Você" : (perfil(dono)?.apelido ?? "");

  const saldos = useMemo(() => saldosComigo(dividas ?? [], dono), [dividas, dono]);
  const tot = useMemo(() => totais(saldos), [saldos]);
  const simplificado = useMemo(() => simplificarTurma(dividas ?? []), [dividas]);

  const txt = (vs: Valor[]) => juntarLista(vs.map((v) => textoValor({ ...v, quantidade: Math.abs(v.quantidade) }, itens)));
  const fichasEmReais = (vs: Valor[]) => {
    const f = vs.find((v) => v.unidade === "fichas");
    return f && turma.valor_ficha_centavos ? ` (≈ ${reais(Math.abs(f.quantidade) * turma.valor_ficha_centavos)})` : "";
  };

  function cobrar(outro: string, devendo: Valor[]) {
    const p = perfil(outro);
    const quem = souEu ? "me" : `pro ${nomeDono}`;
    const msg =
      `Fala, ${p?.apelido ?? ""}! 🍻 Pelo Placar da Resenha (${turma.nome}) você tá devendo ${quem} ${txt(devendo)}. ` +
      `Bora acertar na próxima? 😅`;
    window.open(`https://wa.me/${numeroWhats(p?.whatsapp ?? null)}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }

  const pessoas = [...saldos.keys()].filter((p) => pessoa === "todos" || p === pessoa);
  const registros = (dividas ?? []).filter(
    (d) =>
      (d.devedor_id === dono || d.credor_id === dono) &&
      (pessoa === "todos" || d.devedor_id === pessoa || d.credor_id === pessoa) &&
      (filtro === "tudo" || (filtro === "quitados" ? aberto(d) === 0 : aberto(d) > 0)),
  );

  return (
    <>
      <Cabecalho titulo="ACERTOS" sub="Quem deve o quê pra quem" />

      {cuidados.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-xs text-muted-foreground">Vendo os acertos de:</div>
          <Chips
            valor={dono}
            aoMudar={(v) => {
              setDono(v);
              setPessoa("todos");
            }}
            opcoes={[{ id: euId, label: "🙋 Mim" }, ...cuidados.map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` }))]}
          />
        </div>
      )}

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
            { id: "todos", label: "Todo mundo" },
            ...membros.filter((m) => m.user_id !== dono).map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` })),
          ]}
        />
      </div>

      {dividas === null && <div className="mt-4 h-32 animate-pulse rounded-2xl bg-card" />}

      {dividas && filtro === "pendentes" && (
        <div className="mt-4 flex flex-col gap-3">
          {pessoas.length === 0 && <Vazio emoji="🤝">Tudo acertado por aqui. Que turma honesta!</Vazio>}
          {pessoas.map((outro) => {
            const vs = [...saldos.get(outro)!.values()];
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
                    <Button onClick={() => setRecebendo(outro)}>Recebi</Button>
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

      {simplificado.length > 0 && (
        <>
          <Titulo>🧮 Acerto simplificado da turma</Titulo>
          <p className="mb-2 text-xs text-muted-foreground">
            O jeito com menos acertos pra zerar todo mundo, tipo por tipo (cerveja é cerveja, ficha é ficha).
          </p>
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {simplificado.map((a, i) => (
              <li key={i} className={cn("flex items-center gap-2 px-3 py-2 text-sm", (a.de === euId || a.para === euId) && "bg-neon/5")}>
                <Avatar p={perfil(a.de)} tamanho="sm" />
                <span className="min-w-0 flex-1 truncate">
                  <b>{nome(a.de)}</b> paga <b>{nome(a.para)}</b>
                </span>
                <span className="font-placar text-ambar">{textoValor(a.valor, itens, true)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Rodape />

      {recebendo && (
        <Receber
          outro={recebendo}
          valores={[...(saldos.get(recebendo)?.values() ?? [])].filter((v) => v.quantidade > 0)}
          aoFechar={() => setRecebendo(null)}
          aoReceber={async (v, q) => {
            const r = await rpc("receber", {
              p_group: turma.id,
              p_devedor: recebendo,
              p_unidade: v.unidade,
              p_item: v.item_id,
              p_qtd: q,
              p_credor: souEu ? null : dono,
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

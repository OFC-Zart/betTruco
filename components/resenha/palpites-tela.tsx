"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cabecalho } from "@/components/resenha/cabecalho";
import { CardAposta, NovaAposta, type MesaRef } from "@/components/resenha/apostas";
import { useTurma } from "@/components/resenha/turma-provider";
import { Chips, Rodape, Titulo, Vazio } from "@/components/resenha/ui";
import { useTela } from "@/lib/api";
import { MODALIDADES } from "@/lib/format";
import type { Modalidade, WagerComMesa } from "@/lib/types";

type Aba = "abertos" | "resolvidos";

export function PalpitesTela() {
  const { turma, possoAgirPor, garantirPerfis } = useTurma();
  const [aba, setAba] = useState<Aba>("abertos");
  const [mod, setMod] = useState<Modalidade | "todas">("todas");
  const [novo, setNovo] = useState(false);
  const { dados, recarregar } = useTela<{ apostas: WagerComMesa[]; mesas: MesaRef[] }>(
    `/api/tela/palpites?turma=${turma.id}&aba=${aba}`,
    3000,
  );
  const apostas = dados?.apostas ?? null;

  useEffect(() => {
    if (dados) garantirPerfis(dados.apostas.flatMap((x) => [x.lado_a_user, x.lado_b_user]));
  }, [dados, garantirPerfis]);

  const lista = (apostas ?? []).filter((w) => mod === "todas" || w.modalidade === mod);
  // o que depende de mim (ou de visitante que eu cuido) aparece primeiro
  const precisaDeMim = (w: WagerComMesa) => {
    const m = w.mesas?.marcador_id;
    return (
      (w.status === "aberto" && possoAgirPor(w.lado_b_user, m)) ||
      (w.status === "aguardando" &&
        [w.lado_a_user, w.lado_b_user].some((l) => l && l !== w.resolvido_por && possoAgirPor(l, m)))
    );
  };
  const meus = lista.filter(precisaDeMim);
  const resto = lista.filter((w) => !precisaDeMim(w));

  return (
    <>
      <Cabecalho titulo="PALPITES" sub="Aposta em qualquer coisa — fichas ou 🍺" />

      <Button size="lg" variant="ambar" className="h-16 w-full font-display text-3xl tracking-wider" onClick={() => setNovo(true)}>
        <Plus className="!size-7" /> NOVO PALPITE
      </Button>

      <div className="mt-4 flex flex-col gap-2">
        <Chips
          valor={aba}
          aoMudar={setAba}
          opcoes={[
            { id: "abertos", label: "🔥 Valendo / abertos" },
            { id: "resolvidos", label: "📜 Resolvidos" },
          ]}
        />
        <Chips
          valor={mod}
          aoMudar={setMod}
          opcoes={[{ id: "todas" as const, label: "Tudo" }, ...MODALIDADES.map((m) => ({ id: m.id, label: `${m.emoji} ${m.nome}` }))]}
        />
      </div>

      {apostas === null && <div className="mt-4 h-40 animate-pulse rounded-2xl bg-card" />}

      {meus.length > 0 && (
        <>
          <Titulo>⚡ Esperando você</Titulo>
          <div className="flex flex-col gap-3">
            {meus.map((w) => (
              <CardAposta key={w.id} w={w} aoMudar={recarregar} />
            ))}
          </div>
        </>
      )}

      {apostas && (
        <>
          {meus.length > 0 && resto.length > 0 && <Titulo>Da turma</Titulo>}
          <div className="mt-4 flex flex-col gap-3">
            {lista.length === 0 && (
              <Vazio emoji="🎯">{aba === "abertos" ? "Ninguém apostou nada ainda. Começa você!" : "Nenhum palpite resolvido ainda."}</Vazio>
            )}
            {resto.map((w) => (
              <CardAposta key={w.id} w={w} aoMudar={recarregar} />
            ))}
          </div>
        </>
      )}

      <Rodape />
      <NovaAposta aberto={novo} aoFechar={() => setNovo(false)} mesasAbertas={dados?.mesas ?? []} aoCriar={recarregar} />
    </>
  );
}

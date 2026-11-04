"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTurma } from "./turma-provider";
import { Curva } from "./curva";
import { CriarOuEntrarTurma } from "./turmas";
import { Avatar, Sheet } from "./ui";
import { cn } from "@/lib/utils";

/** Topo de cada aba: título grande, turma atual (troca) e avatar → configurações. */
export function Cabecalho({ titulo, sub }: { titulo: string; sub?: React.ReactNode }) {
  const { eu, turma, turmas, trocarTurma } = useTurma();
  const [aberto, setAberto] = useState(false);
  return (
    <header className="mb-4 flex items-start justify-between gap-3 pt-2">
      <div className="min-w-0">
        {/* relative z-10: o título grande logo abaixo cobria o botão e roubava o toque */}
        <button
          className="relative z-10 flex max-w-full items-center gap-1 rounded-full border border-ambar/30 bg-ambar/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-ambar active:bg-ambar/20"
          onClick={() => setAberto(true)}
          aria-label={`Turma ${turma.nome}: trocar ou criar turma`}
        >
          <span className="truncate">♣ {turma.nome}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </button>
        <h1 className="mt-1 font-display text-5xl leading-none tracking-wide texto-ouro">{titulo}</h1>
        <Curva className="mt-1 w-44" />
        {sub && <div className="mt-1 text-sm text-muted-foreground">{sub}</div>}
      </div>
      <Link href="/config" aria-label="Minhas configurações" className="mt-1">
        <Avatar p={eu} />
      </Link>
      <Sheet aberto={aberto} aoFechar={() => setAberto(false)} titulo="Suas turmas">
        <div className="flex flex-col gap-2">
          {turmas.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                trocarTurma(t.id);
                setAberto(false);
              }}
              className={cn(
                "flex items-center justify-between rounded-xl border px-4 py-3 text-left",
                t.id === turma.id ? "border-neon bg-neon/10" : "bg-black/30",
              )}
            >
              <span className="font-semibold">{t.nome}</span>
              <span className="text-xs text-muted-foreground">{t.papel}</span>
            </button>
          ))}
          <div className="mt-2 rounded-2xl border border-dashed p-3">
            <CriarOuEntrarTurma aoConcluir={() => setAberto(false)} />
          </div>
        </div>
      </Sheet>
    </header>
  );
}

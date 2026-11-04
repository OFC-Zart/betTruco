"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTurma } from "./turma-provider";
import { Avatar, Sheet } from "./ui";
import { cn } from "@/lib/utils";

/** Topo de cada aba: título grande, turma atual (troca) e avatar → configurações. */
export function Cabecalho({ titulo, sub }: { titulo: string; sub?: React.ReactNode }) {
  const { eu, turma, turmas, trocarTurma } = useTurma();
  const [aberto, setAberto] = useState(false);
  return (
    <header className="mb-4 flex items-start justify-between gap-3 pt-2">
      <div className="min-w-0">
        <button
          className="flex max-w-full items-center gap-1 text-xs font-semibold uppercase tracking-widest text-ambar"
          onClick={() => setAberto(true)}
        >
          <span className="truncate">♣ {turma.nome}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </button>
        <h1 className="font-display text-5xl leading-none tracking-wide">{titulo}</h1>
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
          <Link
            href="/entrar?passo=turma"
            className="mt-2 rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground"
          >
            + Entrar em outra turma ou criar uma
          </Link>
        </div>
      </Sheet>
    </header>
  );
}

"use client";

import { useEffect } from "react";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";

/** Painel que sobe de baixo (bom pra usar com uma mão). */
export function Sheet({
  aberto,
  aoFechar,
  titulo,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = overflow;
    };
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <button aria-label="Fechar" className="absolute inset-0 bg-black/70 animate-in fade-in" onClick={aoFechar} />
      <div className="relative max-h-[92dvh] w-full max-w-md animate-subir overflow-y-auto rounded-t-3xl border border-b-0 bg-card px-4 pb-8 pt-3 pb-safe">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-3xl tracking-wide">{titulo}</h2>
          <button onClick={aoFechar} className="rounded-full p-2 text-muted-foreground hover:bg-accent" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ p, tamanho = "md", className }: { p?: Pick<Profile, "avatar" | "cor"> | null; tamanho?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 bg-black/60",
        tamanho === "sm" && "size-7 text-sm",
        tamanho === "md" && "size-10 text-xl",
        tamanho === "lg" && "size-16 text-4xl",
        className,
      )}
      style={{ borderColor: p?.cor ?? "#444" }}
    >
      {p?.avatar ?? "👤"}
    </span>
  );
}

export function AoVivo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border border-alerta/40 bg-alerta/15 px-2 py-0.5 text-[11px] font-bold tracking-widest text-alerta", className)}>
      <span className="size-2 animate-ao-vivo rounded-full bg-alerta" />
      AO VIVO
    </span>
  );
}

export function Selo({ children, cor = "neon", className }: { children: React.ReactNode; cor?: "neon" | "ambar" | "alerta" | "cinza"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-display text-sm leading-none tracking-wider",
        cor === "neon" && "bg-neon/15 text-neon",
        cor === "ambar" && "bg-ambar/15 text-ambar",
        cor === "alerta" && "bg-alerta/15 text-alerta",
        cor === "cinza" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Botões de escolha única em linha (rolam se não couberem). */
export function Chips<T extends string>({
  opcoes,
  valor,
  aoMudar,
  className,
}: {
  opcoes: { id: T; label: React.ReactNode }[];
  valor: T | null;
  aoMudar: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("sem-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1", className)}>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => aoMudar(o.id)}
          className={cn(
            "h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors",
            valor === o.id ? "border-neon bg-neon/15 text-neon" : "border-border bg-black/30 text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ valor, aoMudar, min = 1, max = 100000 }: { valor: number; aoMudar: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="flex size-11 items-center justify-center rounded-xl border bg-black/30 active:scale-95" onClick={() => aoMudar(Math.max(min, valor - 1))} aria-label="Menos">
        <Minus className="size-4" />
      </button>
      <input
        inputMode="numeric"
        className="h-11 w-16 rounded-xl border bg-black/40 text-center font-placar text-xl"
        value={valor}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, "") || "0", 10);
          aoMudar(Math.min(max, n));
        }}
        onBlur={() => valor < min && aoMudar(min)}
      />
      <button type="button" className="flex size-11 items-center justify-center rounded-xl border bg-black/30 active:scale-95" onClick={() => aoMudar(Math.min(max, valor + 1))} aria-label="Mais">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function Titulo({ children, direita }: { children: React.ReactNode; direita?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-3">
      <h2 className="shrink-0 font-display text-2xl tracking-wide text-ambar">{children}</h2>
      <div className="linha-ouro flex-1 opacity-60" />
      {direita}
    </div>
  );
}

export function Vazio({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      <div className="mb-2 text-3xl">{emoji}</div>
      {children}
    </div>
  );
}

export function Rodape() {
  return (
    <p className="mt-10 px-2 text-center text-[11px] leading-relaxed text-muted-foreground/70">
      <span className="linha-ouro mx-auto mb-4 block w-2/3 opacity-50" />
      🃏 Só registro entre amigos: fichas e itens. O site não movimenta dinheiro —
      o acerto de verdade é com vocês, fora daqui.
    </p>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>;
}

/** Bolinhas das quedas (melhor de 3). */
export function Quedas({ n, className }: { n: number; className?: string }) {
  return (
    <div className={cn("mt-1 flex gap-1", className)} aria-label={`${n} quedas`}>
      {[0, 1].map((i) => (
        <span key={i} className={cn("size-2 rounded-full", i < n ? "bg-ambar" : "bg-muted")} />
      ))}
    </div>
  );
}

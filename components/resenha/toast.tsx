"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { cn } from "@/lib/utils";

type Tipo = "ok" | "erro" | "info";
interface Toast {
  id: number;
  texto: string;
  tipo: Tipo;
}

const Ctx = createContext<(texto: string, tipo?: Tipo) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([]);
  const toast = useCallback((texto: string, tipo: Tipo = "info") => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l.slice(-2), { id, texto, tipo }]);
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] mx-auto flex max-w-md flex-col gap-2 px-4">
        {lista.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "animate-in fade-in slide-in-from-top-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg",
              t.tipo === "erro" && "border-alerta/50 bg-alerta/15 text-red-200",
              t.tipo === "ok" && "border-neon/40 bg-neon/10 text-neon",
              t.tipo === "info" && "border-border bg-card text-foreground",
            )}
          >
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

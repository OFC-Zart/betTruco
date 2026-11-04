"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// evento que o Chrome/Android dispara quando o site pode ser instalado
interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Cartão "Instalar o app": no Android abre a instalação (ícone na tela inicial,
 * tela cheia); no iPhone explica o "Adicionar à Tela de Início".
 * Some sozinho quando o app já está instalado/aberto como app.
 * `chave`: se passada, dá pra dispensar o cartão (lembra no aparelho).
 */
export function InstalarApp({ chave, className }: { chave?: string; className?: string }) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [comoApp, setComoApp] = useState(true);
  const [ios, setIos] = useState(false);
  const [dispensado, setDispensado] = useState(false);
  const [dicaIos, setDicaIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setComoApp(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    try {
      if (chave) setDispensado(localStorage.getItem(chave) === "1");
    } catch {}
    const pronto = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const instalou = () => {
      setComoApp(true);
      setEvento(null);
    };
    window.addEventListener("beforeinstallprompt", pronto);
    window.addEventListener("appinstalled", instalou);
    return () => {
      window.removeEventListener("beforeinstallprompt", pronto);
      window.removeEventListener("appinstalled", instalou);
    };
  }, [chave]);

  if (comoApp || dispensado || (!evento && !ios)) return null;

  async function instalar() {
    if (ios) return setDicaIos(true);
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setEvento(null);
  }

  function dispensar() {
    setDispensado(true);
    try {
      if (chave) localStorage.setItem(chave, "1");
    } catch {}
  }

  return (
    <div className={cn("relative rounded-2xl border border-neon/40 bg-neon/5 p-4", className)}>
      {chave && (
        <button onClick={dispensar} className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground" aria-label="Dispensar">
          <X className="size-4" />
        </button>
      )}
      <div className="flex items-center gap-3">
        <span className="text-3xl">📲</span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl leading-tight tracking-wide">INSTALAR O APP</div>
          <div className="text-xs text-muted-foreground">Ícone na tela inicial e abre em tela cheia, igual app.</div>
        </div>
      </div>
      {dicaIos ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>
            Abra este site no <b>Safari</b>.
          </li>
          <li>
            Toque em <b>Compartilhar</b> (o quadrado com a setinha ⬆).
          </li>
          <li>
            Escolha <b>Adicionar à Tela de Início</b> e depois <b>Adicionar</b>.
          </li>
        </ol>
      ) : (
        <Button className="mt-3 w-full" onClick={instalar}>
          <Download /> Instalar
        </Button>
      )}
    </div>
  );
}

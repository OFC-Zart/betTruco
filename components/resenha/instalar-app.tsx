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

type Aparelho = "iphone" | "android" | "computador";

/** Descobre o aparelho e o navegador pelo próprio navegador (nada vai pro servidor). */
function identificar(): { aparelho: Aparelho; navegador: string } {
  const ua = navigator.userAgent;
  // iPad novo se apresenta como Mac, mas tem tela de toque
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const aparelho: Aparelho = ios ? "iphone" : /android/i.test(ua) ? "android" : "computador";
  const navegador = /CriOS/i.test(ua)
    ? "chrome"
    : /FxiOS|Firefox/i.test(ua)
      ? "firefox"
      : /EdgiOS|Edg\//i.test(ua)
        ? "edge"
        : /SamsungBrowser/i.test(ua)
          ? "samsung"
          : /Chrome/i.test(ua)
            ? "chrome"
            : /Safari/i.test(ua)
              ? "safari"
              : "outro";
  return { aparelho, navegador };
}

const ROTULO: Record<Aparelho, string> = {
  iphone: "📱 iPhone",
  android: "🤖 Android",
  computador: "💻 Computador",
};

/**
 * Cartão "Instalar o app": identifica iPhone/Android e mostra o jeito certo
 * de instalar (ícone na tela inicial, abre em tela cheia). Some quando já
 * está aberto como app. `chave`: permite dispensar (lembra no aparelho).
 */
export function InstalarApp({ chave, className }: { chave?: string; className?: string }) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [comoApp, setComoApp] = useState(true);
  const [info, setInfo] = useState<{ aparelho: Aparelho; navegador: string } | null>(null);
  const [dispensado, setDispensado] = useState(false);
  const [passos, setPassos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setComoApp(standalone);
    setInfo(identificar());
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

  // no computador só aparece se o navegador oferecer instalação
  if (!info || comoApp || dispensado || (info.aparelho === "computador" && !evento)) return null;

  async function instalar() {
    if (!evento) return setPassos(true);
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
          <div className="mt-1 inline-block rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-semibold text-neon">
            {ROTULO[info.aparelho]} detectado
          </div>
        </div>
      </div>

      {passos || (info.aparelho === "iphone" && !evento) ? (
        <Passos aparelho={info.aparelho} navegador={info.navegador} />
      ) : (
        <Button className="mt-3 w-full" onClick={instalar}>
          <Download /> Instalar
        </Button>
      )}
    </div>
  );
}

function Passos({ aparelho, navegador }: { aparelho: Aparelho; navegador: string }) {
  if (aparelho === "iphone") {
    return (
      <>
        {navegador !== "safari" && (
          <p className="mt-3 rounded-lg bg-ambar/10 px-3 py-2 text-xs text-ambar">
            Funciona melhor pelo <b>Safari</b>. Se estiver em outro navegador, copie o endereço e abra no Safari.
          </p>
        )}
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>
            Toque em <b>Compartilhar</b> (o quadrado com a setinha ⬆, embaixo ou no topo).
          </li>
          <li>
            Role e escolha <b>Adicionar à Tela de Início</b>.
          </li>
          <li>
            Toque em <b>Adicionar</b>. Pronto: abra pelo ícone 🃏 na tela inicial.
          </li>
        </ol>
      </>
    );
  }
  return (
    <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
      <li>
        Toque no menu <b>⋮</b> do navegador{navegador === "samsung" ? " (ou ☰ no Samsung Internet)" : ""}.
      </li>
      <li>
        Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
      </li>
      <li>Confirme. Pronto: abra pelo ícone 🃏 na tela inicial.</li>
    </ol>
  );
}

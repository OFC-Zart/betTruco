import { cn } from "@/lib/utils";

/** A curva dourada (com sombra vermelha) que passa por baixo das cartas na arte. */
export function Curva({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden className={cn("block h-4 w-full", className)}>
      <defs>
        <linearGradient id="curva-ouro" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#d9a441" stopOpacity="0" />
          <stop offset="0.35" stopColor="#f6dc8f" />
          <stop offset="0.75" stopColor="#d9a441" />
          <stop offset="1" stopColor="#d9a441" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="curva-vermelha" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0.2" stopColor="#d71a28" stopOpacity="0" />
          <stop offset="0.7" stopColor="#d71a28" stopOpacity="0.8" />
          <stop offset="1" stopColor="#d71a28" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 22 Q 220 22 400 4" stroke="url(#curva-vermelha)" strokeWidth="2" fill="none" transform="translate(0 2)" />
      <path d="M0 20 Q 220 20 400 2" stroke="url(#curva-ouro)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

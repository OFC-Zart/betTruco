"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Beer, Radio, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/aovivo", nome: "Ao vivo", Icone: Radio, ativo: ["/aovivo", "/mesa"] },
  { href: "/palpites", nome: "Palpites", Icone: Target, ativo: ["/palpites"] },
  { href: "/acertos", nome: "Acertos", Icone: Beer, ativo: ["/acertos"] },
  { href: "/turma", nome: "Turma", Icone: Users, ativo: ["/turma", "/config"] },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur pb-safe">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {ABAS.map(({ href, nome, Icone, ativo }) => {
          const on = ativo.some((a) => path.startsWith(a));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-wide transition-colors",
                on ? "text-neon" : "text-muted-foreground",
              )}
            >
              <Icone className={cn("size-6", on && "drop-shadow-[0_0_8px_hsl(var(--neon)/0.7)]")} />
              {nome}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

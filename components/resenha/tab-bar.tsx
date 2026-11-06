"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Beer, Radio, ShieldCheck, Target, Users } from "lucide-react";
import { PALPITES_ATIVO } from "@/lib/recursos";
import { cn } from "@/lib/utils";
import { useTurma } from "./turma-provider";

const ABAS = [
  { href: "/aovivo", nome: "Ao vivo", Icone: Radio, ativo: ["/aovivo", "/mesa"] },
  ...(PALPITES_ATIVO ? [{ href: "/palpites", nome: "Palpites", Icone: Target, ativo: ["/palpites"] }] : []),
  { href: "/acertos", nome: "Acertos", Icone: Beer, ativo: ["/acertos"] },
  { href: "/turma", nome: "Turma", Icone: Users, ativo: ["/turma", "/config"] },
];

// só aparece pra quem é admin da turma
const ABA_ADMIN = { href: "/admin", nome: "Admin", Icone: ShieldCheck, ativo: ["/admin"] };

export function TabBar() {
  const path = usePathname();
  const { isAdmin } = useTurma();
  const abas = isAdmin ? [...ABAS, ABA_ADMIN] : ABAS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-black/85 backdrop-blur pb-safe">
      <div className="linha-ouro" />
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))` }}>
        {abas.map(({ href, nome, Icone, ativo }) => {
          const on = ativo.some((a) => path.startsWith(a));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-wide transition-all active:scale-90",
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

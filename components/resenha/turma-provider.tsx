"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroApi, postar } from "@/lib/api";
import type { Group, Item, Member, Papel, Profile } from "@/lib/types";
import { useToast } from "./toast";

const CHAVE_TURMA = "resenha:turma";

interface DadosEu {
  eu: Profile & { login: string };
  turmas: (Group & { papel: Papel })[];
  turmaId: string | null;
  membros: Member[];
  itens: Item[];
}

interface TurmaCtx {
  euId: string;
  eu: Profile & { login: string };
  turmas: (Group & { papel: Papel })[];
  turma: Group;
  isAdmin: boolean;
  membros: Member[];
  /** todos os itens, inclusive os desativados (dívidas antigas usam) */
  itens: Item[];
  itensAtivos: Item[];
  perfil: (id: string | null | undefined) => Profile | undefined;
  nome: (id: string | null | undefined) => string;
  /** posso agir por essa pessoa? (eu mesmo, ou visitante que eu cuido) */
  possoAgirPor: (id: string | null | undefined, marcadorDaMesa?: string | null) => boolean;
  /** visitantes (amigos sem app) por quem eu posso apostar/receber */
  visitantesQueCuido: (marcadorDaMesa?: string | null) => Member[];
  trocarTurma: (id: string) => void;
  recarregar: () => Promise<void>;
  /** recarrega os membros se algum desses ids ainda não é conhecido (alguém entrou agora) */
  garantirPerfis: (ids: (string | null | undefined)[]) => void;
  /** chama uma função do banco e mostra o erro num toast; devolve undefined se falhar */
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<T | undefined>;
  sair: () => Promise<void>;
}

const Ctx = createContext<TurmaCtx | null>(null);

export function useTurma() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTurma fora do TurmaProvider");
  return c;
}

export function TurmaProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [estado, setEstado] = useState<DadosEu | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const ultimoReload = useRef(0);
  const conhecidos = useRef<{ turmaId: string | null; ids: Set<string> }>({ turmaId: null, ids: new Set() });

  const carregar = useCallback(
    async (turmaPreferida?: string | null) => {
      let salva: string | null = null;
      try {
        salva = localStorage.getItem(CHAVE_TURMA);
      } catch {}
      const pedida = turmaPreferida ?? salva;
      let r: Response;
      try {
        r = await fetch(`/api/eu${pedida ? `?turma=${pedida}` : ""}`, { cache: "no-store" });
      } catch {
        setFalhou("Sem conexão com o servidor.");
        return;
      }
      if (r.status === 401) {
        router.replace("/entrar");
        return;
      }
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) {
        setFalhou(j?.erro ?? "O servidor não respondeu direito.");
        return;
      }
      const d = j as DadosEu;
      ultimoReload.current = Date.now();
      if (d.turmaId) {
        try {
          localStorage.setItem(CHAVE_TURMA, d.turmaId);
        } catch {}
      }
      conhecidos.current = { turmaId: d.turmaId, ids: new Set(d.membros.map((m) => m.user_id)) };
      setFalhou(null);
      setEstado(d);
    },
    [router],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  // quem entrou na turma enquanto o app estava aberto aparece ao voltar pra aba
  useEffect(() => {
    const f = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimoReload.current > 30_000) carregar();
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [carregar]);

  const garantirPerfis = useCallback(
    (ids: (string | null | undefined)[]) => {
      const c = conhecidos.current;
      if (!ids.some((id) => id && !c.ids.has(id))) return;
      if (Date.now() - ultimoReload.current < 5_000) return;
      ultimoReload.current = Date.now();
      carregar(c.turmaId);
    },
    [carregar],
  );

  const rpc = useCallback(
    async <T,>(fn: string, args?: Record<string, unknown>) => {
      try {
        const r = await postar<{ dados: T }>(`/api/rpc/${fn}`, args ?? {});
        return (r.dados ?? true) as T;
      } catch (e) {
        if (e instanceof ErroApi && e.status === 401) router.replace("/entrar");
        toast((e as Error).message, "erro");
        return undefined;
      }
    },
    [router, toast],
  );

  const valor = useMemo<TurmaCtx | null>(() => {
    if (!estado?.turmaId) return null;
    const turma = estado.turmas.find((t) => t.id === estado.turmaId)!;
    const isAdmin = turma.papel === "admin";
    const euId = estado.eu.id;
    const mapa = new Map(estado.membros.map((m) => [m.user_id, m.profile]));
    const perfil = (id: string | null | undefined) => (id ? mapa.get(id) : undefined);
    const possoAgirPor = (id: string | null | undefined, marcador?: string | null) => {
      if (!id) return false;
      if (id === euId) return true;
      const p = mapa.get(id);
      return Boolean(p?.visitante && (isAdmin || p.criado_por === euId || (marcador && marcador === euId)));
    };
    return {
      euId,
      eu: estado.eu,
      turmas: estado.turmas,
      turma,
      isAdmin,
      membros: estado.membros,
      itens: estado.itens,
      itensAtivos: estado.itens.filter((i) => i.ativo),
      perfil,
      nome: (id) => (id === euId ? "Você" : (perfil(id)?.apelido ?? "Alguém")),
      possoAgirPor,
      visitantesQueCuido: (marcador) =>
        estado.membros.filter((m) => m.profile.visitante && possoAgirPor(m.user_id, marcador)),
      trocarTurma: (id) => carregar(id),
      recarregar: () => carregar(estado.turmaId),
      garantirPerfis,
      rpc,
      sair: async () => {
        await postar("/api/auth/sair").catch(() => {});
        router.replace("/entrar");
      },
    };
  }, [estado, carregar, garantirPerfis, rpc, router]);

  if (falhou && !estado) {
    return (
      <Centro>
        <div className="text-4xl">📵</div>
        <p className="max-w-xs text-sm text-muted-foreground">{falhou}</p>
        <Button onClick={() => carregar()}>Tentar de novo</Button>
      </Centro>
    );
  }
  if (estado && !estado.turmaId) {
    return <SemTurma aoEntrar={(id) => carregar(id)} />;
  }
  // falso positivo do lint: os refs só são lidos dentro de callbacks, nunca no render
  // eslint-disable-next-line react-hooks/refs
  if (!valor) {
    return (
      <Centro>
        <div className="animate-pulse font-display text-4xl tracking-wide text-neon brilho-neon">PLACAR DA RESENHA</div>
        <div className="text-sm text-muted-foreground">embaralhando as cartas…</div>
      </Centro>
    );
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

function Centro({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">{children}</div>;
}

/** Quem saiu da turma (ou foi removido) cai aqui. */
function SemTurma({ aoEntrar }: { aoEntrar: (id: string) => void }) {
  const toast = useToast();
  const [codigo, setCodigo] = useState("");
  async function entrar(fn: string, args: Record<string, unknown> = {}) {
    try {
      const r = await postar<{ dados: string }>(`/api/rpc/${fn}`, args);
      aoEntrar(r.dados);
    } catch (e) {
      toast((e as Error).message, "erro");
    }
  }
  return (
    <Centro>
      <div className="text-4xl">🃏</div>
      <h1 className="font-display text-4xl tracking-wide">SEM TURMA</h1>
      <p className="max-w-xs text-sm text-muted-foreground">Você não está em nenhuma turma agora.</p>
      <Button size="lg" onClick={() => entrar("entrar_turma_padrao")}>
        Entrar na turma principal
      </Button>
      <div className="mt-2 flex w-full max-w-xs gap-2">
        <Input placeholder="ou código (BAR-7K2)" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} />
        <Button variant="outline" onClick={() => entrar("entrar_turma", { p_codigo: codigo })}>
          Entrar
        </Button>
      </div>
    </Centro>
  );
}

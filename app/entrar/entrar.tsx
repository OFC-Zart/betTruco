"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Curva } from "@/components/resenha/curva";
import { Avatar, Label, Rodape } from "@/components/resenha/ui";
import { InstalarApp } from "@/components/resenha/instalar-app";
import { useToast } from "@/components/resenha/toast";
import { postar } from "@/lib/api";
import { AVATARES, CORES } from "@/lib/format";
import { cn } from "@/lib/utils";

type Aba = "criar" | "entrar";

export function Entrar() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const codigo = params.get("codigo") ?? "";

  const [aba, setAba] = useState<Aba>("criar");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [apelido, setApelido] = useState("");
  const [avatar, setAvatar] = useState(AVATARES[0]);
  const [cor, setCor] = useState(CORES[0]);
  const [ocupado, setOcupado] = useState(false);
  const [semBanco, setSemBanco] = useState<string | null>(null);
  // usuário livre? (confere enquanto digita, só na aba "Criar conta")
  const [livre, setLivre] = useState<{ login: string; ok: boolean; motivo?: string } | null>(null);

  useEffect(() => {
    if (aba !== "criar" || login.length < 3) return;
    const t = setTimeout(async () => {
      const r = await postar<{ disponivel: boolean; motivo?: string }>("/api/auth/disponivel", { login }).catch(() => null);
      if (r) setLivre({ login, ok: r.disponivel, motivo: r.motivo });
    }, 400);
    return () => clearTimeout(t);
  }, [login, aba]);
  const statusLogin = aba === "criar" && livre?.login === login ? livre : null;

  // já logado? vai direto pro Ao vivo (entrando na turma do convite, se tiver)
  useEffect(() => {
    (async () => {
      const s = await fetch("/api/status", { cache: "no-store" })
        .then((x) => x.json())
        .catch(() => null);
      if (s?.logado) {
        if (codigo) {
          try {
            const r = await postar<{ dados: string }>("/api/rpc/entrar_turma", { p_codigo: codigo });
            try {
              localStorage.setItem("resenha:turma", r.dados);
            } catch {}
            toast("Você entrou na turma do convite ✔", "ok");
          } catch (e) {
            // ex.: código trocado, ou já tem alguém com o mesmo apelido na turma
            toast((e as Error).message, "erro");
          }
        }
        router.replace("/aovivo");
        return;
      }
      if (s && !s.ok) setSemBanco(s.erro ?? "Banco de dados não conectado.");
    })();
  }, [router, codigo, toast]);

  function irPraTurma(turma: string | null) {
    try {
      if (turma) localStorage.setItem("resenha:turma", turma);
    } catch {}
    router.replace("/aovivo");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await postar<{ turma: string | null }>(
        aba === "criar" ? "/api/auth/cadastro" : "/api/auth/entrar",
        aba === "criar" ? { login, senha, apelido: apelido || login, avatar, cor, codigo } : { login, senha, codigo },
      );
      toast(aba === "criar" ? "Bem-vindo à resenha! 🍻" : "Bora! 🃏", "ok");
      irPraTurma(r.turma);
    } catch (err) {
      toast((err as Error).message, "erro");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="relative mx-auto min-h-dvh max-w-md overflow-hidden px-5 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
      <Fundo />

      <div className="relative">
        {/* leque de cartas da marca (mesma arte do ícone) */}
        <Image src="/marca/leque.png" alt="" width={720} height={438} priority className="mx-auto -mb-2 w-[82%] select-none mix-blend-screen" draggable={false} />
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-alerta/40 bg-alerta/10 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-alerta">
            <span className="size-2 animate-ao-vivo rounded-full bg-alerta" /> AO VIVO NO BAR
          </span>
        </div>
        <h1 className="mt-3 text-center font-display text-[4.2rem] leading-[0.85] tracking-wide">
          <span className="texto-ouro">PLACAR</span>
          <br />
          <span className="text-foreground">DA RESENHA</span>
        </h1>
        <Curva className="mx-auto mt-2 w-3/4" />
        <p className="mx-auto mt-3 max-w-[30ch] text-center text-sm text-muted-foreground">
          Truco, Valorant, sinuca, pênalti… o placar ao vivo da mesa e as apostas de 🍺 e fichas da turma, tudo anotado.
        </p>

        <PlacarDemo />

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Destaque emoji="📡" titulo="Placar ao vivo" texto="Todo mundo vê a mesa na hora, até quem só assiste." />
          <Destaque emoji="💰" titulo="Apostas por fora" texto="Aposta na dupla, alguém dá TOPO! e tá valendo." />
          <Destaque emoji="🍺" titulo="Quem deve o quê" texto="Cerveja é cerveja, ficha é ficha. Botão de cobrar no Zap." />
          <Destaque emoji="🏆" titulo="Ranking zoeira" texto="Rei do truco, vidente, caloteiro do mês…" />
        </div>

        <InstalarApp className="mt-5" />

        {semBanco && (
          <div className="mt-5 rounded-2xl border border-alerta/40 bg-alerta/10 p-4 text-sm text-red-200">
            <b>⚠️ Falta conectar o banco.</b> {semBanco}
          </div>
        )}

        <form onSubmit={enviar} className="mt-6 rounded-3xl border bg-card/90 p-4 shadow-[0_0_40px_-20px_hsl(var(--neon)/0.5)] backdrop-blur">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/40 p-1">
            {(["criar", "entrar"] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAba(a)}
                className={cn(
                  "h-10 rounded-lg text-sm font-semibold transition-colors",
                  aba === a ? "bg-neon text-black" : "text-muted-foreground",
                )}
              >
                {a === "criar" ? "Criar conta" : "Já tenho conta"}
              </button>
            ))}
          </div>

          {codigo && (
            <p className="mt-3 rounded-lg bg-ambar/10 px-3 py-2 text-xs text-ambar">
              Convite pra turma <b>{codigo.toUpperCase()}</b> — ao entrar você já cai nela.
            </p>
          )}

          <Label>Usuário</Label>
          <Input
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            placeholder="ex.: leozao"
            value={login}
            maxLength={20}
            onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/\s/g, ""))}
          />
          {statusLogin && (
            <p className={cn("mt-1 text-xs", statusLogin.ok ? "text-neon" : "text-alerta")}>
              {statusLogin.ok ? "✔ disponível" : (statusLogin.motivo ?? "✘ esse usuário já existe — escolhe outro")}
            </p>
          )}
          <Label>Senha</Label>
          <div className="relative">
            <Input
              type={verSenha ? "text" : "password"}
              autoComplete={aba === "criar" ? "new-password" : "current-password"}
              placeholder={aba === "criar" ? "mínimo 6 caracteres" : "sua senha"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setVerSenha(!verSenha)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground"
              aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
            >
              {verSenha ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>

          {aba === "criar" && (
            <>
              <div className="mt-4 flex items-center gap-3">
                <Avatar p={{ avatar, cor }} tamanho="lg" />
                <div className="flex-1">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Apelido na mesa</div>
                  <Input placeholder={login || "Ex.: Leozão"} value={apelido} maxLength={24} onChange={(e) => setApelido(e.target.value)} />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-8 gap-1.5">
                {AVATARES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAvatar(a)}
                    className={cn("aspect-square rounded-lg border text-xl", a === avatar ? "border-neon bg-neon/10" : "bg-black/30")}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between">
                {CORES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    onClick={() => setCor(c)}
                    className={cn("size-8 rounded-full border-4", c === cor ? "border-white" : "border-transparent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </>
          )}

          <Button size="lg" className="mt-5 w-full font-display text-2xl tracking-wider" disabled={ocupado || login.length < 3 || senha.length < (aba === "criar" ? 6 : 1) || statusLogin?.ok === false}>
            {ocupado ? "…" : aba === "criar" ? "CRIAR E ENTRAR" : "ENTRAR"}
          </Button>
          {aba === "entrar" && (
            <p className="mt-3 text-center text-xs text-muted-foreground">Esqueceu a senha? Pede pro admin da turma gerar uma provisória.</p>
          )}
        </form>

        <div className="mt-5 rounded-2xl border border-ambar/30 bg-ambar/5 p-4 text-xs leading-relaxed text-ambar/90">
          <b>Só registro, sem dinheiro.</b> Aqui não tem depósito, Pix, carteira nem odds: são fichas e itens pra lembrar quem deve o
          quê. O acerto de verdade é entre vocês, fora do site.
        </div>
        <Rodape />
      </div>
    </main>
  );
}

/** Fundo: brilho neon em cima, feltro verde embaixo e naipes flutuando. */
function Fundo() {
  const naipes = [
    { s: "♠", c: "text-neon/20", p: "left-[6%] top-[8%]", d: "0s", t: "text-5xl" },
    { s: "♥", c: "text-alerta/25", p: "right-[8%] top-[14%]", d: "1.5s", t: "text-4xl" },
    { s: "♦", c: "text-alerta/25", p: "left-[10%] top-[44%]", d: "3s", t: "text-3xl" },
    { s: "♣", c: "text-neon/20", p: "right-[6%] top-[52%]", d: "2s", t: "text-6xl" },
    { s: "♠", c: "text-foreground/10", p: "left-[45%] top-[70%]", d: "4s", t: "text-4xl" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
      <div className="absolute -top-32 left-1/2 h-72 w-[140%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--neon)/0.22),transparent_65%)]" />
      <div className="absolute -bottom-40 left-1/2 h-96 w-[160%] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,hsl(var(--alerta)/0.16),transparent_65%)]" />
      {naipes.map((n, i) => (
        <span key={i} className={cn("absolute animate-flutuar select-none", n.c, n.p, n.t)} style={{ animationDelay: n.d }}>
          {n.s}
        </span>
      ))}
    </div>
  );
}

// sequência de uma "partida" de mentira pro placar de demonstração
const LANCES: { a: number; b: number; msg: string }[] = [
  { a: 5, b: 3, msg: "+1 — Os Brabos" },
  { a: 5, b: 6, msg: "TRUCO! +3 — Zé Ruela" },
  { a: 8, b: 6, msg: "TRUCO! +3 — Os Brabos" },
  { a: 9, b: 6, msg: "+1 — Os Brabos" },
  { a: 9, b: 9, msg: "TRUCO! +3 — Zé Ruela" },
  { a: 11, b: 9, msg: "SEIS? Não… +2 Os Brabos" },
];

function PlacarDemo() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % LANCES.length), 2600);
    return () => clearInterval(t);
  }, []);
  const l = LANCES[i];
  const onze = l.a === 11 || l.b === 11;
  return (
    <div className="mt-6 rounded-3xl border border-neon/35 bg-card/90 p-4 shadow-[0_0_50px_-15px_hsl(var(--neon)/0.45)] backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="font-display text-xl tracking-wide">MESA 1</span>
        <span className="text-xs text-muted-foreground">· Mesa do fundo</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-alerta/40 bg-alerta/15 px-2 py-0.5 text-[11px] font-bold tracking-widest text-alerta">
          <span className="size-2 animate-ao-vivo rounded-full bg-alerta" /> AO VIVO
        </span>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="text-right">
          <div className="font-semibold">Os Brabos</div>
          <div className="text-[11px] text-muted-foreground">Leo & Ana</div>
        </div>
        <div className="font-placar text-6xl tabular-nums leading-none">
          <span key={`a${l.a}`} className="inline-block animate-pulo text-neon brilho-neon">{l.a}</span>
          <span className="mx-1 text-muted-foreground">×</span>
          <span key={`b${l.b}`} className="inline-block animate-pulo text-neon brilho-neon">{l.b}</span>
        </div>
        <div>
          <div className="font-semibold">Zé Ruela</div>
          <div className="text-[11px] text-muted-foreground">Pedro & Bia</div>
        </div>
      </div>
      <div key={i} className="mt-3 animate-in fade-in slide-in-from-bottom-1 rounded-lg bg-black/40 px-3 py-1.5 text-center font-display text-lg tracking-wider text-ambar">
        {l.msg}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="text-ambar">🍺 1 por pessoa</span>
        <span>💰 3 apostas por fora</span>
        {onze && <span className="rounded bg-alerta/15 px-1.5 font-display tracking-wider text-alerta">MÃO DE ONZE</span>}
      </div>
    </div>
  );
}

function Destaque({ emoji, titulo, texto }: { emoji: string; titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border bg-card/80 p-3 backdrop-blur">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 font-display text-lg leading-tight tracking-wide">{titulo}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{texto}</div>
    </div>
  );
}

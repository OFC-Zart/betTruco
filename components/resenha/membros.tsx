"use client";

import { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postar } from "@/lib/api";
import type { Member } from "@/lib/types";
import { useTurma } from "./turma-provider";
import { useToast } from "./toast";
import { Avatar, Selo, Sheet } from "./ui";

/** Admin coloca na turma alguém que já tem conta, digitando o usuário dele. */
export function AdicionarMembro() {
  const { turma, rpc, recarregar } = useTurma();
  const toast = useToast();
  const [login, setLogin] = useState("");
  async function adicionar() {
    if ((await rpc("adicionar_membro", { p_group: turma.id, p_login: login })) !== undefined) {
      toast(`${login} entrou na turma ✔`, "ok");
      setLogin("");
      recarregar();
    }
  }
  return (
    <div className="mt-2">
      <div className="mb-1 text-xs text-muted-foreground">Adicionar quem já tem conta (pelo usuário dele):</div>
      <div className="flex gap-2">
        <Input
          placeholder="usuário, ex.: leozao"
          autoCapitalize="none"
          autoCorrect="off"
          value={login}
          onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/\s/g, ""))}
        />
        <Button onClick={adicionar} disabled={login.length < 3}>
          Adicionar
        </Button>
      </div>
    </div>
  );
}

export function ListaMembros({ lista, euId, aoAbrir }: { lista: Member[]; euId: string; aoAbrir: (m: Member) => void }) {
  return (
    <ul className="flex flex-col divide-y rounded-2xl border bg-card">
      {lista.map((m) => (
        <li key={m.user_id}>
          <button className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-accent" onClick={() => aoAbrir(m)}>
            <Avatar p={m.profile} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {m.profile.apelido}
                {m.user_id === euId && <span className="text-muted-foreground"> (você)</span>}
              </div>
              <div className="text-xs text-muted-foreground">desde {new Date(m.created_at).toLocaleDateString("pt-BR")}</div>
            </div>
            {m.papel === "admin" && <Selo cor="ambar">ADMIN</Selo>}
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Ações sobre uma pessoa: admin, senha provisória, login pro visitante, remover. */
export function AcoesMembro({
  m,
  podeCuidar,
  isAdmin,
  euId,
  aoFechar,
}: {
  m: Member;
  podeCuidar: boolean;
  isAdmin: boolean;
  euId: string;
  aoFechar: () => void;
}) {
  const { turma, rpc, recarregar } = useTurma();
  const toast = useToast();
  const [senhaNova, setSenhaNova] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const eu = m.user_id === euId;
  const visitante = m.profile.visitante;

  async function acao(fn: string, args: Record<string, unknown>, ok: string) {
    if ((await rpc(fn, { p_group: turma.id, ...args })) !== undefined) {
      toast(ok, "ok");
      await recarregar();
      aoFechar();
    }
  }
  async function resetar() {
    try {
      const r = await postar<{ senha: string }>("/api/auth/resetar", { turma: turma.id, pessoa: m.user_id });
      setSenhaNova(r.senha);
    } catch (e) {
      toast((e as Error).message, "erro");
    }
  }
  async function criarLogin() {
    try {
      await postar("/api/auth/converter", { turma: turma.id, pessoa: m.user_id, login, senha });
      toast(`${m.profile.apelido} agora tem login 🎉`, "ok");
      await recarregar();
      aoFechar();
    } catch (e) {
      toast((e as Error).message, "erro");
    }
  }

  return (
    <Sheet aberto aoFechar={aoFechar} titulo={m.profile.apelido}>
      <div className="mb-4 flex items-center gap-3">
        <Avatar p={m.profile} tamanho="lg" />
        <div className="text-sm text-muted-foreground">
          {visitante ? "Visitante (sem app)" : m.papel === "admin" ? "Admin da turma" : "Membro com app"}
        </div>
      </div>

      {senhaNova && (
        <div className="mb-4 rounded-2xl border border-neon/40 bg-neon/10 p-4 text-center">
          <div className="text-xs text-muted-foreground">Senha provisória (passa pra ele e pede pra trocar em Configurações):</div>
          <div className="mt-1 font-placar text-3xl tracking-widest text-neon">{senhaNova}</div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {visitante && (podeCuidar || isAdmin) && (
          <div className="rounded-2xl border bg-black/20 p-3">
            <div className="mb-2 text-sm font-semibold">Ele resolveu usar o app? Cria o login dele</div>
            <Input placeholder="usuário (ex.: tiojorge)" value={login} autoCapitalize="none" onChange={(e) => setLogin(e.target.value.toLowerCase())} />
            <Input className="mt-2" placeholder="senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
            <Button className="mt-2 w-full" onClick={criarLogin} disabled={!login || senha.length < 4}>
              Criar login (mantém o histórico)
            </Button>
          </div>
        )}
        {isAdmin && !eu && !visitante && (
          <>
            <Button
              variant="outline"
              onClick={() => acao("definir_papel", { p_user: m.user_id, p_papel: m.papel === "admin" ? "membro" : "admin" }, "Papel atualizado")}
            >
              {m.papel === "admin" ? "Tirar de admin" : "Tornar admin"}
            </Button>
            <Button variant="outline" onClick={resetar}>
              Esqueceu a senha? Gerar senha provisória
            </Button>
          </>
        )}
        {isAdmin && !eu && (
          <Button
            variant="ghost"
            className="text-alerta"
            onClick={() =>
              confirm(`Remover ${m.profile.apelido} da turma? As dívidas continuam anotadas.`) &&
              acao("remover_membro", { p_user: m.user_id }, "Removido")
            }
          >
            <Trash2 /> Remover da turma
          </Button>
        )}
        {!isAdmin && !(visitante && podeCuidar) && <p className="text-sm text-muted-foreground">Nada pra fazer aqui.</p>}
      </div>
    </Sheet>
  );
}

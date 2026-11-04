"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTurma } from "@/components/resenha/turma-provider";
import { useToast } from "@/components/resenha/toast";
import { InstalarApp } from "@/components/resenha/instalar-app";
import { CriarOuEntrarTurma } from "@/components/resenha/turmas";
import { Avatar, Label, Rodape, Titulo } from "@/components/resenha/ui";
import { postar } from "@/lib/api";
import { AVATARES, CORES } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function ConfigPage() {
  const { eu, turma, euId, rpc, recarregar, sair } = useTurma();
  const toast = useToast();
  const router = useRouter();
  const [apelido, setApelido] = useState(eu.apelido);
  const [avatar, setAvatar] = useState(eu.avatar);
  const [cor, setCor] = useState(eu.cor);
  const [whats, setWhats] = useState(eu.whatsapp ?? "");
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");

  async function salvar() {
    const r = await rpc("salvar_perfil", { p_apelido: apelido, p_avatar: avatar, p_cor: cor, p_whatsapp: whats || null });
    if (r !== undefined) {
      toast("Perfil salvo ✔", "ok");
      recarregar();
    }
  }

  async function trocarSenha() {
    try {
      await postar("/api/auth/senha", { atual, nova });
      toast("Senha trocada ✔", "ok");
      setAtual("");
      setNova("");
    } catch (e) {
      toast((e as Error).message, "erro");
    }
  }

  async function sairDaTurma() {
    if (!confirm(`Sair da turma "${turma.nome}"? Suas dívidas continuam anotadas lá.`)) return;
    if ((await rpc("remover_membro", { p_group: turma.id, p_user: euId })) !== undefined) {
      try {
        localStorage.removeItem("resenha:turma");
      } catch {}
      recarregar();
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 pt-2">
        <Link href="/turma" className="-ml-2 rounded-full p-2 text-muted-foreground" aria-label="Voltar">
          <ChevronLeft className="size-6" />
        </Link>
        <h1 className="font-display text-5xl leading-none tracking-wide">CONFIGURAÇÕES</h1>
      </div>
      <p className="mt-1 pl-8 text-xs text-muted-foreground">
        Usuário: <b className="text-foreground">{eu.login}</b>
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Avatar p={{ avatar, cor }} tamanho="lg" />
        <div className="flex-1">
          <Label>Apelido</Label>
          <Input value={apelido} maxLength={24} onChange={(e) => setApelido(e.target.value)} />
        </div>
      </div>
      <Label>Avatar</Label>
      <div className="grid grid-cols-8 gap-2">
        {AVATARES.map((a) => (
          <button key={a} type="button" onClick={() => setAvatar(a)} className={cn("aspect-square rounded-xl border text-2xl", a === avatar ? "border-neon bg-neon/10" : "bg-black/30")}>
            {a}
          </button>
        ))}
      </div>
      <Label>Cor</Label>
      <div className="flex gap-2">
        {CORES.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            onClick={() => setCor(c)}
            className={cn("size-9 rounded-full border-4", c === cor ? "border-white" : "border-transparent")}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <Label>WhatsApp (pro botão “Cobrar” dos amigos)</Label>
      <Input inputMode="tel" placeholder="DDD + número, ex.: 11999998888" value={whats} onChange={(e) => setWhats(e.target.value)} />
      <Button className="mt-4 w-full" size="lg" onClick={salvar}>
        Salvar perfil
      </Button>

      <Titulo>🔑 Trocar senha</Titulo>
      <div className="flex flex-col gap-2">
        <Input type="password" placeholder="Senha atual" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" />
        <Input type="password" placeholder="Senha nova (mín. 4)" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" />
        <Button variant="outline" onClick={trocarSenha} disabled={!atual || nova.length < 4}>
          Trocar senha
        </Button>
      </div>

      <Titulo>♣ Turmas</Titulo>
      <p className="-mt-1 text-xs text-muted-foreground">
        Pra trocar de turma, toque no nome dela no topo da tela (♣ {turma.nome.toUpperCase()} ▾).
      </p>
      <CriarOuEntrarTurma aoConcluir={() => router.push("/aovivo")} />

      <InstalarApp className="mt-6" />

      <div className="mt-6 flex flex-col gap-2">
        <Button variant="outline" onClick={sairDaTurma}>
          Sair da turma “{turma.nome}”
        </Button>
        <Button variant="ghost" className="text-alerta" onClick={() => confirm("Sair do app neste aparelho?") && sair()}>
          Sair do app neste aparelho
        </Button>
      </div>
      <Rodape />
    </>
  );
}

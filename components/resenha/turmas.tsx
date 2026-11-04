"use client";

import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Group } from "@/lib/types";
import { useTurma } from "./turma-provider";
import { useToast } from "./toast";
import { Label } from "./ui";

/** Criar uma turma nova (vira admin dela) ou entrar em outra com o código. */
export function CriarOuEntrarTurma({ aoConcluir }: { aoConcluir?: () => void }) {
  const { rpc, trocarTurma } = useTurma();
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function criar() {
    setOcupado(true);
    const g = await rpc<Group>("criar_turma", { p_nome: nome });
    setOcupado(false);
    if (g) {
      toast(`Turma "${g.nome}" criada! Você é o admin. Chame a galera em Turma → Membros.`, "ok");
      setNome("");
      trocarTurma(g.id);
      aoConcluir?.();
    }
  }
  async function entrar() {
    setOcupado(true);
    const id = await rpc<string>("entrar_turma", { p_codigo: codigo });
    setOcupado(false);
    if (id) {
      toast("Entrou na turma ✔", "ok");
      setCodigo("");
      trocarTurma(id);
      aoConcluir?.();
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Label>Criar uma turma nova</Label>
      <div className="flex gap-2">
        <Input placeholder="Ex.: Bar do Zé, Firma, Futebol de quarta" value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} />
        <Button variant="ambar" onClick={criar} disabled={ocupado || !nome.trim()}>
          Criar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Cada turma tem suas mesas, apostas, acertos e ranking separados.</p>
      <Label>Entrar numa turma com código</Label>
      <div className="flex gap-2">
        <Input
          placeholder="BAR-7K2"
          value={codigo}
          autoCapitalize="characters"
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          className="font-placar tracking-widest"
        />
        <Button variant="outline" onClick={entrar} disabled={ocupado || codigo.replace(/[^A-Z0-9]/g, "").length < 4}>
          Entrar
        </Button>
      </div>
    </div>
  );
}

/** Cartão de convite da turma atual: quem abre o link já entra nesta turma. */
export function ConviteTurma() {
  const { turma, isAdmin, rpc, recarregar } = useTurma();
  const toast = useToast();
  const link = typeof window !== "undefined" ? `${location.origin}/convite/${turma.codigo_convite}` : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado!", "ok");
    } catch {
      toast(link);
    }
  }
  function compartilhar() {
    const texto = `Bora pro Placar da Resenha! Entra na turma "${turma.nome}" por esse link:`;
    if (navigator.share) {
      navigator.share({ title: "Placar da Resenha", text: texto, url: link }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${link}`)}`, "_blank", "noopener");
    }
  }
  async function novoCodigo() {
    if (!confirm("Gerar código novo? O link antigo para de funcionar.")) return;
    if ((await rpc("novo_codigo", { p_group: turma.id })) !== undefined) {
      toast("Código novo gerado", "ok");
      recarregar();
    }
  }

  return (
    <div className="rounded-2xl border border-ambar/30 bg-ambar/5 p-4 text-center">
      <div className="text-xs uppercase tracking-widest text-ambar">Convite da turma {turma.nome}</div>
      <div className="my-1 font-placar text-4xl tracking-[0.2em] text-ambar brilho-ambar">{turma.codigo_convite}</div>
      <p className="text-xs text-muted-foreground">
        Quem abrir o link (ou digitar o código) entra direto <b>nesta</b> turma — sendo conta nova ou não.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={copiar}>
          <Copy /> Copiar link
        </Button>
        <Button variant="ambar" onClick={compartilhar}>
          <Share2 /> Chamar no Zap
        </Button>
      </div>
      {isAdmin && (
        <button className="mt-3 text-xs text-muted-foreground underline" onClick={novoCodigo}>
          gerar código novo
        </button>
      )}
    </div>
  );
}

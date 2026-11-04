import { NextResponse } from "next/server";
import { banco, tipoBanco } from "@/lib/server/db";
import { comoUsuario } from "@/lib/server/sessao";

export const dynamic = "force-dynamic";

// Diz se o banco está conectado e se quem chamou já está logado
// (a tela de entrada usa isso: mostra aviso de banco ou pula direto pro Ao vivo).
export async function GET() {
  const tipo = tipoBanco();
  if (tipo === "faltando") return NextResponse.json({ banco: tipo, ok: false, logado: false });
  try {
    await banco();
  } catch (e) {
    return NextResponse.json({ banco: tipo, ok: false, logado: false, erro: (e as Error).message });
  }
  const logado = await comoUsuario(async () => true).catch(() => false);
  return NextResponse.json({ banco: tipo, ok: true, logado });
}

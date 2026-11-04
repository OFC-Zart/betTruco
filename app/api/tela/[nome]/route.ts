import { ErroApp } from "@/lib/server/db";
import { comoUsuario, responder } from "@/lib/server/sessao";
import { TELAS } from "@/lib/server/telas";

export const dynamic = "force-dynamic";

// GET /api/tela/<nome>?...&v=<versão que a tela já tem>
// Se nada mudou na turma desde essa versão, responde 204 (vazio) — é isso
// que deixa o "tempo real" (consulta a cada ~2s) leve.
export async function GET(req: Request, { params }: { params: Promise<{ nome: string }> }) {
  const { nome } = await params;
  const p = new URL(req.url).searchParams;
  return responder(async () => {
    const tela = TELAS[nome];
    if (!tela) throw new ErroApp("Tela desconhecida", 404);
    return comoUsuario(async (q) => {
      const turma = await tela.turma(q, p);
      await tela.antes?.(q);
      const [m] = await q.query<{ membro: boolean; versao: string | number }>(
        "select is_member($1) as membro, (select versao from groups where id = $1) as versao",
        [turma],
      );
      if (!m?.membro) throw new ErroApp("Você não faz parte dessa turma", 403);
      const versao = Number(m.versao);
      if (p.get("v") === String(versao)) return new Response(null, { status: 204 });
      return { versao, dados: await tela.dados(q, p, turma) };
    });
  });
}

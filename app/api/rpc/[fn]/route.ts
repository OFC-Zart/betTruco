import { ErroApp } from "@/lib/server/db";
import { comoUsuario, responder } from "@/lib/server/sessao";

export const dynamic = "force-dynamic";

// Funções do banco que o site pode chamar, e o que cada uma devolve.
// Todas conferem permissão lá dentro (veja db/migracoes).
const RPCS: Record<string, "linha" | "valor" | "nada"> = {
  salvar_perfil: "linha",
  criar_turma: "linha",
  entrar_turma: "valor",
  entrar_turma_padrao: "valor",
  criar_visitante: "valor",
  atualizar_turma: "linha",
  novo_codigo: "valor",
  definir_papel: "nada",
  remover_membro: "nada",
  salvar_item: "valor",
  remover_item: "nada",
  criar_mesa: "valor",
  sentar: "nada",
  levantar: "nada",
  votar_marcador: "valor",
  iniciar_partida: "valor",
  marcar_ponto: "linha",
  encerrar_partida: "nada",
  encerrar_mesa: "nada",
  criar_aposta: "valor",
  editar_aposta: "nada",
  topar_aposta: "nada",
  cancelar_aposta: "nada",
  marcar_resultado: "nada",
  confirmar_resultado: "nada",
  contestar_resultado: "nada",
  auto_confirmar: "valor",
  receber: "nada",
  admin_quitar_dividas: "valor",
  admin_apagar_dividas: "valor",
  admin_apagar_aposta: "nada",
  admin_apagar_mesa: "nada",
  admin_limpar_historico: "nada",
  adicionar_membro: "valor",
  admin_apagar_turma: "nada",
};

export async function POST(req: Request, { params }: { params: Promise<{ fn: string }> }) {
  const { fn } = await params;
  return responder(async () => {
    const tipo = Object.hasOwn(RPCS, fn) ? RPCS[fn] : undefined;
    if (!tipo) throw new ErroApp("Função desconhecida", 404);
    const lido: unknown = await req.json().catch(() => ({}));
    const corpo = (lido && typeof lido === "object" && !Array.isArray(lido) ? lido : {}) as Record<string, unknown>;
    const nomes = Object.keys(corpo).filter((k) => /^p_[a-z0-9_]+$/.test(k));
    // argumentos por nome: criar_aposta(p_group => $1, p_tipo => $2, ...)
    const args = nomes.map((k, i) => `${k} => $${i + 1}`).join(", ");
    const valores = nomes.map((k) => corpo[k] ?? null);
    const sql =
      tipo === "linha"
        ? `select to_jsonb(r) as r from ${fn}(${args}) r`
        : tipo === "valor"
          ? `select to_jsonb(${fn}(${args})) as r`
          : `select ${fn}(${args})`;
    return comoUsuario(async (q) => {
      const [linha] = await q.query<{ r: unknown }>(sql, valores);
      return { dados: tipo === "nada" ? true : (linha?.r ?? null) };
    });
  });
}

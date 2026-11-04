import { emSequencia, lista, umSo } from "@/lib/server/db";
import { comoUsuario, responder } from "@/lib/server/sessao";

export const dynamic = "force-dynamic";

// Quem sou eu, minhas turmas e, da turma escolhida, os membros e itens.
export async function GET(req: Request) {
  const pedida = new URL(req.url).searchParams.get("turma");
  return responder(() =>
    comoUsuario(async (q, uid) => {
      const eu = await umSo(q, "select p.*, u.login from profiles p join usuarios u on u.id = p.id where p.id = $1", [uid]);
      const turmas = await lista<{ id: string }>(
        q,
        `select g.id, g.nome, g.codigo_convite, g.valor_ficha_centavos, g.truco_pontos_alvo,
                g.truco_melhor_de_3, g.criado_por, g.created_at, gm.papel
         from group_members gm join groups g on g.id = gm.group_id
         where gm.user_id = $1 order by g.created_at`,
        [uid],
      );
      const turmaId = turmas.find((t) => t.id === pedida)?.id ?? turmas[0]?.id ?? null;
      if (!turmaId) return { eu, turmas, turmaId, membros: [], itens: [] };
      const [membros, itens] = await emSequencia([
        () => lista(
          q,
          `select gm.user_id, gm.papel, gm.created_at, to_jsonb(p) as profile, (u.id is not null) as tem_login
           from group_members gm
           join profiles p on p.id = gm.user_id
           left join usuarios u on u.id = gm.user_id
           where gm.group_id = $1
           order by p.visitante, lower(p.apelido)`,
          [turmaId],
        ),
        () => lista(q, "select * from items where group_id = $1 order by created_at", [turmaId]),
      ]);
      return { eu, turmas, turmaId, membros, itens };
    }),
  );
}

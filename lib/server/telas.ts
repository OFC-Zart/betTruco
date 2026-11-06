import { emSequencia, ErroApp, lista, umSo, type Exec } from "./db";

// Dados de cada tela. Sempre dentro de comoUsuario + checagem de membro
// (feita na rota antes de chamar aqui).

const JOGADORES = `coalesce((select jsonb_agg(to_jsonb(mp) order by mp.posicao) from mesa_players mp where mp.mesa_id = m.id), '[]'::jsonb)`;
const PARTIDAS = `coalesce((select jsonb_agg(to_jsonb(tm) order by tm.created_at desc) from truco_matches tm where tm.mesa_id = m.id), '[]'::jsonb)`;

const MESA_COMPLETA = `select m.*, ${JOGADORES} as mesa_players, ${PARTIDAS} as truco_matches from mesas m`;

// resultado da última partida daquele número de mesa
const ULTIMA = `(
  select jsonb_build_object('nome_dupla_a', tm.nome_dupla_a, 'nome_dupla_b', tm.nome_dupla_b, 'vencedor', tm.vencedor)
  from truco_matches tm join mesas m2 on m2.id = tm.mesa_id
  where m2.group_id = m.group_id and m2.numero = m.numero and tm.status = 'encerrada'
  order by tm.encerrada_em desc limit 1
) as ultima`;

// aposta + resumo da mesa dela (número e nomes das duplas)
const APOSTA_COM_MESA = `
  select w.*, (
    select jsonb_build_object(
      'numero', m.numero, 'nome', m.nome, 'status', m.status, 'marcador_id', m.marcador_id,
      'truco_matches', coalesce((
        select jsonb_agg(jsonb_build_object('nome_dupla_a', tm.nome_dupla_a, 'nome_dupla_b', tm.nome_dupla_b, 'status', tm.status))
        from truco_matches tm where tm.mesa_id = m.id
      ), '[]'::jsonb)
    ) from mesas m where m.id = w.mesa_id
  ) as mesas
  from wagers w`;

const ABERTAS = `('aberto', 'valendo', 'aguardando')`;

interface Tela {
  /** turma dona dos dados (para checar membro e versão) */
  turma(q: Exec, p: URLSearchParams): Promise<string>;
  /** algo a fazer antes de olhar a versão (ex.: confirmar palpites vencidos) */
  antes?(q: Exec): Promise<void>;
  dados(q: Exec, p: URLSearchParams, turma: string): Promise<unknown>;
}

const turmaDoParametro = async (_q: Exec, p: URLSearchParams) => {
  const t = p.get("turma");
  if (!t) throw new ErroApp("Turma não informada");
  return t;
};
const autoConfirmar = async (q: Exec) => {
  await q.query("select auto_confirmar()");
};

export const TELAS: Record<string, Tela> = {
  aovivo: {
    turma: turmaDoParametro,
    async dados(q, _p, t) {
      const [mesas, apostas] = await emSequencia([
        () => lista(q, `select m.*, ${JOGADORES} as mesa_players, ${PARTIDAS} as truco_matches, ${ULTIMA} from mesas m where m.group_id = $1 and m.status <> 'encerrada' order by m.numero`, [t]),
        () => lista(q, `${APOSTA_COM_MESA} where w.group_id = $1 and w.status in ${ABERTAS} order by w.created_at desc limit 30`, [t]),
      ]);
      return { mesas, apostas };
    },
  },

  mesa: {
    async turma(q, p) {
      const r = await umSo<{ group_id: string }>(q, "select group_id from mesas where id = $1", [p.get("id")]);
      if (!r) throw new ErroApp("Mesa não encontrada", 404);
      return r.group_id;
    },
    async dados(q, p, t) {
      const id = p.get("id");
      const mesa = await umSo<{ numero: number; truco_matches: { id: string; status: string }[] }>(q, `${MESA_COMPLETA} where m.id = $1`, [id]);
      const partida = mesa?.truco_matches.find((x) => x.status === "em_jogo") ?? mesa?.truco_matches[0];
      const [votos, apostas, eventos, dividas, ocupados, proxima] = await emSequencia([
        () => lista(q, "select eleitor_id, candidato_id from mesa_votos where mesa_id = $1", [id]),
        () => lista(q, `${APOSTA_COM_MESA} where w.mesa_id = $1 order by w.created_at desc`, [id]),
        async () =>
          partida
            ? lista(q, "select id, match_id, dupla, pontos, tipo, desfeito, criado_por, created_at from truco_events where match_id = $1 order by id desc limit 20", [partida.id])
            : [],
        async () =>
          partida && partida.status === "encerrada"
            ? lista(q, "select * from debts where origem_tipo = 'truco' and origem_id = $1", [partida.id])
            : [],
        // quem está sentado nas outras mesas da turma
        () => lista(
          q,
          `select mp.user_id, m.numero, m.status from mesa_players mp join mesas m on m.id = mp.mesa_id
           where m.group_id = $1 and m.status <> 'encerrada' and m.id <> $2`,
          [t, id],
        ),
        // a mesa que reabriu depois desta partida
        async () =>
          umSo(q, `${MESA_COMPLETA} where m.group_id = $1 and m.numero = $2 and m.status <> 'encerrada' and m.id <> $3`, [t, mesa?.numero, id]),
      ]);
      return { mesa, votos, apostas, eventos, dividas, ocupados, proxima };
    },
  },

  palpites: {
    turma: turmaDoParametro,
    antes: autoConfirmar,
    async dados(q, p, t) {
      const abertos = p.get("aba") !== "resolvidos";
      const [apostas, mesas] = await emSequencia([
        () => lista(
          q,
          abertos
            ? `${APOSTA_COM_MESA} where w.group_id = $1 and w.status in ${ABERTAS} order by w.created_at desc limit 100`
            : `${APOSTA_COM_MESA} where w.group_id = $1 and w.status in ('resolvido', 'empate', 'cancelado') order by coalesce(w.confirmado_em, w.created_at) desc limit 50`,
          [t],
        ),
        () => lista(q, "select id, numero, nome, marcador_id from mesas where group_id = $1 and status <> 'encerrada' order by numero", [t]),
      ]);
      return { apostas, mesas };
    },
  },

  acertos: {
    turma: turmaDoParametro,
    antes: autoConfirmar,
    async dados(q, _p, t) {
      return { dividas: await lista(q, "select * from debts where group_id = $1 order by created_at desc limit 2000", [t]) };
    },
  },

  turma: {
    turma: turmaDoParametro,
    async dados(q, _p, t) {
      const [partidas, apostas, dividas] = await emSequencia([
        () => lista(
          q,
          `select tm.*, (
             select jsonb_build_object('numero', m.numero, 'nome', m.nome, 'mesa_players', ${JOGADORES})
             from mesas m where m.id = tm.mesa_id
           ) as mesas
           from truco_matches tm
           where tm.group_id = $1 and tm.status in ('encerrada', 'cancelada')
           order by tm.encerrada_em desc nulls last limit 500`,
          [t],
        ),
        () => lista(q, "select * from wagers where group_id = $1 and status in ('resolvido', 'empate') order by confirmado_em desc nulls last limit 500", [t]),
        () => lista(q, "select * from debts where group_id = $1 limit 2000", [t]),
      ]);
      return { partidas, apostas, dividas };
    },
  },

  // aba Admin (só admin): tudo da turma pra quitar, apagar e gerenciar
  admin: {
    turma: turmaDoParametro,
    async dados(q, _p, t) {
      const [a] = await q.query<{ admin: boolean }>("select is_admin($1) as admin", [t]);
      if (!a?.admin) throw new ErroApp("Só admin entra aqui", 403);
      const [dividas, apostas, mesas] = await emSequencia([
        () => lista(q, "select * from debts where group_id = $1 order by created_at desc limit 2000", [t]),
        () => lista(q, `${APOSTA_COM_MESA} where w.group_id = $1 order by w.created_at desc limit 300`, [t]),
        () =>
          lista(
            q,
            `${MESA_COMPLETA} where m.group_id = $1
             order by (m.status = 'encerrada'), coalesce(m.encerrada_em, m.created_at) desc limit 200`,
            [t],
          ),
      ]);
      return { dividas, apostas, mesas };
    },
  },
};

// Testa as migrations e as regras do banco num Postgres em memória (PGlite).
// Uso: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

process.on("uncaughtException", (e) => {
  console.error(`\n  ✘ FALHOU: ${e.message}`);
  process.exit(1);
});

const db = new PGlite();
const dir = new URL("../db/migracoes/", import.meta.url);
for (const f of readdirSync(dir).sort()) {
  await db.exec(readFileSync(new URL(f, dir), "utf8"));
}

// cria pessoas com login (igual ao /api/auth/cadastro)
const ids = {};
for (const nome of ["leo", "ana", "pedro", "bia", "zeca", "fora"]) {
  const { rows } = await db.query("insert into profiles (apelido) values ($1) returning id", [nome]);
  ids[nome] = rows[0].id;
  await db.query("insert into usuarios (id, login, senha_hash) values ($1, $2, 'x')", [ids[nome], nome]);
}

// executa como um usuário logado (o servidor faz igual: set_config numa transação)
async function como(nome, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('app.user_id', $1, true)", [nome ? ids[nome] : ""]);
    return tx.query(sql, params);
  });
}
async function falha(nome, sql, params, trecho) {
  await assert.rejects(() => como(nome, sql, params), (e) => {
    assert.match(e.message, trecho);
    return true;
  });
}
const um = async (...a) => (await como(...a)).rows[0];
let ok = 0;
const passo = (msg) => console.log(`  ✔ ${msg}`) || ok++;

// --- cadastro: primeiro vira dono da turma "Resenha", o resto entra direto
await falha(null, "select entrar_turma_padrao()", [], /login/);
const gid = (await um("leo", "select entrar_turma_padrao() as id")).id;
for (const n of ["ana", "pedro", "bia", "zeca"]) {
  assert.equal((await um(n, "select entrar_turma_padrao() as id")).id, gid);
}
const g = await um("leo", "select * from groups where id = $1", [gid]);
assert.equal(g.nome, "Resenha");
assert.equal((await um("leo", "select papel from group_members where user_id = $1", [ids.leo])).papel, "admin");
assert.equal((await um("ana", "select papel from group_members where user_id = $1", [ids.ana])).papel, "membro");
assert.equal((await um("fora", "select is_member($1) as m", [gid])).m, false);
passo("1º cadastro vira dono da turma; os outros entram direto como membro");

await como("fora", "select entrar_turma($1)", [g.codigo_convite.toLowerCase().replace("-", " ")]);
assert.equal((await um("fora", "select is_member($1) as m", [gid])).m, true);
await como("fora", "select remover_membro($1, $2)", [gid, ids.fora]);
passo("código de convite continua funcionando (sem hífen / minúsculo)");

const v0 = Number((await um("ana", "select versao from groups where id = $1", [gid])).versao);
await como("ana", "select salvar_perfil('Ana', '🎯', '#39FF14', null)");
assert.ok(Number((await um("ana", "select versao from groups where id = $1", [gid])).versao) > v0);
passo("versão da turma sobe a cada mudança (as telas recarregam por ela)");

const cerveja = (await um("leo", "select id from items where nome = 'Cerveja'")).id;

// --- visitantes (amigos sem app)
const tio = (await um("zeca", "select criar_visitante($1, 'Tio Jorge') as id", [gid])).id;
await falha("ana", "select criar_visitante($1, 'tio jorge')", [gid], /Já tem alguém/);
const prima = (await um("ana", "select criar_visitante($1, 'Prima') as id", [gid])).id;
passo("visitante criado com nome (sem login)");

// --- mesas fixas: toda turma nasce com a Mesa 1 e a Mesa 2
const fixas = (await como("leo", "select numero from mesas where group_id = $1 and status = 'aberta' order by numero", [gid])).rows;
assert.deepEqual(fixas.map((x) => x.numero), [1, 2]);
await falha("ana", "select criar_mesa($1)", [gid], /Só admin/);
const m1 = (await um("leo", "select criar_mesa($1, 'Mesa do fundo') as id", [gid])).id;
assert.equal((await um("leo", "select numero from mesas where id = $1", [m1])).numero, 3);
assert.equal((await um("leo", "select marcador_id from mesas where id = $1", [m1])).marcador_id, null);
passo("turma nasce com Mesa 1 e Mesa 2; só admin acrescenta outra");

// --- quem está na turma põe gente na mesa; votação troca quem marca
await como("leo", "select sentar($1, 0)", [m1]);
await como("pedro", "select sentar($1, 1)", [m1]);
await como("ana", "select sentar($1, 2)", [m1]);
await como("pedro", "select sentar($1, 3, $2)", [m1, tio]);
await falha("zeca", "select sentar($1, 3)", [m1], /ocupado/);
await falha("zeca", "select votar_marcador($1, $2)", [m1, ids.zeca], /sentado/);
await falha("ana", "select votar_marcador($1, $2)", [m1, tio], /tenha o app/);
await como("pedro", "select votar_marcador($1, $2)", [m1, ids.ana]);
await como("ana", "select votar_marcador($1, $2)", [m1, ids.ana]);
await como("leo", "select votar_marcador($1, $2)", [m1, ids.leo]);
assert.equal((await um("leo", "select marcador_id from mesas where id = $1", [m1])).marcador_id, ids.ana);
passo("votação rápida: Ana (2 votos) vira dona da mesa; qualquer um senta o visitante");

// apostas antes de começar: cada um muda a sua; dono aposta pelo visitante
const apZeca = (await um("zeca",
  "select criar_aposta($1, 'dupla_vence', null, 'truco', 'fichas', null, 20, $2, 'A') as id", [gid, m1])).id;
await como("zeca", "select editar_aposta($1, 'fichas', null, 30, 'A')", [apZeca]);
await falha("bia", "select editar_aposta($1, 'fichas', null, 5, 'B')", [apZeca], /Só quem fez/);
assert.equal((await um("zeca", "select quantidade from wagers where id = $1", [apZeca])).quantidade, 30);
const apTio = (await um("ana",
  "select criar_aposta($1, 'dupla_vence', null, 'truco', 'item', $2, 1, $3, 'B', null, $4) as id",
  [gid, cerveja, m1, tio])).id;
assert.equal((await um("ana", "select lado_a_user from wagers where id = $1", [apTio])).lado_a_user, tio);
await falha("bia", "select criar_aposta($1, 'dupla_vence', null, 'truco', 'fichas', null, 5, $2, 'B', null, $3)",
  [gid, m1, tio], /dono da mesa/);
const apLeva = (await um("bia",
  "select criar_aposta($1, 'dupla_vence', null, 'truco', 'fichas', null, 5, $2, 'B') as id", [gid, m1])).id;
await como("bia", "select cancelar_aposta($1)", [apLeva]);
const apSolta = (await um("bia",
  "select criar_aposta($1, 'dupla_vence', null, 'truco', 'fichas', null, 5, $2, 'B') as id", [gid, m1])).id;
await como("pedro", "select topar_aposta($1)", [apZeca]);
passo("antes de começar: muda a própria aposta, retira, dono aposta pelo visitante");

const match = (await um("ana",
  "select iniciar_partida($1, 'Os Brabos', 'Zé Ruela', 'item', $2, 1) as id", [m1, cerveja])).id;

await falha("bia", "select cancelar_aposta($1)", [apSolta], /já começou/);
await falha("zeca", "select editar_aposta($1, 'fichas', null, 99, 'A')", [apZeca], /topou|começou/);
await como("bia", "select topar_aposta($1)", [apTio]);
passo("partida iniciada: aposta não pode mais ser retirada nem mudada");

// --- pontuação: só a dona da mesa (Ana) e admin (Leo)
await falha("pedro", "select marcar_ponto($1, 'A', 'truco')", [match], /dono da mesa/);
await falha("zeca", "select marcar_ponto($1, 'A', 'truco')", [match], /dono da mesa/);
let st = await um("ana", "select * from marcar_ponto($1, 'A', 'truco')", [match]);
assert.equal(st.placar_a, 3);
assert.equal(st.carteador_pos, 1);
st = await um("ana", "select * from marcar_ponto($1, 'B', '+1')", [match]);
assert.equal(st.placar_b, 1);
st = await um("ana", "select * from marcar_ponto($1, null, 'desfazer')", [match]);
assert.equal(st.placar_b, 0);
assert.equal(st.carteador_pos, 1);
st = await um("ana", "select * from marcar_ponto($1, 'A', '-1')", [match]);
assert.equal(st.placar_a, 2);
st = await um("ana", "select * from marcar_ponto($1, null, 'carta')", [match]);
assert.equal(st.carteador_pos, 2);
st = await um("leo", "select * from marcar_ponto($1, 'A', '+1')", [match]);
assert.equal(st.placar_a, 3);
passo("só a dona da mesa (e admin) pontua; +3, +1, desfazer, -1, passar carta");

st = await um("ana", "select * from marcar_ponto($1, 'A', 'doze')", [match]);
assert.equal(st.quedas_a, 1);
assert.equal(st.placar_a, 0);
st = await um("ana", "select * from marcar_ponto($1, null, 'desfazer')", [match]);
assert.equal(st.quedas_a, 0);
assert.equal(st.placar_a, 3);
await um("ana", "select * from marcar_ponto($1, 'A', 'doze')", [match]);
st = await um("ana", "select * from marcar_ponto($1, 'A', 'doze')", [match]);
assert.equal(st.status, "encerrada");
assert.equal(st.vencedor, "A");
passo("queda em 12, desfazer volta a queda, melhor de 3 encerra");

const dividas = (await como("ana",
  "select devedor_id, credor_id from debts where origem_tipo = 'truco'")).rows;
const pares = dividas.map((d) => [d.devedor_id, d.credor_id].join(">")).sort();
assert.deepEqual(pares, [`${ids.pedro}>${ids.leo}`, `${tio}>${ids.ana}`].sort());
passo("dupla perdedora: cada um (inclusive o visitante) deve 1 🍺 a um vencedor");

const w1 = await um("zeca", "select status, vencedor_lado from wagers where id = $1", [apZeca]);
assert.deepEqual([w1.status, w1.vencedor_lado], ["resolvido", "A"]);
const w2 = await um("zeca", "select status, vencedor_lado from wagers where id = $1", [apTio]);
assert.deepEqual([w2.status, w2.vencedor_lado], ["resolvido", "B"]);
assert.equal((await um("zeca", "select status from wagers where id = $1", [apSolta])).status, "cancelado");
assert.equal((await um("zeca", "select devedor_id from debts where origem_id = $1", [apTio])).devedor_id, tio);
passo("apostas por fora resolvidas sozinhas (visitante perdeu e ficou devendo)");

// a mesa volta sozinha e vazia; a partida antiga guarda os jogadores dela
const m1b = (await um("leo", "select id from mesas where group_id = $1 and numero = 3 and status = 'aberta'", [gid])).id;
assert.notEqual(m1b, m1);
assert.equal((await um("leo", "select status from mesas where id = $1", [m1])).status, "encerrada");
const lugaresDe = async (id) => (await como("leo", "select user_id, posicao from mesa_players where mesa_id = $1 order by posicao", [id])).rows;
assert.equal((await lugaresDe(m1b)).length, 0);
assert.equal((await lugaresDe(m1)).length, 4);
assert.equal((await um("leo", "select marcador_id from mesas where id = $1", [m1b])).marcador_id, null);
passo("partida acabou: a mesa reabre vazia e o histórico fica intacto");

await falha("ana", "select marcar_ponto($1, 'A', '+1')", [match], /acabou/);
await falha("ana", "select encerrar_partida($1, 'A')", [match], /acabou/);

// --- admin remove mesa abandonada; número reaproveitado
const m2 = (await um("leo", "select criar_mesa($1) as id", [gid])).id;
await como("bia", "select sentar($1, 0)", [m2]);
await como("zeca", "select sentar($1, 1)", [m2]);
const match2 = (await um("bia", "select iniciar_partida($1, '', '', null, null, 0) as id", [m2])).id;
await falha("zeca", "select marcar_ponto($1, 'A', '+1')", [match2], /dono da mesa/);
await falha("bia", "select encerrar_mesa($1)", [m2], /só admin remove/);
await como("leo", "select encerrar_mesa($1)", [m2]);
assert.equal((await como("leo", "select 1 from mesas where group_id = $1 and numero = 4 and status <> 'encerrada'", [gid])).rows.length, 0);
assert.equal((await um("bia", "select status from truco_matches where id = $1", [match2])).status, "cancelada");
const m3 = (await um("leo", "select criar_mesa($1) as id", [gid])).id;
assert.equal((await um("leo", "select numero from mesas where id = $1", [m3])).numero, 4);
passo("admin remove mesa abandonada (anula a partida, não reabre); número reaproveitado");

// --- palpites de texto livre
const p = (await um("ana",
  "select criar_aposta($1, 'texto_livre', 'Pedro erra o pênalti', 'futebol', 'item', $2, 1, null, null, $3) as id",
  [gid, cerveja, ids.pedro])).id;
await falha("zeca", "select topar_aposta($1)", [p], /outra pessoa/);
await como("pedro", "select topar_aposta($1)", [p]);
await falha("zeca", "select marcar_resultado($1, 'A')", [p], /Só quem está/);
await como("ana", "select marcar_resultado($1, 'A')", [p]);
await falha("ana", "select confirmar_resultado($1)", [p], /outro lado/);
await como("pedro", "select contestar_resultado($1)", [p]);
await como("ana", "select marcar_resultado($1, 'A')", [p]);
await como("pedro", "select confirmar_resultado($1)", [p]);
assert.equal((await como("ana", "select * from debts where origem_id = $1", [p])).rows.length, 1);
passo("palpite direto: só o desafiado topa; marcar → contestar → confirmar");

const p3 = (await um("bia",
  "select criar_aposta($1, 'texto_livre', 'não ganham esse round', 'valorant', 'fichas', null, 10) as id", [gid])).id;
await como("leo", "select topar_aposta($1)", [p3]);
await como("bia", "select marcar_resultado($1, 'B')", [p3]);
await db.query("update wagers set marcado_em = now() - interval '25 hours' where id = $1", [p3]);
assert.equal((await um(null, "select auto_confirmar() as n")).n, 1);
assert.equal((await um("bia", "select credor_id from debts where origem_id = $1", [p3])).credor_id, ids.leo);
passo("sem contestação em 24h confirma sozinho");

const p4 = (await um("bia",
  "select criar_aposta($1, 'texto_livre', 'empata', 'sinuca', 'fichas', null, 10) as id", [gid])).id;
await como("zeca", "select topar_aposta($1)", [p4]);
await como("zeca", "select marcar_resultado($1, 'empate')", [p4]);
await como("bia", "select confirmar_resultado($1)", [p4]);
assert.equal((await um("bia", "select status from wagers where id = $1", [p4])).status, "empate");
passo("empate anula sem gerar dívida");

// --- acertos: Ana recebe 1 🍺 do visitante (truco); Prima é cuidada pela Ana
await como("ana", "select receber($1, $2, 'item', $3, 1)", [gid, tio, cerveja]);
const restoTio = await um("ana",
  "select coalesce(sum(quantidade - quitado_qtd), 0)::int r from debts where devedor_id = $1 and credor_id = $2 and origem_tipo = 'truco'",
  [tio, ids.ana]);
assert.equal(restoTio.r, 0);
await falha("bia", "select receber($1, $2, 'item', $3, 1, $4)", [gid, ids.leo, cerveja, prima], /dono da mesa, um admin ou quem cadastrou/);
await falha("leo", "select receber($1, $2, 'item', $3, 2)", [gid, ids.pedro, cerveja], /mais do que/);
await como("leo", "select receber($1, $2, 'item', $3, 1)", [gid, ids.pedro, cerveja]);
passo("Recebi (inclusive de visitante); não deixa receber mais do que devem");

// sem compensar: bia deve 10 ao leo e leo passa a dever 4 à bia; as duas dívidas continuam de pé
const p5 = (await um("leo",
  "select criar_aposta($1, 'texto_livre', 'mata 3', 'valorant', 'fichas', null, 4, null, null, $2) as id", [gid, ids.bia])).id;
await como("bia", "select topar_aposta($1)", [p5]);
await como("bia", "select marcar_resultado($1, 'B')", [p5]);
await como("leo", "select confirmar_resultado($1)", [p5]);
const entreLeoBia = async () => {
  const { rows } = await como("leo",
    "select devedor_id, quantidade - quitado_qtd as resto from debts where unidade = 'fichas' and origem_tipo = 'wager' and devedor_id in ($1, $2) and credor_id in ($1, $2)",
    [ids.leo, ids.bia]);
  return { leoDeve: rows.find((r) => r.devedor_id === ids.leo).resto, biaDeve: rows.find((r) => r.devedor_id === ids.bia).resto };
};
assert.deepEqual(await entreLeoBia(), { leoDeve: 4, biaDeve: 10 });
await falha("leo", "select receber($1, $2, 'fichas', null, 11)", [gid, ids.bia], /mais do que/);
await como("leo", "select receber($1, $2, 'fichas', null, 7)", [gid, ids.bia]);
assert.deepEqual(await entreLeoBia(), { leoDeve: 4, biaDeve: 3 });
await como("bia", "select receber($1, $2, 'fichas', null, 4)", [gid, ids.leo]);
assert.deepEqual(await entreLeoBia(), { leoDeve: 0, biaDeve: 3 });
passo("dívidas não se compensam: cada Recebi abate só o que aquela pessoa deve");

// admin
await falha("ana", "select atualizar_turma($1, 'x', 200, 12, true)", [gid], /Só admin/);
await como("leo", "select atualizar_turma($1, null, 200, 12, false)", [gid]);
await falha("leo", "select definir_papel($1, $2, 'membro')", [gid, ids.leo], /pelo menos um admin/);
await falha("leo", "select definir_papel($1, $2, 'admin')", [gid, tio], /Visitante/);
passo("permissões de admin");

// --- admin na aba Acertos (0002_admin.sql)
const dBia = await um("leo", "select * from debts where devedor_id = $1 and quitado_qtd < quantidade limit 1", [ids.bia]);
assert.ok(dBia);
await falha("ana", "select admin_quitar_dividas($1, $2)", [gid, dBia.id], /Só admin/);
assert.equal((await um("leo", "select admin_quitar_dividas($1, $2) as n", [gid, dBia.id])).n, 1);
const dBiaDepois = await um("leo", "select quitado_qtd, quantidade, zerada from debts where id = $1", [dBia.id]);
assert.equal(dBiaDepois.quitado_qtd, dBiaDepois.quantidade);
assert.equal(dBiaDepois.zerada, true);
passo("admin quita uma dívida (fica no histórico como quitada pelo admin)");

const dPenalti = await um("leo", "select id from debts where origem_id = $1", [p]);
await falha("bia", "select admin_apagar_dividas($1, $2)", [gid, dPenalti.id], /Só admin/);
assert.equal((await um("leo", "select admin_apagar_dividas($1, $2) as n", [gid, dPenalti.id])).n, 1);
assert.equal((await como("leo", "select 1 from debts where id = $1", [dPenalti.id])).rows.length, 0);
assert.equal((await como("leo", "select 1 from wagers where id = $1", [p])).rows.length, 0);
passo("admin apaga dívida de aposta: some a dívida e a aposta (limpar testes)");

const teste = (await um("bia", "select criar_aposta($1, 'texto_livre', 'teste', 'outro', 'fichas', null, 3) as id", [gid])).id;
await falha("bia", "select admin_apagar_aposta($1)", [teste], /Só admin/);
await como("leo", "select admin_apagar_aposta($1)", [teste]);
await como("leo", "select admin_apagar_aposta($1)", [apZeca]);
assert.equal((await como("leo", "select 1 from wagers where id in ($1, $2)", [teste, apZeca])).rows.length, 0);
assert.equal((await como("leo", "select 1 from debts where origem_id = $1", [apZeca])).rows.length, 0);
passo("admin apaga aposta aberta ou resolvida (e a dívida que ela gerou)");

assert.ok((await um("leo", "select admin_quitar_dividas($1) as n", [gid])).n >= 1);
assert.equal((await um("leo", "select count(*)::int c from debts where group_id = $1 and quitado_qtd < quantidade", [gid])).c, 0);
assert.ok((await um("leo", "select admin_apagar_dividas($1) as n", [gid])).n >= 1);
assert.equal((await um("leo", "select count(*)::int c from debts where group_id = $1", [gid])).c, 0);
assert.equal((await um("leo", "select count(*)::int c from truco_matches where group_id = $1", [gid])).c, 2);
passo("admin quita todas e depois apaga todas (partidas continuam no histórico)");

// mesa 1 (encerrada, com partida, jogadas, apostas por fora e votos)
await falha("ana", "select admin_apagar_mesa($1)", [m1], /Só admin/);
await como("leo", "select admin_apagar_mesa($1)", [m1]);
assert.equal((await como("leo", "select 1 from mesas where id = $1", [m1])).rows.length, 0);
assert.equal((await como("leo", "select 1 from truco_matches where id = $1", [match])).rows.length, 0);
assert.equal((await como("leo", "select 1 from truco_events where match_id = $1", [match])).rows.length, 0);
assert.equal((await como("leo", "select 1 from wagers where mesa_id = $1 or id in ($2, $3)", [m1, apTio, apSolta])).rows.length, 0);
passo("admin apaga uma mesa inteira (partida, jogadas e apostas dela)");

await falha("bia", "select admin_limpar_historico($1)", [gid], /Só admin/);
await como("leo", "select admin_limpar_historico($1)", [gid]);
for (const tabela of ["truco_matches", "wagers", "debts"]) {
  assert.equal((await um("leo", `select count(*)::int c from ${tabela} where group_id = $1`, [gid])).c, 0, tabela);
}
const depois = (await como("leo", "select numero, status from mesas where group_id = $1 order by numero", [gid])).rows;
assert.deepEqual(depois.map((x) => x.numero), [1, 2, 3, 4]);
assert.ok(depois.every((x) => x.status === "aberta"));
assert.equal((await um("leo", "select count(*)::int c from mesa_players where group_id = $1", [gid])).c, 0);
assert.ok((await um("leo", "select count(*)::int c from group_members where group_id = $1", [gid])).c >= 4);
assert.ok((await um("leo", "select count(*)::int c from items where group_id = $1", [gid])).c >= 3);
passo("admin limpa todo o histórico (pessoas, itens e mesas fixas continuam)");

// --- várias turmas (0003_turmas.sql)
const g2 = await um("ana", "select * from criar_turma('Bar do Zé')");
assert.equal((await um("ana", "select papel from group_members where group_id = $1 and user_id = $2", [g2.id, ids.ana])).papel, "admin");
assert.equal((await um("leo", "select is_member($1) as m", [g2.id])).m, false);
await falha("leo", "select adicionar_membro($1, 'pedro')", [g2.id], /Só admin/);
await falha("ana", "select adicionar_membro($1, 'ninguem')", [g2.id], /Não achei/);
await como("ana", "select adicionar_membro($1, ' PEDRO ')", [g2.id]);
await falha("ana", "select adicionar_membro($1, 'pedro')", [g2.id], /já está/);
assert.equal((await um("pedro", "select is_member($1) as m", [g2.id])).m, true);
assert.equal((await um("pedro", "select papel from group_members where group_id = $1 and user_id = $2", [g2.id, ids.pedro])).papel, "membro");
const m2t = (await um("ana", "select criar_mesa($1, 'Fundo') as id", [g2.id])).id;
assert.equal((await um("ana", "select numero from mesas where id = $1", [m2t])).numero, 3);
passo("nova turma: quem cria é admin; admin adiciona quem já tem conta pelo usuário");

assert.equal((await um("bia", "select entrar_turma_padrao() as id")).id, gid);
passo("cadastro sem convite continua indo pra turma principal");

await falha("pedro", "select admin_apagar_turma($1)", [g2.id], /Só admin/);
await falha("leo", "select admin_apagar_turma($1)", [g2.id], /Só admin/);
await como("ana", "select admin_apagar_turma($1)", [g2.id]);
assert.equal((await como("ana", "select 1 from groups where id = $1", [g2.id])).rows.length, 0);
assert.equal((await como("ana", "select 1 from mesas where id = $1", [m2t])).rows.length, 0);
assert.equal((await um("pedro", "select is_member($1) as m", [gid])).m, true);
assert.equal((await como("pedro", "select 1 from usuarios where id = $1", [ids.pedro])).rows.length, 1);
passo("admin apaga a turma: some tudo dela, as contas e as outras turmas continuam");

// --- nomes sem repetir
await assert.rejects(() => db.query("insert into usuarios (id, login, senha_hash) values ($1, 'leo', 'x')", [ids.fora]), /unique|duplicate/i);
await falha("bia", "select salvar_perfil('LEO ', '🍺', '#39FF14', null)", [], /Já tem alguém chamado .* na turma/);
await como("bia", "select salvar_perfil('Bia', '🍺', '#39FF14', null)");
const { rows: [outroLeo] } = await db.query("insert into profiles (apelido) values ('Leo') returning id");
await db.query("insert into usuarios (id, login, senha_hash) values ($1, 'leo2', 'x')", [outroLeo.id]);
ids.leo2 = outroLeo.id;
await falha("leo2", "select entrar_turma_padrao()", [], /Já tem alguém chamado "Leo" nessa turma/);
await como("leo2", "select salvar_perfil('Leozinho', '🍺', '#39FF14', null)");
assert.equal((await um("leo2", "select entrar_turma_padrao() as id")).id, gid);
const g3 = await um("bia", "select * from criar_turma('Sinuca')");
await como("bia", "select criar_visitante($1, 'Pedro')", [g3.id]);
await falha("bia", "select adicionar_membro($1, 'pedro')", [g3.id], /Já tem alguém chamado "pedro" nessa turma/);
passo("usuário não repete no site; apelido não repete dentro da turma (cadastro, troca, adicionar)");

// --- mão às escuras (0005_escuras.sql)
const mE = (await um("leo", "select criar_mesa($1, 'Escuras') as id", [gid])).id;
await como("leo", "select sentar($1, 0)", [mE]);
await como("pedro", "select sentar($1, 1)", [mE]);
const pE = (await um("leo", "select iniciar_partida($1, 'A', 'B', null, null, 0, null, 12, true) as id", [mE])).id;
const jogar = (d, t) => um("leo", "select * from marcar_ponto($1, $2, $3)", [pE, d, t]);
await jogar("A", "nove"); await jogar("A", "+1");
await jogar("B", "nove"); await jogar("B", "+1");
let e1 = await jogar("A", "+1");
assert.equal(e1.escuras, false);
e1 = await jogar("B", "+1");
assert.deepEqual([e1.placar_a, e1.placar_b, e1.escuras], [11, 11, true]);
passo("11 a 11 entra sozinho no às escuras");

await falha("leo", "select marcar_ponto($1, 'A', 'truco')", [pE], /marque as vazas/);
await falha("pedro", "select marcar_ponto($1, 'A', 'vaza')", [pE], /dono da mesa/);
e1 = await jogar("A", "vaza");
e1 = await jogar("B", "vaza");
assert.equal(e1.vazas, "AB");
assert.equal(e1.quedas_a, 0);
e1 = await jogar("A", "vaza");
assert.deepEqual([e1.quedas_a, e1.placar_a, e1.placar_b, e1.escuras, e1.vazas], [1, 0, 0, false, ""]);
passo("às escuras: melhor de 3 vazas, quem faz 2 leva a queda (sem truco no meio)");

e1 = await jogar(null, "desfazer");
assert.deepEqual([e1.quedas_a, e1.placar_a, e1.placar_b, e1.escuras, e1.vazas], [0, 11, 11, true, "AB"]);
e1 = await jogar(null, "desfazer");
assert.equal(e1.vazas, "A");
await jogar("B", "vaza");
await jogar("B", "vaza");
e1 = await um("leo", "select * from truco_matches where id = $1", [pE]);
assert.deepEqual([e1.quedas_b, e1.placar_a, e1.placar_b], [1, 0, 0]);
passo("desfazer volta a vaza (e a queda); B vira e leva");

e1 = await jogar(null, "escuras");
assert.equal(e1.escuras, true);
await falha("leo", "select marcar_ponto($1, 'A', '+1')", [pE], /marque as vazas/);
e1 = await jogar(null, "escuras");
assert.equal(e1.escuras, false);
e1 = await jogar("A", "+1");
assert.equal(e1.placar_a, 1);
await falha("leo", "select marcar_ponto($1, 'A', 'vaza')", [pE], /não está ligada/);
passo("botão liga/desliga o às escuras na mão");

await como("leo", "select encerrar_mesa($1)", [mE]);

// --- montar a mesa de uma vez (0007_mesas_fixas.sql)
const mesaN = async (n) => (await um("leo", "select id from mesas where group_id = $1 and numero = $2 and status <> 'encerrada'", [gid, n])).id;
const mA = await mesaN(1);
const mB = await mesaN(2);
const montar = (quem, mesa, l) => como(quem, "select definir_assentos($1, $2, $3, $4, $5)", [mesa, ...l]);
await montar("pedro", mA, [ids.leo, ids.ana, ids.pedro, ids.bia]);
let lug = (await lugaresDe(mA)).map((x) => x.user_id);
assert.deepEqual(lug, [ids.leo, ids.ana, ids.pedro, ids.bia]);
assert.deepEqual((await lugaresDe(mA)).map((x) => x.posicao), [0, 1, 2, 3]);
// troca os dois da dupla A e deixa um lugar vazio
await montar("pedro", mA, [ids.pedro, ids.ana, ids.leo, null]);
lug = await lugaresDe(mA);
assert.deepEqual(lug.map((x) => x.user_id), [ids.pedro, ids.ana, ids.leo]);
await falha("pedro", "select definir_assentos($1, $2, $2)", [mA, ids.leo], /dois lugares/);
await falha("pedro", "select definir_assentos($1, $2)", [mA, ids.fora], /não é da turma/);
passo("montar a mesa: troca de lugar de uma vez; recusa repetido e quem é de fora");

// sentar em outra mesa livre tira da primeira
await montar("zeca", mB, [ids.leo, ids.zeca, null, null]);
assert.deepEqual((await lugaresDe(mA)).map((x) => x.user_id), [ids.pedro, ids.ana]);
await como("bia", "select sentar($1, 3)", [mB]);
assert.equal((await lugaresDe(mB)).length, 3);
passo("quem senta em outra mesa livre sai da primeira");

// com a partida rolando
const pB = (await um("zeca", "select iniciar_partida($1, '', '', null, null, 0, 3) as id", [mB])).id;
assert.equal((await um("zeca", "select carteador_pos from truco_matches where id = $1", [pB])).carteador_pos, 3);
assert.equal((await um("zeca", "select marcador_id from mesas where id = $1", [mB])).marcador_id, ids.zeca);
await falha("pedro", "select definir_assentos($1, $2)", [mA, ids.zeca], /zeca está jogando na Mesa 2/);
await falha("pedro", "select sentar($1, 2, $2)", [mA, ids.bia], /bia|Bia/);
await falha("pedro", "select definir_assentos($1, $2, $3)", [mB, ids.pedro, ids.ana], /só quem marca/);
await falha("zeca", "select definir_assentos($1, $2, $3, null, null)", [mB, ids.bia, ids.zeca], /dentro da dupla/);
await montar("zeca", mB, [ids.leo, ids.bia, null, ids.zeca]);
assert.deepEqual((await lugaresDe(mB)).map((x) => [x.user_id, x.posicao]), [[ids.leo, 0], [ids.bia, 1], [ids.zeca, 3]]);
await montar("leo", mB, [ids.leo, ids.zeca, ids.bia, null]);
passo("partida rolando: quem marca troca dentro da dupla; admin muda tudo; ninguém joga em duas mesas");

// anular reabre; quem saiu da turma não volta pra mesa
await como("leo", "select remover_membro($1, $2)", [gid, ids.pedro]);
assert.deepEqual((await lugaresDe(mA)).map((x) => x.user_id), [ids.ana]);
await como("zeca", "select encerrar_partida($1, null)", [pB]);
const mBnova = await mesaN(2);
assert.notEqual(mBnova, mB);
assert.equal((await lugaresDe(mBnova)).length, 0);
await montar("zeca", mBnova, [ids.leo, ids.zeca, ids.bia, null]);
await como("zeca", "select iniciar_partida($1, '', '', null, null, 0, 2) as id", [mBnova]);
assert.equal((await um("zeca", "select carteador_pos from truco_matches where mesa_id = $1", [mBnova])).carteador_pos, 2);
passo("anular a partida reabre a mesa; quem sai da turma sai das mesas livres");

console.log(`\n${ok} grupos de verificação OK`);

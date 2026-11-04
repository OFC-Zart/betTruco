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

// --- mesa: dono = quem criou; votação troca quem marca
const m1 = (await um("leo", "select criar_mesa($1, 'Mesa do fundo') as id", [gid])).id;
assert.equal((await um("leo", "select marcador_id from mesas where id = $1", [m1])).marcador_id, ids.leo);
await como("leo", "select sentar($1, 0)", [m1]);
await como("pedro", "select sentar($1, 1)", [m1]);
await como("ana", "select sentar($1, 2)", [m1]);
await falha("pedro", "select sentar($1, 3, $2)", [m1, tio], /dono da mesa/);
await como("leo", "select sentar($1, 3, $2)", [m1, tio]);
await falha("zeca", "select sentar($1, 3)", [m1], /ocupado/);
await falha("zeca", "select votar_marcador($1, $2)", [m1, ids.zeca], /sentado/);
await falha("ana", "select votar_marcador($1, $2)", [m1, tio], /tenha o app/);
await como("pedro", "select votar_marcador($1, $2)", [m1, ids.ana]);
await como("ana", "select votar_marcador($1, $2)", [m1, ids.ana]);
await como("leo", "select votar_marcador($1, $2)", [m1, ids.leo]);
assert.equal((await um("leo", "select marcador_id from mesas where id = $1", [m1])).marcador_id, ids.ana);
passo("votação rápida: Ana (2 votos) vira dona da mesa; visitante sentado pelo dono");

await falha("pedro", "select iniciar_partida($1, 'A', 'B')", [m1], /Só o dono/);

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

await falha("ana", "select marcar_ponto($1, 'A', '+1')", [match], /acabou/);
await falha("ana", "select encerrar_partida($1, 'A')", [match], /acabou/);

// --- admin fecha mesa abandonada; número reaproveitado
const m2 = (await um("bia", "select criar_mesa($1) as id", [gid])).id;
await como("bia", "select sentar($1, 0)", [m2]);
await como("zeca", "select sentar($1, 1)", [m2]);
const match2 = (await um("bia", "select iniciar_partida($1, '', '', null, null, 0) as id", [m2])).id;
await falha("zeca", "select marcar_ponto($1, 'A', '+1')", [match2], /dono da mesa/);
await falha("bia", "select encerrar_mesa($1)", [m2], /Partida rolando/);
await como("leo", "select encerrar_mesa($1)", [m2]);
assert.equal((await um("bia", "select status from truco_matches where id = $1", [match2])).status, "cancelada");
const m3 = (await um("zeca", "select criar_mesa($1) as id", [gid])).id;
assert.equal((await um("zeca", "select numero from mesas where id = $1", [m3])).numero, 1);
passo("admin fecha mesa abandonada; número 1 reaproveitado");

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

// compensação: bia deve 10 ao leo; leo passa a dever 4 à bia → líquido 6
const p5 = (await um("leo",
  "select criar_aposta($1, 'texto_livre', 'mata 3', 'valorant', 'fichas', null, 4, null, null, $2) as id", [gid, ids.bia])).id;
await como("bia", "select topar_aposta($1)", [p5]);
await como("bia", "select marcar_resultado($1, 'B')", [p5]);
await como("leo", "select confirmar_resultado($1)", [p5]);
await falha("leo", "select receber($1, $2, 'fichas', null, 7)", [gid, ids.bia], /mais do que/);
await como("leo", "select receber($1, $2, 'fichas', null, 2)", [gid, ids.bia]);
const rows = (await como("leo",
  "select devedor_id, quantidade, quitado_qtd from debts where unidade = 'fichas' and origem_tipo = 'wager' and devedor_id in ($1, $2) and credor_id in ($1, $2)",
  [ids.leo, ids.bia])).rows;
assert.equal(rows.find((r) => r.devedor_id === ids.leo).quitado_qtd, 4);
const biaDeve = rows.find((r) => r.devedor_id === ids.bia);
assert.equal(biaDeve.quantidade - biaDeve.quitado_qtd, 4);
passo("receber compensa o que eu devia e abate parcial (fichas separado de cerveja)");

// admin
await falha("ana", "select atualizar_turma($1, 'x', 200, 12, true)", [gid], /Só admin/);
await como("leo", "select atualizar_turma($1, null, 200, 12, false)", [gid]);
await falha("leo", "select definir_papel($1, $2, 'membro')", [gid, ids.leo], /pelo menos um admin/);
await falha("leo", "select definir_papel($1, $2, 'admin')", [gid, tio], /Visitante/);
passo("permissões de admin");

console.log(`\n${ok} grupos de verificação OK`);

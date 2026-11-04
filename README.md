# 🃏 Placar da Resenha

Placar ao vivo do truco e apostas amistosas da turma (truco, Valorant, sinuca, futebol…).
**Só registro:** fichas e itens (🍺, 🥤, 🍟). Nada de depósito, Pix, carteira ou odds —
o acerto de verdade é entre vocês, fora do site.

Feito com Next.js + Postgres. Roda de graça na Vercel com o banco Neon (que a própria
Vercel cria pra você com alguns cliques).

---

## Como funciona (resumo)

- **Cadastro com usuário e senha.** Quem cria a conta já cai direto na aba **Ao vivo**.
  O **primeiro** cadastro vira o dono/admin da turma; os outros entram como membros.
- **Ao vivo:** todas as mesas abertas, com placar atualizando sozinho (a cada ~2 s).
  Tocou na mesa, vê o placar, quem dá carta e as apostas.
- **Dono da mesa** = quem marca os pontos. Começa sendo quem criou a mesa; os jogadores
  podem fazer uma **votação rápida** pra escolher outro. Os outros só assistem.
- **Visitante:** amigo que não quer usar o app entra só com o nome. O dono da mesa
  senta ele, aposta e recebe por ele. Se um dia ele quiser o app, o admin cria um login
  e ele mantém todo o histórico.
- **Apostas:** cada um muda ou retira a própria aposta **até a partida começar**.
  Depois de começar, fica travada.
- **Esqueceu a senha?** O admin gera uma senha provisória (Turma → Membros → a pessoa).

---

## Rodar no seu PC (teste)

Não precisa instalar banco nenhum: sem configuração, o app usa um Postgres embutido
(fica na pasta `.dados-local`).

```bash
npm install
```

```bash
npm run dev
```

Abra <http://localhost:3000>. Pra testar no celular na mesma Wi-Fi, use o endereço que aparece
como "Network" no terminal (ex.: `http://192.168.1.103:3000`). Se o Windows perguntar sobre o
firewall, permita em "Redes privadas".

Testes das regras do banco (18 cenários):

```bash
npm run test:db
```

---

## Publicar na Vercel (grátis) — passo a passo

O código fica no GitHub (<https://github.com/OFC-Zart/betTruco>) e a Vercel publica
sozinha toda vez que chega uma mudança nele.

### 1. Criar o projeto na Vercel a partir do GitHub
1. Entre em <https://vercel.com/signup> e crie a conta com **Continue with GitHub**
   (plano **Hobby**, que é o grátis).
2. No painel: **Add New… → Project**.
3. Em *Import Git Repository*, ache **betTruco** e clique em **Import**
   (se não aparecer, clique em *Adjust GitHub App Permissions* e libere o repositório).
4. Não mude nada (o *Framework* já vem **Next.js**) e clique em **Deploy**.

O primeiro deploy sobe, mas o site vai mostrar **"Falta conectar o banco"** — é o próximo passo.

### 2. Criar o banco (Neon) — tudo pelo site da Vercel
1. No projeto, aba **Storage** → **Create Database** → escolha **Neon** (Serverless Postgres) → **Continue**.
2. Região: **São Paulo** (se não tiver, escolha a mais próxima, ex.: US East).
   Plano: **Free**. Clique em **Create**.
3. Na tela seguinte, **Connect** ao projeto marcando todos os ambientes
   (Production, Preview, Development).

A Vercel cria sozinha a variável `DATABASE_URL`. Você não precisa copiar nenhuma senha
ou chave. As tabelas são criadas automaticamente no primeiro acesso.

### 3. Publicar de novo (agora com o banco)
Aba **Deployments** → no deploy mais recente, menu **⋯** → **Redeploy** → **Redeploy**.

Abra o endereço do projeto (algo como `https://bet-truco.vercel.app`),
**crie a sua conta primeiro** (você vira o dono/admin) e mande o link pra galera.

> Daqui pra frente, toda mudança enviada pro GitHub (branch `main`) vira um deploy novo
> sozinho, em ~1 minuto.

**Alternativa sem GitHub:** `npx vercel login`, depois `npx vercel --prod` dentro da pasta.

### Dicas
- **Instalar no celular:** abra o site no Chrome do Android → menu ⋮ → **Instalar app**
  (iPhone: Compartilhar → *Adicionar à Tela de Início*).
- **Limites do plano grátis:** sobra muito pra uma turma de amigos. O banco Neon "dorme"
  quando ninguém usa e acorda sozinho no próximo acesso (a primeira tela pode levar ~1 s).
- O site fica configurado pra rodar em São Paulo (`vercel.json` → `regions: ["gru1"]`).

---

## Como as regras são garantidas

- Toda ação passa por funções no banco (`db/migracoes/0001_inicial.sql`) que conferem quem
  está pedindo: espectador não marca ponto, aposta não é retirada depois que a partida
  começa, só quem cuida do visitante age por ele, etc.
- As dívidas são geradas pelo banco, com trava contra duplicata (dois toques ao mesmo tempo
  não geram dívida dobrada).
- Truco: dupla perdedora valendo 1 🍺 por pessoa → cada perdedor deve 1 🍺 a um vencedor.
- Fichas e itens nunca se misturam (cerveja é cerveja, ficha é ficha).
- Senhas guardadas com hash (scrypt); sessão em cookie seguro (`httpOnly`).

## Estrutura

```
db/migracoes/          tabelas e regras (roda sozinho no 1º acesso)
lib/server/            banco, sessão/senha e dados de cada tela
app/api/               rotas: auth (cadastro/entrar/sair/senha), rpc, tela, eu, status
app/entrar             página inicial + cadastro/login
app/(app)/aovivo       mesas ao vivo + palpites abertos
app/(app)/mesa/[id]    placar, votação do dono, assentos/visitantes, apostas da mesa
app/(app)/palpites     apostas em qualquer coisa
app/(app)/acertos      quem deve o quê, Recebi, Cobrar no WhatsApp
app/(app)/turma        ranking, histórico, membros/visitantes, configurações
scripts/test-db.mjs    testes das regras do banco
```

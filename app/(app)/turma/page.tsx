"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Cabecalho } from "@/components/resenha/cabecalho";
import { AcoesMembro, AdicionarMembro, ListaMembros } from "@/components/resenha/membros";
import { ConviteTurma } from "@/components/resenha/turmas";
import { useTurma } from "@/components/resenha/turma-provider";
import { useToast } from "@/components/resenha/toast";
import { Avatar, Chips, Label, Rodape, Selo, Titulo, Vazio } from "@/components/resenha/ui";
import { useTela } from "@/lib/api";
import { calcularRanking, type Linha, type PartidaComJogadores } from "@/lib/ranking";
import { MODALIDADES, modalidade, textoValor, tempoAtras } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAgora } from "@/lib/use-agora";
import type { Debt, Member, Wager } from "@/lib/types";

type Aba = "ranking" | "historico" | "membros" | "config";

export default function TurmaPage() {
  const { turma, isAdmin, membros } = useTurma();
  const [aba, setAba] = useState<Aba>("ranking");
  const { dados } = useTela<{ partidas: PartidaComJogadores[]; apostas: Wager[]; dividas: Debt[] }>(
    `/api/tela/turma?turma=${turma.id}`,
    10_000,
  );
  const partidas = dados?.partidas ?? null;
  const apostas = dados?.apostas ?? [];
  const dividas = dados?.dividas ?? [];

  return (
    <>
      <Cabecalho titulo="TURMA" sub={`${membros.length} na turma · código ${turma.codigo_convite}`} />
      <Chips
        valor={aba}
        aoMudar={setAba}
        opcoes={[
          { id: "ranking", label: "🏆 Ranking" },
          { id: "historico", label: "📜 Histórico" },
          { id: "membros", label: "👥 Membros" },
          { id: "config", label: isAdmin ? "⚙️ Config" : "⚙️ Regras" },
        ]}
      />
      {aba === "ranking" && <Ranking partidas={partidas} apostas={apostas} dividas={dividas} />}
      {aba === "historico" && <Historico partidas={partidas} apostas={apostas} />}
      {aba === "membros" && <Membros />}
      {aba === "config" && <Config />}
      <Rodape />
    </>
  );
}

function Ranking({ partidas, apostas, dividas }: { partidas: PartidaComJogadores[] | null; apostas: Wager[]; dividas: Debt[] }) {
  const { itens, nome, perfil } = useTurma();
  const agora = useAgora();
  const r = useMemo(() => calcularRanking(partidas ?? [], apostas, dividas, itens), [partidas, apostas, dividas, itens]);
  if (!partidas) return <div className="mt-4 h-40 animate-pulse rounded-2xl bg-card" />;

  const nomeLinha = (l: Linha) => l.id.split("|").map((u) => nome(u)).join(" & ");
  const avatares = (l: Linha) => l.id.split("|").map((u) => <Avatar key={u} p={perfil(u)} tamanho="sm" />);
  const dias = r.caloteiro ? Math.floor((agora - new Date(r.caloteiro.created_at).getTime()) / 86_400_000) : 0;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Podio titulo="🃏 Rei do Truco" sub="mais vitórias" linhas={r.reiDoTruco} nomeLinha={nomeLinha} avatares={avatares} vazio="Ninguém ganhou nada ainda." />
      <Podio titulo="🤝 Dupla do Barulho" sub="melhor dupla" linhas={r.melhorDupla} nomeLinha={nomeLinha} avatares={avatares} vazio="Joguem em dupla pra aparecer aqui." />
      <Podio titulo="🔮 Vidente" sub="% de acerto nos palpites" linhas={r.vidente} nomeLinha={nomeLinha} avatares={avatares} vazio="Nenhum palpite resolvido ainda." />
      <Podio
        titulo={`${r.cerveja?.emoji ?? "🍺"} Patrocinador Oficial`}
        sub={`quem mais deve ${r.cerveja?.nome.toLowerCase() ?? "cerveja"}`}
        linhas={r.patrocinador}
        nomeLinha={nomeLinha}
        avatares={avatares}
        vazio="Ninguém devendo. Por enquanto…"
        cor="alerta"
      />
      <div className="rounded-2xl border border-alerta/30 bg-card p-4">
        <div className="font-display text-2xl tracking-wide">🐌 Caloteiro do Mês</div>
        <div className="mb-2 text-xs text-muted-foreground">dívida mais antiga em aberto</div>
        {r.caloteiro ? (
          <div className="flex items-center gap-3">
            <Avatar p={perfil(r.caloteiro.devedor_id)} tamanho="lg" />
            <div>
              <div className="text-lg font-bold">{nome(r.caloteiro.devedor_id)}</div>
              <div className="text-sm text-muted-foreground">
                deve <b className="text-alerta">{textoValor(r.caloteiro, itens)}</b> pro {nome(r.caloteiro.credor_id)} há{" "}
                {dias === 0 ? "menos de um dia" : `${dias} ${dias === 1 ? "dia" : "dias"}`}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Ninguém. Turma exemplar 😇</div>
        )}
      </div>
    </div>
  );
}

function Podio({
  titulo,
  sub,
  linhas,
  nomeLinha,
  avatares,
  vazio,
  cor = "neon",
}: {
  titulo: string;
  sub: string;
  linhas: Linha[];
  nomeLinha: (l: Linha) => string;
  avatares: (l: Linha) => React.ReactNode;
  vazio: string;
  cor?: "neon" | "alerta";
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="font-display text-2xl tracking-wide">{titulo}</div>
      <div className="mb-2 text-xs text-muted-foreground">{sub}</div>
      {linhas.length === 0 ? (
        <div className="text-sm text-muted-foreground">{vazio}</div>
      ) : (
        <ol className="flex flex-col gap-2">
          {linhas.map((l, i) => (
            <li key={l.id} className="flex items-center gap-2">
              <span className="w-6 text-center text-lg">{["🥇", "🥈", "🥉"][i]}</span>
              <span className="flex -space-x-2">{avatares(l)}</span>
              <span className={cn("min-w-0 flex-1 truncate", i === 0 && "font-bold")}>{nomeLinha(l)}</span>
              <span className={cn("font-placar text-sm", cor === "neon" ? "text-neon" : "text-alerta")}>{l.extra}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Historico({ partidas, apostas }: { partidas: PartidaComJogadores[] | null; apostas: Wager[] }) {
  const { membros, nome, itens } = useTurma();
  const [mod, setMod] = useState<string>("todas");
  const [pessoa, setPessoa] = useState("todos");
  const [periodo, setPeriodo] = useState("30");
  const agora = useAgora();

  const limite = periodo === "tudo" ? 0 : agora - Number(periodo) * 86_400_000;
  type Evento = { id: string; quando: string; mod: string; pessoas: string[]; node: React.ReactNode };
  const eventos: Evento[] = [];

  for (const p of partidas ?? []) {
    const players = p.mesas?.mesa_players ?? [];
    eventos.push({
      id: p.id,
      quando: p.encerrada_em ?? p.created_at,
      mod: "truco",
      pessoas: players.map((x) => x.user_id).filter(Boolean) as string[],
      node: (
        <>
          <div className="flex items-center gap-2">
            <span className="font-semibold">🃏 Mesa {p.mesas?.numero}</span>
            {p.vencedor ? <Selo>FIM</Selo> : <Selo cor="cinza">ANULADA</Selo>}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className={cn("truncate", p.vencedor === "A" && "font-bold text-neon")}>{p.nome_dupla_a}</span>
            <span className="font-placar text-lg">
              {p.placar_a}×{p.placar_b}
            </span>
            <span className={cn("truncate", p.vencedor === "B" && "font-bold text-neon")}>{p.nome_dupla_b}</span>
          </div>
        </>
      ),
    });
  }
  for (const w of apostas) {
    eventos.push({
      id: w.id,
      quando: w.confirmado_em ?? w.created_at,
      mod: w.modalidade,
      pessoas: [w.lado_a_user, w.lado_b_user].filter(Boolean) as string[],
      node: (
        <>
          <div className="text-sm">
            {modalidade(w.modalidade).emoji} <b>{nome(w.lado_a_user)}</b>: {w.tipo === "dupla_vence" ? `dupla ${w.alvo_dupla} ganha` : `“${w.texto}”`}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {w.status === "empate"
              ? "🤝 anulada"
              : `🏆 ${nome(w.vencedor_lado === "A" ? w.lado_a_user : w.lado_b_user)} levou ${textoValor(w, itens)}`}
            {" · vs "}
            {nome(w.lado_b_user)}
          </div>
        </>
      ),
    });
  }
  const filtrados = eventos
    .filter((e) => (mod === "todas" || e.mod === mod) && (pessoa === "todos" || e.pessoas.includes(pessoa)) && new Date(e.quando).getTime() >= limite)
    .sort((a, b) => b.quando.localeCompare(a.quando));

  return (
    <div className="mt-3">
      <div className="flex flex-col gap-2">
        <Chips valor={mod} aoMudar={setMod} opcoes={[{ id: "todas", label: "Tudo" }, ...MODALIDADES.map((m) => ({ id: m.id, label: `${m.emoji} ${m.nome}` }))]} />
        <Chips valor={pessoa} aoMudar={setPessoa} opcoes={[{ id: "todos", label: "Todo mundo" }, ...membros.map((m) => ({ id: m.user_id, label: `${m.profile.avatar} ${m.profile.apelido}` }))]} />
        <Chips
          valor={periodo}
          aoMudar={setPeriodo}
          opcoes={[
            { id: "7", label: "7 dias" },
            { id: "30", label: "30 dias" },
            { id: "tudo", label: "Desde sempre" },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {!partidas && <div className="h-32 animate-pulse rounded-2xl bg-card" />}
        {partidas && filtrados.length === 0 && <Vazio emoji="📜">Nada nesse filtro.</Vazio>}
        {filtrados.map((e) => (
          <div key={e.id} className="rounded-2xl border bg-card p-3">
            {e.node}
            <div className="mt-1 text-[11px] text-muted-foreground">{tempoAtras(e.quando)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Membros() {
  const { turma, membros, euId, isAdmin, rpc, recarregar, possoAgirPor } = useTurma();
  const toast = useToast();
  const [novoVisitante, setNovoVisitante] = useState("");
  const [aberto, setAberto] = useState<Member | null>(null);
  async function criarVisitante() {
    const id = await rpc("criar_visitante", { p_group: turma.id, p_apelido: novoVisitante.trim() });
    if (id) {
      toast(`${novoVisitante.trim()} entrou como visitante`, "ok");
      setNovoVisitante("");
      recarregar();
    }
  }

  const comApp = membros.filter((m) => !m.profile.visitante);
  const visitantes = membros.filter((m) => m.profile.visitante);

  return (
    <div className="mt-4">
      <ConviteTurma />

      <Titulo>📱 Com app ({comApp.length})</Titulo>
      <ListaMembros lista={comApp} euId={euId} aoAbrir={setAberto} />
      {isAdmin && <AdicionarMembro />}

      <Titulo>🙂 Visitantes ({visitantes.length})</Titulo>
      <p className="-mt-2 mb-2 text-xs text-muted-foreground">
        Amigo que não quer baixar o app: entra só com o nome. Quem marca a mesa (ou admin, ou quem cadastrou) aposta e recebe por ele.
      </p>
      {visitantes.length > 0 && <ListaMembros lista={visitantes} euId={euId} aoAbrir={setAberto} />}
      <div className="mt-2 flex gap-2">
        <Input placeholder="Nome do visitante" value={novoVisitante} maxLength={24} onChange={(e) => setNovoVisitante(e.target.value)} />
        <Button onClick={criarVisitante} disabled={!novoVisitante.trim()}>
          <UserPlus /> Add
        </Button>
      </div>

      {aberto && (
        <AcoesMembro m={aberto} podeCuidar={possoAgirPor(aberto.user_id)} isAdmin={isAdmin} euId={euId} aoFechar={() => setAberto(null)} />
      )}
    </div>
  );
}

function Config() {
  const { turma, isAdmin, itens, rpc, recarregar } = useTurma();
  const toast = useToast();
  const [nome, setNome] = useState(turma.nome);
  const [ficha, setFicha] = useState((turma.valor_ficha_centavos / 100).toString().replace(".", ","));
  const [alvo, setAlvo] = useState(String(turma.truco_pontos_alvo));
  const [md3, setMd3] = useState(turma.truco_melhor_de_3 ? "sim" : "nao");
  const [novoEmoji, setNovoEmoji] = useState("");
  const [novoNome, setNovoNome] = useState("");

  async function salvar() {
    const centavos = Math.round(parseFloat(ficha.replace(",", ".") || "0") * 100);
    const r = await rpc("atualizar_turma", {
      p_group: turma.id,
      p_nome: nome,
      p_valor_ficha_centavos: centavos,
      p_pontos_alvo: Number(alvo),
      p_melhor_de_3: md3 === "sim",
    });
    if (r !== undefined) {
      toast("Salvo ✔", "ok");
      recarregar();
    }
  }
  async function addItem() {
    if (!novoNome.trim()) return;
    if ((await rpc("salvar_item", { p_group: turma.id, p_item: null, p_nome: novoNome, p_emoji: novoEmoji })) !== undefined) {
      setNovoNome("");
      setNovoEmoji("");
      recarregar();
    }
  }
  async function removerItem(id: string) {
    if ((await rpc("remover_item", { p_item: id })) !== undefined) recarregar();
  }

  return (
    <div className="mt-2">
      {!isAdmin && <p className="mt-3 text-sm text-muted-foreground">Só admin muda isso. Você está vendo as regras da turma.</p>}
      <fieldset disabled={!isAdmin} className="disabled:opacity-70">
        <Label>Nome da turma</Label>
        <Input value={nome} maxLength={40} onChange={(e) => setNome(e.target.value)} />
        <Label>Quanto vale 1 ficha (só pra referência)</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">R$</span>
          <Input inputMode="decimal" value={ficha} onChange={(e) => setFicha(e.target.value.replace(/[^0-9,]/g, ""))} className="w-28 font-placar text-xl" />
        </div>
        <Label>Truco: partida até</Label>
        <Chips valor={alvo} aoMudar={setAlvo} opcoes={["12", "15", "24"].map((x) => ({ id: x, label: `${x} pontos` }))} />
        <Label>Melhor de 3 quedas</Label>
        <Chips valor={md3} aoMudar={setMd3} opcoes={[{ id: "sim", label: "Ligado" }, { id: "nao", label: "Desligado" }]} />
        {isAdmin && (
          <Button className="mt-4 w-full" onClick={salvar}>
            Salvar regras
          </Button>
        )}
      </fieldset>

      <Titulo>Itens da turma</Titulo>
      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {itens
          .filter((i) => i.ativo)
          .map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <span className="text-2xl">{i.emoji}</span>
              <span className="flex-1">{i.nome}</span>
              {isAdmin && (
                <Button size="sm" variant="ghost" aria-label={`Remover ${i.nome}`} onClick={() => removerItem(i.id)}>
                  <Trash2 className="text-muted-foreground" />
                </Button>
              )}
            </li>
          ))}
      </ul>
      {isAdmin && (
        <div className="mt-2 flex gap-2">
          <Input placeholder="🌭" value={novoEmoji} onChange={(e) => setNovoEmoji(e.target.value)} className="w-16 text-center text-xl" maxLength={8} />
          <Input placeholder="Novo item (ex.: Pastel)" value={novoNome} maxLength={24} onChange={(e) => setNovoNome(e.target.value)} />
          <Button onClick={addItem} disabled={!novoNome.trim()}>
            Add
          </Button>
        </div>
      )}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Suas configurações pessoais (apelido, avatar, Google) ficam em <Link href="/config" className="text-neon">Configurações</Link>.
      </p>
    </div>
  );
}

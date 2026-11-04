export type Papel = "admin" | "membro";
export type Dupla = "A" | "B";
export type Unidade = "fichas" | "item";
export type Modalidade = "truco" | "valorant" | "futebol" | "sinuca" | "baralho" | "outro";
export type StatusAposta = "aberto" | "valendo" | "aguardando" | "resolvido" | "empate" | "cancelado";
export type TipoJogada = "+1" | "-1" | "truco" | "seis" | "nove" | "doze" | "desfazer" | "carta" | "escuras" | "vaza";

export interface Profile {
  id: string;
  apelido: string;
  avatar: string;
  cor: string;
  whatsapp: string | null;
  /** amigo sem app (sem login); alguém da turma age por ele */
  visitante: boolean;
  criado_por: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  nome: string;
  codigo_convite: string;
  valor_ficha_centavos: number;
  truco_pontos_alvo: number;
  truco_melhor_de_3: boolean;
  criado_por: string;
  created_at: string;
}

export interface Member {
  user_id: string;
  papel: Papel;
  created_at: string;
  profile: Profile;
  tem_login: boolean;
}

export interface Item {
  id: string;
  group_id: string;
  nome: string;
  emoji: string;
  ativo: boolean;
}

export interface Mesa {
  id: string;
  group_id: string;
  numero: number;
  nome: string | null;
  jogo: "truco";
  status: "aberta" | "em_jogo" | "encerrada";
  criado_por: string;
  /** dono da mesa: quem marca os pontos */
  marcador_id: string | null;
  created_at: string;
  atualizado_em: string;
  encerrada_em: string | null;
}

export interface MesaPlayer {
  id: string;
  mesa_id: string;
  user_id: string;
  posicao: number;
  dupla: Dupla;
}

export interface TrucoMatch {
  id: string;
  mesa_id: string;
  group_id: string;
  nome_dupla_a: string;
  nome_dupla_b: string;
  pontos_alvo: number;
  melhor_de_3: boolean;
  valendo_unidade: Unidade | null;
  valendo_item_id: string | null;
  valendo_qtd: number;
  placar_a: number;
  placar_b: number;
  carteador_pos: number;
  quedas_a: number;
  quedas_b: number;
  /** mão às escuras (11 a 11): melhor de 3 vazas */
  escuras: boolean;
  /** vazas da mão às escuras, em ordem: ex. "AB" */
  vazas: string;
  status: "em_jogo" | "encerrada" | "cancelada";
  vencedor: Dupla | null;
  created_at: string;
  updated_at: string;
  encerrada_em: string | null;
}

export interface TrucoEvent {
  id: number;
  match_id: string;
  dupla: Dupla | null;
  pontos: number;
  tipo: TipoJogada;
  desfeito: boolean;
  criado_por: string | null;
  created_at: string;
}

export interface Wager {
  id: string;
  group_id: string;
  mesa_id: string | null;
  tipo: "texto_livre" | "dupla_vence";
  texto: string | null;
  alvo_dupla: Dupla | null;
  modalidade: Modalidade;
  unidade: Unidade;
  item_id: string | null;
  quantidade: number;
  criado_por: string;
  lado_a_user: string;
  lado_b_user: string | null;
  aberto: boolean;
  status: StatusAposta;
  resultado_proposto: Dupla | "empate" | null;
  vencedor_lado: Dupla | null;
  resolvido_por: string | null;
  marcado_em: string | null;
  confirmado_em: string | null;
  created_at: string;
}

/** Aposta com a mesa (e nomes das duplas) embutida, para descrever "qual dupla ganha". */
export interface WagerComMesa extends Wager {
  mesas: {
    numero: number;
    nome: string | null;
    status: Mesa["status"];
    marcador_id: string | null;
    truco_matches: Pick<TrucoMatch, "nome_dupla_a" | "nome_dupla_b" | "status">[];
  } | null;
}

export interface Debt {
  id: string;
  group_id: string;
  origem_tipo: "wager" | "truco";
  origem_id: string;
  devedor_id: string;
  credor_id: string;
  unidade: Unidade;
  item_id: string | null;
  quantidade: number;
  quitado_qtd: number;
  quitado_em: string | null;
  /** encerrada pelo admin ("zerar") */
  zerada: boolean;
  created_at: string;
}

/** Valor de uma aposta/dívida: fichas, ou N unidades de um item. */
export interface Valor {
  unidade: Unidade;
  item_id: string | null;
  quantidade: number;
}

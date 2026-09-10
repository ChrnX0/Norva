import type { BriefingWidget } from '@/domain/briefing';
import type { CostChange, Demand, Expiring, Run, Running } from '@/data/repository';
import type { Forecast, Reading } from '@/weather';

/**
 * O que a capa sabe, separado de como ela desenha.
 *
 * O dono pediu para ver as opções em vez de escolher no escuro ("faz tudo, eu
 * quero exemplos"), e três desenhos da mesma tela só são comparáveis se os três
 * receberem exatamente o mesmo dado. A consulta fica em `index.tsx`, uma só;
 * cada layout é uma função pura daqui para baixo.
 */
export type Summary = {
  /**
   * A idade da última cópia, e o que entrou depois dela. Nulo = nunca houve uma.
   *
   * Dois números e não um: "há 23 dias" já é alerta, mas "e 41 movimentos
   * entraram depois" é o que diz o TAMANHO do que se perde. Nenhum número aparece
   * sozinho.
   */
  copia: { diasAtras: number; desdeEla: number } | null;
  changes: CostChange[];
  /**
   * Quando um insumo mudou de preço pela última vez, ou nulo se nenhum nunca mudou.
   *
   * É o fato debaixo de "estável há doze dias" — a resposta calma da mesma pergunta
   * que `changes` responde quando algo mexeu. Ele existia no dado e em três
   * dicionários desde sempre, e nenhuma tela o escrevia: a capa mostrava o cartão de
   * preço só quando havia mudança, então a fábrica com o custo firme há dois meses
   * via um silêncio que parecia falta de dado.
   */
  steadySince: string | null;
  /** Units out of the kettle today, and on the same weekday a week back. */
  madeToday: number;
  madeThen: number;
  /** O dia anterior, que é a comparação que quem produz todo dia faz de cabeça. */
  madeYesterday: number;
  /** Os sete últimos dias, para a capa dizer o que é NORMAL e não só o que foi hoje. */
  series: { date: string; total: number }[];
  everMade: boolean;
  /** O que acaba dentro de uma semana, pelo consumo que o livro-razão viu. */
  shortly: Running[];
  /** Volumes que saíram hoje, e o que saiu sem caber em volume nenhum. */
  boxes: number;
  /** As mesmas caixas de ontem. Dezoito é dia bom numa fábrica e fraco noutra. */
  boxesYesterday: number;
  loose: { name: string; said: string }[];
  /** Tachos rodando agora. Vazio é o estado normal de uma fábrica parada. */
  running: { id: string; productName: string; openedAt: string }[];
  /** O que os clientes pediram para os próximos dias, contra o que a fábrica tem. */
  demand: Demand[];
  /** Até que dia a pergunta dos pedidos foi feita. */
  demandThrough: string;
  /** As últimas corridas, uma linha cada: total do dia não distingue 3x100 de 1x300. */
  runs: Run[];
  /** Quanto tempo o estoque dura, do mais apertado ao mais folgado. */
  cover: Running[];
  /** O que vence primeiro DO QUE ESTÁ NA FÁBRICA. */
  expiring: Expiring[];
  /** Perdas do mês e do mês anterior, em dinheiro, e o motivo que mais pesou. */
  lossesNow: number;
  lossesBefore: number;
  lossesWorst: { reason: string; cents: number } | null;
  /** Quem recebe hoje pelo acordo, e se a carga já foi. */
  dueToday: { id: string; name: string; sent: boolean }[];
  /** O dinheiro parado em insumo e embalagem. */
  heldCents: number;
};

export type BriefingView = {
  data: Summary | null;
  /**
   * O que a leitura do dia pegou, quando pegou.
   *
   * Sem isto a capa esperava para sempre: `data` nulo virava "carregando", e uma
   * consulta que falhou é indistinguível de uma que ainda não voltou.
   */
  erro?: Error | null;
  /** Ler de novo. A falha só é honesta se ela oferecer a saída. */
  denovo?: () => void;
  sky: Reading | null;
  weather: Forecast | null;
  /** Pedido que falta produzir, já ordenado pelo tamanho da falta. */
  shortForOrders: (Demand & { missing: number })[];
  /** O que mexeu de preço, um por insumo. */
  moved: CostChange[];
  /**
   * As peças da capa, na ordem que a casa combinou e já sem o que este aparelho
   * escondeu. Quem resolve isso é o domínio; a tela só desenha o que recebe.
   */
  layout: BriefingWidget[];
  /** As peças que a casa quer em meia coluna. Vazio = tudo inteiro. */
  meias: string[];
  go: (route: string) => void;
};

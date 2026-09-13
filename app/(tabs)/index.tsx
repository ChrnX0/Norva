import { useRouter } from 'expo-router';
import { amountOf, type Rate } from '@/domain/money';
import { faltaProduzir } from '@/domain/picking';
import {
  alertSettings,
  countMovements,
  deliveriesOf,
  expiringSoon,
  listItems,
  listProducts,
  listRecipes,
  listPlaces,
  lossesOn,
  openProductionRuns,
  stockAgainstOrders,
  productionBetween,
  productionOn,
  recentRuns,
  runningOut,
  briefingHalf,
  briefingHidden,
  briefingOrder,
  lastCostMove,
  recentCostChanges,
  shipmentsOn,
  type LossRow,
  onlyResells,
} from '@/data/repository';
import { ultimaCopia } from '@/data/backup';
import { empresaDaqui } from '@/data/empresa';
import { unidadeEAsNossasDeFora, unidadeDaqui } from '@/data/unidade';
import { reading, type Forecast } from '@/weather';
import { forecastForScreen } from '@/weather/live';
import { useQuery } from '@/data/useQuery';
import { daysUntilNextDelivery } from '@/domain/agreement';
import { precisaComprar } from '@/domain/alerts';
import { observedLeadTimeDays } from '@/domain/cost';
import { briefingLayout } from '@/domain/briefing';

import { nowIso } from '@/data/db';
import { dailySeries, daysBetween, dayWindow, localDate } from '@/domain/day';
import { boxesOf } from '@/domain/units';
import { formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider } from '@/theme/ThemeProvider';
import { Mosaic } from '@/home/Mosaic';
import type { BriefingView, Summary } from '@/home/types';

/**
 * Até quantos dias de cobertura um insumo entra na lista de candidatos da capa.
 *
 * Não é a régua — quem decide é `precisaComprar`, com o prazo do fornecedor de cada
 * item. É um TETO, para a capa não pedir o histórico de entrega de todo o almoxarifado:
 * item que dura mais de um mês não é notícia de hoje por régua nenhuma, e nenhum
 * fornecedor deste produto leva trinta dias mais a folga.
 */
const TETO_DA_COMPRA = 30;

/**
 * Qual desenho da capa está no ar.
 *
 * O dono pediu para VER as três em vez de escolher por descrição. Enquanto ele
 * não aponta uma, esta constante é a chave; quando apontar, as outras duas saem
 * do repositório - layout sem chamador é a mesma dívida que este projeto já
 * pagou caro em outros lugares.
 */
/**
 * A capa é o Mosaico, e as outras duas saíram.
 *
 * `Editorial` e `Blocks` existiam para o dono comparar três desenhos da mesma
 * tela — e ele escolheu. A partir daí `LAYOUT` era uma constante que só tinha um
 * valor, e as outras duas eram código que ninguém chamava: exatamente o P1 do
 * CLAUDE.md, "quem chama isto no mesmo commit?". O custo delas não era o arquivo
 * parado, era o próximo widget — cada peça nova teria que ser escrita três
 * vezes, e duas delas ninguém veria.
 */

/**
 * The briefing, as the design canvas draws it.
 *
 * A dashboard shows totals; a briefing says what moved and what to do about it.
 * The owner already knows roughly how much stock is in the cold room - what
 * they cannot know without this app is that pulp went up 9% on Tuesday and took
 * three cents a unit with it.
 *
 * The canvas puts one number at fifty-six points and everything else around it:
 * what a unit costs, whether that moved, and the single action of the day. The
 * nine-row menu that used to live at the bottom of this screen is gone - the
 * tab bar and the "Mais" drawers reach every one of those routes, and a list
 * you must read before acting is the opposite of a briefing.
 *
 * TWO THINGS THE CANVAS DRAWS AND THIS SCREEN DOES NOT SHOW, deliberately:
 *
 *  - "1.200 picolés hoje" and "18 caixas enviadas". Both need a query with a
 *    date window, and this repository has never had one: `occurred_at` appears
 *    nine times in `repository.ts` and not once as a filter. They arrive with
 *    `productionOn()` and `shipmentsOn()`, each with the comparison Law 3
 *    demands - a bare count teaches nothing.
 *  - "estável há 12 dias". `item_cost_history` holds what it needs, and the
 *    query that reads it does not exist yet.
 *
 * Inventing any of the three would have been a number nobody could check on a
 * screen used to decide where money goes.
 */
export default function Home() {
  return (
    <AreaProvider area="sky">
      <Briefing />
    </AreaProvider>
  );
}

/**
 * O motivo que mais pesou nas perdas do mês, em dinheiro.
 *
 * "Sumiram quatro quilos" não muda decisão nenhuma; "quatro quilos venceram"
 * muda a compra, e "derreteram" muda a manutenção do freezer. Por isso a peça
 * conta o motivo e não só o total.
 */
function worstReason(rows: LossRow[]): { reason: string; cents: number } | null {
  const porMotivo = new Map<string, number>();
  // `?? 0` porque a peça da capa inteira só é montada quando há dinheiro: com o
  // portão fechado `lossesNow` dá zero e a peça não existe, então esta soma nunca
  // é lida. Ver a peça `perdas` em `src/home/Mosaic.tsx`.
  for (const r of rows) porMotivo.set(r.reason, (porMotivo.get(r.reason) ?? 0) + (r.valueCents ?? 0));
  const pior = [...porMotivo].sort((a, b) => b[1] - a[1])[0];
  return pior ? { reason: pior[0], cents: pior[1] } : null;
}

function Briefing() {
  const router = useRouter();
  const { locale } = useLocale();

  const { data, error, refresh } = useQuery<Summary | null>(async () => {
    // The factory's day, not the phone's last 24 hours - and the comparison is
    // the same weekday a week back, because a Monday and a Saturday are
    // different businesses and comparing them teaches nothing.
    const today = dayWindow(nowIso(), locale.timeZone);
    const then = dayWindow(nowIso(), locale.timeZone, -7);
    // Ontem entra ao lado, não no lugar: o dono pediu o dia anterior, e a
    // segunda contra segunda continua sendo a comparação que ensina alguma
    // coisa. São duas perguntas, e as duas cabem.
    const yesterday = dayWindow(nowIso(), locale.timeZone, -1);
    const lastWeek = dayWindow(nowIso(), locale.timeZone, -7);
    // Seis dias atrás mais hoje: sete colunas. A janela começa na meia-noite
    // local do primeiro dia para que a primeira coluna não nasça cortada.
    const weekAgo = dayWindow(nowIso(), locale.timeZone, -6);
    // Uma semana à frente, porque a pergunta do pedido é "dá tempo?", e ela só
    // tem resposta enquanto ainda dá: um pedido para sexta cobrado na sexta é
    // uma notícia, não uma decisão (Lei 4).
    const through = localDate(nowIso(), locale.timeZone, 7);
    // O dia da semana no fuso da FÁBRICA: ler o dia do relógio do aparelho dá o
    // dia errado para quem trabalha de madrugada num fuso e o servidor noutro.
    const weekday = new Date(`${localDate(nowIso(), locale.timeZone)}T00:00:00Z`).getUTCDay();

    // As janelas das peças novas. Trinta dias para perdas (é a janela em que uma
    // fábrica decide) e trinta para validade (o que vence depois disso não é
    // decisão de hoje - Lei 4, avise na data da decisão).
    const mes = dayWindow(nowIso(), locale.timeZone, -29);
    const mesAnterior = { de: dayWindow(nowIso(), locale.timeZone, -59), ate: dayWindow(nowIso(), locale.timeZone, -30) };
    const trintaDias = localDate(nowIso(), locale.timeZone, 30);

    const [
      changes,
      madeToday,
      madeThen,
      madeYesterday,
      sent,
      sentYesterday,
      running,
      shortlyCandidatos,
      demand,
      week,
      runs,
      cover,
      expiring,
      lossesNow,
      lossesBefore,
      places,
      stockItems,
      fichas,
      produtos,
      soRevende,
      regras,
    ] = await Promise.all([
      recentCostChanges(empresaDaqui(), 12),
      // A MESMA unidade das vizinhas logo abaixo. Sem isto a manchete contava as
      // duas cidades e o conselho contava uma, lado a lado na mesma tela — e a régua
      // mudava no meio sem ninguém dizer.
      productionOn(empresaDaqui(), today.from, today.to, { unidade: unidadeDaqui() }),
      productionOn(empresaDaqui(), then.from, then.to, { unidade: unidadeDaqui() }),
      productionOn(empresaDaqui(), yesterday.from, yesterday.to, { unidade: unidadeDaqui() }),
      shipmentsOn(empresaDaqui(), today.from, today.to, { unidade: unidadeDaqui() }),
      shipmentsOn(empresaDaqui(), yesterday.from, yesterday.to, { unidade: unidadeDaqui() }),
      openProductionRuns(empresaDaqui(), { unidade: unidadeDaqui() }),
      // **Os CANDIDATOS a "acabando", e não a resposta.** Quem decide é
      // `precisaComprar`, com o prazo do fornecedor de cada item — a mesma régua do
      // aviso e da ficha. Aqui o horizonte é só um teto para não pedir o prazo de
      // cinquenta itens: nenhum fornecedor deste projeto leva um mês, e o item que
      // acaba em mais de trinta dias não é notícia de hoje em régua nenhuma.
      runningOut(empresaDaqui(), lastWeek.from, today.to, 7, TETO_DA_COMPRA, {
        unidade: unidadeDaqui(),
      }),
      stockAgainstOrders(empresaDaqui(), through, unidadeDaqui(), { from: today.from, to: today.to }),
      productionBetween(empresaDaqui(), weekAgo.from, today.to, { unidade: unidadeDaqui() }),
      recentRuns(empresaDaqui(), 6, { unidade: unidadeDaqui() }),
      // Sem horizonte: aqui a pergunta não é "o que acaba esta semana" (isso é o
      // cartão de insumo) e sim "quanto tempo o estoque dura", que é o normal
      // contra o qual a semana se compara.
      runningOut(empresaDaqui(), lastWeek.from, today.to, 7, Number.POSITIVE_INFINITY, {
        unidade: unidadeDaqui(),
      }),
      // SEM local: o aviso de validade é sobre o lote, onde quer que ele esteja.
      //
      // Ele filtrava pelo almoxarifado, e o filtro silenciava o aviso EXATAMENTE
      // quando o lote saía — a soma por local de um lote que foi para a câmara
      // fria ou para a loja dá zero no almoxarifado, e o `HAVING > 0` o descarta.
      // Uma fábrica de picolés manda picolé para a câmara: dali em diante este
      // cartão nunca mais avisava de nada, e o produto vencia dentro dela.
      // Da UNIDADE, e isto resolve a contradição que estava escrita em dois
      // lugares. Este comentário dizia, com razão, que filtrar pelo almoxarifado
      // silenciava o aviso quando o picolé ia para a câmara fria; o docblock da
      // consulta dizia, com razão igual, que somar a empresa avisa sobre lote que
      // já foi ENTREGUE. A unidade é a granularidade que serve às duas: a câmara
      // está dentro dela, a loja do cliente não.
      expiringSoon(empresaDaqui(), trintaDias, 5, { unidade: unidadeDaqui() }),
      lossesOn(empresaDaqui(), mes.from, today.to, unidadeEAsNossasDeFora()),
      lossesOn(empresaDaqui(), mesAnterior.de.from, mesAnterior.ate.to, unidadeEAsNossasDeFora()),
      listPlaces(empresaDaqui()),
      // Da UNIDADE, não da empresa: o cartão do que está guardado responde "quanto
      // vale o que eu tenho aqui", e somar o almoxarifado da outra cidade daria um
      // número que quem está com o aparelho não consegue usar para decidir nada.
      listItems(empresaDaqui(), undefined, false, { unidade: unidadeDaqui() }),
      // Da EMPRESA e não da unidade: a pergunta que isto responde é "esta fábrica
      // já tem ficha técnica", e uma ficha cadastrada na outra cidade conta.
      listRecipes(empresaDaqui()),
      // Da EMPRESA pela mesma razão, e é ela que diz se há produto que se PRODUZ: os
      // itens de estoque não carregam a ficha, e sem ela a corrente de cadastro dá por
      // pronta uma fábrica que só revende.
      listProducts(empresaDaqui()),
      onlyResells(),
      alertSettings(),
    ]);

    /**
     * Há quanto tempo NADA muda de preço — o outro lado de `changes`.
     *
     * Depende dos itens, então roda depois do `Promise.all` em vez de dentro dele.
     * Uma segunda ida ao banco custa milissegundos e é o preço de não inventar uma
     * lista de itens antes de saber quais existem.
     */
    const steadySince = await lastCostMove(
      empresaDaqui(),
      stockItems.filter((i) => i.kind === 'input' || i.kind === 'packaging').map((i) => i.id),
    );

    /**
     * **O que está acabando, pela régua de quem compra — não por sete dias cravados.**
     *
     * A capa pedia a consulta com um horizonte de sete dias cravado, sem o prazo do fornecedor e sem
     * a folga da empresa. O aviso e a ficha do insumo usam `prazo + folga` desde 6 de
     * setembro, e com fornecedor de seis dias a notificação dizia "compre" enquanto o
     * cartão "Insumo acabando" ficava calado — o aplicativo discordando de si mesmo na
     * mesma manhã, que é exatamente o defeito que aquela régua nasceu para curar.
     *
     * O prazo é pedido só para os candidatos, que são poucos por construção (o teto
     * acima), e a ordem continua a do mais apertado primeiro, que é a que a peça mostra.
     */
    const candidatos = await Promise.all(
      shortlyCandidatos.map(async (c) => ({
        item: c,
        prazo: observedLeadTimeDays(await deliveriesOf(empresaDaqui(), c.itemId)),
      })),
    );
    const shortly = candidatos
      .filter(({ item, prazo }) => precisaComprar(item.daysLeft, prazo, regras))
      .map(({ item }) => item)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const sum = (rows: { baseUnits: number }[]) => rows.reduce((n, r) => n + r.baseUnits, 0);

    // Caixa é objeto: dezoito caixas são dezoito coisas que alguém empilha no
    // caminhão, tenham elas cinquenta picolés ou vinte e quatro. Somar isso
    // entre itens é honesto. O que NÃO é honesto é fingir que um saco de
    // açúcar é caixa porque o total ficava mais redondo - então o que não tem
    // camada acima da base sai da conta e é dito por nome.
    const contarVolumes = (
      lugares: typeof sent,
      solto: { name: string; said: string }[] | null,
    ) => {
      let total = 0;
      for (const place of lugares) {
        for (const item of place.items) {
          const volume = boxesOf(item.baseUnits, item.packaging);
          if (volume) total += volume.boxes;
          else
            solto?.push({
              name: item.name,
              // Na unidade de uso, e não pelo `formatPacked`.
              //
              // Aqui só cai o que NÃO tem camada de caixa, e para esse item a
              // única faixa é `unit` — então `formatPacked` traduzia a palavra
              // "unidade" para seis quilos de açúcar: a capa dizia "6.000
              // unidades de Açúcar cristal". É o mesmo defeito que a aba de
              // transporte cometia, e a unidade estava a uma coluna de
              // distância na consulta.
              said: `${formatQuantity(item.baseUnits, locale)} ${item.baseUnit}`,
            });
        }
      }
      return total;
    };

    const loose: { name: string; said: string }[] = [];
    const boxes = contarVolumes(sent, loose);
    // Ontem só entra como número: a Lei 3 pede a comparação, não a lista de
    // ontem inteira. O que saiu solto ontem já foi notícia ontem.
    const boxesYesterday = contarVolumes(sentYesterday, null);



    // Uma conta só, lida duas vezes: a régua da semana e a pergunta "já
    // produziu alguma vez" têm que responder a partir do MESMO dado, senão a
    // capa afirma duas coisas diferentes na mesma tela.
    const semana = dailySeries(week, locale.timeZone, nowIso(), 7);

    return {
      changes,
      steadySince,
      demand,
      demandThrough: through,
      madeToday: sum(madeToday),
      madeThen: sum(madeThen),
      madeYesterday: sum(madeYesterday),
      series: semana,
      /**
       * A idade da cópia — e ela é a única coisa desta consulta que não é da
       * fábrica.
       *
       * Entra aqui porque a capa é onde mora o que muda a decisão de hoje, e não
       * nos alertas: aqueles são fatos da fábrica, e enfiar um assunto do
       * aplicativo no meio deles ensina a ignorar a lista inteira.
       */
      copia: await (async () => {
        const ultima = await ultimaCopia();
        if (!ultima) return null;
        return {
          diasAtras: Math.max(0, daysBetween(ultima.feitoEm, nowIso(), locale.timeZone)),
          desdeEla: Math.max(0, (await countMovements()) - ultima.movimentos),
        };
      })(),
      shortly,
      /**
       * A fábrica já produziu ALGUMA VEZ — e o nome diz isso porque é isso que
       * a capa pergunta antes de desenhar o diagrama da comparação.
       *
       * Ele lia `madeToday || madeThen`: hoje, ou o mesmo dia da semana passada.
       * Num domingo — que a simulação deixa quieto de propósito, e que numa
       * fábrica de verdade costuma ser quieto pelo mesmo motivo — as duas pontas
       * dão zero, e a capa perdia o diagrama, a conta por extenso e os selos de
       * comparação **justamente no dia em que "o que é normal aqui" é a única
       * pergunta que sobra**. Uma fábrica com três meses de razão abria a capa
       * como se nunca tivesse produzido.
       *
       * A semana responde certo: se alguma coluna dos sete dias tem produção, a
       * fábrica produziu. E é a mesma fonte que desenha a régua logo abaixo, o
       * que impede a capa de afirmar duas coisas diferentes na mesma tela.
       */
      everMade: madeToday.length > 0 || madeThen.length > 0 || semana.some((d) => d.total > 0),
      boxes,
      boxesYesterday,
      preparo: {
        insumos: stockItems.filter((i) => i.kind === 'input' || i.kind === 'packaging').length,
        fichas: fichas.length,
        // O interruptor da empresa: quem só revende não é cobrado pela corrente.
        soRevende,
        /**
         * Produto que dá para PRODUZIR — não produto cadastrado.
         *
         * A conta contava revenda junto, e aí a corrente dizia "está pronto" para uma
         * fábrica que só revende: `recordProduction` recusa produto sem ficha (*"é revenda:
         * não se produz"*), então o toque abria a produção e ela respondia "nenhum produto
         * tem ficha técnica ainda". É o MESMO defeito que `primeiroPasso` nasceu para
         * consertar — *"a capa oferecia produzir num aplicativo sem ficha nenhuma"* —,
         * sobrevivendo num caso mais estreito, e achado ao construir o caminho de trás,
         * que faz a mesma pergunta e precisava da mesma resposta.
         *
         * `recipeId` e não `kind`: um produto pode nascer com `kind: 'product'` e ficha
         * nula, e o que a produção exige é a ficha.
         */
        produtos: produtos.filter((p) => p.recipeId).length,
      },
      loose,
      running: running.map((r) => ({
        id: r.id,
        productName: r.productName,
        openedAt: r.openedAt,
      })),
      runs,
      cover,
      expiring,
      lossesNow: lossesNow.reduce((n, l) => n + (l.valueCents ?? 0), 0),
      lossesBefore: lossesBefore.reduce((n, l) => n + (l.valueCents ?? 0), 0),
      lossesWorst: worstReason(lossesNow),
      // Quem recebe hoje pelo acordo, e se a carga do dia já foi para lá.
      dueToday: places
        .filter((p) => daysUntilNextDelivery(p.deliveryDays, weekday) === 0)
        .map((p) => ({
          id: p.id,
          name: p.name,
          sent: sent.some((s) => s.locationId === p.id),
        })),
      /**
       * Dinheiro parado: só insumo e embalagem, que é o que se compra. Produto
       * acabado é outra conta, e somar os dois esconde as duas.
       *
       * **E a capa é o único lugar em que sumir é a resposta certa.** As peças
       * dela são um destaque curado, não um relatório: uma peça diária dizendo
       * "você não vê este número" é exatamente o alerta inventado que a Lei 7
       * proíbe — ensina a ignorar peça. Quem quer o número tem a aba de
       * relatórios, e lá a frase está dita.
       *
       * `?? 0` é seguro aqui porque `Mosaic` monta a peça só quando o total é
       * maior que zero: com o portão fechado toda taxa é nula, o total é zero, e
       * a peça não existe.
       */
      heldCents: stockItems
        .filter((i) => i.kind === 'input' || i.kind === 'packaging')
        .reduce((n, i) => n + amountOf(i.averageRate ?? (0 as Rate), i.onHandBaseUnits), 0),
    };
  });

  /**
   * O clima, numa consulta À PARTE — e essa separação é a coisa importante aqui.
   *
   * Todo o resto desta tela sai do SQLite do aparelho e responde em
   * milissegundos. O tempo vem da internet, que numa fábrica é a coisa menos
   * confiável do prédio. Pendurar a previsão no mesmo `Promise.all` do briefing
   * faria a capa inteira esperar pela rede: oito segundos de tela vazia para
   * mostrar o que o banco já tinha respondido. Então são duas perguntas, e a
   * que depende de rede chega depois, sozinha, sem segurar nada.
   */
  const { data: weather } = useQuery<Forecast | null>(() => forecastForScreen(locale.timeZone));
  const sky = weather ? reading(weather, dayWindow(nowIso(), locale.timeZone).from.slice(0, 10)) : null;

  /**
   * O que foi pedido e ainda não existe na fábrica.
   *
   * A subtração é aqui e não na consulta porque a camada de dados devolve fato
   * - pedido e saldo - e a frase "falta produzir 300" é português, que é desta
   * camada. E ela só aparece quando falta de verdade: pedido coberto vira um
   * cartão calmo, porque "está tudo bem" é estado válido e alerta inventado
   * ensina a ignorar alerta.
   */
  const shortForOrders = (data?.demand ?? [])
    .map((d) => ({ ...d, missing: faltaProduzir(d) }))
    .filter((d) => d.missing > 0)
    .sort((a, b) => b.missing - a.missing);

  /**
   * O que mexeu de preço, UM por insumo.
   *
   * A capa listava as últimas quatro mudanças, e com duas semanas de notas isso
   * virou "Polpa de morango" quatro vezes seguidas, com quatro percentuais
   * diferentes - a tela do dono virou um extrato. A pergunta da capa não é
   * "quais foram as últimas notas", é "o que está diferente agora", e para isso
   * cada insumo tem uma resposta só: a mais recente. O histórico inteiro
   * continua na ficha do insumo, que é onde alguém vai conferir.
   */
  const moved = (data?.changes ?? [])
    .filter((c) => c.previousRate !== null && c.previousRate !== c.newRate)
    .filter((c, i, all) => all.findIndex((other) => other.itemId === c.itemId) === i)
    .slice(0, 4);

  // A ordem das peças: a da casa, sem o que este aparelho escondeu.
  const { data: preferencia } = useQuery(async () => {
    const [order, hidden, meias] = await Promise.all([
      briefingOrder(),
      briefingHidden(),
      briefingHalf(),
    ]);
    return { layout: briefingLayout(order, hidden), meias };
  });

  const view: BriefingView = {
    layout: preferencia?.layout ?? briefingLayout([], []),
    meias: preferencia?.meias ?? [],
    data: data ?? null,
    erro: error,
    denovo: refresh,
    sky,
    weather: weather ?? null,
    shortForOrders,
    moved,
    go: (route) => router.push(route as Parameters<typeof router.push>[0]),
  };

  // O casco da página é da PELE, não da tela: o Papel é uma folha com margem, o
  // Orgânico é uma paisagem que sangra até as bordas com cartões flutuando. A
  // tela entrega o dado e para por aí — quem monta a página é `capas/`.
  return <Mosaic {...view} />;
}


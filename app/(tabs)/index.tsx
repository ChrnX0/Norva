import { useRouter } from 'expo-router';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import {
  openProductionRuns,
  orderedDemand,
  productionBetween,
  productionOn,
  runningOut,
  recentCostChanges,
  shipmentsOn,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { reading, type Forecast } from '@/weather';
import { forecastForScreen } from '@/weather/live';
import { brand } from '@/config/brand';
import { useQuery } from '@/data/useQuery';
import { nowIso } from '@/data/db';
import { dailySeries, dayWindow, localDate } from '@/domain/day';
import { boxesOf } from '@/domain/units';
import {
  fill,
  formatPacked,
  formatQuantity,
  formatWeekday,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider } from '@/theme/ThemeProvider';
import { Blocks } from '@/home/Blocks';
import { Editorial } from '@/home/Editorial';
import { Mosaic } from '@/home/Mosaic';
import type { BriefingView, Summary } from '@/home/types';

/**
 * Qual desenho da capa está no ar.
 *
 * O dono pediu para VER as três em vez de escolher por descrição. Enquanto ele
 * não aponta uma, esta constante é a chave; quando apontar, as outras duas saem
 * do repositório - layout sem chamador é a mesma dívida que este projeto já
 * pagou caro em outros lugares.
 */
const LAYOUT: 'mosaico' | 'editorial' | 'blocos' = 'mosaico';

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

function Briefing() {
  const router = useRouter();
  const { locale, t } = useLocale();

  const { data } = useQuery<Summary | null>(async () => {
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

    const [
      changes,
      madeToday,
      madeThen,
      madeYesterday,
      sent,
      running,
      shortly,
      demand,
      week,
    ] = await Promise.all([
      recentCostChanges(LOCAL_COMPANY_ID, 12),
      productionOn(LOCAL_COMPANY_ID, today.from, today.to),
      productionOn(LOCAL_COMPANY_ID, then.from, then.to),
      productionOn(LOCAL_COMPANY_ID, yesterday.from, yesterday.to),
      shipmentsOn(LOCAL_COMPANY_ID, today.from, today.to),
      openProductionRuns(LOCAL_COMPANY_ID),
      runningOut(LOCAL_COMPANY_ID, lastWeek.from, today.to, 7),
      orderedDemand(LOCAL_COMPANY_ID, through),
      productionBetween(LOCAL_COMPANY_ID, weekAgo.from, today.to),
    ]);

    const sum = (rows: { baseUnits: number }[]) => rows.reduce((n, r) => n + r.baseUnits, 0);

    // Caixa é objeto: dezoito caixas são dezoito coisas que alguém empilha no
    // caminhão, tenham elas cinquenta picolés ou vinte e quatro. Somar isso
    // entre itens é honesto. O que NÃO é honesto é fingir que um saco de
    // açúcar é caixa porque o total ficava mais redondo - então o que não tem
    // camada acima da base sai da conta e é dito por nome.
    let boxes = 0;
    const loose: { name: string; said: string }[] = [];
    for (const place of sent) {
      for (const item of place.items) {
        const volume = boxesOf(item.baseUnits, item.packaging);
        if (volume) boxes += volume.boxes;
        else loose.push({ name: item.name, said: formatPacked(item.baseUnits, item.packaging, t.units, locale) });
      }
    }



    return {
      changes,
      demand,
      demandThrough: through,
      madeToday: sum(madeToday),
      madeThen: sum(madeThen),
      madeYesterday: sum(madeYesterday),
      series: dailySeries(week, locale.timeZone, nowIso(), 7),
      shortly,
      everMade: madeToday.length > 0 || madeThen.length > 0,
      boxes,
      loose,
      running: running.map((r) => ({
        id: r.id,
        productName: r.productName,
        openedAt: r.openedAt,
      })),
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

  /** The line under the count: what it was, said as a difference. */
  const comparison = (today: number, then: number) => {
    const day = t.app.home.lastWeekday;
    if (then === 0) return t.app.home.producedFirst;
    if (today === then) return fill(t.app.home.producedSame, { day });
    const amount = `${formatQuantity(Math.abs(today - then), locale)} ${plural(
      Math.abs(today - then),
      t.units.unit,
    )}`;
    return fill(today > then ? t.app.home.producedMore : t.app.home.producedLess, { amount, day });
  };

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
    .map((d) => ({ ...d, missing: d.requested - d.onHand }))
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

  const view: BriefingView = {
    data: data ?? null,
    sky,
    weather: weather ?? null,
    shortForOrders,
    moved,
    comparison,
    go: (route) => router.push(route as Parameters<typeof router.push>[0]),
  };

  return (
    <CollapsingHeader title={brand.name} overline={formatWeekday(nowIso(), locale)}>
      {LAYOUT === 'mosaico' ? (
        <Mosaic {...view} />
      ) : LAYOUT === 'editorial' ? (
        <Editorial {...view} />
      ) : (
        <Blocks {...view} />
      )}
    </CollapsingHeader>
  );
}


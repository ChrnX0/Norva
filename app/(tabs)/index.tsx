import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Bars } from '@/components/Bars';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { CountUp } from '@/components/CountUp';
import { PulseDot } from '@/components/PulseDot';
import { Reveal } from '@/components/Reveal';
import { SkyScene, TemperatureRange } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import { IconProduction } from '@/components/icons';
import {
  openProductionRuns,
  orderedDemand,
  type Demand,
  productionBetween,
  productionOn,
  runningOut,
  type Running,
  recentCostChanges,
  shipmentsOn,
  type CostChange,
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
  formatCalendarDate,
  formatPacked,
  formatPercent,
  formatQuantity,
  formatTime,
  formatWeekday,
  formatWeekdayInitial,
  joinList,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { palettes } from '@/theme/tokens';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

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

type Summary = {
  changes: CostChange[];
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
  loose: { name: string; said: string }[];
  /** Tachos rodando agora. Vazio é o estado normal de uma fábrica parada. */
  running: { id: string; productName: string; openedAt: string }[];
  /** O que os clientes pediram para os próximos dias, contra o que a fábrica tem. */
  demand: Demand[];
  /** Até que dia a pergunta dos pedidos foi feita. */
  demandThrough: string;
};

function Briefing() {
  const { color, scheme, type, space, radius } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();
  const palette = palettes[scheme];

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
      recentCostChanges(LOCAL_COMPANY_ID, 4),
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

  const moved = (data?.changes ?? []).filter(
    (c) => c.previousRate !== null && c.previousRate !== c.newRate,
  );

  return (
    <CollapsingHeader title={brand.name} overline={formatWeekday(nowIso(), locale)}>
      {/* O DIA, que é a manchete que o dono pediu ao ver a capa publicada.
          "Esse valor do morango aí não interessa. O que interessa é produção do
          dia, do dia anterior."

          O custo por unidade saiu daqui e continua inteiro na receita, a um
          toque. Ele respondia uma pergunta boa - quanto custa fazer - na hora
          errada: de manhã, de pé, o que se decide é o que produzir hoje.

          E este cartão não some mais quando o dia está zerado. A versão de
          antes só aparecia se a fábrica já tivesse produzido alguma vez, o que
          deixava a capa de uma fábrica nova com clima e preço e nada de
          trabalho. Zero é um fato sobre hoje: dito ao lado de ontem e da
          semana, ele vira a pergunta certa em vez de um buraco. */}
      <Reveal index={0}>
        <Card tone="area">
          <CountUp
            value={data?.madeToday ?? 0}
            format={(v) => formatQuantity(Math.round(v), locale)}
            style={{ ...type.figure, color: color.ink }}
          />
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {plural(data?.madeToday ?? 0, t.units.unit)} {t.app.home.producedToday}
          </Text>

          {/* A régua de sete dias: a única coisa nesta tela que responde "isto
              aqui é normal?" sem pedir para ninguém somar de cabeça. */}
          {data && data.series.length > 0 ? (
            <Bars
              series={data.series}
              labels={data.series.map((d) => formatWeekdayInitial(d.date, locale))}
            />
          ) : null}

          {data ? (
            <>
              <Text style={[type.caption, { color: color.inkFaint, marginTop: space.md }]}>
                {data.madeYesterday === 0
                  ? t.app.home.noYesterday
                  : fill(t.app.home.yesterdayWas, {
                      amount: `${formatQuantity(data.madeYesterday, locale)} ${plural(
                        data.madeYesterday,
                        t.units.unit,
                      )}`,
                    })}
              </Text>
              <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
                {comparison(data.madeToday, data.madeThen)}
              </Text>
            </>
          ) : null}
        </Card>
      </Reveal>

      {/* O que vai acabar, avisado na data da DECISÃO e não na do problema.
          Lei 4: quando a polpa acabar já é tarde — a compra tem prazo. */}
      {data && data.shortly.length > 0 ? (
        <Reveal index={1}>
          <Touchable onPress={() => router.push('/inputs')} accessibilityLabel={t.app.home.runningOut}>
            <Card tone="warning">
              <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.home.runningOut}</Text>
              <View style={{ marginTop: space.md, gap: space.xs }}>
                {data.shortly.slice(0, 4).map((r) => (
                  <View key={r.itemId} style={styles.row}>
                    <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={[type.body, { color: color.ink }]}>
                      {plural(
                        Math.floor(r.daysLeft),
                        t.app.home.dayCount,
                        formatQuantity(Math.floor(r.daysLeft), locale),
                      )}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
                {t.app.home.runningOutWhy}
              </Text>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* E o contrário dele, que é a metade que faltava.
          "Está tudo bem" é estado válido e bonito - mas só pode ser dito quando
          houve consumo de verdade para olhar. Numa fábrica que nunca produziu,
          "nada acaba nos próximos sete dias" seria verdade por acidente:
          nenhum insumo sai porque nenhum tacho roda, e a frase viraria a mesma
          coisa que um alerta inventado, só que ao contrário. */}
      {data && data.everMade && data.shortly.length === 0 ? (
        <Reveal index={1}>
          <Touchable onPress={() => router.push('/inputs')} accessibilityLabel={t.app.home.inputsFine}>
            <Card>
              <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.home.inputsFine}</Text>
              <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.home.inputsFineDetail}
              </Text>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* O que os clientes pediram, e o que falta para dar conta. */}
      {data && data.demand.length > 0 ? (
        <Reveal index={2}>
          <Touchable
            onPress={() => router.push('/orders')}
            accessibilityLabel={
              shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered
            }
          >
            <Card tone={shortForOrders.length > 0 ? 'warning' : 'plain'}>
              <Text style={[type.cardTitle, { color: color.ink }]}>
                {shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
              </Text>

              {shortForOrders.length > 0 ? (
                <View style={{ marginTop: space.md, gap: space.xs }}>
                  {shortForOrders.slice(0, 4).map((d) => (
                    <View key={d.itemId} style={styles.row}>
                      <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {d.name}
                      </Text>
                      <Text style={[type.body, styles.number, { color: color.ink }]}>
                        {plural(d.missing, t.units.unit, formatQuantity(d.missing, locale))}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
                  {fill(t.app.home.ordersCoveredDetail, {
                    date: formatCalendarDate(data.demandThrough, locale),
                  })}
                </Text>
              )}

              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
                {fill(t.app.home.ordersWhy, { date: formatCalendarDate(data.demandThrough, locale) })}
              </Text>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* O clima, desenhado.
          Continua dizendo FATO e nada além: máxima, mínima, chuva e a diferença
          para amanhã. Não escreve "produza mais amanhã", porque a relação entre
          grau e caixa vendida desta fábrica precisa de meses de saída
          observada.

          O que mudou foi a forma. O cartão anterior era um número grande e
          quatro linhas cinza, com a mesma cara do custo e do saldo - e numa
          sorveteria o calor não é uma linha de planilha, é o negócio. A cena
          sai do próprio dado: a cor vem da máxima, o sol vira nuvem quando
          chove, e a régua mostra o dia inteiro entre a mínima e a máxima. */}
      {sky ? (
        <Reveal index={3}>
          <Touchable
            onPress={() => router.push('/weather')}
            accessibilityLabel={fill(t.app.weather.overline, { city: weather?.place.name ?? '' })}
          >
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <SkyScene maxC={sky.today.maxC} rainChance={sky.today.rainChance} height={128} />

              <View style={{ padding: space.lg }}>
                <Text style={[type.overline, { color: color.inkFaint }]}>
                  {fill(t.app.weather.overline, { city: weather?.place.name ?? '' }).toUpperCase()}
                </Text>

                <View style={[styles.row, { gap: space.md, marginTop: space.xs }]}>
                  <Text style={[type.figure, { color: color.ink }]}>
                    {`${Math.round(sky.today.maxC)}°`}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.secondary, { color: color.inkMuted }]}>
                      {t.app.weather.today}
                    </Text>
                    <Text style={[type.caption, { color: color.inkFaint }]}>
                      {fill(t.app.weather.low, {
                        degrees: plural(Math.round(sky.today.minC), t.app.weather.degrees),
                      })}
                    </Text>
                  </View>
                </View>

                <TemperatureRange minC={sky.today.minC} maxC={sky.today.maxC} />

                {/* Chuva só aparece quando é chance de verdade. Dez por cento é
                    ruído, e ruído todo dia ensina a não ler o cartão. */}
                {sky.today.rainChance !== null && sky.today.rainChance >= 30 ? (
                  <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
                    {fill(t.app.weather.rain, { percent: String(sky.today.rainChance) })}
                  </Text>
                ) : null}

                {sky.warmerBy !== null ? (
                  <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
                    {sky.warmerBy === 0
                      ? t.app.weather.same
                      : fill(sky.warmerBy > 0 ? t.app.weather.warmer : t.app.weather.cooler, {
                          degrees: plural(Math.abs(sky.warmerBy), t.app.weather.degrees),
                        })}
                  </Text>
                ) : null}

                <Text style={[type.caption, { color: palette.sky, marginTop: space.sm }]}>
                  {weather
                    ? `${fill(t.app.weather.measured, {
                        time: formatTime(weather.fetchedAt, locale),
                      })} · ${t.app.weather.change}`
                    : ''}
                </Text>
              </View>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* O tacho que está rodando agora.
          O pulso é a única coisa desta tela que se move por causa do DADO, e
          por isso ele só pode existir quando há um tacho de verdade: `PulseDot`
          exige `live` justamente para que ninguém pulse ao lado de número
          congelado. Fábrica parada não desenha nada aqui. */}
      {data?.running.map((run, i) => (
        <Reveal key={run.id} index={4 + i}>
          <Touchable
            onPress={() => router.push('/production')}
            accessibilityLabel={`${t.app.home.running}: ${run.productName}`}
          >
            <Card tone="area">
              <View style={[styles.row, { gap: space.sm }]}>
                <PulseDot live />
                <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {run.productName}
                </Text>
              </View>
              <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.home.running}
              </Text>
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {fill(t.app.home.runningSince, { time: formatTime(run.openedAt, locale) })}
              </Text>
            </Card>
          </Touchable>
        </Reveal>
      ))}

      {/* O que saiu para as lojas hoje, em volume. Só existe quando há caixa de
          verdade: um "0 caixas" seria manchete falsa. */}
      {data && data.boxes > 0 ? (
        <Reveal index={5}>
          <Card>
            <CountUp
              value={data.boxes}
              format={(v) => formatQuantity(Math.round(v), locale)}
              style={{ ...type.figure, color: color.ink }}
            />
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {plural(data.boxes, t.app.home.boxCount)} {t.app.home.boxesSent}
            </Text>
            {data.loose.length > 0 ? (
              <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
                {fill(t.app.home.alsoSent, {
                  items: joinList(
                    data.loose.map((l) =>
                      fill(t.app.home.alsoSentItem, {
                        amount: l.said,
                        name: l.name.toLocaleLowerCase(locale.formatting),
                      }),
                    ),
                    t.common.and,
                  ),
                })}
              </Text>
            ) : null}
          </Card>
        </Reveal>
      ) : null}

      {/* O preço que mexeu - e SÓ quando mexeu.
          O cartão "Nada mudou de preço" saiu da capa junto com o custo por
          unidade. Ele era honesto e era inútil: ocupava a tela todo dia para
          dizer que não havia notícia, que é a definição do alerta que ensina a
          ignorar alerta. Alta de nove por cento na polpa continua aparecendo
          aqui no dia em que acontece, porque isso muda a decisão de comprar. */}
      {moved.length > 0 ? (
        <Reveal index={6}>
          <Touchable onPress={() => router.push('/inputs')} accessibilityLabel={t.app.home.changed}>
            <Card tone="warning">
              <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.home.changed}</Text>
              <View style={{ marginTop: space.md, gap: space.sm }}>
                {moved.map((change) => {
                  const previous = change.previousRate ?? change.newRate;
                  const delta = previous > 0 ? (change.newRate - previous) / previous : 0;
                  return (
                    <View key={`${change.itemId}-${change.observedAt}`} style={styles.row}>
                      <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {change.name}
                      </Text>
                      <Text
                        style={[
                          type.secondary,
                          styles.number,
                          { color: delta > 0 ? color.warning : color.ok },
                        ]}
                      >
                        {delta > 0 ? '▲' : '▼'} {formatPercent(Math.abs(delta), locale)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* The day's single action, within thumb reach and carrying its own mark. */}
      <Reveal index={7}>
        <Button
          label={t.app.home.record}
          onPress={() => router.push('/production')}
          icon={(c) => <IconProduction size={24} color={c} />}
          style={{ borderRadius: radius.pill }}
        />
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});

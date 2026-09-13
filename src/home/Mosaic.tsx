import { Fragment, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { variacaoDoCusto } from '@/domain/cost';
import { cents, type Cents } from '@/domain/money';
import { StyleSheet, Text, View } from 'react-native';
import { Bars } from '@/components/Bars';
import { Drain } from '@/components/Drain';
import { Sparkline } from '@/components/Sparkline';
import { Card } from '@/components/Card';
import { cenaParada, type CenaDaFabrica } from '@/components/cena';
import { FactoryScene } from '@/components/FactoryScene';
import { CountUp } from '@/components/CountUp';
import { GlyphArchive, GlyphBox, GlyphCalendar, GlyphOrder, GlyphPrice, GlyphProduction, GlyphStock } from '@/components/Glyph';
import { PulseDot } from '@/components/PulseDot';
import { Reveal } from '@/components/Reveal';
import { TemperatureRange } from '@/components/Sky';
import { Touchable } from '@/components/Touchable';
import {
  fill,
  formatCalendarDate,
  formatCoverDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatTime,
  formatWeekdayAbbrev,
  plural,
} from '@/i18n';
import type { Dictionary, LocaleSettings } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { nowIso } from '@/data/db';
import {
  avisoDaCopia,
  briefingFilas,
  coverState,
  primeiroPasso,
  type BriefingWidget,
  type PrimeiroPasso,
} from '@/domain/briefing';
import { daysBetween, localDate } from '@/domain/day';
import { brand } from '@/config/brand';
import {
  CartaoClima,
  Comparativo,
  Legenda,
  Manchete,
  Nivel,
  Porta,
  Regua,
  Versalete,
} from './Capa';
import { Peca } from './Peca';
import { useVestimenta } from './capas/vestimenta';
import type { BriefingView, Summary } from './types';

/**
 * Mosaico: uma manchete grande e peças pequenas embaixo.
 *
 * A ideia é que nem todo assunto merece a largura da tela. O que saiu do tacho
 * merece; uma caixa que foi para a loja não. Peças de meia largura lado a lado
 * fazem o olho entender a hierarquia sem ler uma palavra - e quebram a pilha de
 * retângulos iguais que o dono recusou.
 */
export function Mosaic(vista: BriefingView) {
  const { data, erro, denovo, sky, weather, shortForOrders, moved, layout, meias, go } = vista;
  const { color, type, space, palette, accent, traco } = useTheme();
  const { locale, t } = useLocale();
  const vestimenta = useVestimenta();

  // A espessura do traço é da identidade: fino no Papel, cheio no Orgânico.


  /**
   * Há pedido em aberto — e não "há linha na consulta", que são coisas
   * diferentes desde que ela passou a partir do PRODUTO.
   *
   * `stockAgainstOrders` devolve uma linha por produto para a tela de anotar
   * pedido poder dizer quanto está livre antes do primeiro pedido existir.
   * Medindo o tamanho da lista, a capa de uma fábrica que nunca vendeu nada
   * passava a mostrar "Pedidos cobertos" — um cartão afirmando que está tudo
   * atendido quando não há nada para atender — e o convite do primeiro dia
   * sumia. Contar linha e nomear pedido é a mesma família de defeito que a
   * varredura de hoje caçou.
   */
  const temPedido = (data?.demand ?? []).some((d) => d.requested > 0);

  /** Há um pote para desenhar: o insumo curto, ou o mais curto de todos. */
  const temNivel = !!data && (data.shortly.length > 0 || (data.everMade && data.cover.length > 0));
  /** Saiu carga hoje. */
  const temCaixas = !!data && data.boxes > 0;

  /**
   * O que a cena da fábrica mostra do dia — um objeto, não três expressões.
   *
   * A legenda debaixo dela é derivada daqui também: enquanto eram cálculos
   * separados, nada impedia o texto de dizer uma coisa e o desenho outra.
   */
  const cena: CenaDaFabrica = {
    running: (data?.running.length ?? 0) > 0,
    shipped: temCaixas,
    dayShare:
      data && data.madeYesterday > 0
        ? Math.min(1, data.madeToday / data.madeYesterday)
        : data && data.madeToday > 0
          ? 1
          : null,
  };

  // A pergunta mora no domínio e tem teste — porque a resposta errada dela é a
  // frase mais cara desta tela. Ver `coverState`.
  const estado = coverState(
    data
      ? {
          madeToday: data.madeToday,
          runs: data.runs,
          cover: data.cover,
          boxes: data.boxes,
          orders: temPedido ? 1 : 0,
          running: data.running,
          expiring: data.expiring,
          dueToday: data.dueToday,
          lossesNow: data.lossesNow,
        }
      : null,
    erro ?? null,
  );


  /**
   * Qual peça está aberta. Uma por vez, e o segundo toque fecha.
   *
   * Duas abertas empurram o resto para fora da tela e a capa deixa de ser capa —
   * então abrir uma fecha a outra sozinha, sem a pessoa precisar arrumar nada.
   */
  const [aberta, setAberta] = useState<BriefingWidget | null>(null);
  const abrir = (id: BriefingWidget) => setAberta((atual) => (atual === id ? null : id));

  /** As corridas que têm taxa congelada, que é o que a peça de custo compara. */
  const comCusto = (data?.runs ?? []).filter((r) => r.unitCostRate !== null);

  /**
   * O casco de cada peça da pele, montado UMA VEZ.
   *
   * A peça da pele recebe o próprio casco e o veste por dentro, porque só ela
   * sabe se tem o que dizer: vestindo por fora, a capa só enxerga um elemento
   * React, e um componente que devolve `null` na hora de desenhar continua sendo
   * um elemento — o casco saía desenhado em volta do nada, que na foto do
   * Orgânico é um cartão branco vazio no meio da capa.
   *
   * E ele é memorizado porque **componente criado dentro do render é um TIPO
   * novo a cada render**: o React desmonta e remonta a árvore inteira embaixo
   * dele, e as colunas da semana recomeçavam a animação a cada toque em qualquer
   * lugar da capa. A roupa vem do registro e não muda; o `useMemo` só diz isso
   * ao React.
   */
  const cascas = useMemo(() => {
    const Bloco = vestimenta.Bloco;
    const out: Partial<Record<BriefingWidget, ComponentType<{ children: ReactNode }>>> = {};
    for (const id of Object.keys(vestimenta.pecas ?? {}) as BriefingWidget[]) {
      out[id] = ({ children }) => <Bloco id={id}>{children}</Bloco>;
    }
    return out;
  }, [vestimenta]);

  /**
   * As peças da capa, montadas na ordem que a casa combinou.
   *
   * Cada uma continua decidindo sozinha se tem o que dizer — ligar não é
   * forçar. O que a preferência decide é a ORDEM e a presença; o que decide se
   * a peça aparece é o dado dela.
   */
  const pecas: Record<BriefingWidget, ReactNode> = {
    /**
     * A manchete do dia — a capa aprovada, ao pé da letra.
     *
     * Ela não é um cartão. Era: título com ícone, borda arredondada e o número
     * em corpo 28 lá dentro. O dono mandou a foto do que chegava e a foto do que
     * tinha que ser, lado a lado, e a diferença não era de ajuste — era de
     * gênero. Página impressa: linha de olho, manchete em serifa, o desenho em
     * traço, régua grossa, o diagrama da conta e a régua da semana.
     *
     * A ordem das partes é a ordem da leitura: o que aconteceu (manchete), como
     * (a linha desenhada), contra o quê (o diagrama), e o que é normal aqui (a
     * semana). São as três perguntas da Lei da Inteligência numa tela só.
     */
    producao: (
      <View>
        <View>
          {/* Nada de manchete enquanto a resposta não chegou: `forte` nulo
              deixa a linha de baixo em branco em vez de afirmar. É meio segundo
              num aparelho lento — e é exatamente o meio segundo em que a tela
              diria "ainda não produziu" para quem produziu. */}
          <Manchete
            leve={t.app.home.capaLead}
            forte={
              estado === 'loading'
                ? null
                : (data?.madeToday ?? 0) > 0
                  ? fill(t.app.home.capaMade, {
                      amount: `${formatQuantity(data?.madeToday ?? 0, locale)} ${plural(data?.madeToday ?? 0, t.units.unit)}`,
                    })
                  : t.app.home.capaQuiet
            }
          />

          {/* A cena desta peça é a da fábrica em traço. Ela deixou de ser um
              ternário sobre a pele: quem tem outra identidade troca a PEÇA
              inteira em `capas/`, não a figura do meio dela. Enquanto era um
              ternário, o Orgânico era o Papel com outro desenho — e o dono
              recusou exatamente isso. */}
          <View style={{ marginTop: space.md }}>
            <FactoryScene {...cena} />
          </View>

          {/* A legenda sai do MESMO objeto que a cena, e isso não é elegância.
              Recalculá-la aqui deixaria o texto e o desenho discordarem no dia em
              que um dos dois mudasse — a família de defeito que já custou caro
              neste repositório, e que aqui teria a forma mais cruel: a frase
              jurando que a fábrica está parada com a chaminé fumegando ao lado. */}
          <Legenda>{cenaParada(cena) ? t.app.home.capaLegendStill : t.app.home.capaLegend}</Legenda>

          {data && data.everMade ? (
            <>
              <Regua forte />
              <Comparativo
                referencias={[
                  {
                    rotulo: t.app.home.boxYesterday,
                    valor: formatQuantity(data.madeYesterday, locale),
                    delta: sinal(data.madeToday - data.madeYesterday, locale),
                    acima: data.madeToday >= data.madeYesterday,
                  },
                  {
                    // O dia de SETE atrás, não o da primeira coluna da semana.
                    //
                    // Estava lendo `series[0]`, que é seis dias atrás — a régua
                    // da semana tem sete colunas contando hoje. O rótulo dizia
                    // "DOM" ao lado do número de sábado passado: um número certo
                    // com um nome errado em cima, que é pior que número ausente.
                    // `madeThen` é `dayWindow(..., -7)`, então o dia é sempre o
                    // MESMO de hoje — e é por isso que o desenho aprovado diz
                    // "quarta passada" numa quarta.
                    rotulo: fill(t.app.home.boxLastWeek, {
                      weekday: formatWeekdayAbbrev(localDate(nowIso(), locale.timeZone, -7), locale),
                    }),
                    valor: formatQuantity(data.madeThen, locale),
                    delta: sinal(data.madeToday - data.madeThen, locale),
                    acima: data.madeToday >= data.madeThen,
                  },
                ]}
                total={formatQuantity(data.madeToday, locale)}
                unidade={fill(t.app.home.todayUnits, { unit: plural(data.madeToday, t.units.unit) })}
              />
              {/* A conta escrita por extenso: a Lei 6 pede que toda conclusão
                  abra a conta, e aqui ela cabe numa linha — então não precisa de
                  toque nenhum para abrir. */}
              <View style={{ marginTop: space.lg }}>
                <Legenda>{contaDoDia(data, locale, t)}</Legenda>
              </View>
            </>
          ) : null}

        </View>
      </View>
    ),

    /**
     * A semana: sete colunas, e é a resposta de "o que é normal aqui".
     *
     * Saiu de dentro da produção do dia porque são dois assuntos, e enquanto
     * estavam juntos nenhuma das duas peles conseguia desenhar o que o dono
     * aprovou: o Papel quer régua entre os dois, o Orgânico quer dois cartões.
     * Peça é assunto — quem manda no que aparece junto é a ordem da casa, não a
     * indentação de um arquivo.
     */
    semana:
      data && data.series.length > 0 ? (
        <View>
          <View>
            <Versalete>{t.app.home.weekTitle}</Versalete>
            <Bars
              series={data.series}
              hue={palette.apricot}
              labels={data.series.map((d) => formatWeekdayAbbrev(d.date, locale))}
            />
          </View>
        </View>
      ) : null,
    /**
     * O insumo que está acabando, desenhado como o pote que ele é.
     *
     * Era um cartão de meia largura com o número de dias em corpo 28 e o nome
     * abreviado embaixo. O desenho aprovado mostra outra coisa e a diferença não
     * é de estilo: um recipiente com nível é lido sem legenda, e este aplicativo
     * é lido de luva, na câmara fria, por quem não vai parar para interpretar
     * número. O nome do insumo passa a ser o assunto, em serifa, como manda a
     * página.
     *
     * A régua é a mesma que a capa usa para tudo que fala de tempo — trinta
     * dias —, e ela é dita aqui em vez de morar dentro do desenho: peça que
     * inventa régua é peça que mente com o gráfico bonito.
     */
    /**
     * O insumo mais curto e o que saiu hoje — dois assuntos, um bloco.
     *
     * A condição é dita AQUI e não só dentro do bloco: a pele decide o casco de
     * cada peça, e o Orgânico veste cada uma num cartão. Uma peça que devolve
     * um invólucro vazio vira, nessa pele, um cartão branco sem nada dentro —
     * defeito que não existia enquanto o casco era o nada do Papel.
     */
    insumos: temNivel || temCaixas ? (
      <View>
        <View style={{ gap: space.lg }}>
          {data && data.shortly.length > 0 ? (
            <Porta aoTocar={() => go('/inputs')} etiqueta={t.app.home.runningOut} convite={t.app.home.openScreen}>
              <Nivel
                parcela={Math.min(1, data.shortly[0].daysLeft / 30)}
                nome={data.shortly[0].name}
                topo={t.app.home.levelFull}
                urgente
                prazo={fill(t.app.home.levelEndsIn, {
                  days: plural(Math.floor(data.shortly[0].daysLeft), t.app.home.dayCount),
                })}
              />
            </Porta>
          ) : data?.everMade && data.cover.length > 0 ? (
            // Está tudo bem é estado válido — e aqui ele é MOSTRADO, não
            // afirmado: o pote do insumo mais curto aparece cheio, com quanto
            // ele dura. Uma frase dizendo "insumos em dia" pede confiança; o
            // desenho do nível entrega a prova junto.
            <Porta aoTocar={() => go('/inputs')} etiqueta={t.app.home.inputsFine} convite={t.app.home.openScreen}>
              <Nivel
                parcela={Math.min(1, data.cover[0].daysLeft / 30)}
                nome={data.cover[0].name}
                topo={t.app.home.levelFull}
                prazo={fill(t.app.home.levelLasts, {
                  days: plural(Math.floor(data.cover[0].daysLeft), t.app.home.dayCount),
                })}
              />
            </Porta>
          ) : null}

          {data && data.boxes > 0 ? (
            <Porta aoTocar={() => go('/transport')} etiqueta={t.app.home.boxesTitle} convite={t.app.home.openScreen}>
              <View>
                <Versalete>{t.app.home.boxesTitle}</Versalete>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                  <CountUp
                    value={data.boxes}
                    format={(v) => formatQuantity(Math.round(v), locale)}
                    style={{ ...type.figure, color: color.ink }}
                  />
                  <Text style={[type.secondary, { color: color.inkMuted }]}>
                    {plural(data.boxes, t.app.home.boxCount)} {plural(data.boxes, t.app.home.boxesSent)}
                  </Text>
                </View>
                {/*
                  Dezoito caixas é dia bom numa fábrica e dia fraco noutra: sem
                  ontem do lado, o número grande não decide nada (Lei 3). E o
                  que saiu sem caber em caixa — um saco, um balde — sai por
                  nome, porque somá-lo em "caixas" seria arredondar a verdade
                  para o total ficar mais bonito.
                */}
                <Legenda>
                  {data.boxesYesterday === 0
                    ? t.app.home.noBoxesYesterday
                    : fill(t.app.home.yesterdayWas, {
                        amount: plural(data.boxesYesterday, t.app.home.boxCount),
                      })}
                  {data.loose.length > 0
                    ? ` · ${fill(t.app.home.alsoSent, {
                        items: data.loose
                          .map((l) => fill(t.app.home.alsoSentItem, { amount: l.said, name: l.name }))
                          .join(', '),
                      })}`
                    : ''}
                </Legenda>
              </View>
            </Porta>
          ) : null}
        </View>
      </View>
    ) : null,
    pedidos: (
      temPedido ? (
        <View>
          <Touchable
            onPress={() => go('/orders')}
            accessibilityLabel={shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
          >
            <Card
              hue={shortForOrders.length > 0 ? color.warning : palette.sage}
              icon={(c) => <GlyphOrder size={26} color={c} weight={traco} />}
              title={shortForOrders.length > 0 ? t.app.home.ordersShort : t.app.home.ordersCovered}
            >
              {shortForOrders.length > 0 ? (
                <View style={{ gap: space.xs }}>
                  {shortForOrders.slice(0, 3).map((d) => (
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
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {fill(t.app.home.ordersCoveredDetail, {
                    date: data ? formatCalendarDate(data.demandThrough, locale) : '',
                  })}
                </Text>
              )}
            </Card>
          </Touchable>
        </View>
      ) : null
    ),
    clima: (
      sky ? (
        <View>
          {/* O toque abre a SEMANA aqui, e não leva para outra tela.
              Pedido do dono com todas as letras, e ele tem razão sobre o motivo:
              a pergunta "vou vender mais sexta?" se responde olhando sete dias de
              uma vez, e a capa é onde ela nasce. A tela cheia continua a um toque
              de dentro da peça aberta. */}
          <Touchable
            onPress={() => abrir('clima')}
            accessibilityLabel={fill(t.app.weather.nowAt, { city: weather?.place.name ?? '' })}
          >
            <CartaoClima
              cidade={fill(t.app.weather.nowAt, { city: weather?.place.name ?? '' })}
              maxC={sky.today.maxC}
              minima={fill(t.app.weather.lowShort, {
                degrees: plural(Math.round(sky.today.minC), t.app.weather.degrees),
              })}
              chuva={
                sky.today.rainChance !== null
                  ? {
                      texto: fill(t.app.weather.rain, { percent: Math.round(sky.today.rainChance) }),
                      parcela: sky.today.rainChance / 100,
                    }
                  : null
              }
              amanha={
                sky.warmerBy === null
                  ? null
                  : sky.warmerBy === 0
                    ? t.app.weather.same
                    : fill(t.app.weather.tomorrowDelta, {
                        // O sinal por extenso, e o menos é o de verdade (U+2212):
                        // ao lado de "+4°" um hífen fica curto e alto, e a dupla
                        // deixa de ler como par.
                        delta: `${sky.warmerBy > 0 ? '+' : '\u2212'}${plural(Math.abs(sky.warmerBy), t.app.weather.degrees)}`,
                      })
              }
              rodape={
                weather
                  ? `${fill(t.app.weather.measured, { time: formatTime(weather.fetchedAt, locale) })} · ${aberta === 'clima' ? t.app.home.less : t.app.home.more}`
                  : ''
              }
            >
              {/* A semana, que é o que o toque abre. Uma linha por dia, com a
                  faixa de temperatura desenhada: sete números soltos não se
                  comparam de olho, sete barras se comparam. */}
              {aberta === 'clima' && weather ? (
                <Reveal index={0} style={{ marginTop: space.md }}>
                  <View style={{ gap: space.sm }}>
                    {weather.days.slice(0, 7).map((dia) => (
                      <View key={dia.date} style={[styles.row, { gap: space.sm }]}>
                        <Text style={[type.caption, { color: color.inkFaint, width: 34 }]}>
                          {formatWeekdayAbbrev(dia.date, locale)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <TemperatureRange minC={dia.minC} maxC={dia.maxC} />
                        </View>
                        <Text style={[type.caption, styles.number, { color: color.ink }]}>
                          {`${Math.round(dia.maxC)}°`}
                        </Text>
                        {dia.rainChance !== null && dia.rainChance >= 30 ? (
                          <Text style={[type.caption, { color: palette.sky }]}>
                            {`${Math.round(dia.rainChance)}%`}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </Reveal>
              ) : null}
            </CartaoClima>
          </Touchable>
        </View>
      ) : null
    ),
    expedicao: null,
    precos: (
      /**
       * O custo firme é notícia, e era o silêncio da capa.
       *
       * Quando nada mexeu, este cartão simplesmente não existia — e o dono de uma
       * fábrica com o custo estável há dois meses via a mesma capa de quem acabou de
       * instalar o aplicativo. "Está tudo bem" é estado válido e tem de ser dito:
       * `estável há 47 dias` não é um cartão vazio, é a resposta da primeira pergunta
       * da lei (o que é normal ali), e é ela que faz a próxima alta significar algo.
       *
       * A duração é o que separa isto de um cartão que diz nada: sem ela sobraria
       * "Nada mudou de preço", que é a terceira maneira de dizer o mesmo silêncio —
       * o defeito que a peça de produção ao vivo já pagou nesta mesma capa.
       */
      moved.length === 0 ? (
        <View>
          <Porta aoTocar={() => go('/inputs')} etiqueta={t.app.home.allSteady} convite={t.app.home.openScreen}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
              title={t.app.home.allSteady}
            >
              <Text style={[type.secondary, { color: color.inkMuted }]}>
                {data?.steadySince
                  ? fill(t.app.home.stableFor, {
                      days: plural(
                        daysBetween(data.steadySince, nowIso(), locale.timeZone),
                        t.app.home.dayCount,
                      ),
                    })
                  : t.app.home.stableAlways}
              </Text>
            </Card>
          </Porta>
        </View>
      ) : (
        <View>
          <Porta aoTocar={() => go('/inputs')} etiqueta={t.app.home.changed} convite={t.app.home.openScreen}>
            <Card hue={palette.sky} icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />} title={t.app.home.changed}>
              <View style={{ gap: space.sm }}>
                {moved.map((change) => {
                  /**
                   * A conta é UMA, e mora no domínio — e a seta só aparece quando há o que dizer.
                   *
                   * Esta linha era `previous > 0 ? (novo - previous) / previous : 0`, e o zero
                   * do `else` chegava à tela como **▼ 0,0%**: uma queda desenhada, com seta,
                   * para um insumo cujo custo subiu de ZERO para alguma coisa. O razão aceita
                   * taxa zero (uma amostra, um brinde, uma correção) e o filtro de cima deixa
                   * a linha passar, então isso chega ao olho de quem decide compra.
                   *
                   * `variacaoDoCusto` devolve `null` para base zero, porque nenhum percentual
                   * diz "de nada para algo". Aqui `null` vira o nome sem número: a linha conta
                   * que o item entrou na conversa sem afirmar uma variação que não existe.
                   */
                  const delta = variacaoDoCusto(change.previousRate, change.newRate);
                  return (
                    <View key={`${change.itemId}-${change.observedAt}`} style={styles.row}>
                      <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {change.name}
                      </Text>
                      {delta === null ? (
                        <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                          {t.app.home.changedNoBase}
                        </Text>
                      ) : (
                        <Text style={[type.secondary, styles.number, { color: delta > 0 ? color.warning : color.ok }]}>
                          {delta > 0 ? '▲' : '▼'} {formatPercent(Math.abs(delta), locale)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </Card>
          </Porta>
        </View>
      )
    ),

    // Produção ao vivo só existe quando há o que estar vivo.
    //
    // Ela nascia sempre, dizendo "0 · Nada saiu ainda hoje" — e ao lado de "Hoje
    // na fábrica: 0" e "Últimas corridas: nenhuma", virava a terceira maneira de
    // dizer o mesmo nada. Eu guardei a EXPANSÃO e esqueci a EXISTÊNCIA: "ligar
    // não é forçar" vale para o cartão, não só para o convite dentro dele.
    // Ao vivo é o que está ACONTECENDO, e só existe quando há.
    //
    // Ela mostrava o total do dia, que é o mesmo número da manchete: com 500
    // unidades produzidas, a capa dizia "500" duas vezes em dois cartões
    // seguidos. Duas peças para um número é a capa competindo consigo mesma — o
    // mesmo defeito do widget do tacho, que eu já tinha removido por isso.
    aoVivo:
      (data?.running ?? []).length === 0 ? null : (
      <Peca
        index={1}
        hue={palette.apricot}
        icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
        title={t.app.home.liveTitle}
        aberta={aberta === 'aoVivo'}
        onToggle={() => abrir('aoVivo')}
        mais={
          // Peça sem nada a dizer não convida: numa fábrica que não produziu
          // hoje nem tem tacho aberto, abrir mostraria uma linha vazia e um
          // link. Convite que não entrega nada é a mesma doença do alerta
          // inventado — ensina a ignorar o convite.
          (data?.running ?? []).length === 0 && (data?.madeToday ?? 0) === 0 ? undefined : (
          <>
            {(data?.running ?? []).map((r) => (
              <View key={r.id} style={[styles.row, { gap: space.sm }]}>
                <PulseDot live color={palette.apricot} />
                <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                  {r.productName}
                </Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {fill(t.app.home.liveOpened, { time: formatTime(r.openedAt, locale) })}
                </Text>
              </View>
            ))}
            <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
          </>
          )
        }
      >
        {/* O número é quantas corridas estão abertas, não quanto saiu hoje — esse
            já é a manchete logo acima. */}
        <CountUp
          value={(data?.running ?? []).length}
          format={(v) => formatQuantity(Math.round(v), locale)}
          style={{ ...type.figure, color: color.ink }}
        />
        <View style={[styles.row, { gap: space.sm }]}>
          {/* O pulso vive AQUI e não num cartão próprio.
              Ele era o widget "tacho", que dizia o mesmo assunto desta peça com
              uma palavra de fábrica de sorvete — duas peças para um assunto é a
              capa competindo consigo mesma. Pulsar só quando há produção em
              curso continua valendo: pulso ao lado de número parado é mentira
              visual. */}
          {(data?.running ?? []).length > 0 ? <PulseDot live color={palette.apricot} /> : null}
          <Text style={[type.caption, { color: color.inkMuted, flex: 1 }]} numberOfLines={2}>
            {fill(t.app.home.liveRuns, {
              count: plural((data?.running ?? []).length, t.app.home.runCount),
            })}
          </Text>
        </View>
      </Peca>
    ),

    // Histórico só existe quando há história.
    historico:
      (data?.runs ?? []).length === 0 ? null : (
      <Peca
        index={2}
        hue={palette.sand}
        icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
        title={t.app.home.historyTitle}
        aberta={aberta === 'historico'}
        onToggle={() => abrir('historico')}
        mais={
          (data?.runs ?? []).length > 0 ? (
            <>
              {(data?.runs ?? []).map((r) => (
                <View key={`${r.occurredAt}-${r.code ?? ''}`} style={[styles.row, { gap: space.sm }]}>
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {formatTime(r.occurredAt, locale)}
                  </Text>
                  <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={[type.secondary, styles.number, { color: color.ink }]}>
                    {formatQuantity(r.baseUnits, locale)}
                  </Text>
                </View>
              ))}
            </>
          ) : undefined
        }
      >
        {(data?.runs ?? []).length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.home.historyEmpty}</Text>
        ) : (
          <>
            <Text style={[type.cardTitle, { color: color.ink }]}>
              {fill(t.app.home.historyRun, {
                amount: `${formatQuantity(data!.runs[0].baseUnits, locale)} ${plural(data!.runs[0].baseUnits, t.units.unit)}`,
                code: data!.runs[0].code ?? '—',
              })}
            </Text>
            {/* A linha das corridas, do mais antigo para o mais novo.
                Ela entra sendo traçada: o gesto é o que faz uma sequência de
                números parecer o ritmo de uma semana em vez de uma tabela. */}
            {data!.runs.length > 1 ? (
              <Sparkline
                values={[...data!.runs].reverse().map((r) => r.baseUnits)}
                hue={palette.sand}
              />
            ) : null}
            {/* Lei 3: a última corrida sozinha não diz nada. A média das
                registradas é o normal contra o qual ela se lê. */}
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {fill(t.app.home.historyAverage, {
                amount: `${formatQuantity(
                  Math.round(
                    data!.runs.reduce((n, r) => n + r.baseUnits, 0) / data!.runs.length,
                  ),
                  locale,
                )} ${t.units.unit.other}`,
              })}
            </Text>
          </>
        )}
      </Peca>
    ),

    // Cobertura só existe quando o livro-razão viu saída.
    //
    // "sem saída registrada — ninguém sabe quanto dura" é uma frase honesta e
    // uma peça inútil: ela ocupa a capa para dizer que não tem resposta.
    cobertura:
      (data?.cover ?? []).length === 0 ? null : (
      <Peca
        index={3}
        hue={palette.mint}
        icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
        title={t.app.home.coverTitle}
        aberta={aberta === 'cobertura'}
        onToggle={() => abrir('cobertura')}
        mais={
          (data?.cover ?? []).length > 0 ? (
            <>
              {(data?.cover ?? []).slice(0, 6).map((item) => (
                <View key={item.itemId} style={[styles.row, { gap: space.sm }]}>
                  <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                    {plural(Math.floor(item.daysLeft), t.app.home.dayCount)}
                  </Text>
                </View>
              ))}
            </>
          ) : undefined
        }
      >
        {(data?.cover ?? []).length === 0 ? (
          <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.home.coverUnknown}</Text>
        ) : (
          <>
            <Text style={[type.figure, { color: color.ink }]}>
              {formatQuantity(Math.floor(data!.cover[0].daysLeft), locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {fill(t.app.home.coverDays, {
                days: plural(Math.floor(data!.cover[0].daysLeft), t.app.home.dayCount),
              })}
              {' · '}
              {fill(t.app.home.coverTightest, { item: data!.cover[0].name })}
            </Text>
            {/* O horizonte é um mês, que é a janela em que uma fábrica compra.
                A barra vira alerta sozinha embaixo de uma semana - a cor conta o
                que o número já disse, para quem passa o olho sem ler. */}
            <View style={{ marginTop: space.sm }}>
              <Drain share={Math.min(1, data!.cover[0].daysLeft / 30)} hue={palette.mint} />
            </View>
          </>
        )}
      </Peca>
    ),

    entregaHoje: (
        (data?.dueToday ?? []).length > 0 ? (
          <Peca
            index={4}
            hue={palette.lilac}
            icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
            title={t.app.home.dueTitle}
            aberta={aberta === 'entregaHoje'}
            onToggle={() => abrir('entregaHoje')}
            mais={
              <>
                {(data?.dueToday ?? []).map((p) => (
                  <Text
                    key={p.id}
                    style={[type.secondary, { color: p.sent ? color.inkMuted : color.ink }]}
                    numberOfLines={1}
                  >
                    {fill(p.sent ? t.app.home.dueDone : t.app.home.duePending, {
                      name: p.name || t.app.places.factory,
                    })}
                  </Text>
                ))}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatQuantity((data?.dueToday ?? []).filter((p) => !p.sent).length, locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {fill(t.app.home.duePending, {
                name:
                  (data?.dueToday ?? []).find((p) => !p.sent)?.name ||
                  (data?.dueToday ?? [])[0].name ||
                  t.app.places.factory,
              })}
            </Text>
          </Peca>
        ) : null
    ),

    validade: (
        (data?.expiring ?? []).length > 0 ? (
          <Peca
            index={5}
            tone="warning"
            icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
            title={t.app.home.expiryTitle}
            aberta={aberta === 'validade'}
            onToggle={() => abrir('validade')}
            mais={
              <>
                {(data?.expiring ?? []).map((l) => (
                  <View key={l.lotId} style={[styles.row, { gap: space.sm }]}>
                    <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Text style={[type.caption, { color: color.inkMuted }]}>
                      {fill(t.app.home.expiryLot, {
                        code: l.code,
                        date: formatCalendarDate(l.expiresOn, locale),
                      })}
                    </Text>
                  </View>
                ))}
              </>
            }
          >
            <Text style={[type.cardTitle, { color: color.ink }]} numberOfLines={1}>
              {data!.expiring[0].name}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {fill(t.app.home.expiryLot, {
                code: data!.expiring[0].code,
                date: formatCalendarDate(data!.expiring[0].expiresOn, locale),
              })}
            </Text>
            {/* Quanto falta dos trinta dias que a peça olha. Sem o desenho, "12
                de setembro" pede que a pessoa faça a conta de cabeça. */}
            <View style={{ marginTop: space.sm }}>
              <Drain
                share={
                  Math.max(
                    0,
                    daysBetween(
                      nowIso(),
                      `${data!.expiring[0].expiresOn}T00:00:00.000Z`,
                      locale.timeZone,
                    ),
                  ) / 30
                }
              />
            </View>
          </Peca>
        ) : null
    ),

    perdas: (
        (data?.lossesNow ?? 0) > 0 || (data?.lossesBefore ?? 0) > 0 ? (
          <Peca
            index={6}
            hue={palette.apricot}
            icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
            title={t.app.home.lossTitle}
            aberta={aberta === 'perdas'}
            onToggle={() => abrir('perdas')}
            mais={
              <>
                {data?.lossesWorst ? (
                  <Text style={[type.secondary, { color: color.ink }]}>
                    {fill(t.app.home.lossWorst, {
                      reason: t.loss[
                        data.lossesWorst.reason as keyof typeof t.loss
                      ].toLocaleLowerCase(locale.formatting),
                    })}
                  </Text>
                ) : null}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatMoney((data?.lossesNow ?? 0) as Cents, locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {(data?.lossesBefore ?? 0) > 0
                ? fill(t.app.home.lossVsBefore, {
                    amount: formatMoney((data?.lossesBefore ?? 0) as Cents, locale),
                  })
                : t.app.home.lossFirst}
            </Text>
            {/* O mês contra o anterior, na mesma régua: a barra de baixo é o
                mês passado, e a de cima só passa dela se a fábrica piorou.
                Duas barras dizem em um relance o que dois números pedem para
                comparar de cabeça. */}
            {(data?.lossesBefore ?? 0) > 0 ? (
              <View style={{ marginTop: space.sm, gap: space.xs }}>
                <Drain
                  share={
                    (data?.lossesNow ?? 0) /
                    Math.max(data?.lossesNow ?? 0, data?.lossesBefore ?? 1)
                  }
                  hue={color.warning}
                />
                <Drain
                  share={
                    (data?.lossesBefore ?? 0) /
                    Math.max(data?.lossesNow ?? 0, data?.lossesBefore ?? 1)
                  }
                  hue={color.inkFaint}
                />
              </View>
            ) : null}
          </Peca>
        ) : null
    ),

    custo: (
        (data?.runs ?? []).some((r) => r.unitCostRate !== null) ? (
          <Peca
            index={7}
            hue={palette.sky}
            icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
            title={t.app.home.costTitle}
            aberta={aberta === 'custo'}
            onToggle={() => abrir('custo')}
            mais={
              <>
                {(data?.runs ?? [])
                  .filter((r) => r.unitCostRate !== null)
                  .slice(0, 5)
                  .map((r) => (
                    <View key={`${r.occurredAt}-c`} style={[styles.row, { gap: space.sm }]}>
                      <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {r.code ?? r.name}
                      </Text>
                      <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                        {formatMoney(cents(r.unitCostRate!), locale)}
                      </Text>
                    </View>
                  ))}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatMoney(cents(comCusto[0]!.unitCostRate!), locale)}
            </Text>
            {/* O custo congelado corrida a corrida. É a única peça em que a
                linha SUBINDO é notícia ruim, e por isso ela não muda de cor: a
                cor diria o que só o dono sabe - polpa mais cara por safra é
                normal, por desperdício não é. */}
            {comCusto.length > 1 ? (
              <Sparkline
                values={[...comCusto].reverse().map((r) => r.unitCostRate ?? 0)}
                hue={palette.sky}
              />
            ) : null}
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {comCusto.length > 1
                ? fill(t.app.home.costBefore, {
                    amount: formatMoney(cents(comCusto[1]!.unitCostRate!), locale),
                  })
                : t.app.home.costOnlyOne}
            </Text>
          </Peca>
        ) : null
    ),

    /**
     * A cópia velha — a única peça desta capa cujo assunto não é a fábrica.
     *
     * Ela existe porque o item 0 da fila fechou o risco de perder o razão e deixou
     * um buraco atrás dele: **cópia que ninguém faz é cópia que não existe.** A
     * tela de cópia diz há quantos dias foi a última, e só diz para quem a abre —
     * que é justamente quem não precisa do lembrete.
     *
     * Some quando está em dia, e essa é a regra inteira: peça que aparece sempre é
     * peça que ninguém lê, e "está tudo bem" é estado válido. Catorze dias porque é
     * o intervalo em que uma fábrica pequena acumula trabalho que doeria perder —
     * menos que isso vira barulho semanal, mais que isso já é um mês de razão.
     */
    copia: (() => {
      // A REGRA mora em `avisoDaCopia`, no domínio, onde o teste alcança. Aqui só
      // se desenha o que ela respondeu — foi assim que a legenda e a cena da capa
      // pararam de poder discordar, e vale igual.
      const aviso = avisoDaCopia(data?.copia, (data?.series ?? []).some((d) => d.total > 0));
      if (aviso === null) return null;
      return (
        <Peca
          index={9}
          tone="warning"
          icon={(c) => <GlyphArchive size={26} color={c} weight={traco} />}
          title={
            aviso === 'nunca'
              ? t.app.home.copyNeverTitle
              : fill(t.app.home.copyOldTitle, { days: String(data?.copia?.diasAtras ?? 0) })
          }
          aberta={aberta === 'copia'}
          onToggle={() => go('/backup')}
        >
          <Text style={[type.secondary, { color: color.ink }]}>
            {aviso === 'nunca'
              ? t.app.home.copyNeverBody
              : (data?.copia?.desdeEla ?? 0) > 0
                ? fill(t.app.home.copyOldBody, {
                    movements: plural(data!.copia!.desdeEla, t.app.home.movementCount),
                  })
                : t.app.home.copyOldQuiet}
          </Text>
        </Peca>
      );
    })(),

    parado: (
        (data?.heldCents ?? 0) > 0 ? (
          <Peca
            index={8}
            hue={palette.mint}
            icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
            title={t.app.home.heldTitle}
            aberta={aberta === 'parado'}
            onToggle={() => abrir('parado')}
            mais={
              <>
                {(data?.cover ?? []).slice(0, 5).map((item) => (
                  <View key={`${item.itemId}-p`} style={[styles.row, { gap: space.sm }]}>
                    <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                      {plural(Math.floor(item.daysLeft), t.app.home.dayCount)}
                    </Text>
                  </View>
                ))}
                <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.home.openScreen}</Text>
              </>
            }
          >
            <Text style={[type.figure, { color: color.ink }]}>
              {formatMoney((data?.heldCents ?? 0) as Cents, locale)}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {t.app.home.heldDetail}
              {(data?.cover ?? []).length > 0
                ? ` · ${fill(t.app.home.coverDays, {
                    days: plural(Math.floor(data!.cover[0].daysLeft), t.app.home.dayCount),
                  })}`
                : ''}
            </Text>
          </Peca>
        ) : null
    ),
  };

  /**
   * O primeiro dia tem UMA peça, e ela é um convite — não quatro vazios.
   *
   * O dono abriu o aplicativo instalado e viu isto: "0 unidades", "0 · nada saiu
   * ainda", "nenhuma corrida registrada", "sem saída registrada". Quatro cartões
   * dizendo que não há nada, e nenhuma próxima ação em lugar nenhum — quando a
   * Lei da Inteligência exige justamente a próxima ação provável, e quando este
   * arquivo já dizia, em comentário, que peça sem o que dizer não aparece.
   *
   * Estado vazio bonito é estado válido; quatro estados vazios empilhados são
   * uma tela que ensina que a capa não serve para nada.
   */
  /**
   * "Ainda não trabalhou" — que não é a mesma coisa que "não existe nada".
   *
   * A primeira versão deste cartão substituía a capa INTEIRA, e o CI derrubou
   * por três caminhos no mesmo dia: nota de compra lançada, produção marcada em
   * curso, preço que mudou. Nos três a fábrica tinha notícia e a capa respondia
   * "primeiro dia". Esconder o que existe é pior que mostrar vazio — vazio é
   * uma tela que não serve, esconder é uma tela que MENTE.
   *
   * E a correção óbvia estava errada também: exigir que NADA exista nunca
   * fecharia o portão, porque a semeadura já compra insumo — a capa voltaria
   * aos quatro cartões vazios que o dono recusou.
   *
   * A pergunta certa é a do trabalho: saiu alguma coisa do tacho, foi para
   * alguma loja, alguém pediu, tem tacho aberto, venceu ou perdeu? Comprar
   * insumo não é trabalho da fábrica, é o estoque de partida. Então o cartão
   * entra no lugar das peças de trabalho vazias, e o preço, o dinheiro parado e
   * o tempo continuam dizendo o que sabem.
   */
  /**
   * A leitura falhou — e a capa DIZ isso, em vez de esperar para sempre.
   *
   * Esta é a tela que o dono abre de manhã. Quando a consulta do dia falha, o que
   * havia aqui era a linha de olho e mais nada: nem manchete, nem cena, nem peça,
   * nem uma palavra. E antes de esvaziar, com metade da resposta, ela chegou a
   * escrever "Parada agora: nada em produção, nada feito e nada saiu hoje" —
   * afirmando sobre a fábrica sem ter conseguido lê-la.
   *
   * A frase segue o tom da casa: diz o que aconteceu, não culpa ninguém, e não
   * some com o resto da página. E oferece a próxima ação, que aqui é uma só.
   */
  if (estado === 'falhou') {
    pecas.producao = (
      <View>
        <Manchete leve={t.app.home.capaLead} forte={t.app.home.readFailed} />
        <View style={{ marginTop: space.md }}>
          <FactoryScene running={false} shipped={false} dayShare={null} />
        </View>
        <Regua />
        <Text style={[type.body, { color: color.inkMuted }]}>{t.app.home.readFailedBody}</Text>
        {denovo ? (
          <Touchable onPress={denovo} accessibilityLabel={t.app.home.readFailedAction}>
            <Text style={[type.body, { color: accent, marginTop: space.md, fontWeight: '600' }]}>
              {t.app.home.readFailedAction} →
            </Text>
          </Touchable>
        ) : null}
        {erro ? (
          <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
            {erro.message}
          </Text>
        ) : null}
      </View>
    );
  }

  // Sem dado ainda não há passo a sugerir, e o estado 'firstDay' só existe com
  // dado na mão — o zero aqui nunca chega à tela, é o piso do tipo.
  const passo = primeiroPasso(data?.preparo ?? { insumos: 0, fichas: 0, produtos: 0 });

  if (estado === 'firstDay') {
    // No lugar da peça do dia, não no lugar da capa: o que as outras peças
    // souberem dizer continua dito, na ordem que a empresa escolheu.
    pecas.producao = (
      <View>
        <View>
          {/* O primeiro dia na mesma tipografia dos outros — e isso importa mais
              do que parece. O que o dono fotografou como "o que você está me
              entregando" era EXATAMENTE este estado: um cartão arredondado com
              um degradê dentro. Estado vazio não é uma tela à parte; é a mesma
              página com menos números. */}
          <Manchete leve={t.app.home.capaLead} forte={t.app.home.capaQuiet} />
          <View style={{ marginTop: space.md }}>
            <FactoryScene running={false} shipped={false} dayShare={null} />
          </View>
          <Legenda>{t.app.home.capaLegend}</Legenda>
          <Regua />
          <Text style={[type.body, { color: color.inkMuted }]}>{t.app.home.firstDayBody}</Text>
          {/* A primeira ação é o passo que a fábrica ainda NÃO deu, e não a
              corrida de produção sempre. A capa oferecia produzir num aplicativo
              sem ficha nenhuma; o toque abria a tela de produção e ela respondia
              "cadastre a receita primeiro" — explicando o impedimento e sem
              oferecer a porta. Quem decide é `primeiroPasso`, no domínio, que
              devolve fato; a frase e a rota são desta tela. */}
          <Touchable onPress={() => go(PASSO[passo].rota)} accessibilityLabel={PASSO[passo].frase(t)}>
            <Text style={[type.body, { color: accent, marginTop: space.md, fontWeight: '600' }]}>
              {PASSO[passo].frase(t)} →
            </Text>
          </Touchable>

          {/* E a SEGUNDA porta, que é o outro caminho — decisão do dono de 11 de setembro:
              *"partir dos dois lados: inicio e fim, ambos valendo desde que o resultado
              seja o mesmo"*.

              Duas linhas aqui não é desordem: são dois caminhos diferentes para a mesma
              coisa, e a de cima continua sendo o padrão. A de baixo é para quem chega
              pensando no que acabou de sair do tacho em vez de no formulário que vem
              primeiro — e ela é a mais fraca visualmente de propósito, porque o passo a
              passo é o seguro (*"é mais seguro, apesar de mais longo"*). */}
          <Touchable onPress={() => go('/fiz')} accessibilityLabel={t.app.fiz.inviteWithChain}>
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
              {t.app.fiz.invite} →
            </Text>
          </Touchable>

          {/* O QUE VAI APARECER AQUI — e isto existe por uma foto.
              O emulador mostrou a capa do primeiro dia com DOIS TERÇOS da tela em
              branco: manchete, cena, uma frase, um link, a semana, e nada. Cada
              peça estava certa em calar (cobertura precisa de consumo, entrega
              precisa de acordo, validade precisa de lote), e o conjunto parecia o
              aplicativo desligado — que é a coisa que o dono nomeou com todas as
              letras: *"vc já viu organismo vivo MORTO?"*.
              A regra dele diz o conserto e diz que não é inventar dado: **vida é
              ambiente, o que se mexe sem afirmar nada sobre o razão**. Então o
              primeiro dia ganha o que um jornal põe na edição fina — não espaço
              branco, uma pauta. Estas quatro linhas não afirmam número nenhum:
              dizem o que a página vai ser, que é a primeira das três perguntas da
              Lei ("o que é normal aqui") respondida para quem nunca viu.
              E some sozinho no dia seguinte, porque só existe no `firstDay`. */}
          <Regua />
          <Text style={[type.overline, { color: color.inkFaint }]}>{t.app.home.firstDayNext}</Text>
          {(
            [
              ['producao', (c: string) => <GlyphProduction size={22} color={c} weight={traco} />],
              ['estoque', (c: string) => <GlyphStock size={22} color={c} weight={traco} />],
              ['entregas', (c: string) => <GlyphBox size={22} color={c} weight={traco} />],
              ['validade', (c: string) => <GlyphCalendar size={22} color={c} weight={traco} />],
            ] as const
          ).map(([chave, desenho], i) => (
            <View
              key={chave}
              style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}
            >
              <View style={{ paddingTop: 2 }}>{desenho(color.inkFaint)}</View>
              <View style={{ flex: 1 }}>
                <Text style={[type.secondary, { color: color.ink }]}>
                  {t.app.home.firstDayPreview[chave].title}
                </Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {t.app.home.firstDayPreview[chave].body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
    // As peças de trabalho vazias somem em vez de empilhar quatro zeros: cada
    // uma já devolve nulo sem dado, e o convite acima responde por todas.
  }

  /**
   * O que a pele desenha à sua maneira entra por cima do padrão, no fim.
   *
   * No fim de propósito: o `firstDay` acima troca a peça da produção, e a pele
   * precisa poder responder pelo primeiro dia também — o herói do Orgânico
   * mostra "ainda não produziu hoje" sobre a paisagem, que é o mesmo assunto
   * dito na cara dele. Se a substituição da pele viesse antes, o `firstDay` a
   * apagaria e o Orgânico voltaria a exibir a manchete do Papel.
   */
  for (const [id, Desenho] of Object.entries(vestimenta.pecas ?? {})) {
    const qual = id as BriefingWidget;
    pecas[qual] = (
      <Desenho
        key={id}
        {...vista}
        estado={estado}
        aberta={aberta}
        abrir={abrir}
        Casca={cascas[qual]!}
      />
    );
  }

  /**
   * O herói: a peça que sangra no topo, quando a pele tem uma e a casa a mostra.
   *
   * Esconder a produção do dia nos ajustes tira o herói junto — e a `Folha`
   * volta a desenhar a própria linha de olho. Uma capa sem a peça de cima não
   * pode ficar sem topo.
   */
  // O herói entra ANTES da primeira fila, e entra sem escala.
  //
  // Ele sangra de borda a borda, então `enterScale` mostraria a cor da página nas
  // laterais e no topo durante a chegada — a única peça da capa em que a escala de
  // entrada é errada. Sem isto ele aparecia pronto e imóvel no Orgânico, que é a
  // maior coisa da tela e a primeira que se olha.
  const heroi =
    vestimenta.sangra && layout.includes(vestimenta.sangra) && pecas[vestimenta.sangra] ? (
      <Reveal index={0} escala={false}>
        {pecas[vestimenta.sangra]}
      </Reveal>
    ) : null;
  const miolo = layout.filter((id) => id !== vestimenta.sangra && pecas[id] !== null);
  const vestidasPelaPele = new Set<string>(Object.keys(vestimenta.pecas ?? {}));

  // O espaço entre as peças é do casco, não de cada peça: a folha antiga dava
  // `gap` no ScrollView, e a capa agora é uma página com margem própria.
  return (
    <vestimenta.Casco
      marca={brand.name}
      data={formatCoverDate(nowIso(), locale)}
      heroi={heroi}
    >
      <View style={{ gap: space.xl }}>
        {/* A capa desenha FILAS, e não peças soltas: uma inteira, ou duas meias
            lado a lado. Quem decide é `briefingFilas`, no domínio, porque a regra
            que importa não é de desenho — meia sozinha vira inteira, senão a
            página fica com um dente faltando e a pessoa procura o que sumiu.
            Aqui só se cumpre o que ela decidiu. */}
        {/* **A entrada mora na FILA, e é uma só para toda pele.**

            Ela morava dentro de cada peça, com dois problemas que só a auditoria
            de 9 de setembro contou. O primeiro: o laço de `vestimenta.pecas` acima
            substitui a peça inteira, então a pele levava junto o `Reveal` que
            embrulhava a versão padrão — no Orgânico o herói, a semana e o clima
            chegavam prontos e imóveis, e "tela que aparece pronta está errada" é
            regra escrita. O segundo: o índice era um literal por peça, e a ordem da
            capa é dinâmica — `semana`, `insumos` e `aoVivo` compartilhavam
            `index={1}`, e o clima entrava antes de duas peças que vêm acima dele.

            Na fila, o índice É a posição de leitura, e pele nova ganha a cascata
            sem escrever nada. */}
        {/* A chave é a IDENTIDADE da fila, não a composição dela. Com `fila.join('+')`,
            uma peça que aparece depois de a consulta responder — e quatro nascem nulas e
            viram não-nulas assim (`insumos`, `aoVivo`, `historico`, `cobertura`) — trocava a
            chave da fila inteira, e chave nova é remontagem: o `Reveal` voltava a zero e
            refazia a entrada do chão, no meio da cascata, na tela que o dono abre primeiro.
            Com a chave na primeira peça, a fila que ganha uma metade continua sendo a mesma
            fila, e só a peça nova entra. */}
        {briefingFilas(miolo, meias).map((fila, posicao) => (
          <Reveal
            key={fila[0]}
            index={posicao}
            style={fila.length > 1 ? { flexDirection: 'row', gap: space.lg } : undefined}
          >
            {fila.map((id) => (
              <View key={id} style={fila.length > 1 ? { flex: 1 } : undefined}>
                {/* A peça da pele já se vestiu por dentro; a do padrão a capa
                    veste, porque dessa a capa SABE se é nula — ela é o elemento,
                    e não um componente que ainda vai decidir. */}
                {vestidasPelaPele.has(id) ? (
                  <Fragment>{pecas[id]}</Fragment>
                ) : (
                  <vestimenta.Bloco id={id}>{pecas[id]}</vestimenta.Bloco>
                )}
              </View>
            ))}
          </Reveal>
        ))}
      </View>
    </vestimenta.Casco>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});

/**
 * A diferença dita com o sinal na frente: "+22", "−19", ou nada quando é zero.
 *
 * O menos é o SINAL de menos (U+2212), não o hífen: num número em figura
 * tabular o hífen fica curto e alto, e a coluna passa a parecer desalinhada.
 * Zero não vira "+0" — dia igual é dia igual, e um sinal ali sugere movimento
 * que não houve.
 */
/**
 * Cada passo da cadeia com a porta dele. A tabela mora fora do componente porque
 * é dado, e porque `primeiroPasso` já garante que os quatro casos existem — um
 * `switch` aqui repetiria a decisão que o domínio tomou.
 */
const PASSO: Record<PrimeiroPasso, { rota: string; frase: (t: Dictionary) => string }> = {
  insumo: { rota: '/inputs/new', frase: (t) => t.app.home.firstStepInput },
  ficha: { rota: '/recipes/new', frase: (t) => t.app.home.firstStepRecipe },
  produto: { rota: '/products/new', frase: (t) => t.app.home.firstStepProduct },
  producao: { rota: '/production/new', frase: (t) => t.app.home.firstDayAction },
};

function sinal(diferenca: number, locale: LocaleSettings): string | null {
  if (diferenca === 0) return null;
  const corpo = formatQuantity(Math.abs(diferenca), locale);
  return diferenca > 0 ? `+${corpo}` : `\u2212${corpo}`;
}

/**
 * A conta do dia por extenso, que é o `[por quê?]` da manchete servido de graça.
 *
 * "500 − 478 = +22 · quinta, há uma semana ficou 19 abaixo." Quem duvidar do
 * número grande tem a subtração na linha de baixo, com os dois operandos — e não
 * precisa tocar em nada para isso.
 */
function contaDoDia(
  data: Summary,
  locale: LocaleSettings,
  t: Dictionary,
): string {
  const q = (n: number) => formatQuantity(n, locale);
  const contra = fill(t.app.home.mathAgainst, {
    today: q(data.madeToday),
    base: q(data.madeYesterday),
    delta: sinal(data.madeToday - data.madeYesterday, locale) ?? q(0),
  });
  const quando = fill(t.app.home.boxLastWeek, {
    weekday: formatWeekdayAbbrev(localDate(nowIso(), locale.timeZone, -7), locale),
  });
  const vao = data.madeToday - data.madeThen;
  /**
   * "Primeiro dia com produção registrada" é uma afirmação forte, e ela estava
   * saindo para uma fábrica com três meses de razão.
   *
   * A condição era só `madeThen === 0` — o mesmo dia da semana passada sem
   * produção. Num domingo, em que a fábrica costuma parar, isso é o normal e não
   * o começo: a capa dizia "0 − 511 = −511 · primeiro dia com produção
   * registrada" com quinhentas unidades de ontem na linha de cima.
   *
   * Primeiro dia é quando os SEIS dias anteriores estão vazios e hoje não. Com
   * os dois zerados, a frase certa é a do empate: "domingo, há uma semana deu o
   * mesmo" — que é verdade e é o que responde "isto é normal aqui?".
   */
  const semanaVazia = data.series.slice(0, -1).every((d) => d.total === 0);
  const semana =
    data.madeThen === 0 && semanaVazia && data.madeToday > 0
      ? t.app.home.mathNoBase
      : vao === 0
        ? fill(t.app.home.mathSame, { when: quando })
        : // O SUJEITO da frase é o dia passado, não hoje: "sáb, há uma semana
          // ficou 455 abaixo" quer dizer que aquele sábado ficou abaixo de hoje.
          // As chaves se chamavam `mathAbove`/`mathBelow` pelo sinal do `vao`, e
          // eu li a tela contra a seta verde de "+455" e quase inverti as três
          // traduções para consertar uma frase que estava certa. Nome que
          // descreve a CONTA ao lado de um texto que descreve o DIA é uma
          // armadilha, e ela já pegou uma vez.
          fill(vao > 0 ? t.app.home.weekWasBelow : t.app.home.weekWasAbove, {
            when: quando,
            gap: q(Math.abs(vao)),
          });
  return `${contra} · ${semana}`;
}

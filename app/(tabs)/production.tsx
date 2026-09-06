import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphKettle, GlyphLabel, GlyphPlus, GlyphProduction } from '@/components/Glyph';
import { IconChevron } from '@/components/icons';
import { PulseDot } from '@/components/PulseDot';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import {
  openProductionRuns,
  lotsOn,
  productionOn,
  type LotOfDay,
  type OpenRun,
  type ProducedInWindow,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { nowIso } from '@/data/db';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import { fill, formatCalendarDate, formatQuantity, formatTime, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * O dia de produção — e o botão que o alimenta.
 *
 * Esta aba era o formulário, e o formulário abria pedindo tachos. Duas coisas
 * erradas de uma vez: a primeira pergunta era a conta do meio, não o fato
 * ("produzi 480 picolés" é o que aconteceu; "rodei um tacho" é como se chega
 * nele), e uma aba que é só formulário não responde nenhuma das três perguntas
 * da Lei da Inteligência. Ela não dizia o que é normal, nem o que mudou hoje.
 *
 * Agora responde: o total do dia contra o de ontem (Lei 3 — nenhum número
 * aparece sozinho), o que já entrou, as produções ainda abertas, e a próxima
 * ação provável num botão só. O formulário mudou de endereço, não de dono.
 *
 * **O desenho foi refeito, não embrulhado** (docs/linguagem.md). O que havia
 * aqui eram quatro retângulos cinzas: título escrito, parágrafo, lista. Três
 * mudanças de fundo:
 *
 * - **Cada assunto é um cartão com crachá e tom.** Produção, panela e lote são
 *   `palette.apricot` em todo o aplicativo — é o tom da aba, e quem vê laranja
 *   sabe que é produção antes de ler. As produções em curso deixaram de ser
 *   `tone="warning"`: panela rodando é o dia normal da fábrica, e pintar o
 *   normal de amarelo é o alerta inventado que a Lei 7 proíbe.
 * - **O total e a quebra dele moram no mesmo cartão.** Eram dois — "Produzido
 *   hoje" com o número e "O que saiu hoje" com a lista — dizendo o mesmo fato em
 *   duas caixas. A quebra é o `[por quê?]` do número, então ela fica debaixo
 *   dele, atrás de um fio.
 * - **Peça sem dado não aparece, e a tela vazia é um convite só.** O cartão de
 *   lista vazia dizendo "nada lançado hoje" virou o estado vazio inteiro:
 *   desenho, uma frase e a próxima ação. Cartão dizendo zero ensina a ignorar
 *   cartão.
 */
export default function ProductionScreen() {
  return (
    <AreaProvider area="apricot">
      <ProductionDay />
    </AreaProvider>
  );
}

type Loaded = {
  today: ProducedInWindow[];
  yesterday: ProducedInWindow[];
  runs: OpenRun[];
  /** Os lotes que nasceram hoje, com o código que vai na caixa. */
  lots: LotOfDay[];
};

function ProductionDay() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();

  /** O código digitado de uma caixa que não é de hoje. */
  const [codigo, setCodigo] = useState('');

  const { data, loading } = useQuery<Loaded>(async () => {
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const ontem = dayWindow(nowIso(), locale.timeZone, -1);
    const [today, yesterday, runs, lots] = await Promise.all([
      productionOn(LOCAL_COMPANY_ID, hoje.from, hoje.to),
      productionOn(LOCAL_COMPANY_ID, ontem.from, ontem.to),
      openProductionRuns(LOCAL_COMPANY_ID),
      lotsOn(LOCAL_COMPANY_ID, hoje.from, hoje.to),
    ]);
    return { today, yesterday, runs, lots };
  });

  const totals = useMemo(() => {
    const soma = (rows: ProducedInWindow[]) => rows.reduce((n, r) => n + r.baseUnits, 0);
    const hoje = soma(data?.today ?? []);
    const ontem = soma(data?.yesterday ?? []);
    return { hoje, ontem, delta: hoje - ontem };
  }, [data]);

  const linhas = data?.today ?? [];
  const abertas = data?.runs ?? [];
  const lotes = data?.lots ?? [];

  /**
   * O veredito da comparação, e ele tem três estados, não dois.
   *
   * `delta >= 0` fazia o empate cair em "acima": uma fábrica que roda a mesma
   * carga todo dia — 480 e 480, o caso normal — lia o número 480, a legenda
   * "Ontem foram 480." e, embaixo das duas, um selo verde afirmando estar ACIMA
   * de ontem. A palavra contradizia os dois números em cima dela.
   *
   * Quem decide é o percentual JÁ arredondado, senão 4.802 contra 4.800 volta a
   * imprimir "0% acima de ontem" — o mesmo defeito com uma casa decimal de
   * disfarce. E as duas frases do empate são separadas de propósito: dizer
   * "mesmo que ontem" para 4.802 seria trocar uma mentira por outra.
   *
   * A capa já reconhecia o terceiro estado (`producedSame`); a aba não. E a
   * frase é dela, não da capa: lá a comparação é com o último dia útil, aqui é
   * com ontem, e a mesma chave diria o dia errado.
   */
  const veredito = useMemo(() => {
    if (totals.ontem <= 0 || totals.hoje <= 0) return null;
    const pct = Math.round((Math.abs(totals.delta) / totals.ontem) * 100);
    if (pct === 0) {
      return {
        signal: 'neutral' as const,
        label:
          totals.delta === 0
            ? t.app.production.sameAsYesterday
            : t.app.production.nearYesterday,
      };
    }
    return {
      signal: totals.delta > 0 ? ('ok' as const) : ('warning' as const),
      label: fill(
        totals.delta > 0 ? t.app.production.aboveYesterday : t.app.production.belowYesterday,
        { percent: String(pct) },
      ),
    };
  }, [totals, t]);

  /** O dia inteiro em branco: nada saiu, nada está rodando, nada nasceu. */
  const vazio =
    !loading && totals.hoje === 0 && totals.ontem === 0 && abertas.length === 0 && lotes.length === 0;

  /** O fio que separa a manchete da conta dela. */
  const fio = {
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.line,
  } as const;

  return (
    <CollapsingHeader title={t.app.production.title} overline={t.app.production.overline}>
      {/* O que é normal ali, e o que está diferente agora. Ontem é a comparação
          honesta para uma fábrica que produz todo dia: a média da semana
          esconde o feriado, e o mês esconde a sazonalidade que o dono conhece
          de cabeça.

          Enquanto carrega, o cartão fica — sumir e voltar pisca a tela, e o
          convite de fábrica nova apareceria por meio segundo em cima de uma
          fábrica que produziu. */}
      {loading || totals.hoje > 0 || totals.ontem > 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
            title={t.app.production.todayTotal}
          >
            <Text style={[type.figure, styles.number, { color: color.ink }]}>
              {loading ? '—' : formatQuantity(totals.hoje, locale)}
            </Text>
            {!loading ? (
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {totals.ontem === 0
                  ? t.app.production.noYesterday
                  : fill(t.app.production.vsYesterday, {
                      units: formatQuantity(totals.ontem, locale),
                    })}
              </Text>
            ) : null}

            {/* O veredito da comparação, em dose pequena. O número por extenso
                fica na linha de cima: cor sozinha não é informação. */}
            {!loading && veredito ? (
              <View style={{ marginTop: space.sm }}>
                <Chip signal={veredito.signal} label={veredito.label} />
              </View>
            ) : null}

            {/* A conta do número, aberta. Sem ícone por linha: o crachá do
                cartão já disse o assunto, e um desenho por linha vira papel de
                parede. */}
            {linhas.length > 0 ? (
              <View style={fio}>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {t.app.production.whatCameOut}
                </Text>
                <View style={{ marginTop: space.sm, gap: space.sm }}>
                  {linhas.map((r) => (
                    <View key={r.itemId} style={[styles.row, { gap: space.md }]}>
                      <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={[type.body, styles.number, { color: color.ink }]}>
                        {plural(
                          r.baseUnits,
                          t.app.production.unitCount,
                          formatQuantity(r.baseUnits, locale),
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </Card>
        </Reveal>
      ) : null}

      {/* A próxima ação provável, e o botão que o dono pediu com todas as
          letras: adicionar o que foi produzido. Ele vem antes das listas porque
          quem abre esta aba no meio do turno vem para lançar, não para ler.
          Na fábrica vazia ele não está aqui — está dentro do convite, que é o
          único bloco da tela. */}
      {!vazio ? (
        <Reveal index={1}>
          <Button
            label={t.app.production.add}
            onPress={() => router.push('/production/new')}
            icon={(c) => <GlyphPlus size={20} color={c} weight={traco} />}
          />
        </Reveal>
      ) : null}

      {/* O que está rodando agora, com o pulso que só existe quando há o que
          pulsar. O tom é o da produção, não o de alerta: panela aberta é o
          estado normal de uma fábrica trabalhando. */}
      {abertas.length > 0 ? (
        <Reveal index={2}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphKettle size={26} color={c} weight={traco} />}
            title={t.app.production.openRuns}
          >
            <View style={{ gap: space.sm }}>
              {abertas.map((r) => (
                <View key={r.id} style={[styles.row, { gap: space.sm }]}>
                  <PulseDot live color={palette.apricot} />
                  <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {r.productName}
                  </Text>
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {fill(t.app.home.liveOpened, { time: formatTime(r.openedAt, locale) })}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* Os lotes do dia, e o código é o ponto.
          Ele é o número que alguém escreve de caneta na caixa antes de ela ir
          para a câmara fria. A primeira versão disto era um diálogo depois de
          gravar - um toque a mais na ação mais frequente do dia, todo dia, e o
          e2e derrubou por travar a barra de abas. Aqui ele aparece sozinho, e
          continua aqui depois: quem procura o lote de uma caixa procura HORAS
          depois, não no segundo seguinte.

          O chevron é da linha, não do assunto: cada lote leva a um lugar, e o
          traço fino é o que diz isso sem repetir o crachá do cartão. */}
      {lotes.length > 0 ? (
        <Reveal index={3}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphLabel size={26} color={c} weight={traco} />}
            title={t.app.production.lotsToday}
          >
            <View>
              {lotes.map((lot, i) => (
                // Toca o lote e a etiqueta abre. É o caminho de quem está com a
                // caixa na mão e precisa do quadrado para colar nela.
                <Touchable
                  key={lot.id}
                  onPress={() => router.push(`/lots/${lot.id}`)}
                  accessibilityLabel={`${t.app.lotLabel.title}: ${lot.code}`}
                  style={
                    i === 0
                      ? { paddingVertical: space.sm }
                      : {
                          paddingVertical: space.sm,
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: color.line,
                        }
                  }
                >
                  <View style={[styles.row, { gap: space.md }]}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[type.body, styles.number, { color: color.ink }]}
                        numberOfLines={1}
                      >
                        {lot.code}
                      </Text>
                      <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={1}>
                        {lot.name} ·{' '}
                        {lot.expiresOn
                          ? fill(t.app.production.lotValid, {
                              date: formatCalendarDate(lot.expiresOn, locale),
                            })
                          : t.app.production.lotNoExpiry}
                      </Text>
                    </View>
                    <Text style={[type.body, styles.number, { color: color.ink }]}>
                      {plural(
                        lot.baseUnits,
                        t.app.production.unitCount,
                        formatQuantity(lot.baseUnits, locale),
                      )}
                    </Text>
                    <IconChevron size={16} color={color.inkFaint} />
                  </View>
                </Touchable>
              ))}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* "Está tudo bem" é estado válido, e nada produzido ainda também é.
          Um convite, não quatro cartões zerados: desenho, uma frase que diz o
          que fazer, e a ação. Nem alerta, nem culpa — a frase não fala do que
          faltou. */}
      {vazio ? (
        <Reveal index={0}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
            title={t.app.production.title}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.production.nothingYet}
            </Text>
            <View style={{ marginTop: space.md }}>
              <Button
                label={t.app.production.add}
                onPress={() => router.push('/production/new')}
                icon={(c) => <GlyphPlus size={20} color={c} weight={traco} />}
              />
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* A caixa que não é de hoje.
          O cartão de cima lista os lotes do DIA, e o comentário dele já dizia o
          que faltava: quem procura o lote de uma caixa procura HORAS depois.
          Três dias depois não havia caminho nenhum — o código impresso era um
          endereço que o aplicativo não sabia abrir, embora a própria etiqueta
          prometa que "alguém digita os onze caracteres e a conferência segue".

          Sem conferir antes de navegar: a etiqueta já sabe dizer "esse lote não
          está mais aqui", com a porta de volta. Duplicar a checagem aqui seria
          dois lugares dizendo a mesma coisa e um deles envelhecendo.

          E sem exigir formato. `AAAAMMDD-NN` é o PADRÃO, não a única forma — o
          `lotCode` diz isso por escrito, e a fábrica que já tem código próprio
          vai poder usá-lo. Recusar por forma aqui quebraria essa promessa. */}
      <Reveal index={vazio ? 1 : 4}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphLabel size={26} color={c} weight={traco} />}
          title={t.app.lotLabel.findTitle}
        >
          <Field
            label={t.app.lotLabel.findLabel}
            value={codigo}
            onChangeText={setCodigo}
            hint={t.app.lotLabel.findHint}
          />
          <Button
            label={t.app.lotLabel.findAction}
            variant="ghost"
            disabled={codigo.trim().length === 0}
            onPress={() => router.push(`/lots/${codigo.trim()}`)}
            style={{ marginTop: space.md }}
          />
        </Card>
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { brand } from '@/config/brand';
import {
  alertSettings,
  briefingHidden,
  briefingOrder,
  countForErase,
  eraseArea,
  ordersNeedApproval,
  setBriefingHidden,
  setAlertSettings,
  setBriefingOrder,
  setOrdersNeedApproval,
} from '@/data/repository';
import { agreedOn, toggleDay } from '@/domain/agreement';
import type { AlertKind, AlertSettings } from '@/domain/alerts';
import { useAppearance } from '@/theme/Appearance';
import {
  addWidget,
  briefingLayout,
  moveWidget,
  widgetsOffCover,
  type BriefingWidget,
} from '@/domain/briefing';
import { hues } from '@/theme/tokens';
import {
  blockerFor,
  EraseBlockedError,
  isEmpty,
  tallyFor,
  type EraseArea,
  type EraseBlocker,
  type EraseCounts,
  type EraseTally,
} from '@/data/erase';
import { hasSeeded, LOCAL_COMPANY_ID, restoreStarterData } from '@/data/seed';
import { simulateFortnight } from '@/data/simulate';
import { useQuery } from '@/data/useQuery';
import { fill, formatQuantity, formatWeekdayShort, joinList, plural } from '@/i18n';
import type { Dictionary } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Settings, which for now means one thing: getting your data back out.
 *
 * The app ships with an example so it does not open onto nothing, and that is
 * only defensible if wiping it is easy and obvious. Otherwise the first real
 * use happens on top of invented numbers, and the cadastro is dirty from the
 * first day.
 *
 * Two rules from the design system meet here:
 *   - destructive actions get a centred dialog, not a bottom sheet - the one
 *     deliberate exception to "everything rises from the bottom"
 *   - the confirmation says what disappears, counted, in words: "isso apaga 6
 *     insumos, 2 receitas e 1 produto", never "confirmar exclusão?"
 */
export default function SettingsScreen() {
  return (
    <AreaProvider area="mist">
      <Settings />
    </AreaProvider>
  );
}

const AREAS: { area: Exclude<EraseArea, 'all'> }[] = [
  { area: 'purchases' },
  { area: 'recipes' },
  { area: 'products' },
  { area: 'inputs' },
];

/** Puts the blocker into words - the reason and the count, in one sentence. */
function sayBlocker(blocker: EraseBlocker, t: Dictionary): string {
  const words = t.app.settings;

  const say = plural;

  switch (blocker.reason) {
    case 'recipesUseInputs':
      return say(blocker.count, words.blocked.recipesUseInputs);
    case 'purchasesUseInputs':
      return say(blocker.count, words.blocked.purchasesUseInputs);
    case 'productsUseRecipes':
      return say(blocker.count, words.blocked.productsUseRecipes);
    case 'purchasesUseProducts':
      return words.blocked.purchasesUseProducts;
  }
}

/** "Isso apaga 6 insumos, 2 receitas e 1 produto." plus what else goes with it. */
function sayTally(area: EraseArea, tally: EraseTally, t: Dictionary): string {
  const words = t.app.settings;
  if (isEmpty(tally)) return area === 'all' ? words.alreadyEmpty : words.nothingToErase;

  const parts: string[] = [];
  const add = (n: number, key: keyof Dictionary['app']['settings']['counted']) => {
    if (n > 0) parts.push(plural(n, words.counted[key]));
  };
  add(tally.inputs, 'inputs');
  add(tally.recipes, 'recipes');
  add(tally.products, 'products');
  add(tally.places, 'places');
  add(tally.purchases, 'purchases');

  const what = joinList(parts, t.common.and);
  const sentence =
    area === 'purchases'
      ? words.alsoPurchases
      : area === 'recipes'
        ? words.alsoRecipes
        : area === 'inputs'
          ? words.alsoInputs
          : area === 'all'
            ? words.alsoAll
            : words.erases;

  return fill(sentence, { what });
}

function Settings() {
  const { color, type, space, radius, accent } = useTheme();
  const { skin, setSkin, hue, setHue } = useAppearance();

  /**
   * A capa combinada e o que este aparelho esconde.
   *
   * Duas listas porque são dois donos: a ordem é da casa, o esconder é do
   * celular. Guardar as duas juntas faria a preferência de um virar decisão do
   * outro na primeira sincronização.
   */
  const [ordem, setOrdem] = useState<BriefingWidget[]>(() => briefingLayout([], []));
  const [escondidos, setEscondidos] = useState<string[]>([]);
  const fora = widgetsOffCover(ordem);

  useEffect(() => {
    let vivo = true;
    void Promise.all([briefingOrder(), briefingHidden()]).then(([salva, ocultos]) => {
      if (!vivo) return;
      setOrdem(briefingLayout(salva, []));
      setEscondidos(ocultos);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const mover = async (widget: BriefingWidget, direcao: 'up' | 'down') => {
    const nova = moveWidget(ordem, widget, direcao);
    setOrdem(nova);
    await setBriefingOrder(nova);
  };

  /**
   * Colocar na capa uma peça que nasce fora dela.
   *
   * Vai para a ordem da EMPRESA, e não para a preferência do aparelho: a
   * primeira tela é o que todo mundo olha de manhã, então acrescentar um cartão
   * ali é decisão de casa. Esconder continua sendo do aparelho.
   */
  const ligar = async (widget: BriefingWidget) => {
    const nova = addWidget(ordem, widget);
    setOrdem(nova);
    await setBriefingOrder(nova);
  };

  const trocarVisibilidade = async (widget: BriefingWidget) => {
    const nova = escondidos.includes(widget)
      ? escondidos.filter((w) => w !== widget)
      : [...escondidos, widget];
    setEscondidos(nova);
    await setBriefingHidden(nova);
  };
  const { locale, t } = useLocale();
  const confirm = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /**
   * A aprovação de pedido, que é preferência da empresa e não escolha nossa.
   *
   * Uma fábrica quer que o dono veja cada pedido antes de a produção começar;
   * outra tem três clientes e a aprovação só atrasa a entrega. Os dois caminhos
   * existem e a empresa liga o seu - é a mesma regra que decidiu a entrada no
   * chão de fábrica, e ela vale aqui pelo mesmo motivo.
   */
  const { data: approval, refresh: refreshApproval } = useQuery<boolean>(() => ordersNeedApproval());

  /**
   * Os avisos, e o que a casa escolheu sobre cada um.
   *
   * A pergunta do dono foi "dá para configurar quando o alarme avisa?" — e a
   * resposta é a F7: quando depende de quem usa, vira configuração. Uma fábrica
   * que compra na feira das cinco e outra que compra pela internet no domingo
   * têm a mesma necessidade e horas diferentes.
   */
  const { data: alerts, refresh: refreshAlerts } = useQuery<AlertSettings>(() => alertSettings());

  const mexerAlerta = async (proximo: AlertSettings) => {
    await setAlertSettings(proximo);
    refreshAlerts();
  };

  const { data, loading, refresh } = useQuery(
    async () => ({
      counts: await countForErase(LOCAL_COMPANY_ID),
      seeded: await hasSeeded(),
    }),
  );

  const counts: EraseCounts | null = data?.counts ?? null;

  const run = async (area: EraseArea, label: string) => {
    if (!counts || busy) return;

    const blocker = blockerFor(area, counts);
    if (blocker) {
      // Law 5 again: this is not an error report after the fact - the button
      // was already disabled, and this explains the same thing on demand.
      await confirm({
        title: t.app.settings.cannotYet,
        message: sayBlocker(blocker, t),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }

    const go = await confirm({
      title:
        area === 'all'
          ? t.app.settings.eraseAllTitle
          : fill(t.app.settings.eraseTitle, { area: label.toLowerCase() }),
      message: `${sayTally(area, tallyFor(area, counts), t)}\n\n${t.app.settings.noUndo}`,
      confirmLabel: t.app.settings.erase,
      destructive: true,
    });
    if (!go) return;

    setBusy(true);
    try {
      await eraseArea(LOCAL_COMPANY_ID, area);
      refresh();
    } catch (e) {
      await confirm({
        title: e instanceof EraseBlockedError ? t.app.settings.cannotYet : t.app.settings.failedToErase,
        message:
          e instanceof EraseBlockedError
            ? sayBlocker(e.blocker, t)
            : e instanceof Error
              ? e.message
              : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;

    const go = await confirm({
      title: t.app.settings.restoreTitle,
      message: t.app.settings.restoreBody,
      confirmLabel: t.app.settings.restoreConfirm,
    });
    if (!go) return;

    setBusy(true);
    try {
      await restoreStarterData();
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.settings.failedToRestore,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Encher o app com movimento, para poder olhar as telas.
   *
   * O exemplo que vem de fábrica tem um dia de idade e nunca se moveu: prova
   * que a tela desenha, não que ela diz alguma coisa. Metade do briefing só
   * tem o que dizer quando existe passado - "saíram 480 hoje, 200 a mais que na
   * segunda passada" precisa de uma segunda passada.
   *
   * A confirmação diz o que vai ser escrito, como toda escrita deste app, e diz
   * também que o livro-razão fica com esses lançamentos: é dado de verdade num
   * banco de verdade, não um modo de demonstração que some ao fechar.
   */
  const onSimulate = async () => {
    if (busy) return;

    const go = await confirm({
      title: t.app.settings.simulateTitle,
      message: t.app.settings.simulateBody,
      confirmLabel: t.app.settings.simulateConfirm,
    });
    if (!go) return;

    setBusy(true);
    try {
      const feito = await simulateFortnight(LOCAL_COMPANY_ID, { timeZone: locale.timeZone });
      refresh();
      await confirm({
        title: t.app.settings.simulateConfirm,
        message: fill(t.app.settings.simulateDone, {
          runs: String(feito.runs),
          deliveries: String(feito.deliveries),
          invoices: String(feito.invoices),
        }),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } catch (e) {
      await confirm({
        title: t.app.settings.failedToSimulate,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  const total =
    (counts?.inputs ?? 0) +
    (counts?.recipes ?? 0) +
    (counts?.products ?? 0) +
    (counts?.purchases ?? 0);

  return (
    <CollapsingHeader title={t.app.settings.title} overline={`${brand.name} · versão ${Constants.expoConfig?.version ?? '—'}`}>
      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.stored}</Text>
        {loading || !counts ? (
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.settings.checking}
          </Text>
        ) : (
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Line label={t.app.settings.inputs} value={counts.inputs} />
            <Line label={t.app.settings.recipes} value={counts.recipes} />
            <Line label={t.app.settings.products} value={counts.products} />
            <Line label={t.app.settings.purchases} value={counts.purchases} />
          </View>
        )}

        {!loading && data?.seeded ? (
          <View style={{ marginTop: space.md }}>
            <Chip
              signal="neutral"
              label={total > 0 ? t.app.settings.hasExample : t.app.settings.emptyNoExample}
            />
          </View>
        ) : null}
      </Card>

      {/* As peças da capa: o que aparece, em que ordem, e o que este aparelho
          prefere não ver.

          A ordem é da CASA porque a frase mais comum de uma fábrica é "olha lá
          na tela inicial" — se cada um monta a sua, ela para de funcionar.
          Esconder é do aparelho, porque quem está na câmara fria não quer o
          cartão de preço no caminho e isso não muda o que a casa combinou.

          Seta em vez de arrastar: arrastar pede pressão longa e precisão, que é
          o que menos existe numa mão de luva a dezoito graus negativos. */}
      <Card>
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.briefing.label}</Text>
        <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.settings.briefing.hint}
        </Text>

        <View style={{ marginTop: space.md, gap: space.xs }}>
          {ordem.map((widget, i) => {
            const escondido = escondidos.includes(widget);
            return (
              <View key={widget} style={[styles.row, { gap: space.sm, paddingVertical: space.xs }]}>
                <Text
                  style={[
                    type.body,
                    { color: escondido ? color.inkFaint : color.ink, flex: 1 },
                  ]}
                  numberOfLines={1}
                >
                  {t.app.settings.briefing.widgets[widget]}
                  {escondido ? ` · ${t.app.settings.briefing.hidden}` : ''}
                </Text>

                <Pressable
                  onPress={() => void trocarVisibilidade(widget)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: !escondido }}
                  accessibilityLabel={`${t.app.settings.briefing.widgets[widget]}: ${
                    escondido ? t.app.settings.briefing.show : t.app.settings.briefing.hide
                  }`}
                >
                  <Chip
                    signal={escondido ? 'neutral' : 'ok'}
                    label={escondido ? t.app.settings.briefing.show : t.app.settings.briefing.hide}
                  />
                </Pressable>

                <Pressable
                  onPress={() => void mover(widget, 'up')}
                  disabled={i === 0}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.app.settings.briefing.up}: ${t.app.settings.briefing.widgets[widget]}`}
                  style={{ opacity: i === 0 ? 0.3 : 1, padding: space.xs }}
                >
                  <Text style={[type.body, { color: color.ink }]}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => void mover(widget, 'down')}
                  disabled={i === ordem.length - 1}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.app.settings.briefing.down}: ${t.app.settings.briefing.widgets[widget]}`}
                  style={{ opacity: i === ordem.length - 1 ? 0.3 : 1, padding: space.xs }}
                >
                  <Text style={[type.body, { color: color.ink }]}>↓</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* O que existe e não está na capa.
            Sem esta lista, um widget fora do padrão é um widget que não existe:
            o dono não tem como saber que ele está lá, e "quem quiser liga" fica
            sendo uma frase sem botão. */}
        {fora.length > 0 ? (
          <View style={{ marginTop: space.lg, gap: space.xs }}>
            <Text style={[type.overline, { color: color.inkFaint }]}>
              {t.app.settings.briefing.offCover}
            </Text>
            {fora.map((widget) => (
              <View key={widget} style={[styles.row, { gap: space.sm, paddingVertical: space.xs }]}>
                <Text style={[type.body, { color: color.inkMuted, flex: 1 }]} numberOfLines={1}>
                  {t.app.settings.briefing.widgets[widget]}
                </Text>
                <Pressable
                  onPress={() => void ligar(widget)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.app.settings.briefing.putOnCover}: ${t.app.settings.briefing.widgets[widget]}`}
                >
                  <Chip signal="neutral" label={t.app.settings.briefing.putOnCover} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {/* Os avisos.
          Cada linha é um alarme com a antecedência dele, e embaixo a hora e os
          dias. Nada aqui é obrigatório: alarme desligado é escolha legítima, e o
          aplicativo continua inteiro sem nenhum — a capa faz as mesmas contas. */}
      {alerts ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.alerts.label}</Text>
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.settings.alerts.hint}
          </Text>

          <View style={{ marginTop: space.md, gap: space.sm }}>
            {(['insumo', 'pedido', 'validade', 'volume'] as AlertKind[]).map((kind) => {
              const ligado = alerts.on[kind];
              const dias = kind === 'volume' ? null : alerts.daysAhead[kind];
              return (
                <View key={kind} style={{ gap: space.xs }}>
                  <View style={[styles.row, { gap: space.sm }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { color: ligado ? color.ink : color.inkFaint }]}>
                        {t.app.settings.alerts.kinds[kind]}
                      </Text>
                      <Text style={[type.caption, { color: color.inkFaint }]}>
                        {kind === 'volume'
                          ? t.app.settings.alerts.volumeHint
                          : fill(t.app.settings.alerts.daysAhead, {
                              days: plural(dias ?? 0, t.app.home.dayCount),
                            })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() =>
                        void mexerAlerta({ ...alerts, on: { ...alerts.on, [kind]: !ligado } })
                      }
                      accessibilityRole="switch"
                      accessibilityState={{ checked: ligado }}
                      accessibilityLabel={`${t.app.settings.alerts.kinds[kind]}: ${
                        ligado ? t.app.settings.alerts.off : t.app.settings.alerts.on
                      }`}
                    >
                      <Chip
                        signal={ligado ? 'ok' : 'neutral'}
                        label={ligado ? t.app.settings.alerts.on : t.app.settings.alerts.off}
                      />
                    </Pressable>
                  </View>

                  {/* A antecedência só aparece para o alarme ligado que tem dia:
                      oferecer o ajuste de um alarme desligado é pedir decisão
                      sobre coisa que não vai acontecer. */}
                  {ligado && dias !== null ? (
                    <View style={[styles.row, { gap: space.xs }]}>
                      {[1, 2, 3, 5, 7, 14].map((d) => (
                        <Pressable
                          key={d}
                          onPress={() =>
                            void mexerAlerta({
                              ...alerts,
                              daysAhead: { ...alerts.daysAhead, [kind]: d },
                            })
                          }
                          accessibilityRole="radio"
                          accessibilityState={{ selected: d === dias }}
                          accessibilityLabel={`${t.app.settings.alerts.kinds[kind]}: ${d}`}
                          style={{
                            borderWidth: StyleSheet.hairlineWidth * 2,
                            borderColor: d === dias ? accent : color.line,
                            backgroundColor: d === dias ? `${accent}18` : 'transparent',
                            borderRadius: 999,
                            paddingHorizontal: space.md,
                            paddingVertical: space.xs,
                          }}
                        >
                          <Text
                            style={[
                              type.caption,
                              { color: d === dias ? color.ink : color.inkMuted },
                            ]}
                          >
                            {formatQuantity(d, locale)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* A hora, e os dias. Valem para todos os avisos: o dono não quer
              regular sete horários, quer regular "de manhã". */}
          <View style={{ marginTop: space.lg, gap: space.sm }}>
            <Text style={[type.overline, { color: color.inkFaint }]}>
              {t.app.settings.alerts.hour.toUpperCase()}
            </Text>
            <View style={[styles.wrap, { gap: space.xs }]}>
              {[5, 6, 7, 8, 12, 18].map((h) => (
                <Pressable
                  key={h}
                  onPress={() => void mexerAlerta({ ...alerts, hour: h })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: h === alerts.hour }}
                  accessibilityLabel={`${t.app.settings.alerts.hour}: ${h}h`}
                  style={{
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: h === alerts.hour ? accent : color.line,
                    backgroundColor: h === alerts.hour ? `${accent}18` : 'transparent',
                    borderRadius: 999,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                  }}
                >
                  <Text
                    style={[type.secondary, { color: h === alerts.hour ? color.ink : color.inkMuted }]}
                  >
                    {`${h}h`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[type.caption, { color: color.inkFaint }]}>
              {t.app.settings.alerts.hourHint}
            </Text>

            <Text style={[type.overline, { color: color.inkFaint, marginTop: space.sm }]}>
              {t.app.settings.alerts.weekdays.toUpperCase()}
            </Text>
            <View style={[styles.wrap, { gap: space.xs }]}>
              {[0, 1, 2, 3, 4, 5, 6].map((dia) => {
                // Zero é TODOS os dias, então nenhum chip aceso significa todos.
                const escolhido = alerts.weekdays !== 0 && agreedOn(alerts.weekdays, dia);
                return (
                  <Pressable
                    key={dia}
                    onPress={() =>
                      void mexerAlerta({ ...alerts, weekdays: toggleDay(alerts.weekdays, dia) })
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: escolhido }}
                    accessibilityLabel={`${t.app.settings.alerts.weekdays}: ${formatWeekdayShort(dia, locale)}`}
                    style={{
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: escolhido ? accent : color.line,
                      backgroundColor: escolhido ? `${accent}18` : 'transparent',
                      borderRadius: 999,
                      paddingHorizontal: space.md,
                      paddingVertical: space.sm,
                    }}
                  >
                    <Text
                      style={[type.secondary, { color: escolhido ? color.ink : color.inkMuted }]}
                    >
                      {formatWeekdayShort(dia, locale)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {alerts.weekdays === 0 ? (
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {t.app.settings.alerts.everyDay}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* A cara do aplicativo.
          Claro e escuro continuam seguindo o aparelho, como o sistema manda -
          o que se escolhe aqui é a IDENTIDADE, que é outra pergunta. O dono viu
          quarenta esboços e ficou com duas; nenhuma das duas é a certa para
          todo mundo, e por isso as duas existem em vez de eu escolher por ele. */}
      <Card>
        <Text style={[type.cardTitle, { color: color.ink }]}>
          {t.app.settings.appearance.label}
        </Text>
        <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.settings.appearance.hint}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
          {(
            [
              ['organico', t.app.settings.appearance.organico, t.app.settings.appearance.organicoHint],
              ['papel', t.app.settings.appearance.papel, t.app.settings.appearance.papelHint],
            ] as const
          ).map(([qual, nome, dica]) => (
            <Pressable
              key={qual}
              onPress={() => setSkin(qual)}
              accessibilityRole="radio"
              accessibilityState={{ selected: skin === qual }}
              accessibilityLabel={`${nome}: ${dica}`}
              style={{
                flex: 1,
                padding: space.md,
                borderRadius: radius.lg,
                borderWidth: skin === qual ? 2 : StyleSheet.hairlineWidth,
                borderColor: skin === qual ? accent : color.line,
                backgroundColor: skin === qual ? `${accent}14` : 'transparent',
              }}
            >
              <Text style={[type.body, { color: color.ink }]}>{nome}</Text>
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
                {dica}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* A paleta da paisagem, e só o Orgânico a tem.
            O Papel tem uma cara só, que é a graça dele: revista impressa não
            vem em cinco cores de capa. */}
        {skin === 'organico' ? (
          <View style={{ marginTop: space.lg }}>
            <Text style={[type.body, { color: color.ink }]}>
              {t.app.settings.appearance.palette}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
              {t.app.settings.appearance.paletteHint}
            </Text>
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              {(['verde', 'azul', 'ambar', 'terracota', 'lavanda'] as const).map((qual) => (
                <Pressable
                  key={qual}
                  onPress={() => setHue(qual)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: hue === qual }}
                  accessibilityLabel={t.app.settings.appearance.hues[qual]}
                  style={{ alignItems: 'center', gap: space.xs, flex: 1 }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: hues[qual].brand,
                      borderWidth: hue === qual ? 3 : 0,
                      borderColor: color.ink,
                    }}
                  />
                  <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={1}>
                    {t.app.settings.appearance.hues[qual]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </Card>

      <Pressable
        onPress={async () => {
          await setOrdersNeedApproval(!approval);
          refreshApproval();
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: Boolean(approval) }}
        accessibilityLabel={t.app.settings.approval.label}
      >
        <Card>
          <View style={[styles.row, { gap: space.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[type.cardTitle, { color: color.ink }]}>
                {t.app.settings.approval.label}
              </Text>
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.settings.approval.hint}
              </Text>
            </View>
            <Chip
              signal={approval ? 'ok' : 'neutral'}
              label={approval ? t.app.settings.approval.on : t.app.settings.approval.off}
            />
          </View>
        </Card>
      </Pressable>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          {t.app.settings.clearByArea}
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          {t.app.settings.clearByAreaHint}
        </Text>

        {AREAS.map((entry) => {
          const label =
            entry.area === 'purchases' ? t.app.settings.purchasesRow : t.app.settings[entry.area];
          const blocker = counts ? blockerFor(entry.area, counts) : null;
          const blocked = counts ? (blocker ? sayBlocker(blocker, t) : null) : t.app.settings.checking;
          return (
            <Pressable
              key={entry.area}
              onPress={() => void run(entry.area, label)}
              disabled={busy || !counts}
              accessibilityRole="button"
              accessibilityLabel={`${t.app.settings.erase} ${label}`}
              accessibilityState={{ disabled: Boolean(blocked) }}
              style={[styles.row, { paddingVertical: space.md, gap: space.md }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: blocked ? color.inkFaint : color.ink }]}>
                  {label}
                </Text>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {/* The reason replaces the hint rather than sitting beside a
                      dead button: the person needs the way out, not the label. */}
                  {blocked ?? t.app.settings.areas[entry.area]}
                </Text>
              </View>
              <Text style={[type.body, { color: blocked ? color.inkFaint : color.inkMuted }]}>
                ›
              </Text>
            </Pressable>
          );
        })}
      </Card>

      <Card tone="danger">
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.startOver}</Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.settings.startOverHint}
        </Text>

        <Pressable
          onPress={() => void run('all', t.app.settings.eraseAll)}
          disabled={busy || !counts || total === 0}
          accessibilityRole="button"
          accessibilityLabel={t.app.settings.eraseAll}
          style={[
            styles.destructive,
            {
              borderColor: color.danger,
              marginTop: space.md,
              paddingVertical: space.md,
              opacity: busy || total === 0 ? 0.45 : 1,
            },
          ]}
        >
          <Text style={[type.body, { color: color.danger, fontWeight: '600' }]}>
            {busy ? t.app.settings.erasing : t.app.settings.eraseAll}
          </Text>
        </Pressable>
      </Card>

      {total === 0 && !loading ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.exampleTitle}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.settings.exampleEmpty}
          </Text>
          <Pressable
            onPress={() => void restore()}
            disabled={busy}
            accessibilityRole="button"
            style={[
              styles.destructive,
              { borderColor: color.lineStrong, marginTop: space.md, paddingVertical: space.md },
            ]}
          >
            <Text style={[type.body, { color: color.inkMuted, fontWeight: '600' }]}>
              {t.app.settings.restore}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {/* Ver o app com movimento, em vez do exemplo de um dia.
          Fica embaixo do que apaga e do que restaura, porque é da mesma
          família: mexe no que está guardado, e diz antes o que vai fazer. */}
      {total > 0 && !loading ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.settings.simulate}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.settings.simulateBody}
          </Text>
          <Pressable
            onPress={() => void onSimulate()}
            disabled={busy}
            accessibilityRole="button"
            style={[
              styles.destructive,
              { borderColor: color.lineStrong, marginTop: space.md, paddingVertical: space.md },
            ]}
          >
            <Text style={[type.body, { color: color.inkMuted, fontWeight: '600' }]}>
              {t.app.settings.simulateConfirm}
            </Text>
          </Pressable>
        </Card>
      ) : null}

      <Pressable onPress={() => router.back()} accessibilityRole="button">
        <Text style={[type.secondary, { color: color.inkFaint, textAlign: 'center' }]}>
          {t.app.settings.back}
        </Text>
      </Pressable>
    </CollapsingHeader>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  const { color, type } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]}>{label}</Text>
      <Text style={[type.secondary, styles.number, { color: color.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  destructive: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});

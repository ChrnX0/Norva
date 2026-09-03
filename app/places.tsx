import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { nowIso } from '@/data/db';
import {
  lastReadings,
  listPlaces,
  readingsBetween,
  recordReading,
  savePlace,
  stockByPlace,
  type Place,
  type PlaceStock,
  type Reading,
} from '@/data/repository';
import { dayWindow, localDate } from '@/domain/day';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { agreedOn, daysUntilNextDelivery, toggleDay } from '@/domain/agreement';
import { Chip } from '@/components/Chip';
import { Sparkline } from '@/components/Sparkline';
import { formatTyped, parseTyped } from '@/domain/number';
import {
  fill,
  formatMoney,
  formatQuantity,
  formatTime,
  formatWeekdayShort,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Onde está o que você tem.
 *
 * Existe porque o saldo da empresa e o saldo de um lugar são perguntas
 * diferentes com a mesma resposta somada por eixos diferentes, e até aqui só a
 * primeira tinha tela. Uma fábrica que manda caixa para quatro lojas não decide
 * nada com o total — decide com "o que ainda tem na Loja Centro".
 *
 * O lugar padrão é gravado sem nome de propósito (`repository.listPlaces`), e é
 * aqui que ele ganha um: a camada de dados devolve string vazia, quem fala
 * português é a tela.
 */
export default function PlacesScreen() {
  return (
    <AreaProvider area="mint">
      <Places />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; stock: PlaceStock[]; readings: Reading[] };

function Places() {
  const { color, type, space } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();
  const words = t.app.places;

  const { data, refresh } = useQuery<Loaded>(async () => {
    const [places, stock, readings] = await Promise.all([
      listPlaces(LOCAL_COMPANY_ID),
      stockByPlace(LOCAL_COMPANY_ID),
      lastReadings(LOCAL_COMPANY_ID),
    ]);
    return { places, stock, readings };
  });

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('own_store');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  /**
   * Que dia da semana é hoje, no fuso da fábrica.
   *
   * `localDate` devolve a data de calendário de lá; ler o dia da semana do
   * relógio do aparelho daria o dia errado para quem trabalha de madrugada num
   * fuso e o servidor está noutro.
   */
  const hoje = new Date(`${localDate(nowIso(), locale.timeZone)}T00:00:00Z`).getUTCDay();

  /** O padrão nasce sem nome; a palavra é desta camada, nunca do banco. */
  const nameOf = (place: { locationId?: string; id?: string; name?: string; locationName?: string }) => {
    const raw = place.name ?? place.locationName ?? '';
    return raw.trim() || words.factory;
  };

  const onSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await savePlace(LOCAL_COMPANY_ID, { name, kind });
      setName('');
      setAdding(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const KINDS = ['own_store', 'cold_room', 'store_room'] as const;

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      {(data?.stock.length ?? 0) === 0 ? (
        <Card>
          <Text style={[type.body, { color: color.inkMuted }]}>{words.empty}</Text>
        </Card>
      ) : null}

      {/* A lista é de LUGARES, não de saldos.
          `stockByPlace` começa em movimento, então uma loja recém-cadastrada não
          aparecia até alguém mandar a primeira carga - e é exatamente antes
          dessa carga que se combina o dia de entrega. Uma loja invisível é
          cadastrada duas vezes. */}
      {(data?.places ?? []).map((place) => {
        const saldo = data?.stock.find((s) => s.locationId === place.id) ?? null;
        const recebe = place.kind === 'own_store' || place.kind === 'customer';
        const proxima = daysUntilNextDelivery(place.deliveryDays, hoje);
        return (
          <Card key={place.id} tone="area">
            <View style={styles.row}>
              <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]}>{nameOf(place)}</Text>
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {words.kinds[place.kind as keyof typeof words.kinds] ?? place.kind}
              </Text>
            </View>

            {/* Lei 3: nenhum número sozinho. A quantidade vem com o que ela vale. */}
            <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
              {saldo
                ? `${plural(saldo.lines.length, words.itemCount)} · ${fill(words.worth, {
                    amount: formatMoney(saldo.valueCents, locale),
                  })}`
                : words.emptyPlace}
            </Text>

            {saldo ? (
              <View style={{ marginTop: space.md, gap: space.xs }}>
                {saldo.lines.map((line) => (
                  <View key={line.itemId} style={styles.row}>
                    <Text style={[type.secondary, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                      {line.name}
                    </Text>
                    <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                      {formatQuantity(line.baseUnits, locale)} {line.baseUnit}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* A leitura de ambiente, e só onde ela decide alguma coisa.
                Câmara fria é o caso que o dono levantou: a falha acontece às três
                da manhã, e o histórico é o que diz se o freezer está piorando.
                Digitada hoje; quando o módulo dele existir, ele escreve no mesmo
                lugar com outra origem. */}
            {place.kind === 'cold_room' ? (
              <Ambiente
                place={place}
                last={data?.readings.find((r) => r.locationId === place.id && r.kind === TEMPERATURA)}
                onSaved={refresh}
              />
            ) : null}

            {/* A ficha de acordo, e só para quem recebe carga: combinar dia de
                entrega com o próprio almoxarifado não quer dizer nada. */}
            {recebe ? (
              editing === place.id ? (
                <Agreement
                  place={place}
                  onDone={() => {
                    setEditing(null);
                    refresh();
                  }}
                />
              ) : (
                <View style={{ marginTop: space.md, gap: space.xs }}>
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {place.deliveryDays === 0
                      ? words.noAgreement
                      : fill(words.agreedDays, {
                          days: diasDoAcordo(place.deliveryDays, locale),
                        })}
                    {place.contactPhone ? ` · ${place.contactPhone}` : ''}
                  </Text>
                  {place.agreementNote ? (
                    <Text style={[type.caption, { color: color.inkFaint }]}>
                      {place.agreementNote}
                    </Text>
                  ) : null}
                  {proxima !== null ? (
                    <Text style={[type.caption, { color: color.inkFaint }]}>
                      {proxima === 0
                        ? words.deliversToday
                        : fill(words.deliversIn, {
                            day: formatWeekdayShort((hoje + proxima) % 7, locale),
                          })}
                    </Text>
                  ) : null}
                  <Text
                    accessibilityRole="button"
                    onPress={() => setEditing(place.id)}
                    style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}
                  >
                    {words.editAgreement}
                  </Text>
                </View>
              )
            ) : null}
          </Card>
        );
      })}

      {adding ? (
        <Card>
          <View style={{ gap: space.lg }}>
            <Field
              label={words.placeName}
              value={name}
              onChangeText={setName}
              hint={words.placeNameHint}
            />
            <View>
              <Text style={[type.caption, { color: color.inkMuted, marginBottom: space.sm }]}>
                {words.placeKind}
              </Text>
              <View style={{ gap: space.xs }}>
                {KINDS.map((k) => (
                  <Text
                    key={k}
                    accessibilityRole="button"
                    accessibilityLabel={words.kinds[k]}
                    onPress={() => setKind(k)}
                    style={[type.body, { color: k === kind ? color.ink : color.inkMuted }]}
                  >
                    {k === kind ? '● ' : '○ '}
                    {words.kinds[k]}
                  </Text>
                ))}
              </View>
            </View>
            <Button label={words.save} onPress={onSave} disabled={!name.trim() || saving} />
          </View>
        </Card>
      ) : (
        <Button label={words.newPlace} onPress={() => setAdding(true)} variant="ghost" />
      )}

      {/* A próxima ação provável, que é o terceiro dever de toda tela. */}
      {(data?.places.length ?? 0) > 1 ? (
        <Button label={words.goTransfer} onPress={() => router.push('/transfer')} variant="ghost" />
      ) : null}
    </CollapsingHeader>
  );
}

/**
 * A grandeza que a câmara fria mede, e a única que existe hoje.
 *
 * Constante e não literal espalhada: quando umidade entrar, ela entra ao lado
 * desta linha e não em sete lugares diferentes.
 */
const TEMPERATURA = 'temperature';

/**
 * A leitura de ambiente de um lugar: o que foi medido, e a faixa que julga.
 *
 * Digitada é o único caminho que funciona hoje, e é fato tanto quanto leitura de
 * sensor — a fábrica passa a ter série histórica antes de existir hardware, que é
 * o contrário de esperar o módulo e começar do zero em seis meses.
 *
 * A faixa é opcional e mora no lugar. Sem ela a tela registra e não julga: o
 * aplicativo não sabe qual é a temperatura boa da câmara de outra pessoa, e -18
 * é o número comum de freezer, não uma verdade.
 */
function Ambiente({
  place,
  last,
  onSaved,
}: {
  place: Place;
  last: Reading | undefined;
  onSaved: () => void;
}) {
  const { color, type, space, palette } = useTheme();
  const { locale, t } = useLocale();
  const words = t.app.places;

  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editandoFaixa, setEditandoFaixa] = useState(false);
  const faixa = place.sensorRanges[TEMPERATURA];

  /**
   * A semana da câmara, que é a pergunta que uma leitura sozinha não responde.
   *
   * "-18,4 agora" não diz se o freezer está piorando; sete dias de leitura dizem.
   * É a Lei 3 na forma mais literal — nenhum número aparece sozinho — e é o único
   * motivo de valer a pena anotar todo dia.
   *
   * A consulta existia e ninguém a lia: peça sem chamador é a doença que o P1
   * descreve, e este repositório já a teve em quatro lugares. Aqui ela ganha o
   * leitor que justifica ela existir.
   */
  const { data: serie } = useQuery(
    async () => {
      const hoje = dayWindow(nowIso(), locale.timeZone);
      const semana = dayWindow(nowIso(), locale.timeZone, -6);
      return readingsBetween(LOCAL_COMPANY_ID, place.id, TEMPERATURA, semana.from, hoje.to);
    },
    `${place.id}:${last?.id ?? ''}`,
  );

  const [minimo, setMinimo] = useState(
    faixa?.min === null || faixa?.min === undefined ? '' : formatTyped(faixa.min, locale.formatting, 1),
  );
  const [maximo, setMaximo] = useState(
    faixa?.max === null || faixa?.max === undefined ? '' : formatTyped(faixa.max, locale.formatting, 1),
  );

  /**
   * Grava a faixa no LUGAR, não na leitura.
   *
   * A faixa é da câmara e vale para toda leitura que vier dela — inclusive a do
   * sensor que ainda não existe. Guardar na leitura faria cada medição carregar a
   * sua própria régua, e duas medições da mesma câmara poderiam discordar sobre o
   * que é frio.
   */
  const salvarFaixa = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const min = parseTyped(minimo);
      const max = parseTyped(maximo);
      await savePlace(LOCAL_COMPANY_ID, {
        id: place.id,
        name: place.name,
        kind: place.kind,
        sensorRanges:
          min === null && max === null
            ? {}
            : { ...place.sensorRanges, [TEMPERATURA]: { min, max, unit: faixa?.unit ?? 'C' } },
      });
      setEditandoFaixa(false);
      onSaved();
    } finally {
      setSalvando(false);
    }
  };

  const fora =
    last && faixa
      ? (faixa.min !== null && last.value < faixa.min) ||
        (faixa.max !== null && last.value > faixa.max)
      : false;

  const anotar = async () => {
    const lido = parseTyped(valor);
    if (lido === null || !Number.isFinite(lido) || salvando) return;
    setSalvando(true);
    try {
      await recordReading(LOCAL_COMPANY_ID, {
        locationId: place.id,
        kind: TEMPERATURA,
        value: lido,
        unit: faixa?.unit ?? 'C',
      });
      setValor('');
      onSaved();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <View style={{ marginTop: space.md, gap: space.sm }}>
      <Text style={[type.caption, { color: color.inkFaint }]}>
        {last
          ? fill(words.lastReading, {
              // `formatQuantity` arredonda, e aqui isso perde meio grau de
              // freezer: -18,4 aparecia como -18 na tela enquanto o banco
              // guardava a fração. Número dito diferente do número guardado é o
              // mesmo defeito de arredondar dinheiro cedo.
              value: `${formatTyped(last.value, locale.formatting, 1)} °${last.unit}`,
              time: formatTime(last.takenAt, locale),
            })
          : words.noReading}
      </Text>

      {/* A semana desenhada, quando há mais de uma leitura para comparar.
          Uma leitura só não tem linha: dois pontos é o mínimo para existir
          tendência, e desenhar um ponto sozinho sugeriria uma que ninguém mediu. */}
      {(serie ?? []).length > 1 ? (
        <Sparkline
          values={(serie ?? []).map((r) => r.value)}
          hue={fora ? color.danger : palette.sky}
          strokeWidth={1.7}
          height={36}
        />
      ) : null}

      {/* O juízo só existe com faixa, e ele diz a faixa junto: "fora da faixa"
          sem dizer qual faixa manda a pessoa procurar o número em outra tela. */}
      {last && faixa ? (
        <Chip
          signal={fora ? 'danger' : 'ok'}
          label={
            fora
              ? fill(words.outOfRange, {
                  min: faixa.min === null ? '—' : formatTyped(faixa.min, locale.formatting, 1),
                  max: faixa.max === null ? '—' : formatTyped(faixa.max, locale.formatting, 1),
                })
              : words.inRange
          }
        />
      ) : null}

      <Field
        label={words.reading}
        value={valor}
        onChangeText={setValor}
        keyboardType="numeric"
        suffix={`°${faixa?.unit ?? 'C'}`}
        hint={words.readingHint}
      />
      <Button
        label={words.readingSave}
        variant="ghost"
        disabled={parseTyped(valor) === null || salvando}
        onPress={() => void anotar()}
      />

      {/* A faixa, que é o que transforma leitura em juízo — e que sem escritor
          seria regra que nunca dispara. Fechada por padrão: quem passa aqui todo
          dia vem anotar, não vem reconfigurar. */}
      {editandoFaixa ? (
        <View style={{ gap: space.sm }}>
          <Text style={[type.caption, { color: color.inkFaint }]}>{words.rangeHint}</Text>
          <View style={[styles.row, { gap: space.md }]}>
            <View style={{ flex: 1 }}>
              <Field
                label={words.rangeMin}
                value={minimo}
                onChangeText={setMinimo}
                keyboardType="numeric"
                suffix={`°${faixa?.unit ?? 'C'}`}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={words.rangeMax}
                value={maximo}
                onChangeText={setMaximo}
                keyboardType="numeric"
                suffix={`°${faixa?.unit ?? 'C'}`}
              />
            </View>
          </View>
          <Button label={words.save} variant="ghost" disabled={salvando} onPress={() => void salvarFaixa()} />
        </View>
      ) : (
        <Text
          accessibilityRole="button"
          onPress={() => setEditandoFaixa(true)}
          style={[type.caption, { color: color.inkMuted }]}
        >
          {words.rangeLabel}
        </Text>
      )}
    </View>
  );
}

/** "ter, sex" - a lista curta que cabe no cartão. */
function diasDoAcordo(days: number, locale: Parameters<typeof formatWeekdayShort>[1]): string {
  const nomes: string[] = [];
  for (let dia = 0; dia < 7; dia += 1) {
    if (agreedOn(days, dia)) nomes.push(formatWeekdayShort(dia, locale));
  }
  return nomes.join(', ');
}

/**
 * Onde a entrega se combina.
 *
 * Nada aqui é obrigatório, e é de propósito: uma fábrica combina dia com a loja
 * grande e entrega "quando dá" na banca da esquina. Campo obrigatório aqui
 * viraria dia inventado, e dia inventado é pior que dia nenhum - a tela de
 * pedido passaria a sugerir uma data que ninguém combinou.
 */
function Agreement({ place, onDone }: { place: Place; onDone: () => void }) {
  const { color, type, space, accent } = useTheme();
  const { t } = useLocale();
  const { locale } = useLocale();
  const words = t.app.places;

  const [phone, setPhone] = useState(place.contactPhone);
  const [days, setDays] = useState(place.deliveryDays);
  const [note, setNote] = useState(place.agreementNote);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await savePlace(LOCAL_COMPANY_ID, {
        id: place.id,
        name: place.name,
        kind: place.kind,
        contactPhone: phone.trim(),
        deliveryDays: days,
        agreementNote: note.trim(),
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ marginTop: space.md, gap: space.lg }}>
      <Text style={[type.caption, { color: color.inkFaint }]}>{words.agreementHint}</Text>

      <View>
        <Text style={[type.caption, { color: color.inkMuted, marginBottom: space.sm }]}>
          {words.deliveryDays}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((dia) => {
            const on = agreedOn(days, dia);
            return (
              <Text
                key={dia}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={formatWeekdayShort(dia, locale)}
                onPress={() => setDays((atual) => toggleDay(atual, dia))}
                style={[
                  type.secondary,
                  {
                    color: on ? color.ink : color.inkMuted,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: on ? accent : color.line,
                    backgroundColor: on ? `${accent}18` : 'transparent',
                    borderRadius: 999,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                  },
                ]}
              >
                {formatWeekdayShort(dia, locale)}
              </Text>
            );
          })}
        </View>
        <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
          {words.deliveryDaysHint}
        </Text>
      </View>

      <Field label={words.phone} value={phone} onChangeText={setPhone} hint={words.phoneHint} />
      <Field
        label={words.agreementNote}
        value={note}
        onChangeText={setNote}
        hint={words.agreementNoteHint}
      />
      <Button label={words.save} onPress={save} disabled={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});

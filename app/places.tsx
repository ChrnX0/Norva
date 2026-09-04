import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  GlyphCustomer,
  GlyphFactory,
  GlyphStore,
  GlyphThermometer,
  GlyphVehicle,
} from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { Sparkline } from '@/components/Sparkline';
import { Touchable } from '@/components/Touchable';
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
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`),
 * e o layout anterior — parágrafo cinza dentro de retângulo cinza, pílula de dia
 * desenhada à mão com borda e fundo próprios, rádio de tipo feito com `●`/`○` —
 * saiu inteiro em vez de ganhar um caminho ao lado. Cada lugar passa a ser um
 * assunto: crachá com o desenho do que ele é, o tom que diz de longe se é
 * depósito, destino ou veículo, e o dinheiro que está lá com a conta de quantos
 * itens somam esse dinheiro. Nenhuma caixa é desenhada aqui: `Card`, `Chip` e
 * `Button` já sabem virar régua no Papel e bloco no Orgânico.
 */
export default function PlacesScreen() {
  return (
    <AreaProvider area="mint">
      <Places />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; stock: PlaceStock[]; readings: Reading[] };

/**
 * O desenho de cada tipo de lugar.
 *
 * O crachá é o que responde "que lugar é este" antes de a palavra ser lida —
 * loja é fachada, cliente é pessoa, veículo é carroceria, câmara é termômetro. O
 * resto da casa (fábrica, almoxarifado) é o prédio: são as salas de dentro.
 */
// Devolve o ELEMENTO, não uma função que devolve elemento: a segunda forma tem
// cara de componente de ordem superior e o lint cobra nome de exibição de cada
// uma das cinco. Aqui é só um desenho escolhido por tipo.
function desenhoDoLugar(kind: string, color: string, weight: number): ReactNode {
  if (kind === 'own_store') return <GlyphStore size={26} color={color} weight={weight} />;
  if (kind === 'customer') return <GlyphCustomer size={26} color={color} weight={weight} />;
  if (kind === 'vehicle') return <GlyphVehicle size={26} color={color} weight={weight} />;
  if (kind === 'cold_room') return <GlyphThermometer size={26} color={color} weight={weight} />;
  return <GlyphFactory size={26} color={color} weight={weight} />;
}

function Places() {
  const { color, type, space, palette, skin } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();
  const words = t.app.places;
  const traco = skin === 'papel' ? 1.7 : 2.2;

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

  /**
   * O tom de um lugar, e ele é o tom do ASSUNTO — não uma cor por linha.
   *
   * Quem recebe carga é acordo (`sage`, o mesmo tom de pedido e cliente em toda
   * a casa); quem só guarda é estoque (`mint`); veículo é transporte (`lilac`).
   * De longe a lista já separa depósito de destino sem ninguém ler o rótulo.
   */
  const tomDoLugar = (lugar: string) =>
    lugar === 'vehicle'
      ? palette.lilac
      : lugar === 'own_store' || lugar === 'customer'
        ? palette.sage
        : palette.mint;

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

  /** Nada entrou em lugar nenhum ainda: desenho, uma frase, e a ação embaixo. */
  const semNada = (data?.stock.length ?? 0) === 0;
  const lugares = data?.places ?? [];
  /** A cascata não pula número: o primeiro lugar entra depois do cartão vazio. */
  const primeiroLugar = semNada ? 1 : 0;
  const depoisDosLugares = primeiroLugar + lugares.length;

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      {semNada ? (
        <Reveal index={0}>
          <Card hue={palette.mint} icon={(c) => <GlyphFactory size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.inkMuted }]}>{words.empty}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* A lista é de LUGARES, não de saldos.
          `stockByPlace` começa em movimento, então uma loja recém-cadastrada não
          aparecia até alguém mandar a primeira carga - e é exatamente antes
          dessa carga que se combina o dia de entrega. Uma loja invisível é
          cadastrada duas vezes. */}
      {lugares.map((place, posicao) => {
        const saldo = data?.stock.find((s) => s.locationId === place.id) ?? null;
        const recebe = place.kind === 'own_store' || place.kind === 'customer';
        const proxima = daysUntilNextDelivery(place.deliveryDays, hoje);

        return (
          <Reveal key={place.id} index={primeiroLugar + posicao}>
            <Card
              hue={tomDoLugar(place.kind)}
              icon={(c) => desenhoDoLugar(place.kind, c, traco)}
              title={nameOf(place)}
            >
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {(words.kinds[place.kind as keyof typeof words.kinds] ?? place.kind).toUpperCase()}
              </Text>

              {/* Lei 3: nenhum número sozinho. O dinheiro parado ali vem com a
                  conta de quantos itens o somam — é o que transforma "R$ 1.240"
                  em "R$ 1.240 espalhados em três coisas".
                  Lugar sem saldo NÃO ganha número zero, e mesmo assim continua
                  na tela: o cartão dele é o caminho do acordo de entrega, que se
                  combina justamente antes da primeira carga. */}
              {saldo ? (
                <View style={[styles.row, { gap: space.md, marginTop: space.xs }]}>
                  <Text style={[type.figure, { color: color.ink }]}>
                    {formatMoney(saldo.valueCents, locale)}
                  </Text>
                  <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]}>
                    {plural(saldo.lines.length, words.itemCount)}
                  </Text>
                </View>
              ) : (
                <Text style={[type.body, { color: color.inkFaint, marginTop: space.xs }]}>
                  {words.emptyPlace}
                </Text>
              )}

              {/* Uma linha por item, com o que tem à direita e o que vale
                  embaixo do nome. Sem ícone: desenho em toda linha vira papel de
                  parede e para de ser visto. */}
              {saldo ? (
                <View style={{ marginTop: space.sm }}>
                  {saldo.lines.map((line) => (
                    <ListRow
                      key={line.itemId}
                      label={line.name}
                      detail={fill(words.worth, { amount: formatMoney(line.valueCents, locale) })}
                      trailing={`${formatQuantity(line.baseUnits, locale)} ${line.baseUnit}`}
                      trailingTone="muted"
                    />
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
                  <View style={{ marginTop: space.md, gap: space.sm }}>
                    <Text style={[type.overline, { color: color.inkFaint }]}>
                      {words.agreement.toUpperCase()}
                    </Text>
                    <Text style={[type.secondary, { color: color.inkMuted }]}>
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
                    {/* Lei 4: o aviso é na data da decisão. "Hoje é dia de
                        entrega" é uma coisa a fazer hoje, então ele fica âmbar;
                        a próxima da semana é só um fato, e fica neutro. */}
                    {proxima !== null ? (
                      <Chip
                        signal={proxima === 0 ? 'warning' : 'neutral'}
                        label={
                          proxima === 0
                            ? words.deliversToday
                            : fill(words.deliversIn, {
                                day: formatWeekdayShort((hoje + proxima) % 7, locale),
                              })
                        }
                      />
                    ) : null}
                    <Button
                      label={words.editAgreement}
                      variant="ghost"
                      onPress={() => setEditing(place.id)}
                      style={{
                        alignSelf: 'flex-start',
                        paddingVertical: space.sm,
                        paddingHorizontal: space.lg,
                      }}
                    />
                  </View>
                )
              ) : null}
            </Card>
          </Reveal>
        );
      })}

      <Reveal index={depoisDosLugares}>
        {adding ? (
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphFactory size={26} color={c} weight={traco} />}
            title={words.newPlace}
          >
            <View style={{ gap: space.lg }}>
              <Field
                label={words.placeName}
                value={name}
                onChangeText={setName}
                hint={words.placeNameHint}
              />
              {/* O tipo se escolhe tocando o que ele é, não marcando um círculo:
                  a etiqueta acesa é a escolhida, e a palavra continua dita por
                  extenso — cor sozinha não é informação de luva e má luz. */}
              <View style={{ gap: space.sm }}>
                <Text style={[type.overline, { color: color.inkFaint }]}>
                  {words.placeKind.toUpperCase()}
                </Text>
                <View style={[styles.wrap, { gap: space.sm }]}>
                  {KINDS.map((k) => (
                    <Touchable key={k} accessibilityLabel={words.kinds[k]} onPress={() => setKind(k)}>
                      <Chip signal={k === kind ? 'ok' : 'neutral'} label={words.kinds[k]} />
                    </Touchable>
                  ))}
                </View>
              </View>
              <Button label={words.save} onPress={onSave} disabled={!name.trim() || saving} />
            </View>
          </Card>
        ) : (
          <Button label={words.newPlace} onPress={() => setAdding(true)} variant="ghost" />
        )}
      </Reveal>

      {/* A próxima ação provável, que é o terceiro dever de toda tela. */}
      {lugares.length > 1 ? (
        <Reveal index={depoisDosLugares + 1}>
          <Button label={words.goTransfer} onPress={() => router.push('/transfer')} variant="ghost" />
        </Reveal>
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
  const { color, type, space, palette, skin } = useTheme();
  const { locale, t } = useLocale();
  const words = t.app.places;
  const traco = skin === 'papel' ? 1.7 : 2.2;

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
      <Text style={[type.body, { color: last ? color.ink : color.inkFaint }]}>
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
          strokeWidth={traco}
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
        <Button
          label={words.rangeLabel}
          variant="ghost"
          onPress={() => setEditandoFaixa(true)}
          style={{ alignSelf: 'flex-start', paddingVertical: space.sm, paddingHorizontal: space.lg }}
        />
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
  const { color, type, space } = useTheme();
  const { locale, t } = useLocale();
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
      <Text style={[type.overline, { color: color.inkFaint }]}>{words.agreement.toUpperCase()}</Text>
      <Text style={[type.caption, { color: color.inkFaint }]}>{words.agreementHint}</Text>

      <View style={{ gap: space.sm }}>
        <Text style={[type.overline, { color: color.inkFaint }]}>
          {words.deliveryDays.toUpperCase()}
        </Text>
        {/* O dia se liga tocando o dia. A etiqueta acesa é a combinada, e a
            linha de baixo repete por extenso o que ficou marcado: quem lê por
            leitor de tela, ou de luva sob luz ruim, não recebe só a cor. */}
        <View style={[styles.wrap, { gap: space.sm }]}>
          {[0, 1, 2, 3, 4, 5, 6].map((dia) => (
            <Touchable
              key={dia}
              accessibilityLabel={formatWeekdayShort(dia, locale)}
              onPress={() => setDays((atual) => toggleDay(atual, dia))}
            >
              <Chip
                signal={agreedOn(days, dia) ? 'ok' : 'neutral'}
                label={formatWeekdayShort(dia, locale)}
              />
            </Touchable>
          ))}
        </View>
        <Text style={[type.secondary, { color: color.inkMuted }]}>
          {days === 0 ? words.noAgreement : fill(words.agreedDays, { days: diasDoAcordo(days, locale) })}
        </Text>
        <Text style={[type.caption, { color: color.inkFaint }]}>{words.deliveryDaysHint}</Text>
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});

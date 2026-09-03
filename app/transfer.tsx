import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { parseTyped } from '@/domain/number';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import {
  defaultLocationId,
  lastSentBaseUnits,
  pickingFor,
  type PickLine,
  listPlaces,
  listOrders,
  recordReturn,
  recordTransfer,
  setOrderStatus,
  stockByPlace,
  type Place,
  type PlaceStock,
} from '@/data/repository';
import { nowIso } from '@/data/db';
import { localDate } from '@/domain/day';
import { ordersCoveredBy, pickSuggestion } from '@/domain/picking';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill, formatCalendarDate, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * O que sai da fábrica e chega na loja.
 *
 * A tela só oferece o que existe onde a carga sai: a lista de itens vem do
 * saldo da origem, não do catálogo. Isso é a Lei 5 escrita como desenho e não
 * como validação — não dá para mandar o que não está lá porque nunca aparece
 * para escolher, em vez de aparecer e ser recusado depois de digitar.
 *
 * E a quantidade não nasce vazia: o palpite vem do que já aconteceu, nunca de um
 * zero. **Mas ele tem ordem de preferência, e ela importa.**
 *
 * Quando existe pedido em aberto para aquela loja, o palpite é o PEDIDO — é a
 * separação: quem está com a lista na mão quer atender o que foi combinado, não
 * repetir a semana passada. Sem pedido, vale `lastSentBaseUnits`, que lê no
 * livro-razão quanto foi da última vez e serve à fábrica que repõe por hábito.
 * Sem nenhum dos dois, não há palpite, e é honesto que não haja.
 */
export default function TransferScreen() {
  return (
    <AreaProvider area="lilac">
      <Transfer />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; stock: PlaceStock[] };

function Transfer() {
  const { color, type, space, radius, accent } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const router = useRouter();
  const words = t.app.transfer;

  const { data, refresh } = useQuery<Loaded>(async () => {
    const [places, stock] = await Promise.all([
      listPlaces(LOCAL_COMPANY_ID),
      stockByPlace(LOCAL_COMPANY_ID),
    ]);
    return { places, stock };
  });

  /**
   * O sentido do movimento.
   *
   * A carga e a devolução têm a mesma mecânica — duas pernas, um grupo — e a
   * mesma tela dá conta das duas: invertendo a origem, a lista de itens já vem
   * do estoque de QUEM está mandando, que é a Lei 5 como desenho. Não dá para
   * devolver o que não está na loja porque nunca aparece para escolher.
   *
   * O que muda de verdade é o tipo gravado no livro-razão, e ele muda porque o
   * FATO é outro: uma loja devolvendo é notícia sobre o produto; a fábrica
   * mandando é a fábrica movendo o que é dela.
   */
  const [devolucao, setDevolucao] = useState(false);
  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const [toId, setToId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [typed, setTyped] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const nameOf = (id: string) => {
    const place = data?.places.find((p) => p.id === id);
    return place?.name.trim() || t.app.places.factory;
  };

  const destinations = (data?.places ?? []).filter((p) => p.id !== fabrica);
  const outra = destinations.find((p) => p.id === toId) ?? destinations[0] ?? null;

  // Quem manda e quem recebe trocam de lado na devolução.
  const from = devolucao ? (outra?.id ?? fabrica) : fabrica;
  // Só o id importa daqui para baixo, e ele é uma string: comparar string em
  // dependência de efeito é estável, comparar objeto recriado a cada render não
  // é. Foi o que o compilador reclamou quando isto era `{ id: fabrica }`.
  const toId2 = devolucao ? fabrica : (outra?.id ?? null);
  const to = toId2 ? { id: toId2 } : null;

  const here = data?.stock.find((p) => p.locationId === from);
  const lines = here?.lines ?? [];
  const line = lines.find((l) => l.itemId === itemId) ?? lines[0] ?? null;

  // Lei 1 e Lei 2 juntas: o palpite vem do que já aconteceu, não de um zero.
  useEffect(() => {
    let alive = true;
    if (!line || !toId2) return;
    void lastSentBaseUnits(LOCAL_COMPANY_ID, line.itemId, toId2).then((n) => {
      if (alive) setLastSent(n);
    });
    return () => {
      alive = false;
    };
  }, [line, toId2]);

  // A separação: o que aquela loja pediu e ainda não recebeu.
  const { data: pedido } = useQuery<PickLine[]>(
    () =>
      to
        ? pickingFor(LOCAL_COMPANY_ID, to.id, from, localDate(nowIso(), locale.timeZone, 7))
        : Promise.resolve([]),
    to?.id ?? '',
  );
  const paraSeparar = pedido?.find((p) => p.itemId === line?.itemId) ?? null;

  /**
   * O palpite, calculado uma vez e decidido no domínio.
   *
   * Ele já esteve em dois lugares na tela — o número mostrado e o número usado
   * para gravar —, o que deixava as duas cópias divergirem sem ninguém notar. E
   * depois de unificado ainda escapava do `mutate`, que roda só a suíte rápida:
   * regra dentro de componente não tem como ser exercitada por ela. Agora a
   * ordem de preferência é `pickSuggestion`, com teste próprio.
   */
  const suggestion = pickSuggestion({
    ordered: paraSeparar?.ordered ?? null,
    lastSent,
  });

  const amount = typed ? Math.max(0, (parseTyped(amountText) ?? 0) || 0) : (suggestion ?? 0);
  const over = line != null && amount > line.baseUnits;

  const ready = line != null && to != null && amount > 0 && !over && !sending;

  const onSend = async () => {
    if (!ready || !line || !to) return;

    const go = await askConfirm({
      title: devolucao ? words.returnAsk : words.confirmTitle,
      confirmLabel: devolucao ? words.returnAction : words.confirmAction,
      message: devolucao
        ? fill(words.returnBody, {
            amount: `${formatQuantity(amount, locale)} ${line.baseUnit}`,
            item: line.name,
            place: nameOf(from),
          })
        : fill(words.confirmBody, {
            amount: `${formatQuantity(amount, locale)} ${line.baseUnit}`,
            item: line.name,
            from: nameOf(from),
            to: nameOf(to.id),
          }),
    });
    if (!go) return;

    setSending(true);
    try {
      const registrar = devolucao ? recordReturn : recordTransfer;
      await registrar(LOCAL_COMPANY_ID, {
        itemId: line.itemId,
        fromLocationId: from,
        toLocationId: to.id,
        baseUnits: amount,
      });
      setTyped(false);
      setAmountText('');

      // A carga saiu; o pedido pode fechar junto — se ela o cobrir inteiro.
      //
      // Sem isto, fechar o pedido depende de alguém lembrar de ir na tela de
      // Pedidos, e quem acabou de carregar o caminhão está com as mãos ocupadas.
      // O custo de esquecer não é pequeno: a separação continua sugerindo o
      // pedido inteiro para sempre, e a capa continua pedindo para produzir o
      // que já saiu pela porta.
      //
      // Só o pedido COBERTO entra, e quem fecha é a pessoa: o aplicativo sugere,
      // nunca decide calado.
      if (!devolucao && to) {
        const abertos = await listOrders(LOCAL_COMPANY_ID, ['pending', 'open']);
        const daLoja = abertos.filter((o) => o.placeId === to.id);
        const cobertos = ordersCoveredBy(daLoja, new Map([[line.itemId, amount]]));

        if (cobertos.length > 0) {
          const fechar = await askConfirm({
            title: words.closeAsk,
            message: fill(words.closeBody, {
              count: plural(cobertos.length, words.closeCount),
            }),
            confirmLabel: words.closeAction,
            cancelLabel: words.closeKeep,
          });
          if (fechar) {
            for (const id of cobertos) {
              await setOrderStatus(LOCAL_COMPANY_ID, id, 'delivered');
            }
          }
        }
      }

      refresh();
    } catch (e) {
      await askConfirm({
        title: words.failed,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
      });
    } finally {
      setSending(false);
    }
  };

  if (destinations.length === 0) {
    return (
      <CollapsingHeader title={words.title} overline={words.overline}>
        <Card>
          <Text style={[type.body, { color: color.ink }]}>{words.noPlaces}</Text>
        </Card>
        <Button label={words.createFirst} onPress={() => router.push('/places')} />
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      {/* O sentido, e ele vem antes de tudo porque muda o resto da tela: a
          lista de itens passa a ser a do estoque da loja, e o que se grava
          passa a ser devolução. */}
      <Card>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {(
            [
              [false, words.toStore],
              [true, words.returning],
            ] as const
          ).map(([qual, rotulo]) => {
            const ativo = devolucao === qual;
            return (
              <Pressable
                key={String(qual)}
                onPress={() => {
                  setDevolucao(qual);
                  setTyped(false);
                  setAmountText('');
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={rotulo}
                style={{
                  flex: 1,
                  paddingVertical: space.sm,
                  borderRadius: radius.pill,
                  borderWidth: ativo ? 2 : StyleSheet.hairlineWidth,
                  borderColor: ativo ? accent : color.line,
                  backgroundColor: ativo ? `${accent}14` : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={[
                    type.secondary,
                    { color: ativo ? color.ink : color.inkMuted, fontWeight: ativo ? '600' : '400' },
                  ]}
                >
                  {rotulo}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          {devolucao ? words.returnTitle : words.to}
        </Text>
        {destinations.map((place) => (
          <Pressable
            key={place.id}
            onPress={() => setToId(place.id)}
            accessibilityRole="button"
            accessibilityLabel={place.name}
            style={[styles.row, { paddingVertical: space.sm }]}
          >
            <Text
              style={[type.body, { color: place.id === to?.id ? color.ink : color.inkMuted, flex: 1 }]}
            >
              {place.id === to?.id ? '● ' : '○ '}
              {place.name}
            </Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.md }]}>
          {words.pick}
        </Text>
        {lines.length === 0 ? (
          <Text style={[type.body, { color: color.inkMuted }]}>
            {fill(words.nothingHere, { place: nameOf(from) })}
          </Text>
        ) : (
          lines.map((l) => (
            <Pressable
              key={l.itemId}
              onPress={() => {
                setItemId(l.itemId);
                setTyped(false);
                setAmountText('');
              }}
              accessibilityRole="button"
              accessibilityLabel={l.name}
              style={[styles.row, { paddingVertical: space.sm }]}
            >
              <Text
                style={[type.body, { color: l.itemId === line?.itemId ? color.ink : color.inkMuted, flex: 1 }]}
              >
                {l.itemId === line?.itemId ? '● ' : '○ '}
                {l.name}
              </Text>
              <Text style={[type.secondary, styles.number, { color: color.inkMuted }]}>
                {formatQuantity(l.baseUnits, locale)} {l.baseUnit}
              </Text>
            </Pressable>
          ))
        )}
      </Card>

      {line ? (
        <Card tone={over ? 'warning' : 'plain'}>
          <View style={{ gap: space.lg }}>
            <Field
              label={words.howMuch}
              value={typed ? amountText : suggestion != null ? String(suggestion) : ''}
              onChangeText={(next) => {
                setTyped(true);
                setAmountText(next);
              }}
              keyboardType="numeric"
              suffix={line.baseUnit}
              // A dica segue a mesma ordem do palpite: pedido primeiro, último
              // envio depois, saldo por último. Ela diz DE ONDE veio o número,
              // que é o que faz alguém confiar nele ou corrigi-lo.
              hint={
                paraSeparar
                  ? fill(words.ordered, {
                      date: paraSeparar.dueOn
                        ? formatCalendarDate(paraSeparar.dueOn, locale)
                        : '—',
                      amount: `${formatQuantity(paraSeparar.ordered, locale)} ${line.baseUnit}`,
                    })
                  : lastSent != null
                    ? fill(words.lastTime, {
                        amount: `${formatQuantity(lastSent, locale)} ${line.baseUnit}`,
                      })
                    : fill(words.available, {
                        amount: `${formatQuantity(line.baseUnits, locale)} ${line.baseUnit}`,
                        place: nameOf(from),
                      })
              }
            />
            {over ? (
              <Chip signal="warning" label={fill(words.overBalance, { place: nameOf(from) })} />
            ) : null}
          </View>
        </Card>
      ) : null}

      {/* A distinção que o produto faz desde o começo, dita onde ela decide. */}
      <Text
        style={[type.caption, { color: color.inkMuted, paddingHorizontal: space.lg }]}
      >
        {words.notASale}
      </Text>

      <Button
        label={sending ? words.sending : words.send}
        onPress={onSend}
        disabled={!ready}
      />
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});

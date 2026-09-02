import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { listOrders, setOrderStatus, type Order } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { fill, formatCalendarDate, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * O que os clientes pediram e ainda não foi entregue.
 *
 * A ordem da lista é a do compromisso, não a da digitação: quem pediu para
 * amanhã aparece antes de quem pediu para sexta, porque a pergunta que esta
 * tela responde é "o que eu tenho que dar conta primeiro".
 *
 * Nenhum botão aqui move estoque. Aprovar, entregar e cancelar mexem no estado
 * do pedido; o que tira caixa do freezer é a carga, na transferência.
 */
export default function OrdersScreen() {
  return (
    <AreaProvider area="mint">
      <Orders />
    </AreaProvider>
  );
}

function Orders() {
  const { color, type, space, radius } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const words = t.app.orders;

  const { data, loading, refresh } = useQuery<Order[]>(() => listOrders(LOCAL_COMPANY_ID));

  const decide = async (order: Order, status: 'open' | 'delivered' | 'cancelled') => {
    if (status === 'cancelled') {
      const yes = await askConfirm({
        title: words.cancelTitle,
        message: fill(words.cancelBody, { place: order.placeName }),
        confirmLabel: words.cancel,
      });
      if (!yes) return;
    }
    await setOrderStatus(LOCAL_COMPANY_ID, order.id, status);
    refresh();
  };

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      <Button
        label={words.add}
        onPress={() => router.push('/orders/new')}
        style={{ borderRadius: radius.pill }}
      />

      {loading ? (
        <Card>
          <Text style={[type.body, { color: color.inkMuted }]}>{t.app.products.opening}</Text>
        </Card>
      ) : (data ?? []).length === 0 ? (
        // "Está tudo bem" é estado válido: nenhum pedido aberto não é problema,
        // é uma fábrica em dia. A frase diz o que fazer, não o que falta.
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>{words.empty}</Text>
          <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
            {words.emptyHint}
          </Text>
        </Card>
      ) : (
        (data ?? []).map((order) => (
          <Card key={order.id} tone={order.status === 'pending' ? 'warning' : 'plain'}>
            <View style={[styles.row, { gap: space.sm }]}>
              <Text style={[type.cardTitle, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                {order.placeName}
              </Text>
              {order.status === 'pending' ? <Chip signal="warning" label={words.pending} /> : null}
            </View>

            <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
              {order.requestedFor
                ? fill(words.forDate, { date: formatCalendarDate(order.requestedFor, locale) })
                : words.noDate}
            </Text>

            <View style={{ marginTop: space.md, gap: space.xs }}>
              {order.lines.map((line) => (
                <View key={line.itemId} style={styles.row}>
                  <Text style={[type.body, { color: color.ink, flex: 1 }]} numberOfLines={1}>
                    {line.name}
                  </Text>
                  <Text style={[type.body, styles.number, { color: color.ink }]}>
                    {plural(line.baseUnits, t.units.unit, formatQuantity(line.baseUnits, locale))}
                  </Text>
                </View>
              ))}
            </View>

            <View style={[styles.row, { marginTop: space.md, gap: space.lg }]}>
              {order.status === 'pending' ? (
                <Pressable onPress={() => decide(order, 'open')} accessibilityRole="button">
                  <Text style={[type.secondary, { color: color.ok }]}>{words.approve}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => decide(order, 'delivered')} accessibilityRole="button">
                  <Text style={[type.secondary, { color: color.ok }]}>{words.deliver}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => decide(order, 'cancelled')} accessibilityRole="button">
                <Text style={[type.secondary, { color: color.inkFaint }]}>{words.cancel}</Text>
              </Pressable>
            </View>
          </Card>
        ))
      )}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  number: { fontVariant: ['tabular-nums'] },
});

import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { GlyphOrder, GlyphPlus } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { localDate } from '@/domain/day';
import { listOrders, setOrderStatus, type Order } from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
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
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`),
 * e o layout anterior saiu inteiro em vez de ganhar um caminho ao lado: cartão
 * cinza sem crachá, linha de item montada à mão com dois `Text` num `View`,
 * ação escrita como texto colorido dentro de um `Pressable` — e o botão de
 * anotar recebendo `borderRadius: radius.pill` por cima, que é a forma do
 * Orgânico chumbada numa tela que também tem que servir o Papel. Aqui não se
 * desenha caixa nenhuma: `Card`, `Chip`, `Button` e `ListRow` já sabem virar
 * régua no Papel e bloco no Orgânico.
 *
 * Cada pedido passa a ser um assunto: o crachá do pedido, o nome de quem pediu
 * como título, o dia combinado logo abaixo e uma linha por item com a
 * quantidade na coluna tabular da direita. O tom é o do assunto em todo o
 * aplicativo — `palette.sage` para pedido, cliente e acordo — e vira
 * `color.warning` no pedido que espera aprovação, que é exatamente o que a capa
 * já faz com o mesmo assunto (`src/home/Mosaic.tsx`).
 *
 * A área era `mint`, que é o tom do almoxarifado. Passou a `sage` pelo mesmo
 * motivo que o almoxarifado deixou de ser `mist`: cabeçalho, botão e cartão
 * concordando com a régua de tons de `docs/linguagem.md`.
 *
 * Um filled só na tela, e ele é o de anotar. Aprovar e entregar são fantasma
 * dentro do cartão, e cancelar é fantasma menor ao lado — desfazer nunca é
 * convite, e a lista inteira pintada de botão cheio faria a decisão de cada
 * pedido competir com a de todos os outros.
 */
export default function OrdersScreen() {
  return (
    <AreaProvider area="sage">
      <Orders />
    </AreaProvider>
  );
}

function Orders() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const words = t.app.orders;

  /**
   * Os QUATRO estados, e não só os dois abertos — para poder desfazer.
   *
   * Entregar ou cancelar um pedido não toca o livro-razão: é um `UPDATE` de
   * estado, e o tipo aceita ir e voltar. Mesmo assim o ato não tinha volta, por
   * um motivo que não é do dado e sim da tela: **a lista mostrava só pendente e
   * aberto**, então o pedido decidido SUMIA e não havia por onde desfazer. O
   * comentário do `decide`, logo abaixo, já dizia isso desde que foi escrito.
   *
   * Uma auditoria de 7 de setembro classificou "entregar pedido" como
   * irrecuperável e queria duas confirmações. Duas confirmações num ato que a
   * pessoa faz várias vezes por dia é o alerta inventado: treina o dedo a passar
   * batido. **Onde um ato rotineiro cai em irrecuperável, o conserto é construir
   * a volta, não a fricção** — e aqui a volta custa uma consulta mais larga.
   */
  const { data, loading, error, refresh } = useQuery<Order[]>(() =>
    listOrders(empresaDaqui(), ['pending', 'open', 'delivered', 'cancelled']),
  );

  const decide = async (order: Order, status: 'open' | 'delivered' | 'cancelled') => {
    if (status === 'cancelled') {
      // Os dois botões diziam a mesma palavra com efeitos opostos.
      //
      // Sem `cancelLabel`, o diálogo cai no padrão "Cancelar" — e o assunto DELE
      // é cancelar um pedido, então saíam dois botões empilhados escritos
      // "Cancelar": o de cima cancelava o pedido, o de baixo desistia. E o
      // pedido cancelado sai da lista, então não havia como desfazer por aqui.
      // Cinco outras telas deste repositório já resolvem isso passando um
      // rótulo próprio para o botão de desistir.
      const yes = await askConfirm({
        title: words.cancelTitle,
        message: fill(words.cancelBody, { place: order.placeName }),
        confirmLabel: words.cancel,
        cancelLabel: words.keep,
      });
      if (!yes) return;
    }
    await setOrderStatus(empresaDaqui(), order.id, status);
    refresh();
  };

  const todos = data ?? [];
  const pedidos = todos.filter((o) => o.status === 'pending' || o.status === 'open');

  /**
   * O que foi decidido HOJE, que é a janela em que alguém desfaz.
   *
   * Hoje e não "os últimos dez": quem entregou por engano percebe no mesmo dia,
   * e uma lista de decididos que cresce sem fim vira outra tela para ler. O dia
   * vem de `localDate`, que é o dia da FÁBRICA — recortar texto de data foi a
   * cicatriz que deixou uma tela cega entre meia-noite e três da manhã.
   */
  const hoje = localDate(new Date().toISOString(), locale.timeZone);
  const decididosHoje = todos.filter(
    (o) =>
      (o.status === 'delivered' || o.status === 'cancelled') &&
      o.decidedAt !== null &&
      localDate(o.decidedAt, locale.timeZone) === hoje,
  );
  /**
   * A cascata não pula número: abrindo ou vazio ocupam a posição 0, e aí o
   * primeiro pedido entra na 1. Com lista, o primeiro pedido é o 0.
   */
  const antesDaLista = loading || pedidos.length === 0 ? 1 : 0;

  return (
    <CollapsingHeader
      cena="pedidos"
      title={words.title}
      overline={words.overline}
      erro={error}
      denovo={refresh}
    >
      {loading ? (
        <Reveal index={0}>
          <Card>
            <Text style={[type.body, { color: color.inkMuted }]}>{t.app.products.opening}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* "Está tudo bem" é estado válido: nenhum pedido aberto não é problema, é
          uma fábrica em dia. E vazio não é frase cinza no meio da tela — é o
          desenho do assunto, uma frase que diz o que fazer, e a ação logo
          abaixo, que é o botão de sempre no pé da tela. */}
      {!loading && pedidos.length === 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.sage}
            icon={(c) => <GlyphOrder size={26} color={c} weight={traco} />}
            title={words.empty}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{words.emptyHint}</Text>
          </Card>
        </Reveal>
      ) : null}

      {pedidos.map((order, posicao) => {
        const esperando = order.status === 'pending';

        return (
          <Reveal key={order.id} index={antesDaLista + posicao}>
            <Card
              // O tom do assunto, e o âmbar quando há uma decisão pendurada:
              // pedido esperando aprovação é coisa a fazer hoje, e é assim que a
              // capa já pinta o mesmo assunto.
              hue={esperando ? color.warning : palette.sage}
              icon={(c) => <GlyphOrder size={26} color={c} weight={traco} />}
              // O lugar padrão é gravado sem nome pela camada de dados; quem
              // escreve português é a tela.
              title={order.placeName.trim() || t.app.places.factory}
            >
              {/* O dia combinado, que é o que ordena a lista e o que decide o
                  que produzir primeiro. Sem dia combinado é ausência, e ausência
                  se diz mais baixo — a fábrica que entrega "quando dá" não deve
                  ler isso como pendência. */}
              <Text
                style={[
                  type.secondary,
                  { color: order.requestedFor ? color.ink : color.inkFaint },
                ]}
              >
                {order.requestedFor
                  ? fill(words.forDate, {
                      date: formatCalendarDate(order.requestedFor, locale),
                    })
                  : words.noDate}
              </Text>

              {/* O que está diferente agora, dito por extenso e não só em cor:
                  de luva, sob luz de galpão, a cor do cartão se perde antes do
                  texto. */}
              {esperando ? (
                <View style={{ marginTop: space.sm }}>
                  <Chip signal="warning" label={words.pending} />
                </View>
              ) : null}

              {/* Uma linha por item, com a quantidade na coluna tabular da
                  direita — é o que deixa dois pedidos comparáveis de relance.
                  Sem ícone na linha: desenho em toda linha vira papel de parede
                  e para de ser visto. */}
              <View style={{ marginTop: space.sm }}>
                {order.lines.map((line) => (
                  <ListRow
                    key={line.itemId}
                    label={line.name}
                    trailing={plural(
                      line.baseUnits,
                      t.units.unit,
                      formatQuantity(line.baseUnits, locale),
                    )}
                  />
                ))}
              </View>

              {/* A ação provável do cartão, e o desfazer ao lado dela em menor.
                  Aprovar vira entregar quando o pedido já está aberto: é a mesma
                  decisão avançando um passo, e nunca as duas juntas. */}
              <View style={[styles.row, { marginTop: space.md, gap: space.sm }]}>
                <Button
                  label={esperando ? words.approve : words.deliver}
                  variant="ghost"
                  onPress={() => void decide(order, esperando ? 'open' : 'delivered')}
                  style={{ flex: 1 }}
                />
                <Button
                  label={words.cancel}
                  variant="ghost"
                  onPress={() => void decide(order, 'cancelled')}
                  style={{ paddingVertical: space.sm, paddingHorizontal: space.lg }}
                />
              </View>
            </Card>
          </Reveal>
        );
      })}

      {/* O QUE FOI DECIDIDO HOJE, e o caminho de volta.
          Fica embaixo dos abertos porque é o caso raro, e a ordem da página é a
          ordem da probabilidade. */}
      {decididosHoje.length > 0 ? (
        <Reveal index={antesDaLista + pedidos.length}>
          <Card
            icon={(c) => <GlyphOrder size={26} color={c} weight={traco} />}
            title={words.decidedToday}
          >
            {decididosHoje.map((order) => (
              <View key={order.id} style={[styles.row, { gap: space.sm, marginTop: space.sm }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: color.ink }]}>
                    {order.placeName || t.app.places.factory}
                  </Text>
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {order.status === 'delivered' ? words.wasDelivered : words.wasCancelled}
                  </Text>
                </View>
                <Button
                  label={words.undo}
                  variant="ghost"
                  onPress={() => void decide(order, 'open')}
                  style={{ paddingVertical: space.sm, paddingHorizontal: space.lg }}
                />
              </View>
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* A porta de anotar pedido fica sempre aqui, com lista ou sem ela: é a
          única saída desta tela, e esconder caminho já custou duas telas sem
          porta na primeira instalação. */}
      <Reveal index={antesDaLista + pedidos.length + (decididosHoje.length > 0 ? 1 : 0)}>
        <Button
          label={words.add}
          onPress={() => router.push('/orders/new')}
          icon={(c) => <GlyphPlus size={22} color={c} weight={traco} />}
        />
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});

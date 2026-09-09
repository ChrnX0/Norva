import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { GlyphCalendar, GlyphCustomer, GlyphOrder, GlyphPlus } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import {
  listPlaces,
  listProducts,
  stockAgainstOrders,
  saveOrder,
  type Demand,
  type Place,
  type Product,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { daysUntilNextDelivery } from '@/domain/agreement';
import { nowIso } from '@/data/db';
import { useQuery } from '@/data/useQuery';
import { localDate } from '@/domain/day';
import { receivesCargo } from '@/domain/ledger';
import { parseTyped } from '@/domain/number';
import {
  fill,
  formatCalendarDate,
  formatQuantity,
  formatWeekdayShort,
  joinList,
  plural,
} from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Anotar o que um cliente pediu.
 *
 * A tela é curta de propósito: quem anota pedido costuma estar no telefone com
 * o cliente falando. Cliente, dia e itens — e o dia nasce preenchido em amanhã,
 * que é o que a fábrica combina na maioria das ligações (Lei 2).
 *
 * O pedido NÃO mexe em estoque, e é por isso que ele não PERGUNTA nada sobre
 * saldo: nada saiu do freezer porque alguém ligou. Quem transforma pedido em
 * movimento é a carga que sai, mais tarde, na transferência.
 *
 * Mas ele passou a MOSTRAR o que está livre, e a diferença entre as duas coisas
 * é a Lei 4. Perguntar o saldo seria pedir à pessoa um número que o sistema tem;
 * mostrar quanto ainda pode ser prometido é avisar na data da decisão — com o
 * cliente ainda no telefone — em vez de na data do problema, que é a manhã da
 * entrega com a carga faltando.
 *
 * Livre é o saldo menos o que outros pedidos já prometeram para aquele dia. E o
 * excesso **não bloqueia**: prometer mais do que existe é decisão legítima de
 * quem sabe que vai produzir até lá. O app orienta, não fiscaliza.
 *
 * ---
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`),
 * e o layout anterior saiu inteiro em vez de ganhar um caminho ao lado. O que
 * saiu, item por item, porque cada um era vocabulário do tema velho: três
 * fileiras de pílulas feitas à mão com `Pressable` e `StyleSheet` — `borderWidth`,
 * `borderRadius: radius.pill` e `backgroundColor: color.ink` escritos dentro da
 * tela, que é a caixa do Orgânico aparecendo no meio do Papel; dois cartões sem
 * crachá nem tom, com o nome da pergunta em `type.overline` cinza; as linhas do
 * rascunho montadas com `View` e `Text` e um "tirar" do tamanho de uma unha ao
 * lado; dois botões primários disputando a mesma tela; e o voltar como texto
 * cinza centralizado. **Nada aqui desenha caixa**: `Card`, `ListRow`, `Field` e
 * `Button` já sabem virar régua no Papel e bloco no Orgânico, e é isso que faz a
 * mesma tela sair certa nas duas caras de graça.
 *
 * **Quatro perguntas, quatro crachás, e cada rótulo concorda com o desenho** —
 * a pessoa (para quem), a folhinha (para quando), o mais (o quê, que é o que se
 * acrescenta) e a prancheta (o pedido que está sendo escrito). Todos no tom do
 * assunto, `palette.sage`, que é o tom de pedido, cliente e acordo em todo o
 * aplicativo.
 *
 * **A área era `mint` e virou `sage`.** Insumo é mint; a lista de pedidos, que é
 * a tela de onde se chega aqui, sempre foi sage. Duas telas do mesmo assunto com
 * acentos diferentes é a costura que o dono apontou, em versão pequena.
 *
 * O que a escolha é agora: a faixa da linha (`signal`). A pílula preta e cheia
 * dizia "esta" com massa de cor; a régua na lateral diz o mesmo com presença ou
 * ausência de traço, que é o que continua legível para quem não distingue tom.
 * E cada linha passou a carregar o número ou o fato que a pessoa vinha buscar:
 * o acordo da loja, a data por extenso do dia, o quanto ainda está livre de cada
 * produto. Antes era só o nome dentro da pílula, e o resto se descobria tocando.
 */
export default function NewOrderScreen() {
  return (
    <AreaProvider area="sage">
      <NewOrder />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; products: Product[] };
type Draft = { itemId: string; name: string; baseUnits: number };

function NewOrder() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const words = t.app.newOrder;

  const { data } = useQuery<Loaded>(async () => {
    const [places, products] = await Promise.all([
      listPlaces(empresaDaqui()),
      listProducts(empresaDaqui()),
    ]);
    // A fábrica não pede para si mesma: o lugar padrão é de onde a carga sai.
    //
    // E pedido só vai para quem RECEBE carga. A lista era de todo lugar não
    // padrão, então uma fábrica que cadastrou a câmara fria lia "Câmara fria" e
    // "Almoxarifado" debaixo do rótulo "Cliente", com o ícone de pessoa e a
    // coluna de acordo dizendo "sem acordo de dia" — e conseguia gravar um
    // pedido para a própria câmara. O predicado é o mesmo que `app/places.tsx`
    // já usa para separar quem recebe de quem é sala interna.
    const recebe = places.filter((p) => !p.isDefault && receivesCargo(p.kind));
    return { places: recebe, products };
  });

  const [placeId, setPlaceId] = useState<string | null>(null);
  /**
   * O dia escolhido a dedo, junto com a loja para a qual ele foi escolhido.
   *
   * Guardar a loja junto é o que faz a escolha valer só enquanto ela vale:
   * trocar de cliente volta a sugerir o dia combinado com o novo, sem nenhum
   * efeito corrigindo estado depois do fato.
   */
  const [escolhido, setEscolhido] = useState<{ placeId: string | null; days: number } | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [lines, setLines] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const place = data?.places.find((p) => p.id === placeId) ?? data?.places[0] ?? null;
  const product = data?.products.find((p) => p.id === productId) ?? data?.products[0] ?? null;
  const units = Math.max(0, parseTyped(quantity) ?? 0);

  /**
   * O dia que já estava combinado com esta loja.
   *
   * Perguntar "para quando?" a quem já combinou terça e sexta é pedir o que o
   * sistema sabe. Quando existe acordo, o dia dele vem escolhido; quando não
   * existe, nada é sugerido - dia inventado sai como promessa, e a loja fecha
   * quando o caminhão chega.
   */
  const hoje = new Date(`${localDate(nowIso(), locale.timeZone)}T00:00:00Z`).getUTCDay();
  const combinado = place ? daysUntilNextDelivery(place.deliveryDays, hoje) : null;

  /**
   * Hoje, amanhã, depois - e o dia da loja, quando ele cai fora desses três.
   *
   * Sem esta quarta opção, uma loja que só recebe na quinta não tem como ser
   * pedida para quinta: a tela oferecia três dias e o acordo ficava sem uso.
   */
  const opcoes = useMemo(() => {
    const base = WHEN.map(({ days, key }) => ({ days, label: words[key] }));
    if (combinado === null || base.some((o) => o.days === combinado)) return base;
    return [...base, { days: combinado, label: formatWeekdayShort((hoje + combinado) % 7, locale) }];
  }, [combinado, hoje, locale, words]);

  /** O que a pessoa escolheu para ESTA loja; senão, o combinado; senão, amanhã. */
  const whenDays =
    escolhido && escolhido.placeId === (place?.id ?? null) ? escolhido.days : (combinado ?? 1);

  /** O dia pedido, como data local. */
  const requestedFor = useMemo(
    () => localDate(nowIso(), locale.timeZone, whenDays),
    [whenDays, locale.timeZone],
  );

  /**
   * O que já foi prometido até o dia pedido — e "até o dia pedido" é literal.
   *
   * O horizonte era fixo em sete dias e a consulta não tinha chave, então
   * trocar de "hoje" para o dia do acordo não movia o número em nada: a dica
   * dizia "menos o que já foi prometido para esta data" e media outra coisa.
   * Erra nos dois sentidos — escolhendo hoje, subtrai promessa da semana que
   * vem; escolhendo um dia daqui a dez, ignora o que foi prometido para ele.
   *
   * Fica numa consulta própria porque o dia depende da loja escolhida, que vem
   * da primeira: uma consulta só não pode ter como chave o que ela mesma
   * devolve. As duas são SQLite local, e a segunda repete quando a data muda.
   */
  const { data: demanda } = useQuery<Demand[]>(
    () => stockAgainstOrders(empresaDaqui(), requestedFor, unidadeDaqui()),
    requestedFor,
  );

  /**
   * O que ainda pode ser prometido deste produto.
   *
   * Saldo menos o que outros pedidos já reservaram, menos o que já foi
   * digitado nesta tela - as linhas do rascunho contam, senão a segunda linha
   * do mesmo pedido promete as caixas da primeira.
   *
   * A conta é uma só e agora responde duas vezes: para o produto escolhido, na
   * dica do campo, e para cada linha da lista, que é onde ela decide qual
   * produto dá para prometer antes de a pessoa tocar em nada.
   */
  const livreDe = useCallback(
    (itemId: string): number | null => {
      const linha = (demanda ?? []).find((d) => d.itemId === itemId);
      if (!linha) return null;
      const noRascunho = lines
        .filter((l) => l.itemId === itemId)
        .reduce((n, l) => n + l.baseUnits, 0);
      // O que já chegou nas lojas hoje deixa de ser promessa: sem descontá-lo, esta
      // tela avisava "faltam 200" contra uma carga que saiu de manhã.
      const aindaPrometido = Math.max(0, linha.requested - linha.sentToday);
      return linha.onHand - aindaPrometido - noRascunho;
    },
    [demanda, lines],
  );

  const livre = useMemo(
    () => (product ? livreDe(product.itemId) : null),
    [product, livreDe],
  );

  const addLine = () => {
    if (!product || units <= 0) return;
    setErro(null);
    setLines((current) => {
      const existing = current.find((l) => l.itemId === product.itemId);
      // O mesmo produto duas vezes é erro de digitação, não pedido duplo: soma.
      if (existing) {
        return current.map((l) =>
          l.itemId === product.itemId ? { ...l, baseUnits: l.baseUnits + units } : l,
        );
      }
      return [...current, { itemId: product.itemId, name: product.name, baseUnits: units }];
    });
    setQuantity('');
  };

  const save = async () => {
    if (saving) return;
    if (!place) return setErro(words.needsCustomer);
    if (lines.length === 0) return setErro(words.needsLine);

    const yes = await askConfirm({
      title: words.confirmTitle,
      confirmLabel: words.confirmAction,
      message: fill(words.confirmBody, {
        items: joinList(
          lines.map((l) =>
            fill(words.confirmItem, {
              amount: plural(l.baseUnits, t.units.unit, formatQuantity(l.baseUnits, locale)),
              name: l.name,
            }),
          ),
          t.common.and,
        ),
        place: place.name,
        when: opcoes.find((o) => o.days === whenDays)?.label ?? '',
      }),
    });
    if (!yes) return;

    setSaving(true);
    try {
      await saveOrder(empresaDaqui(), {
        placeId: place.id,
        requestedFor,
        lines: lines.map((l) => ({ itemId: l.itemId, baseUnits: l.baseUnits })),
      });
      router.back();
    } finally {
      setSaving(false);
    }
  };

  /**
   * O acordo desta loja, na frase que a ficha dela já usa.
   *
   * É o que explica por que um dia veio escolhido sozinho: a linha do cliente
   * diz "a próxima é sex." e o cartão de baixo abre em sexta. Sem isso a data
   * pré-escolhida é mágica, e o que é mágico ninguém confere.
   */
  const acordo = (loja: Place): string => {
    const dias = daysUntilNextDelivery(loja.deliveryDays, hoje);
    if (dias === null) return t.app.places.noAgreement;
    if (dias === 0) return t.app.places.deliversToday;
    return fill(t.app.places.deliversIn, { day: formatWeekdayShort((hoje + dias) % 7, locale) });
  };

  /** "Amanhã" é bonito ao telefone e ambíguo no papel: a data vai embaixo. */
  const dataDe = (days: number): string =>
    formatCalendarDate(localDate(nowIso(), locale.timeZone, days), locale);

  /** Quanto está livre, dito como a dica do campo diz. */
  const sobraDe = (itemId: string): string | undefined => {
    const sobra = livreDe(itemId);
    if (sobra === null) return undefined;
    const quanto = Math.max(0, sobra);
    return plural(quanto, t.units.unit, formatQuantity(quanto, locale));
  };

  /**
   * A cascata não pula número, e dois blocos daqui são condicionais.
   *
   * O rascunho só existe depois da primeira linha e o aviso só existe quando há
   * o que impedir, então os índices se contam em vez de se escrever: cartão
   * ausente que gastasse posição abriria um buraco de quarenta milissegundos no
   * meio da entrada.
   */
  const iRascunho = 3;
  const iErro = iRascunho + (lines.length > 0 ? 1 : 0);
  const iAcao = iErro + (erro ? 1 : 0);

  return (
    <CollapsingHeader cena="pedidos" title={words.title} overline={words.overline}>
      {/* PARA QUEM. Uma linha por cliente, e cada uma já traz o acordo dele —
          que é o que faz a data de baixo nascer preenchida. A escolhida leva a
          faixa; as outras, nada, porque presença de traço se lê sem cor. */}
      <Reveal index={0}>
        <Card
          hue={palette.sage}
          icon={(c) => <GlyphCustomer size={26} color={c} weight={traco} />}
          title={words.recipient}
        >
          {(data?.places ?? []).map((p) => (
            <ListRow
              key={p.id}
              label={p.name}
              detail={acordo(p)}
              signal={p.id === place?.id ? 'ok' : undefined}
              onPress={() => setPlaceId(p.id)}
            />
          ))}

          {/* Sem cliente nenhum, a tela não some com a porta: desenho, a frase,
              e a próxima ação. Esconder o caminho já deixou duas telas sem
              entrada na primeira instalação. */}
          {data && data.places.length === 0 ? (
            <View style={{ gap: space.md }}>
              <Text style={[type.body, { color: color.ink }]}>{words.noCustomers}</Text>
              <Button
                label={t.app.places.newPlace}
                variant="ghost"
                onPress={() => router.push('/places')}
              />
            </View>
          ) : null}
        </Card>
      </Reveal>

      {/* PARA QUANDO. A palavra é como se fala ao telefone; a data embaixo é o
          que vira promessa. Quem só recebe na quinta ganha a quarta linha, e ela
          vem escolhida sozinha. */}
      <Reveal index={1}>
        <Card
          hue={palette.sage}
          icon={(c) => <GlyphCalendar size={26} color={c} weight={traco} />}
          title={words.when}
        >
          {opcoes.map(({ days, label }) => (
            <ListRow
              key={`quando-${days}`}
              label={label}
              detail={dataDe(days)}
              signal={days === whenDays ? 'ok' : undefined}
              onPress={() => setEscolhido({ placeId: place?.id ?? null, days })}
            />
          ))}
        </Card>
      </Reveal>

      {/* O QUÊ. A coluna da direita é quanto ainda dá para prometer de cada um,
          na mesma régua, para a escolha acontecer antes do toque; a dica do
          campo é que diz o que essa coluna significa. */}
      <Reveal index={2}>
        <Card
          hue={palette.sage}
          icon={(c) => <GlyphPlus size={26} color={c} weight={traco} />}
          title={words.product}
        >
          {(data?.products ?? []).map((p) => (
            <ListRow
              key={p.id}
              label={p.name}
              trailing={sobraDe(p.itemId)}
              trailingTone="muted"
              signal={p.id === product?.id ? 'ok' : undefined}
              onPress={() => setProductId(p.id)}
            />
          ))}

          {data && data.products.length === 0 ? (
            <View style={{ gap: space.md }}>
              <Text style={[type.body, { color: color.ink }]}>{words.noProducts}</Text>
              <Button
                label={t.app.products.addNew}
                variant="ghost"
                onPress={() => router.push('/products/new')}
              />
            </View>
          ) : null}

          <View style={{ marginTop: space.md, gap: space.xs }}>
            <Field
              label={words.quantity}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholder="0"
              hint={
                livre === null
                  ? undefined
                  : `${fill(words.free, {
                      amount: `${formatQuantity(Math.max(0, livre), locale)} ${plural(
                        Math.max(0, livre),
                        t.units.unit,
                      )}`,
                    })} — ${words.freeHint}`
              }
            />

            {/* O excesso avisa e não impede: prometer mais do que existe é decisão
                de quem sabe que vai produzir até lá. */}
            {livre !== null && units > livre ? (
              <Text style={[type.caption, { color: color.warning }]}>
                {fill(words.over, {
                  amount: `${formatQuantity(units - Math.max(0, livre), locale)} ${plural(
                    units - Math.max(0, livre),
                    t.units.unit,
                  )}`,
                })}
              </Text>
            ) : null}
          </View>

          {/* Fantasma, e é regra: a tela tem uma ação primária só, e ela é
              anotar o pedido. Dois botões cheios lado a lado fazem a pessoa
              escolher entre duas coisas que não competem. */}
          <Button
            label={words.addLine}
            variant="ghost"
            onPress={addLine}
            style={{ marginTop: space.md }}
          />
        </Card>
      </Reveal>

      {/* O PEDIDO. O que vai ser gravado, com a quantidade na coluna e o "tirar"
          embaixo do nome: a linha inteira é o alvo, que é o que se acerta de
          luva. Nada aqui está gravado ainda — tirar e pôr de volta é digitar. */}
      {lines.length > 0 ? (
        <Reveal index={iRascunho}>
          <Card
            hue={palette.sage}
            icon={(c) => <GlyphOrder size={26} color={c} weight={traco} />}
            title={words.listed}
          >
            {lines.map((l) => (
              <ListRow
                key={l.itemId}
                label={l.name}
                detail={words.remove}
                trailing={plural(l.baseUnits, t.units.unit, formatQuantity(l.baseUnits, locale))}
                onPress={() => setLines((c) => c.filter((x) => x.itemId !== l.itemId))}
              />
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* O que falta, dito onde a ação está e não no topo da tela. */}
      {erro ? (
        <Reveal index={iErro}>
          <Card tone="warning">
            <Text style={[type.body, { color: color.ink }]}>{erro}</Text>
          </Card>
        </Reveal>
      ) : null}

      <Reveal index={iAcao}>
        <Button label={words.save} onPress={save} />
      </Reveal>

      {/* Voltar é fantasma e é a última coisa da pilha: ninguém deve ser
          convidado a sair antes de responder. */}
      <Reveal index={iAcao + 1}>
        <Button label={words.back} variant="ghost" onPress={() => router.back()} />
      </Reveal>
    </CollapsingHeader>
  );
}

const WHEN = [
  { days: 0, key: 'today' as const },
  { days: 1, key: 'tomorrow' as const },
  { days: 2, key: 'dayAfter' as const },
];

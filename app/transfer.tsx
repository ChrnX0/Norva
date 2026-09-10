import { useEffect, useState } from 'react';
import { avisoDeFalha } from '@/i18n/falha';
import { ERROS } from '@/data/erros';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  INTERNAL_PLACE_KINDS,
  ordemDeCarga,
  receivesCargo,
  RETURN_REASONS,
  type ReturnReason,
} from '@/domain/ledger';
import type { Dictionary } from '@/i18n';
import { parseTyped } from '@/domain/number';
import { Alive } from '@/components/Alive';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { GlyphBox, GlyphFactory, GlyphStore, GlyphVehicle } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import {
  lastSentBaseUnits,
  pickingFor,
  type PickLine,
  listPlaces,
  listOrders,
  ordersCoveredToday,
  type Order,
  recordReturn,
  lotsInStock,
  recordTransfer,
  setOrderStatus,
  stockByPlace,
  type Place,
  type PlaceStock,
  shipmentsOn,
  type Shipment,
} from '@/data/repository';
import { nowIso } from '@/data/db';
import { dayWindow, localDate } from '@/domain/day';
import { freeToShip, pickSuggestion } from '@/domain/picking';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { useQuery } from '@/data/useQuery';
import { fill, formatCalendarDate, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { ALVO } from '@/theme/tokens';
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
 *
 * **E a tela diz quem mais está esperando aquilo.** Ela limitava pelo saldo
 * físico e mais nada, então a reserva que a tela de pedido calculava valia até a
 * hora de carregar o caminhão e não um minuto depois: a Loja A pede 500 para
 * sexta, o freezer tem 600, e a carga de hoje para a Loja B levava as 600. Agora
 * a conta aparece colada no número que está sendo digitado — quanto tem dono, de
 * quem e para quando —, e ela avisa sem impedir, porque às vezes a loja está na
 * porta. A regra mora em `freeToShip`, com teste, e não aqui.
 *
 * **A cara desta tela foi reescrita, não remendada.** O corpo anterior era o
 * vocabulário do Orgânico chumbado na mão: pílula de `borderRadius`,
 * `borderWidth` e `backgroundColor` próprios para o sentido do movimento, e
 * duas listas marcadas com `●`/`○` dentro de cartões cinzas sem desenho nenhum.
 * Nada daquilo tinha como virar Papel — num tema de régua e serifa a pílula é
 * objeto de outro aplicativo. Agora quem sabe das duas caras são o `Card`, o
 * `Button` e o `Chip`, e aqui não se desenha caixa nenhuma: o que marca a
 * escolha é a tinta e o peso da palavra, que é o mesmo idioma do filtro do
 * almoxarifado.
 *
 * Três perguntas, três cartões, na ordem em que quem carrega o caminhão
 * pergunta: para que lado, para qual loja, o que e quanto.
 */
export default function TransferScreen() {
  return (
    <AreaProvider area="lilac">
      <Transfer />
    </AreaProvider>
  );
}

type Loaded = { places: Place[]; stock: PlaceStock[]; orders: Order[]; remessas: Shipment[] };

/** O lote que sai primeiro: o mais velho que ainda existe na origem. */
type Frente = { lotId: string; code: string; expiresOn: string | null; baseUnits: number } | null;

function Transfer() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const router = useRouter();
  const words = t.app.transfer;

  const { data, error, refresh } = useQuery<Loaded>(async () => {
    // Os pedidos em aberto entram na abertura da tela, e não no envio, porque é
    // ANTES de digitar que eles decidem: quem carrega precisa saber que aquelas
    // caixas têm dono enquanto ainda dá para mandar menos.
    // O que já chegou HOJE em cada loja entra junto, e pelo mesmo motivo que os
    // pedidos entram: é ANTES de digitar que ele decide. Sem isso a reserva contava
    // a promessa em bruto — uma loja que pediu 200 e recebeu 200 de manhã continuava
    // na fila esperando 200, e a confirmação avisava "faltarão 200" quando não
    // faltava nada. Alarme falso na tela que já é livro-razão.
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const [places, stock, orders, remessas] = await Promise.all([
      listPlaces(empresaDaqui()),
      stockByPlace(empresaDaqui()),
      listOrders(empresaDaqui(), ['pending', 'open']),
      shipmentsOn(empresaDaqui(), hoje.from, hoje.to),
    ]);
    return { places, stock, orders, remessas };
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
  /**
   * Por que voltou. Nasce vazio de propósito: **nenhum campo nasce vazio** vale
   * para o que o sistema pode deduzir, e este ele não pode — só quem recebeu a
   * carga de volta sabe. Um padrão aqui seria o sistema respondendo no lugar da
   * pessoa, e o relatório da loja herdando o palpite.
   */
  const [motivo, setMotivo] = useState<ReturnReason | null>(null);
  const fabrica = unidadeDaqui();
  /**
   * Qual sala NOSSA está na ponta deste movimento.
   *
   * **Era a unidade e só ela, e isso deixava um trajeto real sem tela.** A câmara
   * fria já podia RECEBER (ela entra na lista de destinos), e não podia MANDAR: o
   * único jeito de tirar alguma coisa dela era marcar devolução, que grava `return`
   * — notícia sobre uma loja, não sobre a nossa câmara. Uma fábrica que guarda a
   * polpa no freezer não tinha como registrar polpa saindo dele.
   *
   * Nulo é o padrão e quer dizer *"a unidade deste aparelho"*, que é a resposta
   * certa para quem tem uma sala só — e quem tem uma sala só não vê pergunta
   * nenhuma, porque a Lei 1 proíbe pedir o que o sistema deduz.
   */
  const [nossaId, setNossaId] = useState<string | null>(null);
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

  /**
   * As nossas salas, e a ponta escolhida entre elas.
   *
   * A lista vem da régua do domínio e não de uma lista à mão: `INTERNAL_PLACE_KINDS`
   * é a mesma que o SQL de saldo usa, e escrever a quarta grafia dela aqui é o
   * defeito que ela existe para não repetir.
   */
  const nossasSalas = (data?.places ?? []).filter((p) =>
    (INTERNAL_PLACE_KINDS as readonly string[]).includes(p.kind),
  );
  const nossa = nossasSalas.find((p) => p.id === nossaId)?.id ?? fabrica;

  // O outro lado nunca é a ponta nossa — mandar de uma sala para ela mesma é um
  // movimento que se anula, e ele nem deve aparecer para escolher.
  const destinations = (data?.places ?? []).filter((p) => p.id !== nossa);
  const outra = destinations.find((p) => p.id === toId) ?? destinations[0] ?? null;

  // Quem manda e quem recebe trocam de lado na devolução.
  const from = devolucao ? (outra?.id ?? nossa) : nossa;
  // Só o id importa daqui para baixo, e ele é uma string: comparar string em
  // dependência de efeito é estável, comparar objeto recriado a cada render não
  // é. Foi o que o compilador reclamou quando isto era `{ id: fabrica }`.
  const toId2 = devolucao ? nossa : (outra?.id ?? null);
  const to = toId2 ? { id: toId2 } : null;

  const here = data?.stock.find((p) => p.locationId === from);
  // O provável na frente, deduzido do DESTINO: uma loja vende produto acabado, e
  // era açúcar que vinha escolhido por ser o primeiro em ordem alfabética. Quem
  // decide é `ordemDeCarga`, no domínio, onde o teste alcança.
  const lines = ordemDeCarga(here?.lines ?? [], receivesCargo(outra?.kind ?? ''));
  const line = lines.find((l) => l.itemId === itemId) ?? lines[0] ?? null;

  // Lei 1 e Lei 2 juntas: o palpite vem do que já aconteceu, não de um zero.
  useEffect(() => {
    let alive = true;
    if (!line || !toId2) return;
    void lastSentBaseUnits(empresaDaqui(), line.itemId, toId2).then((n) => {
      if (alive) setLastSent(n);
    });
    return () => {
      alive = false;
    };
  }, [line, toId2]);

  // A separação: o que aquela loja pediu e ainda não recebeu.
  /**
   * De qual lote a carga sai — deduzido, não perguntado.
   *
   * Quem despacha não escolhe lote: despacha o que está na frente, e o que está
   * na frente é o que vence primeiro. Perguntar aqui seria pedir o que o sistema
   * sabe (Lei 1), e não perguntar tinha um custo pior: até agora nenhuma carga
   * levava lote, então o saldo de um lote só subia e um recall parava na porta
   * da fábrica.
   *
   * Nulo é caso normal e frequente: açúcar e palito não têm lote.
   */
  const { data: frente } = useQuery<Frente>(async () => {
    if (!itemId) return null;
    const origem = devolucao ? (toId ?? nossa) : nossa;
    const lotes = await lotsInStock(empresaDaqui(), itemId, origem);
    return lotes[0] ?? null;
  }, `${itemId ?? ''}:${devolucao ? 'v' : 'i'}:${toId ?? ''}`);

  // Sete dias: o horizonte da separação e o da reserva são o mesmo, e por isso
  // é uma constante só. Com dois números, a tela sugeria contando um conjunto de
  // pedidos e avisava contando outro.
  const ateQuando = localDate(nowIso(), locale.timeZone, 7);

  // O dia de quem carrega, no fuso dele: é a janela que diz o que já foi hoje.
  // A mesma que o fechamento de pedido usa quando a carga sai.
  const hoje = dayWindow(nowIso(), locale.timeZone);

  // A origem entra na dependência, e ela não entrava.
  //
  // `available` é a única coisa desta lista que é POR SALA — pedido, contagem e
  // prazo são do pedido, e o recebido é do destino. A sala de onde a carga sai é
  // estado desta tela (`nossaId`), então trocá-la deixava a lista inteira velha
  // sem nada acusar. Ficou invisível enquanto ninguém lia `available`: o dia em
  // que alguém lesse, a tela diria "não há nenhum na Câmara fria" olhando o saldo
  // do Almoxarifado. Chave composta, como o resto da casa faz.
  const { data: pedido } = useQuery<PickLine[]>(
    () =>
      to
        ? pickingFor(empresaDaqui(), to.id, from, ateQuando, hoje.from, hoje.to)
        : Promise.resolve([]),
    `${to?.id ?? ''}|${from}`,
  );
  const paraSeparar = pedido?.find((p) => p.itemId === line?.itemId) ?? null;

  /**
   * O pedido que ESTA sala não tem como atender.
   *
   * A lista do que vai é o que está aqui, e `stockByPlace` não devolve linha de
   * saldo zero — decisão certa, escrita lá: *"listá-lo como 0 g enche a tela de
   * coisa que não está ali"*. O efeito colateral é que o item pedido e ausente
   * desaparece por completo: não está na lista, não tem `line`, e nenhuma das
   * frases da tela fala dele. Quem carrega o caminhão descobre na loja.
   *
   * `available` é o único número que alcança esse caso — e por isso ele existia
   * sem leitor. Não é aritmética nova: é a mesma soma de `stockByPlace` para o
   * mesmo `location_id`, vinda pelo eixo do PEDIDO em vez do eixo do lugar, que é
   * o eixo em que a ausência é visível.
   *
   * O que ainda é devido, e não o pedido inteiro: mandar 500 hoje de um pedido de
   * 500 zera a dívida, e avisar depois disso seria alerta inventado.
   */
  const semNaSala = (pedido ?? []).filter((p) => p.available === 0 && p.ordered > p.sentToday);

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
    alreadySent: paraSeparar?.sentToday ?? 0,
    lastSent,
  });

  const amount = typed ? Math.max(0, (parseTyped(amountText) ?? 0) || 0) : (suggestion ?? 0);
  const over = line != null && amount > line.baseUnits;

  /**
   * O que desta carga já tem dono — a metade da reserva que faltava.
   *
   * `over` compara com o saldo da SALA, que é o que dá para carregar no
   * caminhão. Esta conta compara com outra coisa: o que a empresa tem nas salas
   * dela contra o que ela já prometeu. São dois limites diferentes e os dois
   * importam — um é físico, o outro é combinado.
   *
   * O saldo aqui é o de TODAS as nossas salas, e não o da origem, pelo mesmo
   * motivo que a conta do pedido usa esse total: 500 reservadas que estão na
   * câmara fria continuam existindo quando a carga sai do freezer da frente.
   * Comparar com uma sala só avisaria contra uma carga que não quebra promessa
   * nenhuma, e alerta que aparece sem motivo ensina a ignorar alerta.
   *
   * A régua de quais salas são nossas é a mesma do SQL (`INTERNAL_PLACE_KINDS`),
   * e `src/layers.test.ts` recusa as duas discordando.
   */
  const nossas = (data?.stock ?? []).filter((p) =>
    (INTERNAL_PLACE_KINDS as readonly string[]).includes(p.kind),
  );
  const compromisso =
    !devolucao && line && to
      ? freeToShip({
          itemId: line.itemId,
          toPlaceId: to.id,
          through: ateQuando,
          onHand: nossas.reduce(
            (n, p) => n + (p.lines.find((l) => l.itemId === line.itemId)?.baseUnits ?? 0),
            0,
          ),
          amount,
          orders: data?.orders ?? [],
          recebidoHoje: new Map(
            (data?.remessas ?? []).map((r) => [
              r.locationId,
              r.items.find((i) => i.itemId === line.itemId)?.baseUnits ?? 0,
            ]),
          ),
        })
      : null;
  const primeiro = compromisso?.queue[0] ?? null;

  // A devolução só fica pronta com o motivo escolhido. O erro IMPEDE em vez de
  // reclamar (Lei 5): o botão não obedece enquanto a pergunta não foi respondida,
  // em vez de aceitar e falhar na confirmação.
  const ready =
    line != null && to != null && amount > 0 && !over && !sending && (!devolucao || motivo != null);

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
          }) +
          // O lote vai dito na confirmação, e não escondido: quem carrega o
          // caminhão é quem vai ler o código na caixa se alguém ligar depois.
          (frente
            ? ` ${fill(frente.expiresOn ? words.fromLot : words.fromLotNoDate, { code: frente.code })}`
            : '') +
          // E o que esta carga tira de quem esperava, dito no instante em que
          // vira livro-razão. O cartão já disse — mas o botão fica embaixo, e
          // num telefone a frase pode ter saído da tela quando o dedo chega nele.
          (compromisso && compromisso.short > 0
            ? ` ${fill(words.confirmShort, {
                amount: `${formatQuantity(compromisso.short, locale)} ${line.baseUnit}`,
              })}`
            : ''),
    });
    if (!go) return;

    setSending(true);
    try {
      const comum = {
        itemId: line.itemId,
        fromLocationId: from,
        toLocationId: to.id,
        baseUnits: amount,
        lotId: frente?.lotId ?? null,
      };
      // Sem ternário sobre a função: `recordReturn` pede o motivo no tipo, e
      // escolher a função antes de saber os argumentos apagaria essa exigência.
      if (devolucao) {
        await recordReturn(empresaDaqui(), { ...comum, returnReason: motivo! });
      } else {
        await recordTransfer(empresaDaqui(), comum);
      }
      setTyped(false);
      setAmountText('');
      setMotivo(null);

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
        // A conta mora no repositório desde que a separação passou a precisar da
        // mesma resposta: duas telas fazendo a mesma conta é como duas verdades
        // nascem. As três decisões dela — cobertura do DIA, só pedido coberto, e
        // quem fecha é a pessoa — estão escritas lá, uma vez.
        const cobertos = await ordersCoveredToday(empresaDaqui(), to.id, hoje.from, hoje.to);

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
              await setOrderStatus(empresaDaqui(), id, 'delivered');
            }
          }
        }
      }

      refresh();
    } catch (e) {
      await askConfirm({
        title: words.failed,
        message: avisoDeFalha(e, t, ERROS).message,
        acknowledge: true,
      });
    } finally {
      setSending(false);
    }
  };

  /**
   * O primeiro dia: não há para onde mandar.
   *
   * Vazio não é frase cinza no meio da tela — é desenho, uma frase e a próxima
   * ação. A loja é o desenho porque é ela que falta, e o botão é o único caminho
   * que esta tela tem.
   */
  if (destinations.length === 0) {
    return (
      <CollapsingHeader
        cena="separacao"
        title={words.title}
        overline={words.overline}
        erro={error}
        denovo={refresh}
      >
        <Reveal index={0}>
          <Card
            hue={palette.lilac}
            icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
            title={words.to}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{words.noPlaces}</Text>
          </Card>
        </Reveal>
        <Reveal index={1}>
          <Button
            label={words.createFirst}
            onPress={() => router.push('/places')}
            icon={(c) => <GlyphStore size={22} color={c} weight={traco} />}
          />
        </Reveal>
      </CollapsingHeader>
    );
  }

  /**
   * Os dois sentidos, cada um com o seu desenho.
   *
   * O caminhão é a fábrica mandando; a loja é a loja devolvendo. Numa fábrica
   * onde nem todo mundo lê rápido, o desenho separa os dois antes da palavra —
   * e é o mesmo par de perguntas, não uma tela diferente.
   */
  const sentidos = [
    {
      qual: false,
      rotulo: words.toStore,
      desenho: (c: string) => <GlyphVehicle size={26} color={c} weight={traco} />,
    },
    {
      qual: true,
      rotulo: words.returning,
      desenho: (c: string) => <GlyphStore size={26} color={c} weight={traco} />,
    },
  ];

  return (
    <CollapsingHeader
      cena="separacao"
      title={words.title}
      // A sobrelinha acompanha o sentido, como o título do cartão já fazia.
      //
      // Fixa em "o que sai da fábrica", ela ficava desenhada logo acima de "A
      // loja devolveu" e de "Loja Centro → Fábrica": nada sai da fábrica, a
      // mercadoria entra nela, e o livro-razão grava `return`. (No estado vazio
      // acima ela está certa: lá não existe o seletor de sentido.)
      overline={devolucao ? words.returnOverline : words.overline}
    >
      {/* Para que lado. Vem antes de tudo porque muda o resto da tela: a lista de
          itens passa a ser a do estoque da loja, e o que se grava passa a ser
          devolução. O título do cartão é a frase escolhida, então o estado do
          sentido está dito por extenso e não só marcado. */}
      <Reveal index={0}>
        <Card
          hue={palette.lilac}
          icon={(c) => <GlyphVehicle size={26} color={c} weight={traco} />}
          title={devolucao ? words.returning : words.toStore}
        >
          <View style={[styles.row, { gap: space.md }]}>
            {sentidos.map(({ qual, rotulo, desenho }, i) => {
              const ativo = devolucao === qual;
              return (
                <Pressable
                  key={String(qual)}
                  onPress={() => {
                    setDevolucao(qual);
                    setTyped(false);
                    setAmountText('');
                    // Sair da devolução leva o motivo junto: motivo de
                    // devolução numa transferência é dado errado com cara de
                    // dado certo, e o servidor recusa a linha.
                    setMotivo(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={rotulo}
                  style={[
                    styles.option,
                    { gap: space.xs, paddingVertical: space.sm, minHeight: ALVO },
                  ]}
                >
                  {/* Desenho solto numa tela recebe o `Alive` na mão — dentro do
                      cartão é o `Card` que faz isso, aqui não. */}
                  <Alive index={i}>{desenho(ativo ? palette.lilac : color.inkFaint)}</Alive>
                  <Text
                    style={[
                      type.secondary,
                      styles.centered,
                      {
                        color: ativo ? color.ink : color.inkMuted,
                        fontWeight: ativo ? '600' : '400',
                      },
                    ]}
                    numberOfLines={2}
                  >
                    {rotulo}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* O caminho, com os dois nomes de verdade. É a linha que evita o erro
              que o sentido invertido causa: quem lê "Loja Centro → Fábrica" não
              grava uma carga achando que devolveu. */}
          {to ? (
            <Text
              style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}
              numberOfLines={1}
            >
              {`${nameOf(from)} → ${nameOf(to.id)}`}
            </Text>
          ) : null}
        </Card>
      </Reveal>

      {/* De qual sala NOSSA — e só quando existe mais de uma.
          Com uma sala só a resposta é dedutível e a Lei 1 proíbe perguntar; a
          pergunta nasce no dia em que a fábrica cadastra a câmara fria, que é o
          dia em que ela passa a ter duas respostas possíveis. O título vira
          "para qual sala nossa" na devolução, porque ali esta ponta RECEBE: o
          picolé que a loja devolve volta para o freezer, não para o pátio. */}
      {nossasSalas.length > 1 ? (
        <Reveal index={1}>
          <Card
            hue={palette.lilac}
            icon={(c) => <GlyphFactory size={26} color={c} weight={traco} />}
            title={devolucao ? words.ourRoomIn : words.ourRoomOut}
          >
            {nossasSalas.map((place) => {
              const ativo = place.id === nossa;
              return (
                <Pressable
                  key={place.id}
                  onPress={() => {
                    setNossaId(place.id);
                    // A quantidade digitada era do saldo da outra sala. Mantê-la
                    // seria oferecer um número que talvez não exista aqui, e a
                    // Lei 5 manda impedir em vez de reclamar depois.
                    setTyped(false);
                    setAmountText('');
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  /**
                   * O rótulo diz QUAL PERGUNTA ele responde, e não só o nome da sala.
                   *
                   * Achado pelo navegador ao escrever a checagem: com a câmara na lista
                   * das nossas salas E na lista de destinos, "Câmara 1" existe duas vezes
                   * na mesma tela. O `e2e` clicou na primeira e escolheu a origem quando
                   * queria o destino — e quem usa TalkBack ouviria exatamente o mesmo:
                   * dois botões com o mesmo nome, sem dizer o que cada um decide.
                   */
                  accessibilityLabel={`${devolucao ? words.ourRoomIn : words.ourRoomOut}: ${place.name.trim() || t.app.places.factory}`}
                  style={[styles.row, { paddingVertical: space.md }]}
                >
                  <Text
                    style={[
                      type.body,
                      styles.grow,
                      { color: ativo ? color.ink : color.inkMuted, fontWeight: ativo ? '600' : '400' },
                    ]}
                    numberOfLines={1}
                  >
                    {place.name.trim() || t.app.places.factory}
                  </Text>
                </Pressable>
              );
            })}
          </Card>
        </Reveal>
      ) : null}

      {/* Qual loja. A pergunta é sempre sobre a LOJA — na devolução ela é a
          origem, e é por isso que o título muda de lado junto com o sentido.
          A marca da escolha é a tinta e o peso da palavra: caixa desenhada à mão
          aqui era o que não tinha como virar Papel. */}
      <Reveal index={2}>
        <Card
          hue={palette.lilac}
          icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
          title={devolucao ? words.from : words.to}
        >
          {destinations.map((place) => {
            // A loja escolhida é `outra`, não o destino do movimento: na
            // devolução o destino é a fábrica, e comparar com ele deixava a
            // lista inteira apagada, sem nenhuma linha marcada.
            const ativo = place.id === outra?.id;
            return (
              <Pressable
                key={place.id}
                onPress={() => setToId(place.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={place.name}
                style={[styles.row, { paddingVertical: space.md }]}
              >
                <Text
                  style={[
                    type.body,
                    styles.grow,
                    { color: ativo ? color.ink : color.inkMuted, fontWeight: ativo ? '600' : '400' },
                  ]}
                  numberOfLines={1}
                >
                  {place.name}
                </Text>
              </Pressable>
            );
          })}

          {/* POR QUE VOLTOU — e a pergunta mora aqui, junto da loja, porque é
              sobre a loja que ela fala. "Não vendeu" manda produzir menos para
              esta; "derreteu no caminho" manda olhar o caminhão. Sem a
              distinção, a devolução é aritmética sem notícia, e o Espelho da
              Loja daria o conselho errado com convicção.

              Nenhuma opção nasce marcada: esta é a única resposta da tela que o
              sistema não pode deduzir — só quem recebeu a carga sabe —, e um
              padrão aqui seria o aplicativo respondendo no lugar da pessoa. */}
          {devolucao ? (
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {words.returnReason.toUpperCase()}
              </Text>
              <View style={[styles.wrap, { gap: space.sm }]}>
                {RETURN_REASONS.map((qual) => (
                  <Pressable
                    key={qual}
                    onPress={() => setMotivo(qual)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: motivo === qual }}
                    accessibilityLabel={rotuloDoMotivo(qual, words)}
                  >
                    <Chip
                      signal={motivo === qual ? 'ok' : 'neutral'}
                      label={rotuloDoMotivo(qual, words)}
                    />
                  </Pressable>
                ))}
              </View>
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {words.returnReasonHint}
              </Text>
            </View>
          ) : null}

          {/* O que está diferente agora, para esta loja: sem pedido em aberto, a
              carga é reposição por hábito, e o palpite abaixo vem da última vez.
              Quando há pedido, quem diz é a dica do campo, com a data e o
              combinado — dizer nos dois lugares seria a mesma frase duas vezes. */}
          {!devolucao && pedido != null && pedido.length === 0 ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
              {words.orderedNone}
            </Text>
          ) : null}
        </Card>
      </Reveal>

      {/* O que vai, e quanto vai — uma pergunta só, num cartão só. Eram dois
          cartões cinzas, e a separação obrigava a olhar para cima para saber de
          que item era aquele número. A caixa amarela é a carga que não cabe, não
          só os dígitos: o cartão inteiro avisa. */}
      <Reveal index={3}>
        <Card
          hue={over ? color.warning : palette.lilac}
          icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
          title={words.pick}
        >
          {lines.length === 0 ? (
            <Text style={[type.body, { color: color.inkMuted }]}>
              {fill(words.nothingHere, { place: nameOf(from) })}
            </Text>
          ) : (
            lines.map((l) => {
              const ativo = l.itemId === line?.itemId;
              return (
                <Pressable
                  key={l.itemId}
                  onPress={() => {
                    setItemId(l.itemId);
                    setTyped(false);
                    setAmountText('');
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={l.name}
                  style={[styles.row, { paddingVertical: space.md, gap: space.md }]}
                >
                  <Text
                    style={[
                      type.body,
                      styles.grow,
                      {
                        color: ativo ? color.ink : color.inkMuted,
                        fontWeight: ativo ? '600' : '400',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {l.name}
                  </Text>
                  {/* O saldo da origem em cada linha: é o que faz a escolha
                      acontecer sem ninguém digitar para descobrir que não tem. */}
                  <Text
                    style={[
                      type.secondary,
                      styles.number,
                      { color: ativo ? color.ink : color.inkFaint },
                    ]}
                  >
                    {formatQuantity(l.baseUnits, locale)} {l.baseUnit}
                  </Text>
                </Pressable>
              );
            })
          )}

          {/* O pedido que esta sala não tem, dito ANTES de escolher — porque ele não
              está na lista para ser escolhido. Fato e não alerta: é legenda como a
              frase de quem espera, e não muda de cor, porque não é sobre esta carga.
              A cor fica para o que passa da folga, que é a única coisa aqui que a
              pessoa pode consertar tocando no número. */}
          {semNaSala.length > 0 ? (
            <View style={{ gap: space.sm, marginTop: space.md }}>
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {fill(words.orderedAbsent, {
                  // Quem pediu é o DESTINO, e a lista só existe com destino:
                  // `pickingFor` devolve vazio sem ele.
                  place: nameOf(to?.id ?? from),
                  amount: `${formatQuantity(semNaSala[0].ordered - semNaSala[0].sentToday, locale)} ${semNaSala[0].baseUnit}`,
                  item: semNaSala[0].name.toLocaleLowerCase(locale.formatting),
                  from: nameOf(from),
                })}
              </Text>
              {semNaSala.length > 1 ? (
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {fill(words.orderedAbsentMany, {
                    items: semNaSala
                      .slice(1)
                      .map((p) => p.name.toLocaleLowerCase(locale.formatting))
                      .join(', '),
                  })}
                </Text>
              ) : null}
            </View>
          ) : null}

          {line ? (
            <View style={{ gap: space.md, marginTop: space.md }}>
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
                    ? fill(
                        // Na segunda viagem o campo mostra o que FALTA, e a dica
                        // precisa dizer de onde saiu esse número: sem a linha do
                        // que já foi, o palpite encolhe sozinho e parece defeito.
                        paraSeparar.sentToday > 0
                          ? words.orderedPartly
                          : paraSeparar.orders > 1
                            ? words.orderedMany
                            : words.ordered,
                        {
                          count: plural(paraSeparar.orders, words.closeCount),
                          date: paraSeparar.dueOn
                            ? formatCalendarDate(paraSeparar.dueOn, locale)
                            : '—',
                          amount: `${formatQuantity(paraSeparar.ordered, locale)} ${line.baseUnit}`,
                          sent: `${formatQuantity(paraSeparar.sentToday, locale)} ${line.baseUnit}`,
                        },
                      )
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

              {/* Quem espera, dito antes de o caminhão fechar.
                  A frase de cima é fato e aparece sempre que alguém espera: diz
                  quanto tem dono, de quem e para quando — a conta aberta, sem
                  ninguém precisar tocar em nada. A de baixo só aparece quando
                  ESTA carga passa da folga, e é a única que muda de cor.
                  E nenhuma das duas desliga o botão. A loja pode estar na porta,
                  e quem está com o caminhão aberto decide melhor que a regra:
                  o aplicativo sugere, nunca decide calado. */}
              {compromisso && primeiro ? (
                <Text style={[type.caption, { color: color.inkMuted }]}>
                  {fill(compromisso.queue.length > 1 ? words.promisedMany : words.promised, {
                    amount: `${formatQuantity(compromisso.promised, locale)} ${line.baseUnit}`,
                    place: nameOf(primeiro.placeId),
                    when: primeiro.requestedFor
                      ? fill(words.promisedWhen, {
                          date: formatCalendarDate(primeiro.requestedFor, locale),
                        })
                      : words.promisedWhenever,
                    rest: plural(compromisso.queue.length - 1, words.promisedRest),
                  })}
                </Text>
              ) : null}

              {compromisso && compromisso.short > 0 ? (
                <Chip
                  signal="warning"
                  label={fill(words.short, {
                    amount: `${formatQuantity(compromisso.short, locale)} ${line.baseUnit}`,
                  })}
                />
              ) : null}

              {/* De qual lote sai, dito na tela e não só na confirmação: quem
                  carrega é quem vai ler o código na caixa se alguém ligar
                  depois. Ausente é caso normal — açúcar e palito não têm lote. */}
              {/* "que vence primeiro" só quando existe vencimento.
                  Lote sem validade é caso normal e decidido — produto sem prazo
                  cadastrado gera lote sem validade —, e nesse caso `lotsInStock`
                  ordena por código, não por data: a frase afirmava uma ordem que
                  não foi usada para escolher e uma data que não existe. */}
              {frente ? (
                <Text style={[type.caption, { color: color.inkMuted }]}>
                  {fill(frente.expiresOn ? words.fromLot : words.fromLotNoDate, {
                    code: frente.code,
                  })}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* A distinção que o produto faz desde o começo, dita onde ela decide:
              colada no número que está sendo lançado, e não solta no meio da
              tela. Só aparece quando há o que mandar — nota de rodapé sobre
              faturamento embaixo de "não há nada aqui" é ruído. */}
          {lines.length > 0 ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.md }]}>
              {words.notASale}
            </Text>
          ) : null}
        </Card>
      </Reveal>

      {/* A ação provável, embaixo e ao alcance do polegar. Uma só, primária, com
          a marca do assunto dentro: `weighty` porque despachar carga mexe no
          livro-razão, e o toque curto é a confirmação de que o dedo pegou. */}
      <Reveal index={4}>
        <Button
          // Em devolução, o que se grava é `return` — outro fato, e o commit que
          // os separou existe por isso. A confirmação que este botão abre já
          // falava certo ("Registrar esta devolução?"), e a chave do rótulo
          // estava escrita nos três idiomas sem ninguém chamando.
          label={sending ? words.sending : devolucao ? words.returnTitle : words.send}
          onPress={onSend}
          disabled={!ready}
          weighty
          icon={(c) => <GlyphVehicle size={22} color={c} weight={traco} />}
        />
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  option: { flex: 1, alignItems: 'center' },
  centered: { textAlign: 'center' },
  grow: { flex: 1 },
  number: { fontVariant: ['tabular-nums'] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

/**
 * O rótulo de cada motivo, do dicionário.
 *
 * Dois deles têm nome próprio (`returnMelted`, `returnExpired`) porque "Derreteu"
 * sozinho já é o rótulo da PERDA, e a devolução diz outra coisa: "derreteu no
 * caminho" acusa o transporte, "derreteu" acusa o freezer. Mesma palavra, dois
 * fatos — e o dicionário é o lugar onde a diferença tem que ficar visível.
 */
function rotuloDoMotivo(qual: ReturnReason, words: Dictionary['app']['transfer']): string {
  if (qual === 'melted') return words.returnMelted;
  if (qual === 'expired') return words.returnExpired;
  if (qual === 'wrong_item') return words.wrong_item;
  return words.unsold;
}

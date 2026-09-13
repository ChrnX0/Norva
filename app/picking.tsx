import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { tatoDeSucesso } from '@/components/tato';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { GlyphBox, GlyphStore, GlyphVehicle } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { UnitStepper } from '@/components/UnitStepper';
import { nowIso } from '@/data/db';
import {
  listItems,
  listPlaces,
  ordersCoveredToday,
  pickingCart,
  pickingFor,
  listCarriers,
  recordTransfer,
  NotEnoughStockError,
  setOrderStatus,
  setPickingCart,
  type Item,
  type PickLine,
  type Carrier,
  type Place,
  lotsInStock,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { useQuery } from '@/data/useQuery';
import { dayWindow, localDate } from '@/domain/day';
import { fill, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * A separação — quem anda com o carrinho pela câmara.
 *
 * **O que ela grava: nada.** Isso não é limitação, é a decisão do dono de 6 de
 * setembro dita em código: a carga é UM evento, e separar é montar um carrinho
 * dentro da fábrica. Nada saiu, nada mudou de dono, e o livro-razão não tem o que
 * registrar. O `pickingFor` já dizia isso desde que nasceu — *"A lista NÃO reserva
 * nada e não escreve no livro-razão"* —, e a tela agora existe porque a pergunta
 * que faltava (o que ela grava) tem resposta.
 *
 * **Mas ela GUARDA, e por um motivo físico.** A conferência acontece a −18 °C,
 * item a item, e o celular bloqueia. Uma lista que zera no meio é pior que não
 * existir: a pessoa recomeça a contar sem saber onde parou, ou pior, acha que
 * sabe. O carrinho mora no aparelho (`pickingCart`), por loja, e não sobe para
 * lugar nenhum.
 *
 * **A contagem é em engradado, não em picolé.** É aqui que o `UnitStepper` ganha
 * chamador depois de meses construído: ninguém na câmara fria pensa em "3.600
 * picolés", pensa em "12 engradados" — e o eco embaixo faz a conta para a pessoa
 * conferir a camada antes de gravar, que é onde erro de contagem nasce.
 *
 * **Terminar dispara as transferências, uma por item.** Não é atalho: é o que o
 * aplicativo já faz, e o fechamento de pedido já soma as viagens do DIA e não da
 * carga — quem carrega o caminhão faz duas idas ao freezer, e a regra que sabe
 * disso mora no repositório desde que esta tela passou a precisar dela.
 */
export default function Picking() {
  return (
    <AreaProvider area="lilac">
      <Carrinho />
    </AreaProvider>
  );
}

type Carregado = {
  places: Place[];
  /** As em uso, para a escolha. Vazio é resposta: a fábrica leva no carro dela. */
  carriers: Carrier[];
  linhas: PickLine[];
  itens: Item[];
  carrinho: Record<string, number>;
};

function Carrinho() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const askConfirm = useConfirm();
  const router = useRouter();
  const words = t.app.picking;

  const fabrica = unidadeDaqui();
  const [lojaId, setLojaId] = useState<string | null>(null);
  /**
   * Quem leva esta carga. Nulo é o carro da fábrica, e é o padrão.
   *
   * **Padrão e não pergunta.** A maioria das fábricas entrega com o carro dela, e
   * quem usa transportadora usa quase sempre a mesma — então a escolha aparece
   * pré-marcada na última usada e só existe quando há alguma cadastrada. Tela que
   * pergunta o que o sistema pode deduzir é a Lei 1 quebrada.
   */
  const [quemLeva, setQuemLeva] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const { data: lugares, loading: buscandoLugares } = useQuery<Place[]>(() =>
    listPlaces(empresaDaqui()),
  );
  const lojas = (lugares ?? []).filter((p) => p.id !== fabrica);
  const loja = lojas.find((p) => p.id === lojaId) ?? lojas[0] ?? null;

  const { data, loading, error, refresh } = useQuery<Carregado | null>(async () => {
    if (!loja) return null;
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const [places, carriers, linhas, itens, carrinho] = await Promise.all([
      listPlaces(empresaDaqui()),
      listCarriers(empresaDaqui()),
      pickingFor(
        empresaDaqui(),
        loja.id,
        fabrica,
        localDate(nowIso(), locale.timeZone, 7),
        hoje.from,
        hoje.to,
      ),
      listItems(empresaDaqui()),
      pickingCart(loja.id),
    ]);
    return { places, carriers, linhas, itens, carrinho };
  }, loja?.id ?? '');

  const linhas = data?.linhas ?? [];
  const carrinho = data?.carrinho ?? {};
  // Só as em uso se oferecem: transportadora aposentada continua no registro do
  // que ela levou, e oferecê-la de novo seria ressuscitar um cadastro por engano.
  const transportadoras = (data?.carriers ?? []).filter((c) => c.active);

  /** O que falta daquele item, já descontando o que saiu hoje. Nunca negativo. */
  const falta = (linha: PickLine) => Math.max(0, linha.ordered - linha.sentToday);

  const contados = linhas.filter((l) => (carrinho[l.itemId] ?? 0) > 0).length;
  const total = Object.values(carrinho).reduce((n, v) => n + v, 0);

  const contar = async (itemId: string, baseUnits: number) => {
    if (!loja) return;
    await setPickingCart(loja.id, { ...carrinho, [itemId]: baseUnits });
    refresh();
  };

  const mandar = async () => {
    if (!loja || total <= 0) return;
    const itens = Object.entries(carrinho).filter(([, n]) => n > 0);

    const go = await askConfirm({
      title: fill(words.confirmTitle, { place: loja.name.trim() || t.app.places.factory }),
      message: fill(words.confirmBody, { count: plural(itens.length, words.lineCount) }),
      confirmLabel: words.confirmAction,
    });
    if (!go) return;

    setEnviando(true);
    try {
      // Uma transferência por item, e cada uma é um ato do livro-razão com o seu
      // próprio grupo — igual a quem carrega o caminhão em duas viagens. O que
      // costura as duas coisas é o fechamento, que conta o DIA.
      for (const [itemId, baseUnits] of itens) {
        // **De qual lote a carga sai — deduzido aqui como a transferência já deduz.**
        //
        // Quem despacha não escolhe lote: despacha o que está na frente, e o que está
        // na frente é o que vence primeiro. A tela de transferência faz essa dedução
        // desde 3 de setembro; a separação nasceu depois, é a porta que a aba de
        // transporte oferece PRIMEIRO, e mandava `lotId` nulo. O efeito é o saldo de
        // lote da fábrica só subindo — um lote que já viajou continua parecendo estar
        // aqui —, e a carga seguinte estampando o código errado na etiqueta. Num
        // recall isso é a diferença entre saber qual loja recebeu e não saber.
        //
        // Nulo continua sendo caso normal e frequente: açúcar e palito não têm lote.
        const lotes = await lotsInStock(empresaDaqui(), itemId, fabrica);
        await recordTransfer(empresaDaqui(), {
          itemId,
          fromLocationId: fabrica,
          toLocationId: loja.id,
          baseUnits,
          lotId: lotes[0]?.lotId ?? null,
          carrierId: quemLeva,
        });
      }
      tatoDeSucesso();
      await setPickingCart(loja.id, {});

      const hoje = dayWindow(nowIso(), locale.timeZone);
      const cobertos = await ordersCoveredToday(empresaDaqui(), loja.id, hoje.from, hoje.to);
      if (cobertos.length > 0) {
        const fechar = await askConfirm({
          title: t.app.transfer.closeAsk,
          message: fill(t.app.transfer.closeBody, {
            count: plural(cobertos.length, t.app.transfer.closeCount),
          }),
          confirmLabel: t.app.transfer.closeAction,
          cancelLabel: t.app.transfer.closeKeep,
        });
        if (fechar) {
          for (const id of cobertos) await setOrderStatus(empresaDaqui(), id, 'delivered');
        }
      }
      refresh();
    } catch (e) {
      // A recusa do piso vem com os números; a frase é desta tela, em três
      // idiomas — a mensagem crua do erro é em inglês e é para o registro.
      await askConfirm({
        title: e instanceof NotEnoughStockError ? words.missingTitle : words.failed,
        message:
          e instanceof NotEnoughStockError
            ? fill(words.missingStock, { items: e.missing.map((m) => m.name).join(', ') })
            : e instanceof Error
              ? e.message
              : String(e),
        acknowledge: true,
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <CollapsingHeader
      cena="separacao"
      title={words.title}
      overline={words.overline}
      erro={error}
      denovo={refresh}
    >
      {/* Para qual loja. Mesma lista da transferência, e a escolha marca com a
          tinta e o peso da palavra — caixa desenhada à mão aqui era o que não
          tinha como virar Papel. */}
      {/* ANTES DE TUDO: existe para onde mandar?
          Achado no emulador, e é o defeito que a Lei da Inteligência proíbe com
          todas as letras. Numa fábrica recém-instalada não há loja nem cliente, e
          esta tela desenhava um cabeçalho "Para onde vai" com **nada embaixo** —
          o `map` de uma lista vazia — e logo abaixo a frase *"essa loja não tem
          pedido em aberto"*, falando de uma loja que ela nunca ofereceu nem
          nomeou. Duas mentiras pequenas que juntas fazem a tela parecer quebrada
          exatamente na primeira vez em que alguém a abre.
          O ramo de "sem pedido" continua certo — para quando HÁ loja. */}
      {!buscandoLugares && lojas.length === 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.lilac}
            icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
            title={words.noPlacesTitle}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{words.noPlacesHint}</Text>
            {/* Erro que IMPEDE diz para onde ir. Sem esta porta a pessoa fica
                sabendo que falta algo e não sabendo o quê fazer. */}
            <Button
              label={words.noPlacesAction}
              variant="ghost"
              onPress={() => router.push('/places')}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : (
      <Reveal index={0}>
        <Card
          hue={palette.lilac}
          icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
          title={t.app.transfer.to}
        >
          {lojas.map((p) => {
            const ativo = p.id === loja?.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setLojaId(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={p.name}
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
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      </Reveal>
      )}

      {/* Sem pedido não há o que separar, e isso é estado válido: a tela diz para
          onde ir em vez de mostrar uma lista vazia. Só vale quando HÁ loja — sem
          loja, quem responde é o cartão acima. */}
      {lojas.length === 0 || loading ? null : linhas.length === 0 ? (
        <Reveal index={1}>
          <Card hue={palette.lilac} title={words.empty}>
            <Text style={[type.body, { color: color.inkMuted }]}>{words.emptyHint}</Text>
            <Button
              label={t.app.transfer.title}
              variant="ghost"
              onPress={() => router.push('/transfer')}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : (
        <>
          {/* Onde a separação está. O número aparece com a comparação, nunca
              sozinho: "3 de 7", e não "3". */}
          <Reveal index={1}>
            <Card
              // O tom é o do ASSUNTO — transporte é lilás em todo o aplicativo —,
              // e não o do estado. Quem vê lilás sabe do que a tela fala antes de
              // ler; pintar de verde quando termina trocaria a identidade por um
              // sinal, e o sinal tem lugar próprio: o crachá abaixo.
              hue={palette.lilac}
              icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
              title={fill(words.progress, {
                done: String(contados),
                total: String(linhas.length),
              })}
            >
              {contados === linhas.length ? (
                <View style={{ marginBottom: space.sm }}>
                  <Chip signal="ok" label={words.ready} />
                </View>
              ) : null}
              <Text style={[type.caption, { color: color.inkFaint }]}>{words.kept}</Text>
            </Card>
          </Reveal>

          {linhas.map((linha, i) => {
            const item = data?.itens.find((it) => it.id === linha.itemId) ?? null;
            const noCarrinho = carrinho[linha.itemId] ?? 0;
            const restante = falta(linha);
            const excesso = noCarrinho - restante;

            return (
              <Reveal key={linha.itemId} index={2 + i}>
                <Card hue={noCarrinho > 0 ? palette.mint : palette.lilac} title={linha.name}>
                  {/* O que o pedido diz, e o que já saiu — os dois, porque o
                      número de quanto falta só se confere sabendo de onde veio. */}
                  <Text style={[type.caption, { color: color.inkMuted }]}>
                    {fill(words.ordered, {
                      amount: `${formatQuantity(linha.ordered, locale)} ${item?.baseUnit ?? ''}`,
                    })}
                    {linha.sentToday > 0
                      ? ` · ${fill(words.alreadySent, {
                          amount: `${formatQuantity(linha.sentToday, locale)} ${item?.baseUnit ?? ''}`,
                        })}`
                      : ''}
                    {` · ${fill(words.left, {
                      amount: `${formatQuantity(restante, locale)} ${item?.baseUnit ?? ''}`,
                    })}`}
                  </Text>

                  {item ? (
                    <View style={{ marginTop: space.md }}>
                      <UnitStepper
                        hierarchy={item.packaging}
                        locale={locale}
                        tierLabel={(id, n) =>
                          plural(n, t.units[id as keyof typeof t.units] ?? t.units.unit)
                        }
                        value={noCarrinho}
                        onChange={(n) => void contar(linha.itemId, n)}
                        labels={t.stepper}
                      />
                    </View>
                  ) : null}

                  {/* Contar a mais é FATO, não erro: às vezes a loja pediu mais na
                      porta, e o aviso diz o que é sem impedir nada. */}
                  {excesso > 0 ? (
                    <View style={{ marginTop: space.sm }}>
                      <Chip
                        signal="warning"
                        label={fill(words.over, {
                          amount: `${formatQuantity(excesso, locale)} ${item?.baseUnit ?? ''}`,
                        })}
                      />
                    </View>
                  ) : null}
                </Card>
              </Reveal>
            );
          })}

          {/* Quem leva — e o cartão só existe quando há transportadora cadastrada.
              Uma fábrica que entrega no carro dela nunca vê esta pergunta, que é a
              Lei 1: não se pede o que o sistema pode deduzir. O carro da fábrica
              vem marcado; a última escolha não é lembrada de propósito, porque
              carga por transportadora e carga própria se alternam no mesmo dia. */}
          {transportadoras.length > 0 ? (
            <Reveal index={2 + linhas.length}>
              <Card
                hue={palette.lilac}
                icon={(c) => <GlyphVehicle size={26} color={c} weight={traco} />}
                title={t.app.transport.carrierPick}
              >
                <View style={[styles.wrap, { gap: space.sm }]}>
                  <Pressable
                    onPress={() => setQuemLeva(null)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: quemLeva === null }}
                    accessibilityLabel={t.app.transport.carrierOwn}
                  >
                    <Chip
                      signal={quemLeva === null ? 'ok' : 'neutral'}
                      label={t.app.transport.carrierOwn}
                    />
                  </Pressable>
                  {transportadoras.map((quem) => (
                    <Pressable
                      key={quem.id}
                      onPress={() => setQuemLeva(quem.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: quemLeva === quem.id }}
                      accessibilityLabel={quem.name}
                    >
                      <Chip
                        signal={quemLeva === quem.id ? 'ok' : 'neutral'}
                        label={quem.name}
                      />
                    </Pressable>
                  ))}
                </View>
              </Card>
            </Reveal>
          ) : null}

          <Reveal index={3 + linhas.length}>
            <Button
              label={enviando ? words.sending : words.finish}
              onPress={() => void mandar()}
              disabled={total <= 0 || enviando}
              weighty
              icon={(c) => <GlyphBox size={22} color={c} weight={traco} />}
            />
          </Reveal>

          {/* Largar o carrinho é ato de gente, não defeito. E a frase diz que
              nada é desfeito, porque nada foi gravado — a diferença entre
              esvaziar e estornar tem que ficar clara antes do toque. */}
          {total > 0 ? (
            <Reveal index={4 + linhas.length}>
              <Button
                label={words.clear}
                variant="ghost"
                onPress={async () => {
                  const go = await askConfirm({
                    title: words.clearAsk,
                    message: words.clearBody,
                    confirmLabel: words.clear,
                  });
                  if (go && loja) {
                    await setPickingCart(loja.id, {});
                    refresh();
                  }
                }}
              />
            </Reveal>
          ) : null}
        </>
      )}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});

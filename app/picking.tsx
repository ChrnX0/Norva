import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { GlyphBox, GlyphStore } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { UnitStepper } from '@/components/UnitStepper';
import { nowIso } from '@/data/db';
import {
  defaultLocationId,
  listItems,
  listPlaces,
  ordersCoveredToday,
  pickingCart,
  pickingFor,
  recordTransfer,
  setOrderStatus,
  setPickingCart,
  type Item,
  type PickLine,
  type Place,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
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

  const fabrica = defaultLocationId(LOCAL_COMPANY_ID);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const { data: lugares } = useQuery<Place[]>(() => listPlaces(LOCAL_COMPANY_ID));
  const lojas = (lugares ?? []).filter((p) => p.id !== fabrica);
  const loja = lojas.find((p) => p.id === lojaId) ?? lojas[0] ?? null;

  const { data, refresh } = useQuery<Carregado | null>(async () => {
    if (!loja) return null;
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const [places, linhas, itens, carrinho] = await Promise.all([
      listPlaces(LOCAL_COMPANY_ID),
      pickingFor(
        LOCAL_COMPANY_ID,
        loja.id,
        fabrica,
        localDate(nowIso(), locale.timeZone, 7),
        hoje.from,
        hoje.to,
      ),
      listItems(LOCAL_COMPANY_ID),
      pickingCart(loja.id),
    ]);
    return { places, linhas, itens, carrinho };
  }, loja?.id ?? '');

  const linhas = data?.linhas ?? [];
  const carrinho = data?.carrinho ?? {};

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
        await recordTransfer(LOCAL_COMPANY_ID, {
          itemId,
          fromLocationId: fabrica,
          toLocationId: loja.id,
          baseUnits,
        });
      }
      await setPickingCart(loja.id, {});

      const hoje = dayWindow(nowIso(), locale.timeZone);
      const cobertos = await ordersCoveredToday(LOCAL_COMPANY_ID, loja.id, hoje.from, hoje.to);
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
          for (const id of cobertos) await setOrderStatus(LOCAL_COMPANY_ID, id, 'delivered');
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
      setEnviando(false);
    }
  };

  return (
    <CollapsingHeader title={words.title} overline={words.overline}>
      {/* Para qual loja. Mesma lista da transferência, e a escolha marca com a
          tinta e o peso da palavra — caixa desenhada à mão aqui era o que não
          tinha como virar Papel. */}
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

      {/* Sem pedido não há o que separar, e isso é estado válido: a tela diz para
          onde ir em vez de mostrar uma lista vazia. */}
      {linhas.length === 0 ? (
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

          <Reveal index={2 + linhas.length}>
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
            <Reveal index={3 + linhas.length}>
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
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});

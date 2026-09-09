import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphStore } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { storeMirror, type MirrorItem, type MirrorRow } from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import type { Dictionary } from '@/i18n';
import { fill, formatPercent, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * O Espelho da Loja — o que cada loja faz com o que recebe.
 *
 * A pergunta é uma só, e ela tem nome desde o primeiro plano: *"a loja centro
 * devolve 8% do que recebe"*. Só é possível porque a devolução tem tipo próprio no
 * razão — gravadas como transferência, ida e volta ficariam idênticas e a diferença,
 * que é a única coisa que interessa, sumiria.
 *
 * **Por que a fração é a manchete e o total é a conta.** Mil unidades de volta não
 * dizem nada: são ótimas em vinte mil e péssimas em três mil. A fração decide, então
 * ela é a figura; o par que a produziu vem logo abaixo, porque toda conclusão abre a
 * conta (Lei 6). Não há `[por quê?]` para tocar porque não há nada escondido — a
 * conta inteira cabe numa linha.
 *
 * **E a fração é por ITEM, nunca por loja.** A régua do razão é grama para o açúcar e
 * unidade para o picolé; uma fração da loja inteira somaria as duas e o item pesado
 * afogaria o leve — metade dos picolés de volta apareceria como meio por cento. A
 * unidade sai escrita ao lado de cada número por isso, e não por capricho.
 *
 * **E a janela anterior vem junto, sempre** (Lei 3): 8% depois de 12% é uma loja se
 * ajeitando, e 8% depois de 3% é uma loja com problema. Sem a comparação, os dois
 * casos são a mesma tela.
 *
 * **A tela não julga, e isso é escolha registrada.** Não há "devolve demais" em lugar
 * nenhum: essa régua só se afere contra uma fábrica de verdade, e qualquer corte que
 * eu escolhesse agora seria calibrado contra um banco semeado — padrão de banco
 * semeado é o padrão que a semeadura plantou. O sinal do chip diz a DIREÇÃO, que é
 * fato, e nunca o veredito.
 *
 * **Sem portão de dinheiro**, porque não há cifra aqui: unidade que chegou e unidade
 * que voltou é o que quem confere a doca vê com os olhos. Esconder do operador não
 * deixa número nenhum mais seguro — deixa a conferência sem acontecer.
 */
export default function Mirror() {
  return (
    <AreaProvider area="rose">
      <Espelho />
    </AreaProvider>
  );
}

/** A janela: trinta dias é onde uma fábrica decide — uma semana é ruído, um ano é história. */
const DIAS = 30;

function Espelho() {
  const { color, type, space, palette, traco } = useTheme();
  const { t, locale } = useLocale();
  const router = useRouter();
  const words = t.app.reports.mirror;

  const { data } = useQuery<MirrorRow[]>(() => storeMirror(empresaDaqui(), DIAS));
  const linhas = data ?? [];

  return (
    <CollapsingHeader cena="espelho" title={words.title} overline={words.overline}>
      <Reveal index={0}>
        <Text style={[type.caption, { color: color.inkFaint }]}>
          {fill(words.window, { days: String(DIAS) })}
        </Text>
      </Reveal>

      {linhas.length === 0 ? (
        // "Está tudo bem" é estado válido, e "ainda não começou" também: a tela diz
        // o que falta acontecer em vez de parecer defeito.
        <Reveal index={1}>
          <Card
            hue={palette.rose}
            icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
            title={words.empty}
          >
            <Text style={[type.body, { color: color.inkMuted }]}>{words.emptyHint}</Text>
          </Card>
        </Reveal>
      ) : (
        linhas.map((loja, i) => (
          <Reveal key={loja.placeId} index={i + 1}>
            <Touchable
              // Sem rótulo: o cartão diz a loja, quanto chegou, quanto voltou e a
              // fração — um resumo de duas palavras apagaria os três números.
              onPress={() => router.push('/places' as never)}
            >
              <Card
                hue={palette.rose}
                icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
                title={loja.placeName}
              >
                <View style={{ gap: space.lg }}>
                  {voltaram(loja).map((item) => (
                    <View key={item.itemId}>
                      <Text style={[type.overline, { color: color.inkFaint }]}>{item.name}</Text>

                      <Text style={[type.figure, { color: color.ink }]}>
                        {fill(words.share, { percent: formatPercent(item.returnShare, locale) })}
                      </Text>

                      {/* A conta, aberta: é o par que produziu a fração acima, com a
                          régua ao lado de cada número. */}
                      <Text style={[type.secondary, { color: color.inkMuted }]}>
                        {fill(words.account, {
                          returned: `${formatQuantity(item.returned, locale)} ${item.baseUnit}`,
                          received: `${formatQuantity(item.received, locale)} ${item.baseUnit}`,
                        })}
                      </Text>

                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: space.sm,
                          marginTop: space.sm,
                        }}
                      >
                        <Chip signal={direcao(item)} label={comparacao(item, words, locale)} />
                        {item.reasons.map((motivo) => (
                          <Chip
                            key={motivo.reason}
                            signal="neutral"
                            label={`${palavraDoMotivo(motivo.reason, t)} · ${formatQuantity(motivo.baseUnits, locale)} ${item.baseUnit}`}
                          />
                        ))}
                      </View>
                    </View>
                  ))}

                  {/* O silêncio, dito uma vez.
                      A foto trouxe seis blocos iguais de "Nada voltou" com seis
                      selos de "antes eram 0,0%": é o alerta inventado na forma
                      calma, uma parede de nada que ensina a rolar sem ler. Produto
                      que não voltou não tem notícia — e a contagem NÃO soma
                      unidades, porque as réguas dos itens são diferentes e somá-las
                      é o defeito que esta tela acabou de consertar. */}
                  {intactos(loja).length > 0 ? (
                    <Text style={[type.body, { color: color.inkMuted }]}>
                      {fill(words.nothingFrom, {
                        products: plural(intactos(loja).length, words.productCount),
                      })}
                    </Text>
                  ) : null}
                </View>
              </Card>
            </Touchable>
          </Reveal>
        ))
      )}
    </CollapsingHeader>
  );
}

/** O que voltou: a notícia, com número, conta e comparação. */
function voltaram(loja: MirrorRow): MirrorItem[] {
  return loja.items.filter((item) => item.returned > 0);
}

/** O que não voltou: fato, e sem notícia — vira uma linha só. */
function intactos(loja: MirrorRow): MirrorItem[] {
  return loja.items.filter((item) => item.returned === 0);
}

/**
 * A DIREÇÃO, que é fato — nunca o veredito, que é régua.
 *
 * Subiu é aviso e desceu é bom, e as duas coisas se sabem sem saber quanto é
 * "demais". Uma loja sem janela anterior fica neutra: primeira leitura não é
 * notícia, e pintá-la de verde ou âmbar seria inventar uma comparação.
 */
function direcao(item: MirrorItem): 'ok' | 'warning' | 'neutral' {
  if (item.before.received === 0) return 'neutral';
  if (item.returnShare > item.before.returnShare) return 'warning';
  if (item.returnShare < item.before.returnShare) return 'ok';
  return 'neutral';
}

function comparacao(
  item: MirrorItem,
  words: Dictionary['app']['reports']['mirror'],
  locale: Parameters<typeof formatPercent>[1],
): string {
  if (item.before.received === 0) return words.first;
  return fill(words.before, { percent: formatPercent(item.before.returnShare, locale) });
}

/** A palavra do motivo mora na tela de transferência, que é onde ela é escolhida. */
function palavraDoMotivo(reason: string, t: Dictionary): string {
  const w = t.app.transfer;
  if (reason === 'unsold') return w.unsold;
  if (reason === 'wrong_item') return w.wrong_item;
  if (reason === 'melted') return w.returnMelted;
  return w.returnExpired;
}

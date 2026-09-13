import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { CountUp } from '@/components/CountUp';
import { GlyphPrice, GlyphPurchase, GlyphSack } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { nowIso } from '@/data/db';
import { empresaDaqui } from '@/data/empresa';
import { shoppingToday, type LinhaDeCompra } from '@/data/repository';
import { unidadeDaqui } from '@/data/unidade';
import { useQuery } from '@/data/useQuery';
import type { Cents } from '@/domain/money';
import { fill, formatMoney, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * **O que comprar hoje, quanto, e de quem.**
 *
 * O mecanismo desta tela estava inteiro construído e espalhado antes dela existir: `precisaComprar`
 * decide o dia, a capa o usa por item, a ficha do insumo desenha o ponto de recompra, e o aviso
 * chega ao bolso. Faltavam duas coisas, e a segunda é a que faz esta tela:
 *
 * 1. **QUANTO pedir não existia em lugar nenhum do domínio.** `reorderPoint` responde *quando*;
 *    a quantidade é outra conta — prazo mais folga mais o ciclo de compra, menos o que já está na
 *    prateleira —, e sem ela o aplicativo dizia "compre" e deixava a multiplicação para quem está
 *    de luva no almoxarifado. É a Lei 1 ao contrário: pedir o que o sistema pode deduzir.
 * 2. **A resposta morava numa ficha por vez.** Quem compra abria insumo por insumo para saber se
 *    hoje era o dia de cada um. Uma lista é o que transforma quinze consultas numa decisão.
 *
 * **A régua do dia é a MESMA de todo o resto**, e isso não é economia de código: uma segunda régua
 * aqui faria a tela de compras discordar da capa e do aviso na mesma manhã, que é a doença que
 * `precisaComprar` nasceu para curar em 6 de setembro.
 *
 * **A conta ABRE em cada linha** (Lei 6), e por um motivo específico desta tela: o número que ela
 * mostra é um pedido de dinheiro. *"2 sacos"* sem *"porque sai 1 kg por dia, o fornecedor leva 6
 * dias, você compra de 7 em 7 e tem 4 kg"* é uma ordem, não uma sugestão — e o sistema desta casa
 * sugere, nunca decide calado.
 *
 * **Vazia é estado válido e bonito** (Lei 7). Uma fábrica com tudo comprado não é uma fábrica sem
 * notícia: é a notícia. A alternativa — encher a tela com os insumos tranquilos — seria o alerta
 * inventado com outro rosto, e ensina a ignorar a lista no dia em que ela tiver alguém dentro.
 *
 * O tom é `sage`, que é a área de compras, e o acento de cada linha é o da URGÊNCIA e não o da
 * área: o que decide a ordem de leitura é quanto tempo falta.
 */
export default function Comprar() {
  return (
    <AreaProvider area="sage">
      <OQueComprar />
    </AreaProvider>
  );
}

function OQueComprar() {
  const { color, type, space, palette, traco } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();
  const words = t.app.buyToday;

  /**
   * Da UNIDADE e não da empresa, e a razão é a mesma da capa: quem está com o aparelho compra para
   * o almoxarifado onde ele está. Somar a outra cidade daria uma lista que a pessoa não consegue
   * usar — ela pediria açúcar que já chegou a duzentos quilômetros de distância.
   */
  const { data, loading, error, refresh } = useQuery<LinhaDeCompra[]>(() =>
    shoppingToday(empresaDaqui(), nowIso(), { unidade: unidadeDaqui() }),
  );

  const linhas = data ?? [];
  /**
   * O total é a soma das estimativas, e ele só existe quando TODAS existem.
   *
   * Sem o portão do dinheiro cada linha vem com `estimateCents` nulo, e somar nulos daria zero —
   * um total de R$ 0,00 numa lista de quinze itens é pior que total nenhum, porque é um número
   * errado com cara de número. Nulo aqui faz a figura virar a CONTAGEM, que é fato e serve: o que
   * comprar e quanto não é dinheiro.
   */
  const comDinheiro = linhas.length > 0 && linhas.every((l) => l.estimateCents !== null);
  const total = comDinheiro ? linhas.reduce((n, l) => n + (l.estimateCents ?? 0), 0) : null;

  /** Quantas embalagens a lista inteira pede — a leitura de quem vai carregar, não de quem paga. */
  const pacotes = linhas.reduce((n, l) => n + l.buyPacks, 0);

  return (
    <CollapsingHeader
      cena="compras"
      title={words.title}
      overline={words.overline}
      erro={error}
      denovo={refresh}
    >
      {loading && linhas.length === 0 ? (
        <Text style={[type.body, { color: color.inkMuted }]}>{words.loading}</Text>
      ) : linhas.length === 0 ? (
        /* Nada a comprar, e isto é notícia boa dita como notícia — desenho, frase e saída, sem
           tom de alerta e sem inventar uma lista de insumos tranquilos para preencher a tela. */
        <Reveal index={0}>
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={words.emptyTitle}
          >
            <Text style={[type.body, { color: color.ink }]}>{words.empty}</Text>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {words.emptyWhy}
            </Text>
            <View style={{ marginTop: space.md }}>
              <Button
                label={words.goToInputs}
                variant="ghost"
                onPress={() => router.push('/inputs')}
              />
            </View>
          </Card>
        </Reveal>
      ) : (
        <>
          {/* QUANTO custa a lista — ou quantas embalagens ela pede, quando o dinheiro não é desta
              pessoa. Um número só, com a comparação ao lado (Lei 3): o número sozinho seria
              "R$ 1.240" sem dizer de quantos itens. */}
          <Reveal index={0}>
            <Card hue={palette.sky} icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}>
              <Text style={[type.overline, { color: color.inkFaint }]}>{words.estimate}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
                <CountUp
                  value={total ?? pacotes}
                  format={(v) =>
                    total === null ? formatQuantity(v, locale) : formatMoney(v as Cents, locale)
                  }
                  style={{ ...type.figure, color: color.ink }}
                />
                <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]}>
                  {plural(linhas.length, words.itemCount)}
                </Text>
              </View>
              {/* E a estimativa diz de si mesma que é estimativa: a taxa é a da última nota, e o
                  fornecedor pode ter mudado o preço — é justamente para isso que a tela de compra
                  compara. Chamar isto de "total" seria prometer um número que não é nosso. */}
              <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
                {total === null ? words.estimateNoMoney : words.estimateWhy}
              </Text>
            </Card>
          </Reveal>

          {/* O QUE, e cada linha abre a própria conta. O mais apertado primeiro, porque é assim que
              uma lista de compras se lê. */}
          <Reveal index={1}>
            <Card
              hue={palette.sage}
              icon={(c) => <GlyphPurchase size={26} color={c} weight={traco} />}
              title={words.listTitle}
            >
              {linhas.map((l) => (
                <View key={l.itemId} style={{ marginBottom: space.sm }}>
                  <ListRow
                    label={l.name}
                    /* QUANTO, na embalagem que se pede ao fornecedor — e a unidade-base ao lado,
                       porque "2 sacos" não diz quanto é para quem confere a carga. */
                    detail={fill(words.howMuch, {
                      packs: formatQuantity(l.buyPacks, locale),
                      pack: l.purchaseUnit ?? t.units.unit.one,
                      amount: `${formatQuantity(Math.round(l.buyBaseUnits), locale)} ${l.baseUnit}`,
                    })}
                    /* QUANDO acaba — o número que decide a ordem da lista. */
                    trailing={fill(words.daysLeft, {
                      days: formatQuantity(Math.floor(l.daysLeft), locale),
                    })}
                    trailingTone={l.daysLeft <= 1 ? 'warning' : 'muted'}
                    signal={l.daysLeft <= 1 ? 'danger' : 'warning'}
                    icon={(c) => <GlyphSack size={22} color={c} weight={traco} />}
                    hue={palette.mint}
                    onPress={() => router.push(`/purchase?itemId=${l.itemId}`)}
                  />
                  {/* A CONTA, aberta (Lei 6) — e ela é a razão de a tela poder pedir dinheiro.
                      Três frases possíveis, porque o que se sabe muda: com fornecedor e com ciclo,
                      com fornecedor e sem ciclo (a primeira compra da vida), e sem fornecedor
                      cadastrado, onde o prazo volta a ser o piso configurado. */}
                  <Text
                    style={[
                      type.caption,
                      { color: color.inkFaint, marginTop: space.xs, marginLeft: space.lg },
                    ]}
                  >
                    {fill(
                      l.supplierName === null
                        ? words.whyNoSupplier
                        : l.cycleDays === null
                          ? words.whyNoCycle
                          : words.why,
                      {
                        rate: `${formatQuantity(Math.round(l.dailyOutflow), locale)} ${l.baseUnit}`,
                        held: `${formatQuantity(Math.round(l.onHandBaseUnits), locale)} ${l.baseUnit}`,
                        supplier: l.supplierName ?? '',
                        lead: plural(Math.round(l.leadTimeDays ?? 0), words.dayCount),
                        cycle: plural(Math.round(l.cycleDays ?? 0), words.dayCount),
                      },
                    )}
                  </Text>
                </View>
              ))}
            </Card>
          </Reveal>
        </>
      )}
    </CollapsingHeader>
  );
}

import { useLocalSearchParams, useRouter } from 'expo-router';
import { voltar } from '@/nav';
import { avisoDeFalha } from '@/i18n/falha';
import { ERROS } from '@/data/erros';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card, tint } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { GlyphKettle, GlyphLabel } from '@/components/Glyph';
import { QrCode } from '@/components/QrCode';
import { Reveal } from '@/components/Reveal';
import {
  findLot,
  planReversal,
  reverseGroup,
  type LotOfDay,
  type ReversalPlan,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import { fill, formatCalendarDate, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * A etiqueta do lote, na tela, do tamanho em que ela vai para o papel.
 *
 * Esta tela é a **prova visual** da etiqueta antes de existir impressora. A
 * escolha de qual impressora a fábrica compra é do dono, e ela muda o formato
 * do papel, não o conteúdo - então o conteúdo entra primeiro, conferido no
 * aparelho, e a impressão vem quando o modelo estiver decidido.
 *
 * O que ela mostra é exatamente o que o padrão de rastreio pede e nada além:
 * **o que é**, **de que lote**, **quando foi feito**, **até quando vale** e
 * **quanto rendeu**. Cada linha que não serve para achar ou recolher o produto
 * fica fora - etiqueta cheia é etiqueta que ninguém lê.
 *
 * O código aparece duas vezes de propósito: no quadrado e escrito por extenso,
 * grande, embaixo dele. Etiqueta que congela, descola ou é arranhada por caixa
 * empilhada é semana normal numa fábrica, e quando o quadrado falha alguém
 * digita os onze caracteres e segue.
 *
 * **E é daqui que se conserta a corrida.** O lote é a única coisa que aponta
 * para um ato de produção com um nome que alguém lê em voz alta, então quem
 * lançou 500 onde eram 50 chega aqui pelo código. A ação fica FORA do papel
 * branco - a etiqueta é o que sai da impressora, e botão nenhum sai impresso.
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`),
 * e o layout anterior saiu inteiro em vez de ganhar um caminho ao lado. O que
 * havia era um retângulo branco solto no meio da tela — sem tom de área, sem
 * desenho, sem crachá — e embaixo dele dois cartões cinzas anônimos: um para o
 * estado da correção e outro só para a frase que explica o código duplicado.
 * Três caixas, nenhuma dizendo de que assunto era.
 *
 * Agora há dois blocos, na ordem em que se decide: **a etiqueta** (o cartão de
 * produção, com o crachá da etiqueta, carregando a folha branca — e a frase do
 * código duplicado passou para dentro dele, porque ela explica o papel e só faz
 * sentido colada nele) e **a corrida** (o tacho, que é o ato que se conserta,
 * em âmbar quando o conserto não passa e em botão fantasma quando passa).
 *
 * A folha é a única caixa desenhada à mão em todo o aplicativo, e é exceção
 * registrada em `src/language.test.ts`: papel branco com tinta preta em
 * qualquer tema, porque é o que sai da impressora. O que ela pega do tema é só
 * o **canto** — o menor de cada identidade, que no Papel é quase reto, como uma
 * etiqueta de verdade, e no Orgânico acompanha as curvas do resto da tela.
 */

/** O papel e as duas forças de tinta. Não é tema: é o que a impressora faz. */
const PAPEL = '#FFFFFF';
const TINTA = '#111111';
const TINTA_FRACA = '#333333';

export default function LotLabel() {
  return (
    <AreaProvider area="apricot">
      <Label />
    </AreaProvider>
  );
}

type Loaded = { lot: LotOfDay | null; plan: ReversalPlan | null };

function Label() {
  const { id, lido } = useLocalSearchParams<{ id: string; lido?: string }>();
  const { color, type, space, radius, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();
  const confirm = useConfirm();

  // O plano vem JUNTO com o lote, e não no toque do botão.
  //
  // A Lei 5 pede que o erro impeça em vez de reclamar: se a carga já saiu, a
  // tela diz isso antes, com o item pelo nome, em vez de deixar a pessoa tocar
  // e receber "não foi possível".
  const { data, loading, error, refresh } = useQuery<Loaded>(async () => {
    const lot = await findLot(empresaDaqui(), id);
    if (!lot?.runGroupId) return { lot, plan: null };
    return { lot, plan: await planReversal(empresaDaqui(), lot.runGroupId) };
  });

  const lote = data?.lot ?? null;
  const plano = data?.plan ?? null;

  /**
   * A quantidade como a tela de lugares já diz: "28.000 g", "500 un".
   *
   * Mesmo formato de lá de propósito - duas maneiras de escrever a mesma
   * grandeza fazem a pessoa conferir se são a mesma coisa.
   */
  const diga = (baseUnits: number, unit: string) =>
    `${formatQuantity(Math.abs(baseUnits), locale)} ${unit}`;

  /** "28.000 g de Polpa de morango" - e o "de" vem do dicionário, que em inglês é "of". */
  const nomeada = (l: { baseUnits: number; baseUnit: string; name: string }) =>
    fill(t.common.amountOf, { amount: diga(l.baseUnits, l.baseUnit), name: l.name });

  const corrigir = async () => {
    if (!lote?.runGroupId || !plano) return;
    const sai = plano.legs.filter((l) => l.baseUnits < 0);
    const volta = plano.legs.filter((l) => l.baseUnits > 0);

    const yes = await confirm({
      title: fill(t.app.lotLabel.reverseTitle, { code: lote.code }),
      // Os números por extenso, os dois lados. A confirmação deste aplicativo
      // diz o que vai acontecer, não pergunta se tem certeza.
      message: fill(t.app.lotLabel.reverseBody, {
        out: sai.map(nomeada).join(' · '),
        back: volta.map(nomeada).join(' · '),
      }),
      confirmLabel: t.app.lotLabel.reverseConfirm,
      // Sem `destructive`: estornar um lote é a correção, não a perda.
    });
    if (!yes) return;

    // O terceiro botão de desfazer — e era o único dos três sem `catch`. Estornar
    // pede `adjust_stock`: com o entregador segurando o aparelho, o toque não fazia
    // nada e a tela voltava como se tivesse feito.
    try {
      await reverseGroup(empresaDaqui(), { groupId: lote.runGroupId });
    } catch (e) {
      const aviso = avisoDeFalha(e, t, ERROS);
      await confirm({
        title: aviso.title,
        message: aviso.message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }
    refresh();
    voltar();
  };

  /** O crachá da etiqueta, o assunto desta tela. */
  const etiqueta = (c: string) => <GlyphLabel size={26} color={c} weight={traco} />;

  /** O tacho: o ato que se conserta não é a etiqueta, é a corrida que a criou. */
  const tacho = (c: string) => <GlyphKettle size={26} color={c} weight={traco} />;

  /**
   * A cascata não pula número.
   *
   * A ficha só existe em lote que saiu de uma corrida — importação não tem —,
   * então a correção sobe uma posição quando ela não está lá. Índice fixo abriria
   * um vão de quarenta milissegundos no meio da entrada.
   */
  const iCorrecao = lote?.recipeName ? 2 : 1;

  /**
   * O lote sumiu, e isto é estado válido: desenho, a frase e a saída.
   *
   * A pilha não tem cabeçalho com seta - `headerShown` é falso no aplicativo
   * inteiro -, então uma tela que só diz "não está mais aqui" deixa a pessoa
   * sem porta. A porta é de onde ela veio: a produção do dia, que é a única
   * tela que abre um lote.
   *
   * **E "não achei" são DOIS fatos, não um — cicatriz de 9 de setembro.** Quem
   * toca um lote numa lista que o aplicativo acabou de desenhar tinha um lote:
   * ele existia e o estorno o levou, então "não está mais aqui" é verdade. Quem
   * apontou a câmera para um quadrado de refrigerante, ou digitou um código de
   * outra fábrica, nunca teve lote nenhum — e responder "não está mais aqui" ali
   * é o aplicativo afirmando um passado que não houve. A frase certa existia nos
   * três idiomas (`scanUnknown`) e ninguém a dizia.
   *
   * **O que separa os dois é o CAMINHO, nunca o formato do código.** `lotCode`
   * diz por escrito que `AAAAMMDD-NN` é o padrão e não a única forma — a fábrica
   * com código próprio vai usá-lo, e recusar por forma aqui chamaria o código
   * legítimo dela de estranho. Já quem chegou por câmera ou por digitação passa
   * `lido`, e isso é fato do chamador, não adivinhação nossa. A checagem continua
   * num lugar só, que é o que o docblock da produção e o do `scan` pedem: eles não
   * consultam nada, só dizem de onde vieram.
   */
  if (!loading && !lote) {
    return (
      <CollapsingHeader
        cena="lotes"
        title={t.app.lotLabel.title}
        overline={t.app.lotLabel.overline}
        erro={error}
        denovo={refresh}
      >
        <Reveal index={0}>
          <Card hue={palette.apricot} icon={etiqueta}>
            <Text style={[type.body, { color: color.ink }]}>
              {lido ? t.app.lotLabel.scanUnknown : t.app.lotLabel.gone}
            </Text>
            <Button
              label={t.app.tabs.production}
              variant="ghost"
              onPress={() => router.push('/production')}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader
      cena="lotes"
      title={t.app.lotLabel.title}
      overline={t.app.lotLabel.overline}
      erro={error}
      denovo={refresh}
    >
      {/* Também aqui: `if (loading)` não cobre a falha DEPOIS da carga — ali `loading`
          já é falso, `data` é undefined, e a tela cai neste caminho desenhando o vazio,
          que neste aplicativo é uma AFIRMAÇÃO. O casco troca o conteúdo pela página de
          falha quando `erro` chega. */}
      {/* A ETIQUETA. O cartão é de produção - quem vê âmbar sabe que o lote saiu
          do tacho antes de ler o nome - e o crachá é a própria etiqueta. Sem
          título: o cabeçalho já diz "Etiqueta do lote", e repetir a palavra num
          crachá seria rótulo inventado. */}
      <Reveal index={0}>
        <Card hue={palette.apricot} icon={etiqueta}>
          {/* A FOLHA, e a única caixa que este aplicativo desenha à mão.
              Branca com tinta preta em qualquer tema, porque é o que sai da
              impressora: o esquema da tela não muda a cor da tinta. O contorno
              fraquíssimo existe para a folha continuar sendo folha no Papel,
              onde o fundo da página também é claro. */}
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: PAPEL,
                borderColor: tint(TINTA, 0.12),
                borderRadius: radius.sm,
                padding: space.xl,
                gap: space.md,
              },
            ]}
          >
            <Text style={[type.cardTitle, styles.middle, { color: TINTA }]}>
              {lote?.name ?? ''}
            </Text>

            {lote ? <QrCode text={lote.code} size={200} /> : null}

            {/* O código por extenso, no maior corpo da etiqueta: é ele que
                salva a conferência quando o quadrado falha. */}
            <Text style={[type.figure, styles.code, { color: TINTA }]}>{lote?.code ?? ''}</Text>

            {/* A régua separa o que a câmera lê do que a pessoa lê - é o que
                toda etiqueta impressa tem, e o que faz esta parecer uma. */}
            <View style={[styles.rule, { backgroundColor: tint(TINTA, 0.22) }]} />

            <View style={[styles.facts, { gap: space.xs }]}>
              {lote?.producedOn ? (
                <Text style={[type.secondary, styles.middle, { color: TINTA_FRACA }]}>
                  {fill(t.app.lotLabel.madeOn, {
                    date: formatCalendarDate(lote.producedOn, locale),
                  })}
                </Text>
              ) : null}
              <Text style={[type.secondary, styles.middle, { color: TINTA_FRACA }]}>
                {lote?.expiresOn
                  ? fill(t.app.lotLabel.validUntil, {
                      date: formatCalendarDate(lote.expiresOn, locale),
                    })
                  : t.app.lotLabel.noExpiry}
              </Text>
              {lote ? (
                <Text style={[type.secondary, styles.middle, { color: TINTA_FRACA }]}>
                  {plural(lote.baseUnits, t.units.unit, formatQuantity(lote.baseUnits, locale))}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Lei 6, e por isso esta frase mora aqui e não num cartão só dela:
              ela abre a conta do que o olho acabou de ver duas vezes. */}
          <Text style={[type.caption, { color: color.inkFaint, marginTop: space.md }]}>
            {t.app.lotLabel.why}
          </Text>
        </Card>
      </Reveal>

      {/* A FICHA QUE RODOU. É o que o lote passou a carregar, e é a resposta que
          não existia em lugar nenhum: `production_runs` guardava a versão e é
          apagada ao fechar, e o movimento congela a TAXA, que é o resultado da
          ficha e não a identidade dela.
          Sem esta linha, corrigir a fórmula em março reescreve o que janeiro
          custou — o número continua certo e a pergunta "de que ficha veio?"
          passa a responder a receita de hoje.
          Fica FORA do papel branco: a etiqueta só leva o que serve para achar e
          recolher o produto, e a versão da ficha é conversa de dentro. */}
      {lote?.recipeName && lote.recipeVersion !== null ? (
        <Reveal index={1}>
          <Card hue={palette.apricot} icon={tacho} title={t.app.lotLabel.runTitle}>
            <Text style={[type.body, { color: color.ink }]}>
              {fill(t.app.lotLabel.fromSheet, {
                recipe: lote.recipeName,
                version: String(lote.recipeVersion),
              })}
            </Text>
            {/* E as SUB-receitas daquela versão, com a versão de cada uma.
                *"De que versão da calda saiu este lote?"* é a pergunta de um recall, e ela
                parava no primeiro carimbo: saber que o lote rodou "Picolé de morango v3" não
                diz qual calda entrou nele quando a mesma base serve oito sabores.
                Lista vazia não desenha nada — ficha plana não tem sub-receita, e um cartão
                dizendo "nenhuma" é o alerta inventado com outro rosto. */}
            {(lote.subRecipes ?? []).map((sub) => (
              <Text
                key={`${sub.name}-${sub.version}`}
                style={[type.body, { color: color.inkMuted, marginTop: space.xs }]}
              >
                {fill(t.app.lotLabel.withSub, { recipe: sub.name, version: String(sub.version) })}
              </Text>
            ))}
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
              {t.app.lotLabel.fromSheetWhy}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {/* A CORREÇÃO. Só aparece quando há ato para desfazer, e quando não dá ela
          diz por que em vez de ficar apagada esperando o toque. Âmbar porque o
          que ela responde é um impedimento, não uma perda. */}
      {plano ? (
        <Reveal index={iCorrecao}>
          {plano.alreadyReversed ? (
            <Card hue={color.warning} icon={tacho}>
              <Text style={[type.body, { color: color.ink }]}>{t.app.lotLabel.reverseAlready}</Text>
            </Card>
          ) : plano.blocked.length > 0 ? (
            <Card hue={color.warning} icon={tacho}>
              <Text style={[type.body, { color: color.ink }]}>
                {fill(t.app.lotLabel.reverseBlocked, {
                  items: plano.blocked
                    .map((b) =>
                      fill(t.app.lotLabel.reverseBlockedItem, {
                        name: b.name,
                        held: diga(b.held, b.baseUnit),
                        needed: diga(b.needed, b.baseUnit),
                      }),
                    )
                    .join(' · '),
                })}
              </Text>
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.lotLabel.reverseBlockedHint}
              </Text>
            </Card>
          ) : (
            // Fantasma e sem cartão em volta: corrigir é o caminho raro. Botão
            // grande e colorido convida, e ninguém deve ser convidado a
            // estornar - e uma caixa em volta de um botão só é caixa vazia.
            <Button label={t.app.lotLabel.reverse} variant="ghost" onPress={corrigir} />
          )}
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  sheet: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  middle: { textAlign: 'center' },
  code: { letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
  rule: { alignSelf: 'stretch', height: StyleSheet.hairlineWidth },
  facts: { alignSelf: 'stretch' },
});

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import {
  GlyphBox,
  GlyphChart,
  GlyphCount,
  GlyphKettle,
  GlyphLoss,
  GlyphPrice,
  GlyphProduction,
  GlyphPurchase,
  GlyphVehicle,
} from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import {
  CannotReverseError,
  ledgerExtract,
  SemPermissaoError,
  planReversal,
  reverseGroup,
  type ExtractAct,
} from '@/data/repository';
import type { MovementKind } from '@/domain/ledger';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import { fill, formatDayMonth, formatMoney, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O extrato: o livro-razão por ATO, e o caminho de volta de qualquer um deles.
 *
 * **Existe porque o conserto estava inalcançável.** Nove funções escrevem no razão
 * a partir de tela — compra, contagem, produção, transferência, devolução, perda,
 * conferência, leitura, e o próprio estorno — e o botão de desfazer existia em
 * DUAS (`app/lots/[id].tsx:133`, `app/inputs/[id].tsx:505`). A carga e a
 * transferência gravavam sem volta.
 *
 * A fundação promete *"corrige-se por estorno, nunca por exclusão"*, e ela estava
 * honrada no banco e fora do alcance de quem erra. Isso não é inconveniência: o
 * que uma pessoa faz numa fábrica quando não dá para consertar é **parar de
 * registrar**. Perde-se o dado, não o conserto — e todo o resto que este projeto
 * construiu para proteger um número só vale se alguém tocar na tela de manhã.
 *
 * **E é a mesma tela do extrato fiscal**, aprovada pelo dono em 6 de setembro:
 * uma lista de atos com data, o que mexeu e quanto valia. Uma tela, três
 * trabalhos — desfazer, conferir, e abrir a conta de qualquer saldo.
 *
 * **O dinheiro daqui não fecha com o saldo por lugar, e isso é de propósito.**
 * Aquela tela valoriza o estoque pelo custo médio de HOJE; esta soma o que cada
 * linha valia quando aconteceu. As duas estão certas e respondem perguntas
 * diferentes — e documento é o razão, porque a média muda e não assina nada. A
 * diferença aparece aqui, dita; escondê-la com um arredondamento conveniente
 * produziria o documento bonito, verde e falso que este repositório mais teme.
 *
 * A cena do cabeçalho é a de relatórios, e não uma nova: o extrato é o detalhe do
 * relatório, e a doutrina da assinatura desta casa diz que o mesmo assunto sai do
 * mesmo desenho.
 */
/**
 * O desenho de cada ESPÉCIE de ato — e ele existe por uma foto.
 *
 * A primeira versão punha o mesmo gráfico em todos os cartões, e a foto no
 * emulador devolveu seis ícones azuis idênticos empilhados. É a regra que o dono
 * ensinou com uma palavra — *"feio"* — sobre uma fileira de quatro lojas iguais:
 * **repetição regular lê como papel de parede, não como coisa.**
 *
 * E o conserto aqui paga duas vezes, porque o desenho passa a INFORMAR: quem
 * desce a lista vê pela coluna da esquerda o que é compra, o que é produção e o
 * que é perda, sem ler uma palavra. Cada glifo é o do assunto dele — os mesmos
 * que o resto do aplicativo usa para o mesmo assunto, que é o que a guarda da
 * assinatura cobra.
 */
const DESENHO: Record<MovementKind, (c: string, t: number) => ReactElement> = {
  purchase: (c, t) => <GlyphPurchase size={26} color={c} weight={t} />,
  production: (c, t) => <GlyphProduction size={26} color={c} weight={t} />,
  consumption: (c, t) => <GlyphKettle size={26} color={c} weight={t} />,
  transfer: (c, t) => <GlyphVehicle size={26} color={c} weight={t} />,
  sale: (c, t) => <GlyphPrice size={26} color={c} weight={t} />,
  loss: (c, t) => <GlyphLoss size={26} color={c} weight={t} />,
  return: (c, t) => <GlyphBox size={26} color={c} weight={t} />,
  adjustment: (c, t) => <GlyphCount size={26} color={c} weight={t} />,
  discrepancy: (c, t) => <GlyphCount size={26} color={c} weight={t} />,
  // O estorno não tem assunto próprio: ele é o gráfico, que é o assunto do extrato.
  reversal: (c, t) => <GlyphChart size={26} color={c} weight={t} />,
};

export default function ExtratoScreen() {
  const { t, locale } = useLocale();
  const { color, palette, space, type, traco } = useTheme();
  const confirm = useConfirm();
  const words = t.app.extract;

  /**
   * O extrato de UM lugar — o mesmo virado para fora.
   *
   * Sem parâmetro é o razão da fábrica inteira. Com ele, é o que aquela loja
   * recebeu e devolveu, que é a resposta de *"vocês mandaram mesmo isso?"* — uma
   * disputa se resolve com fato, e o fato já estava guardado, alcançável só
   * rolando o extrato inteiro.
   */
  const { lugar, nome } = useLocalSearchParams<{ lugar?: string; nome?: string }>();

  const [recusa, setRecusa] = useState<string | null>(null);

  /**
   * Quantos atos a tela pede — e ela DIZ quando parou de pedir.
   *
   * A primeira versão trazia quarenta e calava. O estudo deste extrato avisava
   * exatamente isso — *"paginação, nunca `.slice(0, 8)` silencioso"* — apontando o
   * defeito que já existe em `app/inputs/[id].tsx:964`, e eu troquei o 8 por 40 e
   * mantive o silêncio. Num extrato o corte calado é pior que numa lista qualquer:
   * quem não vê o ato não sabe que ele existe, e o que ele quer desfazer pode ser
   * justamente o quadragésimo primeiro.
   *
   * Pior ainda, o cursor `before` já estava construído na consulta e não tinha
   * chamador — a doença que o portão P1 persegue, aninhada num parâmetro em vez de
   * numa função.
   */
  const PAGINA = 40;
  const [quantos, setQuantos] = useState(PAGINA);

  const dados = useQuery(
    useCallback(
      () => ledgerExtract(empresaDaqui(), { limit: quantos, placeId: lugar }),
      [quantos, lugar],
    ),
  );
  const atos = dados.data ?? [];
  const podeHaverMais = atos.length >= quantos;

  const desfazer = useCallback(
    async (ato: ExtractAct) => {
      setRecusa(null);
      const plano = await planReversal(empresaDaqui(), ato.groupId);

      // Erro que IMPEDE, e diz o que fazer — não reclama depois do toque.
      if (plano.alreadyReversed) {
        setRecusa(words.alreadyUndone);
        return;
      }
      if (plano.blocked.length > 0) {
        setRecusa(
          fill(words.blocked, {
            items: plano.blocked
              .map((b) =>
                fill(words.blockedItem, {
                  name: b.name,
                  held: `${formatQuantity(b.held, locale)} ${b.baseUnit}`,
                  needed: `${formatQuantity(b.needed, locale)} ${b.baseUnit}`,
                }),
              )
              .join(' · '),
          }),
        );
        return;
      }

      // A confirmação diz o que vai acontecer com os números por extenso, e não
      // pergunta se tem certeza. Os dois lados: o que sai e o que volta.
      const sai = plano.legs.filter((l) => l.baseUnits < 0);
      const volta = plano.legs.filter((l) => l.baseUnits > 0);
      const diga = (l: { baseUnits: number; baseUnit: string; name: string }) =>
        fill(t.common.amountOf, {
          amount: `${formatQuantity(Math.abs(l.baseUnits), locale)} ${l.baseUnit}`,
          name: l.name,
        });

      const sim = await confirm({
        title: fill(words.undoTitle, { what: t.movement[ato.kind] }),
        message: fill(words.undoBody, {
          out: sai.map(diga).join(' · ') || words.nothing,
          back: volta.map(diga).join(' · ') || words.nothing,
        }),
        confirmLabel: words.undo,
        // Sem `destructive`: o estorno É o caminho de volta. Marcá-lo como
        // irrecuperável era o eixo invertido — ver o docblock do campo.
      });
      if (!sim) return;

      try {
        await reverseGroup(empresaDaqui(), { groupId: ato.groupId });
        dados.refresh();
      } catch (e) {
        // Três recusas diferentes, três frases — e a do meio é a que faltava. Sem
        // ela, quem não alcança desfazer lia "não deu para desfazer" e tentava de
        // novo: a Lei 5 quer que o erro impeça e diga a saída, e a saída aqui é
        // outra pessoa, não outra tentativa.
        setRecusa(
          e instanceof CannotReverseError
            ? words.alreadyUndone
            : e instanceof SemPermissaoError
              ? words.undoNotYours
              : words.undoFailed,
        );
      }
    },
    [confirm, dados, locale, t, words],
  );

  return (
    <CollapsingHeader
      cena="relatorios"
      title={words.title}
      // O nome do lugar na chamada, e não uma linha a mais: quem abriu o extrato
      // de uma loja precisa ver DE QUEM ele é antes de qualquer número, senão o
      // documento não serve para o que ele existe.
      overline={nome ? fill(words.ofPlace, { place: nome }) : words.overline}
      erro={dados.error}
      denovo={dados.refresh}
    >
      {recusa ? (
        <Reveal index={0}>
          <Card hue={color.danger}>
            <Text style={[type.body, { color: color.ink }]}>{recusa}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* "Está tudo bem" é estado válido: razão vazio é uma frase, não um vazio. */}
      {atos.length === 0 && !dados.loading ? (
        <Reveal index={1}>
          <Card icon={(c) => <GlyphChart size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.ink }]}>{words.empty}</Text>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {words.emptyHint}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {atos.map((ato, i) => (
        <Reveal key={ato.groupId} index={i + 2}>
          {/* O estorno usa o desenho do que ele DESFAZ, e não o próprio: assim ele
              se lê como par do ato que corrige, e o que os distingue é o tom calmo
              mais a legenda — não um desenho que ninguém saberia ler sozinho. */}
          <Card
            hue={ato.isReversal ? palette.mist : undefined}
            icon={(c) => DESENHO[ato.reversesKind ?? ato.kind](c, traco)}
          >
            {/* A manchete é O QUE mexeu, não a espécie — porque a espécie está no
                desenho ao lado, e seis "Compra" empilhados eram a mesma repetição
                que o glifo repetido. O que varia vai em cima; o que se repete vai
                embaixo ou vira figura. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Text style={[type.secondary, { color: color.ink, flex: 1 }]}>
                {ato.items.length > 0 ? ato.items.join(' · ') : t.movement[ato.kind]}
              </Text>
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {formatDayMonth(ato.occurredAt, locale)}
              </Text>
            </View>

            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {ato.isReversal
                ? fill(words.undoOf, { what: t.movement[ato.reversesKind ?? 'adjustment'] })
                : t.movement[ato.kind]}
              {ato.placeName ? ` — ${ato.placeName}` : ''}
              {/* QUEM, depois de ONDE, e só quando a empresa pediu para nomear.
                  A camada de dados devolve nulo com a chave desligada, então a tela
                  não pergunta nada: ela desenha o que veio. Nomeava-se ninguém desde
                  6 de setembro — a chave fazia o aparelho perguntar e gravar, e o
                  relatório continuava falando só de onde. */}
              {ato.operatorName ? ` · ${fill(words.recordedBy, { name: ato.operatorName })}` : ''}
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                marginTop: space.sm,
              }}
            >
              {/* O valor pela taxa CONGELADA. Sem o portão ele não existe — e não
                  existir é diferente de valer zero, que é um número que alguém soma. */}
              {ato.valueCents !== null ? (
                <Text style={[type.body, { color: color.ink }]}>
                  {formatMoney(ato.valueCents, locale)}
                </Text>
              ) : null}
              <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>
                {plural(ato.lines, words.lineCount)}
              </Text>

              {ato.reversed ? (
                <Chip label={words.undone} signal="neutral" />
              ) : ato.isReversal ? null : (
                <Touchable onPress={() => desfazer(ato)} accessibilityLabel={words.undo}>
                  <Text style={[type.caption, { color: color.danger, fontWeight: '600' }]}>
                    {words.undo}
                  </Text>
                </Touchable>
              )}
            </View>
          </Card>
        </Reveal>
      ))}

      {/* O fim da lista é dito, e não deduzido pelo silêncio. Quando não há mais,
          a frase também é dita — "isto é tudo" é informação, e uma lista que
          simplesmente para deixa a pessoa sem saber se acabou ou se foi cortada. */}
      {atos.length > 0 ? (
        <Reveal index={atos.length + 2}>
          {podeHaverMais ? (
            <Touchable
              onPress={() => setQuantos((n) => n + PAGINA)}
              accessibilityLabel={fill(words.more, { n: String(atos.length) })}
            >
              <Text
                style={[
                  type.body,
                  { color: palette.sky, fontWeight: '600', paddingVertical: space.md },
                ]}
              >
                {fill(words.more, { n: String(atos.length) })} →
              </Text>
            </Touchable>
          ) : (
            <Text style={[type.caption, { color: color.inkFaint, paddingVertical: space.md }]}>
              {/* `plural` e não `fill` com o número cru: a tela dizia "1 registros".
                  Este projeto extraiu `plural()` justamente porque a regra estava
                  copiada em dois lugares e ia virar o terceiro — e aqui ela tinha
                  sido esquecida de novo, num texto que só aparece quando a lista
                  acaba, que é onde ninguém olha duas vezes. */}
              {fill(words.allOfIt, { n: plural(atos.length, words.recordCount) })}
            </Text>
          )}
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

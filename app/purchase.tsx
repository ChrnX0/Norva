import { useLocalSearchParams, useRouter } from 'expo-router';
import { avisoDeFalha } from '@/i18n/falha';
import { ERROS } from '@/data/erros';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, priceSignal } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { UnitStepper } from '@/components/UnitStepper';
import { Field } from '@/components/Field';
import { campoComSugestao } from '@/components/campo';
import { GlyphPrice, GlyphPurchase, GlyphSack } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import {
  itemCosts,
  labels as loadLabels,
  listItems,
  listProducts,
  loadRecipeGraph,
  recordPurchase,
  type ItemWithCost,
  purchaseToBaseUnits,
  lastPurchaseOf,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import { fromDecimal, rate, type Rate, rateToDecimal, amountOf } from '@/domain/money';
import { applyCostEvent, judgePriceChange } from '@/domain/cost';
import { costPerProductUnit, packagingRatePerUnit, costRecipe } from '@/domain/recipe';
import { parseTyped } from '@/domain/number';
import { localDate } from '@/domain/day';
import { nowIso } from '@/data/db';

import { currencySymbol, fill, formatMoney, formatPercent, formatQuantity, plural } from '@/i18n';
import type { Dictionary, LocaleSettings } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { ALVO } from '@/theme/tokens';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * As respostas para "quando você pediu", em dias atrás.
 *
 * `null` é "não sei" e vem primeiro porque é o padrão. O resto cobre o que uma
 * fábrica lembra sem olhar papel: hoje, ontem, anteontem, três dias, uma semana.
 * Mais que isso ninguém responde de cabeça, e um campo de data aberto seria o
 * teclado que esta casa evita no chão de fábrica.
 */
const QUANDO_PEDIU: readonly (number | null)[] = [null, 0, 1, 2, 3, 7];

/**
 * Entering an invoice - the most valuable screen in the app per keystroke.
 *
 * "Update the price of sugar" never becomes a task here. The buyer records what
 * they paid, and the same event moves the moving average, writes the price
 * history and recalculates every recipe that uses the item. One entry, five
 * consequences, none of them typed by anybody.
 *
 * The comparison against the last invoice shows up *while the decision is still
 * open* - standing in front of the supplier - not in a report next month. Law
 * 4: warn on the date of the decision, not on the date of the problem.
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`), e
 * o layout anterior saiu inteiro em vez de ganhar um caminho ao lado. O que saiu,
 * item por item, porque cada peça era vocabulário de outro aplicativo: uma fita
 * de pastilhas desenhada à mão — `borderWidth`, `borderRadius: 999` e um
 * `${accent}18` de fundo — que no Papel virava justamente a "caixa" que o dono
 * circulou; quatro `Card tone="area"` sem crachá nenhum, então a tela inteira era
 * parágrafo cinza sem um desenho para dizer de que assunto se falava; e a lista
 * do impacto montada linha por linha com `StyleSheet` local, que é o `ListRow`
 * reimplementado pior.
 *
 * O que existe agora são três leituras, na ordem em que a compra se decide:
 * **o que chegou** (qual insumo, quantos e por quanto — o saco), **antes de
 * fechar** (a nota contra a anterior, enquanto o fornecedor ainda está na porta)
 * e **o que a nota mexeu** (o custo por unidade de cada produto, depois de
 * gravar). Nenhuma caixa é desenhada aqui: `Card`, `Field`, `Chip`, `Button` e
 * `ListRow` já viram régua no Papel e bloco no Orgânico.
 *
 * O tom é `palette.sky` porque o assunto é dinheiro — a nota move o custo, e é
 * isso que a tela existe para fazer. A área continua `sage`, que é compras: o
 * acento do cabeçalho responde "onde estou", o tom do cartão responde "do que se
 * fala aqui", e as duas perguntas são diferentes.
 */
export default function PurchaseScreen() {
  return (
    <AreaProvider area="sage">
      <PurchaseForm />
    </AreaProvider>
  );
}

/** What one recorded invoice did to the cost of the things made from it. */
type Impact = { name: string; before: number; after: number };

function PurchaseForm() {
  const { color, type, space, palette, traco } = useTheme();
  const confirm = useConfirm();
  const { locale, t } = useLocale();
  const router = useRouter();

  /**
   * O que dá para comprar, e quantos itens existem — que são duas perguntas.
   *
   * A consulta devolvia só a lista filtrada, e o estado vazio dizia "Nada
   * cadastrado ainda." Com um insumo cadastrado sem `purchaseToBase`, a frase
   * era falsa: existe o insumo, ele só não tem como entrar numa nota ainda. E o
   * caminho é o que o próprio aplicativo oferece — o assistente cria o item
   * quando não consegue ler o tamanho da embalagem e diz "dá para completar
   * depois na tela".
   */
  const { data, loading, error, refresh } = useQuery(() =>
    // **Da EMPRESA de propósito, e não da unidade.** Este saldo alimenta a média
    // móvel do custo, e a decisão de 1 de setembro é escrita: *"o mesmo grama de
    // açúcar não custa uma coisa na câmara e outra no almoxarifado"*. Recortar por
    // unidade aqui daria dois custos para o mesmo insumo e quebraria a margem para
    // consertar um saldo que esta tela não mostra.
    listItems(empresaDaqui()).then((all) => ({
      /**
       * O que dá para comprar — e a REVENDA entra, que é o buraco achado em 11 de
       * setembro indo conferir o picolé "Top" da fábrica do pai do dono.
       *
       * Um produto de revenda podia ser cadastrado e nunca comprado: `saveProduct` grava
       * o item com `purchaseToBase: null` chumbado, e esta lista só oferecia quem tinha
       * aquele campo. O Top ficava na grade e não aparecia aqui — sem nota, sem custo,
       * sem entrar em estoque. E não havia porta lateral: o almoxarifado cadastra só
       * insumo, embalagem e material de loja.
       *
       * Não precisa de `purchaseToBase`: `purchaseToBaseUnits` usa `?? 1`, e a conversão
       * de verdade vem dos DEGRAUS que o produto já declara — 44 por caixa, e o dono
       * compra *"caixa ou unidade mesmo"*. Repetir o número num segundo campo seria
       * convidar os dois a divergirem.
       */
      compraveis: all.filter((i) => i.purchaseToBase !== null || i.kind === 'resale'),
      cadastrados: all.length,
    })),
  );

  // Arriving from an item opens on that item, so the buyer does not hunt for
  // what they were already looking at.
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(itemId ?? null);
  /**
   * O que foi DIGITADO, por insumo — e o valor do campo é derivado disto.
   *
   * A primeira versão semeava os campos num `useEffect` com `setSupplier`, e a régua do
   * React recusou: *"calling setState synchronously within an effect can trigger cascading
   * renders"*. Ela está certa por um motivo que vai além de desempenho — sincronizar dois
   * estados obriga a responder "quem ganha" em cada ordem de chegada, e a resposta sempre
   * esquece um caso. Aqui era: apagar o fornecedor sugerido e vê-lo voltar.
   *
   * Derivado não tem esse problema. `undefined` quer dizer *ninguém digitou nada aqui*, e
   * aí vale a sugestão; **string vazia é uma digitação** — quem apagou o nome fica com o
   * campo vazio. E o `id` amarra o rascunho ao insumo: trocar de insumo larga o que foi
   * digitado para o anterior e pega a sugestão do novo, sem efeito nenhum e sem um
   * `setState` fora de um toque.
   */
  const [digitado, setDigitado] = useState<{
    id: string;
    supplier?: string;
    quantity?: string;
  }>({ id: '' });
  /**
   * Há quantos dias o pedido foi feito — `null` é "não sei", que é o padrão.
   *
   * Em dias e não em data porque o teclado de data não existe nesta casa: as
   * telas perguntam "amanhã, +2, +7" e a pessoa toca. Aqui é o espelho disso,
   * para trás, e o que o banco recebe é a data calculada.
   */
  const [pedidoHaDias, setPedidoHaDias] = useState<number | null>(null);

  const [total, setTotal] = useState('');
  /**
   * O frete, e ele é OPCIONAL porque o dono disse que os dois jeitos valem.
   *
   * Perguntado em 11 de setembro se o custo da revenda é só a nota ou tem entrega por
   * fora: *"pode ser dos dois jeitos q vc falou"*. A regra desta casa manda construir os
   * dois caminhos em vez de escolher — e aqui os dois não viram configuração da empresa,
   * porque frete varia por ENTREGA e não por fábrica: uma semana o fornecedor traz, na
   * outra você busca. Campo vazio é a resposta "só a nota", e é uma resposta, não uma
   * lacuna.
   *
   * O que ele muda é o CUSTO POR UNIDADE, que é o número que decide preço e margem: um
   * engradado de Top a R$ 200 com R$ 30 de frete custa R$ 230, e chamar isso de R$ 200
   * faz a margem parecer maior do que é. O livro-razão guarda um valor só — o que foi
   * pago —, que é o certo: frete não é outro movimento, é parte do que aquele item custou
   * para estar aqui.
   */
  const [frete, setFrete] = useState('');
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<Impact[] | null>(null);

  const items = data?.compraveis ?? [];
  const selected: ItemWithCost | null =
    items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const num = (s: string) => parseTyped(s) ?? NaN;

  /**
   * A última nota deste insumo, para os dois campos não nascerem vazios.
   *
   * **Duas colunas tinham escritor e nenhum leitor, e as duas guardavam a resposta que
   * esta tela pedia em branco.** `supplier_name` era digitado a cada nota e
   * `purchase_quantity` gravado desde a `0002`; aqui o fornecedor abria com `''` e a
   * quantidade com `'1'`. A Lei 1 proíbe pedir o que o sistema pode deduzir e a Lei 2
   * proíbe campo vazio — as duas violadas pelo próprio dado do aplicativo.
   *
   * Numa fábrica o mesmo insumo vem do mesmo fornecedor quase sempre, em pacote do mesmo
   * tamanho. Digitar "Distribuidora Aurora" de luva, no celular, toda semana, é o atrito
   * que faz a nota não ser lançada — e nota não lançada é a média de custo errada embaixo
   * de todo número de dinheiro do aplicativo.
   */
  const { data: ultima, loading: buscandoUltima } = useQuery(
    () => (selected ? lastPurchaseOf(empresaDaqui(), selected.id) : Promise.resolve(null)),
    selected?.id ?? '',
  );

  /**
   * Enquanto a consulta do insumo novo não voltou, `ultima` ainda é a do ANTERIOR — então
   * ela não vale. Sugerir o fornecedor do açúcar para a polpa por meio segundo é pior que
   * não sugerir nada, porque a pessoa já começou a ler.
   */
  const idAtual = selected?.id ?? '';
  const sugestao = buscandoUltima ? null : ultima;
  const meu = digitado.id === idAtual ? digitado : null;

  const digitar = (campo: 'supplier' | 'quantity') => (valor: string) =>
    setDigitado({ ...(meu ?? {}), id: idAtual, [campo]: valor });

  /**
   * A régua mora em `src/components/campo.ts`, e o motivo é uma prova que falhou.
   *
   * Escrevi a distinção aqui na tela e uma checagem de navegador para ela — "apagar o
   * fornecedor sugerido fica apagado". Trocando o `??` por `||`, que é exatamente o defeito
   * que ela nomeia, **a checagem continuou verde**: o `input` controlado não repõe o texto
   * apagado quando o valor calculado não muda. No `TextInput` do Android repõe, e o
   * docblock de `campo.ts` já contava essa história do outro lado.
   *
   * Então a régua saiu daqui para onde ela é decidível, com as cinco respostas provadas uma
   * por uma. A tela ficou com o que é dela: qual pergunta faz a qual campo.
   */
  const doFornecedor = campoComSugestao(meu?.supplier, sugestao?.supplierName ?? null);
  const daQuantidade = campoComSugestao(
    meu?.quantity,
    sugestao && sugestao.packs > 0 ? String(sugestao.packs) : null,
    '1',
  );
  const supplier = doFornecedor.valor;
  const quantity = daQuantidade.valor;
  /**
   * A quantidade digitada some no arredondamento — e a tela DIZ, em vez de só não fazer nada.
   *
   * O `draft` já devolve nulo nesse caso, então o botão não dispara: é a Lei 5, o erro
   * IMPEDINDO. Mas impedir calado é o outro extremo — a pessoa digita `0,4`, toca, e nada
   * acontece. Então a linha embaixo do campo diz o que fazer.
   */
  const someNoArredondamento = (() => {
    if (!selected) return false;
    const pacotes = num(quantity);
    return Number.isFinite(pacotes) && pacotes > 0 && purchaseToBaseUnits(selected, pacotes) <= 0;
  })();

  const sugeriuFornecedor = doFornecedor.ehSugestao;
  const sugeriuQuantidade = daQuantidade.ehSugestao;

  /**
   * Contar pelos DEGRAUS do produto, e não pela embalagem de compra.
   *
   * Quem tem `purchaseToBase` declarou uma embalagem de compra — "saco de 25 kg" — e a
   * pergunta certa é "quantos sacos". Quem não tem, mas tem mais de um degrau, é produto
   * de revenda: a caixa não é como ele é comprado, é como ele é contado, e é a mesma
   * peça que a produção e a separação usam.
   */
  const porDegraus =
    !!selected && selected.purchaseToBase === null && selected.packaging.tiers.length > 1;

  const draft = useMemo(() => {
    if (!selected) return null;

    const packs = num(quantity);
    const nota = num(total);
    if (!Number.isFinite(packs) || packs <= 0) return null;
    if (!Number.isFinite(nota) || nota <= 0) return null;
    // Vazio é "só a nota", e não zero digitado: `parseTyped` devolve nulo para vazio, e
    // somar `NaN` apagaria o total inteiro em silêncio.
    const entrega = num(frete);
    const paid = nota + (Number.isFinite(entrega) && entrega > 0 ? entrega : 0);

    // The conversion lives in one place. This screen used to do its own
    // `Math.round(packs * factor)` while the repository exported the same rule
    // to nobody: two implementations that agree today and diverge the first
    // time one of them is corrected, with nothing to say which is right.
    const baseUnits = purchaseToBaseUnits(selected, packs);
    // Pacote maior que zero não garante unidade-base maior que zero: `purchaseToBaseUnits`
    // arredonda, e num item comprado na própria unidade-base `0,4` dá ZERO. Sem esta linha a
    // nota entrava aqui e o servidor a recusava para sempre, travando a fila calada.
    if (baseUnits <= 0) return null;
    const totalCents = fromDecimal(paid);
    // Guardado em centavos, e não recalculado na tela: o arredondamento acontece uma vez,
    // aqui, como em todo o resto deste aplicativo.
    const freteCents = fromDecimal(paid) - fromDecimal(nota);

    // What this invoice alone costs per base unit, and where it lands the
    // average once it blends with what is already on hand.
    const thisRate = rate(paid, baseUnits);
    /**
     * A média de partida — e `?? 0` aqui é a mesma coisa que "insumo sem nota".
     *
     * Esta tela é a única em que o dinheiro é DIGITADO pela pessoa: a nota é dela
     * e não há o que esconder do que ela mesma escreveu. O que vem do banco é a
     * média anterior, e é só ela que o portão esconde — a frase que a anuncia sai
     * mais abaixo. Não existe capacidade própria de "lançar compra" no vocabulário
     * (`src/domain/access.ts` tem doze valores e nenhum deles é isso), então quem
     * compra é quem vê custo, por construção; se um dia houver, o enum do servidor
     * muda junto e o `src/sync/agreement.test.ts` cobra as duas metades.
     */
    const after = applyCostEvent(
      { baseUnits: selected.onHandBaseUnits, averageRate: selected.averageRate ?? rate(0, 1) },
      { kind: 'purchase', baseUnits, totalCents, at: new Date().toISOString() },
    );

    const previous = selected.lastRate;
    const change = previous && previous > 0 ? (thisRate - previous) / previous : null;

    return {
      packs,
      paid,
      // Only for the sentence that spells the conversion out loud; the maths
      // above no longer touches it.
      factor: selected.purchaseToBase ?? 1,
      baseUnits,
      totalCents,
      freteCents,
      thisRate,
      after,
      previous,
      change,
    };
  }, [selected, quantity, total, frete]);

  // How this price should be read, decided in one place that has a test rather
  // than by three copies of the same threshold inside the markup below.
  const verdict = draft && draft.change !== null ? judgePriceChange(draft.change) : null;

  const perPackNow = draft ? draft.paid / draft.packs : 0;
  const perPackBefore =
    selected?.lastRate && selected.purchaseToBase
      ? rateToDecimal((selected.lastRate * selected.purchaseToBase) as Rate)
      : null;

  const onSave = async () => {
    if (!selected || !draft) return;

    const go = await confirm({
      title: t.app.purchase.confirmTitle,
      // A conta ABRE quando há frete, porque R$ 230 é conclusão de 200 + 30 e a Lei 6
      // desta casa diz que toda conclusão abre a conta. Sem isto a pessoa digita dois
      // números e a confirmação mostra um terceiro, sem dizer de onde ele veio — que é
      // exatamente o tipo de silêncio que faz alguém parar de ler confirmação.
      message: fill(
        draft.freteCents > 0 ? t.app.purchase.confirmBodyFreight : t.app.purchase.confirmBody,
        {
          packs: formatQuantity(draft.packs, locale),
          pack: selected.purchaseUnit ?? t.units.unit.one,
          name: selected.name,
          total: formatMoney(draft.totalCents, locale),
          invoice: formatMoney(draft.totalCents - draft.freteCents, locale),
          freight: formatMoney(draft.freteCents, locale),
        },
      ),
      confirmLabel: t.app.purchase.confirmAction,
      cancelLabel: t.app.confirm.adjust,
    });
    if (!go) return;

    setSaving(true);
    try {
      setImpact(
        await recordAndMeasure(
          selected,
          draft.packs,
          draft.baseUnits,
          draft.totalCents,
          supplier,
          pedidoHaDias,
          locale.timeZone,
        ),
      );
      setTotal('');
      setFrete('');
      // Largar o rascunho em vez de voltar a quantidade para "1": o `refresh` abaixo relê a
      // última nota, que agora é ESTA — então os dois campos voltam já preenchidos com o que
      // acabou de ser lançado, que é o palpite certo para a linha seguinte da mesma nota.
      setDigitado({ id: '' });
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.purchase.failed,
        message: avisoDeFalha(e, t, ERROS).message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * A cascata não pula número, e dois dos três blocos são condicionais.
   *
   * O juízo do preço só existe depois de a pessoa digitar quanto pagou, e o
   * impacto só existe depois de gravar. Índice fixo deixaria um vão de quarenta
   * milissegundos no meio da entrada — a tela montaria com um degrau que não
   * corresponde a bloco nenhum.
   */
  const mostraJuizo = Boolean(draft && selected);
  const mostraImpacto = Boolean(impact && impact.length > 0);
  const indiceImpacto = mostraJuizo ? 2 : 1;
  const indiceAcao = indiceImpacto + (mostraImpacto ? 1 : 0);

  if (loading) {
    return (
      <CollapsingHeader
        cena="compras"
        title={t.app.purchase.title}
        overline={t.app.purchase.overline}
        erro={error}
        denovo={refresh}
      >
        <Reveal index={0}>
          <Card hue={palette.mint} icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}>
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.purchase.openingStoreroom}
            </Text>
          </Card>
        </Reveal>
      </CollapsingHeader>
    );
  }

  return (
    <CollapsingHeader cena="compras" title={t.app.purchase.title} overline={t.app.purchase.overline}>
      {/* O QUE CHEGOU. Um assunto só, num cartão só: qual insumo, quantos e por
          quanto são as três linhas da mesma linha da nota, e separá-las em dois
          cartões fazia a pessoa olhar duas caixas para escrever uma frase.
          A fita de escolha é palavra, não pastilha — o nome do insumo acende no
          tom do assunto e engorda; o resto do desenho é espaço, que é como uma
          página impressa separa. */}
      <Reveal index={0}>
        {selected ? (
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={t.app.purchase.whatYouBought}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: space.lg }}>
                {items.map((item) => {
                  const active = item.id === selected.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSelectedId(item.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={item.name}
                      style={{ paddingVertical: space.sm, minHeight: ALVO, justifyContent: 'center' }}
                    >
                      <Text
                        style={[
                          type.secondary,
                          {
                            color: active ? palette.sky : color.inkMuted,
                            fontWeight: active ? '600' : '400',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            {/* Os campos, na ordem em que a nota é lida: de quem, quanto veio,
                quanto deu. Formulário continua formulário — cada `Field` explica
                embaixo o que o sistema já deduziu do que foi digitado, que é onde
                a inteligência aparece sem pedir nada a mais. */}
            <View style={{ gap: space.lg, marginTop: space.md }}>
              <Field
                label={t.app.purchase.supplier}
                value={supplier}
                onChangeText={digitar('supplier')}
                placeholder={t.app.purchase.supplierPlaceholder}
                hint={sugeriuFornecedor ? t.app.purchase.fromLastInvoice : undefined}
              />

              {/* Quando o pedido foi feito.
                  A única pergunta desta tela que o sistema não pode deduzir — a data
                  do telefonema para o fornecedor não está no razão —, e é por isso
                  que perguntar aqui não fere a Lei 1. "Não sei" nasce marcado: é o
                  estado de hoje, e obrigar resposta trocaria uma lacuna honesta por um
                  número inventado. */}
              <View style={{ gap: space.sm }}>
                <Text style={[type.overline, { color: color.inkFaint }]}>
                  {t.app.purchase.orderedWhen.toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {QUANDO_PEDIU.map((dias) => {
                    const rotulo = rotuloDoPedido(dias, t, locale);
                    return (
                      <Pressable
                        key={String(dias)}
                        onPress={() => setPedidoHaDias(dias)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: pedidoHaDias === dias }}
                        accessibilityLabel={rotulo}
                      >
                        <Chip signal={pedidoHaDias === dias ? 'ok' : 'neutral'} label={rotulo} />
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {t.app.purchase.orderedWhenHint}
                </Text>
              </View>
              {/* Quem tem degraus conta neles; quem tem embalagem de compra conta na
                  embalagem. São duas perguntas diferentes e por isso duas peças:
                  "quantos sacos de 25 kg" é o insumo, e o saco é a unidade de COMPRA;
                  "quantas caixas de 44" é a revenda, e a caixa é um degrau do próprio
                  produto. O dono compra o Top em "caixa ou unidade mesmo". */}
              {porDegraus ? (
                <>
                  <Text style={[type.overline, { color: color.inkFaint }]}>
                    {fill(t.app.purchase.howMany, { pack: t.units.unit.other })}
                  </Text>
                  <UnitStepper
                    hierarchy={selected.packaging}
                    locale={locale}
                    tierLabel={(id, n) =>
                      plural(n, t.units[id as keyof typeof t.units] ?? t.units.unit)
                    }
                    value={num(quantity) || 0}
                    onChange={(n) => digitar('quantity')(String(n))}
                    labels={t.stepper}
                    digitavel
                    rotulo={fill(t.app.purchase.howMany, { pack: t.units.unit.other })}
                  />
                </>
              ) : (
                <Field
                  label={fill(t.app.purchase.howMany, {
                    pack: selected.purchaseUnit ?? t.units.unit.other,
                  })}
                  value={quantity}
                  onChangeText={digitar('quantity')}
                  keyboardType="numeric"
                  hint={
                    draft
                      ? fill(t.app.purchase.conversion, {
                          packs: formatQuantity(draft.packs, locale),
                          factor: formatQuantity(draft.factor, locale),
                          baseUnits: formatQuantity(draft.baseUnits, locale),
                          unit: selected.baseUnit,
                        })
                      : someNoArredondamento
                        ? fill(t.app.purchase.roundsToNothing, { unit: selected.baseUnit })
                        : // A conversão só existe com a nota digitada; até lá o que a linha
                          // tem a dizer é de onde veio o número que já está no campo.
                          sugeriuQuantidade
                        ? t.app.purchase.fromLastInvoice
                        : undefined
                  }
                />
              )}
              <Field
                label={t.app.purchase.freight}
                value={frete}
                onChangeText={setFrete}
                placeholder="0,00"
                suffix={currencySymbol(locale)}
                keyboardType="numeric"
                hint={t.app.purchase.freightHint}
              />
              <Field
                label={t.app.purchase.total}
                value={total}
                onChangeText={setTotal}
                placeholder="118,00"
                suffix={currencySymbol(locale)}
                keyboardType="numeric"
                hint={
                  draft
                    ? fill(t.app.purchase.perPack, {
                        price: formatMoney(fromDecimal(perPackNow), locale),
                        pack: selected.purchaseUnit ?? t.units.unit.one,
                      })
                    : undefined
                }
              />
            </View>
          </Card>
        ) : (
          /* Nada para comprar ainda, e isso é estado válido: o desenho do
             assunto e a frase, sem tom de alerta. Um cartão vermelho no primeiro
             dia de uso é alerta inventado. */
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={t.app.purchase.whatYouBought}
          >
            <Text style={[type.body, { color: color.ink }]}>
              {(data?.cadastrados ?? 0) > 0
                ? t.app.purchase.noneBuyable
                : t.app.inputs.empty.input}
            </Text>
            {/* E a próxima ação, porque estado vazio é desenho, frase e saída —
                nos dois casos o caminho é o mesmo cadastro. */}
            <View style={{ marginTop: space.md }}>
              <Button
                label={t.app.inputs.addNew}
                variant="ghost"
                onPress={() => router.push('/inputs')}
              />
            </View>
          </Card>
        )}
      </Reveal>

      {/* ANTES DE FECHAR. O único número grande da tela, e ele nunca aparece
          sozinho: a linha de baixo diz quanto é agora e quanto era na compra
          anterior, e o crachá diz como ler isso em uma frase. O cartão vira
          âmbar quando subiu bem acima do normal — a cor é o aviso na data da
          decisão, com o fornecedor ainda na porta. */}
      {draft && selected ? (
        <Reveal index={1}>
          <Card
            hue={verdict === 'wellAbove' ? color.warning : palette.sage}
            icon={(c) => <GlyphPurchase size={26} color={c} weight={traco} />}
          >
            <Text style={[type.overline, { color: color.inkFaint }]}>
              {t.app.purchase.beforeClosing}
            </Text>

            {draft.change === null || perPackBefore === null ? (
              <Text style={[type.secondary, { color: color.inkMuted, marginTop: space.xs }]}>
                {t.app.purchase.firstPurchase}
              </Text>
            ) : (
              <>
                <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
                  {draft.change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(draft.change), locale)}
                </Text>
                <Text style={[type.secondary, { color: color.inkMuted }]}>
                  {fill(t.app.purchase.nowVsBefore, {
                    now: formatMoney(fromDecimal(perPackNow), locale),
                    before: formatMoney(fromDecimal(perPackBefore), locale),
                  })}
                </Text>
                <View style={{ marginTop: space.md }}>
                  {/* The verdict names the key; the dictionary writes the words.
                      Three languages, one rule, and the rule is tested. */}
                  <Chip
                    signal={priceSignal(verdict)}
                    label={verdict ? t.app.purchase[verdict] : t.app.purchase.smallChange}
                  />
                </View>
              </>
            )}

            {/* Para onde a média anda — e ela vem do banco, não do teclado.
                Sem custo a frase sai inteira: dizer "de R$ 0,00 para R$ 0,00"
                seria anunciar que a nota não move nada. */}
            {selected.averageRate === null ? null : (
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
                {fill(t.app.purchase.averageMoves, {
                  name: selected.name,
                  from: formatMoney(amountOf(selected.averageRate, 1_000), locale),
                  to: formatMoney(amountOf(draft.after.averageRate, 1_000), locale),
                  unit: selected.baseUnit,
                })}
              </Text>
            )}
          </Card>
        </Reveal>
      ) : null}

      {/* O QUE A NOTA MEXEU. A conta que abre a conclusão de cima (Lei 6): cada
          produto com o que a unidade dele custava e o que passou a custar. É
          `ListRow` e não linha montada à mão — a coluna da direita já vem em
          algarismo tabular, que é o que permite comparar quatro produtos de
          relance. Sem desenho por linha: ícone em toda linha vira papel de
          parede e para de ser visto. */}
      {impact && impact.length > 0 ? (
        <Reveal index={indiceImpacto}>
          <Card
            hue={palette.sky}
            icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
            title={t.app.purchase.whatItMoved}
          >
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.purchase.nobodyUpdated}
            </Text>
            {impact.map((row) => (
              <ListRow
                key={row.name}
                label={row.name}
                trailing={`${formatMoney(row.before, locale)} → ${formatMoney(row.after, locale)}`}
                trailingTone={row.after > row.before ? 'warning' : 'ok'}
              />
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* A ação provável, embaixo e uma só, com a marca do assunto dentro dela:
          o botão diz de que se trata antes de ser lido. */}
      <Reveal index={indiceAcao}>
        <Button
          label={saving ? t.app.purchase.recording : t.app.purchase.record}
          onPress={() => void onSave()}
          disabled={!draft || saving}
          icon={(c) => <GlyphPurchase size={22} color={c} weight={traco} />}
          weighty
        />
      </Reveal>
    </CollapsingHeader>
  );
}

/**
 * Records the invoice and then measures what it did.
 *
 * The measurement is taken by costing the products before and after with the
 * same engine the recipe screen uses - not by a second formula written here,
 * which would eventually disagree with the first one.
 */
async function recordAndMeasure(
  item: ItemWithCost,
  packs: number,
  baseUnits: number,
  totalCents: ReturnType<typeof fromDecimal>,
  supplier: string,
  /** Há quantos dias o pedido foi feito; `null` quando ninguém sabe. */
  pedidoHaDias: number | null,
  timeZone: string,
): Promise<Impact[]> {
  const [recipesBefore, costsBefore, products, names] = await Promise.all([
    loadRecipeGraph(empresaDaqui()),
    itemCosts(empresaDaqui()),
    listProducts(empresaDaqui()),
    loadLabels(empresaDaqui()),
  ]);

  const unitCost = (costs: Record<string, Rate>) =>
    products.map((product) => {
      if (!product.recipeId || !product.yieldPerUnit) return { name: product.name, value: 0 };
      const cost = costRecipe(product.recipeId, recipesBefore, costs, names);
      return {
        name: product.name,
        value: costPerProductUnit(cost, product.yieldPerUnit, {
          typedRate: product.unitPackagingRate ?? undefined,
          itemsRate: packagingRatePerUnit(product.packagingItems, costs),
        }),
      };
    });

  /**
   * O impacto é dinheiro do começo ao fim — "o picolé passou de X para Y".
   *
   * Sem o portão aberto não sobra nada dele, então a lista volta vazia e a tela
   * segue sem a seção. A NOTA continua sendo lançada e a média continua andando
   * certo: o que fica de fora é só a medição, que é o que a pessoa não pode ver.
   */
  const before = costsBefore === null ? [] : unitCost(costsBefore);

  await recordPurchase(empresaDaqui(), {
    itemId: item.id,
    supplierName: supplier.trim() || undefined,
    purchaseQuantity: packs,
    baseUnits,
    totalCents,
    // Sem resposta, nada é gravado: `ordered_at` continua nulo e `deliveriesOf`
    // ignora a nota. Uma lacuna vazia é mais honesta que um palpite.
    orderedAt:
      pedidoHaDias === null
        ? undefined
        : `${localDate(nowIso(), timeZone, -pedidoHaDias)}T00:00:00.000Z`,
  });

  if (costsBefore === null) return [];
  const after = unitCost((await itemCosts(empresaDaqui())) ?? {});

  return before
    .map((row, index) => ({ name: row.name, before: row.value, after: after[index].value }))
    .filter((row) => row.before !== row.after);
}

/** A palavra de cada resposta. Quem escreve português é a tela, e é aqui. */
function rotuloDoPedido(
  dias: number | null,
  t: Dictionary,
  locale: LocaleSettings,
): string {
  if (dias === null) return t.app.purchase.orderedUnknown;
  if (dias === 0) return t.app.purchase.orderedToday;
  // "Ontem" e não "Há 1 dia": a foto mostrou a diferença entre a palavra da
  // pessoa e a do sistema, e esta tela é lida por quem está com a nota na mão.
  if (dias === 1) return t.app.purchase.orderedYesterday;
  return fill(t.app.purchase.orderedDaysAgo, {
    days: plural(dias, t.app.home.dayCount, formatQuantity(dias, locale)),
  });
}

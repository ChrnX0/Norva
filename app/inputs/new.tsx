import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphPlus, GlyphSack } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { packSize } from '@/domain/measure';
import { findItem, recordPurchase, saveItem, type ItemKind } from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { fromDecimal, rate } from '@/domain/money';
import { parseTyped, formatTyped } from '@/domain/number';
import { currencySymbol, fill, formatMoney, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Registering an input.
 *
 * The screen exists to capture one thing correctly that most systems get
 * quietly wrong: sugar is *bought* in a 25 kg sack and *used* in 350 g doses.
 * Without the conversion factor the cost is off by three orders of magnitude
 * and nothing on screen says so.
 *
 * So the person types what they actually hold - "25kg sack", "R$ 118" - and the
 * app does the division in front of them, in the hint, as they type. They
 * confirm a number instead of computing one (Law 1: never ask for what the
 * system can work out).
 *
 * **O corpo foi reescrito na língua da capa** (`docs/linguagem.md`), e o layout
 * anterior saiu inteiro em vez de ganhar um caminho ao lado — era ele que fazia
 * esta tela parecer de outro aplicativo no toque seguinte:
 *
 * - eram três `Card tone="area"` sem crachá e sem tom de assunto, ou seja três
 *   retângulos iguais um embaixo do outro. Agora cada cartão diz do que trata
 *   antes de ser lido: o cadastro em `mint` com o mais, a compra em `mint` com o
 *   saco — que é o desenho mais literal do aplicativo inteiro, porque o que se
 *   compra é um saco de 25 kg — e a conversão em `sky`, que é o tom do dinheiro
 *   em toda tela;
 * - o tipo do item eram três `Button`, um deles primário. Botão primário é a
 *   ação da tela e só existe um: com quatro na página, "salvar" deixava de ser
 *   o destino óbvio. Escolha se faz tocando a etiqueta, que é o mesmo gesto do
 *   sabor em `app/production/new.tsx` e do tipo de lugar em `app/places.tsx`, e
 *   as duas caras saem certas de graça;
 * - o cabeçalho do cartão de compra era `type.cardTitle` escrito à mão dentro do
 *   corpo, com o subtítulo abaixo. Título de cartão é do `Card`, junto do
 *   crachá — escrito à mão ele fica sem desenho no Orgânico e sem régua no
 *   Papel;
 * - e o cartão do "preencha a embalagem e o preço" deixou de existir. Cartão que
 *   não tem número não vira cartão: a frase virou a dica do campo de preço, que
 *   é onde falta o dado que ela pede. É a mesma frase, na mesma condição — o
 *   `conversionHint` só é indefinido quando a conta não fecha.
 *
 * Nada aqui decide diferente: consulta, conta, confirmação e gravação são as
 * mesmas linhas de antes.
 */
export default function InputsScreen() {
  // Cadastrar insumo é ESTOQUE, não ajuste. Estava declarado na área dos
  // Ajustes, e o accent pinta a marca do cabeçalho, o campo em foco e o botão
  // cheio — então a porta de entrada do almoxarifado abria cinza, com o botão
  // cinza, no meio de um aplicativo em que verde quer dizer estoque.
  return (
    <AreaProvider area="mint">
      <InputForm />
    </AreaProvider>
  );
}

type Draft = {
  kind: Extract<ItemKind, 'input' | 'packaging' | 'store_supply'>;
  name: string;
  purchaseUnit: string;
  purchaseToBase: string;
  baseUnit: string;
  price: string;
  /** O nível cheio, que é a régua das faixas de cor. Vazio: o item não ganha faixa. */
  fullLevel: string;
};

/** Order only; the words are in the dictionary, keyed the same way. */
const KINDS: {
  kind: Extract<ItemKind, 'input' | 'packaging' | 'store_supply'>;
  key: 'input' | 'packaging' | 'storeSupply';
}[] = [
  { kind: 'input', key: 'input' },
  { kind: 'packaging', key: 'packaging' },
  { kind: 'store_supply', key: 'storeSupply' },
];

function InputForm() {
  const { color, type, space, palette, traco } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();
  const words = t.app.inputForm;

  /**
   * The same screen registers and corrects.
   *
   * A typo in a name used to be permanent: deleting is refused once a purchase
   * points at the row, and rightly so. One form with an id is a much smaller
   * thing to maintain than two that drift apart.
   */
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);

  const { data: existing } = useQuery(
    async () => (id ? findItem(LOCAL_COMPANY_ID, id) : null),
    id ?? '',
  );

  const [draft, setDraft] = useState<Partial<Draft> | null>(null);

  const form: Draft = {
    kind: 'input',
    name: '',
    purchaseUnit: '',
    purchaseToBase: '',
    baseUnit: 'g',
    price: '',
    fullLevel: '',
    ...(existing
      ? {
          kind: (existing.kind === 'input' ||
          existing.kind === 'packaging' ||
          existing.kind === 'store_supply'
            ? existing.kind
            : 'input') as Draft['kind'],
          name: existing.name,
          purchaseUnit: existing.purchaseUnit ?? '',
          purchaseToBase: existing.purchaseToBase
            ? formatTyped(existing.purchaseToBase, locale.formatting)
            : '',
          baseUnit: existing.baseUnit,
          fullLevel:
            existing.fullLevel !== null
              ? formatTyped(existing.fullLevel, locale.formatting)
              : '',
          // The price is not re-asked when correcting: it belongs to the
          // invoices, and re-entering it here would move the average by accident.
          //
          // And it is written with the locale's separator, because a price per
          // package is rarely round: `String(12.4)` is "12.4", which the reader
          // on this screen used to turn into 124.
          price:
            existing.averageRate > 0
              ? formatTyped(
                  (existing.averageRate * (existing.purchaseToBase ?? 1)) / 100,
                  locale.formatting,
                )
              : '',
        }
      : {}),
    ...draft,
  };

  const { kind, name, purchaseUnit, purchaseToBase, baseUnit, price, fullLevel } = form;
  const edit = (change: Partial<Draft>) => setDraft({ ...draft, ...change });

  const setKind = (next: Draft['kind']) => edit({ kind: next });
  const setName = (next: string) => edit({ name: next });
  /**
   * Typing the package fills in how much is inside it - Law 1, in the one place
   * it was most obviously broken.
   *
   * Somebody who buys sugar writes "saco 25 kg", because that is what is printed
   * on the sack, and the app then asked them for 25000. That is arithmetic the
   * system can do, and the person who should not have to do it is exactly the
   * person this product is for.
   *
   * Only ever fills a field the person has not touched, and only when the size
   * can be read with certainty: `packSize` returns null for "balde", for
   * "6 x 500 ml", and for any unit it does not know. A wrong factor here would
   * sit under every cost the item ever touches.
   */
  const [factorTyped, setFactorTyped] = useState(false);
  const setPurchaseUnit = (next: string) => {
    const deduced = factorTyped ? null : packSize(next, baseUnit);
    edit(deduced === null ? { purchaseUnit: next } : { purchaseUnit: next, purchaseToBase: String(deduced) });
  };
  const setPurchaseToBase = (next: string) => {
    setFactorTyped(true);
    edit({ purchaseToBase: next });
  };
  const setBaseUnit = (next: string) => edit({ baseUnit: next });
  const setPrice = (next: string) => edit({ price: next });
  const setFullLevel = (next: string) => edit({ fullLevel: next });

  const [saving, setSaving] = useState(false);

  // Two Number() calls: memoising them buys nothing, and hand-written memos are
  // what stop the React compiler from optimising the component at all.
  const parsed = (() => {
    // Accept both "4,72" and "4.72" - a Brazilian keyboard offers the comma.
    const num = (s: string) => parseTyped(s) ?? NaN;
    const factor = num(purchaseToBase);
    const paid = num(price);
    const valid = Number.isFinite(factor) && factor > 0 && Number.isFinite(paid) && paid > 0;
    return { factor, paid, valid, unitRate: valid ? rate(paid, factor) : null };
  })();

  /**
   * The hint that prevents the classic mistake. Showing the per-gram rate at
   * full precision is also the visible proof that the app is not rounding it
   * away - 0.472 cents per gram is a real number here, not zero.
   */
  const conversionHint = (() => {
    if (!parsed.valid || parsed.unitRate === null) return undefined;
    const perThousand = formatMoney(Math.round(parsed.unitRate * 1000), locale);
    return fill(words.conversion, {
      paid: formatMoney(fromDecimal(parsed.paid), locale),
      factor: parsed.factor.toLocaleString(locale.formatting),
      perThousand,
      rate: parsed.unitRate.toFixed(4),
      unit: baseUnit,
    });
  })();

  /**
   * A conferência, que antes era só uma palavra.
   *
   * "Conversão confere" acendia sempre que os dois números eram positivos, sem
   * comparar nada — dava para ver na tela, ao mesmo tempo, EMBALAGEM "saco 25 kg",
   * QUANTO VEM DENTRO "250 g" e a etiqueta verde afirmando que a conversão
   * confere. Errado por cem vezes, que é exatamente o erro que esta tela existe
   * para impedir.
   *
   * E o aplicativo já sabia checar: `packSize` é a mesma função que preenche o
   * campo quando ninguém o digitou. Então agora ou a etiqueta afirma só o que
   * foi feito (a conta fecha), ou ela compara de verdade — e discordando, mostra
   * os dois números em vez de travar, porque o nome da embalagem pode estar
   * abreviado e quem está com o saco na mão é quem sabe.
   */
  const conferencia = (() => {
    const lido = packSize(purchaseUnit, baseUnit);
    if (lido === null) return { signal: 'ok' as const, label: words.mathCloses };
    if (Math.abs(lido - parsed.factor) < 0.5) {
      return { signal: 'ok' as const, label: words.conversionOk };
    }
    return {
      signal: 'warning' as const,
      label: fill(words.conversionDiffers, {
        pack: formatQuantity(lido, locale),
        typed: formatQuantity(parsed.factor, locale),
        unit: baseUnit,
      }),
    };
  })();

  /**
   * Qual campo falta, e não os dois nomes de sempre.
   *
   * A frase mandava preencher "a embalagem e o preço", e a conta não depende da
   * embalagem: com EMBALAGEM "balde" e PREÇO "118,00" os dois campos que ela
   * pedia estavam preenchidos e a frase continuava na tela. O que estava vazio
   * era QUANTO VEM DENTRO, que ela não mencionava — e a tela sabe qual é.
   */
  const oQueFalta = (() => {
    const temFator = Number.isFinite(parsed.factor) && parsed.factor > 0;
    const temPreco = Number.isFinite(parsed.paid) && parsed.paid > 0;
    if (!temFator && !temPreco) return words.fillFirst;
    return temFator ? words.fillPrice : words.fillInside;
  })();

  // Correcting a name does not require re-entering a price: the price lives in
  // the invoices, and asking for it again here would move the average by accident.
  const canSave = name.trim().length > 0 && (editing ? parsed.factor > 0 : parsed.valid);

  // Not memoised: it is a click handler, and a hand-written memo here only
  // gives the compiler something it cannot preserve.
  const onSave = async () => {
    // Law 5: the error is prevented by the design, not complained about after.
    if (!canSave) return;

    const go = await confirm({
      title: editing ? words.saveEdit : words.confirmTitle,
      message: fill(editing ? words.confirmEdit : words.confirmNew, {
        name: name.trim(),
        pack: purchaseUnit || t.units.unit.one,
        factor: parsed.factor.toLocaleString(locale.formatting),
        unit: baseUnit,
        price: formatMoney(fromDecimal(parsed.paid), locale),
      }),
      cancelLabel: t.app.confirm.adjust,
    });
    if (!go) return;

    setSaving(true);
    try {
      await save();
      router.back();
    } catch (e) {
      await confirm({
        title: words.failedToSave,
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }

    /**
     * The price typed here is not a "price field" - it is the first invoice.
     * Recording it through the same purchase path every other purchase takes is
     * what keeps a single definition of what an item costs.
     */
    async function save() {
      const itemId = await saveItem(LOCAL_COMPANY_ID, {
        id,
        kind,
        name: name.trim(),
        purchaseUnit: purchaseUnit.trim() || null,
        purchaseToBase: parsed.factor,
        baseUnit: baseUnit.trim() || 'un',
        packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
        fullLevel: (parseTyped(fullLevel) ?? 0) > 0 ? (parseTyped(fullLevel) as number) : null,
      });

      // Only a new item carries a first invoice. Editing must never move the
      // average - that is what the purchase screen is for.
      if (editing) return;

      await recordPurchase(LOCAL_COMPANY_ID, {
        itemId,
        purchaseQuantity: 1,
        baseUnits: Math.round(parsed.factor),
        totalCents: fromDecimal(parsed.paid),
      });
    }
  };

  /** A palavra do tipo escolhido, que é o título do primeiro cartão. */
  const kindKey = kind === 'input' ? 'input' : kind === 'packaging' ? 'packaging' : 'storeSupply';

  /**
   * A conversão só aparece quando existe.
   *
   * Corrigindo, ela não aparece nunca: o preço não é perguntado nesse caminho,
   * então não há conta nova para mostrar — e um cartão de custo ao lado de "o
   * preço não é perguntado aqui" seria a tela se contradizendo em duas frases.
   */
  const mostraCusto = parsed.valid && !editing;

  /** A cascata não pula número: sem a conversão, a ação sobe uma posição. */
  const indiceAcao = mostraCusto ? 3 : 2;

  return (
    <CollapsingHeader
      title={editing ? name || words.fallbackTitle : words.newTitle}
      overline={editing ? words.editOverline : words.newOverline}
    >
      {/* O que é: o nome e para que serve. Um assunto só, porque é uma pergunta
          só — e o título do cartão é a resposta que está dada agora, que muda no
          toque da etiqueta. */}
      <Reveal index={0}>
        <Card
          hue={palette.mint}
          icon={(c) => <GlyphPlus size={26} color={c} weight={traco} />}
          title={words.kinds[kindKey]}
        >
          <View style={{ gap: space.lg }}>
            <Field
              label={words.name}
              value={name}
              onChangeText={setName}
              placeholder={words.namePlaceholder}
              autoFocus
            />

            <View style={{ gap: space.sm }}>
              <Text style={[type.overline, { color: color.inkFaint }]}>{words.whatFor}</Text>
              {/* A etiqueta acesa é a escolhida, e nunca por cor sozinha: a
                  palavra continua dita por extenso, que é o que serve de luva e
                  sob luz ruim. A folga em volta é o alvo do dedo. */}
              <View style={[styles.wrap, { gap: space.sm }]}>
                {KINDS.map((entry) => (
                  <Touchable
                    key={entry.kind}
                    accessibilityLabel={words.kinds[entry.key]}
                    onPress={() => setKind(entry.kind)}
                    style={{ paddingVertical: space.xs }}
                  >
                    <Chip
                      signal={kind === entry.kind ? 'ok' : 'neutral'}
                      label={words.kinds[entry.key]}
                    />
                  </Touchable>
                ))}
              </View>
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {words.kindHint[kindKey]}
              </Text>
            </View>
          </View>
        </Card>
      </Reveal>

      {/* Como você compra: o saco, porque é o saco que existe na nota. Este é o
          cartão que a tela existe para ter — é aqui que o fator de conversão
          entra, e é ele que fica embaixo de todo custo que o item tocar. */}
      <Reveal index={1}>
        <Card
          hue={palette.mint}
          icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
          title={words.howYouBuy}
        >
          <View style={{ gap: space.lg }}>
            <Text style={[type.secondary, { color: color.inkMuted }]}>{words.howYouBuyHint}</Text>

            <Field
              label={words.pack}
              value={purchaseUnit}
              onChangeText={setPurchaseUnit}
              placeholder={words.packPlaceholder}
            />
            <Field
              label={words.perPack}
              value={purchaseToBase}
              onChangeText={setPurchaseToBase}
              placeholder="25000"
              suffix={baseUnit}
              keyboardType="numeric"
            />
            <Field
              label={words.useUnit}
              value={baseUnit}
              onChangeText={setBaseUnit}
              placeholder="g"
              hint={words.useUnitHint}
            />
            {/* A régua das faixas de cor, e ela é opcional de propósito.
                Vazia, o item não ganha cor nem aviso de volume — porque sem
                referência "20%" seria um número que ninguém pode conferir. */}
            <Field
              label={words.fullLevel}
              value={fullLevel}
              onChangeText={setFullLevel}
              placeholder="50000"
              suffix={baseUnit}
              keyboardType="numeric"
              hint={words.fullLevelHint}
            />
            {editing ? (
              <Text style={[type.caption, { color: color.inkMuted }]}>{words.priceNotAsked}</Text>
            ) : (
              <Field
                label={words.price}
                value={price}
                onChangeText={setPrice}
                placeholder="118,00"
                suffix={currencySymbol(locale)}
                keyboardType="numeric"
                // A conta enquanto se digita, e no lugar dela a frase que diz o
                // que falta para a conta existir. Dica é onde a inteligência
                // aparece: o campo explica em vez de um cartão cinza abaixo.
                hint={conversionHint ?? oQueFalta}
              />
            )}
          </View>
        </Card>
      </Reveal>

      {/* O que aquilo vira na receita, no tom do dinheiro. É a conclusão do
          cartão de cima — a conta aberta é a dica do campo de preço (Lei 6), e
          este número é o que ela soma por unidade de uso. */}
      {mostraCusto ? (
        <Reveal index={2}>
          <Card hue={palette.sky}>
            {/* O rótulo é do TIPO, não fixo.
                Com "Material de loja" aceso, a legenda do cartão de cima diz
                que ele não entra em receita — e o seletor de ingrediente só
                lista insumo e embalagem, então nunca poderia. A tela afirmava
                as duas coisas a dois cartões de distância. */}
            <Text style={[type.overline, { color: color.inkFaint }]}>
              {kind === 'store_supply' ? words.costsInStore : words.entersAs}
            </Text>
            <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
              {formatMoney(Math.round((parsed.unitRate ?? 0) * 1000), locale)}
            </Text>
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {fill(words.perThousandOf, { unit: baseUnit })}
            </Text>
            <View style={{ marginTop: space.md }}>
              <Chip signal={conferencia.signal} label={conferencia.label} />
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* A ação, uma só, com o desenho do que ela faz dentro dela: o mais quando
          se cadastra, o saco quando se corrige o que já existe. Desabilitada
          enquanto a conta não fecha — Lei 5: o erro se impede, não se reclama. */}
      <Reveal index={indiceAcao}>
        <Button
          label={saving ? words.saving : editing ? words.saveEdit : words.save}
          icon={(c) =>
            editing ? (
              <GlyphSack size={22} color={c} weight={traco} />
            ) : (
              <GlyphPlus size={22} color={c} weight={traco} />
            )
          }
          onPress={() => void onSave()}
          disabled={!canSave || saving}
          weighty
        />
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});

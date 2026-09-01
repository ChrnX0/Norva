import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { findItem, recordPurchase, saveItem, type ItemKind } from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { fromDecimal, rate } from '@/domain/money';
import { defaultLocale, formatMoney } from '@/i18n';
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
 */
export default function InputsScreen() {
  return (
    <AreaProvider area="mist">
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
};

const KINDS: { kind: Extract<ItemKind, 'input' | 'packaging' | 'store_supply'>; label: string }[] = [
  { kind: 'input', label: 'Insumo' },
  { kind: 'packaging', label: 'Embalagem' },
  { kind: 'store_supply', label: 'Material de loja' },
];

function InputForm() {
  const { color, type, space } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const locale = defaultLocale;

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
    ...(existing
      ? {
          kind: (existing.kind === 'input' ||
          existing.kind === 'packaging' ||
          existing.kind === 'store_supply'
            ? existing.kind
            : 'input') as Draft['kind'],
          name: existing.name,
          purchaseUnit: existing.purchaseUnit ?? '',
          purchaseToBase: existing.purchaseToBase ? String(existing.purchaseToBase) : '',
          baseUnit: existing.baseUnit,
          // The price is not re-asked when correcting: it belongs to the
          // invoices, and re-entering it here would move the average by accident.
          price: existing.averageRate > 0 ? String(existing.averageRate * (existing.purchaseToBase ?? 1) / 100) : '',
        }
      : {}),
    ...draft,
  };

  const { kind, name, purchaseUnit, purchaseToBase, baseUnit, price } = form;
  const edit = (change: Partial<Draft>) => setDraft({ ...draft, ...change });

  const setKind = (next: Draft['kind']) => edit({ kind: next });
  const setName = (next: string) => edit({ name: next });
  const setPurchaseUnit = (next: string) => edit({ purchaseUnit: next });
  const setPurchaseToBase = (next: string) => edit({ purchaseToBase: next });
  const setBaseUnit = (next: string) => edit({ baseUnit: next });
  const setPrice = (next: string) => edit({ price: next });

  const [saving, setSaving] = useState(false);

  // Two Number() calls: memoising them buys nothing, and hand-written memos are
  // what stop the React compiler from optimising the component at all.
  const parsed = (() => {
    // Accept both "4,72" and "4.72" - a Brazilian keyboard offers the comma.
    const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
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
    return `${formatMoney(fromDecimal(parsed.paid), locale)} ÷ ${parsed.factor.toLocaleString(
      locale.formatting,
    )} = ${perThousand} a cada 1.000 ${baseUnit} · ${parsed.unitRate.toFixed(4)} centavos por ${baseUnit}`;
  })();

  // Correcting a name does not require re-entering a price: the price lives in
  // the invoices, and asking for it again here would move the average by accident.
  const canSave = name.trim().length > 0 && (editing ? parsed.factor > 0 : parsed.valid);

  const onSave = useCallback(async () => {
    // Law 5: the error is prevented by the design, not complained about after.
    if (!canSave) return;

    const go = await confirm({
      title: editing ? 'Salvar a correção?' : 'Confirma?',
      message: editing
        ? `${name.trim()} passa a ser comprado em ${purchaseUnit || 'unidade'}, com ` +
          `${parsed.factor.toLocaleString(locale.formatting)} ${baseUnit} por embalagem. ` +
          `O custo médio e o histórico de compras não mudam.`
        : `Você vai cadastrar ${name.trim()}, comprado em ${purchaseUnit || 'unidade'} ` +
          `com ${parsed.factor.toLocaleString(locale.formatting)} ${baseUnit} por embalagem, ` +
          `custando ${formatMoney(fromDecimal(parsed.paid), locale)}.`,
      cancelLabel: 'Ajustar',
    });
    if (!go) return;

    setSaving(true);
    try {
      await save();
      router.back();
    } catch (e) {
      await confirm({
        title: 'Não deu para salvar',
        message: e instanceof Error ? e.message : String(e),
        acknowledge: true,
        confirmLabel: 'Entendi',
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
  }, [canSave, confirm, editing, id, name, purchaseUnit, parsed, locale, kind, baseUnit, router]);

  return (
    <CollapsingHeader title={editing ? name || 'Insumo' : 'Novo insumo'} overline={editing ? 'corrigindo o cadastro' : 'cadastro'}>
      <Card tone="area">
        <Field
          label="Nome"
          value={name}
          onChangeText={setName}
          placeholder="Açúcar cristal"
          autoFocus
        />

        <View style={{ marginTop: space.lg }}>
          <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.sm }]}>
            PARA QUE SERVE
          </Text>
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {KINDS.map((entry) => (
              <Button
                key={entry.kind}
                label={entry.label}
                variant={kind === entry.kind ? 'primary' : 'ghost'}
                onPress={() => setKind(entry.kind)}
                style={{ paddingVertical: space.sm, paddingHorizontal: space.md }}
              />
            ))}
          </View>
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
            {kind === 'input'
              ? 'Entra na receita e vira custo do produto.'
              : kind === 'packaging'
                ? 'Palito, saquinho, rótulo — custa por unidade produzida.'
                : 'Copo, colher, guardanapo — custa dinheiro na loja, mas não entra em receita.'}
          </Text>
        </View>
      </Card>

      <Card tone="area">
        <Text style={[type.cardTitle, { color: color.ink, marginBottom: space.xs }]}>
          Como você compra
        </Text>
        <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
          Do jeito que vem do fornecedor, não do jeito que entra na receita.
        </Text>

        <View style={{ gap: space.lg }}>
          <Field
            label="Embalagem"
            value={purchaseUnit}
            onChangeText={setPurchaseUnit}
            placeholder="saco 25 kg"
          />
          <Field
            label="Quanto vem dentro"
            value={purchaseToBase}
            onChangeText={setPurchaseToBase}
            placeholder="25000"
            suffix={baseUnit}
            keyboardType="numeric"
          />
          <Field
            label="Medida de uso"
            value={baseUnit}
            onChangeText={setBaseUnit}
            placeholder="g"
            hint="A menor medida com que a receita trabalha: g, ml, un."
          />
          {editing ? (
            <Text style={[type.caption, { color: color.inkMuted }]}>
              O preço não é perguntado aqui. Ele vem das notas de compra, e mexer nele por este
              caminho moveria o custo médio sem uma nota por trás.
            </Text>
          ) : (
            <Field
              label="Preço pago"
              value={price}
              onChangeText={setPrice}
              placeholder="118,00"
              suffix="R$"
              keyboardType="numeric"
              hint={conversionHint}
            />
          )}
        </View>
      </Card>

      {parsed.valid && !editing ? (
        <Card tone="area">
          <Text style={[type.overline, { color: color.inkFaint }]}>ENTRA NA RECEITA COMO</Text>
          <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
            {formatMoney(Math.round((parsed.unitRate ?? 0) * 1000), locale)}
          </Text>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            a cada 1.000 {baseUnit}
          </Text>
          <View style={{ marginTop: space.md }}>
            <Chip signal="ok" label="Conversão confere" />
          </View>
        </Card>
      ) : (
        <Card>
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            Preencha a embalagem e o preço para o app calcular o custo por unidade de uso.
          </Text>
        </Card>
      )}

      <Button
        label={saving ? 'Salvando…' : editing ? 'Salvar correção' : 'Salvar insumo'}
        onPress={() => void onSave()}
        disabled={!canSave || saving}
        weighty
      />
    </CollapsingHeader>
  );
}

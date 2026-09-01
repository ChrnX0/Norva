import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { recordPurchase, saveItem, type ItemKind } from '@/data/repository';
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

  const [kind, setKind] = useState<(typeof KINDS)[number]['kind']>('input');
  const [name, setName] = useState('');
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [purchaseToBase, setPurchaseToBase] = useState('');
  const [baseUnit, setBaseUnit] = useState('g');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => {
    // Accept both "4,72" and "4.72" - a Brazilian keyboard offers the comma.
    const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
    const factor = num(purchaseToBase);
    const paid = num(price);
    const valid = Number.isFinite(factor) && factor > 0 && Number.isFinite(paid) && paid > 0;
    return { factor, paid, valid, unitRate: valid ? rate(paid, factor) : null };
  }, [purchaseToBase, price]);

  /**
   * The hint that prevents the classic mistake. Showing the per-gram rate at
   * full precision is also the visible proof that the app is not rounding it
   * away - 0.472 cents per gram is a real number here, not zero.
   */
  const conversionHint = useMemo(() => {
    if (!parsed.valid || parsed.unitRate === null) return undefined;
    const perThousand = formatMoney(Math.round(parsed.unitRate * 1000), locale);
    return `${formatMoney(fromDecimal(parsed.paid), locale)} ÷ ${parsed.factor.toLocaleString(
      locale.formatting,
    )} = ${perThousand} a cada 1.000 ${baseUnit} · ${parsed.unitRate.toFixed(4)} centavos por ${baseUnit}`;
  }, [parsed, locale, baseUnit]);

  const canSave = name.trim().length > 0 && parsed.valid;

  const onSave = useCallback(async () => {
    // Law 5: the error is prevented by the design, not complained about after.
    if (!canSave) return;

    const go = await confirm({
      title: 'Confirma?',
      message:
        `Você vai cadastrar ${name.trim()}, comprado em ${purchaseUnit || 'unidade'} ` +
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
        kind,
        name: name.trim(),
        purchaseUnit: purchaseUnit.trim() || null,
        purchaseToBase: parsed.factor,
        baseUnit: baseUnit.trim() || 'un',
        packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
      });

      await recordPurchase(LOCAL_COMPANY_ID, {
        itemId,
        purchaseQuantity: 1,
        baseUnits: Math.round(parsed.factor),
        totalCents: fromDecimal(parsed.paid),
      });
    }
  }, [canSave, confirm, name, purchaseUnit, parsed, locale, kind, baseUnit, router]);

  return (
    <CollapsingHeader title="Novo insumo" overline="cadastro">
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
          <Field
            label="Preço pago"
            value={price}
            onChangeText={setPrice}
            placeholder="118,00"
            suffix="R$"
            keyboardType="numeric"
            hint={conversionHint}
          />
        </View>
      </Card>

      {parsed.valid ? (
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
        label={saving ? 'Salvando…' : 'Salvar insumo'}
        onPress={() => void onSave()}
        disabled={!canSave || saving}
        weighty
      />
    </CollapsingHeader>
  );
}

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  listFlavors,
  listLines,
  listTypes,
  saveFlavor,
  saveLine,
  saveType,
  type Flavor,
  type ProductLine,
  type ProductType,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * A grade do que você fabrica: linha, tipo e sabor.
 *
 * Até aqui um produto era um nome digitado por inteiro, e sessenta produtos
 * eram sessenta nomes. Pior: nada no sistema sabia que "Picolé tradicional de
 * morango" tem três partes, então nenhum relatório podia somar por sabor nem
 * por linha, e a tela de produção não tinha o que perguntar antes do tacho.
 *
 * Os três níveis são opcionais, e isso não é frouxidão — é a regra do "depende
 * vira dado". Uma fábrica que faz um doce só não inventa uma linha para
 * cadastrá-lo; ela preenche um nível e a tela cala os outros dois.
 */
export default function CatalogScreen() {
  return (
    <AreaProvider area="apricot">
      <Catalog />
    </AreaProvider>
  );
}

type Loaded = { lines: ProductLine[]; types: ProductType[]; flavors: Flavor[] };

function Catalog() {
  const { color, type, space, radius, palette } = useTheme();
  const { t } = useLocale();

  const [lineId, setLineId] = useState<string | null>(null);
  const [novaLinha, setNovaLinha] = useState('');
  const [novoTipo, setNovoTipo] = useState('');
  const [novoSabor, setNovoSabor] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const { data, loading, refresh } = useQuery<Loaded>(async () => {
    const [lines, types, flavors] = await Promise.all([
      listLines(LOCAL_COMPANY_ID),
      listTypes(LOCAL_COMPANY_ID),
      listFlavors(LOCAL_COMPANY_ID),
    ]);
    return { lines, types, flavors };
  });

  // Nenhum campo nasce vazio, e nenhuma pergunta nasce sem contexto: a linha
  // escolhida é a primeira, porque uma fábrica que tem uma linha só nunca
  // deveria ter de escolhê-la.
  const linhaAtiva = data?.lines.find((l) => l.id === lineId) ?? data?.lines[0] ?? null;
  const tiposDaLinha = (data?.types ?? []).filter((t) => t.lineId === linhaAtiva?.id);

  const gravar = async (fn: () => Promise<unknown>, limpar: () => void) => {
    setErro(null);
    try {
      await fn();
      limpar();
      refresh();
    } catch (e) {
      // Nome repetido é o erro que acontece de verdade, e ele já vem do banco:
      // o índice ignora caixa e espaço, então "morango" e "Morango " batem no
      // mesmo. A tela diz o que fazer em vez de repetir a mensagem do SQLite.
      setErro(e instanceof Error && /unique/i.test(e.message) ? t.app.catalog.duplicate : String(e));
    }
  };

  const chip = (label: string, active: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={{
        borderColor: active ? palette.apricot : color.line,
        borderWidth: active ? 2 : 1,
        borderRadius: radius.md,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        backgroundColor: color.surface,
      }}
    >
      <Text style={[type.body, { color: active ? color.ink : color.inkMuted }]}>{label}</Text>
    </Pressable>
  );

  return (
    <CollapsingHeader title={t.app.catalog.title} overline={t.app.catalog.overline}>
      <Card>
        <Text style={[type.body, { color: color.inkMuted }]}>{t.app.catalog.intro}</Text>
      </Card>

      {erro ? (
        <Card tone="warning">
          <Text style={[type.body, { color: color.ink }]}>{erro}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.catalog.lines}</Text>
        <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.catalog.linesHint}
        </Text>
        {loading ? null : (data?.lines ?? []).length === 0 ? (
          <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
            {t.app.catalog.noLines}
          </Text>
        ) : (
          <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
            {(data?.lines ?? []).map((l) =>
              chip(l.name, l.id === linhaAtiva?.id, () => setLineId(l.id), l.id),
            )}
          </View>
        )}
        <View style={{ marginTop: space.lg, gap: space.md }}>
          <Field
            label={t.app.catalog.addLine}
            value={novaLinha}
            onChangeText={setNovaLinha}
            placeholder={t.app.catalog.namePlaceholder}
          />
          <Button
            label={t.app.catalog.addLine}
            variant="ghost"
            disabled={novaLinha.trim().length === 0}
            onPress={() =>
              gravar(() => saveLine(LOCAL_COMPANY_ID, { name: novaLinha }), () => setNovaLinha(''))
            }
          />
        </View>
      </Card>

      {linhaAtiva ? (
        <Card>
          <Text style={[type.cardTitle, { color: color.ink }]}>
            {t.app.catalog.types.replace('{{line}}', linhaAtiva.name)}
          </Text>
          <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
            {t.app.catalog.typesHint}
          </Text>
          {tiposDaLinha.length === 0 ? (
            <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
              {t.app.catalog.noTypes}
            </Text>
          ) : (
            <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
              {tiposDaLinha.map((tp) => chip(tp.name, false, () => {}, tp.id))}
            </View>
          )}
          <View style={{ marginTop: space.lg, gap: space.md }}>
            <Field
              label={t.app.catalog.addType}
              value={novoTipo}
              onChangeText={setNovoTipo}
              placeholder={t.app.catalog.namePlaceholder}
            />
            <Button
              label={t.app.catalog.addType}
              variant="ghost"
              disabled={novoTipo.trim().length === 0}
              onPress={() =>
                gravar(
                  () => saveType(LOCAL_COMPANY_ID, { lineId: linhaAtiva.id, name: novoTipo }),
                  () => setNovoTipo(''),
                )
              }
            />
          </View>
        </Card>
      ) : null}

      <Card>
        <Text style={[type.cardTitle, { color: color.ink }]}>{t.app.catalog.flavors}</Text>
        <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
          {t.app.catalog.flavorsHint}
        </Text>
        {loading ? null : (data?.flavors ?? []).length === 0 ? (
          <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
            {t.app.catalog.noFlavors}
          </Text>
        ) : (
          <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
            {(data?.flavors ?? []).map((f) => chip(f.name, false, () => {}, f.id))}
          </View>
        )}
        <View style={{ marginTop: space.lg, gap: space.md }}>
          <Field
            label={t.app.catalog.addFlavor}
            value={novoSabor}
            onChangeText={setNovoSabor}
            placeholder={t.app.catalog.namePlaceholder}
          />
          <Button
            label={t.app.catalog.addFlavor}
            variant="ghost"
            disabled={novoSabor.trim().length === 0}
            onPress={() =>
              gravar(
                () => saveFlavor(LOCAL_COMPANY_ID, { name: novoSabor }),
                () => setNovoSabor(''),
              )
            }
          />
        </View>
      </Card>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

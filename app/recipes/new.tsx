import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { GlyphKettle, GlyphRecipe } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { ERROS } from '@/data/erros';
import { empresaDaqui } from '@/data/empresa';
import { saveRecipeVersion } from '@/data/repository';
import { parseTyped } from '@/domain/number';
import { fill, formatQuantity } from '@/i18n';
import { avisoDeFalha } from '@/i18n/falha';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Cadastrar uma ficha técnica — a tela que faltava.
 *
 * **Três estados vazios mandavam cadastrar uma receita e nenhuma tela criava.** O
 * comentário de `app/recipes/index.tsx` já admitia por escrito que *"cadastrar
 * receita ainda não tem tela para onde mandar"*, e a frase do estado vazio dizia
 * *"Cadastre os insumos primeiro, depois a receita que os usa"* — uma instrução sem
 * destino. Uma fábrica nova não conseguia sair do lugar sem a semeadura do exemplo.
 *
 * **A tela pergunta o mínimo, e é de propósito.** Nome, quanto rende uma vez, e a
 * perda da ficha. Os INGREDIENTES não entram aqui: a receita nasce e abre no editor
 * (`app/recipes/[id].tsx`), que já sabe pôr linha, mudar quantidade e mostrar o custo
 * mudando enquanto se digita. Pedir tudo numa folha só faria a primeira receita ser
 * um formulário de vinte campos — e a ficha só faz sentido quando dá para ver o custo
 * reagir, que é o que o editor faz e esta tela não faria.
 *
 * Lei 1 e Lei 2 nos dois campos: a perda nasce em 0% e o rendimento tem placeholder
 * com o número que a maioria usa, então ninguém encara campo vazio.
 */
export default function NewRecipeScreen() {
  return (
    <AreaProvider area="apricot">
      <NewRecipe />
    </AreaProvider>
  );
}

/** As três réguas de rendimento — e a lista existe para a tela não escrever texto livre. */
const UNIDADES = ['ml', 'g', 'un'] as const;
type UnidadeDeRendimento = (typeof UNIDADES)[number];

function NewRecipe() {
  const { color, type, space, palette, traco } = useTheme();
  const { t, locale } = useLocale();
  const words = t.app.recipeNew;
  const router = useRouter();
  const confirm = useConfirm();

  const [name, setName] = useState('');
  const [yieldText, setYieldText] = useState('');
  const [unit, setUnit] = useState<UnidadeDeRendimento>('ml');
  const [lossText, setLossText] = useState('0');
  const [saving, setSaving] = useState(false);

  const rende = Math.max(0, parseTyped(yieldText) ?? 0);
  const perda = Math.min(90, Math.max(0, parseTyped(lossText) ?? 0));
  // O que sobra depois da perda da ficha — a Lei 3: o número nunca aparece sozinho.
  const aproveitado = Math.round(rende * (1 - perda / 100));
  const pronto = name.trim().length > 0 && rende > 0;

  const salvar = async () => {
    if (!pronto) return;

    // Lei 5 e o tom da casa: a confirmação diz o que vai acontecer, com os números
    // por extenso, antes de qualquer linha nascer.
    const go = await confirm({
      title: fill(words.saveTitle, { name: name.trim() }),
      message: fill(words.saveBody, {
        name: name.trim(),
        yield: `${formatQuantity(rende, locale)} ${unit}`,
        usable: `${formatQuantity(aproveitado, locale)} ${unit}`,
      }),
      confirmLabel: words.save,
      cancelLabel: t.common.cancel,
    });
    if (!go) return;

    setSaving(true);
    try {
      const { recipeId } = await saveRecipeVersion(empresaDaqui(), {
        name: name.trim(),
        yieldAmount: rende,
        yieldUnit: unit,
        lossFraction: perda / 100,
        // Sem ingrediente ainda: quem os põe é o editor, e é lá que o custo aparece
        // reagindo a cada linha. Uma ficha sem linha é um rascunho honesto, não um
        // estado inválido — ela não vira produto até alguém dizer o que entra.
        lines: [],
      });
      // `replace`, não `push`: voltar para uma tela de cadastro que já cadastrou é
      // oferecer o mesmo cadastro duas vezes.
      router.replace(`/recipes/${recipeId}`);
    } catch (e) {
      const aviso = avisoDeFalha(e, t, ERROS);
      await confirm({
        title: aviso.title,
        message: aviso.message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <CollapsingHeader cena="receitas" title={words.title} overline={words.overline}>
      {/* Dois cartões, e cada título é a PERGUNTA que o cartão faz — que é como as
          outras telas de cadastro desta casa falam (`Para quem`, `Quando`, `Como você
          compra`). A primeira versão repetia o título da página dentro do cartão, e a
          foto no emulador mostrou "Nova ficha técnica" duas vezes, uma embaixo da
          outra: o cabeçalho já diz onde a pessoa está, e o cartão gastava a linha
          dele repetindo em vez de perguntar. */}
      <Reveal index={0}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}
          title={words.nameTitle}
        >
          <Field
            label={words.name}
            value={name}
            onChangeText={setName}
            placeholder={words.namePlaceholder}
            autoFocus
          />
        </Card>
      </Reveal>

      <Reveal index={1}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphKettle size={26} color={c} weight={traco} />}
          title={words.yieldTitle}
        >
          <View style={{ gap: space.lg }}>
            {/* O rótulo do campo é o do campo, e o título do cartão é a pergunta.
                Antes os dois estavam empilhados dentro do mesmo cartão — "Quanto rende
                uma vez" logo acima de "RENDIMENTO" — dois rótulos para uma caixa só. */}
            <Field
              label={words.yieldField}
              value={yieldText}
              onChangeText={setYieldText}
              placeholder={words.yieldPlaceholder}
              keyboardType="numeric"
            />
            {/* A régua do rendimento por etiqueta, nunca texto livre: "l" e "L" e
                "litro" seriam três unidades diferentes para o mesmo líquido, e o
                custo por unidade sairia mil vezes errado sem nada na tela dizer. */}
            <View style={[styles.wrap, { gap: space.sm }]}>
              {UNIDADES.map((u) => (
                <Touchable
                  key={u}
                  accessibilityLabel={words.units[u]}
                  onPress={() => setUnit(u)}
                  // 48 dp de alvo, que é o piso desta casa: escolha que se faz de
                  // luva não cabe em trinta.
                  style={{ paddingVertical: space.sm, minHeight: 48, justifyContent: 'center' }}
                >
                  <Chip signal={unit === u ? 'ok' : 'neutral'} label={words.units[u]} />
                </Touchable>
              ))}
            </View>

            <View style={{ gap: space.sm }}>
              <Field
                label={words.loss}
                value={lossText}
                onChangeText={setLossText}
                keyboardType="numeric"
              />
              {/* Lei 3: o número não aparece sozinho. A perda só quer dizer alguma
                  coisa ao lado do que sobra. */}
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {rende > 0
                  ? fill(words.usable, {
                      usable: `${formatQuantity(aproveitado, locale)} ${unit}`,
                    })
                  : words.lossHint}
              </Text>
            </View>
          </View>
        </Card>
      </Reveal>

      <Reveal index={2}>
        <Button
          label={saving ? words.saving : words.save}
          onPress={() => void salvar()}
          disabled={!pronto || saving}
        />
        {/* O que vem depois, dito antes: quem cadastra a ficha ainda vai pôr o que
            entra nela, e saber disso agora evita a sensação de ter feito metade. */}
        <Text
          style={[type.caption, { color: color.inkFaint, marginTop: space.sm, textAlign: 'center' }]}
        >
          {words.thenLines}
        </Text>
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});

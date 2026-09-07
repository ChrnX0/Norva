import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphCatalog, GlyphLabel } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
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
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import { fill } from '@/i18n';
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
 *
 * **A apresentação foi refeita do zero, e a caixa desenhada à mão foi o motivo.**
 * Esta tela tinha um `chip` local com `borderWidth`, `borderRadius` e
 * `backgroundColor` próprios: um vocabulário do Orgânico chumbado no arquivo,
 * que no Papel aparecia como pastilha arredondada no meio de uma página de
 * réguas retas — exatamente as "caixinhas" que o dono circulou. Nada aqui
 * desenha caixa: o `Card` e o `Chip` conhecem as duas caras, e a tela só diz
 * qual é o assunto.
 *
 * E a tela passou a responder o que é normal aqui. Antes ela era três
 * formulários e uma frase de ensino; agora o primeiro cartão mostra **o nome
 * que a grade monta**, escrito com as palavras da própria fábrica pela mesma
 * regra de composição que o cadastro de produto usa. Ensinar com o exemplo de
 * quem lê custa uma linha de código e responde a pergunta que o formulário
 * sozinho deixava aberta: para que servem os três níveis.
 */
export default function CatalogScreen() {
  return (
    <AreaProvider area="sand">
      <Catalog />
    </AreaProvider>
  );
}

type Loaded = { lines: ProductLine[]; types: ProductType[]; flavors: Flavor[] };

function Catalog() {
  const { color, type, space, palette, traco } = useTheme();
  const { t } = useLocale();

  const [lineId, setLineId] = useState<string | null>(null);
  const [novaLinha, setNovaLinha] = useState('');
  const [novoTipo, setNovoTipo] = useState('');
  const [novoSabor, setNovoSabor] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const { data, loading, refresh } = useQuery<Loaded>(async () => {
    const [lines, types, flavors] = await Promise.all([
      listLines(empresaDaqui()),
      listTypes(empresaDaqui()),
      listFlavors(empresaDaqui()),
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

  /**
   * O nome que a grade monta, nas palavras da fábrica.
   *
   * A precedência é a mesma do cadastro de produto (`app/products/new.tsx`), e
   * é dela de propósito: se a tela que ensina compusesse o nome por uma regra
   * diferente da tela que grava, o ensino estaria mentindo. Sem linha nenhuma
   * não há exemplo — e aí a frase de ensino fica sozinha, que é o certo no
   * primeiro dia.
   */
  const primeiroTipo = tiposDaLinha[0] ?? null;
  const primeiroSabor = data?.flavors[0] ?? null;
  const exemplo = !linhaAtiva
    ? null
    : primeiroTipo && primeiroSabor
      ? fill(t.app.catalog.composed, {
          line: linhaAtiva.name,
          type: primeiroTipo.name,
          flavor: primeiroSabor.name,
        })
      : primeiroSabor
        ? fill(t.app.catalog.composedNoType, {
            line: linhaAtiva.name,
            flavor: primeiroSabor.name,
          })
        : primeiroTipo
          ? fill(t.app.catalog.composedNoFlavor, {
              line: linhaAtiva.name,
              type: primeiroTipo.name,
            })
          : linhaAtiva.name;

  /**
   * Um nome cadastrado é uma etiqueta, e etiqueta é do `Chip`.
   *
   * O `Chip` sabe as duas caras — pílula no Orgânico, carimbo reto no Papel — e
   * é por isso que ele entra aqui em vez de um retângulo desenhado à mão. Os
   * nomes que não se escolhem entram em `neutral`: cinza é "isto está
   * cadastrado", e nenhum deles ganha cor de sinal, porque verde neste
   * aplicativo quer dizer conferido.
   */
  const etiquetas = (nomes: { id: string; name: string }[]) => (
    <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
      {nomes.map((n) => (
        <Chip key={n.id} signal="neutral" label={n.name} />
      ))}
    </View>
  );

  return (
    <CollapsingHeader cena="produtos" title={t.app.catalog.title} overline={t.app.catalog.overline}>
      {/* O aviso vem antes de tudo, e o índice dele é fixo.
          Índice corrido renumeraria os cartões de baixo no instante em que um
          nome repetido aparece, e a tela inteira reentraria — o erro tem que
          responder por si, não fazer a página piscar. */}
      {erro ? (
        <Reveal index={0}>
          <Card tone="warning">
            <Text style={[type.body, { color: color.ink }]}>{erro}</Text>
          </Card>
        </Reveal>
      ) : null}

      {/* O que a grade monta. A etiqueta é o desenho certo: o nome composto é
          o que vai no produto, e é a resposta de "para que servem três
          níveis". */}
      <Reveal index={1}>
        <Card hue={palette.sand} icon={(c) => <GlyphLabel size={26} color={c} weight={traco} />}>
          {exemplo ? <Text style={[type.section, { color: color.ink }]}>{exemplo}</Text> : null}
          <Text
            style={[
              exemplo ? type.caption : type.body,
              { color: color.inkMuted, marginTop: exemplo ? space.xs : 0 },
            ]}
          >
            {t.app.catalog.intro}
          </Text>
        </Card>
      </Reveal>

      {/* Linha: o eixo de cima da grade, e o único nível que se escolhe aqui —
          os tipos do cartão seguinte são os desta linha. */}
      <Reveal index={2}>
        <Card
          hue={palette.sand}
          icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
          title={t.app.catalog.lines}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.catalog.linesHint}</Text>

          {loading ? null : (data?.lines ?? []).length === 0 ? (
            <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
              {t.app.catalog.noLines}
            </Text>
          ) : (
            <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
              {(data?.lines ?? []).map((l) => (
                // `Pressable` cru, e não `Touchable`, porque isto é um grupo de
                // escolha e não um cartão: o papel de rádio e o estado de
                // selecionado são o que a leitura de tela usa para dizer qual
                // linha está valendo. A resposta ao dedo aqui não é o afundar —
                // é a etiqueta trocar de cor e o cartão de baixo trocar de
                // título.
                <Pressable
                  key={l.id}
                  onPress={() => setLineId(l.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: l.id === linhaAtiva?.id }}
                  accessibilityLabel={l.name}
                >
                  <Chip signal={l.id === linhaAtiva?.id ? 'ok' : 'neutral'} label={l.name} />
                </Pressable>
              ))}
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
                gravar(() => saveLine(empresaDaqui(), { name: novaLinha }), () => setNovaLinha(''))
              }
            />
          </View>
        </Card>
      </Reveal>

      {/* Tipo: o que divide a linha escolhida.
          Sem linha nenhuma não há tipo para cadastrar — o banco não aceitaria —
          mas o cartão fica de pé dizendo o que fazer primeiro. Sumir com ele
          esconderia o caminho, que é o erro que a tela de relatórios já
          cometeu. */}
      <Reveal index={3}>
        <Card
          hue={palette.sand}
          icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
          // O título nomeia o assunto, nunca a ação que não está aí.
          //
          // No estado sem linha o corpo do cartão não tem formulário — o campo e
          // o botão de cadastrar tipo ficam dentro do ramo de baixo — e o
          // cabeçalho anunciava "Novo tipo" sobre um cartão onde não havia como
          // cadastrar tipo nenhum. A decisão de manter o cartão de pé sem
          // formulário está registrada acima e não é o defeito; o defeito era o
          // rótulo prometer o que ela retirou.
          title={
            linhaAtiva
              ? fill(t.app.catalog.types, { line: linhaAtiva.name })
              : t.app.catalog.typesTitle
          }
        >
          {/* E a frase é a do estado real.
              `pickLineFirst` mandava escolher uma linha de um conjunto vazio:
              `linhaAtiva` só é nula quando NÃO existe linha nenhuma, porque a
              tela seleciona a primeira sozinha. O cartão de cima acabava de
              dizer "nenhuma linha ainda" e este mandava escolher uma. */}
          {loading ? null : (
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {linhaAtiva ? t.app.catalog.typesHint : t.app.catalog.noLineYet}
            </Text>
          )}

          {linhaAtiva ? (
            <>
              {tiposDaLinha.length === 0 ? (
                <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
                  {t.app.catalog.noTypes}
                </Text>
              ) : (
                etiquetas(tiposDaLinha)
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
                      () => saveType(empresaDaqui(), { lineId: linhaAtiva.id, name: novoTipo }),
                      () => setNovoTipo(''),
                    )
                  }
                />
              </View>
            </>
          ) : null}
        </Card>
      </Reveal>

      {/* Sabor: atravessa as linhas todas, e é por isso que ele não depende de
          escolha nenhuma acima. */}
      <Reveal index={4}>
        <Card
          hue={palette.sand}
          icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
          title={t.app.catalog.flavors}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.catalog.flavorsHint}</Text>

          {loading ? null : (data?.flavors ?? []).length === 0 ? (
            <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
              {t.app.catalog.noFlavors}
            </Text>
          ) : (
            etiquetas(data?.flavors ?? [])
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
                  () => saveFlavor(empresaDaqui(), { name: novoSabor }),
                  () => setNovoSabor(''),
                )
              }
            />
          </View>
        </Card>
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});

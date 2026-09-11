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
  listCategories,
  listFlavors,
  listLines,
  listTypes,
  saveCategory,
  saveFlavor,
  saveLine,
  saveType,
  NomeJaCadastradoError,
  CategoryIsFromAnotherLineError,
  TypeIsFromAnotherLineError,
  type Flavor,
  type ProductCategory,
  type ProductLine,
  type ProductType,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { meioDaGrade } from '@/components/grade';
import { parseTyped } from '@/domain/number';
import { tiersFromCounts, type PackagingHierarchy } from '@/domain/units';
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

type Loaded = {
  lines: ProductLine[];
  categories: ProductCategory[];
  types: ProductType[];
  flavors: Flavor[];
};

function Catalog() {
  const { color, type, space, palette, traco } = useTheme();
  const { t } = useLocale();

  const [lineId, setLineId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [novaCategoria, setNovaCategoria] = useState('');
  /**
   * O tipo novo é da CATEGORIA escolhida, ou do produto inteiro?
   *
   * Só aparece quando existe categoria — sem ela não há duas respostas, e uma pergunta
   * com uma resposta só é um toque cobrado por nada. Mesmo desenho que `saborNaLinha`.
   */
  const [tipoNoProduto, setTipoNoProduto] = useState(false);
  const [novaLinha, setNovaLinha] = useState('');
  const [novoTipo, setNovoTipo] = useState('');
  const [novoSabor, setNovoSabor] = useState('');
  /**
   * Onde a variação nova vale: só no tipo escolhido, ou na linha inteira.
   *
   * As duas existem porque as duas fábricas existem, e o dono nomeou as duas no mesmo
   * dia. O picolé de leite tem morango que o de água não tem — variação DO TIPO. O pote
   * de sorvete de ameixa sai em 250 e em 500 ml com a MESMA ficha — variação da LINHA,
   * cadastrada uma vez. E há quem não use tipo nenhum: *"nao tem para mim, mas pode ter
   * para outras fabricas"*. Escolher um lado seria decidir por eles.
   *
   * O padrão é o tipo quando há tipo, porque é o mais estreito: errar para o estreito
   * mostra menos do que deveria e a pessoa corrige; errar para o largo oferece morango
   * de água no de leite, que é o que ele pediu para travar.
   */
  const [alcanceDoSabor, setAlcanceDoSabor] = useState<'tipo' | 'categoria' | 'produto'>('tipo');
  /**
   * O cartão da categoria ABERTO na mão — e o padrão é fechado.
   *
   * Decisão do dono, 11 de setembro, sobre um cartão que na fábrica dele lia "nenhuma
   * categoria aqui — e tudo bem" para sempre: um cartão inteiro a explicar um nível que
   * a maioria não usa é o mesmo defeito do alerta inventado, ensinando a não olhar. Com
   * ele fechado, quem não usa nunca vê; quem precisa paga um toque para descobrir.
   *
   * É grudento de propósito: quem abriu está em modo "quero categoria", e trocar de
   * produto não o tira desse modo. Fechar sozinho faria o toque ser cobrado de novo.
   */
  const [categoriaAberta, setCategoriaAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * Como a família escolhida é embalada — e por que ela mora AQUI.
   *
   * A grade existia para compor o nome do produto e nada além disso, então
   * "quantos cabem numa caixa" era perguntado a cada produto cadastrado, com um
   * padrão inventado. A resposta depende da família — picolé próprio numa caixa,
   * picolé de revenda na caixa do fornecedor, pote sem caixa nenhuma —, e
   * "depende" vira dado nesta casa. Definida uma vez, o cadastro do produto
   * nasce preenchido.
   *
   * Vazio é resposta legítima e quer dizer "esta família não se conta por
   * caixa": é o caso do pote, e é o que impede a tela de afirmar uma caixa que
   * não existe.
   */
  const [porCaixa, setPorCaixa] = useState('');
  const [porEngradado, setPorEngradado] = useState('');
  const [linhaEditada, setLinhaEditada] = useState<string | null>(null);

  const { data, loading, error, refresh } = useQuery<Loaded>(async () => {
    const [lines, categories, types, flavors] = await Promise.all([
      listLines(empresaDaqui()),
      listCategories(empresaDaqui()),
      listTypes(empresaDaqui()),
      listFlavors(empresaDaqui()),
    ]);
    return { lines, categories, types, flavors };
  });

  // Nenhum campo nasce vazio, e nenhuma pergunta nasce sem contexto: a linha
  // escolhida é a primeira, porque uma fábrica que tem uma linha só nunca
  // deveria ter de escolhê-la.
  const linhaAtiva = data?.lines.find((l) => l.id === lineId) ?? data?.lines[0] ?? null;

  // Trocar de família recarrega os campos com o que ELA guarda — durante a
  // renderização, que é o padrão do React para estado que depende de uma
  // propriedade que mudou.
  if (linhaAtiva && linhaAtiva.id !== linhaEditada) {
    setLinhaEditada(linhaAtiva.id);
    const caixa = linhaAtiva.packaging?.tiers.find((x) => x.id === 'box') ?? null;
    const engradado = linhaAtiva.packaging?.tiers.find((x) => x.id === 'crate') ?? null;
    setPorCaixa(caixa ? String(caixa.perBaseUnit) : '');
    setPorEngradado(caixa && engradado ? String(Math.round(engradado.perBaseUnit / caixa.perBaseUnit)) : '');
  }

  /** O que vai para o banco: sem caixa, a família só tem a unidade. */
  /**
   * Os degraus de embalagem da família — e o do meio é OPCIONAL.
   *
   * A versão anterior só criava engradado se houvesse caixa (`faixas.length > 1`), e isso
   * é a suposição de que toda família tem três degraus. O dono descreveu a fábrica do pai
   * e ela tem duas formas diferentes: o picolé vai unidade → caixa de 44 → engradado de 6
   * caixas (264), e o pote vai *"em engradados ou unidades mesmo"* — dois degraus, sem
   * caixa no meio. Com a regra velha, o engradado do pote era silenciosamente descartado.
   *
   * **E o segundo campo muda de significado conforme o primeiro**, que é por que o rótulo
   * dele também muda: com caixa, "por engradado" são CAIXAS por engradado (e o total é a
   * multiplicação); sem caixa, são UNIDADES por engradado. Um campo que quer dizer duas
   * coisas com o mesmo rótulo é o tipo de armadilha que só aparece quando o número sai
   * errado no estoque de alguém.
   */
  const embalagemDaFamilia = (): PackagingHierarchy =>
    tiersFromCounts(parseTyped(porCaixa) ?? NaN, parseTyped(porEngradado) ?? NaN);
  const categoriasDaLinha = (data?.categories ?? []).filter((c) => c.lineId === linhaAtiva?.id);
  /**
   * A categoria que está valendo — e VAZIA é o caso comum, não um estado pela metade.
   *
   * A decisão do dono de 11 de setembro diz que nenhuma subclasse é obrigatória, e a
   * fábrica dele não usa categoria nenhuma. Com uma categoria só ela já vem escolhida,
   * pela mesma razão do tipo: nenhuma pergunta com resposta única.
   */
  const categoriaAtiva =
    categoriasDaLinha.find((c) => c.id === categoryId) ??
    (categoriasDaLinha.length === 1 ? categoriasDaLinha[0] : null);
  /**
   * O cartão da categoria aparece se houver categoria, ou se alguém pedir.
   *
   * Categoria cadastrada manda: dado que existe não se esconde atrás de um convite, e um
   * cartão que se fechasse sozinho sobre o que a fábrica já usa seria a tela escondendo o
   * trabalho dela.
   */
  const mostrarCategoria = categoriasDaLinha.length > 0 || categoriaAberta;
  /**
   * Os tipos que valem aqui: os da categoria escolhida MAIS os do produto inteiro.
   *
   * Tipo sem categoria não é tipo mal cadastrado — é tipo que vale em todo o produto,
   * que é o que a fábrica do dono tem. Escondê-lo quando há uma categoria faria a lista
   * voltar vazia para quem nunca usou o nível.
   */
  const tiposDaLinha = (data?.types ?? []).filter(
    (t) =>
      t.lineId === linhaAtiva?.id &&
      (t.categoryId === null || t.categoryId === categoriaAtiva?.id),
  );
  /**
   * O tipo que está valendo — e ele nunca fica apontando para fora da linha.
   *
   * Trocar de linha sem isto deixaria `typeId` preso ao tipo da linha anterior, e o
   * cartão de baixo cadastraria sabor no lugar errado sem uma palavra. Nenhum campo
   * nasce vazio: com uma linha escolhida e um tipo só, ele já vem escolhido.
   */
  const tipoAtivo =
    tiposDaLinha.find((t) => t.id === typeId) ?? (tiposDaLinha.length === 1 ? tiposDaLinha[0] : null);
  /**
   * O que vale aqui: as variações da LINHA inteira mais as do tipo escolhido.
   *
   * Os órfãos da regra antiga (sem linha e sem tipo) continuam aparecendo, porque sumir
   * com o dado de alguém é pior que mostrá-lo fora de lugar — e quem grava hoje não
   * consegue mais criar um assim.
   */
  const saboresDoTipo = (data?.flavors ?? []).filter(
    (s) =>
      (s.lineId === null && s.typeId === null) ||
      (s.lineId === linhaAtiva?.id &&
        (s.typeId === null || s.typeId === tipoAtivo?.id) &&
        (s.categoryId === null || s.categoryId === categoriaAtiva?.id)),
  );
  /**
   * Os alcances que a variação nova PODE ter aqui, e nada além deles.
   *
   * Onde não há escolha não se pergunta: sem categoria e sem tipo escolhidos, a variação
   * é do produto inteiro e não há pergunta nenhuma. Com um dos dois, são duas opções;
   * com os dois, três. A ordem é a da cadeia — do mais estreito para o mais largo —,
   * porque errar para o estreito mostra menos do que deveria e a pessoa corrige; errar
   * para o largo oferece morango de água no de leite, que é o que o dono mandou travar.
   */
  const alcances: ('tipo' | 'categoria' | 'produto')[] = [
    ...(tipoAtivo ? (['tipo'] as const) : []),
    ...(categoriaAtiva ? (['categoria'] as const) : []),
    'produto',
  ];
  /**
   * O alcance que vale — e ele nunca fica apontando para um nível que sumiu.
   *
   * Trocar de produto ou de categoria pode tirar o tipo da tela; sem isto, `alcanceDoSabor`
   * continuaria em `'tipo'` e a gravação estreitaria num tipo que ninguém escolheu.
   */
  const alcanceValendo = alcances.includes(alcanceDoSabor) ? alcanceDoSabor : alcances[0];
  const nomeDoAlcance = (a: 'tipo' | 'categoria' | 'produto') =>
    a === 'tipo'
      ? fill(t.app.catalog.scopeType, { type: tipoAtivo?.name ?? '' })
      : a === 'categoria'
        ? fill(t.app.catalog.scopeCategory, { category: categoriaAtiva?.name ?? '' })
        : fill(t.app.catalog.scopeLine, { line: linhaAtiva?.name ?? '' });

  // `limpar` é opcional: guardar a embalagem da família não esvazia campo
  // nenhum — os dois continuam mostrando o que acabou de ser guardado.
  const gravar = async (fn: () => Promise<unknown>, limpar: () => void = () => {}) => {
    setErro(null);
    try {
      await fn();
      limpar();
      refresh();
    } catch (e) {
      // Nome repetido é o erro que acontece de verdade, e ele já vem do banco:
      // o índice ignora caixa e espaço, então "morango" e "Morango " batem no
      // mesmo. A tela diz o que fazer em vez de repetir a mensagem do SQLite.
      //
      // **E o `String(e)` que estava aqui era a doença que `avisoDeFalha` existe para
      // curar, viva neste arquivo.** `saveType` recusa um tipo de outra linha com
      // `TypeIsFromAnotherLineError`, a frase para isso já estava escrita nos três
      // idiomas — e chegava à tela como `Error: type ... is from another line`, em
      // inglês, para quem está cadastrando sabor de picolé. Chave de dicionário sem
      // leitor e erro sem frase eram o mesmo defeito visto de dois lados.
      setErro(
        e instanceof TypeIsFromAnotherLineError
          ? t.app.catalog.typeFromAnotherLine
          : e instanceof CategoryIsFromAnotherLineError
            ? t.app.catalog.categoryFromAnotherLine
          : e instanceof NomeJaCadastradoError ||
              (e instanceof Error && /unique/i.test(e.message))
            ? t.app.catalog.duplicate
            : t.common.failureUnknown,
      );
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
  /**
   * Os níveis do meio do exemplo, pela MESMA função que a tela de gravar usa.
   *
   * Antes eram duas cópias da regra de composição, e o docblock de lá dizia por que elas
   * tinham de bater. Cópia que tem de bater é cópia que diverge: `meioDaGrade` faz a
   * conta uma vez, e é ela que deixa a categoria aparecer no nome sem multiplicar o
   * molde do dicionário por oito.
   */
  const meioDoExemplo = meioDaGrade(categoriasDaLinha[0]?.name ?? null, primeiroTipo?.name ?? null);
  const exemplo = !linhaAtiva
    ? null
    : meioDoExemplo && primeiroSabor
      ? fill(t.app.catalog.composed, {
          line: linhaAtiva.name,
          type: meioDoExemplo,
          flavor: primeiroSabor.name,
        })
      : primeiroSabor
        ? fill(t.app.catalog.composedNoType, {
            line: linhaAtiva.name,
            flavor: primeiroSabor.name,
          })
        : meioDoExemplo
          ? fill(t.app.catalog.composedNoFlavor, {
              line: linhaAtiva.name,
              type: meioDoExemplo,
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
    <CollapsingHeader
      cena="produtos"
      title={t.app.catalog.title}
      overline={t.app.catalog.overline}
      erro={error}
      denovo={refresh}
    >
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

          {/* COMO ESTA FAMÍLIA É EMBALADA — e é aqui que a grade deixa de ser só
              um nome. Definida uma vez, todo produto da linha nasce com ela e a
              tela de cadastro para de perguntar. Vazio quer dizer "não se conta
              por caixa", que é o caso do pote. */}
          {linhaAtiva ? (
            <View style={{ marginTop: space.lg, gap: space.md }}>
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {fill(t.app.catalog.packing, { line: linhaAtiva.name })}
              </Text>
              <Field
                label={t.app.catalog.perBox}
                value={porCaixa}
                onChangeText={setPorCaixa}
                keyboardType="numeric"
                hint={t.app.catalog.packingHint}
              />
              <Field
                label={
                  (parseTyped(porCaixa) ?? 0) > 1
                    ? t.app.catalog.perCrate
                    : t.app.catalog.perCrateNoBox
                }
                value={porEngradado}
                onChangeText={setPorEngradado}
                keyboardType="numeric"
              />
              <Button
                label={t.app.catalog.savePacking}
                variant="ghost"
                onPress={() =>
                  gravar(() =>
                    saveLine(empresaDaqui(), {
                      id: linhaAtiva.id,
                      name: linhaAtiva.name,
                      packaging: embalagemDaFamilia(),
                    }),
                  )
                }
              />
            </View>
          ) : null}

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

      {/* Categoria: o corte OPCIONAL entre o produto e o tipo, e ela NASCE FECHADA.
          Ela existe porque "tipo" carregava duas naturezas — Leite/Água/Skimo mudam a
          RECEITA, 250 e 500 ml mudam só o TAMANHO — e uma palavra para as duas fazia a
          tela parecer arbitrária. Decisão do dono, 11 de setembro, nas duas metades: a
          cadeia primeiro, o significado de cada nível depois.

          **E o cartão fechado é a segunda decisão dele do mesmo dia.** A versão anterior
          ficava de pé mesmo vazio, pelo argumento de não esconder o caminho de quem
          precisa do nível — e na fábrica dele isso era um cartão inteiro dizendo "nenhuma
          categoria aqui" para sempre. Um convite de uma linha não esconde caminho nenhum:
          ele o cobra por um toque, de quem de fato vai andar nele.

          Com categoria cadastrada não há convite: não se fecha o que já tem dado dentro. */}
      {!mostrarCategoria ? (
        <Reveal index={3}>
          <View style={{ alignItems: 'flex-start' }}>
            <Button
              label={t.app.catalog.categoriesInvite}
              variant="ghost"
              onPress={() => setCategoriaAberta(true)}
            />
          </View>
        </Reveal>
      ) : (
      <Reveal index={3}>
        <Card
          hue={palette.sand}
          icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
          title={
            linhaAtiva
              ? fill(t.app.catalog.categories, { line: linhaAtiva.name })
              : t.app.catalog.categoriesTitle
          }
        >
          {loading ? null : (
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {linhaAtiva ? t.app.catalog.categoriesHint : t.app.catalog.noLineYet}
            </Text>
          )}

          {linhaAtiva ? (
            <>
              {categoriasDaLinha.length === 0 ? (
                <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
                  {t.app.catalog.noCategories}
                </Text>
              ) : (
                <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
                  {categoriasDaLinha.map((c) => (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        setCategoryId(c.id);
                        // Trocar de categoria solta o tipo: o tipo da categoria
                        // anterior não vale nesta, e mantê-lo escolhido cadastraria
                        // variação no lugar errado sem uma palavra.
                        setTypeId(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: c.id === categoriaAtiva?.id }}
                      accessibilityLabel={c.name}
                    >
                      <Chip signal={c.id === categoriaAtiva?.id ? 'ok' : 'neutral'} label={c.name} />
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={{ marginTop: space.lg, gap: space.md }}>
                <Field
                  label={t.app.catalog.addCategory}
                  value={novaCategoria}
                  onChangeText={setNovaCategoria}
                  placeholder={t.app.catalog.namePlaceholder}
                />
                <Button
                  label={t.app.catalog.addCategory}
                  variant="ghost"
                  disabled={novaCategoria.trim().length === 0}
                  onPress={() =>
                    gravar(
                      () =>
                        saveCategory(empresaDaqui(), {
                          lineId: linhaAtiva.id,
                          name: novaCategoria,
                        }),
                      () => setNovaCategoria(''),
                    )
                  }
                />
              </View>
            </>
          ) : null}
        </Card>
      </Reveal>
      )}

      {/* Tipo: o que divide a linha escolhida.
          Sem linha nenhuma não há tipo para cadastrar — o banco não aceitaria —
          mas o cartão fica de pé dizendo o que fazer primeiro. Sumir com ele
          esconderia o caminho, que é o erro que a tela de relatórios já
          cometeu. */}
      <Reveal index={4}>
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
                <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
                  {/* O tipo passou a ser ESCOLHA e não etiqueta, porque o sabor é
                      dele: "morango" do picolé de leite não é o "morango" do de água,
                      e o dono nomeou o motivo — sem travar, confunde na hora de
                      registrar. Mesmo papel de rádio da linha aqui em cima. */}
                  {tiposDaLinha.map((tp) => (
                    <Pressable
                      key={tp.id}
                      onPress={() => setTypeId(tp.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: tp.id === tipoAtivo?.id }}
                      accessibilityLabel={tp.name}
                    >
                      <Chip signal={tp.id === tipoAtivo?.id ? 'ok' : 'neutral'} label={tp.name} />
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={{ marginTop: space.lg, gap: space.md }}>
                <Field
                  label={t.app.catalog.addType}
                  value={novoTipo}
                  onChangeText={setNovoTipo}
                  placeholder={t.app.catalog.namePlaceholder}
                />
                {/* O alcance só é pergunta quando há categoria para estreitar — que é o
                    espelho exato do que a variação faz com o tipo logo abaixo. Sem
                    categoria não há duas respostas, e onde não há escolha não se
                    pergunta: é o que mantém quatro níveis em três toques para quem usa
                    três. */}
                {categoriaAtiva ? (
                  <View style={[styles.wrap, { gap: space.sm }]}>
                    {[false, true].map((noProduto) => (
                      <Pressable
                        key={noProduto ? 'produto' : 'categoria'}
                        onPress={() => setTipoNoProduto(noProduto)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: tipoNoProduto === noProduto }}
                        accessibilityLabel={
                          noProduto
                            ? fill(t.app.catalog.scopeWholeLine, { line: linhaAtiva.name })
                            : fill(t.app.catalog.scopeCategory, { category: categoriaAtiva.name })
                        }
                      >
                        <Chip
                          signal={tipoNoProduto === noProduto ? 'ok' : 'neutral'}
                          label={
                            noProduto
                              ? fill(t.app.catalog.scopeWholeLine, { line: linhaAtiva.name })
                              : fill(t.app.catalog.scopeCategory, { category: categoriaAtiva.name })
                          }
                        />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Button
                  label={t.app.catalog.addType}
                  variant="ghost"
                  disabled={novoTipo.trim().length === 0}
                  onPress={() =>
                    gravar(
                      () =>
                        saveType(empresaDaqui(), {
                          lineId: linhaAtiva.id,
                          categoryId: categoriaAtiva && !tipoNoProduto ? categoriaAtiva.id : null,
                          name: novoTipo,
                        }),
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
      <Reveal index={5}>
        <Card
          hue={palette.sand}
          icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
          title={
            tipoAtivo ? fill(t.app.catalog.flavors, { type: tipoAtivo.name }) : t.app.catalog.flavorsAll
          }
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>{t.app.catalog.flavorsHint}</Text>

          {loading ? null : !linhaAtiva ? (
            <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
              {t.app.catalog.noLineYet}
            </Text>
          ) : saboresDoTipo.length === 0 ? (
            <Text style={[type.body, { color: color.inkMuted, marginTop: space.md }]}>
              {t.app.catalog.noFlavors}
            </Text>
          ) : (
            etiquetas(saboresDoTipo)
          )}

          <View style={{ marginTop: space.lg, gap: space.md }}>
            <Field
              label={t.app.catalog.addFlavor}
              value={novoSabor}
              onChangeText={setNovoSabor}
              placeholder={t.app.catalog.namePlaceholder}
            />
            {/* O alcance só é pergunta quando há NÍVEL para estreitar — e agora são
                dois: a categoria e o tipo. Com nenhum dos dois escolhido a variação é do
                produto inteiro e não há escolha; onde não há escolha, não se pergunta.

                A categoria entrou aqui porque a regra aprovada em 11 de setembro a
                transformou no nível da receita: Leite sai de "tipo" e vem para cá, e sem
                este chip "morango só no leite" deixaria de existir — morango viraria
                variação do produto inteiro e voltaria a ser oferecido no de água. */}
            {alcances.length > 1 ? (
              <View style={[styles.wrap, { gap: space.sm }]}>
                {alcances.map((a) => (
                  <Pressable
                    key={a}
                    onPress={() => setAlcanceDoSabor(a)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: alcanceValendo === a }}
                    accessibilityLabel={nomeDoAlcance(a)}
                  >
                    <Chip
                      signal={alcanceValendo === a ? 'ok' : 'neutral'}
                      label={nomeDoAlcance(a)}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Button
              label={t.app.catalog.addFlavor}
              variant="ghost"
              disabled={novoSabor.trim().length === 0 || !linhaAtiva}
              onPress={() =>
                gravar(
                  () =>
                    saveFlavor(empresaDaqui(), {
                      lineId: linhaAtiva!.id,
                      categoryId: alcanceValendo === 'categoria' ? categoriaAtiva!.id : null,
                      typeId: alcanceValendo === 'tipo' ? tipoAtivo!.id : null,
                      name: novoSabor,
                    }),
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

import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphCustomer } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import {
  currentOperatorId,
  listPeople,
  listProfiles,
  matchPin,
  setCurrentOperator,
  type Person,
  type Profile,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import type { Dictionary } from '@/i18n';
import { fill } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { tintaSobre } from '@/theme/contraste';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * A grade de nomes — quem está com o aparelho agora.
 *
 * Decisão do dono, 1 de setembro: no chão de fábrica com celular compartilhado,
 * entra-se por uma grade de nomes com PIN, *"dois segundos, de luva, offline"*.
 * Esta tela é esses dois segundos.
 *
 * **O que ela é, dito antes do desenho:** atribuição, não autenticação. O estudo
 * de 6 de setembro (`docs/estudo-entrada.md`) mediu o que quatro dígitos podem
 * proteger num aparelho que seis pessoas dividem, e a resposta é: o toque errado
 * e a troca casual de nome. Nada mais, e a tela não finge o contrário — a frase
 * do cabeçalho diz para que o nome serve, e diz que não é para cobrar.
 *
 * **Alvos grandes, porque a mão está de luva a −18 °C.** Os nomes ocupam metade
 * da largura cada um e crescem com a tela em vez de esticar: a régua é `dp`, não
 * aparelho, e num tablet cabem três por linha sem nenhum número mágico.
 *
 * **O PIN aparece só para quem tem.** Pessoa sem PIN entra com um toque — é o
 * que uma fábrica de seis pessoas quer, e é a mesma decisão de sempre: "depende
 * de quem usa" vira dado, e os dois caminhos existem na mesma grade.
 *
 * **E dá para largar o aparelho.** Sem isso, o nome de quem saiu do turno fica
 * carimbando as caixas de quem entrou — que é pior que não nomear ninguém,
 * porque tem cara de informação.
 */
/**
 * Sair da grade — para a capa quando a grade é a ÚNICA tela da pilha.
 *
 * `app/_layout.tsx` chega aqui por `router.replace('/who')` na abertura, então a
 * pilha tem uma rota só, e `router.back()` não tem para onde voltar: o
 * expo-router enfileira GO_BACK e nada acontece. A pessoa toca no nome, a grade
 * diz "Agora é Ana" e fica ali — o modo compartilhado inteiro travado na porta.
 * Pelo caminho `/more → Trocar de pessoa` (um `push`) funcionava, que é por isso
 * que ninguém viu. Achado por leitura (E1) numa análise de olhos novos; a
 * checagem de navegador que abre `/who` direto e toca num nome é o que o prova.
 */
function sairDaGrade() {
  if (router.canGoBack()) router.back();
  else router.replace('/' as never);
}

export default function Who() {
  return (
    <AreaProvider area="mist">
      <Grade />
    </AreaProvider>
  );
}

type Carregado = { pessoas: Person[]; perfis: Profile[]; atual: string | null };

function Grade() {
  const { color, type, space, palette, traco, radius } = useTheme();
  const { t } = useLocale();
  const router = useRouter();
  const words = t.app.who;

  /**
   * Quantos nomes cabem por linha — em `dp`, não em aparelho.
   *
   * A primeira versão usava `flexBasis: 44%` com `flexGrow`, e a foto mostrou o
   * que o código escondia: **com uma pessoa só, a célula esticava para a largura
   * inteira** e a grade virava uma faixa. É o mesmo defeito que este projeto já
   * pagou noutra dimensão — coluna que serve a 393 dp virando tira a 800 —, e a
   * regra da casa é a mesma: a quebra é por `dp`, e a prova é a foto.
   *
   * As linhas são fatiadas na mão em vez de deixar o `wrap` decidir, porque com
   * `gap` a porcentagem transborda e a última linha fica com tamanhos
   * diferentes. Fatiando, todo nome tem a mesma área de toque — que é o que a
   * mão de luva pede.
   */
  const { width } = useWindowDimensions();
  const colunas = width >= 840 ? 4 : width >= 600 ? 3 : 2;

  const { data, refresh } = useQuery<Carregado>(async () => {
    const [pessoas, perfis, atual] = await Promise.all([
      listPeople(LOCAL_COMPANY_ID),
      listProfiles(LOCAL_COMPANY_ID),
      currentOperatorId(),
    ]);
    return { pessoas, perfis, atual };
  });

  /** Quem foi tocado e ainda não provou o PIN. Nulo é a grade em repouso. */
  const [pedindo, setPedindo] = useState<Person | null>(null);
  const [digitado, setDigitado] = useState('');
  const [errou, setErrou] = useState(false);

  const ativas = (data?.pessoas ?? []).filter((p) => p.active);
  const atual = ativas.find((p) => p.id === data?.atual) ?? null;

  const entrar = async (quem: Person) => {
    if (!(await matchPin(LOCAL_COMPANY_ID, quem.id, digitado))) {
      setErrou(true);
      return;
    }
    await setCurrentOperator(quem.id);
    setPedindo(null);
    setDigitado('');
    setErrou(false);
    sairDaGrade();
  };

  const tocar = async (quem: Person) => {
    setErrou(false);
    setDigitado('');
    // Sem PIN, um toque só. Abrir um teclado para não perguntar nada seria
    // cobrar dois segundos de quem escolheu não ter PIN.
    if (!quem.hasPin) {
      await setCurrentOperator(quem.id);
      sairDaGrade();
      return;
    }
    setPedindo(quem);
  };

  return (
    <CollapsingHeader cena="gente" title={words.title} overline={words.overline}>
      {/* Para que o nome serve, dito uma vez e no começo. O tom de voz aqui é o
          do projeto inteiro: orienta, não fiscaliza — e diz o que a coisa NÃO é,
          porque "seu nome fica gravado" sem essa frase soa a vigilância. */}
      <Reveal index={0}>
        <Card
          hue={palette.mist}
          icon={(c) => <GlyphCustomer size={26} color={c} weight={traco} />}
          title={atual ? fill(words.current, { name: atual.name }) : words.none}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>{words.hint}</Text>

          {atual ? (
            <Button
              label={words.leave}
              variant="ghost"
              onPress={async () => {
                await setCurrentOperator(null);
                refresh();
              }}
              style={{ marginTop: space.md }}
            />
          ) : null}
        </Card>
      </Reveal>

      {ativas.length === 0 ? (
        <Reveal index={1}>
          <Card hue={palette.mist} title={words.empty}>
            <Text style={[type.body, { color: color.inkMuted }]}>{words.emptyHint}</Text>
            <Button
              label={t.app.more.rows.people}
              variant="ghost"
              onPress={() => router.push('/people' as never)}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : (
        <Reveal index={1}>
          <View style={{ gap: space.md }}>
            {emLinhas(ativas, colunas).map((linha, i) => (
              <View key={i} style={[styles.linha, { gap: space.md }]}>
                {linha.map((quem) => {
                  const perfil = data?.perfis.find((p) => p.id === quem.profileId) ?? null;
                  const ativo = quem.id === atual?.id;
                  return (
                    <Pressable
                      key={quem.id}
                      onPress={() => void tocar(quem)}
                      accessibilityRole="button"
                      accessibilityLabel={quem.name}
                      style={({ pressed }) => [
                        styles.nome,
                        {
                          backgroundColor: ativo ? palette.mint : color.surface,
                          // A borda do escolhido era `color.ok`, e `ok` e `mint`
                          // são o MESMO hexadecimal nas duas peles claras — uma
                          // borda a 1,00:1 contra o próprio preenchimento, ou
                          // seja, borda nenhuma. Passou despercebida porque
                          // ninguém compara dois tokens de nomes diferentes.
                          borderColor: ativo ? color.ink : color.line,
                          borderRadius: radius.md,
                          paddingVertical: space.xl,
                          paddingHorizontal: space.md,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      {/* A tinta do nome é MEDIDA contra o fundo, não escolhida.
                          `color.ink` sobre o verde do escolhido dá 3,18:1 — e esta
                          é a tela do PIN, lida de luva a dezoito graus negativos,
                          que é o pior lugar do aplicativo para um nome ilegível.
                          `tintaSobre` é o que o botão já faz desde sempre. */}
                      <Text
                        style={[
                          type.cardTitle,
                          styles.meio,
                          { color: ativo ? tintaSobre(palette.mint, color.onAccent, color.ink) : color.ink },
                        ]}
                        numberOfLines={2}
                      >
                        {quem.name}
                      </Text>
                      {perfil ? (
                        <Text
                          style={[
                            type.caption,
                            styles.meio,
                            { color: color.inkFaint, marginTop: space.xs },
                          ]}
                          numberOfLines={1}
                        >
                          {nomeDoPerfil(perfil, t)}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
                {/* Os vãos da última linha. Sem eles, dois nomes numa linha de
                    três esticariam para preencher, e a mesma pessoa teria área
                    de toque diferente conforme a posição. */}
                {Array.from({ length: colunas - linha.length }, (_, k) => (
                  <View key={`vao-${k}`} style={styles.vao} />
                ))}
              </View>
            ))}
          </View>
        </Reveal>
      )}

      {/* O PIN, e só para quem tem. Ele aparece embaixo da grade e não por cima
          dela: quem tocou no nome errado vê a grade inteira ali e corrige com um
          toque, em vez de fechar um diálogo primeiro. */}
      {pedindo ? (
        <Reveal index={2}>
          <Card
            hue={errou ? color.warning : palette.mist}
            title={fill(words.pinAsk, { name: pedindo.name })}
          >
            <Field
              label={words.pinLabel}
              value={digitado}
              onChangeText={(next) => {
                setErrou(false);
                setDigitado(next);
              }}
              keyboardType="numeric"
              autoFocus
            />
            {errou ? (
              <View style={{ marginTop: space.sm }}>
                <Chip signal="warning" label={words.pinWrong} />
              </View>
            ) : null}
            <Button
              label={words.confirm}
              onPress={() => void entrar(pedindo)}
              disabled={digitado.trim().length === 0}
              weighty
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row' },
  // `flex: 1` numa linha fatiada dá a todos a mesma largura, com ou sem vão.
  nome: { flex: 1, borderWidth: StyleSheet.hairlineWidth },
  // O vão ocupa a coluna e NÃO se desenha: com a borda do nome, ele virava uma
  // caixa vazia ao lado do único nome cadastrado — a foto mostrou.
  vao: { flex: 1 },
  meio: { textAlign: 'center' },
});

/** Fatia a lista em linhas de tamanho fixo, para a grade ter colunas de verdade. */
function emLinhas<T>(itens: readonly T[], porLinha: number): T[][] {
  const linhas: T[][] = [];
  for (let i = 0; i < itens.length; i += porLinha) linhas.push(itens.slice(i, i + porLinha));
  return linhas;
}

/**
 * A palavra do perfil na grade.
 *
 * Os sete modelos nascem sem nome porque "Entregador" é palavra de TELA, em três
 * idiomas — a mesma decisão do lugar padrão. Quem renomeou vence; quem não
 * renomeou é traduzido aqui.
 */
function nomeDoPerfil(perfil: Profile, t: Dictionary): string {
  if (perfil.name) return perfil.name;
  return perfil.templateRole ? t.app.roles[perfil.templateRole] : '';
}

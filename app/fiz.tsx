import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { Field } from '@/components/Field';
import { GlyphKettle, GlyphProduction } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { empresaDaqui } from '@/data/empresa';
import { nowIso } from '@/data/db';
import { listItems, listProducts, listRecipes,
  onlyResells,
} from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import { degrausQueFaltam, type PrimeiroPasso } from '@/domain/briefing';
import { parseTyped } from '@/domain/number';
import { fill, formatQuantity } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import {
  CHAVE_DA_INTENCAO,
  escreverIntencao,
  lerIntencao,
  type Intencao,
} from '@/intencao';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Começar pelo FIM: a pessoa diz o que fez, e o aplicativo vai atrás do que falta.
 *
 * **Decisão do dono, 11 de setembro, e ela tem duas metades.** A primeira: os dois
 * caminhos existem — *"partir dos dois lados: inicio e fim, ambos valendo desde que o
 * resultado seja o mesmo"*. A segunda, que é a que decide o desenho: *"Seguir um passo
 * obrigatório q nao muda é mais seguro, apesar de mais longo"*. Então o passo a passo
 * continua sendo o PADRÃO, e esta tela é a porta alternativa — nunca a substituta.
 *
 * **Por que caminho próprio e não dentro da produção.** As duas formas foram medidas e
 * postas para ele. Criar dentro da tela de produção respeita a razão escrita dela de não
 * navegar (item 7), mas engorda permanentemente a tela que a fábrica usa TODO DIA para
 * resolver um problema que acontece uma vez por fábrica. Este caminho aparece quando serve
 * e desaparece quando não serve — a mesma regra da categoria e do `degraus()`.
 *
 * **E a medida que mudou o que esta tela promete.** `recordProduction` recusa produto sem
 * ficha, e o custo congelado da corrida depende dos ingredientes. Então começar pelo fim
 * **não economiza cadastro: ele reordena.** A promessa honesta não é "sete cadastros viram
 * um" — é "os sete acontecem na ordem de quem faz, começando pelo que acabou de sair do
 * tacho", e com a escada à vista, porque metade do peso de *"eu não consigo fazer
 * absolutamente nada"* é não saber quantos degraus faltam.
 *
 * **A invariante do dono é o que torna isto verificável**, e ela é estrutural aqui: esta
 * tela não grava movimento nenhum. Ela leva à `app/production/new.tsx`, que é a única que
 * chama `recordProduction` — então a mesma produção pelos dois caminhos deixa o livro-razão
 * idêntico por construção, e não por coincidência. `src/caminho.test.ts` cobra isso.
 */
export default function FizScreen() {
  return (
    <AreaProvider area="apricot">
      <Fiz />
    </AreaProvider>
  );
}

type Loaded = { insumos: number; fichas: number; produtos: number; soRevende: boolean };

/** Cada degrau com a porta dele. Mesma tabela do primeiro passo da capa, e de propósito. */
const PORTA: Record<PrimeiroPasso, string> = {
  insumo: '/inputs/new',
  ficha: '/recipes/new',
  produto: '/products/new',
  producao: '/production/new',
};

function Fiz() {
  const { color, type, space, palette, traco } = useTheme();
  const { t, locale } = useLocale();
  const words = t.app.fiz;
  const router = useRouter();
  const confirm = useConfirm();

  const { data, loading, error, refresh } = useQuery<Loaded>(async () => {
    const [items, fichas, produtos, soRevende] = await Promise.all([
      listItems(empresaDaqui()),
      listRecipes(empresaDaqui()),
      listProducts(empresaDaqui()),
      // O mesmo interruptor da capa, e pela mesma razão: a distribuidora não é cobrada por
      // uma corrente que não é dela. As duas telas fazem a MESMA pergunta, e é por isso que
      // quem responde é o domínio.
      onlyResells(),
    ]);
    return {
      insumos: items.filter((i) => i.kind === 'input' || i.kind === 'packaging').length,
      fichas: fichas.length,
      /**
       * Produto que dá para PRODUZIR, e não produto cadastrado.
       *
       * `recordProduction` recusa produto sem ficha — *"é revenda: não se produz"* — e
       * contar revenda aqui faria a escada dizer "está tudo pronto" e a tela seguinte
       * responder "nenhum produto tem ficha técnica ainda". É o mesmo defeito que a capa
       * do primeiro dia já tinha cometido, um degrau mais estreito.
       */
      produtos: produtos.filter((p) => p.recipeId).length,
      soRevende,
    };
  });

  /**
   * A intenção vem do armazenamento do aparelho, não do banco.
   *
   * `null` quer dizer duas coisas diferentes — "ainda não li" e "não existe" —, e a tela
   * precisa separá-las: com a leitura pendente, o formulário não pode aparecer, senão ele
   * pisca por cima de uma frase que já existia.
   */
  const [intencao, setIntencao] = useState<Intencao | null>(null);
  const [lida, setLida] = useState(false);
  const [oQue, setOQue] = useState('');
  const [quanto, setQuanto] = useState('');

  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(CHAVE_DA_INTENCAO)
      .then((bruto) => {
        if (!vivo) return;
        setIntencao(lerIntencao(bruto, nowIso()));
        setLida(true);
      })
      // Armazenamento que não responde não pode travar a porta: sem a frase, a tela é o
      // formulário de entrada, que é exatamente o estado de quem chega pela primeira vez.
      .catch(() => {
        if (vivo) setLida(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const guardar = async () => {
    const nova: Intencao = {
      oQue: oQue.trim(),
      quanto: parseTyped(quanto) ?? null,
      quando: nowIso(),
    };
    setIntencao(nova);
    await AsyncStorage.setItem(CHAVE_DA_INTENCAO, escreverIntencao(nova));
  };

  const esquecer = async () => {
    const certo = await confirm({
      title: words.forgetConfirm,
      message: words.forgetBody,
      confirmLabel: words.forgetYes,
    });
    if (!certo) return;
    setIntencao(null);
    setOQue('');
    setQuanto('');
    await AsyncStorage.removeItem(CHAVE_DA_INTENCAO);
  };

  const preparo = data ?? { insumos: 0, fichas: 0, produtos: 0, soRevende: false };
  const faltam = degrausQueFaltam(preparo);
  const TODOS: PrimeiroPasso[] = ['insumo', 'ficha', 'produto', 'producao'];
  const agora: PrimeiroPasso = faltam[0] ?? 'producao';
  const nomeDoDegrau: Record<PrimeiroPasso, string> = {
    insumo: words.stepInput,
    ficha: words.stepRecipe,
    produto: words.stepProduct,
    producao: words.stepProduction,
  };

  /**
   * A porta do degrau de agora — e a quantidade viaja por parâmetro até a produção.
   *
   * É o único lugar onde a intenção alcança outra tela, e é por parâmetro de rota de
   * propósito: fazer a tela de produção ler o armazenamento a acoplaria a esta, e ela é a
   * tela do dia a dia. Um número na ligação é aditivo e local.
   */
  const porta =
    agora === 'producao' && intencao?.quanto
      ? `${PORTA.producao}?quanto=${intencao.quanto}`
      : PORTA[agora];

  return (
    <CollapsingHeader
      cena="producao"
      title={words.title}
      overline={words.overline}
      erro={error}
      denovo={refresh}
    >
      {/* A frase primeiro, porque é o que a pessoa vem fazer. Sem ela, a escada seria uma
          lista de tarefas sem dono — e a queixa que abriu isto era justamente essa. */}
      <Reveal index={0}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphKettle size={26} color={c} weight={traco} />}
          title={words.title}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>{words.intro}</Text>

          {!lida ? null : intencao ? (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Text style={[type.body, { color: color.ink }]}>
                {intencao.quanto
                  ? fill(words.doingWithCount, {
                      what: intencao.oQue,
                      count: formatQuantity(intencao.quanto, locale),
                    })
                  : fill(words.doing, { what: intencao.oQue })}
              </Text>
              {/* A saída nunca é escondida: intenção não é compromisso, e esconder o
                  desfazer é o que faz gente ter medo de começar. */}
              <View style={{ alignItems: 'flex-start' }}>
                <Button label={words.forget} variant="ghost" onPress={esquecer} />
              </View>
            </View>
          ) : (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Field
                label={words.what}
                value={oQue}
                onChangeText={setOQue}
                placeholder={words.whatPlaceholder}
              />
              <Field
                label={words.howMany}
                value={quanto}
                onChangeText={setQuanto}
                keyboardType="numeric"
                placeholder=""
              />
              <Text style={[type.caption, { color: color.inkMuted }]}>{words.howManyHint}</Text>
              <Button
                label={words.start}
                disabled={oQue.trim().length === 0}
                onPress={() => void guardar()}
              />
            </View>
          )}
        </Card>
      </Reveal>

      {/* A escada, e ela só existe depois da frase: mostrar o caminho antes de saber para
          onde se vai é dar tarefa a quem não pediu. */}
      {intencao ? (
        <Reveal index={1}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphProduction size={26} color={c} weight={traco} />}
            title={words.chainTitle}
          >
            {loading ? null : (
              <>
                <Text style={[type.caption, { color: color.inkMuted }]}>
                  {faltam.length === 0
                    ? words.nothingMissing
                    : fill(words.missing, {
                        done: formatQuantity(TODOS.length - 1 - faltam.length, locale),
                        total: formatQuantity(TODOS.length - 1, locale),
                      })}
                </Text>

                <View style={{ marginTop: space.md, gap: space.sm }}>
                  {TODOS.map((degrau) => {
                    const pendente = faltam.includes(degrau);
                    const ehAgora = degrau === agora;
                    return (
                      <View
                        key={degrau}
                        style={[styles.linha, { gap: space.sm, alignItems: 'center' }]}
                      >
                        {/* O estado dito por PALAVRA e não só por cor: é a régua desta
                            casa, e num celular de fábrica sob luz ruim é a única que
                            chega. Verde aqui quer dizer "já existe", nunca "conferido". */}
                        <Chip
                          signal={ehAgora ? 'warning' : pendente ? 'neutral' : 'ok'}
                          label={ehAgora ? words.now : pendente ? words.next : words.done}
                        />
                        <Text
                          style={[
                            type.body,
                            {
                              color: ehAgora ? color.ink : color.inkMuted,
                              fontWeight: ehAgora ? '600' : '400',
                              flexShrink: 1,
                            },
                          ]}
                        >
                          {nomeDoDegrau[degrau]}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={{ marginTop: space.lg }}>
                  <Button
                    label={agora === 'producao' ? nomeDoDegrau.producao : words.go}
                    onPress={() => router.push(porta as never)}
                  />
                </View>
              </>
            )}
          </Card>
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', flexWrap: 'wrap' },
});

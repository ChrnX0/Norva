import Constants from 'expo-constants';
import { router } from 'expo-router';
import { avisoDeFalha } from '@/i18n/falha';
import { ERROS } from '@/data/erros';
import { voltar } from '@/nav';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  GlyphCalendar,
  GlyphCatalog,
  GlyphCount,
  GlyphCustomer,
  GlyphFactory,
  GlyphLoss,
  GlyphOrder,
  GlyphPurchase,
  GlyphSettings,
  GlyphThermometer,
} from '@/components/Glyph';
import { IconChevron } from '@/components/icons';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { brand } from '@/config/brand';
import {
  alertSettings,
  porQueNaoAgendou,
  briefingHalf,
  briefingHidden,
  briefingOrder,
  countForErase,
  listPlaces,
  eraseArea,
  consumoDaProducao,
  floorSignIn,
  namesWhoRecorded,
  setConsumoDaProducao,
  ordersNeedApproval,
  currentCapabilities,
  eraseGraceDays,
  purchaseSafetyDays,
  setBriefingHalf,
  setBriefingHidden,
  setAlertSettings,
  setBriefingOrder,
  setFloorSignIn,
  setNamesWhoRecorded,
  setOrdersNeedApproval,
  setEraseGraceDays,
  setPurchaseSafetyDays,
  onlyResells,
  setOnlyResells,
} from '@/data/repository';
import { escolherUnidade, unidadeDaqui } from '@/data/unidade';
import { agreedOn, toggleDay } from '@/domain/agreement';
import { INTERNAL_PLACE_KINDS, ehUnidade } from '@/domain/ledger';
import { parseTyped } from '@/domain/number';
import type { AlertKind, AlertSettings } from '@/domain/alerts';
import { useAppearance } from '@/theme/Appearance';
import {
  addWidget,
  aceitaMeia,
  briefingFilas,
  briefingLayout,
  moveWidget,
  widgetsOffCover,
  type BriefingWidget,
} from '@/domain/briefing';
import { ALVO, hues, skins, type Skin } from '@/theme/tokens';
import {
  blockerFor,
  EraseBlockedError,
  isEmpty,
  tallyFor,
  type EraseArea,
  type EraseBlocker,
  type EraseCounts,
  type EraseTally,
  TALLY_KEYS,
} from '@/data/erase';
import { exampleStillHere, restoreStarterData } from '@/data/seed';
import { empresaAdotada, empresaDaqui } from '@/data/empresa';
import { pendingCount, rejectedCount } from '@/data/outbox';
import { contaAtual } from '@/sync/conta';
import { drain, type ParouPorque } from '@/sync/engine';
import { transporte } from '@/sync/transporte';
import { HORIZONTE_DE_TESTE, simulateHistory } from '@/data/simulate';
import { empurrar } from '@/data/configuracao';
import { useQuery } from '@/data/useQuery';
import { fill, formatMoney, formatQuantity, formatWeekdayShort, joinList, plural } from '@/i18n';
import type { Dictionary, LanguageTag } from '@/i18n';
import { CURRENCIES, formattingFor } from '@/i18n/company';
import { useLocaleChoice } from '@/i18n/Locale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Ajustes: a cara do aplicativo, as peças da capa, os avisos, e o que apaga.
 *
 * O corpo antigo era sete retângulos de parágrafo cinza, cada um com os seus
 * próprios `borderWidth`, `borderRadius` e `backgroundColor` — inclusive uma
 * família de pílulas desenhadas à mão para os dias de antecedência e para os
 * dias da semana. Nada disso sabia que o aplicativo tem duas caras: no Papel as
 * caixas continuavam aparecendo, que é exatamente o que o dono circulou.
 * Agora quem desenha caixa é o `Card`, quem desenha pílula é o `Chip`, e quem
 * desenha ação é o `Button` — nas duas identidades, de graça.
 *
 * Uma coisa mudou de estrutura, e não de pintura: **a contagem e a exclusão
 * viraram a mesma lista.** A tela antiga dizia "Insumos 6, Receitas 2, Produtos
 * 1, Compras 4" num cartão e repetia as mesmas quatro áreas noutro cartão logo
 * abaixo para apagar — duas listas com os mesmos quatro nomes, e o e2e precisou
 * de um comentário explicando qual "Produtos" clicar. Uma linha só responde as
 * duas coisas: quantos existem, e a saída para apagá-los.
 *
 * E o que não tem dado não vira cartão: com o cadastro vazio, a contagem de
 * quatro zeros e o botão de apagar tudo desabilitado saem da tela, e sobra o
 * convite de trazer o exemplo de volta. Lei 5 — erro que impede, não que
 * reclama.
 *
 * Duas regras do desenho continuam mandando aqui:
 *   - o que destrói pergunta num diálogo centralizado, a única exceção
 *     deliberada ao "tudo sobe de baixo"
 *   - a confirmação diz o que desaparece, contado, por extenso: "isso apaga 6
 *     insumos, 2 receitas e 1 produto", nunca "confirmar exclusão?"
 */
export default function SettingsScreen() {
  return (
    <AreaProvider area="mist">
      <Settings />
    </AreaProvider>
  );
}

/**
 * Os três idiomas, na ordem em que o produto os oferece.
 *
 * O nome de cada um está NA língua dele — "Español", não "Espanhol": quem procura
 * o próprio idioma numa lista o reconhece escrito como ele se escreve, e não
 * precisa saber ler o idioma atual para achar o seu.
 */
const LANGUAGES: readonly (readonly [LanguageTag, string])[] = [
  ['pt-BR', 'Português'],
  ['es', 'Español'],
  ['en', 'English'],
];

const AREAS: { area: Exclude<EraseArea, 'all'> }[] = [
  { area: 'purchases' },
  { area: 'recipes' },
  { area: 'products' },
  { area: 'inputs' },
];

/** Puts the blocker into words - the reason and the count, in one sentence. */
/**
 * O que acontece NO SERVIDOR quando alguém apaga — dito com o número.
 *
 * Quatro estados, e cada um é uma frase diferente porque cada um é um fato
 * diferente. Enquanto este aparelho não está ligado a uma empresa de verdade, o
 * livro está só aqui e é isso que a frase diz; a partir daí, quem manda é o prazo
 * que a empresa escolheu: dez dias de padrão, zero destrói junto, e nulo é *"nunca
 * destrói no servidor"* — o Reset vale só neste aparelho.
 *
 * A frase antiga era fixa e dizia *"este aparelho é o único lugar onde eles estão"*.
 * Verdadeira em 7 de setembro de manhã, falsa na primeira sincronização — e é a
 * segunda confirmação de um apagamento irrecuperável, que é o pior lugar do
 * aplicativo para uma frase que envelheceu.
 */
function dizOServidor(prazo: number | null, t: Dictionary): string {
  if (!empresaAdotada()) return t.app.settings.registroOnlyHere;
  if (prazo === null) return t.app.settings.registroServerNever;
  if (prazo === 0) return t.app.settings.registroServerNow;
  return fill(t.app.settings.registroServerWait, { days: String(prazo) });
}

function sayBlocker(blocker: EraseBlocker, t: Dictionary): string {
  const words = t.app.settings;

  const say = plural;

  switch (blocker.reason) {
    case 'recipesUseInputs':
      return say(blocker.count, words.blocked.recipesUseInputs);
    case 'purchasesUseInputs':
      return say(blocker.count, words.blocked.purchasesUseInputs);
    case 'productsUseRecipes':
      return say(blocker.count, words.blocked.productsUseRecipes);
    case 'purchasesUseProducts':
      return words.blocked.purchasesUseProducts;
  }
}

/** "Isso apaga 6 insumos, 2 receitas e 1 produto." plus what else goes with it. */
function sayTally(area: EraseArea, tally: EraseTally, t: Dictionary): string {
  const words = t.app.settings;
  if (isEmpty(tally)) return area === 'all' ? words.alreadyEmpty : words.nothingToErase;

  // **A frase percorre a MESMA lista que a contagem.**
  //
  // Eram dez chamadas escritas à mão para catorze chaves: gente, lotes, pedidos e
  // transportadoras eram contados pelo repositório, apagados pelo `tablesFor('all')`
  // — e não apareciam. A segunda confirmação de "apagar tudo", o único lugar onde
  // alguém lê o que vai perder, omitia a grade de nomes com PIN.
  //
  // A ordem de impressão é a de `TALLY_KEYS`: o que dói primeiro (movimento antes
  // dos cadastros), e por último o que a pessoa reconhece menos rápido — a folha se
  // lê de cima para baixo. Chave nova sem palavra no dicionário passa a não compilar,
  // que é o mecanismo do `Widen<T>` desta casa, em vez de sumir em silêncio.
  const parts: string[] = [];
  for (const key of TALLY_KEYS) {
    const n = tally[key];
    if (n > 0) parts.push(plural(n, words.counted[key]));
  }

  const what = joinList(parts, t.common.and);
  const sentence =
    area === 'purchases'
      ? words.alsoPurchases
      : area === 'recipes'
        ? words.alsoRecipes
        : area === 'inputs'
          ? words.alsoInputs
          : area === 'all'
            ? words.alsoAll
            : words.erases;

  return fill(sentence, { what });
}

function Settings() {
  const { color, type, space, palette, skin, traco, tracos } = useTheme();
  /**
   * A largura em dp, porque a linha das peças da capa tem CINCO coisas nela.
   *
   * **A queixa do dono, com a foto ao lado: *"coisas assim precisam dar uma
   * melhorada"*.** A linha era uma fila só — nome, etiqueta de largura, etiqueta de
   * esconder e dois chevrons — com o nome ficando com o que sobrasse. A 393 dp o que
   * sobra é perto de um terço, e aí "Pedidos dos clientes" quebra em duas linhas,
   * "Quem recebe hoje" em três, e a lista inteira fica com altura desigual. A versão
   * anterior tinha trocado reticências por quebra, e isso foi o conserto certo da
   * decisão (escolher entre nomes ilegíveis é pior); o que faltava era não obrigar a
   * escolha entre cortar e quebrar.
   *
   * O nome ganha a linha dele e os controles descem para a linha de baixo, alinhados à
   * direita. Não entra número mágico de largura nenhum: a quebra é o ponto de 600 dp
   * da casa — daí para cima cabe tudo numa fila, e é aí que a fila é a forma certa.
   */
  const { width: larguraDaTela } = useWindowDimensions();
  const empilharPecas = larguraDaTela < 600;
  const { setSkin, hue, setHue, scheme, setScheme } = useAppearance();

  /**
   * A capa combinada e o que este aparelho esconde.
   *
   * Duas listas porque são dois donos: a ordem é da casa, o esconder é do
   * celular. Guardar as duas juntas faria a preferência de um virar decisão do
   * outro na primeira sincronização.
   */
  /**
   * As unidades de fábrica desta empresa, e em qual delas este aparelho fica.
   *
   * A lista vem da ESPÉCIE, nunca do id: `defaultLocationId` devolve o id da
   * empresa porque a PRIMEIRA unidade carimba assim desde sempre, e as seguintes
   * nascem com uuid próprio. Quem eleger "a fábrica" por id acerta hoje e erra na
   * segunda.
   */
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[]>([]);
  /**
   * Quantas salas NOSSAS a empresa tem — piso, câmara e almoxarifado.
   *
   * É esta contagem, e não a de unidades, que decide se a pergunta de onde a corrida
   * consome existe: com uma sala só os dois mundos dão o mesmo resultado, e a Lei 1
   * proíbe perguntar o que o sistema deduz. Uma fábrica com duas UNIDADES e uma sala
   * em cada continua sem ver a pergunta, que é o certo.
   */
  const [salasNossas, setSalasNossas] = useState(0);
  const [unidadeAqui, setUnidadeAqui] = useState<string>(() => unidadeDaqui());
  const [ordem, setOrdem] = useState<BriefingWidget[]>(() => briefingLayout([], []));
  const [escondidos, setEscondidos] = useState<string[]>([]);
  /** Quais a casa quer em meia coluna. Da EMPRESA, como a ordem — não do aparelho. */
  const [meias, setMeias] = useState<string[]>([]);
  const fora = widgetsOffCover(ordem);
  const filas = briefingFilas(ordem, meias);

  useEffect(() => {
    let vivo = true;
    void Promise.all([briefingOrder(), briefingHidden(), briefingHalf()]).then(
      ([salva, ocultos, metades]) => {
      if (!vivo) return;
      setOrdem(briefingLayout(salva, []));
      setEscondidos(ocultos);
      setMeias(metades);
      },
    );
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Meia coluna ou inteira.
   *
   * O rótulo diz o RESULTADO e não o interruptor, e isso é a regra aparecendo na
   * tela em vez de virar surpresa: marcar uma peça como meia pode não mudar nada,
   * porque meia sozinha ocupa a linha. Quem quiser o par marca as duas — e o
   * rótulo "sozinha, ocupa a linha" é o que conta isso sem obrigar ninguém a
   * descobrir tentando.
   */
  const trocarLargura = async (widget: BriefingWidget) => {
    const nova = meias.includes(widget)
      ? meias.filter((w) => w !== widget)
      : [...meias, widget];
    setMeias(nova);
    await setBriefingHalf(nova);
  };

  const mover = async (widget: BriefingWidget, direcao: 'up' | 'down') => {
    const nova = moveWidget(ordem, widget, direcao);
    setOrdem(nova);
    await setBriefingOrder(nova);
  };

  /**
   * Colocar na capa uma peça que nasce fora dela.
   *
   * Vai para a ordem da EMPRESA, e não para a preferência do aparelho: a
   * primeira tela é o que todo mundo olha de manhã, então acrescentar um cartão
   * ali é decisão de casa. Esconder continua sendo do aparelho.
   */
  const ligar = async (widget: BriefingWidget) => {
    const nova = addWidget(ordem, widget);
    setOrdem(nova);
    await setBriefingOrder(nova);
  };

  const trocarVisibilidade = async (widget: BriefingWidget) => {
    const nova = escondidos.includes(widget)
      ? escondidos.filter((w) => w !== widget)
      : [...escondidos, widget];
    setEscondidos(nova);
    await setBriefingHidden(nova);
  };
  const { locale, t, setLanguage, setCurrency } = useLocaleChoice();

  useEffect(() => {
    let vivo = true;
    void listPlaces(empresaDaqui()).then((lugares) => {
      if (!vivo) return;
      setUnidades(
        lugares
          .filter((l) => ehUnidade(l.kind))
          .map((l) => ({ id: l.id, nome: l.name.trim() || t.app.places.factory })),
      );
      setSalasNossas(
        lugares.filter((l) => (INTERNAL_PLACE_KINDS as readonly string[]).includes(l.kind)).length,
      );
    });
    return () => {
      vivo = false;
    };
  }, [t]);

  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  /**
   * A aprovação de pedido, que é preferência da empresa e não escolha nossa.
   *
   * Uma fábrica quer que o dono veja cada pedido antes de a produção começar;
   * outra tem três clientes e a aprovação só atrasa a entrega. Os dois caminhos
   * existem e a empresa liga o seu - é a mesma regra que decidiu a entrada no
   * chão de fábrica, e ela vale aqui pelo mesmo motivo.
   */
  const { data: approval, refresh: refreshApproval } = useQuery<boolean>(() => ordersNeedApproval());
  const { data: revende, refresh: refreshRevende } = useQuery<boolean>(() => onlyResells());
  const { data: folga, refresh: refreshFolga } = useQuery<number>(() => purchaseSafetyDays());
  const { data: prazo, refresh: refreshPrazo } = useQuery<number | null>(() => eraseGraceDays());
  const { data: naFila, refresh: refreshFila } = useQuery<number>(() => pendingCount());
  /**
   * O que ficou de LADO, que é outra coisa que o que está na fila.
   *
   * Pendente quer dizer "ainda vai subir"; posta de lado quer dizer "não sobe nunca, e está
   * tudo bem" — a conferência que um segundo celular anotou da mesma carga, recusada pela
   * `0051`. Antes desta rodada a recusa definitiva ficava pendente para sempre: a tela dizia
   * "faltam 3" com três linhas que nunca iam faltar menos, e tudo o que o aparelho gravou
   * depois ficava preso atrás delas.
   *
   * Zero é o caso normal e não vira frase nenhuma — "está tudo bem" é estado válido, e
   * alerta inventado ensina a ignorar alerta.
   */
  const { data: deLado, refresh: refreshDeLado } = useQuery<number>(() => rejectedCount());
  const [enviando, setEnviando] = useState(false);
  const [oQueSubiu, setOQueSubiu] = useState<string | null>(null);
  const { data: nomeia, refresh: refreshNomeia } = useQuery<boolean>(() => namesWhoRecorded());
  const { data: entrada, refresh: refreshEntrada } = useQuery(() => floorSignIn());
  const { data: consumo, refresh: refreshConsumo } = useQuery(() => consumoDaProducao());

  /**
   * Quem pode mexer no que é da EMPRESA — e o que a tela faz com a resposta.
   *
   * A camada de dados passou a recusar em 9 de setembro: o Reset, os dois
   * interruptores que decidem o piso de capacidade e os dois números da empresa
   * exigem `manage_company`. Recusar é o que vale — esconder botão é decoração —,
   * mas deixar o botão desenhado depois disso é a Lei 5 do avesso: o erro passa a
   * RECLAMAR em vez de impedir, e quem está com o celular emprestado toca, espera, e
   * recebe uma frase de programador.
   *
   * Então os cartões da empresa saem da tela para quem não administra, com a frase
   * que a casa já usa em Lugares no lugar deles. O que fica é o que é do APARELHO —
   * aparência, idioma, capa, avisos, enviar —, e isso é de quem estiver com ele.
   */
  const { data: administra } = useQuery<boolean>(async () =>
    (await currentCapabilities(empresaDaqui())).has('manage_company'),
  );
  const podeEmpresa = administra !== false;

  /**
   * Os avisos, e o que a casa escolheu sobre cada um.
   *
   * A pergunta do dono foi "dá para configurar quando o alarme avisa?" — e a
   * resposta é a F7: quando depende de quem usa, vira configuração. Uma fábrica
   * que compra na feira das cinco e outra que compra pela internet no domingo
   * têm a mesma necessidade e horas diferentes.
   */
  const { data: alerts, refresh: refreshAlerts } = useQuery<AlertSettings>(() => alertSettings());
  /**
   * Por que o último reagendamento não agendou — e ele só chega aqui quando é resolvível.
   *
   * Sem isto a tela mostrava seis interruptores ligados de um sistema que não manda nada:
   * a permissão negada morria num `.then` de corpo vazio, e a pessoa só descobria que não
   * recebe aviso no dia em que precisava dele. Lei 5 — erro impede ou cala; o que ele não
   * pode é acontecer em silêncio com a tela dizendo o contrário.
   */
  const { data: naoAgendou } = useQuery<string | null>(() => porQueNaoAgendou());

  const mexerAlerta = async (proximo: AlertSettings) => {
    await setAlertSettings(proximo);
    refreshAlerts();
  };

  const { data, loading, error, refresh } = useQuery(
    async () => ({
      counts: await countForErase(empresaDaqui()),
      // A PRESENÇA do exemplo, não o histórico dele: a marca `seeded` nunca é
      // apagada, então ela dizia "inclui o exemplo" para sempre, em todo
      // aparelho, inclusive depois de apagar tudo e cadastrar o primeiro insumo
      // próprio.
      example: await exampleStillHere(empresaDaqui()),
    }),
  );

  const counts: EraseCounts | null = data?.counts ?? null;

  const run = async (area: EraseArea, label: string) => {
    if (!counts || busy) return;

    const blocker = blockerFor(area, counts);
    if (blocker) {
      // Law 5 again: this is not an error report after the fact - the button
      // was already disabled, and this explains the same thing on demand.
      await confirm({
        title: t.app.settings.cannotYet,
        message: sayBlocker(blocker, t),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }

    const go = await confirm({
      title:
        area === 'all'
          ? t.app.settings.eraseAllTitle
          : fill(t.app.settings.eraseTitle, { area: label.toLowerCase() }),
      message: `${sayTally(area, tallyFor(area, counts), t)}\n\n${t.app.settings.noUndo}`,
      confirmLabel: t.app.settings.erase,
      destructive: true,
      // A segunda folha, exigida por `destructive` e cobrada pelo guarda: a
      // primeira conta o que sai, esta explica o que o registro é.
      segunda: {
        title: t.app.settings.registroTitle,
        // A confirmação diz o que VAI ACONTECER, com o número por extenso — e o que
        // acontece depende de haver servidor e do prazo que a empresa escolheu. A
        // frase fixa dizia "este aparelho é o único lugar onde eles estão", e ela
        // deixa de ser verdade no dia em que a fila sobe.
        message: `${t.app.settings.registroBody}\n\n${dizOServidor(prazo ?? null, t)}`,
        confirmLabel: t.app.settings.registroConfirm,
      },
    });
    if (!go) return;

    setBusy(true);
    try {
      await eraseArea(empresaDaqui(), area);
      refresh();
    } catch (e) {
      await confirm({
        title: e instanceof EraseBlockedError ? t.app.settings.cannotYet : t.app.settings.failedToErase,
        message:
          e instanceof EraseBlockedError
            ? sayBlocker(e.blocker, t)
            : e instanceof Error
              ? e.message
              : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;

    const go = await confirm({
      title: t.app.settings.restoreTitle,
      message: t.app.settings.restoreBody,
      confirmLabel: t.app.settings.restoreConfirm,
    });
    if (!go) return;

    setBusy(true);
    try {
      await restoreStarterData();
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.settings.failedToRestore,
        message: avisoDeFalha(e, t, ERROS).message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Encher o app com movimento, para poder olhar as telas.
   *
   * O exemplo que vem de fábrica tem um dia de idade e nunca se moveu: prova
   * que a tela desenha, não que ela diz alguma coisa. Metade do briefing só
   * tem o que dizer quando existe passado - "saíram 480 hoje, 200 a mais que na
   * segunda passada" precisa de uma segunda passada.
   *
   * A confirmação diz o que vai ser escrito, como toda escrita deste app, e diz
   * também que o livro-razão fica com esses lançamentos: é dado de verdade num
   * banco de verdade, não um modo de demonstração que some ao fechar.
   */
  const onSimulate = async () => {
    if (busy) return;

    const go = await confirm({
      title: t.app.settings.simulateTitle,
      message: t.app.settings.simulateBody,
      confirmLabel: t.app.settings.simulateConfirm,
    });
    if (!go) return;

    setBusy(true);
    try {
      // Três meses, e não a quinzena — pedido do dono, 5 de setembro: *"cria dado
      // de uns 3 meses para deixar de testes futuros"*. `simulateHistory` existia
      // exatamente para isto e nunca tinha sido chamado por ninguém: o docblock
      // dele já dizia que catorze dias não provam custo médio que anda, cobertura
      // que encolhe nem consulta lenta com o livro-razão crescido.
      const feito = await simulateHistory(empresaDaqui(), {
        days: HORIZONTE_DE_TESTE,
        timeZone: locale.timeZone,
      });
      refresh();
      await confirm({
        title: t.app.settings.simulateConfirm,
        message: fill(t.app.settings.simulateDone, {
          runs: String(feito.runs),
          deliveries: String(feito.deliveries),
          invoices: String(feito.invoices),
          counts: String(feito.counts),
        }),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } catch (e) {
      await confirm({
        title: t.app.settings.failedToSimulate,
        message: avisoDeFalha(e, t, ERROS).message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Vazio nos mesmos termos que a confirmação de apagar usa.
   *
   * `places` ficava fora, e a contagem existe: com três lojas cadastradas e
   * nenhum item, a tela afirmava "Está vazio" e escondia o cartão do que está
   * guardado — enquanto "apagar tudo" contava os três lugares na confirmação.
   * Duas verdades sobre a mesma pergunta, e a que a pessoa lê primeiro era a
   * falsa.
   */
  const total =
    (counts?.inputs ?? 0) +
    (counts?.recipes ?? 0) +
    (counts?.products ?? 0) +
    (counts?.purchases ?? 0) +
    (counts?.places ?? 0);

  /**
   * Enviar é o caminho MANUAL — e ele deixou de ser o único em 8 de setembro.
   *
   * **Este docblock afirmou "nunca acontece sozinho" por quatro dias depois de deixar
   * de ser verdade.** `rodadaAutomatica` (`src/nuvem/aparelho.ts`) roda na abertura e a
   * cada volta ao primeiro plano (`app/_layout.tsx:78`), por decisão do dono: uma fila
   * que só sobe quando alguém lembra é uma fila que não sobe, e o dado fica num celular
   * de fábrica até ele cair na câmara fria.
   *
   * **O que continua valendo da decisão original** (*"usar com sabedoria"* — o servidor
   * é pago e a fábrica funciona inteira sem ele): a rodada não acontece sem conta
   * configurada, não acontece sem servidor, e o botão existe para quem quer subir
   * AGORA, com a resposta na tela em vez de em silêncio.
   *
   * As duas recusas aparecem como FRASE e não como falha: sem servidor configurado,
   * e sem empresa adotada — que é a que importa, porque o carimbo das linhas seria a
   * semente e o servidor recusaria a fila inteira sem explicar nada.
   */
  /**
   * Por que a fila parou, dito para quem está de luva — e a ESCOLHA mora aqui, não no motor.
   *
   * `SyncReport.error` era uma cadeia de caracteres que o motor montava em português
   * (*"O servidor aceitou 3 de 100 registros."*) e esta tela interpolava crua. Dois defeitos
   * numa linha: a fundação manda a camada devolver fato e a tela escrever a frase, e a frase
   * AFIRMAVA o servidor — uma falha do próprio aparelho chegava ao dono como recusa de quem
   * nunca foi consultado.
   *
   * Quatro motivos, quatro frases, e cada uma diz o que fazer: tentar de novo, esperar sinal,
   * olhar o que ficou de lado, atualizar o aplicativo. `cru` fica guardado e não aparece: é
   * inglês sobre rede, e não ajuda ninguém na câmara fria.
   */
  const porQueParou = (parou: ParouPorque): string => {
    const numeros = { aceitos: String(parou.aceitos), de: String(parou.de) };
    if (parou.motivo === 'transporteCaiu') return t.app.settings.syncStoppedOffline;
    if (parou.motivo === 'linhaSumiu') return fill(t.app.settings.syncStoppedRowGone, numeros);
    if (parou.motivo === 'tabelaDesconhecida')
      return fill(t.app.settings.syncStoppedNoCrossing, numeros);
    return fill(t.app.settings.syncStopped, numeros);
  };

  const enviar = async () => {
    const quem = await contaAtual();
    if (!quem) {
      setOQueSubiu(t.app.settings.syncNoServer);
      return;
    }
    if (!empresaAdotada()) {
      setOQueSubiu(t.app.settings.syncNoCompany);
      return;
    }
    setEnviando(true);
    setOQueSubiu(null);
    try {
      const relatorio = await drain(transporte({ userId: quem.id, companyId: empresaDaqui() }));
      if (relatorio.recusa === 'semEmpresa') setOQueSubiu(t.app.settings.syncNoCompany);
      else if (relatorio.error) setOQueSubiu(porQueParou(relatorio.error));
      else if (relatorio.remaining === 0)
        setOQueSubiu(fill(t.app.settings.syncDone, { sent: String(relatorio.sent) }));
      else
        setOQueSubiu(
          fill(t.app.settings.syncSent, {
            sent: String(relatorio.sent),
            left: String(relatorio.remaining),
          }),
        );
    } finally {
      setEnviando(false);
      refreshFila();
      refreshDeLado();
    }
  };

  return (
    <CollapsingHeader
      cena="ajustes"
      title={t.app.settings.title}
      overline={`${brand.name} · ${Constants.expoConfig?.version ?? '—'}`}
      erro={error}
      denovo={refresh}
    >
      {/* A ausência DITA, em vez de uma tela que parece menor sem motivo.
          "Está tudo bem" é estado válido e bonito; "faltam seis cartões e ninguém
          disse por quê" não é. Uma linha, no lugar deles. */}
      {podeEmpresa ? null : (
        <Reveal index={0}>
          <Text
            style={[
              type.caption,
              { color: color.inkFaint, paddingHorizontal: space.lg, marginBottom: space.md },
            ]}
          >
            {t.app.settings.onlyAdmin}
          </Text>
        </Reveal>
      )}

      {/* O que está guardado, e a saída de cada área na mesma linha.
          A contagem à direita é o que torna a linha decidível: "Receitas 2" já
          diz o tamanho do estrago antes do diálogo. Quando a área está travada,
          o motivo substitui a dica e a linha continua tocável — o toque explica
          a ordem certa em vez de não responder. */}
      {podeEmpresa && (loading || total > 0) ? (
        <Reveal index={0}>
          <Card
            hue={palette.mist}
            icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
            title={t.app.settings.stored}
          >
            {loading || !counts ? (
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {t.app.settings.checking}
              </Text>
            ) : (
              <View style={{ gap: space.xs }}>
                {data?.example ? <Chip signal="neutral" label={t.app.settings.hasExample} /> : null}

                <Text style={[type.overline, { color: color.inkFaint, marginTop: space.sm }]}>
                  {t.app.settings.clearByArea.toUpperCase()}
                </Text>
                <Text style={[type.caption, { color: color.inkMuted }]}>
                  {t.app.settings.clearByAreaHint}
                </Text>

                {AREAS.map((entry) => {
                  const nome =
                    entry.area === 'purchases'
                      ? t.app.settings.purchases
                      : t.app.settings[entry.area];
                  const blocker = blockerFor(entry.area, counts);
                  const impedido = blocker ? sayBlocker(blocker, t) : null;
                  return (
                    <Touchable
                      key={entry.area}
                      // O título do diálogo entra na frase ("Apagar compras?"),
                      // e por isso ele é o nome curto da área e não o rótulo da
                      // linha, que fala do que está guardado.
                      onPress={() =>
                        void run(
                          entry.area,
                          entry.area === 'purchases' ? t.app.settings.purchasesRow : nome,
                        )
                      }
                      accessibilityLabel={`${t.app.settings.erase} ${nome}`}
                    >
                      <View style={[styles.row, { paddingVertical: space.sm, gap: space.md }]}>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[type.body, { color: impedido ? color.inkFaint : color.ink }]}
                          >
                            {nome}
                          </Text>
                          <Text style={[type.caption, { color: color.inkFaint }]}>
                            {impedido ?? t.app.settings.areas[entry.area]}
                          </Text>
                        </View>
                        <Text
                          style={[
                            type.body,
                            styles.number,
                            { color: impedido ? color.inkFaint : color.ink },
                          ]}
                        >
                          {formatQuantity(counts[entry.area], locale)}
                        </Text>
                        <IconChevron size={18} color={color.inkFaint} />
                      </View>
                    </Touchable>
                  );
                })}

                {/* Os lugares entram na contagem, então aparecem.
                    Linha sem toque e sem chevron de propósito: nenhuma área
                    menor é dona deles — loja e câmara saem só com "apagar
                    tudo" —, e um chevron aqui prometeria uma porta que não
                    existe. */}
                <View style={[styles.row, { paddingVertical: space.sm, gap: space.md }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: color.ink }]}>
                      {t.app.settings.placesRow}
                    </Text>
                    <Text style={[type.caption, { color: color.inkFaint }]}>
                      {t.app.settings.placesHint}
                    </Text>
                  </View>
                  <Text style={[type.body, styles.number, { color: color.ink }]}>
                    {formatQuantity(counts.places, locale)}
                  </Text>
                  {/* O espaço do chevron que esta linha não tem, para a coluna
                      de números ficar alinhada com as de cima. Algarismo
                      tabular numa coluna torta não serve para comparar nada. */}
                  <View style={{ width: 18 }} />
                </View>
              </View>
            )}
          </Card>
        </Reveal>
      ) : null}

      {/* A cara do aplicativo: a identidade e a luz.
          O dono viu quarenta esboços e ficou com duas identidades; nenhuma das
          duas é a certa para todo mundo, e por isso as duas existem em vez de eu
          escolher por ele.

          Este comentário dizia "claro e escuro continuam seguindo o aparelho,
          como o sistema manda" — e isso era uma escolha MINHA disfarçada de
          regra do sistema. O dono abriu o Papel no celular escuro e não teve
          como trocar. Luz é preferência de quem segura o aparelho, igual à
          identidade, e por isso é dado com os três caminhos. O padrão é o claro,
          decisão dele.

          A escolha é um par de botões e não dois retângulos desenhados à mão: o
          `Button` já sabe as duas caras — pílula preenchida no Orgânico, palavra
          sublinhada no Papel — e o escolhido é o único cheio da dupla. */}
      <Reveal index={1}>
        <Card
          hue={palette.mist}
          icon={(c) => <GlyphSettings size={26} color={c} weight={traco} />}
          title={t.app.settings.appearance.label}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>
            {t.app.settings.appearance.hint}
          </Text>

          <View style={{ marginTop: space.md, gap: space.xs }}>
            <Text style={[type.body, { color: color.ink }]}>
              {t.app.settings.appearance.lightLabel}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.settings.appearance.lightHint}
            </Text>
            <View style={[styles.top, { gap: space.sm, marginTop: space.sm }]}>
              {(
                [
                  ['claro', t.app.settings.appearance.light],
                  ['escuro', t.app.settings.appearance.dark],
                  ['sistema', t.app.settings.appearance.system],
                ] as const
              ).map(([qual, nome]) => (
                <View key={qual} style={{ flex: 1 }}>
                  <Button
                    label={nome}
                    variant={scheme === qual ? 'primary' : 'ghost'}
                    onPress={() => setScheme(qual)}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* A lista sai do CATÁLOGO de peles, não de duas linhas escritas à mão.
              O dono foi explícito em 6 de setembro: mais peles virão. Enquanto a
              lista morava aqui, uma pele nova compilava, tinha traços, tinha
              roupa — e não aparecia na tela para ninguém escolher. */}
          <View style={[styles.top, { gap: space.md, marginTop: space.md }]}>
            {(Object.keys(skins) as Skin[]).map((qual) => (
              <View key={qual} style={{ flex: 1, gap: space.xs }}>
                <Button
                  label={t.app.settings.appearance.peles[qual].nome}
                  variant={skin === qual ? 'primary' : 'ghost'}
                  onPress={() => setSkin(qual)}
                />
                <Text
                  style={[
                    type.caption,
                    { color: skin === qual ? color.inkMuted : color.inkFaint },
                  ]}
                >
                  {t.app.settings.appearance.peles[qual].dica}
                </Text>
              </View>
            ))}
          </View>

          {/* A paleta da paisagem, e só a pele cuja marca VEM do tom a tem.
              O Papel tem uma cara só, que é a graça dele: revista impressa não
              vem em cinco cores de capa. A pergunta é do traço e não do nome —
              uma pele nova com paleta escolhível ganha este seletor sozinha,
              sem ninguém lembrar de vir aqui acrescentar um `ou`.

              O disco é a única cor escrita fora do tema em toda a tela, e tem
              que ser: ele não representa a paleta, ele É a amostra dela. O que
              marca a escolhida é o tamanho e o nome em tinta cheia — anel
              desenhado à mão seria mais uma caixa. */}
          {tracos.marcaVemDoTom ? (
            <View style={{ marginTop: space.lg, gap: space.xs }}>
              <Text style={[type.body, { color: color.ink }]}>
                {t.app.settings.appearance.palette}
              </Text>
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {t.app.settings.appearance.paletteHint}
              </Text>
              <View style={[styles.bottom, { gap: space.sm, marginTop: space.sm }]}>
                {(['verde', 'azul', 'ambar', 'terracota', 'lavanda'] as const).map((qual) => {
                  const escolhida = hue === qual;
                  return (
                    <Pressable
                      key={qual}
                      onPress={() => setHue(qual)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: escolhida }}
                      accessibilityLabel={t.app.settings.appearance.hues[qual]}
                      style={{ flex: 1, alignItems: 'center', gap: space.xs, minHeight: ALVO }}
                    >
                      <View
                        style={{
                          width: escolhida ? 44 : 30,
                          height: escolhida ? 44 : 30,
                          borderRadius: (escolhida ? 44 : 30) / 2,
                          backgroundColor: hues[qual].brand,
                        }}
                      />
                      <Text
                        style={[type.caption, { color: escolhida ? color.ink : color.inkFaint }]}
                        numberOfLines={1}
                      >
                        {t.app.settings.appearance.hues[qual]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
        </Card>
      </Reveal>

      {/* O idioma e a moeda — e estes são da EMPRESA, não do aparelho.
          A diferença é a mesma que separa a cara da tela do que ela mostra: a
          fábrica brasileira cujo dono lê inglês roda em português para todo mundo
          no chão de fábrica, porque a conferência da câmara e o romaneio são lidos
          pela equipe. Trocar aqui troca para todos.

          Até agora não havia caminho nenhum: o dicionário tinha os três idiomas
          completos — a compilação quebra se alguém escrever texto em um só — e
          `useLocale` devolvia uma constante. Dois terços do que duas pessoas
          escreveram palavra por palavra eram alcançáveis só editando o código.

          O fuso não é pergunta: o celular está no galpão. Ele decide a que DIA
          pertence um tacho fechado às 22h, e vinha chumbado em São Paulo — o que
          fazia uma fábrica em Manaus imprimir a data errada na etiqueta.

          A moeda também escolhe o FORMATO do número, e é por isso que ela é uma
          pergunta separada do idioma: espanhol escreve 1.234,56 na Espanha e
          1,234.56 no México. Número de dinheiro lido ao contrário é a pior classe
          de erro que este aplicativo pode cometer. */}
      {/* Em qual unidade este aparelho fica — e ele só aparece quando há mais de uma.
          Lei 1: nunca peça o que o sistema pode deduzir. Fábrica de uma unidade
          nunca vê esta pergunta, exatamente como fábrica sem transportadora nunca
          vê a escolha de quem levou.

          E ela é do APARELHO, não da empresa: o celular da unidade de Marília fica
          em Marília e não muda de prédio no meio do turno. Perguntar a cada
          movimento seria a Lei 1 quebrada duzentas vezes por dia para confirmar um
          fato que não muda — e a resposta errada mistura o estoque de duas cidades
          num saldo só, calada, porque as duas somam na mesma empresa. */}
      {/* De onde a corrida tira o insumo — e a pergunta só nasce com mais de uma sala.
          Com uma sala só os dois mundos dão o MESMO resultado, e perguntar seria a
          Lei 1 quebrada para confirmar um fato que não muda.

          **O padrão é `unidade`, e ele foi decidido sob defeito em 8 de setembro:** a
          tela lia o piso da unidade e a escrita conferia uma sala, então com a polpa
          na câmara fria nenhuma corrida rodava. Escolher a unidade foi a única saída
          que não obrigava a lançar transferência antes de cada corrida.

          Fixar o padrão, porém, fecha METADE da regra da casa. Este cartão é a outra:
          quem quer o saldo de cada prateleira sempre DECLARADO — e aceita o lançamento
          a mais — liga `sala`, e o trajeto interno que isso exige passou a existir na
          mesma noite. */}
      {salasNossas > 1 ? (
        <Reveal index={2}>
          <Card
            hue={palette.mist}
            icon={(c) => <GlyphFactory size={26} color={c} weight={traco} />}
            title={t.app.settings.consumo.label}
          >
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.settings.consumo.hint}
            </Text>
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {(['unidade', 'sala'] as const).map((qual) => (
                <Button
                  key={qual}
                  label={t.app.settings.consumo[qual]}
                  variant={consumo === qual ? 'primary' : 'ghost'}
                  onPress={() => {
                    void setConsumoDaProducao(qual).then(refreshConsumo);
                  }}
                />
              ))}
            </View>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
              {consumo === 'sala' ? t.app.settings.consumo.noteSala : t.app.settings.consumo.noteUnidade}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {unidades.length > 1 ? (
        <Reveal index={2}>
          <Card
            hue={palette.mist}
            icon={(c) => <GlyphFactory size={26} color={c} weight={traco} />}
            title={t.app.settings.unidade.label}
          >
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.settings.unidade.hint}
            </Text>
            <View style={{ gap: space.sm, marginTop: space.sm }}>
              {unidades.map((u) => (
                <Button
                  key={u.id}
                  label={u.nome}
                  variant={u.id === unidadeAqui ? 'primary' : 'ghost'}
                  onPress={() => {
                    void escolherUnidade(u.id).then(() => setUnidadeAqui(u.id));
                  }}
                />
              ))}
            </View>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
              {t.app.settings.unidade.note}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      <Reveal index={2}>
        <Card
          hue={palette.mist}
          icon={(c) => <GlyphSettings size={26} color={c} weight={traco} />}
          title={t.app.settings.language.label}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>
            {t.app.settings.language.hint}
          </Text>

          {/* **"Portugu / ês".** Os três botões dividiam a largura em três fatias
              iguais (`flex: 1`), e a 360 dp — o piso do Android — a fatia é
              menor que a palavra, então o nome do idioma quebrava no meio. Nome
              partido não é nome, e cortar com reticências seria trocar este
              defeito pelo outro que já está na lista: escolha que depende do
              nome não pode mostrar meio nome.

              A linha passa a QUEBRAR, e cada botão toma a largura da palavra
              dele. Sem número mágico de largura: quem decide é o texto, em
              qualquer dp, e no tablet os três continuam na mesma linha. */}
          <View style={[styles.wrap, { gap: space.sm, marginTop: space.md }]}>
            {LANGUAGES.map(([qual, nome]) => (
              <Button
                key={qual}
                label={nome}
                variant={locale.language === qual ? 'primary' : 'ghost'}
                onPress={() => setLanguage(qual)}
              />
            ))}
          </View>

          <View style={{ marginTop: space.lg, gap: space.xs }}>
            <Text style={[type.body, { color: color.ink }]}>
              {t.app.settings.language.currency}
            </Text>
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.settings.language.currencyHint}
            </Text>
          </View>

          <View style={{ marginTop: space.sm }}>
            {CURRENCIES.map(({ code }) => (
              <ListRow
                key={code}
                label={`${code} · ${t.currency[code]}`}
                // O exemplo é a prova: a mesma quantia escrita como aquela moeda
                // escreve, com o separador e as casas dela.
                detail={formatMoney(123456, {
                  ...locale,
                  currency: code,
                  formatting: formattingFor(locale.language, code),
                })}
                trailing={locale.currency === code ? '✓' : undefined}
                trailingTone={locale.currency === code ? 'ok' : 'muted'}
                onPress={() => setCurrency(code)}
              />
            ))}
          </View>
        </Card>
      </Reveal>

      {/* As peças da capa: o que aparece, em que ordem, e o que este aparelho
          prefere não ver.

          A ordem é da CASA porque a frase mais comum de uma fábrica é "olha lá
          na tela inicial" — se cada um monta a sua, ela para de funcionar.
          Esconder é do aparelho, porque quem está na câmara fria não quer o
          cartão de preço no caminho e isso não muda o que a casa combinou.

          Seta em vez de arrastar: arrastar pede pressão longa e precisão, que é
          o que menos existe numa mão de luva a dezoito graus negativos. E a seta
          agora é o chevron da família fina, girado — o "↑" digitado era um
          caractere de fonte no meio de uma tela de desenhos. */}
      <Reveal index={3}>
        {/* porta: sky — a seção governa as peças da CAPA, e capa é a casa */}
        <Card
          hue={palette.sky}
          icon={(c) => <GlyphCount size={26} color={c} weight={traco} />}
          title={t.app.settings.briefing.label}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>
            {t.app.settings.briefing.hint}
          </Text>

          <View style={{ marginTop: space.md, gap: space.xs }}>
            {ordem.map((widget, i) => {
              const escondido = escondidos.includes(widget);
              return (
                <View
                  key={widget}
                  style={
                    empilharPecas
                      ? { paddingVertical: space.xs, gap: space.xs }
                      : [styles.top, { gap: space.sm, paddingVertical: space.xs }]
                  }
                >
                  {/* **O nome NÃO se corta aqui, e é a mesma cicatriz do botão de
                      idioma.** Esta linha é onde a pessoa ESCOLHE a peça, e a foto
                      pegou metade dos rótulos em reticências — "Produção a…", "Quem
                      rece…", "Vence prim…" —, ou seja, escolher entre coisas que não
                      dá para ler. `numberOfLines={1}` economiza uma linha e gasta a
                      decisão.

                      E não se corta NEM se quebra: empilhado, o nome tem a largura
                      inteira e cabe numa linha só. `flex: 1` só faz sentido quando ele
                      divide a fila com os controles, que é o caso de 600 dp para
                      cima. */}
                  <Text
                    style={[
                      type.body,
                      { color: escondido ? color.inkFaint : color.ink },
                      empilharPecas ? null : { flex: 1 },
                    ]}
                  >
                    {t.app.settings.briefing.widgets[widget]}
                    {escondido ? ` · ${t.app.settings.briefing.hidden}` : ''}
                  </Text>

                  <View style={[styles.controles, { gap: space.sm }]}>

                  {aceitaMeia(widget) ? (
                    <Pressable
                      onPress={() => void trocarLargura(widget)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: meias.includes(widget) }}
                      accessibilityLabel={`${t.app.settings.briefing.widgets[widget]}: ${
                        meias.includes(widget)
                          ? t.app.settings.briefing.half
                          : t.app.settings.briefing.whole
                      }`}
                    >
                      <Chip
                        signal={meias.includes(widget) ? 'ok' : 'neutral'}
                        label={
                          meias.includes(widget)
                            ? filas.some((f) => f.length > 1 && f.includes(widget))
                              ? t.app.settings.briefing.half
                              : `${t.app.settings.briefing.half} · ${t.app.settings.briefing.halfAlone}`
                            : t.app.settings.briefing.whole
                        }
                      />
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={() => void trocarVisibilidade(widget)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: !escondido }}
                    accessibilityLabel={`${t.app.settings.briefing.widgets[widget]}: ${
                      escondido ? t.app.settings.briefing.show : t.app.settings.briefing.hide
                    }`}
                    // A etiqueta é DESENHO e o toque mora aqui: sem o piso o alvo é a
                    // altura dela, vinte e oito dp.
                    style={{ minHeight: ALVO, justifyContent: 'center' }}
                  >
                    <Chip
                      signal={escondido ? 'neutral' : 'ok'}
                      label={escondido ? t.app.settings.briefing.show : t.app.settings.briefing.hide}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => void mover(widget, 'up')}
                    disabled={i === 0}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.app.settings.briefing.up}: ${t.app.settings.briefing.widgets[widget]}`}
                    style={{
                      opacity: i === 0 ? 0.3 : 1,
                      padding: space.xs,
                      // A seta desenhada tem vinte pixels; o alvo dela tinha vinte e
                      // quatro dp. Reordenar a capa de luva era acertar um selo.
                      minHeight: ALVO,
                      justifyContent: 'center',
                    }}
                  >
                    <View style={styles.up}>
                      <IconChevron size={20} color={color.ink} />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => void mover(widget, 'down')}
                    disabled={i === ordem.length - 1}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.app.settings.briefing.down}: ${t.app.settings.briefing.widgets[widget]}`}
                    style={{
                      opacity: i === ordem.length - 1 ? 0.3 : 1,
                      padding: space.xs,
                      minHeight: ALVO,
                      justifyContent: 'center',
                    }}
                  >
                    <View style={styles.down}>
                      <IconChevron size={20} color={color.ink} />
                    </View>
                  </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          {/* O que existe e não está na capa.
              Sem esta lista, um widget fora do padrão é um widget que não existe:
              o dono não tem como saber que ele está lá, e "quem quiser liga" fica
              sendo uma frase sem botão. */}
          {fora.length > 0 ? (
            <View style={{ marginTop: space.lg, gap: space.xs }}>
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {t.app.settings.briefing.offCover}
              </Text>
              {fora.map((widget) => (
                <View
                  key={widget}
                  style={
                    empilharPecas
                      ? { paddingVertical: space.xs, gap: space.xs }
                      : [styles.top, { gap: space.sm, paddingVertical: space.xs }]
                  }
                >
                  {/* A lista de fora é a MESMA escolha com o sinal trocado: quem lê
                      aqui está decidindo o que trazer de volta. Cortar o nome nos dois
                      lugares seria consertar metade — a regra da casa é que conserto de
                      forma não termina no arquivo que o mostrou, e aqui nem de arquivo
                      ele muda. Vale igual para o empilhamento: "Colocar na capa" é uma
                      etiqueta comprida, e ao lado dela o nome fica com menos espaço
                      ainda que na lista de cima. */}
                  <Text
                    style={[
                      type.body,
                      { color: color.inkMuted },
                      empilharPecas ? null : { flex: 1 },
                    ]}
                  >
                    {t.app.settings.briefing.widgets[widget]}
                  </Text>
                  <View style={styles.controles}>
                  <Pressable
                    onPress={() => void ligar(widget)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.app.settings.briefing.putOnCover}: ${t.app.settings.briefing.widgets[widget]}`}
                  >
                    <Chip signal="neutral" label={t.app.settings.briefing.putOnCover} />
                  </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </Reveal>

      {/* Os avisos.
          Cada linha é um alarme com a antecedência dele, e embaixo a hora e os
          dias. Nada aqui é obrigatório: alarme desligado é escolha legítima, e o
          aplicativo continua inteiro sem nenhum — a capa faz as mesmas contas.

          A antecedência e os dias da semana eram pílulas desenhadas à mão, com
          borda, raio e fundo próprios; agora são `Chip`, que é a mesma pílula do
          resto do aplicativo e vira carimbo reto no Papel sozinha. */}
      {alerts ? (
        <Reveal index={4}>
          <Card
            hue={palette.mist}
            icon={(c) => <GlyphThermometer size={26} color={c} weight={traco} />}
            title={t.app.settings.alerts.label}
          >
            {/* O recado de que o sistema não deixa, ACIMA dos interruptores: quem
                lê a lista de baixo primeiro conclui que está tudo ligado, e é essa
                conclusão que a permissão negada torna falsa. */}
            {naoAgendou === 'sem-permissao' ? (
              <Text style={[type.secondary, { color: color.warning }]}>
                {t.app.settings.alerts.never}
              </Text>
            ) : null}
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.settings.alerts.hint}
            </Text>

            <View style={{ marginTop: space.md, gap: space.sm }}>
              {(
                ['ambiente', 'semMedida', 'insumo', 'pedido', 'validade', 'volume'] as AlertKind[]
              ).map((kind) => {
                const ligado = alerts.on[kind];
                // Volume, ambiente e "parou de medir" não têm antecedência: os dois
                // primeiros comparam com uma faixa cadastrada, e o terceiro conta HORAS
                // de silêncio. Antecedência é para o que se vê chegando; faixa e silêncio
                // são para o que já aconteceu.
                const dias =
                  kind === 'volume' || kind === 'ambiente' || kind === 'semMedida'
                    ? null
                    : alerts.daysAhead[kind];
                return (
                  <View key={kind} style={{ gap: space.xs }}>
                    <View style={[styles.row, { gap: space.sm }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.body, { color: ligado ? color.ink : color.inkFaint }]}>
                          {t.app.settings.alerts.kinds[kind]}
                        </Text>
                        <Text style={[type.caption, { color: color.inkFaint }]}>
                          {kind === 'volume'
                            ? t.app.settings.alerts.volumeHint
                            : kind === 'ambiente'
                              ? t.app.settings.alerts.ambienteHint
                              : kind === 'semMedida'
                                ? t.app.settings.alerts.semMedidaHint
                                : fill(
                                  // O insumo é o único cujo número é PISO: com prazo do
                                  // fornecedor anotado, quem decide é prazo + folga.
                                  kind === 'insumo'
                                    ? t.app.settings.alerts.insumoFloor
                                    : t.app.settings.alerts.daysAhead,
                                  { days: plural(dias ?? 0, t.app.home.dayCount) },
                                )}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          void mexerAlerta({ ...alerts, on: { ...alerts.on, [kind]: !ligado } })
                        }
                        accessibilityRole="switch"
                        accessibilityState={{ checked: ligado }}
                        // O rótulo diz só o NOME; o estado é `accessibilityState`, e
                        // ele é a única fonte. Aqui o rótulo repetia o estado e o
                        // repetia INVERTIDO — "Validade: Desligado" com o interruptor
                        // ligado, e o chip ao lado dizendo o contrário. `on`/`off` no
                        // dicionário são estados, não verbos, então não era "o que o
                        // toque faz": era uma afirmação falsa. Duas fontes para a
                        // mesma coisa é como duas verdades nascem, e é o que os
                        // outros três interruptores desta tela já evitam.
                        accessibilityLabel={t.app.settings.alerts.kinds[kind]}
                      >
                        <Chip
                          signal={ligado ? 'ok' : 'neutral'}
                          label={ligado ? t.app.settings.alerts.on : t.app.settings.alerts.off}
                        />
                      </Pressable>
                    </View>

                    {/* O azul pinta sempre e só interrompe se a casa pedir.
                        Almoxarifado cheio depois de uma compra é estado desejado, e
                        aviso diário sobre isso ensina a ignorar aviso — então o
                        caminho existe, desligado. */}
                    {kind === 'volume' && ligado ? (
                      <Pressable
                        onPress={() =>
                          void mexerAlerta({
                            ...alerts,
                            bands: { ...alerts.bands, notifyFull: !alerts.bands.notifyFull },
                          })
                        }
                        accessibilityRole="switch"
                        accessibilityState={{ checked: alerts.bands.notifyFull }}
                        // O nome, e o estado só no `accessibilityState` — a mesma
                        // forma dos irmãos. Este dizia certo, mas por DUAS fontes.
                        accessibilityLabel={t.app.settings.alerts.notifyFull}
                        style={styles.left}
                      >
                        <Chip
                          signal={alerts.bands.notifyFull ? 'ok' : 'neutral'}
                          label={t.app.settings.alerts.notifyFull}
                        />
                      </Pressable>
                    ) : null}

                    {/* O teto de silêncio, na mesma forma da antecedência e pela mesma
                        razão: o número só aparece para o alarme ligado. Seis horas serve
                        para sensor que mede sozinho; quarenta e oito, para quem anota na
                        mão e não quer ser acusado no fim de semana. */}
                    {kind === 'semMedida' && ligado ? (
                      <View style={[styles.wrap, { gap: space.xs }]}>
                        {[6, 12, 24, 48].map((h) => (
                          <Pressable
                            key={h}
                            onPress={() => void mexerAlerta({ ...alerts, staleHours: h })}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: h === alerts.staleHours }}
                            accessibilityLabel={fill(t.app.settings.alerts.staleHours, {
                              hours: plural(h, t.app.home.hourCount),
                            })}
                          >
                            <Chip
                              signal={h === alerts.staleHours ? 'ok' : 'neutral'}
                              label={formatQuantity(h, locale)}
                            />
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    {/* A antecedência só aparece para o alarme ligado que tem dia:
                        oferecer o ajuste de um alarme desligado é pedir decisão
                        sobre coisa que não vai acontecer. */}
                    {ligado && dias !== null ? (
                      <View style={[styles.wrap, { gap: space.xs }]}>
                        {[1, 2, 3, 5, 7, 14].map((d) => (
                          <Pressable
                            key={d}
                            onPress={() =>
                              void mexerAlerta({
                                ...alerts,
                                daysAhead: { ...alerts.daysAhead, [kind]: d },
                              })
                            }
                            accessibilityRole="radio"
                            accessibilityState={{ selected: d === dias }}
                            accessibilityLabel={`${t.app.settings.alerts.kinds[kind]}: ${d}`}
                          >
                            <Chip
                              signal={d === dias ? 'ok' : 'neutral'}
                              label={formatQuantity(d, locale)}
                            />
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* A hora e os dias, e valem para todos os avisos.
                Era uma lista de seis horas que EU escolhi, e o dono cortou: "nem
                toda fábrica funciona igual". Seis opções não são configuração, são
                um menu disfarçado — e a fábrica que começa às 5h30 não estava em
                nenhuma delas. Agora são dois campos e qualquer horário existe. */}
            <View style={{ marginTop: space.lg, gap: space.sm }}>
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {t.app.settings.alerts.hour.toUpperCase()}
              </Text>
              <View style={[styles.row, { gap: space.md }]}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t.app.settings.alerts.hourField}
                    value={String(Math.floor(alerts.minuteOfDay / 60))}
                    onChangeText={(texto) => {
                      const h = parseTyped(texto);
                      if (h === null || h < 0 || h > 23) return;
                      void mexerAlerta({
                        ...alerts,
                        minuteOfDay: Math.trunc(h) * 60 + (alerts.minuteOfDay % 60),
                      });
                    }}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label={t.app.settings.alerts.minuteField}
                    value={String(alerts.minuteOfDay % 60).padStart(2, '0')}
                    onChangeText={(texto) => {
                      const m = parseTyped(texto);
                      if (m === null || m < 0 || m > 59) return;
                      void mexerAlerta({
                        ...alerts,
                        minuteOfDay: Math.floor(alerts.minuteOfDay / 60) * 60 + Math.trunc(m),
                      });
                    }}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {t.app.settings.alerts.hourHint}
              </Text>

              <Text style={[type.overline, { color: color.inkFaint, marginTop: space.sm }]}>
                {t.app.settings.alerts.weekdays.toUpperCase()}
              </Text>
              <View style={[styles.wrap, { gap: space.xs }]}>
                {[0, 1, 2, 3, 4, 5, 6].map((dia) => {
                  // Zero é TODOS os dias, então nenhum chip aceso significa todos.
                  const escolhido = alerts.weekdays !== 0 && agreedOn(alerts.weekdays, dia);
                  return (
                    <Pressable
                      key={dia}
                      onPress={() =>
                        void mexerAlerta({ ...alerts, weekdays: toggleDay(alerts.weekdays, dia) })
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected: escolhido }}
                      accessibilityLabel={`${t.app.settings.alerts.weekdays}: ${formatWeekdayShort(dia, locale)}`}
                    >
                      <Chip
                        signal={escolhido ? 'ok' : 'neutral'}
                        label={formatWeekdayShort(dia, locale)}
                      />
                    </Pressable>
                  );
                })}
              </View>
              {alerts.weekdays === 0 ? (
                <Text style={[type.caption, { color: color.inkFaint }]}>
                  {t.app.settings.alerts.everyDay}
                </Text>
              ) : null}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* A aprovação de pedido.
          O tom é o do assunto e não o da tela: pedido é sage em todo o
          aplicativo, e quem vê a cor sabe do que a linha fala antes de ler. */}
      {podeEmpresa ? (
  <Reveal index={5}>
          <Pressable
            onPress={async () => {
              await setOrdersNeedApproval(empresaDaqui(), !approval);
              // E conta para a CASA. Sem isto a aprovação é decoração: o gatilho do
              // servidor lê `companies.orders_need_approval` e reescreve o pedido
              // para `open` na inserção. Silencioso de propósito — a mudança já
              // valeu neste aparelho, e um erro de rede aqui faria parecer que não.
              void empurrar();
              refreshApproval();
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: Boolean(approval) }}
            accessibilityLabel={t.app.settings.approval.label}
          >
            <Card
              hue={palette.sage}
              icon={(c) => <GlyphOrder size={26} color={c} weight={traco} />}
              title={t.app.settings.approval.label}
            >
              <View style={[styles.row, { gap: space.md }]}>
                <Text style={[type.caption, { color: color.inkMuted, flex: 1 }]}>
                  {t.app.settings.approval.hint}
                </Text>
                <Chip
                  signal={approval ? 'ok' : 'neutral'}
                  label={approval ? t.app.settings.approval.on : t.app.settings.approval.off}
                />
              </View>
            </Card>
          </Pressable>
        </Reveal>
      ) : null}

      {/* **A empresa que compra pronto e REVENDE.**

          Sem este interruptor a distribuidora nunca fecha a corrente do preparo: ela não tem
          insumo (o que ela compra é `resale`), não tem ficha e não faz corrida, então a capa
          oferece "cadastre um insumo" todo dia a quem já opera há um ano. É a queixa que abriu
          estas rodadas, dita por quem estava sendo mandado a um degrau que não é dele.

          O tom é o do assunto, e o assunto é COMPRA — a empresa que só revende compra pronto.
          `GlyphPurchase` fala sage no registro de assinatura, e eu tinha escrito sky: a guarda
          de cor pegou, e ela está certa, porque o desenho carrega o tom do assunto e não o da
          tela em que mora.

          E a frase diz o que o interruptor FAZ, não o que ele é: "a corrente para de ser
          cobrada" em vez de "modo revenda". Nome de modo obriga quem lê a adivinhar a
          consequência. */}
      {podeEmpresa ? (
        <Reveal index={6}>
          <Pressable
            onPress={async () => {
              await setOnlyResells(empresaDaqui(), !revende);
              // E conta para a CASA, como a aprovação: é decisão da empresa e vale em todo
              // aparelho dela. Silencioso quando a rede falha — a mudança já valeu aqui.
              void empurrar();
              refreshRevende();
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: Boolean(revende) }}
            accessibilityLabel={t.app.settings.resaleOnly.label}
          >
            <Card
              hue={palette.sage}
              icon={(c) => <GlyphPurchase size={26} color={c} weight={traco} />}
              title={t.app.settings.resaleOnly.label}
            >
              <View style={[styles.row, { gap: space.md }]}>
                <Text style={[type.caption, { color: color.inkMuted, flex: 1 }]}>
                  {t.app.settings.resaleOnly.hint}
                </Text>
                <Chip
                  signal={revende ? 'ok' : 'neutral'}
                  label={
                    revende ? t.app.settings.resaleOnly.on : t.app.settings.resaleOnly.off
                  }
                />
              </View>
            </Card>
          </Pressable>
        </Reveal>
      ) : null}

      {/* A folga de compra — o corte que decide "é hora de comprar".
          Ele é configuração e não constante pela F7: a fábrica que compra polpa
          na mesma cidade quer dois dias, a que importa essência de outro estado
          quer duas semanas. Não existe o corte certo, existe o corte dela — e o
          padrão de dois é o que o domínio já escrevia, não um número novo.

          Sete escolhas e não um campo livre: quem está de luva não digita, e a
          diferença entre 4 e 5 dias de folga não decide nada que 3 ou 7 já não
          decidam. */}
      {podeEmpresa ? (
  <Reveal index={6}>
          <Card
            hue={palette.sage}
            icon={(c) => <GlyphPurchase size={26} color={c} weight={traco} />}
            title={t.app.settings.safety.label}
          >
            <Text style={[type.caption, { color: color.inkMuted, marginBottom: space.md }]}>
              {t.app.settings.safety.hint}
            </Text>
            <View style={[styles.row, { gap: space.sm, flexWrap: 'wrap' }]}>
              {[0, 1, 2, 3, 5, 7, 14].map((dias) => (
                <Pressable
                  key={dias}
                  onPress={async () => {
                    await setPurchaseSafetyDays(empresaDaqui(), dias);
                    void empurrar();
                    refreshFolga();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: folga === dias }}
                  accessibilityLabel={
                    dias === 0
                      ? t.app.settings.safety.none
                      : plural(dias, t.app.settings.safety.days)
                  }
                >
                  <Chip
                    signal={folga === dias ? 'ok' : 'neutral'}
                    label={
                      dias === 0
                        ? t.app.settings.safety.none
                        : plural(dias, t.app.settings.safety.days)
                    }
                  />
                </Pressable>
              ))}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* Enviar para o servidor — e o cartão diz o número antes de o dedo tocar.

          A Lei 3: o número nunca aparece sozinho. "12 esperando para subir" é o que
          decide se vale gastar rede; "Enviar" sozinho é um botão que ninguém sabe
          se precisa. E quando não há nada esperando, a frase é positiva — "tudo o
          que este aparelho gravou já está no servidor" —, porque está tudo bem é um
          estado válido e bonito. */}
      <Reveal index={7}>
        <Card
          hue={palette.mist}
          icon={(c) => <GlyphSettings size={26} color={c} weight={traco} />}
          title={t.app.settings.syncTitle}
        >
          <Text style={[type.caption, { color: color.inkMuted }]}>
            {t.app.settings.syncHint}
          </Text>
          <Text style={[type.body, { color: color.ink, marginTop: space.sm }]}>
            {(naFila ?? 0) === 0
              ? t.app.settings.syncNothing
              : fill(t.app.settings.syncWaiting, { count: String(naFila) })}
          </Text>
          {(naFila ?? 0) > 0 ? (
            <Button
              label={enviando ? t.app.settings.syncSending : t.app.settings.syncAction}
              onPress={() => void enviar()}
              disabled={enviando}
              style={{ marginTop: space.md }}
            />
          ) : null}
          {oQueSubiu ? (
            <Text style={[type.body, { color: color.ink, marginTop: space.sm }]}>{oQueSubiu}</Text>
          ) : null}
          {/* O que não sobe nunca, dito com outras palavras que o que ainda vai subir.
              A frase orienta e não fiscaliza: ela diz o que aconteceu e o que fazer, e não
              culpa quem conferiu duas vezes — duas pessoas na mesma doca é o normal. */}
          {(deLado ?? 0) > 0 ? (
            <>
              <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
                {fill(t.app.settings.syncSetAside, { count: String(deLado) })}
              </Text>
              {/* O "onde ver" que a frase acima prometia desde que foi escrita.
                  Botão e não a própria frase tocável: a frase mora ao lado de "Enviar agora",
                  e dois alvos de toque com formas diferentes é o que separa "ler" de "abrir". */}
              <Button
                label={t.app.setAside.title}
                variant="ghost"
                // `as never` como nas outras telas: o mapa de rotas do Expo Router é gerado por
                // `expo start`, que não roda nesta máquina — o caminho existe, o tipo é que
                // está velho.
                onPress={() => router.push('/de-lado' as never)}
                style={{ marginTop: space.xs }}
              />
            </>
          ) : null}
        </Card>
      </Reveal>

      {/* O prazo do Reset no servidor — e por que ele mora aqui, ao lado do apagar.

          Decisão do dono: dez dias corridos de padrão, e os dois extremos existem
          como configuração. O que ele decide é o que a SEGUNDA confirmação vai
          dizer: com prazo, "o livro fica guardado por dez dias e até lá dá para
          desistir"; com zero, "é destruído junto"; com nunca, "o Reset vale só
          neste aparelho". Escolher aqui é escolher a frase que aparece na hora do
          susto.

          Cinco escolhas em vez de campo livre, como a folga de compra: quem está
          de luva não digita, e a diferença entre 9 e 11 dias não decide nada. */}
      {podeEmpresa ? (
  <Reveal index={8}>
          <Card
            hue={palette.mist}
            icon={(c) => <GlyphSettings size={26} color={c} weight={traco} />}
            title={t.app.settings.graceTitle}
          >
            <Text style={[type.caption, { color: color.inkMuted, marginBottom: space.md }]}>
              {t.app.settings.graceHint}
            </Text>
            <View style={[styles.row, { gap: space.sm, flexWrap: 'wrap' }]}>
              {([0, 10, 30, 90, null] as const).map((dias) => {
                const rotulo =
                  dias === null
                    ? t.app.settings.graceNever
                    : dias === 0
                      ? t.app.settings.graceNow
                      : fill(t.app.settings.graceDays, { days: String(dias) });
                return (
                  <Pressable
                    key={String(dias)}
                    onPress={async () => {
                      await setEraseGraceDays(empresaDaqui(), dias);
                      void empurrar();
                      refreshPrazo();
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: (prazo ?? null) === dias }}
                    accessibilityLabel={rotulo}
                  >
                    <Chip signal={(prazo ?? null) === dias ? 'ok' : 'neutral'} label={rotulo} />
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* Nomear quem gravou.
          O padrão é DESLIGADO por decisão do dono — "o relatório fala de onde,
          não de quem" —, e a frase diz o que muda em vez de nomear a chave. É a
          diferença entre o app orientar e o app fiscalizar, e essa escolha é da
          empresa, nunca nossa. */}
      {podeEmpresa ? (
  <Reveal index={6}>
          <Pressable
            onPress={async () => {
              await setNamesWhoRecorded(empresaDaqui(), !nomeia);
              void empurrar();
              refreshNomeia();
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: Boolean(nomeia) }}
            accessibilityLabel={t.app.settings.naming.label}
          >
            <Card
              hue={palette.mist}
              icon={(c) => <GlyphCustomer size={26} color={c} weight={traco} />}
              title={t.app.settings.naming.label}
            >
              <View style={[styles.row, { gap: space.md }]}>
                <Text style={[type.caption, { color: color.inkMuted, flex: 1 }]}>
                  {t.app.settings.naming.hint}
                </Text>
                <Chip
                  signal={nomeia ? 'ok' : 'neutral'}
                  label={nomeia ? t.app.settings.naming.on : t.app.settings.naming.off}
                />
              </View>
            </Card>
          </Pressable>
        </Reveal>
      ) : null}

      {/* Como se entra no chão de fábrica.
          Só aparece quando a empresa nomeia: sem nomear ninguém, escolher entre
          "um por pessoa" e "compartilhado" é escolher entre dois nadas. Gaveta
          que abre no vazio é pior que gaveta não desenhada. */}
      {podeEmpresa && nomeia ? (
        <Reveal index={7}>
            <Pressable
              onPress={async () => {
                await setFloorSignIn(empresaDaqui(), entrada === 'shared' ? 'personal' : 'shared');
                void empurrar();
                refreshEntrada();
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: entrada === 'shared' }}
              accessibilityLabel={t.app.settings.signIn.label}
            >
              <Card
                hue={palette.mist}
                icon={(c) => <GlyphCustomer size={26} color={c} weight={traco} />}
                title={t.app.settings.signIn.label}
              >
                <View style={[styles.row, { gap: space.md }]}>
                  <Text style={[type.caption, { color: color.inkMuted, flex: 1 }]}>
                    {t.app.settings.signIn.hint}
                  </Text>
                  <Chip
                    signal={entrada === 'shared' ? 'ok' : 'neutral'}
                    label={
                      entrada === 'shared'
                        ? t.app.settings.signIn.shared
                        : t.app.settings.signIn.personal
                    }
                  />
                </View>
              </Card>
            </Pressable>
          </Reveal>
      ) : null}

      {/* Começar do zero.
          Fantasma, sempre: botão grande e colorido convida, e ninguém deve ser
          convidado a apagar tudo. E o cartão só existe quando há o que apagar —
          um botão desabilitado é a reclamação que a Lei 5 proíbe. */}
      {podeEmpresa && !loading && total > 0 ? (
        <Reveal index={6}>
          <Card
            hue={color.danger}
            icon={(c) => <GlyphLoss size={26} color={c} weight={traco} />}
            title={t.app.settings.startOver}
          >
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.settings.startOverHint}
            </Text>
            <Button
              label={busy ? t.app.settings.erasing : t.app.settings.eraseAll}
              variant="ghost"
              disabled={busy || !counts}
              onPress={() => void run('all', t.app.settings.eraseAll)}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}

      {/* Vazio, e com a porta de volta para o exemplo.
          Estado vazio é desenho, uma frase e a próxima ação — não um parágrafo
          cinza no meio da tela. */}
      {total === 0 && !loading ? (
        <Reveal index={7}>
          <Card
            hue={palette.mist}
            icon={(c) => <GlyphCatalog size={26} color={c} weight={traco} />}
            title={t.app.settings.exampleTitle}
          >
            {!data?.example ? (
              <Chip signal="neutral" label={t.app.settings.emptyNoExample} />
            ) : null}
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.sm }]}>
              {t.app.settings.exampleEmpty}
            </Text>
            <Button
              label={t.app.settings.restore}
              variant="ghost"
              disabled={busy}
              onPress={() => void restore()}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}

      {/* Ver o app com movimento, em vez do exemplo de um dia.
          Fica embaixo do que apaga e do que restaura, porque é da mesma
          família: mexe no que está guardado, e diz antes o que vai fazer. */}
      {total > 0 && !loading ? (
        <Reveal index={8}>
          <Card
            hue={palette.mist}
            icon={(c) => <GlyphCalendar size={26} color={c} weight={traco} />}
            title={t.app.settings.simulate}
          >
            <Text style={[type.caption, { color: color.inkMuted }]}>
              {t.app.settings.simulateBody}
            </Text>
            <Button
              label={t.app.settings.simulateConfirm}
              variant="ghost"
              disabled={busy}
              onPress={() => void onSimulate()}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}

      <Reveal index={9}>
        <Button label={t.app.settings.back} variant="ghost" onPress={() => voltar()} />
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  top: { flexDirection: 'row', alignItems: 'flex-start' },
  bottom: { flexDirection: 'row', alignItems: 'flex-end' },
  left: { alignSelf: 'flex-start' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  /**
   * Os controles de uma linha, juntos.
   *
   * Alinhados à direita porque empilhados eles ficam DEBAIXO do nome: à esquerda os
   * chevrons mudariam de coluna a cada linha, conforme o comprimento do que está ao
   * lado. À direita eles formam a coluna que a mão procura sem ler.
   */
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
  /** O chevron da família fina, virado: subir é ele apontando para cima. */
  up: { transform: [{ rotate: '-90deg' }] },
  down: { transform: [{ rotate: '90deg' }] },
});

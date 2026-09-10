import { useLocalSearchParams, useRouter } from 'expo-router';
import { avisoDeFalha } from '@/i18n/falha';
import { ERROS } from '@/data/erros';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, priceSignal } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import {
  GlyphChart,
  GlyphCount,
  GlyphLoss,
  GlyphPrice,
  GlyphPurchase,
  GlyphRecipe,
  GlyphSack,
} from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { Sparkline } from '@/components/Sparkline';
import { useConfirm } from '@/components/Confirm';
import {
  recordLoss,
  balanceByLocation,
  canSeeMoney,
  dailyOutflowOf,
  purchaseSafetyDays,
  deliveriesOf,
  findItem,
  listPlaces,
  itemHistory,
  itemMovements,
  planReversal,
  recipeThatMakes,
  recipesUsingItem,
  reverseGroup,
  SemPermissaoError,
  recordCount,
  salePricesFor,
  setItemActive,
  type ItemWithCost,
  type LocationBalance,
  type MovementRow,
  type Place,
  type PriceMoveRow,
  type Delivery,
} from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { judgePriceChange, observedLeadTimeDays, reorderPoint } from '@/domain/cost';
import { amountOf } from '@/domain/money';
import { ehConferencia, vendeAoConsumidor, type LossReason } from '@/domain/ledger';
import { parseTyped } from '@/domain/number';
import { useQuery } from '@/data/useQuery';
import {
  fill,
  formatDayMonth,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatWeekdayShort,
  plural,
} from '@/i18n';
import { nowIso } from '@/data/db';
import { dayWindow } from '@/domain/day';

import { useLocale } from '@/i18n/useLocale';
import { ALVO } from '@/theme/tokens';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * One input, and everything the ledger already knows about it.
 *
 * The price history is the point. It is written by `recordPurchase` on the way
 * past, as a by-product of entering an invoice - nobody maintains it, and until
 * now nobody could see it either. Showing it is what turns "the cost went up"
 * from a claim into something the person can check, which is the difference
 * between an app they believe and an app they argue with.
 *
 * The recipes standing on the item are here for the same reason. A 9% rise on
 * sugar is a footnote or a crisis depending entirely on how many flavours use
 * it, and that is a question only the system can answer quickly.
 *
 * ---
 *
 * **A cara desta tela foi reescrita, não remendada.** O corpo anterior era
 * cartão cinza sem crachá nenhum — seis blocos com título escrito e nada
 * desenhado — e a escolha do motivo da perda era pílula feita à mão
 * (`borderWidth`, `borderRadius` e cor de borda próprios), que é vocabulário do
 * Orgânico chumbado numa tela que também tem que servir o Papel. Agora quem sabe
 * das duas caras são o `Card`, o `Button` e o `Chip`; aqui não se desenha caixa
 * nenhuma.
 *
 * Cada bloco carrega o tom do SEU assunto, que é o mesmo em todo o aplicativo:
 * o insumo e a prateleira em `mint`, o dinheiro em `sky`, a perda em `danger`, a
 * receita em `apricot`. Quem vê verde sabe que é almoxarifado antes de ler.
 *
 * A área passou de `mist` (que é a cor dos ajustes) para `mint`, que é o tom do
 * almoxarifado — o cabeçalho e o botão agora concordam com a lista de onde esta
 * tela é aberta.
 */
/**
 * A área é MINT mesmo quando o item é um picolé — e isso é decisão do aplicativo,
 * não descuido.
 *
 * Esta tela é a página de ESTOQUE de um item: saldo, contagem, perda, histórico.
 * O `docs/linguagem.md` e o `AREA_DO_GLIFO` já dizem que estoque é verde, e o
 * picolé pronto não é exceção — `GlyphStick` está listado em `mint` junto com o
 * saco e o balde. Eu cheguei a pintar esta tela de laranja quando ela passou a
 * receber produto, e o guarda da assinatura recusou com o argumento certo: **o
 * desenho carrega o tom do ASSUNTO, não o da tela em que mora.** Contar picolé é
 * estoque, venha a pessoa da lista de produtos ou da de insumos.
 *
 * O que muda com a espécie é o CONTEÚDO, e ele vem do dado: um produto feito
 * aqui não tem fornecedor, então "Como você compra" dá lugar a "Como é feito".
 */
export default function InputDetailScreen() {
  return (
    <AreaProvider area="mint">
      <InputDetail />
    </AreaProvider>
  );
}

type Loaded = {
  item: ItemWithCost | null;
  history: PriceMoveRow[];
  recipes: { id: string; name: string; quantity: number }[];
  /** A ficha que FAZ este item, quando ele é produto feito aqui. */
  fichaQueFaz: { id: string; name: string } | null;
  movements: MovementRow[];
  /** Onde este item está, sala por sala. Vazio é "não está em lugar nenhum". */
  spread: LocationBalance[];
  places: Place[];
  /** As notas com as duas datas: é delas que sai o prazo do fornecedor. */
  entregas: Delivery[];
  /** Se quem está com o aparelho vê dinheiro. Vem junto para não piscar cifra. */
  dinheiro: boolean;
  /** Quanto deste insumo sai por dia, na mesma janela de sete dias da lista. */
  saiPorDia: number;
  /**
   * O instante em que esta tela perguntou.
   *
   * Vem da consulta e não do render, e a regra `react-hooks/purity` está certa em
   * cobrar: `Date.now()` no desenho dá uma resposta diferente a cada redesenho, e
   * "compre até quinta" viraria "até sexta" no meio de uma rolagem. O relógio é
   * lido uma vez, com o resto do dado.
   */
  agora: string;
};

function InputDetail() {
  const { color, space, type, palette, traco } = useTheme();
  const confirm = useConfirm();
  const router = useRouter();
  const { locale, t } = useLocale();
  /**
   * O item, e a sala de onde a lista veio.
   *
   * A sala não é filtro de vitrine: ela decide contra QUE saldo a contagem é
   * comparada e em que lugar a diferença é gravada. Sem ela esta tela mostrava
   * o total da empresa e escrevia no almoxarifado — com a polpa dividida entre
   * a fábrica e a câmara fria, a conferência teleportava estoque.
   */
  const { id, sala } = useLocalSearchParams<{ id: string; sala?: string }>();

  // While a count is open the stock figure is deliberately hidden. This app's
  // own rule for counting says the expected number must not be on screen: a
  // person who can see it confirms the screen instead of the shelf, and the
  // check becomes theatre that nobody can tell apart from a real one.
  const [counting, setCounting] = useState(false);
  const [typed, setTyped] = useState('');

  /** Verdadeiro enquanto um estorno está sendo gravado, para não gravar dois. */
  const [desfazendo, setDesfazendo] = useState(false);

  const [losing, setLosing] = useState(false);
  const [lostText, setLostText] = useState('');
  const [reason, setReason] = useState<LossReason>('expired');

  const { data, loading, error, refresh } = useQuery<Loaded>(async () => {
    if (!id)
      return {
        item: null, history: [], recipes: [], fichaQueFaz: null, movements: [],
        spread: [], places: [], entregas: [], dinheiro: false, saiPorDia: 0, agora: '',
      };

    // Os lugares vêm primeiro porque a sala da rota tem de ser conferida contra
    // eles. Um id que não existe mais - o lugar foi apagado, ou o endereço veio
    // digitado na web - gravaria um movimento apontando para nada, e o servidor
    // recusaria a linha: fila travada atrás dela, que é a família de defeito que
    // já apareceu quatro vezes neste repositório.
    const places = await listPlaces(empresaDaqui());
    const room = sala && places.some((place) => place.id === sala) ? sala : undefined;

    // O saldo e os movimentos vão pela sala; o preço e as receitas não têm sala
    // — custo médio é da empresa, e uma ficha não muda de sala em sala.
    // A janela do consumo é a mesma da lista — sete dias —, e ela ser a mesma é
    // o que impede duas telas responderem "quanto sai por dia" com números
    // diferentes para o mesmo insumo.
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const semanaAtras = dayWindow(nowIso(), locale.timeZone, -7);
    const [item, history, recipes, fichaQueFaz, movements, spread, entregas, dinheiro, saiPorDia] = await Promise.all([
      // `room` é a sala aberta na rota, quando há uma. Sem sala, o saldo é da
      // UNIDADE deste aparelho e não da empresa: quem abre a ficha de um insumo
      // quer saber quanto tem aqui, e somar a outra cidade daria um número que
      // ninguém consegue usar para decidir produção.
      findItem(empresaDaqui(), id, room ? { sala: room } : { unidade: unidadeDaqui() }),
      itemHistory(empresaDaqui(), id),
      recipesUsingItem(empresaDaqui(), id),
      // A pergunta espelhada: quem FAZ isto. Nula para insumo e para revenda, e
      // é ela que decide se a tela oferece a ficha ou a compra.
      recipeThatMakes(empresaDaqui(), id),
      itemMovements(empresaDaqui(), id, 20, room ? { sala: room } : { unidade: unidadeDaqui() }),
      balanceByLocation(empresaDaqui(), id),
      // As notas que dizem quanto o fornecedor demorou. Sem portão: são dias, não
      // dinheiro — e é o operador que fica sem insumo quando o prazo estica.
      deliveriesOf(empresaDaqui(), id),
      // Na mesma consulta do resto: sem isso existe um instante em que a tela
      // tem os números e ainda não sabe se pode mostrá-los.
      canSeeMoney(empresaDaqui()),
      // A MESMA sala do saldo logo acima.
      //
      // Sem ela a tela dividia o saldo de UMA sala pelo consumo de TODAS, e o
      // resultado é o número que decide compra: abrindo a câmara fria, "acaba
      // em" saía menor do que é e o aviso de recompra disparava cedo.
      dailyOutflowOf(
        empresaDaqui(),
        id,
        semanaAtras.from,
        hoje.to,
        7,
        room ? { sala: room } : { unidade: unidadeDaqui() },
      ),
    ]);
    return {
      item, history, recipes, fichaQueFaz, movements, spread, places, entregas,
      dinheiro, saiPorDia, agora: hoje.from,
    };
  }, `${id ?? ''}|${sala ?? ''}`);

  /**
   * A folga que a EMPRESA escolheu. Padrão dois, que é o que o domínio já
   * escrevia — e o gancho mora AQUI, acima da saída antecipada de carregamento,
   * porque gancho depois de `return` muda a ordem entre um render e o seguinte.
   */
  const { data: folga } = useQuery<number>(() => purchaseSafetyDays());

  const item = data?.item ?? null;

  /** Feito aqui dentro — e é a ficha que responde, não a espécie. Revenda se compra. */
  const fichaQueFaz = data?.fichaQueFaz ?? null;

  if (loading || !item) {
    return (
      <CollapsingHeader
        cena="insumos"
        title={t.app.inputForm.fallbackTitle}
        overline={t.app.inputDetail.overline}
        erro={error}
        denovo={refresh}
      >
        <Reveal index={0}>
          <Card hue={palette.mint} icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.inkMuted }]}>
              {loading ? t.app.inputDetail.opening : t.app.inputDetail.gone}
            </Text>
          </Card>
        </Reveal>
      </CollapsingHeader>
    );
  }

  /**
   * O custo desta ficha — e `null` é a resposta quando não é seu para ver.
   *
   * Vem nulo por dois motivos que a tela trata separado: insumo nunca comprado
   * (a frase é *"ainda sem nota lançada"*, e a próxima ação é lançar a nota) e
   * portão fechado (a frase diz onde o número mora, e não há ação a tomar). Zero
   * respondia as duas com a primeira, que é a única errada das duas.
   */
  const dinheiro = data?.dinheiro === true;
  const folgaDaCompra = folga ?? 2;

  /**
   * O prazo do fornecedor, em dias — e o cálculo é do DOMÍNIO, não daqui.
   *
   * `observedLeadTimeDays` estava implementada e sem chamador desde sempre, com
   * uma razão registrada que dizia "precisa de meses de nota". A medição de 6 de
   * setembro desmentiu: o que faltava era alguém escrever `ordered_at`, e agora a
   * tela de compra escreve. Este é o primeiro leitor dela em produção.
   */
  const prazo = observedLeadTimeDays(data?.entregas ?? []);

  /**
   * O ponto de recompra — a Lei 4 saindo do papel.
   *
   * *"Avise na data da DECISÃO, não na data do problema."* O dia do problema é
   * quando o insumo acaba; o dia da decisão é `acaba − prazo do fornecedor −
   * a folga que a empresa escolheu`, e é esse que a tela diz.
   *
   * `reorderPoint` estava no domínio sem chamador, com uma razão registrada hoje
   * de manhã: *"falta a RÉGUA, e ela se afere contra uma fábrica"*. A razão está
   * certa sobre o NÚMERO e errada sobre a espera — a doutrina F7 desta casa diz
   * que "depende de quem usa" vira **configuração**, não pergunta nem fila. A
   * folga é da empresa (Ajustes), o padrão é dois porque é o que o domínio já
   * escrevia, e o que continua esperando uma fábrica é aferir esse padrão.
   *
   * Silêncio quando não se sabe o prazo, e isso não é timidez: sem `ordered_at`
   * anotado numa nota, qualquer data aqui seria inventada — e alerta inventado
   * ensina a ignorar alerta.
   */
  const saiPorDia = data?.saiPorDia ?? 0;
  const gatilho =
    prazo !== null && saiPorDia > 0
      ? reorderPoint(saiPorDia, prazo, folgaDaCompra)
      : null;
  const diasAteComprar =
    gatilho !== null && saiPorDia > 0
      ? Math.floor((item.onHandBaseUnits - gatilho) / saiPorDia)
      : null;
  const temCusto = item.averageRate !== null && item.averageRate > 0;
  const perThousand = temCusto ? Math.round((item.averageRate ?? 0) * 1_000) : 0;
  const held = Math.round((item.averageRate ?? 0) * item.onHandBaseUnits);
  const moves = (data?.history ?? []).filter((h) => h.previousRate !== null);

  // The last real move, which is the only one anybody asks about.
  const latest = moves[0];
  const latestChange =
    latest && latest.previousRate
      ? (latest.newRate - latest.previousRate) / latest.previousRate
      : null;

  /**
   * Onde o item está de verdade.
   *
   * `balanceByLocation` agrupa por local sem descartar soma zero, então um lugar
   * por onde o item passou e de onde saiu inteiro volta aqui com 0. Ele não tem
   * saldo, tem histórico - e listá-lo como "0 g" enche a tela de coisa que não
   * está lá, além de recusar uma contagem que era simples.
   */
  const spread = (data?.spread ?? []).filter((lugar) => lugar.baseUnits !== 0);
  /** A sala da rota, se ela existe. A conferência é a mesma que a consulta fez. */
  const salaAberta =
    sala && (data?.places ?? []).some((place) => place.id === sala) ? sala : undefined;
  /** O nome que a equipe usa. O lugar que nasceu com a empresa não tem nome gravado. */
  const nomeSala = (lugar: string) =>
    (data?.places ?? []).find((p) => p.id === lugar)?.name.trim() || t.app.places.factory;

  /**
   * A sala em que a contagem vai ser gravada — ou nada, e então ela não é
   * oferecida.
   *
   * A regra é uma frase: só se conta o número que está na tela. Com a sala
   * escolhida, o número é dela e a diferença é dela. Sem sala escolhida, o
   * número é o da empresa, e escrever a diferença dele contra UM lugar só é
   * mentira aritmética — então quando o item está em mais de um lugar a
   * contagem não acontece: a tela mostra onde ele está e leva num toque.
   *
   * Com um lugar só, a soma de um é igual à soma de todos e não há pergunta a
   * fazer: conta-se onde ele está (ou no lugar que nasceu com a empresa, quando
   * ele ainda não está em parte nenhuma).
   */
  const contarEm =
    salaAberta ??
    (spread.length > 1
      ? null
      : (spread[0]?.locationId ?? unidadeDaqui()));

  /**
   * Quando alguém conferiu esta prateleira pela última vez.
   *
   * `sale` entra na lista porque numa loja própria a contagem VIRA uma venda: se o
   * leitor olhasse só `adjustment`, o *"conferido em"* de toda loja congelaria no dia
   * em que ela bateu exato, e uma prateleira contada ontem pareceria não conferida há
   * meses — que é pior que não dizer nada, porque manda contar de novo.
   *
   * **E a fronteira, dita em vez de subentendida:** isto vale porque HOJE toda venda
   * nasce de uma contagem. No dia em que existir ponto de venda na loja, uma venda
   * deixa de provar que alguém andou até a prateleira, e este leitor passa a precisar
   * de um marcador de origem no movimento. O item do ponto de venda em
   * `docs/roadmap.md` carrega essa obrigação escrita.
   */
  const lastCount = (data?.movements ?? []).find((m) => ehConferencia(m.kind));
  const lastCounted = lastCount
    ? fill(t.app.inputDetail.lastCounted, { date: formatDayMonth(lastCount.occurredAt, locale) })
    : null;
  const heldWorth =
    held > 0 ? fill(t.app.inputDetail.heldHere, { amount: formatMoney(held, locale) }) : undefined;

  /**
   * Counting, spelled out before anything is written.
   *
   * The confirmation carries the whole comparison in words - what was counted,
   * what was expected, the difference and what it is worth - because this is
   * the moment a tired person is one keystroke from writing a wrong number
   * into a ledger that never forgets.
   */
  /**
   * A perda, dita por extenso antes de virar linha.
   *
   * O motivo é obrigatório no servidor desde a primeira migração, e a razão é
   * de negócio, não de esquema: "sumiram quatro quilos" não muda decisão
   * nenhuma; "quatro quilos venceram" muda a compra, e "derreteram" muda a
   * manutenção do freezer.
   */
  const submitLoss = async () => {
    const lost = parseTyped(lostText) ?? NaN;
    if (!Number.isFinite(lost) || lost <= 0) return;

    const worth = Math.round((item.averageRate ?? 0) * lost);
    const go = await confirm({
      title: t.app.inputDetail.lossAsk,
      // Sem custo, a cláusula do dinheiro SAI da frase em vez de virar
      // "vale R$ 0,00": é a tela que grava, e é aqui que os números por extenso
      // valem mais.
      message: fill(dinheiro ? t.app.inputDetail.lossBody : t.app.inputDetail.lossBodyNoMoney, {
        amount: `${formatQuantity(Math.round(lost), locale)} ${item.baseUnit}`,
        item: item.name,
        reason: t.loss[reason].toLocaleLowerCase(locale.formatting),
        money: formatMoney(worth, locale),
      }),
      confirmLabel: t.app.inputDetail.lossConfirm,
    });
    if (!go) return;

    try {
      await recordLoss(empresaDaqui(), {
        // A sala vai junto, e é a MESMA da contagem — cicatriz de 8 de setembro.
        // `recordLoss` tem a sala como opcional e cai no lugar padrão quando ela
        // falta (`repository.ts:2711`), e esta tela não a passava. Com a tela
        // aberta em `?sala=<câmara fria>` o número mostrado é o da câmara
        // (`findItem` recebe a sala), a perda saía do almoxarifado, e os dois
        // saldos ficavam errados de uma vez — o da câmara alto, o do almoxarifado
        // baixo, e a soma da empresa certa, que é o que faz ninguém notar.
        locationId: contarEm ?? undefined,
        itemId: item.id,
        baseUnits: Math.round(lost),
        reason,
      });
      setLosing(false);
      setLostText('');
      refresh();
    } catch (e) {
      await confirm({
        title: t.app.inputDetail.lossFailed,
        message: avisoDeFalha(e, t, ERROS).message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    }
  };

  const submitCount = async () => {
    const counted = (parseTyped(typed) ?? NaN);
    if (!Number.isFinite(counted) || counted < 0) return;
    // Sem sala não se grava: o botão nem aparece nesse estado, e o retorno aqui
    // é o que garante que ele não pode voltar por outro caminho.
    if (!contarEm) return;

    const expected = item.onHandBaseUnits;
    const delta = Math.round(counted) - expected;

    /**
     * Numa loja própria a falta não é falta: é venda — e a confirmação tem de dizer
     * isso ANTES de gravar, porque é o que vai para o razão.
     *
     * A pergunta é à ESPÉCIE do lugar e nunca ao id, com a régua do domínio
     * respondendo, para a tela e `recordCount` não decidirem por caminhos diferentes
     * o que a mesma linha significa. Foi assim que a produção liberou um botão que a
     * escrita recusava, no mesmo dia.
     */
    const lugarContado = (data?.places ?? []).find((p) => p.id === contarEm);
    const vendeu = delta < 0 && lugarContado !== undefined && vendeAoConsumidor(lugarContado.kind);

    /**
     * O preço só é buscado no toque, e só quando há venda.
     *
     * Não vem na consulta da tela porque a sala da contagem é deduzida DEPOIS dela —
     * ela depende de em quantos lugares o item está —, e porque uma ficha de insumo
     * aberta cem vezes por dia não deve pedir a tabela de preços de uma loja que
     * ninguém vai contar. `salePricesFor` traz o portão consigo (`manage_company`):
     * quem não pode ver o acordo recebe lista vazia, cai na frase sem cifra, e o
     * razão continua congelando o preço certo — o portão é da LEITURA, nunca do fato.
     */
    let receita: number | null = null;
    if (vendeu) {
      const acordo = (await salePricesFor(empresaDaqui(), contarEm)).find(
        (linha) => linha.itemId === item.id,
      );
      const taxa = acordo?.agreedRate ?? acordo?.listRate ?? null;
      // `amountOf` e não `Math.round` aqui, e a diferença não é estética: é ele que
      // `recordCount` usa para gravar a receita. Duas aritméticas para o mesmo número
      // é a forma que produz divergência, e aqui a divergência seria a confirmação
      // prometendo um valor que o razão não guarda — a Lei 3 virada do avesso.
      if (taxa !== null) receita = Math.abs(amountOf(taxa, delta));
    }

    const worth = Math.abs(Math.round((item.averageRate ?? 0) * delta));

    const shown = {
      counted: `${formatQuantity(Math.round(counted), locale)} ${item.baseUnit}`,
      expected: `${formatQuantity(expected, locale)} ${item.baseUnit}`,
      diff: `${formatQuantity(Math.abs(delta), locale)} ${item.baseUnit}`,
      // Na venda o dinheiro é a RECEITA, não o custo. Trocar um pelo outro aqui
      // mostraria o que a fábrica gastou numa frase que fala do que ela ganhou —
      // e quem lê acharia que a margem é zero.
      money: formatMoney(receita ?? worth, locale),
    };

    const go = await confirm({
      title: t.app.inputDetail.countConfirmTitle,
      message: fill(
        vendeu
          ? receita !== null
            ? t.app.inputDetail.countConfirmSold
            : t.app.inputDetail.countConfirmSoldNoPrice
          : delta === 0
            ? t.app.inputDetail.countConfirmExact
            : delta < 0
              ? dinheiro
                ? t.app.inputDetail.countConfirmShort
                : t.app.inputDetail.countConfirmShortNoMoney
              : dinheiro
                ? t.app.inputDetail.countConfirmOver
                : t.app.inputDetail.countConfirmOverNoMoney,
        shown,
      ),
      confirmLabel: t.app.inputDetail.countConfirmAction,
    });
    if (!go) return;

    // O portão de escrita pode recusar — contar prateleira pede `adjust_stock` — e
    // sem `catch` o toque não gravava e a tela ficava igual: a pessoa toca de novo,
    // depois desiste, e a contagem não acontece. Lei 5, e é a contagem que ela mais
    // protege.
    try {
      await recordCount(empresaDaqui(), {
        locationId: contarEm,
        itemId: item.id,
        countedBaseUnits: Math.round(counted),
      });
    } catch (e) {
      const aviso = avisoDeFalha(e, t, ERROS);
      await confirm({
        title: aviso.title,
        message: aviso.message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }
    setCounting(false);
    setTyped('');
    await refresh();
  };

  /**
   * Desfazer um lançamento — a fundação, com os números por extenso antes.
   *
   * O plano vem do razão, não da tela: `planReversal` diz quanto volta, de onde,
   * e recusa o que deixaria saldo negativo. A tela só fala português em cima do
   * que ele respondeu, que é a divisão de trabalho deste projeto.
   *
   * Nada é apagado: o estorno é uma linha nova que nega a anterior, e as duas
   * ficam. É por isso que a confirmação diz "fica registrado" em vez de "apaga".
   */
  const desfazer = async (move: MovementRow) => {
    if (!move.groupId || desfazendo) return;

    let plano;
    try {
      plano = await planReversal(empresaDaqui(), move.groupId);
    } catch {
      // Grupo que não existe é linha antiga, gravada antes de o ato carregar
      // grupo. Não é erro da pessoa e não vale diálogo de falha.
      return;
    }

    const diga = (l: { baseUnits: number; baseUnit: string; name: string }) =>
      fill(t.common.amountOf, {
        amount: `${formatQuantity(Math.abs(l.baseUnits), locale)} ${l.baseUnit}`,
        name: l.name,
      });

    if (plano.alreadyReversed) {
      await confirm({
        title: t.app.inputDetail.undoDone,
        message: t.app.inputDetail.undoDoneBody,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }

    // O que falta para o estorno CABER, dito antes de tentar: a Lei 5 diz que o
    // erro impede, e impedir sem dizer o caminho é beco.
    if (plano.blocked.length > 0) {
      await confirm({
        title: t.app.inputDetail.undoBlocked,
        message: fill(t.app.inputDetail.undoBlockedBody, {
          items: plano.blocked
            .map((b) =>
              fill(t.app.inputDetail.undoBlockedLine, {
                name: b.name,
                needed: `${formatQuantity(b.needed, locale)} ${b.baseUnit}`,
                held: `${formatQuantity(b.held, locale)} ${b.baseUnit}`,
              }),
            )
            .join(' · '),
        }),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }

    const volta = plano.legs.filter((l) => l.baseUnits > 0);
    const sai = plano.legs.filter((l) => l.baseUnits < 0);
    const go = await confirm({
      title: fill(t.app.inputDetail.undoTitle, {
        what: t.movement[move.kind as keyof typeof t.movement] ?? move.kind,
      }),
      message: fill(t.app.inputDetail.undoBody, {
        back: volta.length > 0 ? volta.map(diga).join(' · ') : t.app.inputDetail.undoNothingBack,
        out: sai.length > 0 ? sai.map(diga).join(' · ') : t.app.inputDetail.undoNothingOut,
      }),
      confirmLabel: t.app.inputDetail.undoConfirm,
      // Sem `destructive`: desfazer um lançamento é o caminho de volta.
    });
    if (!go) return;

    setDesfazendo(true);
    try {
      await reverseGroup(empresaDaqui(), { groupId: move.groupId });
      await refresh();
    } catch (e) {
      await confirm({
        title: t.app.inputDetail.undoFailed,
        // `e.message` é frase de programador, e ela chegava inteira à tela: *"sem
        // permissão para escrever reversal"*. É a mesma cicatriz do
        // `NotEnoughStockError`, que esta casa já pagou — quem lê está de luva na
        // câmara fria, não lendo o código.
        message:
          e instanceof SemPermissaoError
            ? t.app.inputDetail.undoNotYours
            : e instanceof Error
              ? e.message
              : String(e),
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
    } finally {
      setDesfazendo(false);
    }
  };

  const toggleActive = async () => {
    const go = await confirm({
      title: item.active ? t.app.inputDetail.retireTitle : t.app.inputDetail.bringBackTitle,
      message: fill(
        item.active ? t.app.inputDetail.retireBody : t.app.inputDetail.bringBackBody,
        { name: item.name },
      ),
      confirmLabel: item.active ? t.app.inputDetail.retireConfirm : t.app.inputDetail.bringBack,
      // Sem `destructive`: tirar de circulação é destrutivo e TEM volta — o mesmo
      // botão traz de volta, e o histórico do insumo não é tocado.
    });
    if (!go) return;

    await setItemActive(empresaDaqui(), item.id, !item.active).then(refresh);
  };

  return (
    <CollapsingHeader
      cena="insumos"
      title={item.name}
      overline={item.active ? t.app.inputDetail.overline : t.app.inputDetail.retiredOverline}
    >
      {/* Fora de circulação, dito antes de tudo — é o que muda o significado de
          todo número abaixo. Em âmbar, e não em vermelho: nada está errado,
          só parado. */}
      {item.active ? null : (
        <Reveal index={0}>
          {/* sinal — este cartão só existe enquanto o insumo está fora de circulação */}
          <Card
            hue={color.warning}
            icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.retiredTitle}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.inputDetail.retiredBody}
            </Text>
          </Card>
        </Reveal>
      )}

      {/* O custo, que é o único número grande da tela — e ele nunca aparece
          sozinho: embaixo vem de onde ele saiu, e ao lado o quanto mudou na
          última compra. Quando não houve segunda compra, o motivo de não haver
          comparação fica escrito em vez de o número ficar nu. */}
      <Reveal index={1}>
        <Card
          hue={palette.sky}
          icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
          title={t.app.reports.rows.cost.label}
        >
          <Text style={[type.overline, { color: color.inkFaint }]}>
            {t.app.inputDetail.currentCost}
          </Text>
          {dinheiro ? (
            <Text style={[type.figure, { color: color.ink, marginTop: space.xs }]}>
              {temCusto ? formatMoney(perThousand, locale) : '—'}
            </Text>
          ) : null}
          {/* Sem custo ainda, e o MOTIVO muda com quem é o item.
              *"ainda sem nota lançada"* manda lançar a nota — orientação certa para
              um insumo e impossível para um picolé, que a própria fábrica faz e
              que não tem fornecedor. A foto pegou a frase inteira debaixo de um
              travessão, na tela de um produto: a Lei 5 diz que erro se impede, e
              mandar alguém procurar uma nota que não existe é o contrário disso. */}
          <Text style={[type.caption, { color: color.inkMuted }]}>
            {!dinheiro
              ? t.common.moneyHidden
              : temCusto
                ? fill(t.app.inputDetail.averageOf, { unit: item.baseUnit })
                : fichaQueFaz
                  ? t.app.inputDetail.noRunYet
                  : t.app.inputDetail.noInvoiceYet}
          </Text>

          {latestChange !== null && Math.abs(latestChange) >= 0.001 ? (
            <View style={{ marginTop: space.md }}>
              <Chip
                signal={priceSignal(judgePriceChange(latestChange))}
                label={fill(
                  latestChange > 0 ? t.app.inputDetail.wentUp : t.app.inputDetail.wentDown,
                  { percent: formatPercent(Math.abs(latestChange), locale) },
                )}
              />
            </View>
          ) : moves.length === 0 && temCusto ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
              {t.app.inputDetail.historyEmpty}
            </Text>
          ) : null}
        </Card>
      </Reveal>

      {/* Como é feito — e este cartão é a razão de a lista de produtos poder
          mandar para cá.
          Antes, a linha de um picolé na lista de produtos abria a RECEITA, e o
          picolé em si não tinha tela: nem saldo, nem contagem, nem perda, com
          três dos cinco motivos de perda (derreteu, quebrou, cortesia) existindo
          só para ele. Agora a lista abre o item e a ficha fica a um toque daqui,
          que é a ordem certa — quem pensa no picolé pensa em quantos tem, e só
          depois em como ele é feito. */}
      {fichaQueFaz ? (
        <Reveal index={2}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.madeBy}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.inputDetail.madeByHint}
            </Text>
            <View style={{ marginTop: space.sm }}>
              <ListRow
                label={fichaQueFaz.name}
                onPress={() => router.push(`/recipes/${fichaQueFaz.id}`)}
              />
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* Como o item entra: a embalagem, o que vem dentro e o que a embalagem
          custa. É o que faz a régua do número de cima ser conferível — "por
          quilo" só quer dizer alguma coisa ao lado de "o saco tem 25 kg".

          Não existe para o que é FEITO aqui: um picolé não tem fornecedor, não
          tem saco de 25 kg e não tem prazo de entrega. Mostrar "Como você compra"
          com três travessões para um produto da própria fábrica é a tela fazendo
          uma pergunta que não é dali. Revenda continua vendo — ela se compra. */}
      {fichaQueFaz ? null : (
      <Reveal index={2}>
        <Card
          hue={palette.mint}
          icon={(c) => <GlyphSack size={26} color={c} weight={traco} />}
          title={t.app.inputDetail.howYouBuy}
        >
          <ListRow label={t.app.inputDetail.pack} trailing={item.purchaseUnit ?? '—'} />
          <ListRow
            label={t.app.inputDetail.perPack}
            trailing={
              item.purchaseToBase
                ? `${formatQuantity(item.purchaseToBase, locale)} ${item.baseUnit}`
                : '—'
            }
          />
          <ListRow
            label={fill(t.app.inputDetail.pricePer, {
              pack: item.purchaseUnit ?? t.app.inputDetail.pack.toLowerCase(),
            })}
            trailing={
              item.purchaseToBase && temCusto
                ? formatMoney(Math.round((item.averageRate ?? 0) * item.purchaseToBase), locale)
                : '—'
            }
          />

          {/* Quanto o fornecedor demora — medido, e ao lado de como se compra.
              Sem régua nenhuma: não existe "compre agora" aqui, porque isso se
              afere contra uma fábrica e não contra um banco semeado. O que existe é
              o fato, e o fato só aparece quando alguém anotou a data do pedido; sem
              isso a tela diz o que destrava, em vez de mostrar um traço. */}
          {/* E a régua, que passou a existir porque a folga virou configuração
              da empresa: agora não há um corte escolhido por nós — há o corte
              dela, e a conta aparece por extenso ao lado da conclusão. */}
          {diasAteComprar !== null ? (
            <ListRow
              label={
                diasAteComprar <= 0
                  ? t.app.inputDetail.buyNow
                  : diasAteComprar > 10
                    ? t.app.inputDetail.buyCalm
                    : fill(t.app.inputDetail.buyBy, {
                        // O dia da semana e não a data: "compre até quinta" é como
                        // alguém fala, e "compre até 11/09" é como um sistema fala.
                        weekday: formatWeekdayShort(
                          new Date(
                            new Date(data?.agora ?? '').getTime() + diasAteComprar * 86_400_000,
                          ).getDay(),
                          locale,
                        ),
                      })
              }
              detail={
                diasAteComprar > 10
                  ? fill(t.app.inputDetail.buyCalmWhy, {
                      cover: plural(
                        Math.floor(item.onHandBaseUnits / saiPorDia),
                        t.app.home.dayCount,
                      ),
                    })
                  : fill(t.app.inputDetail.buyWhy, {
                      cover: plural(
                        Math.floor(item.onHandBaseUnits / saiPorDia),
                        t.app.home.dayCount,
                      ),
                      lead: plural(Math.round(prazo ?? 0), t.app.home.dayCount),
                      slack: plural(folgaDaCompra, t.app.home.dayCount),
                    })
              }
            />
          ) : null}

          {prazo === null ? (
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
              {t.app.inputDetail.leadTimeUnknown}
            </Text>
          ) : (
            <ListRow
              label={t.app.inputDetail.leadTime}
              detail={fill(t.app.inputDetail.leadTimeFrom, {
                count: plural((data?.entregas ?? []).length, t.app.inputDetail.noteCount),
              })}
              trailing={plural(
                Math.round(prazo),
                t.app.home.dayCount,
                formatQuantity(Math.round(prazo), locale),
              )}
            />
          )}
        </Card>
      </Reveal>
      )}

      {/* O saldo e a conferência dele, no mesmo cartão porque são a mesma
          pergunta: quanto o sistema acha que tem, e quanto tem de verdade. O
          número desaparece enquanto a contagem está aberta — com ele na tela a
          conferência vira cópia, e uma cópia não se distingue de uma contagem. */}
      <Reveal index={3}>
        <Card
          hue={palette.mint}
          icon={(c) => <GlyphCount size={26} color={c} weight={traco} />}
          title={t.app.inputDetail.countTitle}
        >
          <ListRow
            label={t.app.inputDetail.inStock}
            detail={counting ? t.app.inputDetail.countHidden : lastCounted ?? heldWorth}
            trailing={
              counting ? '—' : `${formatQuantity(item.onHandBaseUnits, locale)} ${item.baseUnit}`
            }
          />
          {/* Que sala este número é, escrito. Um saldo de sala apresentado sem
              dizer de que sala é um número que parece o total da empresa. */}
          {salaAberta ? (
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
              {fill(t.app.inputDetail.countRoom, { room: nomeSala(salaAberta) })}
            </Text>
          ) : null}
          {/* A frase mora DENTRO da contagem aberta, que é o único estado em que
              ela é verdade.
              Fora do ternário, ela dizia duas coisas falsas sobre o que estava
              ao lado dela: "escreva aqui" sem campo nenhum na tela, e "o número
              que o sistema espera fica escondido" com o número uma linha acima,
              em negrito. Pior que discordar — a segunda metade da frase enuncia
              a regra ("se ele estiver na tela, a conferência vira cópia") que o
              estado exibido estava quebrando. O convite do estado fechado é o
              botão, que já existe embaixo. */}
          {counting ? (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {t.app.inputDetail.countHint}
              </Text>
              <Field
                label={t.app.inputDetail.countLabel}
                value={typed}
                onChangeText={setTyped}
                keyboardType="numeric"
                suffix={item.baseUnit}
                autoFocus
              />
              <Button label={t.app.inputDetail.countConfirm} onPress={submitCount} />
              <Button
                label={t.app.inputDetail.countCancel}
                variant="ghost"
                onPress={() => {
                  setCounting(false);
                  setTyped('');
                }}
              />
            </View>
          ) : contarEm === null ? (
            /* Mais de um lugar, e nenhum escolhido: a contagem não é oferecida.
               Erro se impede, não se reclama — e impedir sem mostrar a saída é
               beco, então cada lugar é uma linha que leva à contagem dele. */
            <View style={{ marginTop: space.md, gap: space.xs }}>
              <Text style={[type.caption, { color: color.inkMuted }]}>
                {fill(t.app.inputDetail.countSpread, {
                  count: formatQuantity(spread.length, locale),
                })}
              </Text>
              {spread.map((lugar) => (
                <ListRow
                  key={lugar.locationId}
                  label={nomeSala(lugar.locationId)}
                  trailing={`${formatQuantity(lugar.baseUnits, locale)} ${item.baseUnit}`}
                  onPress={() => router.push(`/inputs/${item.id}?sala=${lugar.locationId}`)}
                />
              ))}
            </View>
          ) : (
            <View style={{ marginTop: space.md }}>
              <Button
                label={t.app.inputDetail.countStart}
                variant="ghost"
                onPress={() => setCounting(true)}
              />
            </View>
          )}
        </Card>
      </Reveal>

      {/* A perda, ao lado da contagem, porque são a mesma família: as duas
          dizem que a prateleira discorda do sistema. A diferença é que a
          contagem não sabe por quê e a perda sabe - e é o porquê que faz o
          relatório servir para decidir.

          O motivo é escolhido em palavra, sem pílula desenhada à mão: o
          escolhido muda de cor E de peso, porque cor sozinha não é informação
          para quem não distingue vermelho de cinza. */}
      <Reveal index={4}>
        <Card
          hue={color.danger}
          icon={(c) => <GlyphLoss size={26} color={c} weight={traco} />}
          title={t.app.inputDetail.lossTitle}
        >
          <Text style={[type.secondary, { color: color.inkMuted }]}>
            {t.app.inputDetail.lossHint}
          </Text>

          {contarEm === null ? (
            /* Mesma regra da contagem, pelo mesmo motivo: só se perde o número que
               está na tela. Com o item em mais de um lugar e nenhum escolhido, o
               número é o da empresa, e tirar dele contra UM lugar é a mesma mentira
               aritmética. A saída é a de cima — cada lugar leva ao seu. */
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.md }]}>
              {fill(t.app.inputDetail.lossSpread, {
                count: formatQuantity(spread.length, locale),
              })}
            </Text>
          ) : losing ? (
            <View style={{ marginTop: space.md, gap: space.md }}>
              <Field
                label={t.app.inputDetail.lossAmount}
                value={lostText}
                onChangeText={setLostText}
                keyboardType="numeric"
                suffix={item.baseUnit}
                autoFocus
              />

              <Text style={[type.overline, { color: color.inkFaint }]}>
                {t.app.inputDetail.lossWhy.toUpperCase()}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {REASONS.map((r) => {
                  const chosen = reason === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setReason(r)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: chosen }}
                      accessibilityLabel={t.loss[r]}
                      style={{
                        paddingVertical: space.sm,
                        paddingRight: space.md,
                        minHeight: ALVO,
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={[
                          type.body,
                          {
                            color: chosen ? color.danger : color.inkMuted,
                            fontWeight: chosen ? '600' : '400',
                          },
                        ]}
                      >
                        {t.loss[r]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Button label={t.app.inputDetail.lossConfirm} onPress={submitLoss} weighty />
              <Button
                label={t.app.inputDetail.lossCancel}
                variant="ghost"
                onPress={() => {
                  setLosing(false);
                  setLostText('');
                }}
              />
            </View>
          ) : (
            <View style={{ marginTop: space.md }}>
              <Button
                label={t.app.inputDetail.lossStart}
                variant="ghost"
                onPress={() => setLosing(true)}
              />
            </View>
          )}
        </Card>
      </Reveal>

      {/* O histórico, desenhado antes de ser lido: a linha diz se o preço sobe
          há três compras, e as linhas embaixo dizem de quanto para quanto.
          Sem segunda compra não há cartão — o motivo já está dito ao lado do
          número lá em cima. */}
      {moves.length > 0 ? (
        <Reveal index={5}>
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphChart size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.history}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.inputDetail.historyHint}
            </Text>

            {(data?.history ?? []).length > 1 ? (
              <View style={{ marginTop: space.md }}>
                <Sparkline
                  values={[...(data?.history ?? [])].reverse().map((h) => h.newRate)}
                  hue={palette.sky}
                />
              </View>
            ) : null}

            <View style={{ marginTop: space.sm }}>
              {moves.map((move) => {
                const previous = move.previousRate ?? move.newRate;
                const change = previous > 0 ? (move.newRate - previous) / previous : 0;
                return (
                  <ListRow
                    key={move.observedAt}
                    label={formatDayMonth(move.observedAt, locale)}
                    detail={`${formatMoney(Math.round(previous * 1_000), locale)} → ${formatMoney(
                      Math.round(move.newRate * 1_000),
                      locale,
                    )}`}
                    trailing={`${change > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(change), locale)}`}
                    trailingTone={change > 0 ? 'warning' : 'ok'}
                  />
                );
              })}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* Quem se apoia neste item, em laranja porque receita é produção. É o
          que diz se um aumento aqui é nota de pé de página ou crise — e é a
          porta para a receita, que é onde se faz alguma coisa a respeito. */}
      {(data?.recipes.length ?? 0) > 0 ? (
        <Reveal index={6}>
          <Card
            hue={palette.apricot}
            icon={(c) => <GlyphRecipe size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.usedBy}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {data!.recipes.length === 1
                ? t.app.inputDetail.usedByOne
                : fill(t.app.inputDetail.usedByMany, { count: data!.recipes.length })}
            </Text>
            <View style={{ marginTop: space.sm }}>
              {data!.recipes.map((recipe) => (
                <ListRow
                  key={recipe.id}
                  label={recipe.name}
                  trailing={`${formatQuantity(recipe.quantity, locale)} ${item.baseUnit}`}
                  onPress={() => router.push(`/recipes/${recipe.id}`)}
                />
              ))}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* O que foi lançado, e o desfazer de cada um.
          Some enquanto a contagem está aberta, pela mesma razão que o saldo some:
          a cegueira é propriedade da TELA, não de um cartão. A linha "+50.000 g"
          de uma compra recente é o número esperado escrito de outro jeito, e com
          ele à vista a conferência vira cópia — que é indistinguível de uma
          contagem de verdade no dia seguinte. O e2e pegou isto na primeira
          execução depois do cartão novo; nenhum teste de unidade podia.
          A fundação diz que se corrige por estorno, nunca por exclusão — e até
          agora só a corrida de produção tinha por onde. A nota digitada com dez
          sacos onde era um, a perda de 40 onde era 4, o zero contado com o dedo
          torto: os três ficavam no razão para sempre.
          Linha sem grupo não oferece desfazer: movimento antigo, gravado antes de
          o ato carregar grupo. Melhor não oferecer do que oferecer e falhar. */}
      {!counting && (data?.movements ?? []).length > 0 ? (
        <Reveal index={7}>
          <Card
            hue={palette.mint}
            icon={(c) => <GlyphCount size={26} color={c} weight={traco} />}
            title={t.app.inputDetail.entries}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.inputDetail.entriesHint}
            </Text>
            <View style={{ marginTop: space.sm }}>
              {(data?.movements ?? []).slice(0, 8).map((move) => {
                const podeDesfazer = move.groupId !== null && !move.reversed && !desfazendo;
                const quanto = `${move.baseUnits > 0 ? '+' : '−'}${formatQuantity(
                  Math.abs(move.baseUnits),
                  locale,
                )} ${item.baseUnit}`;
                return (
                  <ListRow
                    key={move.id}
                    label={t.movement[move.kind as keyof typeof t.movement] ?? move.kind}
                    detail={
                      move.reversed
                        ? `${formatDayMonth(move.occurredAt, locale)} · ${t.app.inputDetail.undone}`
                        : formatDayMonth(move.occurredAt, locale)
                    }
                    trailing={quanto}
                    trailingTone={move.reversed ? 'muted' : move.baseUnits > 0 ? 'ok' : 'ink'}
                    onPress={podeDesfazer ? () => void desfazer(move) : undefined}
                  />
                );
              })}
            </View>
          </Card>
        </Reveal>
      ) : null}

      {/* A próxima ação provável, ao alcance do polegar: lançar a compra é o
          que quase sempre traz alguém a esta tela. Corrigir e tirar de
          circulação ficam fantasma — botão grande e colorido convida, e
          ninguém deve ser convidado a desfazer. */}
      <Reveal index={8}>
        <View style={{ gap: space.sm }}>
          <Button
            label={t.app.inputDetail.recordPurchase}
            onPress={() => router.push(`/purchase?itemId=${item.id}`)}
            icon={(c) => <GlyphPurchase size={22} color={c} weight={traco} />}
            weighty
          />
          <Button
            label={t.app.inputDetail.correct}
            variant="ghost"
            onPress={() => router.push(`/inputs/new?id=${item.id}`)}
          />
          <Button
            label={item.active ? t.app.inputDetail.retire : t.app.inputDetail.bringBack}
            variant="ghost"
            onPress={() => void toggleActive()}
          />
        </View>
      </Reveal>
    </CollapsingHeader>
  );
}

/** As cinco palavras que o servidor aceita, na ordem em que a fábrica as usa. */
const REASONS: LossReason[] = ['expired', 'melted', 'broken', 'courtesy', 'internal_use'];

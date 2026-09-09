import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  CostChange,
  ItemWithCost,
  MovementRow,
  Place,
  PlaceStock,
  Product,
} from '@/data/repository';
import { fromDecimal, rate, type Cents, type Rate } from '@/domain/money';
import type { ItemCosts, Recipe } from '@/domain/recipe';
import { defaultLocale } from '@/i18n';
import { ask } from './index';
import { findByName, namesakes, parseNumber } from './text';
import type { AssistantData, Capability, SkillContext } from './types';

/**
 * The assistant is the part of this app most able to destroy trust, because it
 * speaks in sentences and sentences sound certain. These tests hold it to the
 * two promises that make it safe: it never invents a figure, and it never
 * writes anything a person did not confirm.
 */

const ITEMS: ItemWithCost[] = [
  {
    id: 'pulp',
    kind: 'input',
    name: 'Polpa de morango',
    purchaseUnit: 'balde 10 kg',
    purchaseToBase: 10_000,
    baseUnit: 'g',
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
    fullLevel: null,
    averageRate: rate(12.4, 1_000),
    lastRate: rate(12.4, 1_000),
    onHandBaseUnits: 40_000,
    active: true,
  },
  {
    id: 'sugar',
    kind: 'input',
    name: 'Açúcar cristal',
    purchaseUnit: 'saco 25 kg',
    purchaseToBase: 25_000,
    baseUnit: 'g',
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
    fullLevel: null,
    averageRate: rate(4.72, 1_000),
    lastRate: rate(4.72, 1_000),
    onHandBaseUnits: 50_000,
    active: true,
  },
];

const PRODUCTS: Product[] = [
  {
    id: 'p1',
    itemId: 'popsicleItem',
    name: 'Picolé de morango',
    recipeId: 'popsicle',
    yieldPerUnit: 75,
    // O assistente não fala de preço de venda ainda: nulo é o estado real dele.
    salePriceRate: null,
    shelfLifeDays: 180,
    unitPackagingRate: rate(0.05, 1),
    packagingItems: [],
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
    lineId: null,
    typeId: null,
    flavorId: null,
  },
];

const RECIPES: Record<string, Recipe> = {
  popsicle: {
    id: 'popsicle',
    versionId: 'popsicle-v',
    version: 3,
    effectiveFrom: '2026-06-01',
    yieldAmount: 40_000,
    yieldUnit: 'ml',
    lossFraction: 0.05,
    lines: [
      { kind: 'item', itemId: 'pulp', quantity: 18_000 },
      { kind: 'item', itemId: 'sugar', quantity: 6_000 },
    ],
  },
};

const COSTS: ItemCosts = { pulp: rate(12.4, 1_000), sugar: rate(4.72, 1_000) };

const CHANGES: CostChange[] = [
  {
    itemId: 'pulp',
    name: 'Polpa de morango',
    previousRate: rate(11.5, 1_000),
    newRate: rate(12.4, 1_000),
    observedAt: '2026-08-30T10:00:00Z',
  },
  {
    itemId: 'sugar',
    name: 'Açúcar cristal',
    previousRate: rate(4.72, 1_000),
    newRate: rate(4.72, 1_000),
    observedAt: '2026-08-20T10:00:00Z',
  },
];

/**
 * Sugar was counted on the 20th; the pulp never has been. The difference is
 * what the answer has to say out loud - a balance nobody has ever checked
 * against a shelf is a different kind of number from one that was.
 */
const MOVEMENTS: (MovementRow & { itemId: string })[] = [
  {
    itemId: 'sugar',
    id: 'm1',
    kind: 'adjustment',
    baseUnits: -500,
    unitCostRate: 0.472 as Rate,
    note: null,
    occurredAt: '2026-08-20T09:00:00Z',
    groupId: 'm1',
    reversed: false,
  },
  {
    itemId: 'sugar',
    id: 'm2',
    kind: 'purchase',
    baseUnits: 50_500,
    unitCostRate: 0.472 as Rate,
    note: null,
    occurredAt: '2026-08-01T09:00:00Z',
    groupId: 'nota-1',
    reversed: false,
  },
];

/**
 * Dois lugares, e o padrão gravado sem nome de propósito - é o caso que a
 * habilidade tem de saber nomear sozinha, porque o banco não nomeia.
 *
 * As duas somas TÊM de fechar: 44.000 no almoxarifado mais 6.000 na loja são os
 * 50.000 que `ITEMS` diz que a empresa tem. Antes eram 50.000 + 6.000 contra um
 * total de 50.000 - um mundo impossível, e foi ele que deixou a contagem falada
 * comparar o total da empresa com a prateleira de uma sala sem nenhum teste
 * reclamar.
 */
const SEM_ACORDO = { contactPhone: '', deliveryDays: 0, agreementNote: '', sensorRanges: {} };

const PLACES: Place[] = [
  { id: 'factory', name: '', kind: 'store_room', isDefault: true, ...SEM_ACORDO },
  { id: 'centro', name: 'Loja Centro', kind: 'own_store', isDefault: false, ...SEM_ACORDO },
];

const PLACE_STOCK: PlaceStock[] = [
  {
    locationId: 'factory',
    locationName: '',
    kind: 'store_room',
    valueCents: 20_768 as Cents,
    lines: [
      {
        itemId: 'sugar',
        name: 'Açúcar cristal',
        kind: 'input',
        baseUnits: 44_000,
        baseUnit: 'g',
        valueCents: 20_768 as Cents,
      },
    ],
  },
  {
    locationId: 'centro',
    locationName: 'Loja Centro',
    kind: 'own_store',
    valueCents: 2_832 as Cents,
    lines: [
      {
        itemId: 'sugar',
        name: 'Açúcar cristal',
        kind: 'input',
        baseUnits: 6_000,
        baseUnit: 'g',
        valueCents: 2_832 as Cents,
      },
    ],
  },
];

/** Records what the assistant tried to do, so a silent write cannot hide. */
let recorded: unknown[] = [];

/**
 * O que o tacho pôs para fora, no dublê.
 *
 * Sem chave por data, de propósito. A primeira versão indexava por "hoje em
 * UTC" e a habilidade pergunta pela janela do fuso da FÁBRICA — para São Paulo
 * o dia começa às 03:00Z do dia anterior, então as duas datas só coincidem em
 * parte do dia. O teste passava pelo horário em que rodava, que é o defeito que
 * o guarda do relógio existe para pegar. Aqui o dublê responde a mesma coisa
 * para qualquer janela: quem está sendo testado é a habilidade, não o
 * calendário.
 */
let PRODUZIDO: { itemId: string; name: string; baseUnits: number }[][] = [];
let PEDIDOS = 0;
let PERDAS: Awaited<ReturnType<AssistantData['lossesOn']>> = [];

/** Uma linha de perda para o dublê - só o que a habilidade lê. */
function perda(
  itemId: string,
  name: string,
  reason: 'expired' | 'melted' | 'broken' | 'courtesy' | 'internal_use',
  valueCents: number,
): Awaited<ReturnType<AssistantData['lossesOn']>>[number] {
  return {
    itemId,
    name,
    baseUnits: 1,
    baseUnit: 'un',
    reason,
    locationName: 'Fábrica',
    valueCents: valueCents as Cents,
    occurredAt: '2025-09-01T12:00:00.000Z',
  };
}

const data: AssistantData = {
  listItems: async () => ITEMS,
  // A habilidade pede DUAS janelas, hoje e a mesma segunda da semana passada,
  // nessa ordem. O dublê responde pela ordem em vez de pela data justamente
  // para não depender do relógio - e assim o teste consegue exigir a
  // comparação, que é a metade que importa.
  productionOn: async () => PRODUZIDO[PEDIDOS++] ?? [],
  lossesOn: async () => PERDAS,
  listProducts: async () => PRODUCTS,
  loadRecipeGraph: async () => RECIPES,
  itemCosts: async () => COSTS,
  labels: async () => ({ pulp: 'Polpa de morango', sugar: 'Açúcar cristal' }),
  recentCostChanges: async () => CHANGES,
  itemMovements: async (itemId) => MOVEMENTS.filter((m) => m.itemId === itemId),
  recordPurchase: async (input) => {
    recorded.push(input);
    return undefined;
  },
  saveItem: async (input) => {
    recorded.push(input);
    return 'new-item';
  },
  listPlaces: async () => PLACES,
  stockByPlace: async () => PLACE_STOCK,
  defaultPlaceId: () => 'factory',
  recordProduction: async (input) => {
    recorded.push(input);
    return undefined;
  },
  recordTransfer: async (input) => {
    recorded.push(input);
    return undefined;
  },
  recordCount: async (input) => {
    recorded.push(input);
    return undefined;
  },
};

const context = (...capabilities: Capability[]): SkillContext => ({
  data,
  capabilities: new Set(capabilities),
  locale: defaultLocale,
});

test('the number in the answer is the one the engine computed', async () => {
  const answer = await ask('quanto custa o picolé de morango', context('view_cost'));

  // 18,000 x 1.24 + 6,000 x 0.472 = 25,152 cents over 38,000 ml = 0.6619 / ml,
  // x 75 ml = 50 cents of mix, plus 5 cents of packaging.
  assert.match(answer.text, /R\$\s*0,55/);
  assert.ok(answer.detail?.some((d) => d.label === 'Massa'));
  assert.equal(answer.route, '/recipes/popsicle');
});

test('a role without view_cost cannot get a figure out of it', async () => {
  const answer = await ask('quanto custa o picolé de morango', context('record_production'));

  assert.match(answer.text, /acesso/);
  // Not "the answer was hidden" - no figure was ever computed to hide.
  assert.equal(answer.detail, undefined);
  assert.doesNotMatch(answer.text, /\d/);
});

test('registering by talking produces a draft, never a write', async () => {
  recorded = [];
  const answer = await ask('comprei 4 baldes de polpa de morango por 496', context('place_order'));

  assert.ok(answer.draft, 'the phrase should fill a form');
  assert.equal(recorded.length, 0, 'nothing may be recorded before a human confirms');
  assert.match(answer.draft.summary, /Polpa de morango/);
  assert.match(answer.draft.summary, /R\$\s*496,00/);

  await answer.draft.apply();
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    itemId: 'pulp',
    purchaseQuantity: 4,
    baseUnits: 40_000,
    totalCents: fromDecimal(496) as Cents,
    // The sentence travels with the movement. It is the plan's condition for
    // letting the assistant write at all: "o que o assistente lançou este mês?"
    // has to be answerable, and a movement that cannot say where it came from
    // makes autonomy unauditable.
    assistantPhrase: 'comprei 4 baldes de polpa de morango por 496',
  });
});

test('"nothing changed" is said plainly instead of dressed up as an alert', async () => {
  const quiet: AssistantData = { ...data, recentCostChanges: async () => [] };
  const answer = await ask('o que mudou de preço', { ...context('view_cost'), data: quiet });

  assert.match(answer.text, /estável/);
  assert.equal(answer.detail, undefined);
});

test('what moved is ranked by how much it moved', async () => {
  const answer = await ask('o que mudou de preço', context('view_cost'));

  assert.match(answer.text, /Polpa de morango/);
  assert.match(answer.text, /subiu 7,8%/);
  assert.equal(answer.detail?.length, 1, 'an unchanged price is not a change');
});

test('a question it cannot answer offers what it does know', async () => {
  const answer = await ask('qual a previsão do tempo', context('view_cost'));

  assert.match(answer.text, /ainda não sei/i);
  // Lista, e não `detail`: a frase termina em dois-pontos prometendo os
  // exemplos, e a tela mostra `detail` atrás de um botão escrito "POR QUÊ?".
  // Nenhuma dessas linhas é a conta de número nenhum.
  assert.ok((answer.list?.length ?? 0) > 0);
  assert.equal(answer.detail, undefined, 'a list of examples is not arithmetic');
});

test('the examples offered never include skills the role cannot use', async () => {
  const answer = await ask('me ajuda', context('record_production'));
  const linhas = answer.list ?? [];

  // A contagem primeiro, senão a asserção de baixo passa com a lista vazia -
  // que é exatamente o que aconteceu quando os exemplos mudaram de campo.
  assert.ok(linhas.length > 0, 'there is something to offer');
  assert.doesNotMatch(linhas.map((l) => l.label).join(' '), /custa|preço/);
});

test('it lists what is in the storeroom, with the money that is sitting there', async () => {
  const answer = await ask('quais insumos eu tenho', context('view_cost'));

  // 40,000 g of pulp at 1.24 c/g is R$ 496,00; 50,000 g of sugar at 0.472 c/g
  // is R$ 236,00.
  assert.match(answer.text, /2 itens/);
  assert.match(answer.text, /R\$\s*732,00/);
  assert.equal(answer.route, '/inputs');
  assert.equal(answer.detail?.length, 2);
});

test('it turns a plan into a shopping list, said as what is missing', async () => {
  // Um tacho: 18.000 g de polpa contra 40.000 na prateleira (sobra), e 6.000 g
  // de açúcar contra 50.000 (sobra). Nada falta, e isso é resposta.
  const um = await ask('o que falta para 1 tacho de picolé de morango', context('view_cost'));
  assert.match(um.text, /não falta nada/i);

  // Três tachos viram 54.000 g de polpa, e aí a prateleira de 40.000 não cobre:
  // faltam 14.000. É a conta virada do avesso — "precisa de 54.000" não decide
  // nada para quem não sabe quanto tem.
  const tres = await ask('o que falta para 3 tachos de cada', context('view_cost'));
  assert.match(tres.text, /faltam 1 insumo/);
  assert.equal(tres.route, '/purchase');
  assert.equal(tres.detail?.length, 1);
  assert.match(tres.detail![0].label, /Polpa de morango/);
  assert.match(tres.detail![0].value, /faltam 14\.000 g/);
  // E a conta aberta diz de onde saiu o número (Lei 6).
  assert.match(tres.detail![0].value, /precisa 54\.000, tem 40\.000/);
});

test('the shopping list is a decision about buying, not something the borrowed phone sees', async () => {
  const operador = await ask('o que falta para 3 tachos de cada', context('record_production'));

  // A recusa é dita, e é dita ANTES da consulta: não existe número na resposta
  // para vazar, que é a fundação de permissão deste projeto em uma linha.
  assert.match(operador.text, /não faz parte do seu acesso/i);
  assert.equal(operador.detail, undefined, 'nenhuma quantidade sai junto com a recusa');
});

test('asking to erase gets directions, never an erasure', async () => {
  const answer = await ask('quero apagar tudo', context('manage_company'));

  assert.match(answer.text, /Ajustes/);
  assert.equal(answer.route, '/settings');
  // The skill has no way to act: it returns words and a route, and nothing else.
  assert.equal(answer.draft, undefined);
});

test('it says how much is there, and when anyone last checked', async () => {
  const answer = await ask('quanto tem de açúcar', context('view_cost'));

  assert.match(answer.text, /50\.000 g/);
  // Law 3: the balance never appears alone. The date it was verified is what
  // turns a stored number into one somebody stood in front of.
  assert.match(answer.text, /conferido em 20\/08/);
  assert.ok(
    answer.detail?.some((d) => d.label === 'Valor parado' && /R\$\s*236,00/.test(d.value)),
  );
});

test('a shelf nobody has ever counted says so, instead of sounding certain', async () => {
  const answer = await ask('quanto tem de polpa de morango', context('view_cost'));

  assert.match(answer.text, /40\.000 g/);
  assert.match(answer.text, /Ninguém conferiu a prateleira ainda/);
});

test('how much is there is not a secret; what it is worth is', async () => {
  // The quantity is not money, so an operator gets it. The value is money, and
  // that line is never assembled - there is no figure in the answer to leak.
  const answer = await ask('quanto tem de açúcar', context('record_production'));

  assert.match(answer.text, /50\.000 g/, 'the quantity belongs to whoever works there');
  assert.ok(
    !answer.detail?.some((d) => d.label === 'Valor parado'),
    'someone without view_cost was handed the money',
  );
});

test('counting by talking fills a form and stops, whatever the difference', async () => {
  recorded = [];

  // A polpa está num lugar só, e é por isso que ela pode ser contada falando:
  // quatro baldes de 10 kg são exatamente o que o livro-razão tem.
  const agrees = await ask('contei 4 baldes de polpa de morango', context('adjust_stock'));
  assert.ok(agrees.draft, 'the phrase should fill a form');
  assert.equal(recorded.length, 0, 'a stock adjustment may never be written unconfirmed');
  assert.match(agrees.draft.summary, /40\.000 g de Polpa de morango/);
  assert.match(agrees.draft.summary, /Bate com o que o sistema esperava/);

  // Três baldes são 10 kg a menos, e o resumo tem de dizer isso por extenso.
  const short = await ask('contei 3 baldes de polpa de morango', context('adjust_stock'));
  assert.ok(short.draft);
  assert.match(short.draft.summary, /Estão faltando 10\.000 g/);
  assert.match(short.draft.summary, /nada é apagado/);
  assert.equal(recorded.length, 0);

  await short.draft.apply();
  assert.deepEqual(recorded, [
    {
      itemId: 'pulp',
      // **O LUGAR vai junto agora, e aqui ele é nulo — que é uma resposta.**
      //
      // Este mundo de teste não lista a polpa em prateleira nenhuma, então a
      // habilidade não tem sala para nomear e deixa a ligação cair no padrão. O caso
      // que importa — insumo numa sala que NÃO é a do aparelho — é o teste seguinte,
      // e ele não existia: o dublê punha o açúcar em dois lugares (só o galho do
      // "conte um lugar por vez" era exercitado) e a polpa em nenhum.
      locationId: null,
      countedBaseUnits: 30_000,
      // A count corrected by talking carries the words that corrected it. The
      // difference the ledger keeps is only defensible if somebody can see
      // where it came from months later.
      assistantPhrase: 'contei 3 baldes de polpa de morango',
    },
  ]);
});

/**
 * O insumo que mora numa sala que NÃO é a do aparelho.
 *
 * Este é o caso que a suíte não tinha: o dublê punha o açúcar em dois lugares (só o
 * galho do "conte um lugar por vez" era exercitado) e a polpa numa sala igual à do
 * aparelho, onde o defeito não aparece. Com a polpa na câmara fria, comparar pelo
 * total do item e gravar contra a unidade dava um ajuste do tamanho da sala inteira,
 * com o sinal invertido.
 *
 * A asserção é o par: o número do rascunho e o lugar da escrita saem do MESMO lugar.
 */
test('contar falando compara e grava no lugar onde o insumo está, não onde o aparelho está', async () => {
  recorded = [];

  const camara: PlaceStock = {
    locationId: 'cold',
    locationName: 'Câmara fria',
    kind: 'cold_room',
    valueCents: 0 as Cents,
    lines: [
      {
        itemId: 'pulp',
        name: 'Polpa de morango',
        kind: 'input',
        // **25.000 e não 40.000, de propósito.** O total do item no dublê é 40.000;
        // se a sala tivesse o mesmo número, as duas fontes concordariam e o teste
        // não saberia dizer de qual delas o rascunho leu — que é a cicatriz escrita
        // nesta casa sobre segunda fonte derivada da primeira.
        baseUnits: 25_000,
        baseUnit: 'g',
        valueCents: 0 as Cents,
      },
    ],
  };

  const mundo: AssistantData = {
    ...data,
    stockByPlace: async () => [camara],
  };

  const r = await ask('contei 3 baldes de polpa de morango', {
    ...context('adjust_stock'),
    data: mundo,
  });
  assert.ok(r.draft, 'um insumo num lugar só continua contável falando');
  // Contou 30.000. A câmara tem 25.000, então SOBRAM 5.000. Pelo total do item
  // (40.000) faltariam 10.000 — sinal trocado e tamanho diferente, que é o defeito.
  assert.match(
    r.draft.summary,
    /Estão sobrando 5\.000 g/,
    'a diferença é contra a câmara, que é onde a polpa está',
  );

  await r.draft.apply();
  assert.deepEqual(
    recorded,
    [
      {
        itemId: 'pulp',
        locationId: 'cold',
        countedBaseUnits: 30_000,
        assistantPhrase: 'contei 3 baldes de polpa de morango',
      },
    ],
    'e a escrita vai para a MESMA sala com que o rascunho comparou',
  );
});

test('an item split between two rooms is not counted by talking, it is located', async () => {
  // O açúcar está em dois lugares. O assistente compara com o total da empresa
  // e grava no almoxarifado - com 44.000 na fábrica e 6.000 na loja, contar a
  // prateleira da fábrica "encontrava" uma falta de 6.000 g que não existe, e
  // gravava essa falta contra a fábrica. Estoque teleportado, com quem contou
  // tendo feito tudo certo.
  recorded = [];
  const answer = await ask('contei 2 sacos de açúcar', context('adjust_stock'));

  assert.equal(answer.draft, undefined, 'nada de formulário para uma contagem cega');
  assert.equal(recorded.length, 0);
  assert.match(answer.text, /2 lugares/);
  assert.match(answer.text, /Fábrica/, 'o lugar sem nome no banco é nomeado aqui');
  assert.match(answer.text, /Loja Centro/);
  assert.equal(answer.route, '/inputs/sugar', 'e a saída é a tela que sabe perguntar qual sala');
});

test('counting is refused to a role that may not adjust stock', async () => {
  recorded = [];
  const answer = await ask('contei 2 sacos de açúcar', context('record_production'));

  assert.ok(!answer.draft, 'no form for someone who may not change a balance');
  assert.equal(recorded.length, 0);
});

test('it finds the item by the word people actually type', () => {
  assert.equal(findByName(ITEMS, 'morango')?.id, 'pulp');
  assert.equal(findByName(ITEMS, 'acucar')?.id, 'sugar', 'accents must not matter');
  assert.equal(findByName(ITEMS, 'AÇÚCAR CRISTAL')?.id, 'sugar');
  assert.equal(findByName(ITEMS, 'parafuso'), null);
});

/**
 * A palavra que alcança a grade inteira não elege ninguém.
 *
 * Antes da linha × tipo × sabor, "morango" batia num produto só e devolver o
 * nome mais curto passava por esperto. Com a grade, "morango" alcança doze, e
 * o mais curto é sorteio: "Pote 1 litro de morango" ganha de "Picolé
 * Tradicional de morango" por ter menos letras, e a produção seria gravada
 * contra a receita errada sem uma palavra a ninguém.
 *
 * Este teste existe porque a suíte não o tinha: trocar o `null` de volta pelo
 * mais curto passou por noventa e dois testes verdes. O empate é a única saída
 * do assistente que decide calada, e agora ela tem quem a segure.
 */
test('a word that reaches the whole grid elects nobody', () => {
  const grade = [
    { id: 'pote', name: 'Pote 1 litro de morango' },
    { id: 'picole', name: 'Picolé Tradicional de morango' },
  ];

  assert.equal(
    findByName(grade, 'morango'),
    null,
    'o mais curto é sorteio, e sorteio grava contra a receita errada',
  );

  // Lei 5: o erro impede E diz o caminho. Empate devolve os nomes para a tela
  // perguntar qual, em vez de dizer que não existe uma coisa que existe duas.
  assert.deepEqual(
    namesakes(grade, 'morango').map((c) => c.id),
    ['pote', 'picole'],
  );

  // E o que casa exato continua ganhando do empate: quem digitou o nome
  // inteiro já respondeu a pergunta.
  assert.equal(findByName(grade, 'Pote 1 litro de morango')?.id, 'pote');
});

test('the assistant answers what the briefing shows, and says when there is nothing', async () => {
  // A capa passou a dizer o que saiu da produção hoje, e o assistente respondia
  // "ainda não sei". Duas verdades no mesmo app, e quem perde é o assistente:
  // a pessoa pergunta uma vez, ouve que ele não sabe, e não pergunta de novo.
  PRODUZIDO = [];
  PEDIDOS = 0;
  const vazio = await ask('quanto saiu hoje', context());
  assert.match(vazio.text, /Nada saiu da produção hoje/);

  // Com produção, ele diz o número E a comparação - a mesma Lei 3 que a tela
  // obedece. Um número sozinho não ensina nada.
  PEDIDOS = 0;
  PRODUZIDO = [
    [{ itemId: 'pop', name: 'Picolé de morango', baseUnits: 480 }],
    [{ itemId: 'pop', name: 'Picolé de morango', baseUnits: 300 }],
  ];

  const cheio = await ask('quanto saiu hoje', context());
  assert.match(cheio.text, /480/);
  // E a comparação com números de verdade: 480 hoje contra 300 na semana
  // passada são 180 a mais. Um dublê que devolvesse a mesma coisa para as duas
  // janelas deixaria essa frase passar sem ser exercitada.
  assert.match(cheio.text, /180 a mais que no mesmo dia da semana passada/);
});

test('it reads a number however it was typed', () => {
  assert.equal(parseNumber('1.250,40'), 1250.4);
  assert.equal(parseNumber('1250.40'), 1250.4);
  assert.equal(parseNumber('R$ 496'), 496);
  assert.equal(parseNumber('4'), 4);
  assert.equal(parseNumber('abc'), null);

  // These four are the branch that used to answer differently here than on the
  // screens, and nothing in this suite touched it: the assistant read "1.500
  // picolés" as one and a half, and "mandei 6.000 gramas" as six grams. The
  // whole app reads them one way now, and that way is the Portuguese one.
  assert.equal(parseNumber('1.500'), 1500, 'mil e quinhentos picolés');
  assert.equal(parseNumber('6.000'), 6000, 'seis mil gramas');
  assert.equal(parseNumber('46.000'), 46000);
  assert.equal(parseNumber('0.500'), 0.5, 'meio litro digitado com ponto');
});

/**
 * Registering an input by talking, which is the clause this project set for
 * itself: a module is finished when the assistant can answer about it AND fill
 * it in. Until now it could only answer, and the cadastro is precisely where
 * people give up - nobody types sixty inputs into a form before seeing the app
 * do anything, least of all the person this product is for.
 */

test('an input can be created by talking, and the package is read not asked', async () => {
  recorded = [];
  const answer = await ask('cadastrar polpa de açaí, balde 10 kg', context('manage_company'));

  assert.ok(answer.draft, 'the phrase should fill a form');
  assert.equal(recorded.length, 0, 'nothing may be created before a human confirms');
  assert.match(answer.draft.summary, /polpa de açaí/i);
  // 10 kg is 10000 g, worked out from what the person wrote on the sack.
  assert.match(answer.draft.summary, /10\.000 g/);

  await answer.draft.apply();
  assert.deepEqual(recorded[0], {
    kind: 'input',
    name: 'polpa de açaí',
    purchaseUnit: 'balde 10 kg',
    purchaseToBase: 10_000,
    baseUnit: 'g',
  });
});

test('a package with no size still creates the item, and says so', async () => {
  recorded = [];
  const answer = await ask('cadastrar essência de baunilha, frasco', context('manage_company'));

  assert.ok(answer.draft);
  // Honest rather than clever: a named input with no factor is useful, and
  // guessing a number that sits under every cost of that item is not.
  assert.match(answer.text, /não consegui ler o tamanho/i);
  await answer.draft.apply();
  assert.equal((recorded[0] as { purchaseToBase: number | null }).purchaseToBase, null);
});

test('creating something that already exists points at it instead', async () => {
  recorded = [];
  const answer = await ask('cadastrar polpa de morango, balde 10 kg', context('manage_company'));

  assert.equal(answer.draft, undefined, 'no draft for something that is already there');
  assert.match(answer.text, /já está cadastrado/);
  assert.equal(recorded.length, 0);
});

test('creating an input is a manage_company act, not something an operator does', async () => {
  const answer = await ask('cadastrar polpa de açaí, balde 10 kg', context('record_production'));
  assert.equal(answer.draft, undefined);
  assert.equal(recorded.length, 0);
});

test('a place is asked about by name, and the unnamed default answers to "fábrica"', async () => {
  const store = await ask('o que tem na loja centro', context('view_cost'));
  assert.match(store.text, /Loja Centro/);
  assert.match(store.text, /6\.000 g de Açúcar cristal/);
  assert.equal(store.route, '/places');

  // The default place is written with an empty name on purpose. Nothing in the
  // database calls it anything, so the skill has to - the same word the screen
  // uses, from the same reasoning.
  const factory = await ask('o que tem na fábrica', context('view_cost'));
  // 44.000, e não os 50.000 da empresa: a pergunta é de um lugar, e o que está
  // na loja não está aqui.
  assert.match(factory.text, /44\.000 g/);

  // "quanto tem na loja centro" também casa com `stockOfInput`, que leria "na
  // loja centro" como nome de insumo e responderia que não existe. Quem
  // pergunta por um lugar tem de ser atendido pelo lugar - a ordem do registro
  // é semântica, e é esta linha que a segura.
  const ambiguous = await ask('quanto tem na loja centro', context('view_cost'));
  assert.match(ambiguous.text, /6\.000 g de Açúcar cristal/);

  const nowhere = await ask('o que tem na loja norte', context('view_cost'));
  assert.match(nowhere.text, /Não encontrei um lugar chamado "loja norte"/);
});

test('what a place is worth is a figure, and figures obey the role', async () => {
  const owner = await ask('o que tem na loja centro', context('view_cost'));
  assert.ok(owner.detail?.some((d) => d.label === 'Valor parado'));

  // The operator gets the same quantities and no money at all - and it is not
  // hidden from a rendered answer, it never entered one.
  const operator = await ask('o que tem na loja centro', context('record_production'));
  assert.match(operator.text, /6\.000 g/);
  assert.ok(!operator.detail?.some((d) => d.label === 'Valor parado'));
});

test('where a thing is reads the same sum from the other side', async () => {
  const answer = await ask('onde está o açúcar', context('view_cost'));

  assert.match(answer.text, /2 lugares/);
  assert.deepEqual(answer.detail, [
    { label: 'Fábrica', value: '44.000 g' },
    { label: 'Loja Centro', value: '6.000 g' },
  ]);
});

test('producing by talking counts the inputs by what came out, and says so', async () => {
  recorded = [];

  // Sem tacho dito, o consumo vem do que saiu. Assumir um tacho calado debitava
  // polpa que ninguém declarou: três tachos rodados e um baixado deixa dois
  // tachos de polpa na prateleira que já foram embora. A suposição continua
  // dita em voz alta - o que mudou foi qual é a suposição honesta.
  const guessed = await ask('produzi 480 picolés de morango', context('record_production'));
  assert.ok(guessed.draft, 'the phrase should fill a form');
  assert.equal(recorded.length, 0);
  assert.match(guessed.text, /pelo que saiu/, 'an assumption has to be visible before it is written');
  assert.ok(!/Entendi um tacho/.test(guessed.text));
  assert.match(guessed.draft.summary, /480 unidades de Picolé de morango/);

  /**
   * E o que ele GRAVA é o que ele disse.
   *
   * A frase "pelo que saiu" já estava sob teste; o número que ela promete não
   * estava, e trocar o consumo proporcional por um tacho fixo passou pela
   * suíte inteira sem uma falha. Um tacho desta ficha põe 506 unidades para
   * fora - 40.000 ml menos 5% de perda, divididos por 75 ml a picolé - então
   * 480 é menos de um tacho, e debitar um inteiro é polpa que some do papel
   * sem sair da prateleira.
   */
  await guessed.draft.apply();
  assert.equal(recorded.length, 1);
  const escrito = recorded[0] as { batches: number; unitsProduced: number };
  assert.equal(escrito.unitsProduced, 480);
  assert.ok(escrito.batches < 1, 'saiu menos que um tacho, baixa menos que um tacho');
  assert.equal(Number(escrito.batches.toFixed(6)), Number((480 / 506).toFixed(6)));
  recorded = [];

  // Said explicitly, it is obeyed to the letter and stops guessing.
  const told = await ask('produzi 900 picolés de morango em 2 tachos', context('record_production'));
  assert.ok(told.draft);
  assert.ok(!/pelo que saiu/.test(told.text));
  // **Aceitar não é falar, e as duas metades são a correção do dono de 8 de setembro.**
  // A pergunta acima diz "tachos" e é obedecida ao pé da letra — recusar o vocabulário
  // de quem usa seria o contrário do que ele pediu. A resposta não devolve a palavra:
  // o aplicativo vai para as duas lojas, e metade das fábricas que o instalarem não tem
  // tacho nenhum. Sem esta linha a correção vira metade dela.
  assert.match(told.draft.summary, /em 2 vezes/);
  assert.ok(!/tacho/i.test(told.draft.summary), 'entendeu a palavra; não a repete');

  // E a palavra neutra entra pela mesma porta, para quem nunca disse "tacho".
  const neutro = await ask('produzi 900 picolés de morango em 2 vezes', context('record_production'));
  assert.ok(neutro.draft, 'quem diz "em 2 vezes" tem de ser entendido igual');
  assert.match(neutro.draft.summary, /em 2 vezes/);

  await told.draft.apply();
  assert.deepEqual(recorded, [
    {
      productId: 'p1',
      batches: 2,
      unitsProduced: 900,
      assistantPhrase: 'produzi 900 picolés de morango em 2 tachos',
    },
  ]);
});

test('a load is refused before it is prepared, never after it is trusted', async () => {
  recorded = [];

  // More than the factory holds. Nothing is drafted, because a draft that only
  // fails at write time is worse than none - the person already believed it.
  const tooMuch = await ask('mandei 90000 de açúcar para a loja centro', context('dispatch'));
  assert.ok(!tooMuch.draft);
  assert.match(tooMuch.text, /Tem só 44\.000 g/);

  // A place that does not exist points at where places are made.
  const nowhere = await ask('mandei 100 de açúcar para a loja norte', context('dispatch'));
  assert.ok(!nowhere.draft);
  assert.equal(nowhere.route, '/places');

  const ok = await ask('mandei 6000 de açúcar para a loja centro', context('dispatch'));
  assert.ok(ok.draft);
  assert.equal(recorded.length, 0);
  assert.match(ok.draft.summary, /6\.000 g de Açúcar cristal da Fábrica para Loja Centro/);
  assert.match(ok.draft.summary, /transferência, não venda/);

  await ok.draft.apply();
  assert.deepEqual(recorded, [
    {
      itemId: 'sugar',
      toLocationId: 'centro',
      baseUnits: 6000,
      assistantPhrase: 'mandei 6000 de açúcar para a loja centro',
    },
  ]);
});

test('producing and dispatching are each their own permission', async () => {
  recorded = [];
  assert.ok(!(await ask('produzi 480 picolés de morango', context('dispatch'))).draft);
  assert.ok(!(await ask('mandei 6000 de açúcar para a loja centro', context('record_production'))).draft);
  assert.equal(recorded.length, 0);
});

test('what was lost names the reason that dominates, not the biggest single loss', async () => {
  // Uma caixa derretida de 40 reais contra três vencimentos de 20: o maior
  // prejuízo isolado é o freezer, mas o que come o mês é a validade. A
  // pergunta que o dono faz é onde o dinheiro está indo, então a resposta
  // soma por motivo antes de eleger o pior.
  PERDAS = [
    perda('caixa', 'Picolé de morango', 'melted', 4000),
    perda('polpa', 'Polpa de manga', 'expired', 2000),
    perda('polpa', 'Polpa de manga', 'expired', 2000),
    perda('polpa', 'Polpa de manga', 'expired', 2000),
  ];

  const r = await ask('quanto a gente perdeu esse mês', context('view_cost'));
  assert.match(r.text, /R\$\s?100,00/);
  assert.match(r.text, /vencida/);
  assert.ok(!/derretida/.test(r.text), 'a maior perda isolada não é o motivo que dominou');
  assert.equal(r.route, '/losses');
});

test('nothing lost is an answer, and it does not invent an alert', async () => {
  PERDAS = [];
  const r = await ask('o que a gente perdeu', context('view_cost'));
  assert.match(r.text, /Nenhuma perda/);
  assert.ok(!/R\$/.test(r.text));
});

test('who cannot see cost cannot ask what was lost', async () => {
  PERDAS = [perda('caixa', 'Picolé de morango', 'melted', 4000)];
  const r = await ask('quanto a gente perdeu esse mês', context('record_production'));
  assert.ok(!/R\$/.test(r.text), 'o valor não pode sair para quem não vê custo');
});

/**
 * *"Quando foi conferido?"* responde igual na tela e na voz — e por pouco não.
 *
 * Em 8 de setembro a contagem de uma loja própria passou a gravar `sale` em vez de
 * `adjustment`: o que sai da prateleira de um balcão foi comprado por alguém. A ficha do
 * insumo aprendeu isso na mesma hora e **o assistente não**, porque o mesmo `if` estava
 * escrito com outras palavras num arquivo que ninguém olhou junto.
 *
 * O sintoma seria duas verdades sobre um fato: a ficha dizendo *"conferido em 8/9"* e a
 * voz respondendo *"ninguém conferiu ainda"* para a mesma prateleira, no mesmo dia — e a
 * segunda manda alguém contar de novo o que acabou de ser contado, que é como se ensina
 * uma equipe a ignorar o aplicativo.
 *
 * Este teste é o chamador de produção da régua `ehConferencia`. Sem ele a régua teria
 * teste nenhum e a mutação que a estreita passaria verde.
 */
test('the voice says a store shelf was checked when the count booked a sale', async () => {
  const vendido: MovementRow & { itemId: string } = {
    itemId: 'sugar',
    id: 'venda-1',
    kind: 'sale',
    baseUnits: -340,
    unitCostRate: 0.472 as Rate,
    note: null,
    occurredAt: '2026-09-08T11:00:00Z',
    groupId: 'venda-1',
    reversed: false,
  };

  const dados = {
    ...data,
    // Só a venda: sem nenhuma correção na lista, um leitor que procure `adjustment`
    // responde "ninguém conferiu ainda" — que é exatamente o defeito.
    itemMovements: async () => [vendido],
  };

  const r = await ask('quantos tem de açúcar', { ...context('view_cost'), data: dados });
  const conferencia = r.detail?.find((d) => d.label === 'Última conferência');
  assert.ok(conferencia, 'a resposta traz quando foi conferido');
  assert.notEqual(
    conferencia.value,
    'ninguém conferiu ainda',
    'a contagem que virou venda continua sendo uma contagem, e a voz tem de dizer isso',
  );
  assert.match(conferencia.value, /8/, 'e diz a data em que alguém andou até a prateleira');
});

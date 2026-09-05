import { nowIso } from './db';
import {
  balanceByLocation,
  listItems,
  listPlaces,
  listProducts,
  recordCount,
  recordLoss,
  recordProduction,
  recordPurchase,
  recordTransfer,
  saveItem,
  saveOrder,
  savePlace,
  saveFlavor,
  saveLine,
  saveProduct,
  saveRecipeVersion,
  saveType,
} from './repository';
import { LOCAL_COMPANY_ID, LOOSE, STACKED } from './seed';
import { dayWindow, localDate } from '@/domain/day';
import { cents, fromDecimal } from '@/domain/money';

/**
 * Two weeks of a factory that exists, written through the real front door.
 *
 * The example this app ships with is one day old and has never moved: enough to
 * prove a screen renders, not enough to prove it says anything. Half the
 * briefing only has something to say when there IS a past - "saíram 1.200 hoje,
 * 200 a mais que na segunda passada" cannot be tested against a database whose
 * whole history is this morning. That gap is not hypothetical: the comparison
 * this screen makes had no test exercising it, for exactly this reason.
 *
 * So this writes days of operation - production runs, deliveries to stores,
 * invoices that move the average cost - and it writes them the way the app
 * does, calling `recordProduction`, `recordTransfer` and `recordPurchase`. It
 * never touches a table directly. A simulation that wrote SQL of its own would
 * be proving that the simulation works.
 *
 * Deterministic on purpose. The same call produces the same fortnight, so a
 * test that fails can be run again and fail the same way - and so the owner
 * looking at the screen and the suite looking at the assertion are looking at
 * one factory, not two.
 */

/** A tiny LCG. Same seed, same fortnight, on any machine and any day. */
function rolls(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

export type Simulation = {
  days: number;
  runs: number;
  deliveries: number;
  invoices: number;
  /** As conferências de prateleira — é por elas que o que saiu da loja sai. */
  counts: number;
};

/**
 * Um ano de fábrica, para ver o que só quebra com tempo.
 *
 * A quinzena prova que as telas têm o que dizer. O que ela NÃO prova é o que
 * este app promete no prazo longo: custo médio que anda, cobertura que encolhe,
 * histórico que cresce, consulta que fica lenta quando o livro-razão passa de
 * dez mil linhas. Nada disso aparece num banco de catorze dias, e esperar um
 * ano de uso real para descobrir é exatamente o que não vai acontecer.
 *
 * É a mesma função com outro horizonte: o mesmo caminho de escrita, as mesmas
 * validações, o mesmo determinismo.
 */
/**
 * Quantos dias a semeadura de teste escreve.
 *
 * Noventa, e não catorze — decisão do dono. Um trimestre é o menor horizonte em
 * que as promessas de prazo longo deste aplicativo passam a ser verificáveis:
 * o custo médio move de verdade, a cobertura encolhe, o histórico tem o que
 * comparar, e o livro-razão fica grande o bastante para uma consulta lenta
 * aparecer aqui em vez de aparecer na fábrica.
 *
 * Mora aqui, e não na tela, porque quem sabe o que o número significa é este
 * módulo. A tela só pede movimento.
 */
export const HORIZONTE_DE_TESTE = 90;

export async function simulateHistory(
  companyId = LOCAL_COMPANY_ID,
  options: { days?: number; seed?: number; timeZone?: string; at?: string } = {},
): Promise<Simulation> {
  return simulateFortnight(companyId, options);
}


/**
 * O elenco que uma fábrica de verdade tem, garantido antes de escrever o movimento.
 *
 * Pedido do dono, 5 de setembro: *"faz isso como se fosse alguém colocando os
 * dados... alimenta o banco para as informações apresentarem dados verdadeiros"*.
 * A semeadura já escrevia pela porta da frente — as mesmas funções que a tela
 * chama —, mas escrevia num elenco de UM produto e UMA loja. Três meses disso
 * não é uma fábrica: é a mesma linha repetida noventa vezes, e metade da capa
 * continua muda porque não há pedido, não há perda e não há sabor com que
 * comparar.
 *
 * Então o elenco cresce antes do movimento, e cresce pela mesma porta: item,
 * receita, produto, lugar. Nada aqui é INSERT — se o caminho de escrita recusar
 * alguma coisa, a semeadura recusa junto, que é o ponto de semear assim.
 *
 * O que ele NÃO faz é mexer no que já existe: fábrica com três sabores
 * cadastrados fica com os dela. A semeadura completa, nunca substitui.
 */
async function garantirElenco(companyId: string) {
  const lugares = await listPlaces(companyId);
  const fabrica = lugares.find((p) => p.isDefault) ?? lugares[0];
  const destinos = lugares.filter((p) => p.id !== fabrica.id);

  // Três destinos, e um deles é CLIENTE e não loja própria: a distinção existe
  // no esquema desde a primeira migração e nenhuma tela tinha como mostrá-la
  // sem dado. Uma fábrica que só entrega para si mesma não exercita metade do
  // que o transporte promete.
  const querer: { name: string; kind: 'own_store' | 'customer' }[] = [
    { name: 'Loja Centro', kind: 'own_store' },
    { name: 'Loja Norte', kind: 'own_store' },
    { name: 'Mercado do Zé', kind: 'customer' },
  ];
  for (const alvo of querer) {
    if (destinos.length >= querer.length) break;
    if (destinos.some((d) => d.name === alvo.name)) continue;
    destinos.push(await savePlace(companyId, alvo));
  }

  let produtos = (await listProducts(companyId)).filter((p) => p.recipeId);
  if (produtos.length === 0) throw new Error('não há produto com receita para simular');

  if (produtos.length < 3) {
    const itens = await listItems(companyId);
    const achar = (nome: string) => itens.find((i) => i.name === nome)?.id ?? null;
    const acucar = achar('Açúcar cristal');
    const glucose = achar('Glucose 38DE');
    const leite = achar('Leite em pó');

    if (acucar && glucose && leite) {
      const cacau = await saveItem(companyId, {
        kind: 'input',
        name: 'Cacau em pó',
        purchaseUnit: 'saco 10 kg',
        purchaseToBase: 10_000,
        baseUnit: 'g',
        packaging: LOOSE,
      });
      await recordPurchase(companyId, {
        itemId: cacau,
        supplierName: 'Fornecedor inicial',
        purchaseQuantity: 2,
        baseUnits: 20_000,
        totalCents: fromDecimal(624),
      });

      // A grade que o produto EXIGE — e que só existia no esquema.
      //
      // O caminho de escrita recusa um segundo produto sem classificação, com
      // uma frase e não com um erro de SQLite. A recusa está certa e é dela que
      // sai a forma: linha ("Picolé"), tipo ("Água" / "Leite") e sabor. É a
      // mesma grade que o dono descreveu — *"a gente cadastra o que é Picolé, o
      // tipo Água/Leite, e o sabor"* — e até aqui nada no aplicativo tinha
      // escrito uma linha nela.
      const linha = await saveLine(companyId, { name: 'Picolé' });
      const agua = await saveType(companyId, { lineId: linha, name: 'Água', sort: 0 });
      const creme = await saveType(companyId, { lineId: linha, name: 'Leite', sort: 1 });

      const novos: {
        nome: string;
        tipo: string;
        sabor: string;
        linhas: { itemId: string; quantity: number }[];
      }[] = [
        {
          nome: 'Picolé de chocolate',
          tipo: creme,
          sabor: 'Chocolate',
          linhas: [
            { itemId: cacau, quantity: 6_000 },
            { itemId: acucar, quantity: 6_000 },
            { itemId: glucose, quantity: 1_200 },
          ],
        },
        {
          nome: 'Picolé de leite',
          tipo: creme,
          sabor: 'Leite',
          linhas: [
            { itemId: leite, quantity: 8_000 },
            { itemId: acucar, quantity: 5_000 },
            { itemId: glucose, quantity: 1_000 },
          ],
        },
      ];
      for (const novo of novos) {
        const receita = await saveRecipeVersion(companyId, {
          name: novo.nome,
          yieldAmount: 40_000,
          yieldUnit: 'ml',
          lossFraction: 0.05,
          lines: novo.linhas.map((l) => ({ kind: 'item' as const, ...l })),
        });
        await saveProduct(companyId, {
          name: novo.nome,
          kind: 'product',
          recipeId: receita.recipeId,
          yieldPerUnit: 75,
          unitPackagingCents: fromDecimal(0.05),
          packaging: STACKED,
          lineId: linha,
          typeId: novo.tipo,
          flavorId: await saveFlavor(companyId, { name: novo.sabor }),
          // Cento e vinte dias: um lote feito no começo do trimestre passa a
          // vencer DENTRO da janela de trinta dias que a capa olha. Sem
          // validade nenhuma, o aviso de vencimento nunca teria o que dizer, e
          // ele é uma das peças que o dono vai querer ver funcionando.
          shelfLifeDays: 120,
        });
      }
      // O sabor que já existia entra na grade junto. Sem isso o app ficaria com
      // dois produtos classificados e um solto, que é pior que três soltos: a
      // tela de produção mostraria a grade pela metade e pareceria defeito.
      const morango = produtos.find((p) => p.name.includes('morango'));
      if (morango) {
        await saveProduct(companyId, {
          id: morango.id,
          itemId: morango.itemId,
          name: morango.name,
          kind: 'product',
          recipeId: morango.recipeId,
          yieldPerUnit: morango.yieldPerUnit,
          unitPackagingCents: morango.unitPackagingCents,
          packaging: morango.packaging,
          shelfLifeDays: 120,
          lineId: linha,
          typeId: agua,
          flavorId: await saveFlavor(companyId, { name: 'Morango' }),
        });
      }

      produtos = (await listProducts(companyId)).filter((p) => p.recipeId);
    }
  }

  return { fabrica, destinos, produtos };
}

export async function simulateFortnight(
  companyId = LOCAL_COMPANY_ID,
  options: { days?: number; seed?: number; timeZone?: string; at?: string } = {},
): Promise<Simulation> {
  const days = options.days ?? 14;
  const next = rolls(options.seed ?? 20260901);
  const timeZone = options.timeZone ?? 'America/Sao_Paulo';

  // O instante que a quinzena chama de "hoje".
  //
  // Parametrizado para que um teste possa fixá-lo: sem isso a simulação
  // depende da hora em que a suíte roda, e a mesma semente daria fábricas
  // diferentes entre uma execução às 23h59 e outra às 00h01 - o oposto do
  // determinismo que esta função promete.
  const today = options.at ?? nowIso();

  const { fabrica: factory, destinos, produtos: products } = await garantirElenco(companyId);

  const tally: Simulation = { days, runs: 0, deliveries: 0, invoices: 0, counts: 0 };

  /** O preço de referência de cada insumo, fixado na primeira compra dele. */
  const patamar = new Map<string, number>();

  // Oldest first, so every cost the ledger freezes is the cost that was true on
  // that day - writing backwards would freeze today's price onto last week.
  for (let back = days - 1; back >= 0; back -= 1) {
    const day = dayWindow(today, timeZone, -back);
    const at = (hour: number) =>
      new Date(new Date(day.from).getTime() + hour * 3_600_000).toISOString();

    // Sunday is quiet. A week where every day looks the same teaches the
    // briefing to compare noise with noise.
    const weekday = new Date(day.from).getUTCDay();
    if (weekday === 0) continue;

    // A compra vem primeiro, e vem porque o insumo está acabando - não por
    // sorteio. Uma fábrica compra quando falta, e uma simulação que compra ao
    // acaso fica sem polpa no quarto dia e depois só mostra tela vazia. A nota
    // entrando antes do tacho também importa: nota que chega depois congelaria
    // no custo um preço que a fábrica não pagou naquela manhã.
    const inputs = (await listItems(companyId)).filter(
      (i) => i.kind === 'input' && (i.purchaseToBase ?? 0) > 0,
    );
    for (const item of inputs) {
      const pack = item.purchaseToBase ?? 1;
      if (item.onHandBaseUnits >= pack * 3) continue;

      const packs = 4 + Math.floor(next() * 3);
      const baseUnits = packs * pack;

      // O preço oscila em volta de um PATAMAR, não em volta de si mesmo.
      //
      // A primeira versão multiplicava a média atual por um fator entre 0,92 e
      // 1,12 — que compõe: um ano de compras levou a polpa de 1,24 a 6,75
      // centavos por grama, e o picolé de R$ 0,64 a R$ 2,64. Isso não é uma
      // fábrica, é juros compostos. O patamar é o preço que o item tinha
      // quando a simulação começou, guardado uma vez, com uma tendência anual
      // suave por cima: é o que faz a home ter o que dizer sem inventar
      // hiperinflação.
      const base = patamar.get(item.id) ?? (item.averageRate || 1);
      patamar.set(item.id, base);

      const tendencia = 1 + (0.12 * (days - 1 - back)) / Math.max(days, 1);
      const drift = 0.93 + next() * 0.14;
      const totalCents = Math.round(baseUnits * base * tendencia * drift);
      if (totalCents <= 0) continue;

      await recordPurchase(companyId, {
        itemId: item.id,
        purchaseQuantity: packs,
        baseUnits,
        totalCents: cents(totalCents),
        occurredAt: at(7),
      });
      tally.invoices += 1;
    }

    // One or two kettles, and what came out is never exactly what the sheet
    // promised - that ratio is the whole reason production is recorded.
    const kettles = next() < 0.3 ? 2 : 1;
    for (let k = 0; k < kettles; k += 1) {
      const product = products[Math.floor(next() * products.length)];
      const planned = 500;
      const made = Math.round(planned * (0.9 + next() * 0.14));
      try {
        await recordProduction(companyId, {
          productId: product.id,
          locationId: factory.id,
          batches: 1,
          unitsProduced: made,
          occurredAt: at(9 + k * 3),
    producedOn: localDate(at(9 + k * 3), 'America/Sao_Paulo'),
  });
        tally.runs += 1;
      } catch {
        // Faltou insumo naquele dia: acontece numa fábrica, e a corrida
        // simplesmente não aconteceu. Não é erro da simulação.
      }
    }

    // À tarde, parte disso sai — e sai para DESTINOS diferentes, um por vez.
    // Sempre para a mesma loja, o transporte mostraria uma linha só e a tela de
    // "para onde foi" não teria para onde.
    //
    // **O saldo consultado é o da SALA, não o da empresa.** Estava `listItems`,
    // que soma a empresa inteira — inclusive o que já está na prateleira das
    // lojas. A fábrica "despachava" o que estava a dez quilômetros dela, e o
    // saldo da sala dela ia a negativo em silêncio. É o mesmo erro que o piso da
    // produção existe para impedir, cometido pela porta de trás.
    //
    // E ela despacha o que FEZ. Saíam de 100 a 400 por destino com 45% de
    // chance, contra 500 a 1.000 produzidos por dia: a fábrica acumulava
    // trezentas unidades por dia e terminava os noventa dias com um freezer de
    // vinte e sete mil picolés. A saída tem de superar a produção — três
    // destinos, quatro em cada cinco dias, 150 a 500 por viagem — e aí o que
    // segura o volume passa a ser o piso da sala, não o sorteio: fica o giro do
    // dia seguinte e o resto vai para a prateleira.
    for (const destino of destinos) {
      if (next() > 0.8) continue;
      const product = products[Math.floor(next() * products.length)];
      const naSala =
        (await balanceByLocation(companyId, product.itemId)).find((b) => b.locationId === factory.id)
          ?.baseUnits ?? 0;
      // O giro que fica: uma fábrica não esvazia a câmara, ela mantém o de amanhã.
      const guardado = 120 + Math.floor(next() * 160);
      const sent = Math.min(Math.max(0, naSala - guardado), 150 + Math.floor(next() * 350));
      if (sent > 0) {
        await recordTransfer(companyId, {
          itemId: product.itemId,
          fromLocationId: factory.id,
          toLocationId: destino.id,
          baseUnits: sent,
          occurredAt: at(16),
        });
        tally.deliveries += 1;
      }
    }

    /**
     * A loja confere a prateleira, e acha menos — porque vendeu.
     *
     * Sem isto o destino só RECEBE. Depois de noventa dias o Mercado do Zé
     * aparecia com quase nove mil picolés na prateleira, e "Estoque por lugar"
     * mostrava esse número como verdade. Nenhuma loja de bairro guarda isso.
     *
     * A venda não é lançada, e isso é decisão escrita, não esquecimento: o tipo
     * `sale` existe no domínio e **não tem caminho de escrita** — ele é da F4,
     * junto com o Espelho da Loja. O que já existe e já grava é a **contagem
     * cega** (`docs/roadmap.md`, "a captura entra, o relatório espera"), e ela é
     * exatamente o que uma fábrica sabe hoje sobre a prateleira de um cliente:
     * não quanto vendeu, mas quanto sobrou. A diferença entra como `adjustment`,
     * que é bookkeeping neutro — não vai para o relatório de perdas, e é isso
     * mesmo: o que saiu dali não foi perdido, foi comprado por alguém.
     *
     * Uma vez por semana por destino, e o dia é sorteado por destino para as
     * três lojas não conferirem todas na segunda-feira.
     */
    //
    // O saldo por lugar é consultado UMA VEZ por produto e reusado no dia. Ele é
    // um `GROUP BY` sobre o razão inteiro daquele item, e o razão cresce: pedir
    // um por destino por produto por dia de contagem levou a semeadura a passar
    // dos nove segundos que a checagem do navegador esperava, e ela estourou
    // lendo a tela no meio da escrita.
    const daVez = new Map<string, Awaited<ReturnType<typeof balanceByLocation>>>();
    for (const [i, destino] of destinos.entries()) {
      if ((days - 1 - back + i * 2) % 7 !== 0) continue;
      for (const product of products) {
        let saldos = daVez.get(product.itemId);
        if (!saldos) {
          saldos = await balanceByLocation(companyId, product.itemId);
          daVez.set(product.itemId, saldos);
        }
        const naPrateleira = saldos.find((b) => b.locationId === destino.id)?.baseUnits ?? 0;
        if (naPrateleira <= 0) continue;
        // Sobra de um quinto a dois quintos: o resto da semana foi vendido.
        const sobrou = Math.round(naPrateleira * (0.2 + next() * 0.2));
        if (sobrou === naPrateleira) continue;
        await recordCount(companyId, {
          itemId: product.itemId,
          countedBaseUnits: sobrou,
          locationId: destino.id,
          occurredAt: at(18),
        });
        // O saldo daquele lugar mudou agora; o cache do dia é corrigido em vez
        // de descartado, para o próximo destino não pagar outra agregação.
        const linha = saldos.find((b) => b.locationId === destino.id);
        if (linha) linha.baseUnits = sobrou;
        tally.counts += 1;
      }
    }

    // Uma perda de vez em quando, com o motivo dito.
    //
    // Fábrica de congelado perde: derrete no caminho, quebra na câmara, vence
    // no fundo da prateleira. Uma semeadura sem perda nenhuma faz o relatório
    // de perdas mostrar zero para sempre — e zero eterno é a peça que ensina a
    // ignorar a peça. Aqui ela é pequena, como é numa fábrica que vai bem.
    if (next() < 0.14) {
      const product = products[Math.floor(next() * products.length)];
      const held = (await listItems(companyId)).find((i) => i.id === product.itemId);
      const perdido = Math.min(held?.onHandBaseUnits ?? 0, 4 + Math.floor(next() * 22));
      if (perdido > 0) {
        try {
          await recordLoss(companyId, {
            itemId: product.itemId,
            baseUnits: perdido,
            reason: next() < 0.6 ? 'melted' : 'broken',
            locationId: factory.id,
            occurredAt: at(17),
          });
        } catch {
          // Lote exigido e nenhum aberto: a perda simplesmente não foi lançada.
        }
      }
    }

    // E um pedido de loja, para a data que a fábrica ainda alcança.
    //
    // Pedido é o que faz a capa dizer "produza para os pedidos" em vez de
    // "pedidos cobertos" para sempre. A data pedida é de dois a cinco dias à
    // frente porque é assim que uma loja pede: com tempo de a fábrica fazer.
    if (next() < 0.3) {
      const destino = destinos[Math.floor(next() * destinos.length)];
      const product = products[Math.floor(next() * products.length)];
      try {
        await saveOrder(companyId, {
          placeId: destino.id,
          requestedFor: localDate(at(10), timeZone, 2 + Math.floor(next() * 4)),
          lines: [{ itemId: product.itemId, baseUnits: 200 + Math.floor(next() * 400) }],
        });
      } catch {
        // Pedido recusado pela regra da casa: não é erro da semeadura.
      }
    }
  }

  return tally;
}

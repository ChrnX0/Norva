import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, before } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';

/**
 * Os fatos que alimentam o alarme, contra um banco de verdade.
 *
 * Existe por um defeito que eu escrevi e que só apareceu relendo o próprio
 * código: `placeId: d.itemId`. A demanda vem agrupada por ITEM e o aviso conta
 * LOJAS — com o id do item no lugar do id da loja, quatro sabores pedidos pela
 * mesma loja viravam "quatro lojas esperando". O tipo não reclamou porque os dois
 * são `string`, e nenhuma tela mostrava esse número: só a notificação, que ninguém
 * consegue ler numa suíte.
 *
 * A lição que fica: onde dois ids do mesmo tipo se cruzam, o compilador não
 * ajuda, e é aí que o teste tem de ser contra dado real em vez de contra um
 * objeto montado à mão — um dublê teria concordado com o defeito.
 */

/** O mesmo ponte que a suíte do repositório usa: SQLite do Node por trás de `db()`. */
function inMemoryDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));

  return {
    getAllAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T,>(sql: string, params: SqlParam[] = []) =>
      (sqlite.prepare(sql).get(...bind(params)) as T) ?? null,
    runAsync: async (sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).run(...bind(params)),
    execAsync: async (sql: string) => {
      sqlite.exec(sql);
    },
    withTransactionAsync: async (task: () => Promise<void>) => {
      sqlite.exec('BEGIN');
      try {
        await task();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

before(async () => {
  const conn = inMemoryDb();
  // O mesmo migrador que o aplicativo roda ao abrir: o teste exercita o caminho
  // da migração, não um esquema escrito uma segunda vez.
  await migrate(conn);
  __setDb(conn);
});

test('the order alert counts stores, not flavours', async () => {
  const { ensureStarterData } = await import('@/data/seed');
  const { EMPRESA_SEMENTE } = await import('@/data/empresa');
  const { savePlace, saveOrder, listProductsForLedger } = await import('@/data/repository');
  const { factsForAlerts } = await import('./facts');

  await ensureStarterData(EMPRESA_SEMENTE);
  const [produto] = await listProductsForLedger(EMPRESA_SEMENTE);
  const centro = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Centro', kind: 'own_store' });
  const norte = await savePlace(EMPRESA_SEMENTE, { name: 'Loja Norte', kind: 'own_store' });

  // A MESMA loja pede o mesmo produto duas vezes, em pedidos separados. Uma loja
  // esperando, não duas.
  await saveOrder(EMPRESA_SEMENTE, {
    placeId: centro.id,
    lines: [{ itemId: produto.itemId, baseUnits: 400 }],
  });
  await saveOrder(EMPRESA_SEMENTE, {
    placeId: centro.id,
    lines: [{ itemId: produto.itemId, baseUnits: 300 }],
  });

  const umaLoja = await factsForAlerts('America/Sao_Paulo');
  const lojasNaFalta = new Set(umaLoja.orders.map((o) => o.placeId));
  assert.equal(lojasNaFalta.size, 1, 'dois pedidos da mesma loja são uma loja esperando');
  assert.ok(
    umaLoja.orders.every((o) => o.placeId === centro.id),
    'e o id é o da LOJA, não o do item — foi exatamente aqui que o defeito morava',
  );

  // Outra loja pedindo o mesmo produto: agora são duas.
  await saveOrder(EMPRESA_SEMENTE, {
    placeId: norte.id,
    lines: [{ itemId: produto.itemId, baseUnits: 100 }],
  });

  const duasLojas = await factsForAlerts('America/Sao_Paulo');
  assert.equal(
    new Set(duasLojas.orders.map((o) => o.placeId)).size,
    2,
    'lojas diferentes pedindo o mesmo produto são duas lojas esperando',
  );
});

test('a reading with no range is a fact without a judgement', async () => {
  const { EMPRESA_SEMENTE } = await import('@/data/empresa');
  const { savePlace, recordReading } = await import('@/data/repository');
  const { factsForAlerts } = await import('./facts');

  const camara = await savePlace(EMPRESA_SEMENTE, { name: 'Câmara sem faixa', kind: 'cold_room' });
  await recordReading(EMPRESA_SEMENTE, {
    locationId: camara.id,
    kind: 'temperature',
    value: 12,
    unit: 'C',
  });

  const semFaixa = await factsForAlerts('America/Sao_Paulo');
  const leitura = semFaixa.ambient.find((a) => a.locationId === camara.id);
  assert.ok(leitura, 'a leitura chega aos fatos');
  assert.equal(leitura.min, null);
  assert.equal(leitura.max, null);
  assert.equal(leitura.place, 'Câmara sem faixa', 'o nome vem do lugar, para a frase existir');

  // Com faixa, o mesmo fato passa a ter julgamento — e é o alarme que decide, não
  // esta camada.
  await savePlace(EMPRESA_SEMENTE, {
    id: camara.id,
    name: 'Câmara sem faixa',
    kind: 'cold_room',
    sensorRanges: { temperature: { min: -22, max: -16, unit: 'C' } },
  });

  const comFaixa = await factsForAlerts('America/Sao_Paulo');
  const julgada = comFaixa.ambient.find((a) => a.locationId === camara.id);
  assert.equal(julgada?.min, -22);
  assert.equal(julgada?.max, -16);
});

test('the full cold room alarms too, not only the empty storeroom', async () => {
  const { EMPRESA_SEMENTE } = await import('@/data/empresa');
  const { listProductsForLedger, saveProduct } = await import('@/data/repository');
  const { factsForAlerts } = await import('./facts');
  const { alertsDue, DEFAULT_ALERTS } = await import('@/domain/alerts');

  // A faixa azul do dono — "80 a 100%" — é sobre a CÂMARA CHEIA de produto
  // acabado: quem enche a câmara para de produzir por falta de espaço, e isso não
  // aparece olhando insumo. A primeira versão dos fatos filtrava insumo e
  // embalagem, copiando o recorte do cartão de dinheiro parado, que é outra
  // pergunta.
  const [produto] = await listProductsForLedger(EMPRESA_SEMENTE);
  await saveProduct(EMPRESA_SEMENTE, {
    id: produto.id,
    itemId: produto.itemId,
    name: produto.name,
    kind: 'product',
    recipeId: produto.recipeId,
    yieldPerUnit: produto.yieldPerUnit,
    unitPackagingRate: produto.unitPackagingRate,
    packaging: produto.packaging,
    fullLevel: 100,
  });

  const facts = await factsForAlerts('America/Sao_Paulo');
  const doProduto = facts.volumes.find((v) => v.itemId === produto.itemId);
  assert.ok(doProduto, 'o produto acabado entra na leitura por faixa');
  assert.equal(doProduto.fullLevel, 100, 'com a régua que o cadastro dele deu');

  // Sem nada produzido o produto está ZERADO, e zerado é faixa própria: acabou é
  // outro fato, não "vermelho extremo".
  assert.equal(doProduto.onHand, 0);

  // Produz o suficiente para encher a câmara: 300 contra 100 de cheio é azul.
  const { recordProduction, defaultLocationId } = await import('@/data/repository');
  await recordProduction(EMPRESA_SEMENTE, {
    productId: produto.id,
    locationId: defaultLocationId(EMPRESA_SEMENTE),
    batches: 1,
    unitsProduced: 300,
    occurredAt: '2026-09-03T10:00:00.000Z',
    producedOn: '2026-09-03',
  });

  const cheia = await factsForAlerts('America/Sao_Paulo');
  const soVolume = {
    ...DEFAULT_ALERTS,
    on: {
      ...DEFAULT_ALERTS.on,
      volume: true,
      insumo: false,
      pedido: false,
      validade: false,
      ambiente: false,
    },
  };

  // Por padrão o azul só PINTA: almoxarifado cheio depois de uma compra é estado
  // desejado, e aviso diário sobre estado desejado ensina a ignorar aviso.
  assert.deepEqual(alertsDue(cheia, soVolume), []);

  // Ligado, ele avisa — e é aqui que o caso do dono vive: a câmara que enche até
  // parar a produção, que ninguém descobre olhando o que falta.
  const avisos = alertsDue(cheia, {
    ...soVolume,
    bands: { ...soVolume.bands, notifyFull: true },
  });
  assert.ok(
    avisos.some((a) => a.subjectId === produto.itemId && a.band === 'azul'),
    'câmara cheia avisa, e o aviso diz que é cheia e não vazia',
  );
});

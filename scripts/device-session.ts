/**
 * Runs a real session on a real device database, then prints its outbox as SQL
 * the server would receive.
 *
 * This is the half of the verification bar that was missing, and the reason six
 * defects lived in plain sight: everything else exercises a module or drives the
 * app, and neither can see the seam where SQLite's shapes meet Postgres's. That
 * seam only exists when a queue is actually replayed.
 *
 * Nothing here is mocked. The session calls the same repository functions the
 * screens call, the queue is the one the app really builds, and the SQL comes
 * out of `serialize` - the code that will run when sync is switched on.
 *
 * Output goes to stdout for `scripts/verify-sync.sh` to feed into a throwaway
 * Postgres. The device's own figures are printed as comments at the end, so the
 * shell can check that both sides agree on the number.
 */

import { DatabaseSync } from 'node:sqlite';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { pendingEntries } from '@/data/outbox';
import {
  defaultLocationId,
  listItems,
  listProducts,
  recordCount,
  recordLoss,
  recordProduction,
  recordReturn,
  recordReading,
  eraseArea,
  recordTransfer,
  saveCarrier,
  recordPurchase,
  savePlace,
  savePerson,
  listProfiles,
  saveOrder,
  saveFlavor,
  saveLine,
  saveProduct,
  saveType,
  saveRecipeVersion,
  saveSalePrice,
  averageRatesForLedger,
} from '@/data/repository';
import { ensureStarterData } from '@/data/seed';
import { empresaDaqui } from '@/data/empresa';
import { adotarEmpresa } from '@/data/adocao';
import { fromDecimal, rate} from '@/domain/money';
import { sendableTables, serialize, type SyncActor } from '@/sync/serialize';

/** Stands in for whoever is signed in when the phone finally finds a tower. */
const ACTOR: SyncActor = { userId: '00000000-0000-4000-8000-000000000001' };

/**
 * An identifier on its way into SQL, checked instead of trusted.
 *
 * Table and column names cannot be bound parameters - Postgres takes an
 * identifier only as text in the statement - so the usual defence is not
 * available here and prose is what is left. Prose is not a defence: a comment
 * saying "these come from a closed list" stays on the page after somebody
 * widens the list. This does the same argument as a check, so widening it
 * wrongly stops the script instead of building the statement.
 */
function ident(name: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`refusing to build SQL around an identifier like "${name}"`);
  }
  return name;
}

function connect(): { db: Db; raw: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));

  return {
    raw: sqlite,
    db: {
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
    },
  };
}

async function main() {
  const { db, raw } = connect();
  await migrate(db);
  __setDb(db);

  /**
   * O aparelho adota uma empresa ANTES de escrever a primeira linha — e o id dela
   * não é a semente nem o da conta.
   *
   * **Era aqui que esta checagem escondia o defeito que ela existe para pegar.**
   * A empresa semeada no Postgres descartável tinha exatamente o id compilado do
   * aparelho, e o id da CONTA era o mesmo número: um uuid fazendo três papéis.
   * Então a fila entrava, tudo fechava, e nada disso provava que o servidor
   * aceita uma fila cujo `company_id` foi carimbado por adoção — que é o único
   * caso que vai existir de verdade. A empresa passa a ter id próprio, a conta
   * continua sendo outra, e a shell LÊ daqui qual empresa semear.
   */
  await adotarEmpresa('c4b1f7a8-9e02-4d31-8b55-000000000f01');

  /**
   * Um pedido de Reset, no banco AINDA VAZIO — e a ordem aqui não é gosto.
   *
   * A guarda de completude no fim deste arquivo exige que toda tabela que atravessa
   * seja exercitada, e `erase_requests` atravessa desde a `0045`. Mas apagar uma área
   * no fim da sessão destruiria o dia que ela acabou de construir — e mais: levaria a
   * própria FILA, porque `tablesFor('all')` inclui a `outbox`. Então o pedido entra
   * agora, sobre o vazio: ele não destrói nada, e a linha que ele enfileira é o que a
   * checagem 6 precisa para provar que o servidor a aceita sob a política.
   */
  await eraseArea(empresaDaqui(), 'recipes');

  // A day in the factory, in the order it really happens.
  await ensureStarterData(empresaDaqui());

  const items = await listItems(empresaDaqui());
  const sugar = items.find((i) => i.name.startsWith('Açúcar'));
  const pulp = items.find((i) => i.name.startsWith('Polpa'));
  if (!sugar || !pulp) throw new Error('the starter data did not arrive');

  // A grade do que a fábrica faz, cadastrada como o dono cadastra: a linha
  // primeiro, o tipo dentro dela, o sabor solto. A ordem importa e é a mesma
  // que vai para o servidor - tipo antes da linha seria chave estrangeira
  // quebrada do outro lado, e a fila é enviada na ordem em que foi escrita.
  const linha = await saveLine(empresaDaqui(), { name: 'Picolé' });
  const tipo = await saveType(empresaDaqui(), { lineId: linha, name: 'Tradicional' });
  const sabor = await saveFlavor(empresaDaqui(), { name: 'Morango' });

  // E um produto que a usa, porque uma grade que não chega presa a um produto
  // atravessa sem provar que as três colunas novas atravessam.
  const palito = items.find((i) => i.name.includes('Palito'));
  if (!palito) throw new Error('the starter data has no stick');

  await saveProduct(empresaDaqui(), {
    name: 'Picolé Tradicional de Morango',
    kind: 'product',
    recipeId: null,
    yieldPerUnit: null,
    unitPackagingRate: rate(0.05, 1),
    // A lista de embalagem atravessa como `jsonb` do outro lado. Mandada crua,
    // o Postgres guardaria uma string entre aspas onde deveria haver lista - e o
    // consumo do outro lado passaria a somar nada, sem uma reclamação. É o mesmo
    // defeito que a hierarquia de `items` já teve, e a única forma de provar que
    // não voltou é uma linha de verdade atravessando a fila.
    packagingItems: [{ itemId: palito.id, quantityPerUnit: 1 }],
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
    lineId: linha,
    typeId: tipo,
    flavorId: sabor,
  });

  // A second invoice, so the moving average has something to move.
  await recordPurchase(empresaDaqui(), {
    itemId: sugar.id,
    supplierName: 'Fornecedor Silva',
    purchaseQuantity: 2,
    baseUnits: 50_000,
    totalCents: fromDecimal(295),
  });

  // Somebody walks to the shelf and finds less than the books expected.
  await recordCount(empresaDaqui(), {
    locationId: defaultLocationId(empresaDaqui()),
    itemId: sugar.id,
    countedBaseUnits: 92_000,
  });

  // And a recipe, whose lines carry an order somebody chose.
  await saveRecipeVersion(empresaDaqui(), {
    name: 'Base de creme',
    yieldAmount: 10_000,
    yieldUnit: 'ml',
    lossFraction: 0.04,
    lines: [
      { kind: 'item', itemId: pulp.id, quantity: 3_000 },
      { kind: 'item', itemId: sugar.id, quantity: 1_500 },
    ],
  });

  // E um cliente que liga pedindo, que é a única escrita deste app que não
  // toca no livro-razão. Ela atravessa aqui pelo mesmo motivo que a grade:
  // uma tabela que `serialize` diz saber mandar e que nenhuma sessão exercita
  // é uma promessa que ninguém cobrou - o servidor recusaria na primeira vez,
  // em produção, com a fila inteira parada atrás dela.
  const loja = await savePlace(empresaDaqui(), { name: 'Loja Centro', kind: 'own_store' });
  await saveOrder(empresaDaqui(), {
    placeId: loja.id,
    requestedFor: '2026-09-10',
    lines: [{ itemId: pulp.id, baseUnits: 300 }],
  });

  // Gente e perfil, que é a travessia mais fácil de errar deste arquivo: no
  // aparelho `capabilities` é texto separado por vírgula, e no servidor é
  // `capability[]`. Mandada crua, o Postgres guarda uma palavra só chamada
  // "dispatch,check_receipt" e recusa a fila inteira — com tudo o que a fábrica
  // gravar depois preso atrás dela.
  const perfis = await listProfiles(empresaDaqui());
  const entregador = perfis.find((p) => p.templateRole === 'driver') ?? perfis[0];
  await savePerson(empresaDaqui(), { name: 'Zeca da câmara', profileId: entregador.id });

  /**
   * O acordo comercial: o preço de tabela, o combinado com a loja, e a história.
   *
   * Atravessa aqui porque é onde o par mais delicado desta migração se prova
   * contra o Postgres de verdade: `location_prices` tem `unique (company_id,
   * location_id, item_id)` além do `id`, então o `on conflict` da fila tem de casar
   * com a chave certa; e `sale_price_history` só tem política de INSERT — a mesma
   * forma de `movements` —, o que quer dizer que um reenvio da fila não pode tentar
   * atualizar nada nela.
   *
   * As três chamadas escrevem QUATRO linhas: a tabela (que é `items`, já na fila),
   * o combinado, e duas de história — uma por mudança.
   */
  const vendavel = (await listProducts(empresaDaqui()))[0];
  if (!vendavel) throw new Error('a sessão precisa de um produto para precificar');
  await saveSalePrice(empresaDaqui(), { itemId: vendavel.itemId, placeId: null, rate: rate(2.5, 1) });
  await saveSalePrice(empresaDaqui(), { itemId: vendavel.itemId, placeId: loja.id, rate: rate(2.2, 1) });
  await saveSalePrice(empresaDaqui(), { itemId: vendavel.itemId, placeId: loja.id, rate: rate(2.4, 1) });

  // A câmara fria, com a faixa que julga a leitura — e uma leitura dentro dela.
  //
  // Atravessa por dois motivos, e os dois são cicatriz: a faixa é `jsonb` do
  // outro lado e texto aqui, então mandada crua o Postgres guardaria uma string
  // entre aspas onde deveria haver objeto (foi o que a lista de embalagem já
  // fez); e `readings` exige `recorded_by` na política, que é a coluna que o
  // aparelho não conhece e o serializador estampa.
  const camara = await savePlace(empresaDaqui(), {
    name: 'Câmara fria',
    kind: 'cold_room',
    sensorRanges: { temperature: { min: -22, max: -16, unit: 'C' } },
  });
  await recordReading(empresaDaqui(), {
    locationId: camara.id,
    kind: 'temperature',
    value: -18.4,
    unit: 'C',
  });

  // E uma corrida de verdade, que é o que faz nascer um LOTE.
  //
  // O lote atravessa a fila antes do movimento que o cita, e o servidor tem a
  // chave estrangeira que o SQLite do aparelho não tem - `movements.lot_id`
  // aponta para `lots` lá, e aqui é só um TEXT. Se a ordem estivesse errada, o
  // aparelho aceitaria e o servidor recusaria: o defeito só apareceria no
  // primeiro celular sem sinal, com a fila inteira parada atrás dele.
  const produto = (await listProducts(empresaDaqui())).find((p) => p.recipeId);
  if (!produto) throw new Error('a sessão precisa de um produto com receita');
  await recordProduction(empresaDaqui(), {
    productId: produto.id,
    locationId: defaultLocationId(empresaDaqui()),
    batches: 1,
    unitsProduced: 480,
    producedOn: '2026-09-02',
  });

  // Quem leva a carga, com telefone — e a carga apontando para ela.
  //
  // Não é enfeite da sessão: a checagem 6 promete que TODA tabela que atravessa
  // chega inteira, e a guarda de completude no fim deste arquivo recusa a execução
  // se alguma ficar de fora. Uma carga com transportadora é o único jeito de
  // provar a chave estrangeira COMPOSTA que a `0044` monta — `(carrier_id,
  // company_id)` —, e é ela que recusaria uma carga apontando para a
  // transportadora de outra empresa.
  const transportadora = await saveCarrier(empresaDaqui(), {
    name: 'Transportes do Vale',
    phone: '11 95555-0000',
  });

  // A carga que sai da fábrica para a loja, levada por ela.
  await recordTransfer(empresaDaqui(), {
    itemId: pulp.id,
    fromLocationId: defaultLocationId(empresaDaqui()),
    toLocationId: loja.id,
    baseUnits: 2000,
    carrierId: transportadora.id,
  });

  // E uma perda com motivo, que é o tipo com a capacidade mais restrita.
  await recordLoss(empresaDaqui(), {
    itemId: pulp.id,
    baseUnits: 300,
    reason: 'melted',
  });

  // E a loja devolve parte do que recebeu.
  //
  // Não é enfeite da sessão: no servidor, cada TIPO de movimento tem a sua
  // própria capacidade — transferência pede `dispatch`, devolução pede
  // `check_receipt`. Uma devolução que nunca foi replicada é uma política que
  // nunca foi cobrada, e ela só falharia na primeira loja que devolvesse
  // mercadoria, em produção, com a fila inteira parada atrás dela.
  await recordReturn(empresaDaqui(), {
    itemId: pulp.id,
    fromLocationId: loja.id,
    toLocationId: defaultLocationId(empresaDaqui()),
    baseUnits: 500,
    // Com motivo, e é ele que a sessão prova: o servidor recusa devolução sem
    // razão (`movements_return_says_why`), então uma devolução sem ela nunca
    // teria atravessado — e a checagem passaria por não ter tentado.
    returnReason: 'unsold',
  });

  // --- and now, exactly what the server would receive -----------------------

  const queue = await pendingEntries(500);
  const out: string[] = [];
  const exercised = new Set<string>();
  const kindsNaFila = new Set<string>();

  out.push('-- Gerado por scripts/device-session.ts. Não editar à mão.');
  out.push(`-- ${queue.length} escritas na fila, na ordem em que o aparelho gravou.`);
  out.push('');

  for (const entry of queue) {
    // O apagamento não tem linha atrás dele — ele É o pedido, e o `serialize` o
    // transforma em linha de `erase_requests`. Até a `0045` este ramo saía com um
    // comentário dizendo "o servidor ainda não o recebe"; agora recebe, e a checagem
    // 6 prova que recebe sob a política.
    const semLinha = entry.table === 'erase';

    // The table name comes from the device's own outbox, and the row from the
    // database this script just built in memory, and `ident` refuses anything
    // that is not a plain identifier.
    const row = semLinha
      ? undefined
      : (raw
          .prepare(`SELECT * FROM ${ident(entry.table)} WHERE id = ?`) // proofgate-allow: ident() above
          .get(entry.rowId) as Record<string, unknown> | undefined);

    const write = serialize(entry, row ?? null, ACTOR);
    if (write.kind === 'derived') {
      out.push(`-- ${write.table} não viaja: valor derivado tem um dono só, e é o servidor`);
      continue;
    }
    if (write.kind !== 'upsert') continue;

    const json = JSON.stringify(write.row);
    if (json.includes('$sync$')) throw new Error('a value collided with the quoting tag');

    // How a repeat is handled is not a detail - it is the contract.
    //
    // The queue replays the same row many times: `item_costs` is rewritten by
    // every invoice, so the server has to take the newest and overwrite. The
    // ledger is the exact opposite: `movements` is append-only and the database
    // refuses an UPDATE outright, so a movement arriving twice has to be a
    // nothing. That is what the shared id between a purchase line and its
    // movement was always for.
    const keys = Object.keys(write.row);
    const conflict = ['id'];
    const settled = keys.filter((k) => !conflict.includes(k));

    // Leitura de sensor é da mesma família do livro-razão: a temperatura de ontem
    // às três da manhã não se corrige, se mede de novo. Uma série que aceita
    // UPDATE deixa de ser prova de nada — e o servidor recusa a coluna sem UPDATE
    // dizendo apenas "permission denied", sem contar qual privilégio falta.
    //
    // `sale_price_history` entrou nesta lista pelo mesmo motivo, e o Postgres foi
    // quem apontou: a política dela no servidor só tem `for insert`, então subir com
    // `do update` pede um privilégio que ela nunca vai ter — e o erro não fala de
    // política, fala de permissão numa tabela que ninguém tocou. Por quanto se
    // vendia em março não se corrige: combina-se de novo, e isso é uma linha nova.
    // `erase_requests` entra aqui: pedido é FATO, e a política do servidor recusa
    // update e delete. Sem isto a fila sobe com `on conflict do update`, que pede
    // permissão de UPDATE — e o Postgres responde "permission denied" sem dizer
    // qual das duas falta, que foi exatamente o que me custou uma execução.
    const APPEND_ONLY = ['movements', 'readings', 'sale_price_history', 'erase_requests'];
    const appendOnly = APPEND_ONLY.includes(write.table);

    const onConflict = appendOnly
      ? 'do nothing'
      : `do update set ${settled.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')}`;

    // The columns are named, and that is not cosmetic.
    //
    // `select *` off `jsonb_populate_record` hands the insert every column the
    // table has, with NULL wherever the JSON was silent - which quietly defeats
    // the server's own defaults and turns `freight_cents not null default 0`
    // into a rejected write. A real client sends the fields it has and lets the
    // server fill the rest, so that is what this does. It also makes a field the
    // table does not have fail on the column list, loudly, which is the entire
    // point of running this. Every name here comes from `serialize`'s own closed
    // list, never from outside, and `ident` enforces that rather than asserting it.
    exercised.add(write.table);
    if (write.table === 'movements' && typeof row?.kind === 'string') kindsNaFila.add(row.kind);

    const columns = keys.map(ident).join(', ');
    out.push(
      `insert into ${ident(write.table)} (${columns}) select ${columns} from ` + // proofgate-allow: ident() above
        `jsonb_populate_record(null::${write.table}, $sync$${json}$sync$::jsonb) ` +
        `on conflict (${conflict.join(', ')}) ${onConflict};`,
    );
  }

  // The guard checks itself.
  //
  // Every table `serialize` claims it can send has to actually appear in this
  // session, or the sixth guarantee quietly covers nine tables out of ten and
  // reads exactly the same. A table added tomorrow that nothing here exercises
  // stops the run rather than passing.
  const untouched = sendableTables.filter((table) => !exercised.has(table));
  if (untouched.length > 0) {
    throw new Error(
      `a sessão não exercita ${untouched.join(', ')} — a checagem 6 cobriria menos do que promete`,
    );
  }

  // E o guard cobra TIPO de movimento, não só tabela.
  //
  // No servidor, cada kind tem a sua própria capacidade: transferência pede
  // `dispatch`, devolução pede `check_receipt`, produção pede
  // `record_production`. Uma sessão que grava movimento de três tipos e replica
  // só dois passa na checagem de tabelas com a política do terceiro nunca
  // exercitada — que foi exatamente o buraco por onde a devolução entrou hoje.
  //
  // A lista é do que este aplicativo SABE escrever, não do enum inteiro do
  // servidor: `sale` e `reversal` não têm escritor ainda, e cobrar por eles
  // seria pedir que a sessão finja um caminho que o app não tem.
  const kindsQueTemEscritor = ['purchase', 'production', 'consumption', 'transfer', 'return', 'adjustment', 'loss'];
  const kindsDeFora = kindsQueTemEscritor.filter((kind) => !kindsNaFila.has(kind));
  if (kindsDeFora.length > 0) {
    throw new Error(
      `a sessão não grava movimento de tipo ${kindsDeFora.join(', ')} — a política desses tipos ` +
        `nunca é exercitada, e cada tipo tem a sua própria capacidade no servidor`,
    );
  }

  // What the device believes, for the shell to check the server against.
  const after = await listItems(empresaDaqui());
  const heldSugar = after.find((i) => i.id === sugar.id);
  // A média pelo caminho do LIVRO-RAZÃO: esta saída é comparada número por
  // número com a que o Postgres calcula, e é verdade de razão, não figura de tela.
  const costs = await averageRatesForLedger(empresaDaqui());

  out.push('');
  out.push(`-- DEVICE_SUGAR_ID=${sugar.id}`);
  out.push(`-- DEVICE_SUGAR_BALANCE=${heldSugar?.onHandBaseUnits ?? 0}`);
  // A Rate, not money: fractional by foundation, and printed here only so the
  // server's own average can be compared against it.
  out.push(`-- DEVICE_SUGAR_AVERAGE=${(costs[sugar.id] ?? 0).toFixed(4)}`); // proofgate-allow
  // E o PRODUTO, que é a média que o servidor derivava de nada.
  //
  // O açúcar prova a média da compra: os dois lados a calculam a partir das
  // linhas de nota. O picolé prova a outra metade, que não existia — nenhuma
  // nota compra picolé, então até a migração 0025 o servidor só sabia dele
  // pelo movimento de produção, e não olhava. As duas implementações
  // independentes da mesma regra, agora nos dois caminhos.
  out.push(`-- DEVICE_PRODUCT_ID=${produto.itemId}`);
  out.push(`-- DEVICE_PRODUCT_AVERAGE=${(costs[produto.itemId] ?? 0).toFixed(4)}`); // proofgate-allow
  out.push(`-- DEVICE_COMPANY=${empresaDaqui()}`);
  out.push(`-- DEVICE_QUEUE_LENGTH=${queue.length}`);

  process.stdout.write(out.join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

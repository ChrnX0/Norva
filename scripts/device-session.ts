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
import { DESCEM, pedido } from '@/sync/descida';
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
  recordCheck,
  recordTransfer,
  reverseGroup,
  saveCarrier,
  recordPurchase,
  savePlace,
  savePerson,
  saveDevice,
  listProfiles,
  saveOrder,
  saveCategory,
  saveFlavor,
  saveLine,
  saveProduct,
  saveType,
  saveRecipeVersion,
  saveSalePrice,
  averageRatesForLedger,
} from '@/data/repository';
import { candidatarConferencia } from '@/data/candidata';
import { ensureStarterData } from '@/data/seed';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { assumirAparelho } from '@/data/aparelho';
import { adotarEmpresa } from '@/data/adocao';
import { fromDecimal, rate} from '@/domain/money';
import { APENAS_INSERE, sendableTables, serialize, type SyncActor } from '@/sync/serialize';

/** Stands in for whoever is signed in when the phone finally finds a tower. */
/**
 * Quem empurra — e a empresa vem de `empresaDaqui()`, na hora de enviar.
 *
 * Não é detalhe de escrita: é a coisa que esta sessão existe para exercitar. O
 * aparelho ADOTA uma empresa antes de escrever a primeira linha, e o pedido de Reset
 * é a única entrada da fila cujo corpo carrega um `company_id`. Enquanto ele vinha do
 * payload, vinha congelado com a empresa-semente — que o servidor nunca conheceu — e
 * a fila era recusada por política na primeira entrada. Ler aqui, no envio, é o mesmo
 * que o `recorded_by` já fazia.
 */
const ator = (): SyncActor => ({
  userId: '00000000-0000-4000-8000-000000000001',
  companyId: empresaDaqui(),
});

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

  // A grade do que a fábrica faz, cadastrada como o dono cadastra: o produto primeiro, a
  // categoria dentro dele, o tipo dentro da categoria, a variação dentro do tipo. A ordem
  // importa e é a mesma que vai para o servidor - tipo antes da linha seria chave
  // estrangeira quebrada do outro lado, e a fila é enviada na ordem em que foi escrita.
  //
  // **A categoria entrou aqui tarde, e a demora tem nome.** A `0057` a criou e o
  // serializador passou a declarar que sabe enviá-la — e esta sessão nunca a escreveu.
  // O guard de baixo existe exatamente para isso ("a sessão não exercita X") e ele
  // ficou VERMELHO desde aquele commit, enquanto eu reportava trinta garantias verdes.
  // A lição não é sobre a tabela: é que dizer o resultado de um comando sem ler a saída
  // dele é a mesma doença que este repositório persegue em toda outra forma.
  const linha = await saveLine(empresaDaqui(), { name: 'Picolé' });
  const categoria = await saveCategory(empresaDaqui(), { lineId: linha, name: 'Leite' });
  const tipo = await saveType(empresaDaqui(), {
    lineId: linha,
    categoryId: categoria,
    name: 'Tradicional',
  });
  // A variação estreita na CATEGORIA (`0059`), que é o caso que a regra aprovada em 11 de
  // setembro criou: com Leite sendo categoria, "morango só no leite" mora aqui. Mandá-la
  // presa ao tipo deixaria a coluna nova atravessar sempre nula — e coluna que só
  // atravessa nula é coluna que ninguém sabe se atravessa.
  const sabor = await saveFlavor(empresaDaqui(), {
    lineId: linha,
    categoryId: categoria,
    name: 'Morango',
  });

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
    // A categoria do PRODUTO também atravessa — e ela tinha coluna, índice e leitor sem
    // escritor até esta rodada. Sem ela aqui, `products.category_id` chegaria sempre nula
    // ao servidor e a checagem 6 não saberia dizer se a coluna funciona.
    categoryId: categoria,
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
  const base = await saveRecipeVersion(empresaDaqui(), {
    name: 'Base de creme',
    yieldAmount: 10_000,
    yieldUnit: 'ml',
    lossFraction: 0.04,
    lines: [
      { kind: 'item', itemId: pulp.id, quantity: 3_000 },
      { kind: 'item', itemId: sugar.id, quantity: 1_500 },
    ],
  });

  /**
   * E uma ficha-MÃE, que compõe a base — a única travessia deste arquivo que carrega o carimbo da
   * versão da sub-receita.
   *
   * Sem ela a `0066` teria chave composta, gatilho e índice, e nenhuma linha do aparelho passaria
   * por eles: `sub_recipe_version_id` atravessaria como `null` para sempre e o servidor concordaria
   * calado. É a mesma razão de a sessão gravar venda e estorno — capacidade do servidor que
   * nenhuma fila exercita é promessa que ninguém cobrou.
   *
   * Sem `subVersionId`: `saveRecipeVersion` carimba a mais nova, que é a Lei 1 e é o caminho que a
   * tela usa.
   */
  await saveRecipeVersion(empresaDaqui(), {
    name: 'Picolé de creme',
    yieldAmount: 1_000,
    yieldUnit: 'ml',
    lossFraction: 0.02,
    lines: [{ kind: 'recipe', recipeId: base.recipeId, quantity: 1_000, subVersionId: null }],
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
  const zeca = await savePerson(empresaDaqui(), {
    name: 'Zeca da câmara',
    profileId: entregador.id,
  });

  /**
   * **A matrícula do aparelho, e ela vem ANTES de qualquer movimento de propósito.**
   *
   * O servidor tem `movements.device_id references devices(id) on delete restrict`
   * (`0013`), então um movimento que chegasse antes da matrícula seria recusado por chave
   * estrangeira — e recusa de chave estrangeira é permanente: a fila daquele celular
   * pararia na primeira sincronia, para sempre. A ordem da fila é a ordem em que a
   * fábrica gravou, e é isso que esta linha exercita: matricular primeiro, gravar depois.
   *
   * O responsável é a pessoa cadastrada logo acima — gente, não conta. É a forma que a
   * `0035` deu às duas colunas, e num celular que entra pela grade de nomes com PIN não
   * existe `auth.users` para apontar.
   *
   * E `assumirAparelho` é o que faz os movimentos abaixo carimbarem: sem ela a sessão
   * mandaria `devices` e nove movimentos com `device_id` nulo, que é exatamente o estado
   * que esta rodada veio consertar — e a checagem 6 passaria dizendo que atravessou.
   */
  const celular = await saveDevice(empresaDaqui(), {
    name: 'Celular da câmara',
    responsibleId: zeca.id,
    locationId: unidadeDaqui(),
  });
  await assumirAparelho(celular.id);

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
  const carga = await recordTransfer(empresaDaqui(), {
    itemId: pulp.id,
    fromLocationId: defaultLocationId(empresaDaqui()),
    toLocationId: loja.id,
    baseUnits: 2000,
    carrierId: transportadora.id,
  });

  /**
   * O ESTORNO da segunda nota — e a fila nunca tinha atravessado um.
   *
   * A checagem 6 promete que os dois lados fecham o mesmo número, e ela nunca exercitou o
   * caminho em que os dois mais divergem. O aparelho recompõe a média no estorno
   * (`recomputeItemCost`); o servidor não tinha nada equivalente até a `0064`, e deixava a linha
   * estornada dentro da média para sempre — o dono corrige o estoque e fica com o custo errado.
   *
   * Com o estorno na sessão, a garantia compara a média dos dois lados DEPOIS dele, que é onde o
   * defeito morava. Sem ele, o gatilho novo poderia estar quebrado e tudo continuaria verde.
   */
  // `recordPurchase` devolve as TAXAS (o que a média era e virou), não o grupo do ato — o grupo
  // sai do razão, que é quem o guarda.
  const daSegundaNota = await db.getFirstAsync<{ movement_group_id: string }>(
    `SELECT movement_group_id FROM movements
      WHERE item_id = ? AND kind = 'purchase' AND movement_group_id IS NOT NULL
      ORDER BY rowid DESC LIMIT 1`,
    [sugar.id],
  );
  if (!daSegundaNota?.movement_group_id) throw new Error('a segunda nota não deixou grupo no razão');
  await reverseGroup(empresaDaqui(), {
    groupId: daSegundaNota.movement_group_id,
    note: 'a nota foi lançada duas vezes',
  });

  /**
   * E uma VENDA, que é a outra política que ninguém exercitava.
   *
   * O comentário da guarda de cobertura logo abaixo dizia que `sale` e `reversal` *"não têm
   * escritor ainda"* — e os dois têm: `reverseGroup` escreve estorno e `recordCount` escreve
   * venda quando a falta é de produto numa loja que vende ao consumidor (a `0047`, *"quem conta
   * pode gravar a venda que a contagem dele descobriu"*). A lista derivava do que o comentário
   * afirmava, e o comentário tinha envelhecido: duas capacidades do servidor sem uma linha de
   * prova.
   *
   * Para a venda existir são três condições, e a sessão precisava das três: produto (não insumo),
   * numa loja, com a contagem MENOR que o livro.
   */
  const feitos = (await listItems(empresaDaqui())).find((i) => i.id === produto.itemId);
  if (!feitos) throw new Error('a sessão precisa do item do produto para vender');
  await recordTransfer(empresaDaqui(), {
    itemId: feitos.id,
    fromLocationId: defaultLocationId(empresaDaqui()),
    toLocationId: loja.id,
    baseUnits: 200,
  });
  await recordCount(empresaDaqui(), {
    locationId: loja.id,
    itemId: feitos.id,
    countedBaseUnits: 180,
  });

  /**
   * A doca confere a carga, e a conferência que PERDE a disputa vira candidata.
   *
   * Duas coisas que a sessão não exercitava e a fila carrega: a `discrepancy`, cuja capacidade
   * no servidor é `check_receipt` e não `dispatch`; e `check_candidates`, a tabela da decisão
   * do dono sobre duplicação. A guarda de cobertura logo abaixo pegou a segunda no instante em
   * que a travessia dela foi escrita — *"a sessão não exercita check_candidates"* —, e é para
   * isso que ela existe: tabela que atravessa sem ninguém exercitar faz a sexta garantia
   * cobrir menos do que promete, lendo exatamente igual.
   *
   * `counted` com falta, e não "chegou tudo": diferença zero atravessaria sem dizer se o
   * número sobreviveu à viagem.
   */
  await recordCheck(empresaDaqui(), {
    groupId: carga.groupId,
    counted: [{ itemId: pulp.id, baseUnits: 1850 }],
  });
  const conferencia = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM movements WHERE movement_group_id = ? AND kind = 'discrepancy'`,
    [carga.groupId],
  );
  if (!conferencia) throw new Error('a conferência não entrou no razão da sessão');
  if (!(await candidatarConferencia(conferencia.id))) {
    throw new Error('a conferência não virou candidata: a duplicação sumiria em silêncio');
  }

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

    const write = serialize(entry, row ?? null, ator());
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
    // A lista mora no `serialize`, que é quem sabe o que atravessa. Escrita à mão
    // aqui, ela era a segunda verdade da mesma regra — e a primeira divergência
    // apareceria como `permission denied` sem dizer qual permissão falta.
    const appendOnly = (APENAS_INSERE as readonly string[]).includes(write.table);

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
  // servidor.
  //
  // **E ela afirmava, em 13 de setembro, que `sale` e `reversal` "não têm escritor ainda".** Os
  // dois têm: `reverseGroup` (`repository.ts:8360`) e `recordCount` quando a falta é de produto
  // numa loja (`:1874`, a `0047`). O comentário envelheceu e a lista foi derivada DELE, então
  // duas capacidades do servidor — `adjust_stock` no estorno, e o par `dispatch`/`adjust_stock`
  // da venda — nunca tiveram uma linha de prova. É a doença que este projeto nomeia: guarda que
  // deriva do que alguém escreveu sobre o código, em vez do código.
  const kindsQueTemEscritor = ['purchase', 'production', 'consumption', 'transfer', 'return', 'adjustment', 'loss', 'sale', 'reversal'];
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

  /**
   * E o PEDIDO da descida, tabela por tabela, para o shell poder ANDAR nele.
   *
   * A garantia que confere a descida precisa da lista exata de colunas que o aparelho pede, e
   * ela só existe aqui: `pedido()` a monta do serializador. Escrevê-la à mão no script seria
   * a doença que este repositório já nomeou — *"guarda cuja lista é derivada da mesma mão não
   * guarda nada"* —, e uma coluna nova no serializador deixaria de ser conferida no silêncio.
   *
   * É isto que faz a diferença entre conferir a FORMA do esquema e andar o caminho: em 13 de
   * setembro a descida pedia `received_at` de vinte e três tabelas e o servidor a tinha em
   * quatro, com `typecheck` limpo e a suíte verde.
   */
  for (const tabela of DESCEM) {
    const p = pedido(tabela, null);
    out.push(`-- DESCIDA ${tabela}=${p.colunas.join(',')}`);
  }

  process.stdout.write(out.join('\n') + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

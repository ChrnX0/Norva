import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, test } from 'node:test';
import { __setDb, db, migrate, nowIso, schemaVersion, type Db, type SqlParam } from './db';
import {
  gravarCopia,
  lerCopia,
  restaurar,
  CopiaRecusadaError,
  type MotivoDaCopia,
} from './backup';
import { countMovements, listItems, recordPurchase, itemMovements, savePlace } from './repository';
import { ensureStarterData } from './seed';
import { EMPRESA_SEMENTE } from './empresa';
import { fromDecimal } from '@/domain/money';

/**
 * A cópia do aparelho é a única peça do plano cujo prejuízo não tem conserto —
 * então ela é a que menos pode ser provada por dedução.
 *
 * O banco aqui é um ARQUIVO e não `:memory:`, porque `VACUUM INTO` e `ATTACH`
 * escrevem e leem arquivo de verdade. Provar cópia contra banco em memória seria
 * provar outra coisa.
 */
let pasta: string;
let vivo: DatabaseSync;

function ligar(caminho: string): Db {
  const sqlite = new DatabaseSync(caminho);
  vivo = sqlite;
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

beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'norva-copia-'));
  const conn = ligar(join(pasta, 'norva.db'));
  __setDb(conn);
  await migrate(conn);
});

afterEach(() => {
  __setDb(null);
  try {
    vivo.close();
  } catch {
    /* já fechado */
  }
  rmSync(pasta, { recursive: true, force: true });
});

async function motivoDe(acao: () => Promise<unknown>): Promise<MotivoDaCopia | 'nao recusou'> {
  try {
    await acao();
    return 'nao recusou';
  } catch (e) {
    if (e instanceof CopiaRecusadaError) return e.motivo;
    throw e;
  }
}

test('a copy holds the whole factory and gives it back', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.kind === 'input')!.id;
  await recordPurchase(EMPRESA_SEMENTE, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });

  const antes = (await itemMovements(EMPRESA_SEMENTE, acucar)).length;
  assert.ok(antes > 0, 'havia movimento para copiar');
  // O total do aparelho, para a cópia ser conferida contra ele e não contra zero.
  const totalNoAparelho = await countMovements();

  const arquivo = join(pasta, 'copia.db');
  const feita = await gravarCopia(arquivo, nowIso());
  assert.ok(existsSync(arquivo), 'a cópia existe no disco');
  assert.ok(feita.bytes > 0, 'a cópia tem tamanho');
  assert.equal(feita.versaoDoEsquema, schemaVersion, 'a cópia carrega a versão do esquema');
  /**
   * A cópia levou TODOS os movimentos — e a asserção é igualdade, não "maior que zero".
   *
   * Estava `assert.ok(feita.movimentos > 0, 'a cópia levou os movimentos')`, com a
   * frase certa ao lado de uma checagem que qualquer número positivo satisfaz: uma
   * cópia que levasse um movimento de mil passaria verde. Nesta peça isso é o pior
   * defeito possível — o prejuízo de um backup incompleto não tem estorno, e ele só
   * aparece no dia em que alguém precisa dele.
   */
  assert.equal(feita.movimentos, totalNoAparelho, 'a cópia levou TODOS os movimentos');

  // O estrago: mais uma compra depois da cópia. Ela NÃO pode sobreviver à volta,
  // senão a restauração é uma mistura e não uma volta.
  await recordPurchase(EMPRESA_SEMENTE, {
    itemId: acucar,
    purchaseQuantity: 99,
    baseUnits: 1_000_000,
    totalCents: fromDecimal(9999),
  });
  assert.ok((await itemMovements(EMPRESA_SEMENTE, acucar)).length > antes, 'o estrago entrou');

  const volta = await restaurar(arquivo);
  assert.ok(volta.tabelas > 10, `a volta tocou as tabelas da fábrica (${volta.tabelas})`);
  assert.equal(
    (await itemMovements(EMPRESA_SEMENTE, acucar)).length,
    antes,
    'depois da volta o razão é o da cópia, sem a compra que veio depois',
  );
});

test('an old copy climbs the ladder: columns the copy never had take their default', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const arquivo = join(pasta, 'antiga.db');
  await gravarCopia(arquivo, nowIso());

  // Uma migração futura, encenada: a coluna existe AQUI e não na cópia. Se a
  // restauração usasse as colunas de agora, o INSERT falharia por contagem — e é
  // exatamente o que separa "restaura" de "restaura o que foi feito hoje".
  vivo.exec(`ALTER TABLE items ADD COLUMN futura TEXT DEFAULT 'padrao'`);

  const volta = await restaurar(arquivo);
  assert.ok(volta.linhas > 0, 'voltou linha');

  const linha = vivo.prepare(`SELECT futura FROM items LIMIT 1`).get() as { futura: string | null };
  assert.equal(linha?.futura, 'padrao', 'a coluna nova nasceu com o padrão dela, não nula à força');
});

test('restoring an old copy re-runs the data backfills, or the balance comes back smaller', async () => {
  // O defeito: `restaurar` repõe as linhas dentro do esquema de HOJE e a coluna que a
  // cópia não tinha entra com o padrão dela — nula. O backfill que a teria preenchido
  // rodou uma vez, meses atrás, e a escada não volta a subir porque o esquema já é o
  // atual. Uma cópia de antes da V25 volta com toda câmara fria SEM PAI, e sala sem pai
  // sai do saldo da unidade: o pedido deixa de contar o freezer, e a tela acabou de
  // dizer "restaurado com sucesso".
  await ensureStarterData(EMPRESA_SEMENTE);
  const camara = await savePlace(EMPRESA_SEMENTE, {
    name: 'Câmara fria',
    kind: 'cold_room',
    parentLocationId: EMPRESA_SEMENTE,
  });
  const loja = await savePlace(EMPRESA_SEMENTE, {
    name: 'Loja Centro',
    kind: 'own_store',
    servedByLocationId: EMPRESA_SEMENTE,
  });

  const arquivo = join(pasta, 'antes-da-v25.db');
  await gravarCopia(arquivo, nowIso());

  // A cópia ANTIGA encenada, e ela é fiel: um arquivo gravado antes da V25 não tem a
  // coluna, então a linha volta sem valor. Esvaziar as duas colunas na cópia produz
  // exatamente o que `restaurar` veria.
  const antiga = new DatabaseSync(arquivo);
  antiga.exec(`UPDATE locations SET parent_location_id = NULL, served_by_location_id = NULL`);
  antiga.close();

  await restaurar(arquivo);

  const sala = vivo
    .prepare(`SELECT parent_location_id AS pai FROM locations WHERE id = ?`)
    .get(camara.id) as { pai: string | null };
  assert.equal(
    sala?.pai,
    EMPRESA_SEMENTE,
    'a câmara voltou sem pai: ela sai do saldo da unidade e o pedido deixa de contar o freezer',
  );

  const atendida = vivo
    .prepare(`SELECT served_by_location_id AS quem FROM locations WHERE id = ?`)
    .get(loja.id) as { quem: string | null };
  assert.equal(
    atendida?.quem,
    EMPRESA_SEMENTE,
    'a loja voltou sem quem a atende: com duas unidades as duas passam a ler o mesmo pedido',
  );
});

test('the repairs are conditional: restoring does not overwrite what the factory changed', async () => {
  // A outra metade, e ela é a que impede o conserto de virar defeito. Um reparo roda a
  // QUALQUER momento, então ele tem de reconhecer o que já está preenchido — senão a
  // restauração devolve valores editados ao que eles eram na migração. É por isso que o
  // reparo da taxa de embalagem NÃO é a frase da V18: aquela é incondicional.
  await ensureStarterData(EMPRESA_SEMENTE);
  const arquivo = join(pasta, 'com-taxa.db');

  // Uma taxa editada depois da V18, e o inteiro velho ao lado dela discordando.
  vivo.exec(`UPDATE products SET unit_packaging_rate = 1.5, unit_packaging_cents = 9`);
  await gravarCopia(arquivo, nowIso());
  await restaurar(arquivo);

  const taxa = vivo
    .prepare(`SELECT unit_packaging_rate AS r FROM products LIMIT 1`)
    .get() as { r: number };
  assert.equal(
    taxa?.r,
    1.5,
    'o reparo sobrescreveu a taxa editada com o centavo velho: um reparo incondicional destrói dado',
  );

  // E a sala que está no NÍVEL DA EMPRESA de propósito continua sem pai — o reparo não
  // pode inventar hierarquia onde alguém escolheu não ter.
  const semPai = vivo
    .prepare(`SELECT COUNT(*) AS n FROM locations WHERE kind = 'own_store' AND parent_location_id IS NOT NULL`)
    .get() as { n: number };
  assert.equal(semPai?.n, 0, 'o reparo pôs uma LOJA dentro de uma unidade: as duas relações se misturaram');
});

test('a copy from a newer app is refused, not half-restored', async () => {
  const arquivo = join(pasta, 'do-futuro.db');
  await gravarCopia(arquivo, nowIso());

  // O aparelho de onde ela veio tinha mais migrações que este aplicativo.
  const dela = new DatabaseSync(arquivo);
  dela.exec(`PRAGMA user_version = ${schemaVersion + 5}`);
  dela.close();

  assert.equal(
    await motivoDe(() => lerCopia(arquivo)),
    'maisNovaQueOApp',
    'recusar é a única resposta honesta: o aplicativo velho não conhece o que o novo criou, ' +
      'e restaurar o que ele entende traria a fábrica sem uma parte dela, em silêncio',
  );
  assert.equal(await motivoDe(() => restaurar(arquivo)), 'maisNovaQueOApp', 'e a volta também recusa');
});

test('a file that is not a factory is refused', async () => {
  const estranho = join(pasta, 'outra-coisa.db');
  const d = new DatabaseSync(estranho);
  d.exec('CREATE TABLE fotos(a); INSERT INTO fotos VALUES (1);');
  d.close();
  assert.equal(await motivoDe(() => lerCopia(estranho)), 'naoEhCopiaNossa');

  const truncado = join(pasta, 'truncado.db');
  writeFileSync(truncado, 'isto nao e um banco');
  assert.equal(await motivoDe(() => lerCopia(truncado)), 'ilegivel');
});

test('the copy says when it was made, because the file date does not survive the trip', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const arquivo = join(pasta, 'selada.db');
  const quando = '2026-09-04T11:20:00.000Z';
  await gravarCopia(arquivo, quando);

  const lida = await lerCopia(arquivo);
  assert.equal(lida.feitoEm, quando, 'o selo viaja dentro da cópia — WhatsApp e Drive reescrevem a data do arquivo');
  // Igualdade contra o aparelho vivo, pelo mesmo motivo da linha lá embaixo: `> 0` deixa
  // passar uma leitura que enxergue 1 item de 7, e a mensagem afirma que ela CONTA os itens.
  const noAparelho =
    (await (await db()).getFirstAsync<{ c: number }>(`SELECT count(*) c FROM items`))?.c ?? 0;
  assert.ok(noAparelho > 0, 'a fábrica de partida tem itens — senão a comparação é de graça');
  assert.equal(
    lida.itens,
    noAparelho,
    `a leitura da cópia conta ${lida.itens} itens e o aparelho tem ${noAparelho}`,
  );
  assert.ok(lida.tabelasEmComum > 10, 'a cópia e o aplicativo falam da mesma fábrica');
});

/**
 * A guarda que impede a doença conhecida deste repositório um nível acima.
 *
 * A coluna sem escritor apareceu três vezes em setembro. A **tabela sem
 * restaurador** seria a mesma coisa com consequência pior: a fábrica voltaria
 * quase inteira, o que parece certo. Por isso a lista de tabelas é lida do
 * `sqlite_master` e não escrita à mão — e este teste é o que cobra isso, porque
 * uma migração futura que crie tabela nova tem de entrar coberta sem ninguém
 * lembrar do `backup.ts`.
 */
test('no table is forgotten: everything the schema has is either restored or emptied', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const arquivo = join(pasta, 'inteira.db');
  await gravarCopia(arquivo, nowIso());

  const todas = vivo
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all()
    .map((r) => (r as { name: string }).name);
  assert.ok(todas.length > 15, `o esquema tem tabelas de sobra para esquecer alguma (${todas.length})`);

  // Uma tabela que existe AQUI e não na cópia. Ela tem de ficar VAZIA e não
  // intacta: sobrar um pedaço do estado antigo grudado na fábrica restaurada é o
  // pior resultado possível, porque parece certo.
  // A contagem de partida, tirada antes de qualquer coisa mexer: é ela que dá o número
  // contra o qual a volta se compara.
  const antesDeRestaurar = (vivo.prepare(`SELECT count(*) c FROM items`).get() as { c: number }).c;
  vivo.exec(`CREATE TABLE recem_criada (id TEXT PRIMARY KEY)`);
  vivo.exec(`INSERT INTO recem_criada (id) VALUES ('do estado antigo')`);

  await restaurar(arquivo);

  const sobrou = vivo.prepare(`SELECT count(*) c FROM recem_criada`).get() as { c: number };
  assert.equal(
    sobrou.c,
    0,
    'tabela que a cópia não conhece fica vazia, nunca intacta — restauração é volta, não mistura',
  );

  /**
   * **Igualdade contra o que havia ANTES, não `> 0` — cicatriz de 11 de setembro.**
   *
   * Estava `assert.ok(naVolta.c > 0, 'e o que a cópia conhece voltou')`, e a mensagem afirma
   * que o conteúdo VOLTOU. Uma restauração que trouxesse 1 item de 7 passava verde — e este
   * arquivo já tinha consertado exatamente isso duzentas linhas acima, na contagem de
   * movimentos, com a razão escrita: *"uma cópia que levasse um movimento de mil passaria
   * verde"*. O conserto passou ao lado da linha irmã.
   *
   * A segunda fonte é a contagem tirada ANTES de restaurar: outro instante, mesma pergunta.
   */
  const naVolta = vivo.prepare(`SELECT count(*) c FROM items`).get() as { c: number };
  assert.ok(antesDeRestaurar > 0, 'a fábrica de partida tem itens — senão a volta é de graça');
  assert.equal(
    naVolta.c,
    antesDeRestaurar,
    `a cópia devolveu ${naVolta.c} itens e o aparelho tinha ${antesDeRestaurar}: ` +
      'restauração é volta INTEIRA, e trazer parte passaria por "voltou"',
  );
});

/**
 * Desligar a checagem de referência para poder escrever não é desistir dela.
 *
 * Sem o `foreign_key_check` no fim, a restauração entregaria uma fábrica com
 * órfãos e chamaria isso de sucesso — que é o modo de falhar mais caro que uma
 * cópia tem, porque o dono acredita que voltou.
 */
test('a copy with broken references is refused and nothing changed', async () => {
  await ensureStarterData(EMPRESA_SEMENTE);
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.kind === 'input')!.id;
  await recordPurchase(EMPRESA_SEMENTE, {
    itemId: acucar,
    purchaseQuantity: 4,
    baseUnits: 100_000,
    totalCents: fromDecimal(472),
  });
  const arquivo = join(pasta, 'furada.db');
  await gravarCopia(arquivo, nowIso());

  // A cópia é adulterada: um movimento aponta para um item que não existe nela.
  const dela = new DatabaseSync(arquivo);
  dela.exec(`PRAGMA foreign_keys = OFF`);
  dela.exec(`UPDATE movements SET item_id = 'item-que-nao-existe'`);
  dela.close();

  const antesDaVolta = vivo.prepare(`SELECT count(*) c FROM movements`).get() as { c: number };
  assert.equal(
    await motivoDe(() => restaurar(arquivo)),
    'referenciasQuebradas',
    'a volta recusa em vez de entregar órfãos',
  );
  assert.equal(
    (vivo.prepare(`SELECT count(*) c FROM movements`).get() as { c: number }).c,
    antesDaVolta.c,
    'e a transação foi desfeita: o aparelho está como estava, não vazio',
  );
});

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { CHAVE_DA_EMPRESA, EMPRESA_SEMENTE, carregarEmpresa } from '@/data/empresa';
import { writeMeta } from '@/data/meta';
import { db } from '@/data/db';
import { enqueue, pendingCount, pendingEntries, rejectedEntries } from '@/data/outbox';
import { fromDecimal } from '@/domain/money';
import { recordPurchase, saveItem } from '@/data/repository';
import { drain } from './engine';
import { APENAS_INSERE, type ServerTable } from './serialize';
import { transporte, type Casa } from './transporte';

/**
 * O transporte — a peça que faz uma linha sair do aparelho.
 *
 * **O que estes testes protegem não é a chamada HTTP**, que só um servidor de verdade
 * exercita. É o que decide se a fila anda ou trava: a ORDEM (a fila é escrita em
 * ordem de dependência, e mandar fora de ordem é chave estrangeira recusada), o
 * PARAR no primeiro erro (continuar transforma uma recusa em muitas), e o que sobe
 * como INSERÇÃO em vez de correção (onde o servidor não tem política de update,
 * pedir update é `permission denied` sem dizer qual das duas falta).
 */
const CO = 'e5a1c3d9-77b2-4c10-9a44-000000000abc';

function ligar(): Db {
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
      } catch (erro) {
        sqlite.exec('ROLLBACK');
        throw erro;
      }
    },
  };
}

/**
 * Uma casa de mentira que anota o que recebeu, na ordem, e pode recusar.
 *
 * **Ela conta CHAMADAS, não linhas gravadas — e a diferença é o que faz o teste
 * morder.** A primeira versão recusava quando `recebido.length` chegava a N: com o
 * `break` trocado por `continue`, a entrada recusada não entrava em `recebido`, a
 * condição continuava verdadeira, e todas as seguintes eram recusadas também — o
 * `recebido` parava em 1 dos dois jeitos e o teste passava verde sobre um transporte
 * que teimava depois de uma recusa. Foi o teste de mordida que contou.
 */
function casaDeMentira(
  recusarNa?: number,
  /** O `SQLSTATE` da recusa. Ausente é falha sem código — rede, cliente —, que é passageira. */
  codigo: string | null = null,
): Casa & {
  recebido: { tabela: ServerTable; apenasInsere: boolean; id: unknown }[];
  chamadas: number;
} {
  const casa = {
    recebido: [] as { tabela: ServerTable; apenasInsere: boolean; id: unknown }[],
    chamadas: 0,
    escrever: async (tabela: ServerTable, linha: Record<string, unknown>, apenasInsere: boolean) => {
      const daVez = casa.chamadas;
      casa.chamadas += 1;
      if (recusarNa !== undefined && daVez === recusarNa) {
        return { codigo, mensagem: 'o servidor recusou esta linha' };
      }
      casa.recebido.push({ tabela, apenasInsere, id: linha.id });
      return null;
    },
    // Este dublê é da SUBIDA. `ler` existe para satisfazer o tipo e devolve página vazia:
    // um dublê que jogasse exceção aqui esconderia, atrás de um erro, o fato simples de que
    // nenhum teste de subida desce coisa nenhuma.
    ler: async () => ({ linhas: [] }),
  };
  return casa;
}

/** Uma fábrica pequena: um insumo e uma compra, que é o menor ato com duas linhas. */
async function umDiaDeFabrica(): Promise<void> {
  const acucar = await saveItem(CO, {
    kind: 'input',
    name: 'Açúcar',
    purchaseUnit: 'saco',
    purchaseToBase: 50_000,
    baseUnit: 'g',
    packaging: { tiers: [{ id: 'unit', perBaseUnit: 1 }] },
  });
  await recordPurchase(CO, {
    itemId: acucar,
    purchaseQuantity: 1,
    baseUnits: 50_000,
    totalCents: fromDecimal(200),
  });
}

beforeEach(async () => {
  const conn = ligar();
  await migrate(conn);
  __setDb(conn);
  await writeMeta(CHAVE_DA_EMPRESA, CO);
  await carregarEmpresa();
});

test('a fila sobe na ordem em que a fábrica gravou, e o razão sobe como inserção', async () => {
  await umDiaDeFabrica();
  const antes = await pendingEntries(100);
  assert.ok(antes.length >= 3, `a fila desta fábrica tem de ter linhas: ${antes.length}`);

  const casa = casaDeMentira();
  const relatorio = await drain(transporte({ userId: 'conta-1' , companyId: EMPRESA_SEMENTE }, casa));

  assert.equal(relatorio.remaining, 0, 'tudo subiu');
  assert.equal(relatorio.sent, antes.length);

  // A ORDEM: exatamente a da fila, entrada por entrada. Não é "as mesmas linhas em
  // qualquer ordem" — mandar o movimento antes do item é chave estrangeira recusada.
  const idsDaFila = antes.map((e) => e.rowId);
  const idsQueSubiram = casa.recebido.map((r) => r.id);
  assert.deepEqual(
    idsQueSubiram.filter((id) => idsDaFila.includes(id as string)),
    idsDaFila.filter((id) => idsQueSubiram.includes(id)),
    'a ordem de subida tem de ser a ordem da fila',
  );

  // E o que o servidor não deixa corrigir sobe como inserção só.
  for (const { tabela, apenasInsere } of casa.recebido) {
    assert.equal(
      apenasInsere,
      (APENAS_INSERE as readonly string[]).includes(tabela),
      `${tabela} subiu com a permissão errada: pedir update onde o servidor não tem política é "permission denied"`,
    );
  }
  const razao = casa.recebido.filter((r) => r.tabela === 'movements');
  assert.ok(razao.length > 0, 'a compra grava movimento — senão esta asserção é de graça');
  assert.ok(razao.every((r) => r.apenasInsere));
});

test('uma recusa para a fila ali, e o que não subiu fica inteiro', async () => {
  await umDiaDeFabrica();
  const antes = await pendingCount();

  // Recusa na SEGUNDA linha: a primeira sobe, a segunda para, e o resto nem tenta.
  const casa = casaDeMentira(1);
  const relatorio = await drain(transporte({ userId: 'conta-1' , companyId: EMPRESA_SEMENTE }, casa), { maxAttempts: 1 });

  assert.equal(casa.recebido.length, 1, 'só a primeira foi guardada');
  assert.equal(
    casa.chamadas,
    2,
    'e ele TENTOU duas vezes e parou: a terceira entrada nem foi oferecida ao servidor — ' +
      'continuar mandaria linhas cujos pais o servidor não tem',
  );
  assert.equal(relatorio.sent, 1, 'só a que o servidor guardou conta como enviada');
  assert.equal(
    relatorio.remaining,
    antes - 1,
    'o resto continua na fila, inteiro — falha é atraso, não perda',
  );
});

test('sem empresa adotada nada sai, mesmo com casa e com fila cheia', async () => {
  await umDiaDeFabrica();
  const conn = ligar();
  void conn;
  const banco = await (await import('@/data/db')).db();
  await banco.runAsync(`DELETE FROM app_meta WHERE key = ?`, [CHAVE_DA_EMPRESA]);
  await carregarEmpresa();

  const casa = casaDeMentira();
  const relatorio = await drain(transporte({ userId: 'conta-1' , companyId: EMPRESA_SEMENTE }, casa));

  assert.equal(casa.recebido.length, 0, 'nem uma linha: o carimbo delas é a semente');
  assert.equal(relatorio.recusa, 'semEmpresa');
  assert.ok((await pendingCount()) > 0, 'e a fila continua onde estava');
});

test('sem casa nenhuma o transporte não aceita nada — e não perde nada', async () => {
  await umDiaDeFabrica();
  const antes = await pendingCount();
  const relatorio = await drain(transporte({ userId: 'conta-1' , companyId: EMPRESA_SEMENTE }, null), { maxAttempts: 1 });
  assert.equal(relatorio.sent, 0);
  assert.equal(await pendingCount(), antes);
});

test('a trava da empresa é do transporte também, e não só do motor', async () => {
  /**
   * **Cinto e suspensório, e o teste tem de provar os dois separados.** O motor
   * recusa antes de chamar o transporte, então um teste que passe pelo `drain` não
   * distingue quem recusou: arrancar a trava daqui deixava a suíte verde. Este
   * exercita o `push` direto, que é como um chamador futuro (uma tela nova, um
   * agendador) vai chegar aqui.
   */
  await umDiaDeFabrica();
  const fila = await pendingEntries(100);
  assert.ok(fila.length > 0, 'sem fila esta asserção seria de graça');

  const conn = await (await import('@/data/db')).db();
  await conn.runAsync(`DELETE FROM app_meta WHERE key = ?`, [CHAVE_DA_EMPRESA]);
  await carregarEmpresa();

  const casa = casaDeMentira();
  const resultado = await transporte({ userId: 'conta-1' , companyId: EMPRESA_SEMENTE }, casa).push(fila);

  assert.deepEqual(resultado.acceptedIds, [], 'sem empresa adotada ele não aceita nada');
  assert.equal(casa.chamadas, 0, 'e não fala com o servidor nem uma vez');
});

/**
 * Exceção no meio da fatia não apaga o que o servidor já guardou.
 *
 * `linhaDaFila` lança quando a linha sumiu do aparelho — apagada por um Reset, por
 * uma restauração, por uma faxina. Sem `try`, a exceção sobe até o `catch` do motor,
 * que não marca NADA: tudo o que o servidor acabou de aceitar volta a parecer
 * pendente, e a corrida seguinte bate na mesma parede no mesmo lugar, com a mensagem
 * do programador chegando em inglês à tela do dono.
 *
 * A asserção é o par: o que passou antes do buraco volta aceito, e nada depois dele
 * foi mandado.
 */
test('a linha que sumiu para a fatia, e o que já subiu continua subido', async () => {
  await umDiaDeFabrica();
  const fila = await pendingEntries(100);
  assert.ok(fila.length >= 2, `a fila precisa ter antes e depois: ${fila.length}`);

  // Uma entrada que `serialize` recusa, no MEIO da fatia: tabela que este aplicativo
  // não conhece é o que uma fila escrita por uma versão mais nova produz.
  const podre = {
    id: 'entrada-podre',
    table: 'tabela_que_nao_existe',
    rowId: 'x1',
    op: 'upsert' as const,
    payload: {},
    queuedAt: '2026-09-09T10:00:00.000Z',
  };

  const casa = casaDeMentira();
  const r = await transporte({ userId: 'conta-1', companyId: EMPRESA_SEMENTE }, casa).push([
    fila[0],
    podre,
    ...fila.slice(1),
  ]);

  assert.deepEqual(
    r.acceptedIds,
    [fila[0].id],
    'o que passou antes do buraco volta aceito, e nada depois dele foi mandado',
  );
  assert.equal(casa.recebido.length, 1, 'e o servidor recebeu exatamente uma linha');
});

test('a recusa DEFINITIVA sai da frente, e a fila que travava anda', async () => {
  /**
   * A cena inteira, que é a do item da conferência duplicada.
   *
   * Dois celulares na mesma doca, os dois offline, conferem a mesma carga. O primeiro sobe e
   * entra. O segundo sobe e o servidor recusa com `23505` — a `0051`, que existe para o saldo
   * não dobrar. Antes desta rodada era aqui que tudo parava: o motor via "entraram menos do
   * que mandei", chamava de lacuna, tentava de novo, desistia, e **não marcava nada**. Na
   * sincronia seguinte, a mesma parede, com tudo o que o aparelho gravou depois preso atrás.
   *
   * O `23505` é o código que a NOSSA migração escolhe, então esta não é uma suposição sobre
   * um servidor que ninguém exercitou.
   */
  await umDiaDeFabrica();
  const antes = await pendingCount();
  assert.ok(antes >= 3, `a fila precisa de pelo menos três linhas para este caso (tem ${antes})`);

  const casa = casaDeMentira(1, '23505');
  const relatorio = await drain(transporte({ userId: 'conta-1', companyId: EMPRESA_SEMENTE }, casa), {
    maxAttempts: 1,
  });

  assert.equal(relatorio.postasDeLado, 1, 'a recusada definitiva saiu da frente');
  assert.equal(relatorio.sent, 1, 'e ela NÃO conta como enviada: o servidor não a tem');
  assert.equal(
    relatorio.remaining,
    antes - 2,
    'a fila encolheu por duas: uma subiu e a outra saiu da frente — e é isso que a destrava',
  );

  // A prova que importa: a rodada SEGUINTE não bate na mesma parede.
  const casa2 = casaDeMentira();
  const segunda = await drain(transporte({ userId: 'conta-1', companyId: EMPRESA_SEMENTE }, casa2), {
    maxAttempts: 1,
  });
  assert.equal(segunda.remaining, 0, 'o resto da fila subiu inteiro na rodada seguinte');
  assert.equal(segunda.postasDeLado, 0, 'e nada mais precisou sair da frente');
});

test('recusa SEM código conhecido continua travando — e isso é de propósito', async () => {
  /**
   * O caso falso, e ele vale mais que o verdadeiro: é ele que impede o conserto de virar
   * perda de dado.
   *
   * A assimetria é brutal. Tirar da frente uma recusa passageira é dado que nunca chega ao
   * servidor, em silêncio. Deixar travada uma recusa permanente é a fila parada, que é ruim
   * e VISÍVEL. Então todo código desconhecido continua sendo lacuna, e a lista de permanentes
   * é curta de propósito.
   */
  await umDiaDeFabrica();
  const antes = await pendingCount();

  const casa = casaDeMentira(1, '40001'); // deadlock: passageiro de verdade
  const relatorio = await drain(transporte({ userId: 'conta-1', companyId: EMPRESA_SEMENTE }, casa), {
    maxAttempts: 1,
  });

  assert.equal(relatorio.postasDeLado, 0, 'código desconhecido NÃO sai da frente');
  assert.equal(relatorio.remaining, antes - 1, 'e a linha recusada continua na fila, inteira');
  assert.ok(relatorio.error, 'a corrida termina dizendo que parou, como antes');
});

/**
 * A falha do APARELHO não é recusa do servidor — e chamá-la assim travava a fila para sempre.
 *
 * **O defeito, medido em 13 de setembro.** O laço do transporte monta a linha antes de falar
 * com a rede, e isso pode falhar de duas formas que não têm nada a ver com o servidor: a linha
 * sumiu do aparelho (um Reset, uma faxina) ou a tabela não tem travessia (defeito de
 * programação). As duas caíam num `catch { break; }` mudo. O motor recebia "entraram menos do
 * que eu mandei", lia lacuna do servidor, gastava tentativa, esperava e repetia — e nenhuma
 * quantidade de retentativa conserta linha que não existe.
 *
 * O resultado era a fila daquele celular parada, com tudo o que a fábrica gravasse depois
 * preso atrás, e a tela dizendo *"o servidor aceitou N de M registros"* sobre uma linha que o
 * servidor NUNCA VIU. Quem fosse depurar olharia o servidor.
 *
 * **Por que estes dois testes e não um.** São duas classes com consequências diferentes para
 * quem lê a tela: a linha que sumiu é um fato do aparelho e não pede nada de ninguém; a tabela
 * sem travessia pede ATUALIZAR o aplicativo. Um teste só mediria uma e deixaria a outra com a
 * mesma promessa falsa de antes.
 */
test('a linha que sumiu do aparelho sai da frente, e a fila anda', async () => {
  await umDiaDeFabrica();
  const conn = await db();
  // Uma entrada ÓRFÃ: a fila nomeia uma linha que não está no aparelho. É o estado que
  // `forgetOrphans` existe para varrer, então ele acontece de verdade. (Apagar uma linha
  // semeada não serve: chave estrangeira recusa, e o teste mediria o SQLite.)
  await enqueue(conn, [{ table: 'items', rowId: 'linha-que-nao-existe' }]);
  const orfa = (await pendingEntries(200)).find((e) => e.rowId === 'linha-que-nao-existe');
  assert.ok(orfa, 'a entrada órfã está na fila');

  const casa = casaDeMentira();
  const relatorio = await drain(transporte({ userId: 'conta-1', companyId: EMPRESA_SEMENTE }, casa), {
    batchSize: 500,
    maxAttempts: 3,
    sleep: async () => {},
  });

  assert.equal(
    relatorio.attempts,
    1,
    'UMA tentativa: antes a falha local virava lacuna e a corrida queimava as três esperando ' +
      'que o servidor mudasse de ideia sobre uma linha que ele nunca recebeu',
  );
  assert.equal(relatorio.postasDeLado, 1, 'a entrada órfã sai da frente');
  assert.equal(await pendingCount(), 0, 'e a fila anda: nada fica preso atrás dela');

  const deLado = await rejectedEntries();
  const dela = deLado.find((e) => e.id === orfa.id);
  assert.ok(dela, 'ela fica no aparelho, visível, em vez de ser apagada');
  assert.equal(
    dela.local,
    'linhaSumiu',
    'e o registro diz que quem impediu foi o APARELHO: sem isto a tela explicaria "o servidor ' +
      'já tinha este registro" sobre uma linha que ele nunca viu',
  );
  assert.equal(dela.codigo, null, 'sem código, porque não houve Postgres nenhum');
});

test('a tabela sem travessia sai da frente, e o registro diz que é do aparelho', async () => {
  await umDiaDeFabrica();
  const conn = await db();
  // O que uma versão do aplicativo vê quando alguém acrescenta tabela nova ao aparelho e
  // esquece a travessia — o que aconteceu de verdade com `check_candidates` na rodada 14.
  await enqueue(conn, [{ table: 'tabela_que_ninguem_ensinou', rowId: 'linha-1' }]);
  const nova = (await pendingEntries(200)).find((e) => e.table === 'tabela_que_ninguem_ensinou');
  assert.ok(nova);

  const casa = casaDeMentira();
  const relatorio = await drain(transporte({ userId: 'conta-1', companyId: EMPRESA_SEMENTE }, casa), {
    batchSize: 500,
    maxAttempts: 3,
    sleep: async () => {},
  });

  assert.equal(relatorio.attempts, 1, 'sem queimar as três tentativas num defeito de código');
  assert.equal(relatorio.postasDeLado, 1, 'sai da frente para o resto da fila andar');
  assert.equal(await pendingCount(), 0, 'e o resto andou');

  const dela = (await rejectedEntries()).find((e) => e.id === nova.id);
  assert.ok(dela);
  assert.equal(
    dela.local,
    'tabelaDesconhecida',
    'esta é a que pede ATUALIZAR o aplicativo, e a tela só sabe dizer isso se a classe chegar',
  );
});

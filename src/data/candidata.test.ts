import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from './db';
import { EMPRESA_SEMENTE, carregarEmpresa } from './empresa';
import {
  candidatarConferencia,
  decidirDisputa,
  disputasAbertas,
  honrarDecisoes,
} from './candidata';
import {
  balanceByLocation,
  defaultLocationId,
  estornarConferenciaLocal,
  listItems,
  recordCheck,
  recordTransfer,
  savePlace,
  undoCheck,
} from './repository';
import { ensureStarterData } from './seed';
import { markRejected, pendingEntries } from './outbox';
import { DESCEM } from '@/sync/descida';
import { serialize, type SyncActor } from '@/sync/serialize';

/**
 * A conferência duplicada, provada pelo SALDO — não pelo que as funções devolvem.
 *
 * Este arquivo existe porque a primeira escrita da rodada tinha quatro defeitos e **nenhum
 * teste**. Os quatro passavam por `typecheck` e `lint` limpos, e três deles falhariam em
 * silêncio no aparelho de quem usa:
 *
 * 1. `candidatarConferencia` lia `movements.recorded_by`, coluna que a V5 REMOVEU — o
 *    `SELECT` quebrava, o `try/catch` do motor da fila engolia, e a candidata nunca era
 *    gravada. A duplicação sumia sem uma palavra, que é exatamente o defeito que a rodada
 *    existe para consertar;
 * 2. `check_candidates` não tinha travessia em `serialize.ts`, e a fila lança
 *    `UnknownTableError` para tabela desconhecida: a primeira duplicação parava a sincronia
 *    daquele celular para SEMPRE;
 * 3. a tabela não descia, então o segundo celular nunca via a disputa — e "os dois celulares
 *    veem" é metade da decisão do dono;
 * 4. aceitar mudava uma coluna e não mexia no razão: o saldo continuava dobrado.
 *
 * A lição de método é a da casa, e ela se pagou na hora: **escritor sem exercício é promessa,
 * não código.** Os quatro defeitos moram em quatro arquivos diferentes e o único lugar de onde
 * eles se veem juntos é um teste que anda o caminho inteiro.
 */
const ATOR: SyncActor = {
  userId: '11111111-1111-4111-8111-111111111111',
  companyId: EMPRESA_SEMENTE,
};

function ligar(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const bind = (params: SqlParam[]) => params.map((p) => (p === undefined ? null : p));
  return {
    getAllAsync: async <T>(sql: string, params: SqlParam[] = []) =>
      sqlite.prepare(sql).all(...bind(params)) as T[],
    getFirstAsync: async <T>(sql: string, params: SqlParam[] = []) =>
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

let conexao: Db;

beforeEach(async () => {
  conexao = ligar();
  await migrate(conexao);
  __setDb(conexao);
  await carregarEmpresa();
});

/**
 * Uma remessa conferida com FALTA, que é o instrumento desta suíte.
 *
 * Com "chegou tudo" a diferença é zero, e zero estornado duas vezes continua zero: a
 * aritmética não distingue o conserto do defeito. Faltando 500, cada estorno vale +500 e o
 * saldo denuncia na hora — a mesma razão escrita no teste de desfazer a conferência.
 */
async function cargaConferidaComFalta(): Promise<{
  grupo: string;
  itemId: string;
  lojaId: string;
  conferenciaId: string;
}> {
  await ensureStarterData(EMPRESA_SEMENTE);
  const loja = await savePlace(EMPRESA_SEMENTE, { name: 'Loja da Disputa', kind: 'own_store' });
  const acucar = (await listItems(EMPRESA_SEMENTE)).find((i) => i.name.includes('Açúcar'));
  assert.ok(acucar, 'a semeadura tem açúcar');

  const carga = await recordTransfer(EMPRESA_SEMENTE, {
    itemId: acucar.id,
    fromLocationId: defaultLocationId(EMPRESA_SEMENTE),
    toLocationId: loja.id,
    baseUnits: 6000,
    occurredAt: '2026-09-05T14:00:00.000Z',
  });
  await recordCheck(EMPRESA_SEMENTE, {
    groupId: carga.groupId,
    occurredAt: '2026-09-05T15:00:00.000Z',
    counted: [{ itemId: acucar.id, baseUnits: 5500 }],
  });

  const conferencia = await conexao.getFirstAsync<{ id: string }>(
    `SELECT id FROM movements WHERE movement_group_id = ? AND kind = 'discrepancy'`,
    [carga.groupId],
  );
  assert.ok(conferencia, 'a conferência com falta está no razão');
  return { grupo: carga.groupId, itemId: acucar.id, lojaId: loja.id, conferenciaId: conferencia.id };
}

const naLoja = async (itemId: string, lojaId: string) =>
  (await balanceByLocation(EMPRESA_SEMENTE, itemId)).find((l) => l.locationId === lojaId)
    ?.baseUnits ?? 0;

/** Marca a candidata como CONFIRMADA pelo servidor, que é o que a descida faz. */
async function desceuDoServidor(id: string, resolucao: 'first' | 'second'): Promise<void> {
  await conexao.runAsync(
    `UPDATE check_candidates
        SET resolution = ?, resolved_at = ?, resolved_by = ?, confirmado_em = ?
      WHERE id = ?`,
    [resolucao, '2026-09-05T16:00:00.000Z', ATOR.userId, '2026-09-05T16:00:01.000Z', id],
  );
}

test('a conferência recusada vira candidata — e a espécie errada não vira', async () => {
  const { conferenciaId, grupo } = await cargaConferidaComFalta();

  assert.equal(
    await candidatarConferencia(conferenciaId),
    true,
    'uma conferência de remessa recusada tem de virar candidata: era aqui que o SELECT ' +
      'quebrava por ler recorded_by, e o erro morria no try/catch do motor',
  );
  const guardada = await conexao.getFirstAsync<{
    movement_group_id: string;
    quantity_base_units: number;
  }>(`SELECT movement_group_id, quantity_base_units FROM check_candidates WHERE id = ?`, [
    conferenciaId,
  ]);
  assert.ok(guardada, 'a candidata está gravada, e não só o true de volta');
  assert.equal(guardada.movement_group_id, grupo, 'ela guarda a remessa disputada');
  assert.equal(guardada.quantity_base_units, -500, 'e a diferença que foi contada');

  // O caso FALSO, contra o código de verdade: a perna da transferência tem grupo e não é
  // conferência. Sem esta metade a régua diria "true" para qualquer recusa da fila.
  const transferencia = await conexao.getFirstAsync<{ id: string }>(
    `SELECT id FROM movements WHERE movement_group_id = ? AND kind = 'transfer' LIMIT 1`,
    [grupo],
  );
  assert.ok(transferencia);
  assert.equal(
    await candidatarConferencia(transferencia.id),
    false,
    'e uma perna de transferência não é conferência nenhuma',
  );
  const quantas = await conexao.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM check_candidates`,
  );
  assert.equal(quantas?.n, 1, 'uma candidata, não duas');
});

test('a candidata ATRAVESSA: a fila sabe montar a linha que sobe', async () => {
  const { conferenciaId } = await cargaConferidaComFalta();
  await candidatarConferencia(conferenciaId);

  const fila = await pendingEntries();
  const entrada = fila.find((e) => e.table === 'check_candidates');
  assert.ok(entrada, 'a candidata entra na fila');

  const linha = await conexao.getFirstAsync<Record<string, unknown>>(
    `SELECT * FROM check_candidates WHERE id = ?`,
    [conferenciaId],
  );
  assert.ok(linha);

  // `serialize` LANÇA para tabela que ela não conhece, de propósito. Sem a travessia esta
  // linha derrubava a rodada inteira da sincronia — e era o que acontecia.
  const escrita = serialize(entrada, linha, ATOR);
  assert.equal(escrita.kind, 'upsert', 'ela sobe como upsert, não como comando');
  assert.ok(escrita.kind === 'upsert');
  assert.equal(escrita.row.id, conferenciaId);
  assert.equal(
    escrita.row.recorded_by,
    ATOR.userId,
    'a conta que escreveu vem do ATOR, porque no aparelho a coluna não existe',
  );
  assert.equal(escrita.row.resolution, null, 'e ela nasce sem decisão');
  assert.equal(
    'honrado_em' in escrita.row,
    false,
    'a marca de "este celular já tirou a consequência" não atravessa: mandá-la faria o ' +
      'outro celular pular a dele',
  );
  assert.equal('confirmado_em' in escrita.row, false, 'nem a marca de que a linha desceu');
});

test('a candidata DESCE, e depois do razão', async () => {
  // Sem isto o segundo celular nunca vê a disputa, e "os dois celulares veem" é metade da
  // decisão do dono. A ordem importa: a tela pareia a candidata com a vencedora do razão.
  assert.ok(
    DESCEM.includes('check_candidates'),
    'a candidata do outro celular só chega por aqui',
  );
  assert.ok(
    DESCEM.indexOf('check_candidates') > DESCEM.indexOf('movements'),
    'depois de movements, para a vencedora já estar no disco quando a disputa chegar',
  );
});

test('honrar NÃO age sobre a escolha que este celular apenas pediu', async () => {
  const { conferenciaId, itemId, lojaId } = await cargaConferidaComFalta();
  await candidatarConferencia(conferenciaId);
  const antes = await naLoja(itemId, lojaId);

  // A escolha otimista: a tela responde na hora, o servidor ainda não disse nada.
  await decidirDisputa(conferenciaId, 'first', ATOR.userId);
  assert.deepEqual(await disputasAbertas(EMPRESA_SEMENTE), [], 'a tela para de perguntar');

  assert.equal(
    await honrarDecisoes(EMPRESA_SEMENTE),
    0,
    'e nada é honrado: se o servidor recusar esta escolha, estornar agora desfaria a ' +
      'conferência que a decisão de verdade mandava manter de pé',
  );
  assert.equal(await naLoja(itemId, lojaId), antes, 'o saldo não se mexeu');
});

test('decisão confirmada contra este celular estorna a linha dele, uma vez, sem enfileirar', async () => {
  const { conferenciaId, itemId, lojaId } = await cargaConferidaComFalta();
  await candidatarConferencia(conferenciaId);
  assert.equal(await naLoja(itemId, lojaId), 5500, 'a conferência com falta está contando');

  await desceuDoServidor(conferenciaId, 'first');
  const filaAntes = (await pendingEntries()).length;

  assert.equal(await honrarDecisoes(EMPRESA_SEMENTE), 1, 'uma decisão honrada');
  assert.equal(
    await naLoja(itemId, lojaId),
    6000,
    'a conferência recusada foi estornada e o saldo volta ao que o servidor tem',
  );
  assert.equal(
    (await pendingEntries()).length,
    filaAntes,
    'e o estorno NÃO sobe: o servidor nunca teve a linha que ele desfaz, e mandá-lo pediria ' +
      'que ele estornasse o nada',
  );

  // E de novo, que é o caso que acontece em toda sincronia seguinte.
  assert.equal(await honrarDecisoes(EMPRESA_SEMENTE), 0, 'a segunda volta não honra nada');
  assert.equal(await naLoja(itemId, lojaId), 6000, 'e o saldo não é corrigido duas vezes');
});

test('decisão confirmada A FAVOR deste celular não estorna: ela reenfileira', async () => {
  const { conferenciaId, itemId, lojaId } = await cargaConferidaComFalta();
  await candidatarConferencia(conferenciaId);
  await desceuDoServidor(conferenciaId, 'second');

  assert.equal(await honrarDecisoes(EMPRESA_SEMENTE), 1);
  assert.equal(
    await naLoja(itemId, lojaId),
    5500,
    'a candidata venceu: a conferência deste celular fica de pé',
  );
  const fila = await pendingEntries();
  assert.ok(
    fila.some((e) => e.table === 'movements' && e.rowId === conferenciaId),
    'e ela volta para a fila, porque a que a barrava foi estornada pelo servidor — o que ' +
      'sai de lado não volta sozinho',
  );
});

test('o celular que não tem a linha não estorna nada', async () => {
  // O caso do OUTRO celular: a candidata desceu, a decisão desceu, e o movimento recusado
  // nunca esteve no razão dele. É a posse local que impede o estorno duplo — a pergunta
  // "alguém já estornou?" não tem resposta honesta antes de a descida chegar.
  const { itemId, lojaId } = await cargaConferidaComFalta();
  const forasteira = '99999999-9999-4999-8999-999999999999';
  await conexao.runAsync(
    `INSERT INTO check_candidates (id, company_id, movement_group_id, item_id, occurred_at,
                                  quantity_base_units, recorded_at, resolution, resolved_at,
                                  resolved_by, confirmado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'first', ?, ?, ?)`,
    [
      forasteira,
      EMPRESA_SEMENTE,
      '88888888-8888-4888-8888-888888888888',
      itemId,
      '2026-09-05T15:00:00.000Z',
      -500,
      '2026-09-05T15:00:00.000Z',
      '2026-09-05T16:00:00.000Z',
      ATOR.userId,
      '2026-09-05T16:00:01.000Z',
    ],
  );
  const antes = await naLoja(itemId, lojaId);

  assert.equal(await honrarDecisoes(EMPRESA_SEMENTE), 1, 'ela é marcada como honrada');
  assert.equal(await naLoja(itemId, lojaId), antes, 'e o razão deste celular não se mexe');
});

test('o estorno local não alcança o que não é conferência, nem o que já tem estorno', async () => {
  const { conferenciaId, grupo, itemId, lojaId } = await cargaConferidaComFalta();

  const transferencia = await conexao.getFirstAsync<{ id: string }>(
    `SELECT id FROM movements WHERE movement_group_id = ? AND kind = 'transfer' LIMIT 1`,
    [grupo],
  );
  assert.ok(transferencia);
  assert.equal(
    await estornarConferenciaLocal(EMPRESA_SEMENTE, transferencia.id),
    false,
    'a perna da carga não é conferência: estorná-la faria a remessa desaparecer',
  );

  assert.equal(await estornarConferenciaLocal(EMPRESA_SEMENTE, conferenciaId), true);
  assert.equal(await naLoja(itemId, lojaId), 6000);
  assert.equal(
    await estornarConferenciaLocal(EMPRESA_SEMENTE, conferenciaId),
    false,
    'e a segunda vez não escreve: estorno em cima de estorno dobra a correção',
  );
  assert.equal(await naLoja(itemId, lojaId), 6000, 'o saldo prova que só houve um');
});

/**
 * Desfazer uma conferência que o servidor RECUSOU não enfileira o estorno — e sem isso a fila
 * travava por obediência à tela.
 *
 * **A cadeia inteira, e cada elo existia.** A `0051` recusa a segunda conferência da mesma
 * remessa com `23505`; `classeDaRecusa` a chama de permanente, com razão; a entrada sai da
 * frente e fica no aparelho. A tela então diz, nos três idiomas: *"Esta remessa já foi
 * conferida. Para trocar o que foi contado, desfaça a conferência no extrato e confira de
 * novo."* A pessoa obedece. `undoCheck` escreve um `reversal` apontando para a conferência
 * recusada e o enfileira.
 *
 * No servidor essa conferência **não existe**. `reverses_movement_id` viola chave estrangeira,
 * `23503`, e esse código não está entre os permanentes — o docblock de `src/sync/recusa.ts`
 * explica por quê, e o argumento é *"filho antes do pai não acontece, porque a fila manda na
 * ordem de escrita"*. Certo para a ordem, e cego aqui: o pai não vem depois, ele NÃO VEM NUNCA.
 *
 * Resultado: a fila retenta para sempre um estorno impossível, e tudo o que a fábrica gravar
 * depois fica preso atrás. O aparelho parou de sincronizar porque alguém seguiu a instrução.
 */
test('desfazer a conferência que o servidor recusou não manda o estorno para o servidor', async () => {
  const { conferenciaId, grupo, itemId, lojaId } = await cargaConferidaComFalta();

  // A fila põe a conferência de lado, como o `23505` da 0051 faz.
  const entrada = (await pendingEntries()).find(
    (e) => e.table === 'movements' && e.rowId === conferenciaId,
  );
  assert.ok(entrada, 'a conferência está na fila — senão este teste mede o vazio');
  await markRejected(entrada.id, '23505');

  const filaAntes = (await pendingEntries()).length;

  // A pessoa obedece à tela e desfaz no extrato.
  const feito = await undoCheck(EMPRESA_SEMENTE, { groupId: grupo });
  assert.equal(feito.reversed, 1, 'o estorno foi escrito no razão deste aparelho');
  assert.equal(await naLoja(itemId, lojaId), 6000, 'e o saldo local volta ao que a carga trouxe');

  assert.equal(
    (await pendingEntries()).length,
    filaAntes,
    'e o estorno NÃO entra na fila: o servidor não tem a linha que ele desfaz, então ele seria ' +
      'recusado por chave estrangeira e retentado para sempre, com a fila inteira presa atrás',
  );
});

test('mas o estorno de uma conferência que SUBIU continua subindo', async () => {
  // O caso falso, e sem ele o de cima passaria com um `reverseGroup` que nunca enfileira nada —
  // quebrando toda correção que o servidor precisa saber.
  const { grupo } = await cargaConferidaComFalta();
  const filaAntes = (await pendingEntries()).length;

  const feito = await undoCheck(EMPRESA_SEMENTE, { groupId: grupo });
  assert.equal(feito.reversed, 1);
  assert.equal(
    (await pendingEntries()).length,
    filaAntes + 1,
    'a conferência não foi recusada, então o servidor tem a linha e o estorno tem de chegar lá',
  );
});

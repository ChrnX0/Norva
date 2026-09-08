import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, test } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from './db';
import {
  daqui,
  empurrar,
  puxar,
  type Casa,
  type ConfiguracaoDaEmpresa,
} from './configuracao';
import { setNamesWhoRecorded, setPurchaseSafetyDays } from './repository';

/**
 * A configuração indo e voltando — e o caminho de perda que ninguém veria.
 *
 * **O caso que estes testes existem para pegar:** o dono mexe num interruptor sem
 * rede. A subida falha calada, de propósito. Se a próxima descida escrever o valor
 * velho do servidor, o interruptor volta sozinho e nada aparece na tela. É perda
 * silenciosa de uma escolha — a classe de defeito mais cara deste projeto.
 */
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

/** Uma casa de mentira, que diz se aceita e guarda o que recebeu. */
function casaDeMentira(opcoes: {
  aceita: boolean;
  guardado: Partial<ConfiguracaoDaEmpresa> | null;
}): Casa & { recebido: ConfiguracaoDaEmpresa | null; leituras: number } {
  const casa = {
    recebido: null as ConfiguracaoDaEmpresa | null,
    leituras: 0,
    escrever: async (valores: ConfiguracaoDaEmpresa) => {
      if (!opcoes.aceita) return false;
      casa.recebido = valores;
      return true;
    },
    ler: async () => {
      casa.leituras += 1;
      return opcoes.guardado;
    },
  };
  return casa;
}

beforeEach(async () => {
  const conn = ligar();
  await migrate(conn);
  __setDb(conn);
});

test('o que a casa combinou desce e vale neste aparelho', async () => {
  const casa = casaDeMentira({
    aceita: true,
    guardado: {
      names_who_recorded: true,
      floor_sign_in: 'shared',
      orders_need_approval: true,
      purchase_safety_days: 5,
      // Nulo é a escolha mais conservadora: "nunca destrói no servidor".
      erase_grace_days: null,
    },
  });
  assert.equal(await puxar(casa), true);
  assert.deepEqual(await daqui(), {
    names_who_recorded: true,
    floor_sign_in: 'shared',
    orders_need_approval: true,
    purchase_safety_days: 5,
    erase_grace_days: null,
  });
});

test('interruptor mexido SEM REDE não volta sozinho na próxima descida', async () => {
  // O dono liga "nomear quem registrou" e pede seis dias de folga, offline.
  await setNamesWhoRecorded(true);
  await setPurchaseSafetyDays(6);
  const semRede = casaDeMentira({ aceita: false, guardado: null });
  assert.equal(await empurrar(semRede), false, 'sem rede a subida falha, e cala');

  // A rede volta, mas o servidor ainda tem o valor velho. A descida NÃO pode
  // escrever: primeiro ela conta para a casa o que este aparelho já decidiu.
  const casaVelha = casaDeMentira({
    aceita: true,
    guardado: { names_who_recorded: false, purchase_safety_days: 2 },
  });
  assert.equal(await puxar(casaVelha), true);

  const agora = await daqui();
  assert.equal(agora.names_who_recorded, true, 'a escolha do dono tem de continuar valendo');
  assert.equal(agora.purchase_safety_days, 6, 'e o número dele também');
  assert.equal(
    casaVelha.leituras,
    0,
    'e a descida não acontece na rodada em que quem falou fui eu — a resposta poderia '
      + 'ter sido montada antes da minha escrita',
  );
  assert.deepEqual(
    casaVelha.recebido,
    {
      names_who_recorded: true,
      floor_sign_in: 'personal',
      orders_need_approval: false,
      purchase_safety_days: 6,
      erase_grace_days: 10,
    },
    'a casa tem de ter recebido o que estava pendente, antes de qualquer descida',
  );
});

test('enquanto a subida não passar, a descida não acontece nem é tentada', async () => {
  await setPurchaseSafetyDays(9);
  const semRede = casaDeMentira({ aceita: false, guardado: null });
  await empurrar(semRede);

  const aindaSemRede = casaDeMentira({
    aceita: false,
    guardado: { purchase_safety_days: 2 },
  });
  assert.equal(await puxar(aindaSemRede), false);
  assert.equal(aindaSemRede.leituras, 0, 'nem perguntou: a marca de pendente impede antes');
  assert.equal((await daqui()).purchase_safety_days, 9);
});

test('subida que passou apaga a marca, e a descida seguinte manda de novo', async () => {
  await setPurchaseSafetyDays(4);
  const casa = casaDeMentira({ aceita: true, guardado: { purchase_safety_days: 7 } });
  assert.equal(await empurrar(casa), true);

  // Sem pendência, a casa manda: sete dias vencem os quatro daqui.
  assert.equal(await puxar(casa), true);
  assert.equal((await daqui()).purchase_safety_days, 7, 'sem pendência, quem manda é a casa');
});

test('sem servidor nenhum, as duas dizem não e não mexem em nada', async () => {
  await setPurchaseSafetyDays(3);
  assert.equal(await empurrar(null), false);
  assert.equal(await puxar(null), false);
  assert.equal((await daqui()).purchase_safety_days, 3);
});

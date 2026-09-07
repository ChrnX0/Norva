import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, test } from "node:test";
import { __setDb, db, migrate, type Db, type SqlParam } from "./db";
import {
  CHAVE_DA_EMPRESA,
  EMPRESA_SEMENTE,
  carregarEmpresa,
  empresaDaqui,
} from "./empresa";
import { writeMeta } from "./meta";
import { ensureStarterData } from "./seed";

/**
 * A empresa deste aparelho é fato lido, não linha de código.
 *
 * **O que estes testes protegem é a ORDEM, não a função.** `empresaDaqui()`
 * devolver o que `app_meta` guarda é a parte fácil; o que quebra na fábrica é o
 * boot semear o exemplo ANTES de ler o disco — aí o carimbo sai com a semente
 * num aparelho que já tem empresa, e o servidor recusa a fila inteira sem
 * ninguém entender por quê. Por isso a asserção do segundo teste não é sobre o
 * que a função devolve: é sobre o `company_id` que foi GRAVADO na tabela.
 */
function ligar(): Db {
  const sqlite = new DatabaseSync(":memory:");
  const bind = (params: SqlParam[]) =>
    params.map((p) => (p === undefined ? null : p));
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
      sqlite.exec("BEGIN");
      try {
        await task();
        sqlite.exec("COMMIT");
      } catch (erro) {
        sqlite.exec("ROLLBACK");
        throw erro;
      }
    },
  };
}

beforeEach(async () => {
  const conn = ligar();
  await migrate(conn);
  __setDb(conn);
  // Instalação nova: o disco não tem empresa, então a memória volta para a semente.
  await carregarEmpresa();
});

test("instalação nova responde a semente, e não um vazio", async () => {
  assert.equal(empresaDaqui(), EMPRESA_SEMENTE);
  assert.match(
    empresaDaqui(),
    /^[0-9a-f-]{36}$/,
    "a semente tem de ser um uuid de verdade",
  );
});

test("a empresa guardada no disco vence a semente — e é ela que carimba o que o boot escreve", async () => {
  const daEmpresa = "9f1c7a52-3d44-4b6e-8a10-000000000abc";
  await writeMeta(CHAVE_DA_EMPRESA, daEmpresa);
  assert.equal(
    empresaDaqui(),
    EMPRESA_SEMENTE,
    "escrever no disco não muda a memória sozinho",
  );

  assert.equal(await carregarEmpresa(), daEmpresa);
  assert.equal(empresaDaqui(), daEmpresa);

  // A prova que interessa: o exemplo semeado sai carimbado com a empresa do
  // disco. É a segunda fonte, e ela não vem da função testada — vem da tabela.
  await ensureStarterData();
  const conn = await db();
  const linhas = await conn.getAllAsync<{ company_id: string }>(
    `SELECT DISTINCT company_id FROM items`,
  );
  assert.deepEqual(
    linhas.map((l) => l.company_id),
    [daEmpresa],
    "o exemplo tem de nascer da empresa do disco, não da semente",
  );

  // E o caminho de volta: sem a chave, o aparelho é instalação nova outra vez.
  await conn.runAsync(`DELETE FROM app_meta WHERE key = ?`, [CHAVE_DA_EMPRESA]);
  assert.equal(await carregarEmpresa(), EMPRESA_SEMENTE);
});

test("espaço em branco guardado não vira empresa", async () => {
  await writeMeta(CHAVE_DA_EMPRESA, "   ");
  assert.equal(
    await carregarEmpresa(),
    EMPRESA_SEMENTE,
    "chave em branco é o mesmo que não ter",
  );
});

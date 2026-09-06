import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, before } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { CROSSINGS_FOR_TESTS_ONLY } from './serialize';

/**
 * Toda coluna do aparelho ou atravessa, ou está escrita como sendo só daqui.
 *
 * A cicatriz é de hoje e é minha: `items.full_level` — a régua das faixas de cor
 * que o dono digita — ficou fora do serializador. A coluna existia no aparelho, a
 * tela escrevia nela, o teste do repositório provava que ela persistia, e ela
 * simplesmente nunca chegaria ao servidor. Um celular novo da mesma fábrica
 * abriria sem faixa nenhuma, e ninguém saberia por quê.
 *
 * O guard da sessão do aparelho cobra TABELA sem escritor. Este cobra COLUNA sem
 * travessia, que é um andar abaixo e foi o andar onde o defeito estava.
 *
 * Registro em vez de heurística, pelo mesmo motivo do `law.test.ts`: existem
 * colunas que legitimamente não sobem, e a diferença entre "não sobe porque é do
 * aparelho" e "não sobe porque alguém esqueceu" não está no nome dela — está numa
 * decisão, que aqui fica escrita.
 */

/** O que fica no aparelho, e por quê. Cada linha é uma decisão, não um esquecimento. */
const SO_DO_APARELHO: Record<string, Record<string, string>> = {
  items: {
    // Derivado, e o servidor tem o dele: o aparelho calcula média local porque
    // precisa mostrar custo sem sinal, e mandar a cópia daria dois autores ao
    // mesmo número.
    // (nenhuma hoje — a lista existe para o dia em que houver)
  },
  movements: {
    // O servidor estampa o autor a partir da sessão autenticada, e é ele quem
    // manda: `recorded_by` vindo do aparelho seria assinatura cedível.
    recorded_by: 'o servidor estampa a partir da sessão; vindo do aparelho seria cedível',
  },
  readings: {
    recorded_by: 'o servidor estampa a partir da sessão; vindo do aparelho seria cedível',
  },
  purchases: {
    created_by: 'o servidor estampa a partir da sessão',
  },
  purchase_lines: {
    // O servidor NÃO tem esta coluna: a linha de compra herda a hora da nota, e a
    // pergunta que interessa ali é "pedido contra recebido", que mora em
    // `purchases.ordered_at` e `received_at`. Mandar seria a fila ser recusada.
    created_at: 'o servidor não tem a coluna; a hora que interessa é a da nota',
  },
  orders: {
    recorded_by: 'o servidor estampa a partir da sessão',
  },
  products: {
    // DORMENTE, e por isso não atravessa: quem manda agora é
    // `unit_packaging_rate`, que é o mesmo número sem o arredondamento que
    // transformava rótulo abaixo de meio centavo em zero (migração V18 /
    // servidor 0033). A coluna antiga fica porque migração é append-only nos
    // dois lados — apagá-la faria o banco divergir de qualquer aparelho que já
    // rodou a V13 —, e mandá-la seria dar dois autores ao mesmo número.
    unit_packaging_cents: 'dormente desde a V18; quem atravessa é unit_packaging_rate',
  },
};

let conn: Db;

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
  conn = inMemoryDb();
  await migrate(conn);
  __setDb(conn);
});

test('every device column either crosses to the server or says why it stays', async () => {
  const faltando: string[] = [];

  for (const [table, crossing] of Object.entries(CROSSINGS_FOR_TESTS_ONLY())) {
    // `erase` e os derivados não são tabelas do aparelho: são comandos e
    // decisões de não enviar, já explicadas no serializador.
    const colunas = await conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (colunas.length === 0) continue;

    const enviadas = new Set<string>(crossing.take ?? []);
    // O `build` acrescenta colunas convertidas ou estampadas, e o jeito honesto de
    // saber QUAIS é chamá-lo: uma lista escrita à mão ao lado dele seria a mesma
    // lista à mão que já deixou uma pasta fora da checagem de camadas.
    for (const nome of Object.keys(crossing.build?.({}, { userId: 'x' }) ?? {})) {
      enviadas.add(nome);
    }

    const declaradas = SO_DO_APARELHO[table] ?? {};

    for (const { name } of colunas) {
      if (enviadas.has(name)) continue;
      if (declaradas[name]) continue;
      faltando.push(`${table}.${name}`);
    }
  }

  assert.deepEqual(
    faltando,
    [],
    `estas colunas não atravessam e não estão declaradas como só do aparelho: ${faltando.join(', ')}. ` +
      'Ou acrescente a coluna ao `take`/`build` do serializador, ou escreva em SO_DO_APARELHO por que ' +
      'ela fica aqui. O defeito que este caso existe para pegar é silencioso: a tela escreve, o teste ' +
      'do repositório passa, e o dado nunca chega ao servidor.',
  );
});


/**
 * O nome do `take` existe MESMO na tabela do aparelho.
 *
 * O guarda acima cobra uma direção — coluna do aparelho que não atravessa. Esta
 * é a outra, e o defeito dela apareceu em 6 de setembro numa medição de rotina:
 * `movements.device_id` está na lista de colunas que viajam e **não existe no
 * banco do aparelho**. Nenhum `ALTER TABLE` a cria.
 *
 * O que acontece então é o pior tipo de defeito silencioso: o `nullable()` do
 * serializador transforma chave ausente em `null`, a linha sobe válida, e o
 * servidor guarda `device_id` nulo para sempre. Nada falha. A coluna existe nos
 * dois lados, atravessa a sincronia, e carrega nada — e a resposta de "qual
 * aparelho gravou isto?" nasce vazia sem ninguém saber.
 *
 * A direção contrária tinha guarda porque o defeito dela já tinha acontecido. Esta
 * não tinha porque o defeito ainda não tinha sido encontrado — e é exatamente por
 * isso que ela entra agora, com o caso conhecido registrado.
 */
const PROMETIDA_E_AUSENTE: Record<string, Record<string, string>> = {
  movements: {
    device_id:
      'a coluna existe no servidor (0013) e o aparelho ainda não sabe qual aparelho ele é — o comentário do serializador diz isso. Entra no banco local quando houver matrícula de aparelho, que é a peça que precisa do servidor',
  },
};

test('every column the serializer promises to send exists on the device', async () => {
  const inventadas: string[] = [];
  const registroVelho: string[] = [];

  for (const [table, crossing] of Object.entries(CROSSINGS_FOR_TESTS_ONLY())) {
    const colunas = await conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (colunas.length === 0) continue;
    const existem = new Set(colunas.map((c) => c.name));

    for (const nome of crossing.take ?? []) {
      const registrada = PROMETIDA_E_AUSENTE[table]?.[nome];
      if (!existem.has(nome)) {
        if (!registrada) inventadas.push(`${table}.${nome}`);
      } else if (registrada) {
        registroVelho.push(`${table}.${nome}`);
      }
    }
  }

  assert.deepEqual(
    inventadas,
    [],
    `o serializador promete mandar ${inventadas.join(' · ')}, e a coluna não existe no ` +
      'aparelho. Ela viaja como `null` para sempre e nada falha — crie a coluna, tire o ' +
      'nome da lista, ou registre a fronteira dizendo quando ela vai existir.',
  );
  assert.deepEqual(
    registroVelho,
    [],
    `${registroVelho.join(' · ')} passou a existir no aparelho e continua na lista de ` +
      'ausentes. Tire a linha: registro que virou mentira é pior que registro nenhum.',
  );
});


/**
 * A TERCEIRA direção: coluna do servidor com a regra escrita, que o aparelho
 * nunca criou.
 *
 * As duas guardas acima cobrem o aparelho como origem — coluna daqui que não
 * atravessa, e nome prometido que não existe aqui. Nenhuma das duas olha para o
 * lado de lá, e o defeito dessa direção foi medido em 6 de setembro no estudo do
 * extrato: **`purchase_lines.expected_base_units` tem `comment on column` na
 * `0002_recipes.sql:61` e não existe no aparelho.** Junto com ela, `purchases`
 * está sem `invoice_number` e sem `freight_cents` — essas duas sem comentário, e
 * por isso fora do alcance desta régua.
 *
 * **Por que `comment on column` é o gatilho, e não "toda coluna do servidor".**
 * O servidor tem colunas que legitimamente não descem, e uma régua que cobrasse
 * todas viraria uma lista de cinquenta dispensas — o que este projeto já chama de
 * decoração. `comment on column` é diferente: é alguém tendo parado para escrever
 * **o que aquela coluna significa**. Regra escrita para valor que nunca chega é a
 * forma mais cara do defeito, porque a documentação garante que o próximo leitor
 * vai acreditar que a coisa funciona.
 *
 * **A medida que justifica a régua:** doze colunas do servidor têm
 * `comment on column`; onze estão no aparelho ou em tabela que ele não tem. **Uma
 * sobra.** Guarda que nasce com uma linha registrada é guarda; com cinquenta,
 * seria enfeite.
 *
 * **E as colunas vêm do banco migrado, não de `grep` no `db.ts`.** A primeira
 * versão desta checagem lia o `CREATE TABLE` com expressão regular e disse que
 * `movements.recorded_by` existe — ela existe no `CREATE TABLE` e a V5 a **derruba**
 * (`ALTER TABLE movements DROP COLUMN recorded_by`). A régua errava no caso que
 * este arquivo inteiro documenta três parágrafos acima. `PRAGMA table_info` contra
 * o banco de verdade não tem como errar isso.
 */
const SO_DO_SERVIDOR: Record<string, Record<string, string>> = {
  purchase_lines: {
    expected_base_units:
      'o quanto a nota dizia, contra o quanto entrou — é a conciliação de compra, e ela é leitura de duas chaves que já existem (movements.id = purchase_lines.id). Desce no commit que desenhar essa tela; hoje não há nada para comparar porque o aparelho não guarda o esperado',
  },
};

test('every server column with a written rule reaches the device, or says why not', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const pasta = 'supabase/migrations';

  /** Onde cada regra foi escrita, para a mensagem poder apontar o arquivo. */
  const comRegra = new Map<string, string>();
  for (const arquivo of readdirSync(pasta).sort()) {
    if (!arquivo.endsWith('.sql')) continue;
    const sql = readFileSync(`${pasta}/${arquivo}`, 'utf8');
    for (const m of sql.matchAll(/comment\s+on\s+column\s+(?:public\.)?(\w+)\.(\w+)\s+is/gi)) {
      comRegra.set(`${m[1]}.${m[2]}`, arquivo);
    }
  }
  assert.ok(
    comRegra.size >= 8,
    `só ${comRegra.size} colunas com regra escrita — a régua estaria medindo quase nada`,
  );

  const semAparelho: string[] = [];
  const registroVelho: string[] = [];

  for (const [alvo, arquivo] of comRegra) {
    const [tabela, coluna] = alvo.split('.');
    // Tabela que o aparelho não tem é outro assunto: a decisão ali é sobre a
    // tabela inteira, não sobre uma coluna dela.
    const colunas = await conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabela})`);
    if (colunas.length === 0) continue;

    const existe = colunas.some((c) => c.name === coluna);
    const registrada = SO_DO_SERVIDOR[tabela]?.[coluna];
    if (!existe && !registrada) semAparelho.push(`${alvo} (${arquivo})`);
    if (existe && registrada) registroVelho.push(alvo);
  }

  assert.deepEqual(
    semAparelho,
    [],
    `${semAparelho.join(' · ')}: o servidor tem a coluna, alguém escreveu o que ela ` +
      'significa num `comment on column`, e o aparelho nunca a criou. Regra escrita para ' +
      'valor que nunca chega é o defeito mais caro da família, porque a documentação faz o ' +
      'próximo leitor acreditar que funciona. Crie a coluna no aparelho, ou registre a ' +
      'fronteira em SO_DO_SERVIDOR dizendo quando ela desce.',
  );
  assert.deepEqual(
    registroVelho,
    [],
    `${registroVelho.join(' · ')} passou a existir no aparelho e continua registrada como ` +
      'só do servidor. Tire a linha: registro que virou mentira é pior que registro nenhum.',
  );
});

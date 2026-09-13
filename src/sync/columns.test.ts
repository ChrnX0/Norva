import assert from 'node:assert/strict';
import { EMPRESA_SEMENTE } from '@/data/empresa';
import { DatabaseSync } from 'node:sqlite';
import { test, before } from 'node:test';
import { __setDb, migrate, type Db, type SqlParam } from '@/data/db';
import { CROSSINGS_FOR_TESTS_ONLY } from './serialize';
import { DESCEM } from './descida';

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
  check_candidates: {
    recorded_by: 'o servidor estampa a partir da sessão; vindo do aparelho seria cedível',
    // As duas marcas do aparelho, e mandá-las seria pior que esquecê-las.
    //
    // `confirmado_em` diz *"esta linha veio do servidor"*, e é ela que impede honrar a
    // escolha OTIMISTA deste celular — o que estornaria o movimento errado quando a
    // arbitragem fosse para o outro lado. Subir e descer a marca faria todo celular achar
    // que a linha dele já foi confirmada.
    confirmado_em: 'marca local de que a linha desceu; subi-la faria toda escolha parecer confirmada',
    // `honrado_em` diz *"ESTE celular já tirou a consequência no razão local"*. Cada aparelho
    // tira a sua uma vez; compartilhar a marca faria o segundo pular a dele e ficar com o
    // saldo dobrado para sempre.
    honrado_em: 'cada aparelho tira a consequência no razão DELE; compartilhar faria o outro pular',
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
    for (const nome of Object.keys(crossing.build?.({}, { userId: 'x' , companyId: EMPRESA_SEMENTE }) ?? {})) {
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
/**
 * **Vazio em 13 de setembro, e isso é o registro fechando por onde ele prometeu.**
 *
 * A única entrada que existia aqui era `movements.device_id`, com a condição de saída
 * escrita: *"entra no banco local quando houver matrícula de aparelho"*. A matrícula existe
 * (passo `V40`), a coluna existe, e a entrada saiu — porque registro que virou mentira é pior
 * que registro nenhum, e é a asserção logo abaixo que cobra isso em vez de depender de
 * alguém lembrar.
 *
 * Fica vazio, e não apagado: a forma é a que recebe a próxima fronteira do mesmo tipo, e o
 * caso conhecido está a um `git log` de distância.
 */
const PROMETIDA_E_AUSENTE: Record<string, Record<string, string>> = {};

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
/**
 * `received_at` é o CURSOR da descida, e ele é do servidor em TODA tabela — uma regra, não
 * vinte e três exceções.
 *
 * Cursor é fato do servidor sobre a chegada, não sobre o fato: `occurred_at` chega fora de
 * ordem de propósito e `recorded_at` vem do aparelho, então nenhum dos dois ordena o que dois
 * celulares mandaram. O aparelho guarda o cursor uma vez por TABELA, no `app_meta`
 * (`src/sync/descida.ts`), e não uma vez por linha: replicá-lo em cada movimento seria guardar
 * vinte mil cópias da mesma informação e, pior, guardar um fato do servidor dentro de uma linha
 * que o aparelho pode ter criado offline, antes de o servidor existir para ela.
 *
 * **Isto é uma regra escrita uma vez, e não um atalho, porque a palavra passou a ter um
 * significado só.** Até a `0065` ela tinha dois: em `purchases` era *quando a mercadoria
 * chegou* — dado de negócio, escrito pelo aparelho — e nas outras era a hora do servidor. A
 * `0065` renomeou a de negócio para `arrived_at` justamente porque duas perguntas na mesma
 * palavra faziam o cursor andar para trás. Com um significado só, dizer a razão vinte e três
 * vezes seria copiar o mesmo parágrafo, e cópia é o que envelhece.
 *
 * A borda: a regra vale para tabela que DESCE. Uma coluna chamada `received_at` numa tabela
 * fora de `DESCEM` não é cursor de nada, e cai na lista de baixo como qualquer outra.
 */
const CURSOR_DA_DESCIDA = 'received_at';

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
    const registrada =
      SO_DO_SERVIDOR[tabela]?.[coluna] ??
      (coluna === CURSOR_DA_DESCIDA && (DESCEM as readonly string[]).includes(tabela)
        ? 'o cursor da descida — ver CURSOR_DA_DESCIDA neste arquivo'
        : undefined);
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

/**
 * O que o servidor exige preenchido, o aparelho também exige — e as três guardas
 * acima não cobriam isto.
 *
 * Elas cobram **presença**: a coluna existe dos dois lados, e quem não atravessa diz por
 * quê. Nenhuma cobra a **obrigatoriedade**. Uma coluna que existe nos dois e é nula no
 * aparelho e `not null` no servidor passa por todas elas — e o defeito que ela produz é
 * o mais caro que esta costura tem: o aparelho grava a linha, a fila a manda, o servidor
 * a recusa por restrição, e `drain` **para na primeira recusa**. Nada na tela, e tudo o
 * que a fábrica gravar depois fica preso atrás dela.
 *
 * **Uma varredura de 9 de setembro não achou nenhuma divergência** — o esquema do
 * aparelho espelha todo `not null` do servidor nas 22 tabelas que a fila empurra. Esta
 * guarda entra assim mesmo, e a razão é a mesma da irmã escrita hoje: onde dois esquemas
 * precisam concordar e os dois são escritos à mão, a guarda é o preço de a concordância
 * não depender de memória. O momento de escrevê-la é aquele em que se acabou de conferir
 * que eles concordam, porque é quando se sabe qual é a comparação certa.
 *
 * **Só as colunas que o aparelho MANDA.** Uma coluna fora da lista de travessia não é
 * enviada, e aí o `default` do servidor responde por ela — exigir `NOT NULL` no aparelho
 * ali seria inventar obrigação. É a diferença entre *"mando nulo"* e *"não mando"*, e
 * só a primeira é recusada.
 */
export function obrigatoriasNoServidor(sql: string): Map<string, Set<string>> {
  // A prosa sai primeiro, pela quinta vez em dois dias: `create table` aparece dentro
  // de comentário explicando migração, e um leitor que não limpa lê a explicação.
  const limpo = sql.replace(/^\s*--.*$/gm, '');
  const porTabela = new Map<string, Set<string>>();
  for (const m of limpo.matchAll(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    const cols = new Set<string>();
    for (const bruta of m[2].split('\n')) {
      const linha = bruta.trim().replace(/,$/, '');
      if (!linha) continue;
      const inicio = linha.toLowerCase().split(/\s+/)[0];
      if (['primary', 'unique', 'constraint', 'check', 'foreign', 'exclude'].includes(inicio)) continue;
      // `default` salva a coluna: o servidor preenche quando ela não vem. O que
      // recusa é mandar NULO numa coluna sem default.
      if (/\bnot null\b/i.test(linha) && !/\bdefault\b/i.test(linha)) cols.add(linha.split(/\s+/)[0]);
    }
    if (cols.size > 0) porTabela.set(m[1], cols);
  }
  for (const m of limpo.matchAll(/alter table (\w+)\s+add column (\w+)([^;]*);/gi)) {
    if (/\bnot null\b/i.test(m[3]) && !/\bdefault\b/i.test(m[3])) {
      const s = porTabela.get(m[1]) ?? new Set<string>();
      s.add(m[2]);
      porTabela.set(m[1], s);
    }
  }
  return porTabela;
}

test('a column the server demands filled is not nullable on the device either', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const sql = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`supabase/migrations/${f}`, 'utf8'))
    .join('\n');

  const exigidas = obrigatoriasNoServidor(sql);
  assert.ok(exigidas.size >= 10, `a derivação achou ${exigidas.size} tabelas com coluna obrigatória`);

  const frouxas: string[] = [];
  let conferidas = 0;
  // `CROSSINGS_FOR_TESTS_ONLY` é uma FUNÇÃO, e a primeira versão iterou o objeto dela:
  // `Object.entries` sobre uma função devolve lista vazia, o laço nunca rodou, e o
  // teste passou de graça. O typecheck aceita — função é objeto. A asserção de
  // presença logo abaixo é o que impede isso de voltar, e ela é a mesma régua que este
  // arquivo já usa três vezes: varredura vazia não é comparação, é silêncio.
  const cruzamentos = Object.entries(CROSSINGS_FOR_TESTS_ONLY());
  assert.ok(cruzamentos.length > 15, `a varredura achou ${cruzamentos.length} travessias`);
  for (const [tabela, cruzamento] of cruzamentos) {
    const doServidor = exigidas.get(tabela);
    if (!doServidor) continue;
    const noAparelho = await conn.getAllAsync<{ name: string; notnull: number }>(
      `PRAGMA table_info(${tabela})`,
    );
    if (noAparelho.length === 0) continue; // tabela que só existe no servidor: outro assunto

    for (const coluna of cruzamento.take) {
      if (!doServidor.has(coluna)) continue;
      const dev = noAparelho.find((c) => c.name === coluna);
      // Coluna que o aparelho não tem já é cobrada pelas guardas de presença.
      if (!dev) continue;
      conferidas += 1;
      if (dev.notnull === 0) {
        frouxas.push(`${tabela}.${coluna}: servidor \`not null\`, aparelho aceita nulo`);
      }
    }
  }

  assert.ok(
    conferidas > 20,
    `só ${conferidas} colunas foram conferidas — a guarda estaria medindo quase nada`,
  );
  assert.deepEqual(
    frouxas,
    [],
    `o aparelho aceita nulo onde o servidor exige valor:\n  ${frouxas.join('\n  ')}\n` +
      'A linha entra aqui, a fila a manda, o servidor a recusa por restrição, e o motor ' +
      'para na primeira recusa — com tudo o que a fábrica gravar depois preso atrás dela.',
  );
});

test('the required-column reader tells a real rule from a default and from prose', () => {
  // Positivo: `not null` sem default é exigência de verdade.
  assert.deepEqual(
    [...(obrigatoriasNoServidor('create table lots (\n  id uuid,\n  code text not null\n);').get('lots') ?? [])],
    ['code'],
  );

  // Negativo 1, e é o que separa "mando nulo" de "não mando": com `default`, o servidor
  // preenche quando a coluna não vem. Exigir NOT NULL no aparelho ali inventaria
  // obrigação, e a guarda viraria ruído no primeiro `created_at`.
  assert.equal(
    obrigatoriasNoServidor("create table lots (\n  created_at timestamptz not null default now()\n);").size,
    0,
  );

  // Negativo 2: linhas de restrição não são colunas.
  assert.equal(
    obrigatoriasNoServidor('create table lots (\n  primary key (id),\n  unique (code)\n);').size,
    0,
  );

  // Negativo 3: a prosa. Um comentário que MOSTRA a forma de uma tabela é explicação,
  // não esquema — e é o quinto detector desta casa a precisar disto em dois dias.
  assert.equal(
    obrigatoriasNoServidor('-- create table velha (\n--   code text not null\n-- );').size,
    0,
    'comentário que desenha a tabela não é a tabela',
  );

  // E o `alter table add column`, que é como quase toda coluna nasce aqui.
  assert.deepEqual(
    [...(obrigatoriasNoServidor('alter table lots add column origin text not null;').get('lots') ?? [])],
    ['origin'],
  );
});

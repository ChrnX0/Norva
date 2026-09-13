/**
 * A escrita do que DESCEU — e ela mora na camada de dados porque fala SQL.
 *
 * `src/sync/descida.ts` decide as REGRAS da descida: a ordem das tabelas, o cursor, o que
 * cada pedido leva. Aqui mora o que toca o banco, e a separação não é cerimônia — é a guarda
 * `only the data layer speaks SQL`, que existe porque uma consulta escrita fora daqui é uma
 * segunda implementação de uma regra que já mora em `src/data`, e as duas divergem na
 * primeira vez que alguém corrige uma delas.
 *
 * *A primeira versão deste código pôs o construtor de SQL em `src/sync`, e a guarda pegou
 * antes de eu empurrar. O conserto certo não era pedir exceção: era mover.*
 */
import { db, nowIso } from './db';
import { APENAS_INSERE, converterNaDescida, type ServerTable } from '@/sync/serialize';

/**
 * O SQL que grava uma linha descida — e as duas formas dizem o que a tabela É.
 *
 * `INSERT OR IGNORE` para o razão: linha que já existe é a MESMA linha, e append-only não se
 * corrige. Reescrevê-la seria reescrever história, que é o que a tranca do banco impede do
 * outro lado.
 *
 * `ON CONFLICT DO UPDATE` para cadastro: o item mudou de nome no outro celular, e a última
 * palavra vence — a mesma regra que a subida já usa.
 *
 * **Nenhuma das duas enfileira, e é aqui que o laço morre.** Uma linha que desceu e fosse
 * enfileirada subiria de volta, o servidor a devolveria, e os dois aparelhos ficariam
 * conversando para sempre sobre a mesma linha.
 */
export function escritaLocal(
  tabela: ServerTable,
  colunas: readonly string[],
  apenasInsere: boolean,
): string {
  const nomes = colunas.join(', ');
  const marcas = colunas.map(() => '?').join(', ');
  if (apenasInsere) return `INSERT OR IGNORE INTO ${tabela} (${nomes}) VALUES (${marcas})`;
  const set = colunas
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  return `INSERT INTO ${tabela} (${nomes}) VALUES (${marcas}) ON CONFLICT(id) DO UPDATE SET ${set}`;
}

/**
 * Grava uma página inteira, ou nenhuma linha dela.
 *
 * A transação é o que torna o cursor honesto: sem ela, uma queda no meio da página deixaria
 * metade gravada e o cursor por avançar — e o avanço seguinte pularia a outra metade, para
 * sempre. Com ela, ou a página inteira entrou e o cursor anda, ou nada entrou e a próxima
 * rodada pede a mesma página.
 *
 * **O que o aparelho não tem, ele não grava — e isto era um defeito, não um cuidado.**
 *
 * `pedido()` deriva as colunas de `colunasQueSobem()`, e a razão escrita lá é boa: a ida e a
 * volta ficam simétricas por construção em vez de por duas listas escritas pela mesma mão. O
 * que ela não viu é que o `take` do serializador é uma promessa sobre o SERVIDOR, e o aparelho
 * pode legitimamente não ter uma daquelas colunas — `movements.device_id` existe no servidor
 * desde a `0013` e não existe aqui, registrado como fronteira em `PROMETIDA_E_AUSENTE`
 * (`src/sync/columns.test.ts`), esperando a matrícula de aparelho.
 *
 * Na SUBIDA isso é inofensivo: a coluna viaja nula. Na DESCIDA o `INSERT` NOMEIA a coluna, e o
 * SQLite responde `table movements has no column named device_id` — a página do razão não
 * entrava, e `descer()` para a rodada inteira no primeiro erro. Ou seja: mesmo com o cursor
 * resolvido, o razão não descia.
 *
 * O filtro lê o esquema DE VERDADE (`PRAGMA table_info`), e não uma lista: lista aqui seria a
 * cópia de `PROMETIDA_E_AUSENTE` divergindo no primeiro passo `V` que criasse a coluna.
 *
 * `received_at` sai pelo mesmo caminho, e por ser o cursor: fato do servidor sobre a chegada,
 * guardado no `app_meta` uma vez por TABELA e não uma vez por linha.
 */

/** As colunas que a tabela local realmente tem, uma leitura por tabela por sessão. */
const colunasLocais = new Map<string, Set<string>>();

async function temColuna(tabela: ServerTable): Promise<Set<string>> {
  const guardadas = colunasLocais.get(tabela);
  if (guardadas) return guardadas;
  const conn = await db();
  const linhas = await conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabela})`);
  const nomes = new Set(linhas.map((l) => l.name));
  colunasLocais.set(tabela, nomes);
  return nomes;
}
/**
 * O que é do APARELHO, obrigatório, e o servidor não tem — preenchido aqui ou a página cai.
 *
 * `purchase_lines.created_at` é `TEXT NOT NULL` sem padrão, e é coluna só daqui: o servidor não a
 * tem, e o `take` do serializador registra isso com a razão (*"a hora que interessa é a da
 * nota"*). Só que a descida NOMEIA as colunas que grava, então a linha entrava sem `created_at` e
 * o SQLite respondia `NOT NULL constraint failed` — a página inteira fora, o cursor parado, e a
 * réplica de compras morta para sempre. Medido em 13 de setembro; ninguém tinha visto porque o
 * único `gravarPagina` exercitado em teste era o de `movements`.
 *
 * O valor é o `received_at` da própria linha, e ele é o significado certo aqui: `created_at` numa
 * linha que desceu é *quando este aparelho soube dela*, e é isso que a hora do servidor diz. A
 * alternativa — `nowIso()` — daria a hora da SINCRONIA, que muda a cada restauração do mesmo
 * banco e faz duas réplicas da mesma nota discordarem sobre quando ela existe.
 *
 * A lista é curta de propósito e a guarda de `src/sync/columns.test.ts` a cobra: toda coluna
 * obrigatória do aparelho numa tabela que desce está nas colunas que descem, ou aqui.
 */
const DO_APARELHO: Partial<Record<ServerTable, (linha: Record<string, unknown>) => Record<string, unknown>>> = {
  purchase_lines: (linha) => ({ created_at: linha.received_at ?? nowIso() }),
};

export async function gravarPagina(
  tabela: ServerTable,
  colunas: readonly string[],
  pagina: readonly Record<string, unknown>[],
): Promise<number> {
  if (pagina.length === 0) return 0;
  const conn = await db();
  const daqui = await temColuna(tabela);
  const doAparelho = DO_APARELHO[tabela];
  const pedidas = doAparelho ? [...colunas, ...Object.keys(doAparelho({}))] : colunas;
  const guardadas = pedidas.filter((c) => c !== 'received_at' && daqui.has(c));
  const sql = escritaLocal(tabela, guardadas, APENAS_INSERE.includes(tabela));
  let gravadas = 0;
  await conn.withTransactionAsync(async () => {
    for (const crua of pagina) {
      /**
       * A conversão é por LINHA e vem antes da escrita: o servidor manda `boolean` para um
       * `INTEGER` e array de JavaScript para um `TEXT`, e o driver do SQLite recusa parâmetro que
       * não é escalar. Pedir a coluna sem converter o valor trocaria uma perda silenciosa por uma
       * parada total — ver `converterNaDescida`.
       */
      const linha = { ...converterNaDescida(tabela, crua), ...(doAparelho?.(crua) ?? {}) };
      await conn.runAsync(
        sql,
        guardadas.map((c) => (linha[c] ?? null) as string | number | null),
      );
      gravadas += 1;
      /**
       * A candidata que desceu ganha a marca de que ESTA linha veio do servidor.
       *
       * É a única marca por tabela deste arquivo, e ela existe porque uma decisão local é
       * OTIMISTA: `decidirDisputa` grava `resolution` na hora para a tela responder, e o
       * servidor pode recusar (alguém decidiu antes). Sem separar as duas, `honrarDecisoes`
       * estornaria pela escolha que este celular PEDIU em vez da que foi DECIDIDA — e quando
       * a decisão de verdade fosse a outra, o movimento estornado seria o que devia ficar de
       * pé. Corrupção de saldo por otimismo, no celular de quem tocou o botão.
       *
       * Dentro da MESMA transação da página, de propósito. Fora dela, uma queda no intervalo
       * deixaria a linha gravada e o cursor adiantado: a marca nunca viria, e aquela decisão
       * jamais seria honrada. O cursor honesto é o que faz a marca honesta.
       */
      if (tabela === 'check_candidates') {
        await conn.runAsync(
          `UPDATE check_candidates SET confirmado_em = ? WHERE id = ?`,
          [nowIso(), String(linha.id)],
        );
      }
    }
  });
  return gravadas;
}

/**
 * Recompõe a média de custo dos itens cujo razão andou na descida.
 *
 * Mora aqui, e não no motor da descida, por causa da guarda `the crossing reads the stored
 * row, never a repository read`: `src/sync` não fala com o repositório, porque a travessia
 * manda o que está GRAVADO e toda leitura do repositório filtra ou arredonda. A guarda pegou
 * a primeira versão disto antes de eu empurrar — e ela estava certa mesmo sendo esta uma
 * ESCRITA e não uma leitura, porque a fronteira que ela guarda é o import, não a direção.
 *
 * Uma vez por item, no fim: cada chamada lê o razão inteiro daquele item, e a resposta certa
 * só existe com todas as páginas no disco.
 */
export async function recomporCustos(empresa: string, itens: Iterable<string>): Promise<void> {
  const { recomputeItemCost } = await import('./repository');
  for (const itemId of itens) await recomputeItemCost(empresa, itemId);
}

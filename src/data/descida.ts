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
import { APENAS_INSERE, type ServerTable } from '@/sync/serialize';

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
 * `received_at` é RETIRADO antes de gravar: ele é o cursor da descida, fato do servidor sobre
 * a chegada, e o aparelho não tem coluna para ele — de propósito (ver `SO_DO_SERVIDOR` em
 * `src/layers.test.ts`). Quem guarda o cursor é o `app_meta`, uma linha por tabela, e não
 * cada linha do razão.
 */
export async function gravarPagina(
  tabela: ServerTable,
  colunas: readonly string[],
  pagina: readonly Record<string, unknown>[],
): Promise<number> {
  if (pagina.length === 0) return 0;
  const conn = await db();
  const guardadas = colunas.filter((c) => c !== 'received_at');
  const sql = escritaLocal(tabela, guardadas, APENAS_INSERE.includes(tabela));
  let gravadas = 0;
  await conn.withTransactionAsync(async () => {
    for (const linha of pagina) {
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

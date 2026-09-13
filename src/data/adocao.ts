import { db, type Db } from './db';
import { CHAVE_DA_EMPRESA, carregarEmpresa, empresaDaqui } from './empresa';
import { exampleStillHere } from './seed';
import { jaFalouComOServidor } from './outbox';
import { CHAVE_DA_UNIDADE, carregarUnidade } from './unidade';

/**
 * Ligar este aparelho a uma empresa de verdade — e reescrever o carimbo do que
 * ele já gravou.
 *
 * **Por que existe.** Até a empresa ser criada no servidor, tudo o que se grava
 * aqui é carimbado com `EMPRESA_SEMENTE` — um id que o servidor não conhece.
 * Quando o dono cria a empresa (ou tem a associação aprovada), o servidor
 * devolve um uuid, e todas as linhas de antes ficam apontando para uma empresa
 * que não existe lá. Subir assim é recusa em bloco: chave estrangeira e
 * política.
 *
 * **Por que isto pode reescrever o livro-razão, que é imutável.** A
 * imutabilidade do razão é imposta por gatilho **no Postgres**
 * (`movements_are_immutable`, migração 0001). O SQLite do aparelho não tem
 * gatilho nenhum — medido, não suposto — e é o mesmo livro antes de ter saído de
 * casa. A janela é essa, e ela FECHA na primeira linha que subir: depois disso o
 * carimbo velho está no servidor e não sai mais, então reescrever aqui criaria
 * dois donos para o mesmo fato. Por isso a primeira recusa é `jaSubiu`.
 *
 * **A camada de dados devolve fato, não frase.** As recusas são códigos; quem
 * escreve português é a tela.
 */
export const MOTIVOS_DA_RECUSA = [
  'idVazio',
  'jaSubiu',
  'exemploAqui',
  'idOcupado',
] as const;

export type MotivoDaRecusa = (typeof MOTIVOS_DA_RECUSA)[number];

export class AdocaoRecusadaError extends Error {
  constructor(readonly motivo: MotivoDaRecusa) {
    super(`adoção recusada: ${motivo}`);
    this.name = 'AdocaoRecusadaError';
  }
}

/**
 * Nome de tabela ou coluna que vai para dentro do SQL.
 *
 * Identificador não se liga com `?` em SQLite, e estes vêm do próprio esquema —
 * `sqlite_master` e `pragma_foreign_key_list`, não de quem digitou. A checagem
 * existe porque 'vem do banco' é a frase que precede toda injeção: se algum dia
 * uma migração criar tabela com nome estranho, o certo é levantar aqui e não
 * emendar SQL.
 */
function ident(nome: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nome)) {
    throw new Error(
      `adoção: nome de identificador que eu não escrevo em SQL: ${nome}`,
    );
  }
  return nome;
}

/**
 * Toda tabela que carimba empresa — perguntada ao banco, nunca escrita à mão.
 *
 * A lista à mão é o defeito que este projeto já pagou duas vezes: uma guarda que
 * compara duas coisas escritas pela mesma mão não guarda nada, e uma tabela nova
 * numa migração futura ficaria de fora sem ninguém notando — o pior caso
 * possível, porque adoção pela metade é recusada em bloco pelo Postgres (ele tem
 * chave estrangeira COMPOSTA de `location_id` com `company_id`; o aparelho não
 * tem nenhuma).
 */
export async function tabelasComEmpresa(conn: Db): Promise<string[]> {
  const tabelas = await conn.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const comEmpresa: string[] = [];
  for (const { name } of tabelas) {
    const colunas = await conn.getAllAsync<{ name: string }>(
      `SELECT name FROM pragma_table_info(?)`,
      [name],
    );
    if (colunas.some((c) => c.name === 'company_id')) comEmpresa.push(name);
  }
  return comEmpresa;
}

/**
 * Toda coluna que aponta para `locations`, com a tabela dela.
 *
 * São sete hoje, e uma delas — `location_prices.location_id` — é `ON DELETE
 * CASCADE`: apagar o lugar velho ANTES de repontar os filhos levaria os preços
 * combinados junto, em silêncio. É por isso que a ordem aqui não é gosto.
 */
export async function colunasDeLugar(
  conn: Db,
): Promise<{ tabela: string; coluna: string }[]> {
  const tabelas = await conn.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const achadas: { tabela: string; coluna: string }[] = [];
  for (const { name } of tabelas) {
    const fks = await conn.getAllAsync<{ table: string; from: string }>(
      // Aspas DUPLAS, e isto não é estilo: em SQL aspa dupla é identificador e aspa
      // simples é texto. `SELECT 'table', 'from'` compila, roda, e devolve as duas
      // palavras em vez das duas colunas — então a lista de filhos volta vazia, a
      // adoção não reponta nada, e o `DELETE` do lugar velho é recusado por chave
      // estrangeira. Foi o que aconteceu quando uma varredura de aspas passou por
      // aqui achando que aspa é enfeite.
      `SELECT "table", "from" FROM pragma_foreign_key_list(?)`,
      [name],
    );
    for (const fk of fks) {
      if (fk.table === 'locations')
        achadas.push({ tabela: name, coluna: fk.from });
    }
  }
  return achadas;
}

/**
 * Este aparelho pode ser adotado agora? Devolve o motivo da recusa, ou nulo.
 *
 * Separado da adoção porque a TELA precisa saber antes de oferecer o botão — a
 * Lei 5 diz que o erro impede, não reclama, e impedir bem é dizer o que fazer
 * antes de a pessoa tocar.
 */
export async function porQueNaoPodeAdotar(
  novoId: string,
): Promise<MotivoDaRecusa | null> {
  const limpo = novoId.trim();
  if (!limpo) return 'idVazio';
  const conn = await db();

  // 1. Alguma linha já subiu: o carimbo velho está no servidor e não sai mais.
  //
  // A pergunta é DURÁVEL e não é feita à fila. Ela era — `SELECT COUNT(*) FROM outbox
  // WHERE sent_at IS NOT NULL` —, e a faxina apaga entradas enviadas há mais de sete
  // dias: com a última delas, o guarda passava a responder "nunca subiu nada" e a
  // janela da adoção reabria sozinha, uma semana depois, sobre um servidor que já
  // tinha o carimbo antigo. Prova de fato não pode morar numa linha que outra rotina
  // apaga.
  if (await jaFalouComOServidor()) return 'jaSubiu';

  // 2. O exemplo semeado ainda está aqui. Ele nasceu para ninguém abrir o app
  //    numa tela vazia, e passa pelos escritores de verdade — então uma nota
  //    inventada de polpa é, para o razão, indistinguível de uma nota real.
  //    Adotar com ele dentro sobe fatos fabricados para o livro da fábrica, onde
  //    só o estorno alcança: estorno de coisa que nunca aconteceu.
  if (await exampleStillHere(empresaDaqui())) return 'exemploAqui';

  // 3. Já existe linha com o id novo: adoção rodada duas vezes com ids
  //    diferentes, ou cópia restaurada de outro aparelho. Deixar seguir bate num
  //    índice único no meio da transação, e a mensagem que aparece é o nome do
  //    índice.
  const ocupado = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM locations WHERE id = ?`,
    [limpo],
  );
  if ((ocupado?.n ?? 0) > 0) return 'idOcupado';

  return null;
}

/**
 * Adota a empresa: reescreve o carimbo de tudo, numa transação, e guarda o fato.
 *
 * A ordem é medida, não deduzida — foi exercitada contra o esquema real:
 *
 * 1. copia a linha do lugar padrão com o id novo (o lugar padrão tem o id da
 *    própria empresa, por decisão registrada em `defaultLocationId`);
 * 2. reponta as sete colunas que apontam para `locations`;
 * 3. apaga a linha velha do lugar — agora sem filhos, e o `ON DELETE RESTRICT`
 *    de `movements` é a rede que acusa se sobrou algum;
 * 4. troca `company_id` em todas as tabelas que o têm;
 * 5. conserta o que guarda id como CONTEÚDO: o `row_id` da fila (o lugar padrão
 *    é enfileirado com o id da empresa) e a chave de conferência por lugar;
 * 6. grava a empresa em `app_meta`, **dentro** da transação — se o aparelho
 *    desligar no meio, ou tudo voltou atrás ou tudo valeu, e nunca "linhas
 *    carimbadas com uma empresa que o aparelho não sabe que é sua".
 *
 * Não mexer no `payload` da fila é decisão medida: ele é `{}` em 25 dos 26
 * lugares que enfileiram, e o serializador monta a linha a partir da tabela
 * viva, não do payload.
 */
export async function adotarEmpresa(novoId: string): Promise<void> {
  const limpo = novoId.trim();
  const velho = empresaDaqui();
  if (limpo === velho) return;

  const motivo = await porQueNaoPodeAdotar(limpo);
  if (motivo) throw new AdocaoRecusadaError(motivo);

  const conn = await db();
  const tabelas = await tabelasComEmpresa(conn);
  const lugares = await colunasDeLugar(conn);
  const colunasDoLugar = await conn.getAllAsync<{ name: string }>(
    `SELECT name FROM pragma_table_info(?)`,
    ['locations'],
  );

  await conn.withTransactionAsync(async () => {
    // 1. O lugar padrão com o id novo, coluna por coluna, sem `SELECT *` — a
    //    ordem das colunas de um `SELECT *` é a do esquema, e uma migração que
    //    acrescente coluna mudaria o significado de um `INSERT` posicional.
    const nomes = colunasDoLugar.map((c) => ident(c.name));
    const valores = nomes.map((n) =>
      n === 'id' || n === 'company_id' ? '?' : n,
    );
    await conn.runAsync(
      `INSERT INTO locations (${nomes.join(', ')}) SELECT ${valores.join(', ')} FROM locations WHERE id = ?`, // proofgate-allow
      [limpo, limpo, velho],
    );

    // 2. Os filhos, antes de o pai sair — `location_prices` é CASCADE.
    for (const { tabela, coluna } of lugares) {
      await conn.runAsync(
        `UPDATE ${ident(tabela)} SET ${ident(coluna)} = ? WHERE ${ident(coluna)} = ?`, // proofgate-allow
        [limpo, velho],
      );
    }

    // 3. O lugar velho sai. Se algum filho ficou para trás, é aqui que o banco
    //    recusa — e recusar é o desfecho certo.
    await conn.runAsync(`DELETE FROM locations WHERE id = ?`, [velho]);

    // 4. O carimbo da empresa, em toda tabela que o tem.
    for (const tabela of tabelas) {
      await conn.runAsync(
        `UPDATE ${ident(tabela)} SET company_id = ? WHERE company_id = ?`, // proofgate-allow
        [limpo, velho],
      );
    }

    // 5. O id que vive como conteúdo — e são mais do que dois.
    await conn.runAsync(
      `UPDATE outbox SET row_id = ? WHERE table_name = 'locations' AND row_id = ?`,
      [limpo, velho],
    );
    await conn.runAsync(`UPDATE app_meta SET key = ? WHERE key = ?`, [
      `picking.${limpo}`,
      `picking.${velho}`,
    ]);

    // A UNIDADE deste aparelho aponta para um lugar, e o passo 3 acabou de apagar
    // esse lugar. Sem esta linha, `unidadeDaqui()` devolve um id que não existe mais
    // e TODA escrita do aparelho passa a falhar com `FOREIGN KEY constraint failed` —
    // texto cru de SQLite na tela de quem acabou de criar a conta da empresa.
    await conn.runAsync(`UPDATE app_meta SET value = ? WHERE key = ? AND value = ?`, [
      limpo,
      CHAVE_DA_UNIDADE,
      velho,
    ]);

    // E o pedido de Reset pendente, que carrega a empresa DENTRO do corpo.
    //
    // Ele é o único da fila cujo payload guarda o `companyId` congelado: as outras
    // entradas guardam só a tabela e o id da linha, e o corpo é montado na hora do
    // envio. Um pedido carimbado com a empresa-semente é recusado pelo servidor por
    // chave estrangeira — ele nunca soube daquela empresa — e a fila para atrás dele,
    // na PRIMEIRA sincronização, para sempre.
    //
    // Apagar é mais honesto que reescrever: o servidor nunca teve a empresa velha,
    // então um pedido para apagá-la não descreve nada que exista lá. É o mesmo
    // raciocínio de `forgetOrphans`.
    await conn.runAsync(
      `DELETE FROM outbox WHERE table_name = 'erase' AND sent_at IS NULL`,
    );

    // 6. E o fato, na mesma transação que as linhas.
    await conn.runAsync(
      `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`,
      [CHAVE_DA_EMPRESA, limpo],
    );
  });

  // A memória vem do disco JÁ comitado, e não do argumento: se o commit não
  // aconteceu, a memória não pode dizer que aconteceu.
  //
  // As DUAS memórias, e é por isso que elas estão juntas: a empresa e a unidade são
  // os dois fatos que o aparelho responde de cabeça, e recarregar só um deixava a
  // unidade em memória apontando para o lugar apagado até o próximo boot.
  await carregarEmpresa();
  await carregarUnidade();
}

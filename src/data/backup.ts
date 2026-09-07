/**
 * A cópia do aparelho, e a volta dela.
 *
 * **Por que isto é o item zero da fila.** Todo o resto do plano atrasa
 * funcionalidade; isto perde dado. O livro-razão inteiro mora em `norva.db` no
 * aparelho, e aparelho quebrado, roubado ou formatado é a fábrica sem histórico —
 * para o que não existe estorno. A fundação promete conserto por estorno e nunca
 * por exclusão; ela não promete nada contra o celular cair no tanque.
 *
 * **O que este módulo NÃO é.** Cópia não é sincronia, e confundir as duas é caro.
 * Isto resolve *"o celular morreu"*. Não resolve *"dois celulares escrevendo na
 * mesma fábrica"* — isso é o servidor, com `recorded_by` imposto por política e
 * regra de conflito. Então a cópia **não adianta o servidor: ela torna seguro o
 * servidor demorar**, que é a decisão escrita do dono.
 *
 * ---
 *
 * **Gravar é uma instrução de SQL, não um serializador.** `VACUUM INTO` escreve
 * uma cópia consistente do banco num arquivo novo, sem parar o aplicativo e sem
 * WAL pela metade. O que se ganha por não escrever serializador é a coisa que
 * mais importa numa cópia: **ela não pode esquecer uma tabela.** Um serializador
 * é uma lista escrita à mão, e lista escrita à mão envelhece calada — é a doença
 * que este repositório já pagou três vezes em setembro, com coluna que ninguém
 * escreve. `VACUUM INTO` copia o banco, ponto.
 *
 * **Voltar é `ATTACH`, não trocar o arquivo.** Trocar o arquivo é mais simples e
 * tem uma janela em que não existe banco nenhum: falta de energia ali deixa a
 * fábrica sem os dados de antes E sem os da cópia. Com `ATTACH` a restauração é
 * uma transação só — ou a fábrica inteira volta, ou nada mudou. Para a peça cujo
 * propósito é não perder dado, atomicidade vale mais que simplicidade.
 *
 * **E a lista de tabelas é lida do banco, nunca escrita aqui.** A restauração
 * pergunta ao `sqlite_master` quais tabelas existem, então migração que criar
 * tabela nova entra coberta sem ninguém lembrar deste arquivo. Uma **tabela sem
 * restaurador** seria a mesma doença um nível acima da coluna sem escritor, e com
 * consequência pior: a fábrica voltaria quase inteira, que parece certo.
 *
 * **A cópia antiga volta e sobe a escada.** `VACUUM INTO` preserva o
 * `PRAGMA user_version`, que é o mesmo marcador que o `migrate` usa. Então cópia
 * feita na V18 restaura na V22: as colunas que a V19..V22 criaram entram com o
 * padrão delas, porque o `INSERT` nomeia as colunas **da cópia** e não as de
 * agora. É a mesma escada de um celular que ficou dois meses desligado.
 */

import { carregarEmpresa } from './empresa';
import { db, schemaVersion, type Db } from './db';
import { readJson } from './meta';

/**
 * O que o aparelho lembra da última cópia — e mora AQUI, não na tela.
 *
 * Duas telas precisam do fato: a da cópia, para dizer há quantos dias foi, e a
 * CAPA, para avisar quando ela envelheceu. Uma chave de `meta` escrita à mão nos
 * dois lugares é a mesma família de defeito que este arquivo inteiro persegue —
 * dois autores de um dado que tem de ser um só.
 *
 * São TRÊS coisas e não a data sozinha, porque a pergunta de quem olha não é
 * "quando foi" e sim "ela cobre o que eu fiz desde então".
 */
export const ULTIMA_COPIA = 'ultima.copia';

export type UltimaCopia = { feitoEm: string; movimentos: number; bytes: number };

export async function ultimaCopia(): Promise<UltimaCopia | null> {
  return readJson<UltimaCopia>(ULTIMA_COPIA);
}

/** O que uma cópia diz de si, antes de qualquer restauração. */
export type CopiaLida = {
  /** Do `PRAGMA user_version` — quantas migrações o aparelho de origem tinha. */
  versaoDoEsquema: number;
  /** Quando a cópia foi feita, do selo que `gravarCopia` deixa dentro dela. */
  feitoEm: string | null;
  bytes: number;
  movimentos: number;
  itens: number;
  /** Tabelas que a cópia tem e este aplicativo também. */
  tabelasEmComum: number;
};

/**
 * Por que uma cópia foi recusada — FATO, não frase. Quem escreve português é a
 * tela.
 */
export type MotivoDaCopia =
  /** Nenhum selo e nenhuma tabela de movimentos: não saiu deste aplicativo. */
  | 'naoEhCopiaNossa'
  /**
   * Feita por uma versão mais nova do aplicativo.
   *
   * Recusar é a única resposta honesta: o aparelho velho não conhece as tabelas e
   * colunas que a versão nova criou, e restaurar aceitando o que ele entende
   * traria a fábrica **sem uma parte dela**, silenciosamente. Quem tem esta cópia
   * atualiza o aplicativo e restaura depois.
   */
  | 'maisNovaQueOApp'
  /** Não abriu como banco — arquivo truncado no caminho, ou não é banco. */
  | 'ilegivel'
  /** Voltou, e as referências não fecham. A transação foi desfeita. */
  | 'referenciasQuebradas';

export class CopiaRecusadaError extends Error {
  constructor(
    readonly motivo: MotivoDaCopia,
    readonly detalhe?: string,
  ) {
    super(`copia recusada: ${motivo}${detalhe ? ` (${detalhe})` : ''}`);
    this.name = 'CopiaRecusadaError';
  }
}

/** O selo que a cópia carrega, para ela poder dizer de si quando foi feita. */
const SELO = 'norva_copia';

/**
 * As tabelas do SQLite que não são da fábrica.
 *
 * `sqlite_sequence` é mantida pelo próprio SQLite; o selo é da cópia e não do
 * aparelho, então também não volta.
 */
function ehDaFabrica(nome: string): boolean {
  return !nome.startsWith('sqlite_') && nome !== SELO;
}

async function tabelasDe(conn: Db, esquema: 'main' | 'copia'): Promise<string[]> {
  const linhas = await conn.getAllAsync<{ name: string }>(
    `SELECT name FROM ${esquema}.sqlite_master WHERE type = 'table' ORDER BY name`,
    [],
  );
  return linhas.map((l) => l.name).filter(ehDaFabrica);
}

async function colunasDe(conn: Db, esquema: 'main' | 'copia', tabela: string): Promise<string[]> {
  // O esquema vai como SEGUNDO ARGUMENTO, e isto é cicatriz de uma hora atrás.
  //
  // `copia.pragma_table_info('items')` compila, roda, devolve nomes de coluna — e
  // devolve os de `main`. Qualificar a função pelo esquema não a faz olhar para o
  // esquema: o prefixo diz de onde vem a FUNÇÃO, e o argumento escondido `schema`
  // é o que diz de onde vem a TABELA. Com a forma errada a comparação entre a
  // cópia e o aplicativo é a comparação do aplicativo consigo mesmo, e o `INSERT`
  // nomeia uma coluna que a cópia não tem: **cópia antiga nunca restaura**, que é
  // exatamente o caso para o qual cópia existe.
  //
  // E a razão de eu ter escrito a forma errada tem nome: conferi
  // `copia.pragma_table_info` contra uma tabela IDÊNTICA nos dois esquemas, então
  // a régua não distinguia os dois casos. É a regra do `CLAUDE.md` sobre detector
  // novo, quebrada na mesma hora em que a escrevi.
  const linhas = await conn.getAllAsync<{ name: string }>(
    `SELECT name FROM pragma_table_info(?, ?)`,
    [tabela, esquema],
  );
  return linhas.map((l) => l.name);
}

async function versaoDe(conn: Db, esquema: 'main' | 'copia'): Promise<number> {
  const linha = await conn.getFirstAsync<{ user_version: number }>(
    `PRAGMA ${esquema}.user_version`,
    [],
  );
  return linha?.user_version ?? 0;
}

async function bytesDe(conn: Db, esquema: 'main' | 'copia'): Promise<number> {
  const p = await conn.getFirstAsync<{ page_count: number }>(`PRAGMA ${esquema}.page_count`, []);
  const t = await conn.getFirstAsync<{ page_size: number }>(`PRAGMA ${esquema}.page_size`, []);
  return (p?.page_count ?? 0) * (t?.page_size ?? 0);
}

async function contar(conn: Db, esquema: 'main' | 'copia', tabela: string): Promise<number> {
  const linha = await conn.getFirstAsync<{ c: number }>(
    `SELECT count(*) AS c FROM ${esquema}.${tabela}`,
    [],
  );
  return linha?.c ?? 0;
}

/**
 * Escreve a cópia no caminho pedido e devolve o que ela ficou sendo.
 *
 * O caminho tem de não existir — `VACUUM INTO` recusa sobrescrever, e essa
 * recusa é a favor de quem chama: sobrescrever a cópia boa com uma cópia pela
 * metade é o modo de falhar que apaga a rede de segurança.
 */
export async function gravarCopia(
  destino: string,
  agora: string,
): Promise<{ arquivo: string; bytes: number; versaoDoEsquema: number; feitoEm: string; movimentos: number }> {
  const conn = await db();
  await conn.runAsync('VACUUM INTO ?', [destino]);

  // O selo vai DENTRO da cópia, e por isso não escreve nada no banco da fábrica.
  // Sem ele a cópia não sabe dizer quando foi feita: a data do arquivo se perde
  // no caminho — WhatsApp, Drive e e-mail reescrevem todas elas.
  await conn.runAsync('ATTACH DATABASE ? AS copia', [destino]);
  try {
    await conn.execAsync(
      `CREATE TABLE IF NOT EXISTS copia.${SELO} (feito_em TEXT NOT NULL, versao INTEGER NOT NULL)`,
    );
    await conn.runAsync(`INSERT INTO copia.${SELO} (feito_em, versao) VALUES (?, ?)`, [
      agora,
      schemaVersion,
    ]);
    return {
      arquivo: destino,
      bytes: await bytesDe(conn, 'copia'),
      versaoDoEsquema: await versaoDe(conn, 'copia'),
      feitoEm: agora,
      movimentos: await contar(conn, 'copia', 'movements'),
    };
  } finally {
    await conn.execAsync('DETACH DATABASE copia');
  }
}

/**
 * O que a cópia diz de si, sem tocar em nada.
 *
 * Existe porque a confirmação da restauração tem de dizer o que vai acontecer com
 * os números por extenso — *"a cópia é de quinta, 4 de setembro, e tem 1.198
 * movimentos; o aparelho tem 1.240 agora"*. Restauração é o ato mais destrutivo
 * do aplicativo, e a Lei da Inteligência não abre exceção para ele.
 */
export async function lerCopia(origem: string): Promise<CopiaLida> {
  const conn = await db();
  try {
    await conn.runAsync('ATTACH DATABASE ? AS copia', [origem]);
  } catch (e) {
    throw new CopiaRecusadaError('ilegivel', e instanceof Error ? e.message : undefined);
  }
  try {
    const daCopia = await tabelasDe(conn, 'copia');
    if (!daCopia.includes('movements')) throw new CopiaRecusadaError('naoEhCopiaNossa');

    const versaoDoEsquema = await versaoDe(conn, 'copia');
    if (versaoDoEsquema > schemaVersion) {
      throw new CopiaRecusadaError('maisNovaQueOApp', `${versaoDoEsquema} > ${schemaVersion}`);
    }

    const temSelo = (
      await conn.getAllAsync<{ name: string }>(
        `SELECT name FROM copia.sqlite_master WHERE type = 'table' AND name = ?`,
        [SELO],
      )
    ).length > 0;
    const selo = temSelo
      ? await conn.getFirstAsync<{ feito_em: string }>(
          `SELECT feito_em FROM copia.${SELO} ORDER BY feito_em DESC LIMIT 1`,
          [],
        )
      : null;

    const minhas = new Set(await tabelasDe(conn, 'main'));
    return {
      versaoDoEsquema,
      feitoEm: selo?.feito_em ?? null,
      bytes: await bytesDe(conn, 'copia'),
      movimentos: await contar(conn, 'copia', 'movements'),
      itens: await contar(conn, 'copia', 'items'),
      tabelasEmComum: daCopia.filter((t) => minhas.has(t)).length,
    };
  } finally {
    await conn.execAsync('DETACH DATABASE copia');
  }
}

/**
 * Traz a fábrica da cópia de volta, inteira ou nada.
 *
 * A ordem aqui é a única que funciona, e cada passo tem um motivo:
 *
 * 1. **Chaves estrangeiras desligadas ANTES da transação.** O SQLite ignora o
 *    `PRAGMA` dentro de uma transação, e com elas ligadas não existe ordem de
 *    `DELETE`/`INSERT` que não passe por um estado inválido no meio.
 * 2. **Uma transação para tudo.** Ou a fábrica inteira volta, ou nada mudou.
 * 3. **`foreign_key_check` no fim.** Desligar a checagem para poder escrever não
 *    é desistir dela: é adiá-la. Se as referências não fecham, a transação é
 *    desfeita e o motivo volta como fato. Sem este passo a restauração poderia
 *    entregar uma fábrica com órfãos e chamar isso de sucesso.
 */
export async function restaurar(
  origem: string,
): Promise<{ tabelas: number; linhas: number; versaoDaCopia: number }> {
  const lida = await lerCopia(origem);
  const conn = await db();

  await conn.runAsync('ATTACH DATABASE ? AS copia', [origem]);
  await conn.execAsync('PRAGMA foreign_keys = OFF');
  try {
    const daCopia = new Set(await tabelasDe(conn, 'copia'));
    const minhas = (await tabelasDe(conn, 'main')).filter((t) => daCopia.has(t));

    let linhas = 0;
    let quebradas: string | null = null;

    await conn.withTransactionAsync(async () => {
      // Apaga tudo primeiro, e só depois insere: uma tabela que exista aqui e não
      // na cópia tem de ficar VAZIA e não intacta, senão a fábrica volta com um
      // pedaço do estado antigo grudado — o pior resultado possível, porque
      // parece certo.
      for (const t of await tabelasDe(conn, 'main')) {
        await conn.runAsync(`DELETE FROM main.${t}`, []);
      }

      for (const t of minhas) {
        // As colunas da CÓPIA, não as de agora: cópia antiga não tem as colunas
        // que as migrações novas criaram, e elas entram com o padrão delas.
        const daquela = await colunasDe(conn, 'copia', t);
        const aqui = new Set(await colunasDe(conn, 'main', t));
        const comuns = daquela.filter((c) => aqui.has(c));
        if (comuns.length === 0) continue;
        const lista = comuns.join(', ');
        await conn.runAsync(
          `INSERT INTO main.${t} (${lista}) SELECT ${lista} FROM copia.${t}`,
          [],
        );
        linhas += await contar(conn, 'main', t);
      }

      const orfaos = await conn.getAllAsync<{ table: string }>('PRAGMA main.foreign_key_check', []);
      if (orfaos.length > 0) {
        quebradas = `${orfaos.length} referência(s), a primeira em ${orfaos[0]?.table ?? '?'}`;
        // Levantar aqui desfaz a transação: é a diferença entre recusar e
        // entregar uma fábrica com órfãos chamando isso de sucesso.
        throw new CopiaRecusadaError('referenciasQuebradas', quebradas);
      }
    });

    // A cópia repôs `app_meta` inteiro, inclusive a empresa que este aparelho
    // achava que era. O que está na memória pode ser mais novo que o disco
    // agora — e memória mais nova que o disco é exatamente como uma linha nasce
    // carimbada com uma empresa que não existe mais.
    await carregarEmpresa();

    return { tabelas: minhas.length, linhas, versaoDaCopia: lida.versaoDoEsquema };
  } finally {
    await conn.execAsync('PRAGMA foreign_keys = ON');
    await conn.execAsync('DETACH DATABASE copia');
  }
}

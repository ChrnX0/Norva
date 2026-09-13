import { empresaDaqui } from './empresa';
import { readMeta, writeMeta } from './meta';
import { db } from './db';

/**
 * **Qual aparelho é ESTE — e a decisão do dono que estava sem uma linha de código.**
 *
 * *"O relatório fala de onde, não de quem — e o aparelho tem responsável. A
 * responsabilidade vem do aparelho ser cadastrado com um responsável: o movimento aponta
 * para o aparelho, o aparelho aponta para uma pessoa."* Está escrito no `CLAUDE.md` desde o
 * começo, e o servidor tem a tabela (`0013`) e a coluna (`movements.device_id`) desde a
 * mesma época. Faltava o lado que grava.
 *
 * **O que a matrícula compra, e por que ela não é a mesma coisa que o operador.** `operator_id`
 * responde *"quem estava com o aparelho"* e é escolhido na hora, quando a fábrica quer nomear.
 * `device_id` responde *"de qual aparelho esta linha veio"* e não é escolhido nunca — é fato
 * do objeto. Numa fábrica de seis pessoas com três celulares, é ele que transforma "faltaram
 * 3 caixas na conferência" em algo rastreável sem acusar ninguém: o aparelho tem responsável,
 * e o responsável responde pelo aparelho, não pela caixa.
 *
 * **Nulo é estado legítimo, e este módulo existe para dizer isso alto.** Ao contrário da
 * unidade — que sempre tem um padrão, porque todo movimento precisa de um lugar —, o aparelho
 * não se inventa: uma fábrica com um celular só não precisa dizer qual é ele, e um celular
 * recém-instalado não tem matrícula. `device_id` nulo diz *"ninguém matriculou"*, que é
 * diferente de *"não sabemos de onde veio"*.
 *
 * **A resposta é síncrona pelo mesmo motivo de `empresa.ts` e `unidade.ts`:** ela é pedida no
 * meio de nove `INSERT INTO movements`, e devolver `Promise` espalharia `await` por todos —
 * o primeiro que esquecesse gravaria `[object Promise]` como chave estrangeira, que nenhum
 * tipo pega porque `string` aceita qualquer coisa depois da concatenação.
 */

/** Onde o fato mora. Uma chave do aparelho, que nunca atravessa a sincronia. */
export const CHAVE_DO_APARELHO = 'device.id';

let este: string | null = null;

/**
 * A matrícula deste aparelho, de memória. Vale depois de `carregarAparelho()`.
 *
 * Nulo é o caso normal de quem nunca matriculou, e nunca um erro.
 */
export function aparelhoDaqui(): string | null {
  return este;
}

/**
 * Lê do disco qual aparelho este é. Chamado no boot, depois da empresa.
 *
 * **Confere se a linha AINDA existe**, e a razão é a mesma que `carregarUnidade` já paga: a
 * adoção de uma empresa apaga o cadastro velho, e uma cópia restaurada de outro aparelho traz
 * um `devices` que este banco não tem. Um id guardado que aponta para nada faria toda escrita
 * do razão falhar com `FOREIGN KEY constraint failed` — texto cru de SQLite, na tela de quem
 * está trabalhando, sem saída. Custa uma consulta por boot.
 */
export async function carregarAparelho(): Promise<string | null> {
  const guardado = await readMeta(CHAVE_DO_APARELHO);
  const id = guardado?.trim() ? guardado.trim() : null;
  if (!id) {
    este = null;
    return null;
  }

  const conn = await db();
  const existe = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM devices WHERE id = ? AND company_id = ? AND active = 1`,
    [id, empresaDaqui()],
  );
  este = (existe?.n ?? 0) > 0 ? id : null;
  return este;
}

/**
 * Diz que este aparelho é aquele, e grava.
 *
 * Só a chave: a LINHA de `devices` é escrita pelo repositório, que é quem tem o portão de
 * capacidade e a fila de sincronia. Separar as duas metades é o que permite matricular este
 * celular como um aparelho que outro já cadastrou — o caso de quem troca o telefone da câmara
 * fria e quer o histórico continuando a apontar para o mesmo lugar.
 */
export async function assumirAparelho(deviceId: string | null): Promise<void> {
  const id = deviceId?.trim() ?? '';
  await writeMeta(CHAVE_DO_APARELHO, id);
  este = id ? id : null;
}

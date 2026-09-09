import { defaultLocationId } from './repository';
import { empresaDaqui } from './empresa';
import { readMeta, writeMeta } from './meta';
import { db } from './db';

/**
 * Em qual unidade da fábrica este aparelho trabalha.
 *
 * **A pergunta que isto responde é "onde é AQUI", e ela não pode ser feita ao
 * operador.** Uma empresa com duas unidades tem celulares que vivem em prédios
 * diferentes: o da unidade de Bauru grava produção em Bauru, o da unidade de
 * Marília em Marília, e nenhum dos dois muda de prédio no meio do turno.
 * Perguntar a cada movimento seria quebrar a Lei 1 duzentas vezes por dia para
 * confirmar um fato que não muda — e a resposta errada mistura o estoque de duas
 * cidades num saldo só, calada.
 *
 * Então a unidade é fato do APARELHO, como a empresa é, e pelo mesmo motivo: quem
 * está com o celular na mão não escolhe onde está, ele já está.
 *
 * **A primeira unidade tem o id da empresa, e isso é permanente.** Não é dívida
 * a pagar: `defaultLocationId` devolve `company_id` porque é esse o carimbo de
 * todo movimento já gravado, e `movements_are_immutable` é `before update or
 * delete` — `location_id` de linha que já subiu não se corrige nunca, nem por
 * migração, nem por estorno (o estorno cria linha nova; a antiga fica carimbada).
 * As unidades seguintes nascem com uuid próprio, e a assimetria é definitiva.
 *
 * **Daí a regra que este módulo existe para tornar possível: nenhum código lê
 * significado no id de um lugar.** Quem comparar `id === company_id` para dizer
 * *"esta é a fábrica"* está certo hoje e errado no dia da segunda unidade. Quem
 * quer saber "quais são as fábricas" pergunta pela ESPÉCIE (`kind = 'factory'`);
 * quem quer saber "onde estou" pergunta aqui.
 *
 * **Por que a resposta é síncrona.** Mesmo motivo escrito em `empresa.ts`: ela é
 * pedida no meio de consulta, em tela, e devolver `Promise` espalharia `await`
 * por todas — a primeira que esquecesse passaria `[object Promise]` como
 * `location_id`, um carimbo errado que nenhum tipo pega porque `string` aceita
 * qualquer coisa depois da concatenação.
 */

/** Onde o fato mora. Uma chave, não uma coluna: o aparelho está num lugar só. */
export const CHAVE_DA_UNIDADE = 'unit.id';

let aqui: string | null = null;

/**
 * A unidade deste aparelho, de memória. Vale depois de `carregarUnidade()`.
 *
 * Antes de qualquer escolha — e para toda fábrica de uma unidade só, que é o
 * caso normal — responde a primeira unidade, que é o lugar que
 * `ensureLocation` cria no primeiro movimento. Nunca devolve nulo: o aparelho
 * sempre tem um aqui, mesmo que ninguém tenha dito qual.
 */
export function unidadeDaqui(): string {
  return aqui ?? defaultLocationId(empresaDaqui());
}

/**
 * Lê do disco em que unidade este aparelho fica. Chamado no boot, com a empresa.
 *
 * Idempotente, e tolerante ao que não sabe: chave ausente ou vazia deixa a
 * resposta no padrão em vez de inventar um id — um `location_id` inventado é
 * chave estrangeira recusada na subida, e a mensagem que o servidor devolve não
 * explica nada a ninguém.
 *
 * **E a tolerância vale para o id que EXISTIA e deixou de existir**, que é o caso
 * que de fato ocorre: a adoção da empresa apaga o lugar velho, e uma cópia
 * restaurada de outro aparelho traz uma unidade que este banco não tem. Nos dois, o
 * id guardado aponta para nada e toda escrita passa a falhar com `FOREIGN KEY
 * constraint failed` — texto cru de SQLite, na tela, sem saída. A adoção reponta o
 * id no mesmo commit; esta checagem é a rede para o resto da família, e ela custa uma
 * consulta por boot.
 */
export async function carregarUnidade(): Promise<string> {
  const guardado = await readMeta(CHAVE_DA_UNIDADE);
  const id = guardado?.trim() ? guardado.trim() : null;
  if (!id) {
    aqui = null;
    return unidadeDaqui();
  }

  const conn = await db();
  const existe = await conn.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM locations WHERE id = ? AND company_id = ?`,
    [id, empresaDaqui()],
  );
  aqui = (existe?.n ?? 0) > 0 ? id : null;
  return unidadeDaqui();
}

/**
 * Muda a unidade deste aparelho, e grava.
 *
 * O que muda daqui para a frente é onde o próximo movimento é carimbado. O que
 * já foi gravado fica onde está — é livro-razão, e livro-razão não se recarimba.
 */
export async function escolherUnidade(locationId: string): Promise<void> {
  const id = locationId.trim();
  if (!id) throw new Error('unidade sem id');
  await writeMeta(CHAVE_DA_UNIDADE, id);
  aqui = id;
}

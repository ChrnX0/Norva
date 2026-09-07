import { readMeta } from './meta';

/**
 * Qual empresa é a deste aparelho.
 *
 * **Era uma constante compilada, e isso quebrava na primeira subida.** Até 7 de
 * setembro `empresaDaqui()` era a MESMA linha de código em toda instalação, e
 * era ela que carimbava cada movimento do livro-razão. Enquanto nada saía do
 * aparelho, isso não custava nada — a decisão está registrada e era boa: *"uma
 * empresa local até o login chegar; assim multi-empresa deixa de ser migração e
 * passa a ser um login"*.
 *
 * O login chegou. `criarEmpresa` devolve o uuid que o servidor gerou, e o
 * aparelho jogava fora — então a primeira sincronização de verdade seria
 * recusada em bloco: o servidor não conhece a empresa `0000…1`, e a conta que
 * empurra não é membro dela. Chave estrangeira e política, as duas.
 *
 * Daqui em diante a empresa é **fato guardado**: uma chave em `app_meta`, lida
 * uma vez no boot e respondida de memória depois.
 *
 * **Por que a resposta é síncrona.** Duzentas e onze chamadas em trinta e uma
 * telas pedem a empresa no meio de uma consulta. Devolver `Promise` ali
 * espalharia `await` por todas elas e a primeira que esquecesse passaria
 * `[object Promise]` como `company_id` — um carimbo errado que nenhum tipo pega,
 * porque `string` aceita qualquer coisa depois da concatenação. Então o disco é
 * lido uma vez, no boot, ANTES da primeira tela; o resto é memória.
 *
 * **E a semente continua existindo, com o nome do que ela é.** Instalação nova
 * não tem empresa nenhuma e precisa carimbar o exemplo semeado com algum id.
 * `EMPRESA_SEMENTE` é esse id — e `empresaAdotada()` é a pergunta que separa
 * "este aparelho ainda é uma instalação nova" de "este aparelho é da empresa
 * tal". Quem for subir dado tem de perguntar isso antes.
 */
export const EMPRESA_SEMENTE = '00000000-0000-4000-8000-000000000001';

/** Onde o fato mora. Uma chave, não uma coluna: o aparelho tem uma empresa só. */
export const CHAVE_DA_EMPRESA = 'company.id';

let daqui: string = EMPRESA_SEMENTE;

/** A empresa deste aparelho, de memória. Vale depois de `carregarEmpresa()`. */
export function empresaDaqui(): string {
  return daqui;
}

/**
 * Este aparelho já foi ligado a uma empresa de verdade?
 *
 * Não é 'tem servidor configurado' nem 'tem sessão aberta': é se o carimbo das
 * linhas daqui é um id que o servidor conhece. Enquanto for a semente, o que
 * está gravado aqui não tem para onde subir — e quem tenta subir assim é
 * recusado em bloco, com uma mensagem de chave estrangeira que não explica nada
 * a ninguém.
 */
export function empresaAdotada(): boolean {
  return daqui !== EMPRESA_SEMENTE;
}

/**
 * Lê do disco o que este aparelho já sabe. Chamado no boot, antes de qualquer tela.
 *
 * Devolve a empresa para quem quiser encadear, e é idempotente: chamar duas
 * vezes lê duas vezes e responde o mesmo.
 */
export async function carregarEmpresa(): Promise<string> {
  const guardado = await readMeta(CHAVE_DA_EMPRESA);
  daqui = guardado?.trim() ? guardado.trim() : EMPRESA_SEMENTE;
  return daqui;
}

import { fill } from './index';
import type { Dictionary } from './locales/pt-BR';

/**
 * O que a tela DIZ quando a gravação não acontece.
 *
 * **Nove telas imprimiam `e.message`.** A frase do programador — em inglês, sobre um
 * banco de dados — chegando a quem está de luva na câmara fria. E três não diziam
 * nada: o toque não gravava e a tela ficava igual, que é pior que a frase errada,
 * porque a pessoa toca de novo e depois desiste.
 *
 * Isso piorou em 9 de setembro por um bom motivo: os sete escritores do razão
 * ganharam portão, e toda escrita passou a poder recusar por permissão. Uma recusa
 * que chega como `sem manage_company: apagar o livro da empresa` é uma recusa que
 * ninguém entende.
 *
 * Três frases e um padrão. A mensagem crua continua existindo — ela é para o
 * registro, nunca para a tela.
 *
 * As classes de erro entram por PARÂMETRO e não por import: este módulo mora no
 * `src/i18n` e importar `src/data/repository` daqui faria o dicionário depender do
 * banco. Quem chama já tem as duas à mão.
 */
export function avisoDeFalha(
  e: unknown,
  t: Dictionary,
  classes: {
    semAcesso?: new (...args: never[]) => Error;
    semPermissao?: new (...args: never[]) => Error;
    semEstoque?: new (...args: never[]) => Error & { missing: readonly { name: string }[] };
    jaConferida?: new (...args: never[]) => Error;
  } = {},
): { title: string; message: string } {
  const { semAcesso, semPermissao, semEstoque, jaConferida } = classes;

  if (semEstoque && e instanceof semEstoque) {
    return {
      title: t.common.failureTitle,
      message: fill(t.common.failureMissing, {
        items: e.missing.map((m) => m.name).join(', '),
      }),
    };
  }

  // Recusa que IMPEDE tem de dizer a saída, senão ela só reclama noutro tom. Aqui a
  // saída não é tentar de novo — é desfazer a conferência, que é como esta casa
  // corrige tudo. Sem esta frase a recusa caía no genérico "tente de novo em um
  // instante", que manda a pessoa repetir exatamente o que acabou de ser recusado.
  if (jaConferida && e instanceof jaConferida) {
    return { title: t.common.failureTitle, message: t.common.failureAlreadyChecked };
  }

  if ((semAcesso && e instanceof semAcesso) || (semPermissao && e instanceof semPermissao)) {
    return { title: t.common.failureTitle, message: t.common.failureNotYours };
  }

  return { title: t.common.failureTitle, message: t.common.failureUnknown };
}

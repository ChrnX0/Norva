import { NotEnoughStockError, SemAcessoError, SemPermissaoError } from './repository';

/**
 * As recusas que a TELA sabe traduzir, num pacote só.
 *
 * `avisoDeFalha` mora em `src/i18n` e não pode importar o repositório — o dicionário
 * passaria a depender do banco. Então as classes viajam por parâmetro, e este é o
 * pacote que as telas passam: uma linha em vez de três imports por arquivo, e um
 * lugar só para acrescentar a próxima.
 */
export const ERROS = {
  semEstoque: NotEnoughStockError,
  semAcesso: SemAcessoError,
  semPermissao: SemPermissaoError,
} as const;

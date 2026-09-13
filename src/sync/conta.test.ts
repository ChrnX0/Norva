import assert from 'node:assert/strict';
import { test } from 'node:test';
import { motivoDe } from './conta';

/**
 * O motivo vem do CÓDIGO, e a prosa é reserva — não o contrário.
 *
 * **O defeito que isto nomeia.** `motivoDe` casava pedaços de texto em inglês (`invalid login`,
 * `already registered`, `password` + `short`) porque o docblock dela concluiu que a frase
 * inteira era instável — o que é verdade — e parou aí. A biblioteca instalada devolve um
 * `code` estável, conferido no disco: `@supabase/auth-js`, `lib/errors.d.ts:20` e
 * `lib/error-codes.d.ts`.
 *
 * Casar prosa quebra em silêncio na atualização seguinte do servidor: a mensagem muda uma
 * palavra, nenhum teste reprova, e quem errou a senha passa a ler *"não deu certo, e o motivo
 * não é um dos conhecidos"* — a tela deixando de dizer o que fazer, que é o único trabalho
 * dela.
 */
test('o código do servidor manda, mesmo quando a mensagem diz outra coisa', () => {
  // O caso que NOMEIA o defeito: mensagem que casaria com `credenciais` pela prosa, e código
  // dizendo senha fraca. Sem a leitura do código, a resposta é a da mensagem — errada.
  assert.equal(
    motivoDe({ code: 'weak_password', message: 'Invalid login credentials' }),
    'senhaFraca',
    'o código decide; a prosa do servidor não pode desempatar contra ele',
  );

  assert.equal(motivoDe({ code: 'invalid_credentials', message: 'qualquer coisa' }), 'credenciais');
  assert.equal(motivoDe({ code: 'email_not_confirmed', message: '' }), 'emailNaoConfirmado');
  assert.equal(motivoDe({ code: 'user_already_exists', message: '' }), 'emailEmUso');
  assert.equal(
    motivoDe({ code: 'over_request_rate_limit', message: '' }),
    'muitasTentativas',
    'tentativas demais é motivo próprio: pedir para conferir a senha aqui manda tentar de novo, que é o oposto',
  );
  assert.equal(motivoDe({ code: 'session_expired', message: '' }), 'sessaoVencida');
  assert.equal(motivoDe({ code: 'session_not_found', message: '' }), 'sessaoVencida');
  assert.equal(
    motivoDe({ code: 'PGRST301', message: 'JWT expired' }),
    'sessaoVencida',
    'a sessão vencida chega também por consulta, e pede a mesma coisa: entrar de novo',
  );
});

test('sem código, a prosa continua respondendo — e é por isso que ela fica', () => {
  // A falha de REDE não é resposta do servidor: ela não tem código nenhum. Sem a reserva, "sem
  // sinal" viraria "desconhecido" e a tela pediria para conferir e-mail e senha a quem está
  // numa câmara fria.
  assert.equal(
    motivoDe({ message: 'Network request failed' }),
    'semRede',
    'a falha de rede não tem código, e ela é o caso mais comum na câmara fria',
  );
  assert.equal(motivoDe({ message: 'fetch failed' }), 'semRede');
  assert.equal(motivoDe({ message: 'Invalid login credentials' }), 'credenciais');

  // E um código DESCONHECIDO não engole a reserva: ele cai na prosa em vez de virar
  // "desconhecido" com a mensagem certa ao lado, sem ser lida.
  assert.equal(
    motivoDe({ code: 'algo_que_ninguem_viu', message: 'Email not confirmed' }),
    'emailNaoConfirmado',
    'código novo não apaga a leitura da mensagem — senão cada versão do servidor cegaria a tela',
  );

  assert.equal(motivoDe({ message: 'nada disso' }), 'desconhecido', 'e o que não se sabe, diz-se');
});

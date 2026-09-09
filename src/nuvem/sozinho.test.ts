import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ENTRE_COPIAS_MS, horaDeCopiar, umaRodada, type Pecas } from './sozinho';

/**
 * O que acontece sozinho, provado sem aparelho.
 *
 * **A asserção que importa não é "rodou": é a ORDEM e o que sobrevive à falha.**
 * Uma rodada automática que levanta exceção é tela branca na mão de quem só queria
 * abrir o aplicativo, e uma que faz a cópia antes de subir a fila guarda um estado
 * que o servidor não conhece — restaurar depois ressuscita linhas que já estavam a
 * caminho. Os dois são silenciosos, e é por isso que cada um tem teste.
 */

const AGORA = '2026-09-08T12:00:00.000Z';

function pecas(sobre: Partial<Pecas> = {}): { p: Pecas; ordem: string[] } {
  const ordem: string[] = [];
  const p: Pecas = {
    subirFila: async () => {
      ordem.push('fila');
      return 3;
    },
    movimentos: async () => 100,
    ultima: async () => null,
    temDestino: async () => true,
    copiar: async () => {
      ordem.push('copia');
    },
    buscarAtualizacao: async () => {
      ordem.push('atualizacao');
      return true;
    },
    ...sobre,
  };
  return { p, ordem };
}

test('a ordem é fila, cópia, atualização — e inverter as duas primeiras custa dado', async () => {
  const { p, ordem } = pecas();
  const feito = await umaRodada(p, AGORA);
  assert.deepEqual(ordem, ['fila', 'copia', 'atualizacao']);
  assert.deepEqual(
    feito.map((t) => `${t.o}:${t.fim}`),
    ['fila:feito', 'copia:feito', 'atualizacao:feito'],
  );
});

test('nenhuma peça que falha derruba a rodada, nem impede as de baixo', async () => {
  const { p, ordem } = pecas({
    subirFila: async () => {
      throw new Error('SemRede');
    },
  });
  const feito = await umaRodada(p, AGORA);
  assert.equal(feito[0].fim, 'falhou');
  assert.equal(feito[0].porque, 'Error');
  // A prova de verdade: a cópia e a atualização aconteceram MESMO ASSIM.
  assert.deepEqual(ordem, ['copia', 'atualizacao']);
  assert.equal(feito[1].fim, 'feito');
  assert.equal(feito[2].fim, 'feito');
});

test('uma recusa nomeada chega como motivo, não como mensagem de biblioteca', async () => {
  class Recusou extends Error {
    motivo = 'semAutorizacao';
  }
  const { p } = pecas({
    copiar: async () => {
      throw new Recusou('drive recusou: alguma coisa em inglês');
    },
  });
  const feito = await umaRodada(p, AGORA);
  assert.equal(feito[1].porque, 'semAutorizacao', 'a tela precisa do motivo para saber o que dizer');
});

test('sem destino configurado a cópia PULA, e pular não é falhar', async () => {
  const { p, ordem } = pecas({ temDestino: async () => false });
  const feito = await umaRodada(p, AGORA);
  assert.equal(feito[1].fim, 'pulou');
  assert.equal(feito[1].porque, 'semDestino');
  assert.ok(!ordem.includes('copia'), 'copiou para onde?');
});

test('a hora de copiar exige intervalo E movimento novo — domingo fechado não gera cópia', () => {
  const ontem = new Date(new Date(AGORA).getTime() - ENTRE_COPIAS_MS - 1000).toISOString();
  const agoraMesmo = new Date(new Date(AGORA).getTime() - 1000).toISOString();

  // Aparelho novo: é hora, e a contagem não importa.
  assert.equal(horaDeCopiar(null, 0, AGORA), true);

  // Passou o intervalo e o razão cresceu: é hora.
  assert.equal(horaDeCopiar({ feitoEm: ontem, movimentos: 90 }, 100, AGORA), true);

  // Passou o intervalo e NADA mudou: não é hora. Cópia idêntica não protege nada
  // e consome dado de quem está no 3G da estrada.
  assert.equal(horaDeCopiar({ feitoEm: ontem, movimentos: 100 }, 100, AGORA), false);

  // Mudou muito, mas foi agora: não é hora. Senão cada movimento gera uma cópia.
  assert.equal(horaDeCopiar({ feitoEm: agoraMesmo, movimentos: 10 }, 100, AGORA), false);

  // E a borda exata do intervalo, que é onde um `>` viraria `>=` sem ninguém ver.
  const naBorda = new Date(new Date(AGORA).getTime() - ENTRE_COPIAS_MS).toISOString();
  assert.equal(horaDeCopiar({ feitoEm: naBorda, movimentos: 99 }, 100, AGORA), true);
});

test('duas rodadas ao mesmo tempo não disputam o mesmo arquivo', async () => {
  let copiando = 0;
  let simultaneas = 0;
  const { p } = pecas({
    copiar: async () => {
      copiando += 1;
      if (copiando > 1) simultaneas += 1;
      await new Promise((r) => setTimeout(r, 10));
      copiando -= 1;
    },
  });
  const [a, b] = await Promise.all([umaRodada(p, AGORA), umaRodada(p, AGORA)]);
  assert.equal(simultaneas, 0, 'duas cópias ao mesmo tempo escrevem no mesmo arquivo');
  // Uma das duas foi recusada na porta, e diz por quê.
  const recusada = [a, b].find((r) => r.length === 1 && r[0].porque === 'jaRodando');
  assert.ok(recusada, 'a segunda rodada tinha de ser recusada, e nomeadamente');
});

test('a atualização é a última, e uma pronta não muda o que as outras duas fizeram', async () => {
  const { p, ordem } = pecas({
    buscarAtualizacao: async () => {
      ordem.push('atualizacao');
      return true;
    },
  });
  const feito = await umaRodada(p, AGORA);
  assert.equal(ordem[ordem.length - 1], 'atualizacao', 'buscar antes de subir a fila perde a janela');

  // A propriedade que importa: uma atualização PRONTA não interrompe a rodada nem
  // apaga o que veio antes. A rodada devolve as três tentativas e volta — quem
  // aplica é a próxima abertura do aplicativo. Reiniciar aqui, no meio de uma
  // contagem na câmara fria, trocaria dado por novidade; e quem perde a contagem
  // uma vez não conta de novo.
  assert.deepEqual(
    feito.map((t) => `${t.o}:${t.fim}`),
    ['fila:feito', 'copia:feito', 'atualizacao:feito'],
  );
});

/**
 * O razão que ENCOLHE — e a régua respondia "não é hora" para sempre.
 *
 * `horaDeCopiar` perguntava se o número de movimentos CRESCEU. Ele quase sempre
 * cresce, e "quase" é o que custa: depois de um Reset, ou de restaurar uma cópia
 * mais antiga, o número desce abaixo do que a última cópia registrou — e a rodada
 * automática parava, calada, até a fábrica gravar mais linhas do que tinha antes.
 *
 * Um backup que deixa de acontecer sem nada na tela é a pior forma de não ter
 * backup: a pessoa acredita que tem.
 */
test('depois de um Reset o backup volta a acontecer, em vez de emudecer', () => {
  const ontem = '2026-09-08T10:00:00.000Z';
  const hoje = '2026-09-09T10:00:00.000Z';
  const ultima = { feitoEm: ontem, movimentos: 4000 };

  // O caso do defeito: o razão encolheu. Continua sendo mudança, e mudança pede cópia
  // — a cópia velha descreve uma fábrica que não existe mais.
  assert.equal(horaDeCopiar(ultima, 0, hoje), true, 'zerado é a maior mudança que existe');
  assert.equal(horaDeCopiar(ultima, 1200, hoje), true, 'restaurado de uma cópia antiga');

  // E os dois lados que já valiam continuam valendo, senão isto teria trocado um
  // defeito por outro: cresceu copia, igual não copia.
  assert.equal(horaDeCopiar(ultima, 4200, hoje), true, 'cresceu');
  assert.equal(horaDeCopiar(ultima, 4000, hoje), false, 'nada mudou desde a última');

  // O prazo continua mandando: mudança dentro da janela não dispara cópia nenhuma.
  assert.equal(horaDeCopiar(ultima, 0, ontem), false, 'a janela ainda não passou');
});

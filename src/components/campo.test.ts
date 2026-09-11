import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aceitaDoPai, campoComSugestao } from './campo';

/**
 * Provada contra o caso que ela deve pegar e o caso que ela não deve — o que o
 * `CLAUDE.md` exige de todo detector antes de ele reportar qualquer coisa. E o
 * caso falso aqui não é hipótese: é o defeito que a PRIMEIRA versão desta régua
 * tinha, achado lendo o conserto antes de ele chegar ao aparelho.
 */
test('com o dedo no campo, quem manda é quem digita', () => {
  // Verdadeiro: o pai devolveu "Pi" enquanto a pessoa já digitou "Pic" — uma
  // renderização atrasado. Obedecer isso apaga a letra que ela acabou de pôr.
  assert.equal(aceitaDoPai('Pi', 'Pic', true), false);
  // E vale mesmo quando o pai transforma de propósito: enquanto o dedo está ali,
  // nada de fora entra. O que ele decidiu chega ao sair.
  assert.equal(aceitaDoPai('PIC', 'Pic', true), false);
});

test('fora do campo, quem manda é o pai — inclusive para esvaziar', () => {
  // O caso que a régua com memória engolia: formulário que se limpa ao salvar,
  // com nome curto o bastante para ainda estar na janela de memória.
  assert.equal(aceitaDoPai('', 'Loja', false), true);
  // Transformação vinda do pai entra ao sair do campo.
  assert.equal(aceitaDoPai('LOJA', 'Loja', false), true);
  // E o que já está igual não vira renderização à toa.
  assert.equal(aceitaDoPai('Loja', 'Loja', false), false);
  assert.equal(aceitaDoPai('Loja', 'Loja', true), false);
});

/**
 * A distinção que o `||` apaga, e que o navegador não consegue medir.
 *
 * A checagem de navegador de "apagar o sugerido fica apagado" passou **com o defeito
 * plantado** — `??` trocado por `||` —, porque o `input` controlado não repõe o texto
 * quando o valor calculado não muda. No aparelho repõe: é a mesma armadilha do
 * `aceitaDoPai` acima, vista do outro lado.
 *
 * Então a régua se prova aqui, onde ela é decidível: cada linha abaixo é uma das quatro
 * respostas possíveis, e a terceira é a que o `||` quebra.
 */
test('a sugestão vale para quem não digitou, e vazio é uma digitação', () => {
  // Ninguém digitou: vale o palpite, e a tela tem o que explicar.
  assert.deepEqual(campoComSugestao(undefined, 'Distribuidora Aurora'), {
    valor: 'Distribuidora Aurora',
    ehSugestao: true,
  });

  // Digitou outra coisa: manda quem digita, e a dica sai.
  assert.deepEqual(campoComSugestao('Atacado São Jorge', 'Distribuidora Aurora'), {
    valor: 'Atacado São Jorge',
    ehSugestao: false,
  });

  // **A linha que o `||` quebra.** Apagou o campo: ele fica apagado. Com `||` a sugestão
  // voltaria, e a tela passaria a brigar com quem usa — pior que campo vazio.
  assert.deepEqual(campoComSugestao('', 'Distribuidora Aurora'), {
    valor: '',
    ehSugestao: false,
  });

  // Sem nota anterior não há palpite, e o padrão não é sugestão de nada: a dica não pode
  // aparecer embaixo de um "1" que veio do código.
  assert.deepEqual(campoComSugestao(undefined, null, '1'), { valor: '1', ehSugestao: false });

  // Nome gravado vazio pela sincronia não é sugestão — sugerir "" é sugerir nada.
  assert.deepEqual(campoComSugestao(undefined, ''), { valor: '', ehSugestao: false });
});

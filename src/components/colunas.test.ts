import test from 'node:test';
import assert from 'node:assert/strict';
import { alternando, desnivel, distribuir } from './colunas';

/**
 * O pé das duas colunas, medido em vez de argumentado.
 *
 * Esta é a última coisa que ficou de pé do layout do tablet, e ela estava escrita
 * como limitação conhecida: *"o pé das duas colunas é desigual, porque empacotar
 * sem medir altura só é justo por cima"*. Aqui a afirmação vira número.
 */

test('a peça vai para a coluna mais baixa, não para a próxima da vez', () => {
  // Um cartão alto seguido de três baixos: alternar põe o alto e o terceiro do
  // mesmo lado e deixa o pé desigual por 200; medindo, os três baixos se
  // acomodam do outro lado.
  const alturas = [300, 100, 100, 100];

  assert.deepEqual(distribuir(alturas), [0, 1, 1, 1]);
  assert.equal(desnivel(alturas, distribuir(alturas)), 0);
  assert.equal(desnivel(alturas, alternando(alturas)), 200);
});

test('com alturas iguais a regra nova é a regra velha', () => {
  // Alternar é o caso particular desta regra quando nada difere — e isso importa
  // porque é o que garante que nenhuma tela hoje bem distribuída piora.
  const alturas = [120, 120, 120, 120, 120];
  assert.deepEqual(distribuir(alturas), alternando(alturas));
});

test('o desnível nunca é pior que alternar, em cem listas de alturas', () => {
  /**
   * Cem casos e não três, porque o defeito aqui é de DISTRIBUIÇÃO: um exemplo
   * escolhido a dedo prova o exemplo, e o que se quer saber é se existe alguma
   * forma de cartão em que medir piore.
   *
   * O sorteio é determinístico de propósito — semente fixa, sem `Math.random` —
   * para uma falha ser reproduzível na leitura seguinte em vez de ser um caso
   * que ninguém mais vê.
   */
  let semente = 20250906;
  const proximo = () => {
    semente = (semente * 1103515245 + 12345) % 2147483648;
    return semente / 2147483648;
  };

  for (let caso = 0; caso < 100; caso++) {
    const quantos = 2 + Math.floor(proximo() * 9);
    const alturas = Array.from({ length: quantos }, () => 60 + Math.floor(proximo() * 400));
    const medido = desnivel(alturas, distribuir(alturas));
    const alternado = desnivel(alturas, alternando(alturas));
    assert.ok(
      medido <= alternado,
      `alturas ${alturas.join(',')}: medindo deu ${medido}, alternando deu ${alternado}`,
    );
  }
});

test('o caso em que o guloso perde continua sendo escolhido pelo outro', () => {
  /**
   * A cicatriz, fixada por número.
   *
   * O sorteio acima achou isto e desmentiu o docblock que eu tinha escrito —
   * *"melhor que alternar em todo caso"*. Guloso decide olhando só o presente:
   * quando o 384 chega, a escolha que o acomodaria já passou. Sem este teste,
   * a próxima leitura vê duas estratégias onde uma parece bastar e simplifica
   * de volta para a que perde aqui.
   */
  const alturas = [290, 229, 119, 384, 236];
  assert.deepEqual(distribuir(alturas), alternando(alturas));
  assert.equal(desnivel(alturas, distribuir(alturas)), 32);
});

test('uma peça só fica à esquerda, e a coluna da direita nasce vazia', () => {
  // O caso de uma tela que perdeu os cartões condicionais. A grade com um filho
  // já custou uma foto neste projeto (a grade de nomes esticando para a largura
  // inteira), e a resposta é a mesma: quem tem um, tem um do lado esquerdo.
  assert.deepEqual(distribuir([250]), [0]);
  assert.deepEqual(distribuir([]), []);
});

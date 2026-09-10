import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ehEcoDoCampo, lembrar, MEMORIA_DO_CAMPO } from './campo';

/**
 * Provado contra o caso que ela deve pegar e o caso que ela não deve — que é o
 * que o `CLAUDE.md` exige de todo detector antes de ele reportar qualquer coisa.
 */
test('o eco atrasado do campo é reconhecido e a decisão de quem usa passa', () => {
  // Verdadeiro: a pessoa digitou até "Pic" e o pai devolveu "Pi", uma
  // renderização atrasado. Obedecer isso é apagar a letra que ela acabou de pôr.
  const digitados = ['', 'P', 'Pi', 'Pic'];
  assert.equal(ehEcoDoCampo('Pi', digitados), true);
  assert.equal(ehEcoDoCampo('Pic', digitados), true, 'o eco em dia também é eco');

  // Falso: o pai transformou de propósito — o código de convite que vira
  // maiúsculo em `app/account.tsx` — ou esvaziou o campo de fora. Nada disso
  // passou por aqui, então é decisão e vale.
  assert.equal(ehEcoDoCampo('PIC', digitados), false);
  assert.equal(ehEcoDoCampo('Picolé', digitados), false);
  assert.equal(ehEcoDoCampo('', ['P', 'Pi']), false, 'esvaziar de fora é decisão');
});

test('a memória do campo é curta e guarda o fim, não o começo', () => {
  let memoria: string[] = [''];
  for (const letra of 'abcdefghijklmno') memoria = lembrar(memoria, letra);

  assert.equal(memoria.length, MEMORIA_DO_CAMPO + 1);
  assert.equal(memoria.at(-1), 'o', 'a última tecla está sempre lá');
  assert.equal(ehEcoDoCampo('o', memoria), true);
  assert.equal(ehEcoDoCampo('a', memoria), false, 'o que é velho demais para atrasar sai');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * **A fronteira do TATO, escrita como régua em vez de ficar na cabeça de quem consertou.**
 *
 * O dono pediu a confirmação redundante entre sentidos em 6 de setembro, com a razão que é
 * de fábrica: *"uma piscada… cor de confirmação e cor de erro… ou até um aviso sonoro"* —
 * cada canal falha num ambiente diferente, e quem está de luva na câmara fria não olha a
 * tela para saber se a carga foi gravada.
 *
 * O tato do RESULTADO não tem um lugar único por onde passe, e inventar um seria pior que a
 * repetição (a camada de dados devolve fato, não sensação). Então cada tela do chão de
 * fábrica chama, e é esta guarda que impede as duas metades do esquecimento: a tela nova de
 * despacho que nasce muda, e o cadastro que ganha um tremor sem razão.
 *
 * *Uma lista escrita à mão guardada por um teste é o que este repositório chama de dívida
 * declarada: ela não impede o erro, ela obriga a DECIDIR de novo — quem acrescentar uma tela
 * de chão de fábrica reprova aqui e escolhe um dos dois lados por escrito.*
 */

/** O chão de fábrica: mão ocupada, luva, frio, ou as duas mãos no engradado. */
const CHAO = [
  'app/production/new.tsx',
  'app/transfer.tsx',
  'app/picking.tsx',
  'app/(tabs)/transport.tsx',
  'app/purchase.tsx',
];

/**
 * Os cadastros: quem salva está olhando o formulário que acabou de preencher.
 *
 * Vibrar aqui não acrescenta canal nenhum — a resposta já é a tela mudando na frente da
 * pessoa —, e seria o alerta inventado aplicado ao tato: tremor em tudo é tremor que não
 * quer dizer nada.
 */
const CADASTRO = [
  'app/recipes/new.tsx',
  'app/recipes/[id].tsx',
  'app/products/new.tsx',
  'app/people.tsx',
  'app/carriers.tsx',
  'app/places.tsx',
  'app/inputs/new.tsx',
];

test('o chão de fábrica confirma pelo tato, e o cadastro não', () => {
  const semTato = CHAO.filter((f) => !readFileSync(f, 'utf8').includes('tatoDeSucesso('));
  assert.deepEqual(
    semTato,
    [],
    'estas telas gravam no razão com a mão ocupada e não dizem nada ao dedo: quem está de ' +
      'luva no frio precisa da resposta sem olhar a tela',
  );

  const comTato = CADASTRO.filter((f) => readFileSync(f, 'utf8').includes('tatoDeSucesso('));
  assert.deepEqual(
    comTato,
    [],
    'tremor em tudo é tremor que não quer dizer nada — no cadastro a resposta é a tela ' +
      'mudando na frente de quem salvou',
  );
});

/**
 * **A recusa vibra num lugar só, e é por onde TODA recusa passa.**
 *
 * `avisoDeFalha` monta a frase e a folha de confirmação a mostra com `acknowledge`, sem
 * botão de cancelar, porque não há o que escolher. Nove telas gravam por esse caminho — e
 * nenhuma delas precisa saber que existe vibração.
 */
test('a folha que conta a recusa vibra, e ela é o único lugar que precisa saber disso', () => {
  const folha = readFileSync('src/components/Confirm.tsx', 'utf8');
  assert.match(
    folha,
    /tatoDeFalha\(\)/,
    'a recusa chega pela folha de acknowledge: sem tato ali, o "não deu" depende de olhar a tela',
  );
  assert.match(
    folha,
    /request\.acknowledge/,
    'e ele sai só na folha que CONTA, não na que pergunta — vibrar ao perguntar é dizer ' +
      '"deu certo" antes de a gravação existir',
  );

  // E nenhuma tela chama o tato de falha na mão: duas fontes para a mesma resposta é como
  // uma recusa passa a vibrar duas vezes, ou a vibrar sem folha nenhuma na frente.
  const naMao = [...CHAO, ...CADASTRO].filter((f) =>
    readFileSync(f, 'utf8').includes('tatoDeFalha('),
  );
  assert.deepEqual(naMao, [], 'o tato da recusa mora na folha, e as telas não o repetem');
});

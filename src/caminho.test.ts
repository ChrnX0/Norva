import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * Os dois caminhos deixam o MESMO livro-razão — e isto é estrutura, não coincidência.
 *
 * A invariante é do dono, 11 de setembro, e é o que torna a decisão dele verificável em vez
 * de opinião: *"ambos valendo desde que o resultado seja o mesmo"*. Um caminho que produz
 * um razão diferente não é um atalho, é outro ato.
 *
 * A forma mais forte de garantir isso não é comparar dois razões num teste: é **o caminho
 * de trás não ter como escrever no razão.** Ele coleta e encaminha; quem grava é a mesma
 * `app/production/new.tsx` que o passo a passo usa, chamando a mesma `recordProduction`.
 * Provado assim, a invariante vale para toda produção possível, e não para as que alguém
 * lembrou de testar.
 *
 * Régua de TEXTO, e a fronteira dita: ela não executa nada, então ela não pega uma escrita
 * feita por um caminho indireto que ela não saiba nomear. O que ela pega é o que de fato
 * acontece quando uma tela cresce — alguém acrescenta o `saveX` ali porque era mais curto.
 */

const FIZ = readFileSync(new URL('../app/fiz.tsx', import.meta.url), 'utf8');
const MOSAICO = readFileSync(new URL('./home/Mosaic.tsx', import.meta.url), 'utf8');

/** O que escreve no livro-razão. Nome novo aqui é nome novo em `repository.ts`. */
const ESCREVEM_NO_RAZAO = [
  'recordProduction',
  'closeProductionRun',
  'recordPurchase',
  'recordLoss',
  'recordCount',
  'recordTransfer',
  'recordReturn',
];

test('o caminho de trás NÃO escreve no livro-razão — ele encaminha', () => {
  const achadas = ESCREVEM_NO_RAZAO.filter((fn) => new RegExp(`\\b${fn}\\s*\\(`).test(FIZ));
  assert.deepEqual(
    achadas,
    [],
    `app/fiz.tsx chama ${achadas.join(', ')}. A invariante do dono ("ambos valendo desde que ` +
      'o resultado seja o mesmo") é garantida por esta tela não ter como gravar: quem grava é ' +
      'app/production/new.tsx, a mesma do passo a passo. Uma segunda gravação abre a porta ' +
      'para dois razões diferentes pelo mesmo ato.',
  );
});

test('os dois caminhos levam às MESMAS portas, degrau por degrau', () => {
  // Se o caminho de trás mandasse a pessoa a outra tela de cadastro, ele coletaria outro
  // dado — e aí o razão poderia divergir sem ninguém escrever uma linha de gravação. As
  // duas tabelas são escritas em arquivos diferentes por razões diferentes (uma é a capa,
  // a outra é a escada), e é justamente por isso que elas têm de bater.
  const doCaminho = Object.fromEntries(
    [...FIZ.matchAll(/^\s*(insumo|ficha|produto|producao):\s*'([^']+)'/gm)].map((m) => [m[1], m[2]]),
  );
  const daCapa = Object.fromEntries(
    [...MOSAICO.matchAll(/^\s*(insumo|ficha|produto|producao):\s*\{\s*rota:\s*'([^']+)'/gm)].map(
      (m) => [m[1], m[2]],
    ),
  );

  // A leitura primeiro: régua que não acha nada "concorda" com qualquer coisa, que é o
  // defeito que este repositório já pagou para aprender — a guarda que não podia falhar.
  assert.equal(Object.keys(doCaminho).length, 4, 'as quatro portas do caminho foram lidas');
  assert.equal(Object.keys(daCapa).length, 4, 'as quatro portas da capa foram lidas');
  assert.deepEqual(doCaminho, daCapa, 'o caminho de trás e o passo a passo usam as mesmas telas');
});

test('a régua distingue uma chamada de gravação de uma menção em prosa', () => {
  // O caso FALSO, exigido antes de qualquer número: o docblock de `app/fiz.tsx` CITA
  // `recordProduction` por escrito, para explicar por que a tela não a chama. Uma régua por
  // nome simples reprovaria o comentário que existe para dizer que está tudo certo.
  assert.ok(
    /recordProduction/.test(FIZ),
    'a prosa de fiz.tsx menciona recordProduction — se isto falhar, o caso falso deixou de existir e a régua perdeu o teste dela',
  );
  assert.ok(
    !/\brecordProduction\s*\(/.test(FIZ),
    'e não a CHAMA: a régua lê o parêntese, não o nome',
  );
});

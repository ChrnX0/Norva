import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * **A leitura que falha não pode desenhar como um estado vazio.**
 *
 * Neste aplicativo vazio é uma AFIRMAÇÃO: "não saiu nada hoje", "não há saldo",
 * "não há ficha cadastrada". Uma consulta que quebrou produz exatamente a mesma
 * tela, e quem olha lê o fato errado sobre a própria fábrica — que é a pior
 * classe de defeito num produto cuja razão de existir é o número ser confiável.
 *
 * Medido em 10 de setembro, e o número é o motivo desta guarda existir: **32
 * telas chamavam `useQuery` e UMA olhava o `error`** — a capa, consertada no dia
 * anterior. As outras trinta e uma engoliam.
 *
 * O conserto não é editar trinta e uma telas do mesmo jeito trinta e uma vezes:
 * é o casco por onde todas passam saber desenhar a falha, e cada tela entregar o
 * dado. Comportamento mora no `CollapsingHeader`; o DADO é da tela, e por isso
 * ela precisa passá-lo. Quem cobra a entrega é esta guarda.
 */
function telas(dir: string, into: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) telas(caminho, into);
    else if (nome.endsWith('.tsx')) into.push(caminho);
  }
  return into;
}

/**
 * **As telas que ainda engolem, nomeadas uma a uma.**
 *
 * Esta lista existe para a guarda entrar HOJE em vez de esperar as trinta e uma
 * ficarem prontas — e ela só encolhe. Cada nome aqui é uma tela onde uma consulta
 * que falha continua desenhando como "não há nada". Não é fronteira permanente
 * como as do dicionário: é dívida com endereço.
 */
const AINDA_ENGOLEM = [
  'app/(tabs)/more.tsx',
  'app/(tabs)/production.tsx',
  'app/(tabs)/reports.tsx',
  'app/(tabs)/transport.tsx',
  'app/account.tsx',
  'app/assistant.tsx',
  'app/backup.tsx',
  'app/catalog.tsx',
  'app/extrato.tsx',
  'app/inputs/[id].tsx',
  'app/inputs/index.tsx',
  'app/inputs/new.tsx',
  'app/orders/new.tsx',
  'app/products/new.tsx',
  'app/purchase.tsx',
  'app/recipes/[id].tsx',
  'app/settings.tsx',
  'app/weather.tsx',
];

function engole(caminho: string): boolean {
  const fonte = readFileSync(caminho, 'utf8');
  if (!fonte.includes('useQuery') || !fonte.includes('CollapsingHeader')) return false;
  return !fonte.includes('erro={');
}

test('toda tela que lê do banco sabe dizer que a leitura falhou', () => {
  const engolindo = telas('app').filter(engole).sort();
  const novas = engolindo.filter((t) => !AINDA_ENGOLEM.includes(t));

  assert.deepEqual(
    novas,
    [],
    'tela nova com useQuery: passe erro={error} e denovo={refresh} ao CollapsingHeader',
  );
});

test('a lista de dívida só guarda tela que de fato ainda engole', () => {
  const engolindo = telas('app').filter(engole);
  const pagas = AINDA_ENGOLEM.filter((t) => !engolindo.includes(t));

  assert.deepEqual(
    pagas,
    [],
    'estas telas já mostram a falha — tire-as de AINDA_ENGOLEM, que é dívida e só encolhe',
  );
});

test('a régua separa a tela que engole da que já avisa, e ignora quem não lê', () => {
  // Verdadeiro e falso do detector, contra as telas de verdade: a que acabou de
  // ser ligada não pode aparecer, e uma da lista tem de aparecer.
  assert.equal(engole('app/production/new.tsx'), false, 'esta já entrega o erro');
  assert.equal(engole('app/extrato.tsx'), true, 'esta ainda engole');
  // E uma tela sem consulta nenhuma não é assunto desta guarda.
  assert.equal(engole('app/_layout.tsx'), false);
});

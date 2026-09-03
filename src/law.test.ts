import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Lei da Inteligência, item 3: nenhum número aparece sozinho.
 *
 * Ela estava escrita no `CLAUDE.md` desde o começo e não era conferida por
 * nada. Numa auditoria só, três telas foram achadas anunciando um número nu:
 * "3 destinos hoje" no transporte, "R$ 1.552,50 parado" no almoxarifado, "R$ 148
 * em 4 perdas" no relatório. Nenhuma suíte reclamou, porque a lei mora num
 * arquivo de texto e o texto não roda.
 *
 * Por que registro e não heurística. A tentação é exigir que todo `type.figure`
 * venha acompanhado de alguma coisa, e isso alarma errado: num formulário o
 * número grande é o que a pessoa está digitando agora, e a comparação dele é o
 * próprio formulário. Alarme inventado ensina a ignorar alarme - é a mesma
 * doença que o item 7 da lei proíbe. Então cada tela com número grande declara
 * aqui o que ela responde ao lado dele, ou por que não há o que comparar.
 *
 * O que este teste pega, e é o caso real: uma tela NOVA com número grande e sem
 * comparação nenhuma. Ela quebra a suíte até alguém responder a pergunta - e
 * responder pode ser "é um formulário", desde que seja escrito.
 */

/** O estilo do número que a tela existe para dizer. */
const NUMERO_GRANDE = 'type.figure';

type Declaracao =
  /** Compara, e o `com` é o rastro no arquivo de quem faz a comparação. */
  | { compara: RegExp }
  /** Não compara, e o motivo fica escrito aqui - não em silêncio. */
  | { sozinho: string };

const TELAS: Record<string, Declaracao> = {
  'src/home/Mosaic.tsx': { compara: /noYesterday|madeYesterday/ },
  'app/(tabs)/production.tsx': { compara: /vsYesterday|noYesterday/ },
  'app/inputs/index.tsx': { compara: /shortestCover|coverUnknown|coverComfortable/ },
  'app/inputs/[id].tsx': { compara: /wentUp|wentDown/ },
  'app/losses.tsx': { compara: /vsPrevious|firstWindow/ },
  'app/recipes/[id].tsx': { compara: /summaryCheaper|summaryDearer|delta/ },

  'app/lots/[id].tsx': {
    sozinho:
      'o número grande é o CÓDIGO do lote, não uma medida. Código não tem mais nem menos, e comparar dois códigos não decide nada.',
  },
  'app/purchase.tsx': {
    sozinho:
      'formulário: o número é o total da nota que a pessoa está digitando agora. A comparação dele é a própria nota na mão dela.',
  },
  'app/inputs/new.tsx': {
    sozinho: 'formulário: o número é o custo que acabou de ser digitado, ainda não é história.',
  },
  'app/products/new.tsx': {
    sozinho: 'formulário: o número é o rendimento que a pessoa está definindo agora.',
  },
  'app/production/new.tsx': {
    sozinho:
      'formulário: o número é o que a corrida vai gravar. O que ela vai custar aparece na confirmação, antes de virar história.',
  },
};

/** Comentário fala de `type.figure` à vontade; só o que roda conta. */
function codigo(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function telasEm(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) out.push(...telasEm(caminho));
    else if (/\.tsx$/.test(entrada) && !/\.test\.tsx$/.test(entrada)) out.push(caminho);
  }
  return out;
}

const COM_NUMERO = [...telasEm('app'), ...telasEm('src/home')].filter((caminho) =>
  codigo(readFileSync(caminho, 'utf8')).includes(NUMERO_GRANDE),
);

test('every headline number says what it is being compared against', () => {
  for (const caminho of COM_NUMERO) {
    const declarada = TELAS[caminho];
    assert.ok(
      declarada,
      `${caminho} mostra um número grande e não está em src/law.test.ts. ` +
        'A Lei da Inteligência (3) pede a comparação ao lado do número: declare qual é, ' +
        'ou escreva por que essa tela não tem o que comparar.',
    );
    if ('compara' in declarada) {
      assert.match(
        readFileSync(caminho, 'utf8'),
        declarada.compara,
        `${caminho} declarou que compara, e a comparação sumiu do arquivo`,
      );
    } else {
      assert.ok(declarada.sozinho.length > 40, `${caminho}: o motivo tem que ser um motivo`);
    }
  }
});

test('the registry does not outlive the screens', () => {
  const vivas = new Set(COM_NUMERO);
  for (const caminho of Object.keys(TELAS)) {
    assert.ok(
      vivas.has(caminho),
      `${caminho} está declarada aqui e não mostra mais número grande — tire a linha, ` +
        'senão o registro vira lista de telas que não existem mais.',
    );
  }
});

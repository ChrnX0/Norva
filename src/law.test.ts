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
 *
 * **A régua era por arquivo, e a capa tem dez números.** Uma declaração só
 * aprovava o arquivo inteiro: `Mosaic.tsx` passou verde por comparar a
 * produção com ontem enquanto as caixas, as corridas abertas e as entregas do
 * dia apareciam nuas ao lado. Nove figuras nunca foram conferidas por nada.
 * Agora a contagem tem que bater: um número grande novo quebra a suíte até
 * ganhar a SUA linha aqui, e "não há o que comparar" continua valendo desde
 * que seja escrito por extenso.
 */

/** O estilo do número que a tela existe para dizer. */
const NUMERO_GRANDE = 'type.figure';

type Declaracao =
  /** Compara, e o `com` é o rastro no arquivo de quem faz a comparação. */
  | { compara: RegExp }
  /** Não compara, e o motivo fica escrito aqui - não em silêncio. */
  | { sozinho: string };

/** Uma declaração por número grande da tela. Uma só quando a tela tem um só. */
const TELAS: Record<string, Declaracao | Declaracao[]> = {
  // Dez números, dez respostas. Na ordem em que aparecem no arquivo.
  'src/home/Mosaic.tsx': [
    { compara: /noYesterday|madeYesterday/ },
    {
      sozinho:
        'o número é uma contagem regressiva - "3 dias · Polpa" já é a distância até o fim. Contagem regressiva compara com o limite dela, e um "ontem" ao lado só atrapalharia.',
    },
    { compara: /noBoxesYesterday|boxesYesterday/ },
    { compara: /warmerBy|weather\.same/ },
    {
      sozinho:
        'o número é quantos tachos estão abertos AGORA. Estado ao vivo responde a segunda pergunta da lei (o que está diferente), e zero é o normal - o pulso ao lado diz se anda.',
    },
    { compara: /coverDays|coverTightest/ },
    {
      sozinho:
        'o número é quantas entregas do dia ainda não saíram: uma lista de afazeres de hoje, que se compara com o próprio acordo de dia, e não com ontem.',
    },
    { compara: /lossVsBefore|lossFirst/ },
    { compara: /Sparkline/ },
    { compara: /heldDetail|coverDays/ },
  ],
  'app/(tabs)/production.tsx': { compara: /vsYesterday|noYesterday/ },
  // Três números, três respostas: o dinheiro parado dura tantos dias, o custo
  // congelado tem a linha das corridas anteriores, e a perda do mês tem o mês
  // anterior ao lado.
  'app/(tabs)/reports.tsx': [
    { compara: /coverDays|placeCount/ },
    { compara: /Sparkline/ },
    { compara: /lossVsBefore|lossFirst/ },
  ],
  // O número é quantos destinos receberam hoje, e ontem vem logo abaixo — a
  // mesma pergunta que a aba já respondia em texto, agora como figura.
  'app/(tabs)/transport.tsx': { compara: /vsYesterday|firstDay/ },
  // O número é quanto vale o lugar, e a comparação é a conta aberta embaixo
  // dele: cada item com o que vale, na mesma régua, e os outros lugares logo
  // abaixo. É a Lei 6 respondendo a Lei 3 — a conclusão abre a conta.
  'app/places.tsx': { compara: /worth/ },
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

/** Quantos números grandes a tela mostra de verdade, sem contar comentário. */
function quantidadeDeNumeros(fonte: string): number {
  return codigo(fonte).split(NUMERO_GRANDE).length - 1;
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
    const lista = Array.isArray(declarada) ? declarada : [declarada];
    const fonte = readFileSync(caminho, 'utf8');
    const quantos = quantidadeDeNumeros(fonte);
    assert.equal(
      lista.length,
      quantos,
      `${caminho} mostra ${quantos} número(s) grande(s) e declara ${lista.length} aqui. ` +
        'Cada número responde por si: acrescente a linha do que falta, dizendo com o que ele ' +
        'se compara ou por que não há o que comparar.',
    );
    for (const item of lista) {
      if ('compara' in item) {
        assert.match(fonte, item.compara, `${caminho} declarou que compara, e a comparação sumiu do arquivo`);
      } else {
        assert.ok(item.sozinho.length > 40, `${caminho}: o motivo tem que ser um motivo`);
      }
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

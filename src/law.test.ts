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
  // A manchete da produção saiu daqui: ela virou o diagrama do `Capa.tsx`, logo
  // abaixo. O número não sumiu — mudou de arquivo, e com ele a comparação.
  'src/home/Capa.tsx': [
    { compara: /referencias|delta/ },
    // A temperatura de hoje tem a de amanhã ao lado, que é a comparação que
    // muda decisão: 21° não diz nada; 21° com "amanhã +4°" diz para produzir mais.
    { compara: /amanha|tomorrowDelta/ },
  ],
  'src/home/Mosaic.tsx': [
    // A contagem regressiva do insumo saiu da lista de números grandes: ela virou
    // DESENHO. O `Nivel` do `Capa.tsx` mostra o quanto resta no próprio pote, e a
    // frase ao lado diz em quantos dias acaba. Quem responde à Lei 3 ali é a
    // altura do líquido contra o pote inteiro, que é a comparação desenhada.
    { compara: /noBoxesYesterday|boxesYesterday/ },
    // O número do clima saiu daqui junto com o cartão: ele agora é desenhado
    // pelo `CartaoClima` do `Capa.tsx`, e a comparação foi com ele.
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
  // A capa do Orgânico tem dois números grandes, e os dois trazem a comparação
  // colada neles — não num cartão à parte, porque a cena ocupa metade da tela.
  'src/home/capas/organico.tsx': [
    // O do dia: dois selos por baixo, o de ontem e o da mesma quarta-feira da
    // semana passada. É a mesma comparação do diagrama do Papel, dita em miúdo.
    { compara: /yesterdayPill|vsWeekdayPill/ },
    // O da temperatura: o de amanhã ao lado, que é o que muda decisão — 21° não
    // decide nada, 21° com "amanhã +4°" manda produzir mais.
    { compara: /tomorrowDelta|warmerBy/ },
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
  // O número é o custo da receita mais cara, e a comparação é a régua da
  // ordem: "as outras vêm abaixo, do lote mais caro para o mais barato" diz o
  // que estar em primeiro significa.
  'app/recipes/index.tsx': { compara: /orderedByBatch/ },
  'app/inputs/index.tsx': { compara: /shortestCover|coverUnknown|coverComfortable/ },
  'app/inputs/[id].tsx': { compara: /wentUp|wentDown/ },
  'app/losses.tsx': { compara: /vsPrevious|firstWindow/ },
  /**
   * A lista de comprar hoje: o número grande é quanto o pedido DEVE CUSTAR, e a comparação é
   * quantos itens somam esse dinheiro — `itemCount` ao lado da figura.
   *
   * *A segunda leitura é a razão de a comparação ser a contagem e não uma janela anterior:* sem o
   * portão do dinheiro a figura VIRA a contagem de embalagens, e "quinze itens" continua dizendo do
   * que o número é feito. Uma janela anterior não existe aqui — a lista de ontem não é fato
   * guardado, é uma pergunta refeita a cada manhã sobre o razão de hoje.
   */
  'app/comprar.tsx': { compara: /itemCount/ },
  'app/recipes/[id].tsx': { compara: /summaryCheaper|summaryDearer|delta/ },

  // O Espelho da Loja: o número grande é a FRAÇÃO devolvida, e a comparação é a
  // mesma janela imediatamente anterior — vem no chip ao lado, com a direção. É por
  // isso que `storeMirror` devolve `before` junto: sem ele a tela precisaria de uma
  // segunda consulta, que é como duas verdades nascem.
  'app/mirror.tsx': { compara: /words\.before|words\.first/ },
  'app/lots/[id].tsx': {
    sozinho:
      'o número grande é o CÓDIGO do lote, não uma medida. Código não tem mais nem menos, e comparar dois códigos não decide nada.',
  },
  'app/account.tsx': {
    sozinho:
      'o corpo grande é o CÓDIGO de convite da empresa — seis letras para serem ditas em voz alta, '
      + 'não uma medida. Ele está em corpo de figura por um motivo de uso e não de importância: '
      + 'seis caracteres apertados numa legenda são soprados errado num galpão com barulho.',
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

/**
 * A mesma limpeza, guardando as LINHAS — porque a posição é o que se vai conferir.
 *
 * `codigo` apaga o comentário inteiro e encurta o arquivo; aqui ele vira espaço em
 * branco do mesmo tamanho. As duas existem porque respondem a perguntas diferentes:
 * uma conta quantos números há, a outra diz ONDE cada um está.
 */
function codigoComLinhas(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * A janela em que a comparação do número `i` tem de aparecer.
 *
 * **O docblock desta guarda prometia posição e o código conferia o arquivo inteiro.**
 * *"Dez números, dez respostas. Na ordem em que aparecem no arquivo"* — a ordem estava
 * escrita e nada a cobrava: uma comparação declarada para a figura 3 era aceita por
 * existir em qualquer lugar do arquivo, inclusive ao lado da figura 1. Com dez números
 * numa tela, nove poderiam ficar nus e a suíte continuaria verde.
 *
 * A regra desta casa sobre isso não tem terceira saída: se a promessa é boa, fecha-se o
 * buraco; se não é, corrige-se a promessa. Uma varredura de 9 de setembro mediu que ela
 * é boa — **as 21 comparações declaradas estão, hoje, na vizinhança do número delas** —,
 * então o que faltava era a guarda cobrar o que o comentário já afirmava.
 *
 * A vizinhança vai até o meio do caminho para o número vizinho, dos dois lados. Não é
 * um número mágico de linhas: é o único corte que não precisa ser calibrado, e ele
 * degenera no arquivo inteiro quando há um número só — que é exatamente o
 * comportamento antigo para as onze telas de um número.
 */
function vizinhanca(linhas: string[], figuras: number[], i: number): string {
  const aqui = figuras[i];
  const ini = i === 0 ? 0 : Math.floor((figuras[i - 1] + aqui) / 2);
  const fim = i === figuras.length - 1 ? linhas.length : Math.floor((aqui + figuras[i + 1]) / 2);
  return linhas.slice(ini, fim).join('\n');
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
    const linhas = codigoComLinhas(fonte).split('\n');
    const figuras: number[] = [];
    linhas.forEach((l, n) => {
      if (l.includes(NUMERO_GRANDE)) figuras.push(n);
    });
    assert.equal(figuras.length, quantos, `${caminho}: a contagem e as posições discordam`);

    lista.forEach((item, i) => {
      if ('compara' in item) {
        // **Na VIZINHANÇA do número, não em qualquer lugar do arquivo.** Uma comparação
        // que existe no topo e um número nu embaixo satisfazia a guarda antiga, e é
        // isso que o docblock sempre prometeu não aceitar.
        assert.match(
          vizinhanca(linhas, figuras, i),
          item.compara,
          `${caminho}: o número ${i + 1} (linha ${figuras[i] + 1}) declarou que compara, e a ` +
            'comparação não está perto dele. Ou ela sumiu, ou a declaração está na ordem errada — ' +
            'as declarações seguem a ordem em que os números aparecem no arquivo.',
        );
      } else {
        assert.ok(item.sozinho.length > 40, `${caminho}: o motivo tem que ser um motivo`);
      }
    });
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

test('the neighbourhood is the ground between the number and its siblings', () => {
  const linhas = 'a\nb\nc\nd\ne\nf\ng\nh\ni'.split('\n');

  // Um número só: a vizinhança é o arquivo inteiro — que é o comportamento antigo, e
  // é o certo para as onze telas de um número. Fechar a janela ali seria apertar sem
  // ganhar nada.
  assert.equal(vizinhanca(linhas, [4], 0), linhas.join('\n'));

  // Três números: cada um fica com o chão até o meio do caminho para o vizinho. O
  // primeiro pega do começo, o último pega até o fim, e o do meio é o único cercado
  // dos dois lados.
  assert.equal(vizinhanca(linhas, [1, 4, 7], 0), 'a\nb');
  assert.equal(vizinhanca(linhas, [1, 4, 7], 1), 'c\nd\ne');
  assert.equal(vizinhanca(linhas, [1, 4, 7], 2), 'f\ng\nh\ni');

  // E o negativo que dá sentido a tudo: o que está na vizinhança do PRIMEIRO não está
  // na do terceiro. Sem isso a régua devolveria o arquivo inteiro três vezes, e a
  // guarda voltaria a aceitar uma comparação em qualquer lugar — que é exatamente o
  // buraco que ela existe para fechar.
  assert.ok(!vizinhanca(linhas, [1, 4, 7], 2).includes('a'));
  assert.ok(!vizinhanca(linhas, [1, 4, 7], 0).includes('i'));
});

test('the line-preserving cleaner blanks the prose without moving anything', () => {
  const fonte = ['const a = 1;', '/* type.figure', '   ainda comentário */', 'const b = type.figure;'].join('\n');
  const limpo = codigoComLinhas(fonte);

  // O número de linhas não muda — é isso que faz a posição continuar valendo.
  assert.equal(limpo.split('\n').length, 4);
  // E o `type.figure` do comentário sumiu; o do código ficou.
  assert.equal(limpo.split(NUMERO_GRANDE).length - 1, 1);
  assert.ok(limpo.split('\n')[3].includes(NUMERO_GRANDE), 'a figura de verdade continua na linha dela');
});

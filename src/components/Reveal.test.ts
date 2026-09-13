import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { assentamentoMs, motion } from '@/theme/tokens';

/**
 * A rede embaixo da entrada, e a régua que diz quando ela pode agir.
 *
 * O defeito que trouxe este arquivo foi fotografado em 9 de setembro: a capa do
 * primeiro dia inteira a **22% de opacidade**, contraste de 1,56:1 num piso de
 * 4,5:1, parada assim por minutos e atravessando navegação. Não era cor — era a
 * animação de chegada congelada no meio, com a página deslocada 20 dp e reduzida
 * a 97%, exatamente o que `enterScale` faz com a mola em 0,217.
 *
 * Duas coisas se provam aqui, e elas provam coisas diferentes:
 *
 * 1. **A régua do assentamento.** `assentamentoMs` é uma fórmula fechada — o
 *    envelope de decaimento do oscilador. Conferi-la contra si mesma não prova
 *    nada, então a fonte de comparação é outra: a mola **integrada
 *    numericamente**, passo a passo, a partir da equação do movimento. As duas
 *    contas não compartilham uma linha de código.
 *
 * 2. **Que a rede continua existindo.** Isto é varredura de texto, e ela vale
 *    pelo que de fato protege: alguém apagar o `setTimeout` num arquivo cujo
 *    docblock já promete, desde antes do defeito, que a tela nunca fica em
 *    branco por causa de enfeite. **Ela não prova que a rede funciona** — o que
 *    prova isso é a foto do aparelho, medida: com a correção, a mesma capa mede
 *    tinta cheia (33,30,26) e a régua da página volta aos 948 px da coluna.
 */

/** A mola da casa, integrada passo a passo. Devolve a distância até o destino. */
function molaIntegrada(
  { damping, stiffness, mass }: { damping: number; stiffness: number; mass: number },
  segundos: number,
): number {
  const passo = 0.00002;
  let x = 0;
  let v = 0;
  for (let t = 0; t < segundos; t += passo) {
    const aceleracao = (stiffness * (1 - x) - damping * v) / mass;
    v += aceleracao * passo;
    x += v * passo;
  }
  return Math.abs(1 - x);
}

test('a régua do assentamento bate com a mola integrada passo a passo', () => {
  const previsto = assentamentoMs(motion.settle) / 1000;
  assert.ok(
    molaIntegrada(motion.settle, previsto) <= 0.01,
    `no tempo previsto (${(previsto * 1000).toFixed(0)} ms) a mola ainda estava a ` +
      `${molaIntegrada(motion.settle, previsto).toFixed(4)} do destino`,
  );
});

test('a régua distingue: na metade do tempo a mola AINDA não assentou', () => {
  const metade = assentamentoMs(motion.settle) / 2000;
  assert.ok(
    molaIntegrada(motion.settle, metade) > 0.01,
    'a régua daria assentada uma mola que ainda está a caminho — não distingue nada',
  );
});

test('a régua acompanha a mola, e vale para as molas que a casa não usa hoje', () => {
  // A mola dura é a que derrubou a primeira versão da fórmula: com amortecimento
  // de 0,82 o envelope tem 70% de folga, e o teto saía antes de a mola chegar.
  const molas = [
    { damping: 40, stiffness: 600, mass: 1 },
    { damping: 6, stiffness: 60, mass: 1 },
    // Crítica e supercrítica: o outro regime da fórmula, que a casa não usa hoje.
    { damping: 24.5, stiffness: 150, mass: 1 },
    { damping: 40, stiffness: 150, mass: 1 },
    { damping: 80, stiffness: 150, mass: 1 },
    motion.press,
  ];
  for (const mola of molas) {
    const teto = assentamentoMs(mola) / 1000;
    assert.ok(
      molaIntegrada(mola, teto) <= 0.01,
      `no teto de ${(teto * 1000).toFixed(0)} ms a mola ${JSON.stringify(mola)} ainda ` +
        `estava a ${molaIntegrada(mola, teto).toFixed(4)} do destino`,
    );
  }
  assert.ok(
    assentamentoMs({ damping: 40, stiffness: 600, mass: 1 }) <
      assentamentoMs({ damping: 6, stiffness: 60, mass: 1 }),
    'mola mais dura tem de assentar antes da mais frouxa',
  );
});

/**
 * TODA peça que entra tem rede — e a varredura é o ponto, não o arquivo.
 *
 * O primeiro conserto foi só no `Reveal`. Provei no aparelho, dei por fechado, e
 * meia hora depois a tela de Produção apareceu com o cartão e o botão desbotados:
 * `Alive` tinha as mesmas cinco linhas. E mais quatro atrás dele. A regra deste
 * projeto já dizia — *"conserto de pele não termina no arquivo que o mostrou"* —
 * e o que a faz valer não é lembrar dela: é uma guarda que olha todos.
 */
function entradasSemRede(): string[] {
  const suspeitos: string[] = [];
  // As duas pastas INTEIRAS, por `fontesDePeca` — antes era `readdirSync` sem descer, e as
  // capas das peles e as cenas ficavam de fora justamente por morarem um nível abaixo.
  for (const { caminho, fonte } of fontesDePeca()) {
    // Quem entra é quem começa PARADO NO PONTO DE PARTIDA por causa do
    // movimento — `useSharedValue(reduzir === false ? 0 : 1)` — ou quem zera um
    // valor compartilhado para deixar a animação trazê-lo de volta.
    const entra =
      /useSharedValue\(\s*reduzi\w* === false \? 0 : 1\s*\)/.test(fonte) ||
      /withSpring\(\s*(aberta \? 1 : 0|destino)/.test(fonte);
    if (!entra) continue;
    if (!/redeDaEntrada\(/.test(fonte)) suspeitos.push(caminho);
  }
  return suspeitos;
}

test('toda peça que entra tem a rede embaixo dela', () => {
  assert.deepEqual(
    entradasSemRede(),
    [],
    'estas peças zeram um valor e entregam a volta à animação, sem nada que as traga ' +
      'se ela não chegar — foi assim que a capa passou minutos a 22% de opacidade',
  );
});

test('a régua acha a peça sem rede quando ela existe', () => {
  // O caso falso: uma fonte com a entrada e SEM a rede tem de ser apontada.
  const comEntradaSemRede = 'const x = useSharedValue(reduzir === false ? 0 : 1);';
  const comEntradaComRede = comEntradaSemRede + '\nredeDaEntrada(() => {});';
  const entra = (fonte: string) =>
    /useSharedValue\(\s*reduzi\w* === false \? 0 : 1\s*\)/.test(fonte) &&
    !/redeDaEntrada\(/.test(fonte);
  assert.equal(entra(comEntradaSemRede), true, 'não acusa quem devia acusar');
  assert.equal(entra(comEntradaComRede), false, 'acusa quem já tem rede');
});

/**
 * Entrada não dirige OPACIDADE — o conteúdo não depende da animação para existir.
 *
 * A rede embaixo da entrada não bastou. Em 10 de setembro, com ela no lugar e o
 * relógio já compartilhado, o editor da ficha técnica abriu com 170 dp de papel
 * puro onde mora o cabeçalho — a mola tinha ficado em ZERO, e opacidade zero é o
 * mesmo pixel que "não desenhado". Ligar "reduzir movimento" trouxe tudo de volta,
 * o que prova a causa e mostra o tamanho do problema: qualquer entrada que dirija
 * opacidade pode apagar o texto de uma tela.
 *
 * Então a entrada passa a mexer só o que é FORMA — subir e crescer. A pior falha
 * possível vira um cartão torto e legível, em vez de uma página em branco com o
 * banco cheio de dado.
 *
 * A régua olha o repositório inteiro pelo mesmo motivo da irmã dela: o defeito é
 * um raciocínio que se copia.
 */
/**
 * As duas pastas, INTEIRAS — e a falta disso deixava a capa de fora.
 *
 * As duas varreduras deste arquivo usavam `readdirSync` sem descer um nível, e é exatamente
 * um nível abaixo que mora o que elas existem para vigiar: `src/home/capas/` (as capas das
 * peles) e `src/components/cenas/` (as cenas, com mais de uma dúzia de `opacity:` animados).
 * O defeito que criou este arquivo foi *"a capa do primeiro dia inteira a 22% de opacidade"* —
 * e a capa mudou de pasta sem a guarda dela seguir.
 *
 * A convenção certa já existia a duas portas: `src/home/capas/registro.test.ts` varre estas
 * mesmas pastas recursivamente E prova que achou arquivo, *"senão ela passa por não olhar"*.
 */
/**
 * Prosa fora, antes de procurar — senão a régua acusa o comentário que a explica.
 *
 * Achado na mesma rodada em que a régua foi consertada: ao tirar `opacity: settled.value`
 * do `Sparkline`, o comentário que conta POR QUE ela saiu cita o trecho — e a guarda
 * continuou reprovando, agora pelo texto que documenta o conserto. Um detector que lê
 * prosa como código proíbe explicar o que ele proíbe.
 *
 * É a mesma doença que `src/sync/grants.test.ts` encontrou hoje no bloco de `grant`: os
 * comentários NOMEIAM tabelas, e ler o arquivo cru daria por permitida toda tabela citada
 * em prosa.
 */
function semComentario(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * A régua, UMA vez — e o teste dela usa esta, não uma cópia.
 *
 * **A cópia era o defeito mais fundo, achado em 11 de setembro.** O teste que prova a régua
 * (*"a régua acha a opacidade pendurada quando ela existe"*) reimplementava a expressão
 * inteira num ajudante local. Duas implementações da mesma promessa: a que roda sobre o
 * repositório e a que é provada. Elas divergiram — a que roda lia só o primeiro valor de
 * entrada do arquivo, e a que era provada nunca viu um arquivo com dois.
 *
 * Um teste de régua que testa outra régua não testa nada, e é a irmã exata da regra que este
 * projeto já tem escrita: *"uma guarda que compara duas coisas escritas pela mesma mão não
 * guarda nada"*.
 *
 * Devolve o NOME do valor pendurado, ou nulo. O nome importa: é ele que diz onde olhar num
 * arquivo com mais de uma entrada.
 */
export function opacidadePendurada(fonte: string): string | null {
  const limpa = semComentario(fonte);
  const nomes = [
    ...limpa.matchAll(
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*useSharedValue\(\s*reduzi\w* === false \? 0 : 1\s*\)/g,
    ),
  ].map((m) => m[1]);
  for (const nome of nomes) {
    if (new RegExp(`opacity:\\s*[^,\n]*\\b${nome}\\b`).test(limpa)) return nome;
  }
  return null;
}

function fontesDePeca(): { caminho: string; fonte: string }[] {
  const achados: { caminho: string; fonte: string }[] = [];
  const descer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) descer(caminho);
      else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
        achados.push({ caminho, fonte: readFileSync(caminho, 'utf8') });
      }
    }
  };
  for (const pasta of ['src/components', 'src/home']) descer(pasta);
  return achados;
}

test('nenhuma entrada dirige opacidade', () => {
  const fontes = fontesDePeca();
  // A leitura primeiro: régua que não acha arquivo concorda com qualquer coisa, e é a
  // asserção que faltava aqui — a varredura antiga passava por não olhar.
  assert.ok(fontes.length > 20, `a busca achou só ${fontes.length} arquivos — ela não está olhando`);

  const suspeitos: string[] = [];
  for (const { caminho, fonte } of fontes) {
    const pendurado = opacidadePendurada(fonte);
    if (pendurado) suspeitos.push(`${caminho} (${pendurado})`);
  }
  assert.deepEqual(
    suspeitos,
    [],
    'estas peças ligam a opacidade ao valor da entrada — se a animação não chegar, ' +
      'o conteúdo some, e foi assim que o cabeçalho da ficha técnica virou papel puro',
  );
});

test('a régua acha a opacidade pendurada na entrada quando ela existe', () => {
  const um = 'const shown = useSharedValue(reduzido === false ? 0 : 1);\n';
  assert.equal(
    opacidadePendurada(`${um}style(() => ({ opacity: shown.value }));`),
    'shown',
    'não acusa quem devia acusar',
  );
  assert.equal(
    opacidadePendurada(`${um}style(() => ({ transform: [{ scale: shown.value }] }));`),
    null,
    'acusa quem só mexe a forma',
  );

  /**
   * O caso que a régua NÃO tinha, e que era exatamente o buraco — dois valores de entrada.
   *
   * O `Sparkline` declara `drawn` e depois `settled`, e pendura a opacidade no SEGUNDO. A
   * versão antiga lia uma captura só e devolvia "limpo" no único arquivo do repositório onde
   * havia o que achar.
   */
  const dois =
    'const drawn = useSharedValue(reduzido === false ? 0 : 1);\n' +
    'const settled = useSharedValue(reduzido === false ? 0 : 1);\n';
  assert.equal(
    opacidadePendurada(`${dois}props(() => ({ r: 3.2 * drawn.value, opacity: settled.value }));`),
    'settled',
    'a opacidade pendurada no SEGUNDO valor de entrada tem de ser achada',
  );
  assert.equal(
    opacidadePendurada(`${dois}props(() => ({ r: 3.2 * settled.value }));`),
    null,
    'e dois valores que só mexem forma continuam limpos',
  );

  // E prosa não é código: o comentário que EXPLICA por que a opacidade saiu cita o trecho.
  // Uma régua que lesse isso proibiria explicar o que ela proíbe.
  assert.equal(
    opacidadePendurada(`${um}// antes: opacity: shown.value\nprops(() => ({ r: shown.value }));`),
    null,
    'comentário citando o defeito não é o defeito',
  );
  assert.equal(
    opacidadePendurada(`${um}/* opacity: shown.value */\nprops(() => ({ r: shown.value }));`),
    null,
    'nem em bloco',
  );
});

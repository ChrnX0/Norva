import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ptBR } from './i18n/locales/pt-BR';

/**
 * Toda seção do dicionário tem quem a leia — ou um motivo escrito.
 *
 * **A doença tem nome neste repositório.** O `CLAUDE.md` cita, ao explicar por que
 * o portão passou a ser por item e não por fase: *"quatro seções de dicionário nos
 * três idiomas sem uma tela"*. O número da fase não pegou nenhuma delas, e quando
 * eu varri o dicionário hoje eram **sete**.
 *
 * O custo não é o espaço. É que uma seção morta parece viva: quem for renomear
 * "Custo desta produção" acha primeiro a cópia que ninguém lê, muda ali, e a tela
 * continua dizendo o que dizia — com o commit verde, o teste verde e o dono
 * apontando o texto velho na semana seguinte.
 *
 * Quatro saíram porque eram rascunho ANTERIOR, já substituído pelas telas vivas:
 * `areas` nomeava um menu de oito áreas que não existe (duas delas cortadas por
 * decisão escrita), e `production`, `confirmation` e `assistant` diziam em outras
 * palavras o que `app.production`, `app.transfer.confirmBody` e `app.assistant` já
 * dizem. Três ficaram, porque são escopo escrito e não esquecimento — e é isso que
 * a lista abaixo registra.
 *
 * **O que este teste NÃO confere**, dito em vez de omitido: ele mede SEÇÃO, não
 * chave. Uma varredura por chave acusou 44 folhas sem leitor aparente, e boa parte
 * é falso positivo do detector (leitura por índice dinâmico, chave montada). A
 * seção é a unidade em que a doença apareceu quatro vezes, e é a que dá para medir
 * sem inventar alarme.
 */

/**
 * As seções que nada lê hoje, e por quê.
 *
 * Cada linha é uma fronteira registrada, com a tela que vai lê-la. Sem a linha, o
 * teste reprova — que é o ponto: a próxima seção escrita adiantada precisa dizer
 * para quem, ou não entra.
 */
const ESCRITAS_ADIANTADO: Record<string, string> = {
  posts:
    'os quatro postos de controle (separado, carregado, entregue, conferido) — escopo da F3 escrito no plano do mês, no CLAUDE.md',
  stepper:
    'o UnitStepper, componente da Fase 2 — decisão registrada no CLAUDE.md, e apontá-lo como defeito já custou uma rodada',
  scan:
    'a leitura do QR do engradado na doca — o QR já é impresso na etiqueta do lote; quem lê ainda não existe',
};

/** Toda referência a `t.<seção>` no aplicativo, fora dos próprios dicionários. */
function fontes(dir: string, into: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) fontes(caminho, into);
    else if (/\.(ts|tsx|mjs)$/.test(entrada) && !caminho.includes('locales')) into.push(caminho);
  }
  return into;
}

const CODIGO = [...fontes('app'), ...fontes('src')].map((f) => readFileSync(f, 'utf8')).join('\n');

test('every dictionary section has a reader, or a written reason', () => {
  const secoes = Object.keys(ptBR);
  assert.ok(secoes.length > 5, 'o dicionário chegou vazio — a comparação abaixo seria de graça');

  const orfas = secoes.filter(
    (secao) => !ESCRITAS_ADIANTADO[secao] && !new RegExp(`t\\.${secao}\\b`).test(CODIGO),
  );

  assert.deepEqual(
    orfas,
    [],
    `estas seções do dicionário não têm leitor: ${orfas.join(' · ')}. ` +
      'Seção morta parece viva: quem renomear o texto acha primeiro a cópia que ninguém lê, ' +
      'muda ali, e a tela continua dizendo o que dizia. Traga o leitor no mesmo commit, ' +
      'apague a seção, ou registre a fronteira em ESCRITAS_ADIANTADO com a tela que vai lê-la.',
  );
});

test('the frontier list only holds sections that are still unread', () => {
  for (const [secao, motivo] of Object.entries(ESCRITAS_ADIANTADO)) {
    assert.ok(secao in ptBR, `"${secao}" está registrada como fronteira e não existe mais — tire a linha.`);
    assert.ok(
      !new RegExp(`t\\.${secao}\\b`).test(CODIGO),
      `"${secao}" ganhou leitor — tire a linha da lista de fronteiras, ela deixou de ser uma.`,
    );
    assert.ok(motivo.length > 40, `"${secao}": a fronteira precisa dizer QUEM vai ler, não só que espera.`);
  }
});

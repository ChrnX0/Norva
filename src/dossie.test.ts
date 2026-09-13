import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * O dossiê afirma "SEM CHAMADOR" trinta vezes, e nada conferia nenhuma.
 *
 * `docs/dossie/` é o documento que se propõe a sobreviver ao repositório — *"escrito de
 * forma que alguém possa reconstruir o produto do zero sem ter o código na frente"*. Ele é
 * escrito à mão, não é gerado (o `scripts/dossie.mjs` só costura as seções), e envelhece na
 * velocidade em que o código muda.
 *
 * Este repositório já resolveu esse problema duas vezes e não aplicou aqui: `bar.test.ts`
 * deriva do sistema todo número que o projeto afirma sobre si, e `plano.test.ts` cobra a
 * medida escrita de cada item da fila.
 *
 * **A classe escolhida é a que já falhou.** "SEM CHAMADOR" é a mesma pergunta do portão P1
 * — *quem chama isto?* —, um `grep` a responde, e em 11 de setembro uma dessas afirmações
 * estava errada em dois lugares: o `UnitStepper` ganhou tela em `app/picking.tsx` e o dossiê
 * continuou dizendo que ninguém o chamava. Consertei uma das duas ocorrências à mão naquele
 * dia e não perguntei quem MAIS afirmava aquilo — a regra da casa que eu já tinha quebrado
 * duas vezes na mesma semana.
 *
 * **E ao rodar pela primeira vez ela achou uma segunda espécie de mentira**, que eu não
 * esperava: três linhas afirmavam "SEM CHAMADOR" sobre `IconStock`, `IconCost` e `IconLoss`,
 * que **não existem mais** — saíram do código em 6 de setembro. Afirmar que algo existe sem
 * chamador é pior que vencido quando a coisa foi apagada: manda quem lê procurar o que não
 * está lá. As três passaram a dizer REMOVIDO, com o motivo.
 *
 * **E o que esta guarda NÃO confere, ela DIZ.** Das vinte e cinco afirmações, quatro estão em
 * forma ancorada (título de subseção ou primeira célula de linha de tabela) e as outras em prosa,
 * onde o símbolo não dá para extrair com confiança. Contar silêncio como aprovação seria o
 * defeito que este projeto persegue em toda parte — a guarda que não pode falhar. Então as
 * não conferidas entram numa contagem que também é cobrada: quando alguém acrescentar uma
 * afirmação em prosa, esta suíte avisa.
 */

const SECOES = 'docs/dossie';

/** Título de subseção: `#### 5.4.3 \`daysUntilExpiry\` — implementada, SEM CHAMADOR` */
const TITULO = /^#{3,6}\s+[\d.]*\s*`([A-Za-z_][A-Za-z0-9_]*)`.*SEM CHAMADOR/m;
/**
 * Primeira célula de tabela: `| \`GlyphStick\` (\`:277\`) | … | **SEM CHAMADOR** |`
 *
 * **E a citação não conta como afirmação.** Em 11 de setembro eu escrevi no próprio dossiê
 * uma tabela CORRIGINDO afirmações vencidas, e uma linha dela é
 * `| \`UnitStepper\` **SEM CHAMADOR** | chamado por app/picking.tsx |` — a frase antiga
 * citada ao lado do conserto. A primeira versão desta guarda leu a citação como o crime, que
 * é o mesmo defeito do gancho da sessão lendo um heredoc e do `debug-allow` da proofgate.
 *
 * A diferença é estrutural e não depende de palavra: na AFIRMAÇÃO o "SEM CHAMADOR" está numa
 * célula DEPOIS da que traz o símbolo; na citação, dentro da mesma célula. Por isso o padrão
 * exige a barra entre os dois.
 */
const LINHA = /^\|\s*`([A-Za-z_][A-Za-z0-9_]*)`[^|]*\|[^|]*(?:\|[^|]*)*SEM CHAMADOR/m;

/**
 * A frase entre ASPAS é citação, não afirmação.
 *
 * A outra metade do problema da citação, e ela não é estrutural: ao corrigir a tabela em
 * 11 de setembro eu escrevi na própria célula *`foi "SEM CHAMADOR" e deixou de ser`*, numa
 * célula posterior à do símbolo — forma idêntica à de uma afirmação de verdade. O que
 * distingue é o que o português já faz: frase citada vai entre aspas.
 *
 * Isto dá ao dossiê uma convenção com uma regra só, e ela é a mesma do gancho da sessão
 * apagando o corpo de heredoc antes de procurar o crime: **falar de uma coisa não é
 * fazê-la.**
 */
function semCitacao(linha: string): string {
  return linha.replace(/["“”']\s*\**\[?SEM CHAMADOR\]?\**\s*["“”']/g, ' (citação) ');
}

type Afirmacao = { secao: string; simbolo: string };

function afirmacoes(): { ancoradas: Afirmacao[]; emProsa: number } {
  const ancoradas: Afirmacao[] = [];
  let emProsa = 0;
  for (const nome of readdirSync(SECOES).sort()) {
    if (!nome.endsWith('.md')) continue;
    for (const linha of readFileSync(join(SECOES, nome), 'utf8').split('\n')) {
      if (!semCitacao(linha).includes('SEM CHAMADOR')) continue;
      const m = TITULO.exec(semCitacao(linha)) ?? LINHA.exec(semCitacao(linha));
      if (m) ancoradas.push({ secao: nome, simbolo: m[1] });
      else emProsa += 1;
    }
  }
  return { ancoradas, emProsa };
}

function fontes(dir: string, into: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) fontes(caminho, into);
    else if (/\.tsx?$/.test(nome) && !nome.includes('.test.')) into.push(caminho);
  }
  return into;
}

const PRODUCAO = [...fontes('src'), ...fontes('app')];
const TEXTO = new Map(PRODUCAO.map((p) => [p, readFileSync(p, 'utf8')]));

/**
 * Onde o símbolo é DEFINIDO — e `null` quando não se acha.
 *
 * Nulo não é "não existe": é "esta régua não sabe", e a diferença decide tudo. Duas das
 * nove afirmações caem aqui — `ready`, que é palavra genérica demais para um `grep`
 * distinguir, e `expedicao`, que não aparece como exportação nenhuma. Julgar sem achar a
 * definição foi o que a primeira versão desta régua fez: ela deu três "chamadores" para
 * `ready` por causa de desestruturações de objetos sem relação alguma.
 */
function ondeMora(simbolo: string): string | null {
  const declara = new RegExp(`^export (?:async function|function|const|type|class) ${simbolo}\\b`, 'm');
  for (const [caminho, texto] of TEXTO) if (declara.test(texto)) return caminho;
  return null;
}

/** Quem usa o símbolo fora do arquivo que o define. */
function chamadores(simbolo: string, dono: string): string[] {
  const uso = new RegExp(`<${simbolo}[\\s/>]|\\b${simbolo}\\s*\\(|[{,]\\s*${simbolo}\\s*[,}]`);
  return PRODUCAO.filter((p) => p !== dono && uso.test(TEXTO.get(p) ?? ''));
}

test('nenhuma afirmação de "SEM CHAMADOR" do dossiê está errada', () => {
  const mentindo: string[] = [];
  for (const { secao, simbolo } of afirmacoes().ancoradas) {
    const dono = ondeMora(simbolo);
    if (!dono) continue; // Não conferido, e a contagem abaixo cobra isso.
    const quem = chamadores(simbolo, dono);
    if (quem.length > 0) {
      mentindo.push(`${secao}: ${simbolo} é chamado por ${quem.join(', ')}`);
    }
  }
  assert.deepEqual(
    mentindo,
    [],
    'o dossiê diz que ninguém chama, e alguém chama. É o documento que se propõe a ' +
      'sobreviver ao repositório: corrija a seção no mesmo commit que deu chamador à peça.',
  );
});

test('a guarda diz quantas afirmações ela NÃO consegue conferir', () => {
  const { ancoradas, emProsa } = afirmacoes();
  const semDefinicao = ancoradas.filter((a) => ondeMora(a.simbolo) === null);

  // Os números são o recorte de 11 de setembro. Eles não são metas: são o que existe, e
  // mudá-los é o que obriga alguém a olhar de novo — inclusive para BAIXO, quando uma
  // afirmação em prosa virar ancorada ou sair.
  //
  // E baixou em 12 de setembro, de quatro para três, pelo caminho previsto: a afirmação
  // sobre `daysUntilExpiry` SAIU porque deixou de ser verdade — a fila de avisos passou a
  // chamá-la. Foi esta linha que obrigou a olhar de novo, como o comentário acima promete.
  assert.equal(ancoradas.length, 3, 'afirmações em forma ancorada, que esta guarda confere');
  assert.equal(
    semDefinicao.length,
    2, // `expedicao` é literal de texto (uma vaga do briefing), `ready` é palavra genérica.
    `destas, as que a régua não sabe julgar por não achar a definição: ` +
      `${semDefinicao.map((a) => a.simbolo).join(', ')}`,
  );
  assert.equal(
    emProsa,
    21,
    'afirmações em prosa, onde o símbolo não dá para extrair — contar silêncio como ' +
      'aprovação seria a guarda que não pode falhar',
  );
});

test('a régua distingue quem TEM chamador de quem não tem', () => {
  // Verdadeiro e falso contra o código de verdade, que é o que este projeto exige de toda
  // régua nova antes de ela dizer um número.
  const stepper = ondeMora('UnitStepper');
  assert.ok(stepper, 'o componente existe');
  assert.ok(
    chamadores('UnitStepper', stepper).length >= 2,
    'o UnitStepper ganhou tela em três lugares — a régua tem de ver isso',
  );

  // Era `daysUntilExpiry` e virou `multiplyCents` mais cedo no mesmo dia; a primeira ganhou
  // chamador e a segunda foi APAGADA por não ter nenhum. Um exemplo negativo que envelhece
  // — para positivo ou para o nada — é a régua provando o contrário do que promete, e por
  // isso o escolhido agora é o que só sai da lista com decisão do dono: `needsHumanYes` é
  // promessa feita antes das funcionalidades existirem, e continuará sem chamador até
  // alguém construir preço ou lançamento financeiro.
  const morto = ondeMora('needsHumanYes');
  assert.ok(morto, 'a função existe');
  assert.deepEqual(
    chamadores('needsHumanYes', morto),
    [],
    'e esta continua sem chamador de produção, que é o caso que a régua não pode inventar',
  );
});

test('a régua separa a AFIRMAÇÃO da citação que a corrige', () => {
  // O caso verdadeiro e o falso, nas duas formas reais que o dossiê tem hoje.
  const afirma = '| `GlyphStick` (`:277`) | três hastes | **SEM CHAMADOR** |';
  assert.equal(LINHA.exec(afirma)?.[1], 'GlyphStick', 'a afirmação é vista');

  const cita = '| `UnitStepper` **SEM CHAMADOR** | chamado por `app/picking.tsx:358` |';
  assert.equal(LINHA.exec(cita), null, 'a citação que corrige a afirmação NÃO é o crime');

  const titulo = '#### 5.4.3 `daysUntilExpiry` — implementada, SEM CHAMADOR';
  assert.equal(TITULO.exec(titulo)?.[1], 'daysUntilExpiry');

  // E a citação ENTRE ASPAS, que é a forma que uma correção escrita toma.
  const corrige = '| `UnitStepper` | 190 | implementado e chamado — foi "SEM CHAMADOR" e deixou de ser |';
  assert.equal(semCitacao(corrige).includes('SEM CHAMADOR'), false, 'a correção não é o crime');
  assert.ok(
    semCitacao('| `X` | **SEM CHAMADOR** |').includes('SEM CHAMADOR'),
    'e a afirmação sem aspas continua sendo vista',
  );
});

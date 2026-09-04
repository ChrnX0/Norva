import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Todo número que o projeto afirma sobre si mesmo, conferido contra o sistema.
 *
 * **Duas cicatrizes no mesmo dia, e as duas do mesmo tipo.** O `CLAUDE.md` — o
 * arquivo que toda sessão lê primeiro — dizia *"Postgres descartável, **oito**
 * garantias"* no dia em que o `db:verify` passou a ter nove. E a tabela do
 * `docs/roadmap.md`, escrita naquela manhã com o título *"onde o produto está hoje
 * — medido, não afirmado"*, estava velha em quatro linhas antes do fim da tarde.
 *
 * O plano tem uma regra sobre exatamente isso, e ela existe porque a alternativa
 * apodrece: *"item novo entra com evidência de arquivo — `arquivo:linha` que
 * sustenta o estado; sem isso é palpite, e palpite em plano tem a mesma cara de
 * fato"*. A tabela até traz a coluna **como conferir**, com o comando ao lado de
 * cada número. Mas um comando escrito é um convite, não uma garantia: ninguém roda
 * quinze comandos antes de acreditar numa tabela.
 *
 * **Este arquivo é aquela coluna, executada.** Cada linha deriva o número do
 * sistema e exige que os documentos digam o mesmo. O lado que manda é sempre o
 * sistema; o documento é o que pode estar errado.
 *
 * É a regra que o `erase.test.ts` aprendeu no mesmo dia, aplicada à prosa: uma
 * guarda que compara duas coisas escritas pela mesma mão não guarda nada, e a
 * pergunta certa é de onde vem o outro lado da comparação.
 *
 * **O que ele não faz, dito em vez de omitido:** não roda o `db:verify` nem o
 * `mutate` — isso custa um Postgres e seis minutos. Ele lê os arquivos, que basta
 * para a única coisa que dá para errar aqui: acrescentar uma peça e esquecer de
 * contar. Um `mutate` que passasse a FALHAR não seria pego por aqui; é trabalho do
 * `mutate`.
 */

const ler = (p: string) => readFileSync(p, 'utf8');
const conta = (texto: string, re: RegExp) => [...texto.matchAll(re)].length;

const SCRIPT = ler('scripts/verify-migrations.sh');
const CLAUDE = ler('CLAUDE.md');
const PLANO = ler('docs/roadmap.md');
const DB = ler('src/data/db.ts');
const ACESSO = ler('src/domain/access.ts');

const MIGRACOES = readdirSync('supabase/migrations');
const SERVIDOR = MIGRACOES.map((f) => ler(join('supabase/migrations', f))).join('\n');

/** Todo arquivo de teste sob `src/`, que é o que o `npm test` roda. */
function testes(dir: string, into: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) testes(caminho, into);
    else if (/\.test\.ts$/.test(entrada)) into.push(caminho);
  }
  return into;
}

/** Português por extenso, que é como a prosa deste projeto escreve número. */
const POR_EXTENSO = [
  'zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito',
  'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis',
  'dezessete', 'dezoito', 'dezenove', 'vinte',
];
const IN_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

const GARANTIAS = conta(SCRIPT, /^echo "==> check /gm);

// ── o db:verify, dito em três lugares e conferido contra um ──────────────────

test('the database checks are numbered without a gap', () => {
  assert.ok(GARANTIAS > 5, `o script foi lido com ${GARANTIAS} checagens — a comparação seria de graça`);
  const numeros = [...SCRIPT.matchAll(/^echo "==> check (\d+):/gm)].map((m) => Number(m[1]));
  assert.deepEqual(
    numeros,
    Array.from({ length: GARANTIAS }, (_, i) => i + 1),
    'as checagens do db:verify pulam ou repetem um número — a saída fica impossível de acompanhar',
  );
});

test('the script says how many guarantees it actually has', () => {
  const dito = SCRIPT.match(/all (\w+) guarantees hold/);
  assert.ok(dito, 'a frase final do db:verify sumiu — é ela que anuncia o veredito');
  assert.equal(
    dito[1],
    IN_WORDS[GARANTIAS],
    `o script tem ${GARANTIAS} checagens e a frase final diz "${dito[1]}". ` +
      'Quem acrescenta uma checagem tem que mexer nos dois lugares, e o segundo é fácil de esquecer.',
  );
});

test('CLAUDE.md states the number of guarantees the script really has', () => {
  const dito = CLAUDE.match(/Postgres descartável, (\w+) garantias/);
  assert.ok(
    dito,
    'o bloco de comandos do CLAUDE.md deixou de nomear as garantias do db:verify — ' +
      'ele é o primeiro arquivo que toda sessão lê, e é por ele que se sabe o que a barra faz',
  );
  assert.equal(
    dito[1],
    POR_EXTENSO[GARANTIAS],
    `o db:verify tem ${GARANTIAS} garantias e o CLAUDE.md diz "${dito[1]}". ` +
      'Não é história datada, é referência: quem ler começa a sessão com o número errado na cabeça.',
  );
});

// ── a tabela do plano: cada linha, derivada ──────────────────────────────────

/**
 * O rótulo da linha no `docs/roadmap.md`, e de onde o número sai de verdade.
 *
 * Acrescentar uma linha à tabela sem acrescentar uma entrada aqui não quebra nada
 * — e essa é a fronteira honesta desta guarda: ela confere o que foi registrado,
 * não descobre o que não foi. O que ela impede é o número registrado envelhecer,
 * que é o que aconteceu duas vezes num dia.
 */
const TABELA: { rotulo: string; derivar: () => number }[] = [
  { rotulo: 'telas', derivar: () => contaTelas() },
  { rotulo: 'tabelas no aparelho \\(SQLite\\)', derivar: () => conta(DB, /CREATE TABLE IF NOT EXISTS/g) },
  { rotulo: 'tabelas no servidor \\(Postgres\\)', derivar: () => conta(SERVIDOR, /^create table /gm) },
  { rotulo: 'migrações do servidor', derivar: () => MIGRACOES.length },
  { rotulo: 'papéis', derivar: () => conta(papeis(), /^ {2}[A-Za-z]+:/gm) },
  { rotulo: 'capacidades', derivar: () => new Set([...ACESSO.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])).size },
  { rotulo: '`npm test`', derivar: () => testes('src').reduce((n, f) => n + conta(ler(f), /^test\(/gm), 0) },
  { rotulo: '`npm run mutate`', derivar: () => conta(ler('scripts/mutate.mjs'), /^ {4}file: '/gm) },
  { rotulo: '`npm run e2e:fast`', derivar: () => conta(ler('e2e/flow.mjs'), /^check\(/gm) },
  { rotulo: '`npm run db:verify`', derivar: () => GARANTIAS },
];

/** As telas: tudo em `app/` que não é layout. */
function contaTelas(): number {
  const achar = (dir: string, into: string[] = []): string[] => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) achar(caminho, into);
      else if (/\.tsx$/.test(entrada) && !entrada.startsWith('_layout')) into.push(caminho);
    }
    return into;
  };
  return achar('app').length;
}

/** O corpo do `ROLES`, para contar as chaves sem pegar o resto do arquivo. */
function papeis(): string {
  const depois = ACESSO.split('export const ROLES')[1] ?? '';
  return depois.split('\n};')[0] ?? '';
}

test('every number the plan states about the system is the number the system has', () => {
  assert.ok(TABELA.length > 5, 'a lista de linhas chegou vazia — a comparação seria de graça');

  const errados: string[] = [];
  for (const { rotulo, derivar } of TABELA) {
    const linha = PLANO.match(new RegExp(`^\\| ${rotulo} \\| \\*\\*([\\d.]+)\\*\\*`, 'm'));
    if (!linha) {
      errados.push(`"${rotulo}": a linha sumiu da tabela do plano`);
      continue;
    }
    const escrito = Number(linha[1].replace(/\./g, ''));
    const real = derivar();
    if (escrito !== real) errados.push(`"${rotulo}": o plano diz ${escrito}, o sistema tem ${real}`);
  }

  assert.deepEqual(
    errados,
    [],
    `a tabela "onde o produto está hoje" do docs/roadmap.md envelheceu:\n  ${errados.join('\n  ')}\n` +
      'Ela se chama "medido, não afirmado" e traz a coluna "como conferir" ao lado de cada ' +
      'número — mas comando escrito é convite, não garantia. O lado que manda é o sistema.',
  );
});

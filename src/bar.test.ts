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
  'dezessete', 'dezoito', 'dezenove', 'vinte', 'vinte e uma', 'vinte e duas',
  'vinte e três', 'vinte e quatro', 'vinte e cinco', 'vinte e seis',
  'vinte e sete', 'vinte e oito', 'vinte e nove', 'trinta', 'trinta e uma',
  'trinta e duas', 'trinta e três', 'trinta e quatro',
];
/** As outras grafias certas do mesmo número. Português tem mais de uma. */
const SINONIMOS: Record<string, readonly string[]> = {
  quatorze: ['catorze'],
  dezesseis: ['dezasseis'],
  dezessete: ['dezassete'],
  dezenove: ['dezanove'],
};

const IN_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'twenty-one',
  'twenty-two', 'twenty-three', 'twenty-four', 'twenty-five', 'twenty-six',
  'twenty-seven', 'twenty-eight', 'twenty-nine', 'thirty', 'thirty-one',
  'thirty-two', 'thirty-three', 'thirty-four',
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
  const dito = SCRIPT.match(/all ([\w-]+) guarantees hold/);
  assert.ok(dito, 'a frase final do db:verify sumiu — é ela que anuncia o veredito');
  assert.equal(
    dito[1],
    IN_WORDS[GARANTIAS],
    `o script tem ${GARANTIAS} checagens e a frase final diz "${dito[1]}". ` +
      'Quem acrescenta uma checagem tem que mexer nos dois lugares, e o segundo é fácil de esquecer.',
  );
});

test('CLAUDE.md states the number of guarantees the script really has', () => {
  const dito = CLAUDE.match(/Postgres descartável, ([\wà-ú ]+?) garantias/);
  assert.ok(
    dito,
    'o bloco de comandos do CLAUDE.md deixou de nomear as garantias do db:verify — ' +
      'ele é o primeiro arquivo que toda sessão lê, e é por ele que se sabe o que a barra faz',
  );
  // Duas grafias corretas do mesmo número não são duas respostas: "catorze" e
  // "quatorze" estão as duas no dicionário, e um guarda que aceita só uma manda
  // consertar o que não está errado — o tipo de aviso que ensina a ignorar
  // aviso. O que ele guarda é o NÚMERO.
  // E a tabela por extenso tem fim: ela foi escrita até o número de então, e no dia
  // em que a garantia 22 entrou ela não sabia escrever 22 — reprovou dizendo que os
  // dois números CONCORDAVAM, porque a mensagem imprimia o algarismo e a grafia sem
  // dizer que a grafia esperada não existia. Uma guarda que mente na recusa custa a
  // rodada de quem a lê: eu fui procurar defeito na mudança, não na régua.
  assert.ok(
    POR_EXTENSO[GARANTIAS] !== undefined,
    `o db:verify tem ${GARANTIAS} garantias e esta guarda só sabe escrever até ` +
      `${POR_EXTENSO.length - 1}. Acrescente a grafia em POR_EXTENSO e em IN_WORDS — ` +
      'o defeito é aqui, não no script.',
  );
  const grafias = [POR_EXTENSO[GARANTIAS], ...(SINONIMOS[POR_EXTENSO[GARANTIAS]] ?? [])];
  assert.ok(
    grafias.includes(dito[1]),
    `o db:verify tem ${GARANTIAS} garantias e o CLAUDE.md diz "${dito[1]}", ` +
      `quando devia dizer "${POR_EXTENSO[GARANTIAS]}". ` +
      'Não é história datada, é referência: quem ler começa a sessão com o número errado na cabeça.',
  );
});

/**
 * Quantas garantias exercitam POLÍTICA e quantas provam FORMA — derivado, não lembrado.
 *
 * **A frase que este guarda existe para impedir foi escrita por mim em 11 de setembro**,
 * na tabela do roadmap e no corpo do PR: *"29 garantias contra Postgres, sob RLS"*. São 29
 * garantias e **não** são 29 sob RLS. O script conecta como dono do banco e troca para
 * `app_user` só onde imita o cliente (`as_user`); as outras rodam como dono porque o que
 * elas provam é forma — gatilho, restrição, chave composta, e uma que lê `pg_policies` do
 * catálogo.
 *
 * E as duas metades provam coisas diferentes, o que é o motivo de a frase importar: sob
 * RLS prova **aceitação** (o servidor deixa esta conta escrever isto?); como dono prova
 * **impossibilidade** (nem o dono do banco quebra), que é mais forte e é exatamente o que
 * o razão precisa — `DELETE` em `movements` é recusado até para o dono. Dizer "tudo sob
 * RLS" troca as duas e enfraquece o que é forte enquanto exagera o que é fraco.
 *
 * A régua é heurística — ela lê o texto do bloco — então ela **tem de distinguir**: se
 * passar a casar com tudo ou com nada, as duas contagens denunciam antes de a frase virar
 * número. Guarda que não pode falhar é o defeito que este repositório proíbe.
 */
function divisaoDoBanco(): { sobRls: number; deForma: number } {
  const inicios = [...SCRIPT.matchAll(/^echo "==> check \d+:/gm)].map((m) => m.index ?? 0);
  let sobRls = 0;
  for (let i = 0; i < inicios.length; i += 1) {
    const bloco = SCRIPT.slice(inicios[i], inicios[i + 1] ?? SCRIPT.length);
    if (/as_user|set role app_user|rows_as/.test(bloco)) sobRls += 1;
  }
  return { sobRls, deForma: inicios.length - sobRls };
}

test('the plan says which guarantees run under RLS and which prove shape', () => {
  const { sobRls, deForma } = divisaoDoBanco();
  assert.ok(
    sobRls > 0 && deForma > 0,
    `a régua da divisão deixou de distinguir: ${sobRls} sob RLS e ${deForma} de forma. ` +
      'Uma das duas zerada quer dizer que o padrão casa com tudo ou com nada, e aí o ' +
      'número que ela produz não existe.',
  );
  assert.equal(sobRls + deForma, GARANTIAS, 'a divisão não soma as garantias do script');

  const linha = PLANO.match(/\| `npm run db:verify` \| ([^|]+)\|/);
  assert.ok(linha, 'a linha do db:verify sumiu da tabela "medido, não afirmado"');
  assert.match(
    linha[1],
    new RegExp(`\\*\\*${sobRls}\\*\\*[^|]*RLS`),
    `${sobRls} garantias rodam sob RLS e a tabela do plano não diz esse número. ` +
      'A frase anterior dizia que as 29 rodavam sob RLS, e 14 delas rodam como dono do ' +
      'banco de propósito — são duas provas diferentes e a tabela tem de separá-las.',
  );
  assert.match(
    linha[1],
    new RegExp(`\\*\\*${deForma}\\*\\*`),
    `${deForma} garantias provam forma como dono do banco, e a tabela não diz esse número.`,
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
type Linha = {
  /** O rótulo, como expressão regular: é ele que acha a linha na tabela. */
  rotulo: string;
  /** De onde o número sai de verdade. */
  derivar: () => number;
  /**
   * Como o valor está ESCRITO na tabela, quando não é um inteiro puro.
   *
   * Sem isto, duas linhas ficavam de fora sem ninguém saber: `**V22**` e
   * `**~45.000**` não casam com `\*\*([\d.]+)\*\*`, e a guarda apenas não as
   * encontrava — e não encontrar não era erro, era silêncio.
   */
  valor?: string;
  /**
   * A folga aceita, em fração, para o que MUDA a cada commit.
   *
   * Só a contagem de linhas usa isto, e o motivo é honesto: ela é uma escala,
   * não um fato. Guardá-la por igualdade deixaria a suíte vermelha em todo
   * commit; guardá-la por nada foi o que deixou `~45.000` de pé enquanto o
   * repositório passava de setenta mil — 59% acima, na linha cujo título diz
   * "medido, não afirmado".
   */
  banda?: number;
};

const TABELA: Linha[] = [
  { rotulo: 'telas', derivar: () => contaTelas() },
  { rotulo: 'tabelas no aparelho \\(SQLite\\)', derivar: () => conta(DB, /CREATE TABLE IF NOT EXISTS/g) },
  { rotulo: 'tabelas no servidor \\(Postgres\\)', derivar: () => conta(SERVIDOR, /^create table /gm) },
  { rotulo: 'migrações do servidor', derivar: () => MIGRACOES.length },
  { rotulo: 'migrações do aparelho', derivar: () => versaoDoAparelho(), valor: '\\*\\*V(\\d+)\\*\\*' },
  { rotulo: 'papéis', derivar: () => conta(papeis(), /^ {2}[A-Za-z]+:/gm) },
  { rotulo: 'capacidades', derivar: () => conta(capacidades(), /^ {2}'[a-z_]+',$/gm) },
  { rotulo: 'linhas de código', derivar: () => linhasDeCodigo(), valor: '\\*\\*~([\\d.]+)\\*\\*', banda: 0.1 },
  { rotulo: '`npm test`', derivar: () => testes('src').reduce((n, f) => n + conta(ler(f), /^test\(/gm), 0) },
  { rotulo: '`npm run mutate`', derivar: () => conta(ler('scripts/mutate.mjs'), /^ {4}file: '/gm) },
  { rotulo: '`npm run e2e:fast`', derivar: () => conta(ler('e2e/flow.mjs'), /^check\(/gm) },
  { rotulo: '`npm run db:verify`', derivar: () => GARANTIAS },
  { rotulo: '`\\.proofgate/verify\\.sh`', derivar: () => readdirSync('.proofgate/guards.d').filter((f) => f.endsWith('.sh')).length },
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

/**
 * O corpo do `capabilities` — e por que ele precisou virar função.
 *
 * **A cicatriz é desta guarda contra si mesma.** A derivação era
 * `new Set([...ACESSO.matchAll(/'([a-z_]+)'/g)])` sobre o ARQUIVO INTEIRO, e o
 * arquivo tem duas listas: as doze capacidades e os sete papéis. Seis dos sete
 * papéis são minúsculos (`'owner'`, `'operator'`, `'driver'`, `'buyer'`,
 * `'customer'`, `'salesperson'`) e entravam na conta; `'storeManager'` escapava
 * só por ter maiúscula. Doze mais seis dá dezoito, e o plano dizia dezoito.
 *
 * Então a guarda ficou VERDE afirmando um número errado, porque o documento
 * tinha sido escrito a partir dela. E a linha de cima da mesma tabela já dizia
 * `papéis | 7` — ou seja, os papéis eram contados duas vezes, uma delas com o
 * nome errado, e nada podia perceber: a única fonte independente é o enum
 * `capability` do Postgres, que tem doze valores.
 *
 * A lição é a da casa, virada para dentro: **uma guarda que deriva do escopo
 * errado não é uma guarda folgada, é uma guarda que fabrica o número que o
 * documento vai repetir.** O recorte agora é o mesmo do `ROLES` — o corpo da
 * lista, e nada além dele.
 */
function capacidades(): string {
  const depois = ACESSO.split('export const capabilities = [')[1] ?? '';
  return depois.split('\n] as const;')[0] ?? '';
}

/** A última migração do aparelho, que é escrita `V22` e não `22`. */
function versaoDoAparelho(): number {
  const todas = [...DB.matchAll(/^const V(\d+) =/gm)].map((m) => Number(m[1]));
  return todas.length ? Math.max(...todas) : 0;
}

/** As linhas de código, pelo mesmo comando que a tabela oferece ao leitor. */
function linhasDeCodigo(): number {
  const achar = (dir: string, into: string[] = []): string[] => {
    for (const entrada of readdirSync(dir)) {
      if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) achar(caminho, into);
      else if (/\.(tsx?|sql|mjs)$/.test(entrada)) into.push(caminho);
    }
    return into;
  };
  const arquivos = ['src', 'app', 'e2e', 'scripts', 'supabase'].flatMap((d) => achar(d));
  return arquivos.reduce((n, f) => n + ler(f).split('\n').length - 1, 0);
}

test('every number the plan states about the system is the number the system has', () => {
  assert.ok(TABELA.length > 5, 'a lista de linhas chegou vazia — a comparação seria de graça');

  const errados: string[] = [];
  for (const { rotulo, derivar, valor, banda } of TABELA) {
    const linha = PLANO.match(new RegExp(`^\\| ${rotulo} \\| ${valor ?? '\\*\\*([\\d.]+)\\*\\*'}`, 'm'));
    if (!linha) {
      errados.push(`"${rotulo}": a linha sumiu da tabela do plano`);
      continue;
    }
    const escrito = Number(linha[1].replace(/\./g, ''));
    const real = derivar();
    if (banda) {
      const folga = Math.abs(escrito - real) / Math.max(real, 1);
      if (folga > banda) {
        errados.push(
          `"${rotulo}": o plano diz ~${escrito}, o sistema tem ${real} — ${(folga * 100).toFixed(0)}% de diferença, ` +
            `e a folga desta linha é ${(banda * 100).toFixed(0)}%`,
        );
      }
      continue;
    }
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

/**
 * E a metade que faltava: **linha da tabela sem derivação não existe.**
 *
 * O docblock do `TABELA` admitia a fronteira em voz alta — *"acrescentar uma
 * linha à tabela sem acrescentar uma entrada aqui não quebra nada"* — e o
 * roadmap, quatro linhas depois do seu próprio título, prometia o contrário:
 * *"`src/bar.test.ts` roda essa coluna: cada linha é derivada do sistema"*. Uma
 * auditoria de 7 de setembro mediu a distância entre as duas frases: **dez das
 * treze linhas**. As três de fora eram a versão do aparelho, a contagem de
 * linhas de código e o número de guardas da proofgate — e duas delas estavam
 * erradas, uma por 59%.
 *
 * Fronteira dita em voz alta continua sendo fronteira. Agora a promessa do
 * roadmap é a que vale, e quem escrever a décima quarta linha sem derivação
 * fica vermelho aqui.
 */
test('every row of the plan tables has a derivation behind it', () => {
  const inicio = PLANO.indexOf('## Onde o produto está hoje');
  assert.ok(inicio > 0, 'a seção medida mudou de nome — a guarda deixou de olhar para ela');
  const fim = PLANO.indexOf('\n## ', inicio + 1);
  const secao = PLANO.slice(inicio, fim);

  const semDerivacao: string[] = [];
  for (const linha of secao.split('\n')) {
    if (!linha.startsWith('| ')) continue;
    if (/^\|\s*\|/.test(linha) || /^\|-+/.test(linha)) continue; // cabeçalho e separador
    const rotulo = linha.slice(2, linha.indexOf(' | '));
    const coberta = TABELA.some(({ rotulo: re }) => new RegExp(`^${re}$`).test(rotulo));
    if (!coberta) semDerivacao.push(rotulo);
  }

  assert.deepEqual(
    semDerivacao,
    [],
    `estas linhas da tabela do plano não são derivadas de nada:\n  ${semDerivacao.join('\n  ')}\n` +
      'Enquanto não tiverem uma entrada em TABELA, o número que estiver ali é palpite com cara de medida.',
  );
});

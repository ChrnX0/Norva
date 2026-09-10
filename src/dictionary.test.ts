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
 * **E o buraco que este docblock admitia em voz alta foi fechado em 9 de setembro.**
 * A frase que estava aqui dizia: *"ele mede SEÇÃO, não chave; uma varredura por chave
 * acusou 44 folhas sem leitor aparente, e boa parte é falso positivo do detector"*.
 * Honestidade em comentário documenta o buraco para quem lê o teste; quem lê a
 * promessa lê que o dicionário tem leitor. O `CLAUDE.md` não deixa terceira saída:
 * *"se a promessa é boa, feche o buraco; se não é, corrija a promessa"*.
 *
 * O buraco fechou porque o falso positivo tinha causa nomeável, não porque eu
 * aceitei o alarme: o detector antigo não sabia de **índice dinâmico**. `words[recusa]`
 * em `app/backup.tsx` lê três chaves sem escrever o nome de nenhuma, e `words` é um
 * apelido de `t.app.backup` criado três linhas acima. O leitor de chave abaixo resolve
 * apelido por arquivo e trata todo caminho indexado como lido inteiro — e com isso as
 * 44 viraram **39 de verdade**, das quais 35 eram sobra e duas eram tela calada.
 *
 * As duas telas caladas, para o registro: `app.catalog.typeFromAnotherLine` — a tela
 * imprimia `String(e)`, então a recusa chegava como inglês de programador enquanto a
 * frase existia nos três idiomas — e `app.lotLabel.scanUnknown`, que ninguém dizia
 * porque a etiqueta respondia *"esse lote não está mais aqui"* a quem tinha apontado
 * a câmera para um quadrado que nunca foi lote nenhum.
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

/**
 * O dicionário não fala o nome de um equipamento que o dono não usa.
 *
 * **Cobrado pelo dono em 8 de setembro, com estas palavras: *"que droga é essa de
 * tacho?!"*** Eu tinha inventado o termo *"sala do tacho"* numa pergunta a ele e,
 * ao conferir, o repositório inteiro falava assim — e não só nos comentários:
 * quatro frases de tela em português, três em inglês (*vat*, *the pot*) e seis em
 * espanhol (*paila*) nomeavam a panela em que se cozinha a mistura.
 *
 * **O defeito não é a palavra ser feia, é ela ser de outro mundo.** É a mesma
 * família das três árvores e dois pássaros que ele recusou no cabeçalho de Ajustes:
 * o aplicativo vai para as duas lojas, será instalado por quem fabrica sabonete,
 * ração e pão de queijo, e metade dessas fábricas não tem tacho nenhum. O
 * `CLAUDE.md` já mandava *"nada de regra chumbada de sorvete"* — vocabulário
 * chumbado é a mesma coisa, mais difícil de ver porque compila.
 *
 * A régua é a fundação: **`Widen<T>` faz chave nova quebrar a compilação das outras
 * duas até serem escritas**, e este teste é o par dela para o CONTEÚDO — a palavra
 * proibida entra em qualquer idioma e a suíte reprova, em vez de a correção durar
 * uma sessão.
 *
 * O positivo e o negativo estão no teste de baixo, porque detector novo que não
 * distingue um caso verdadeiro de um falso não pode reportar número nenhum — regra
 * paga duas vezes nesta casa, com duas medidas erradas no mesmo dia.
 */
const NOME_DE_EQUIPAMENTO = [
  // pt: tacho, tacha; caldeirão; panela
  /\btachos?\b/i,
  /\bcaldeir(ão|ões)\b/i,
  /\bpanelas?\b/i,
  // es: paila, olla
  /\bpailas?\b/i,
  /\bollas?\b/i,
  // en: vat, kettle, pot — `\b` e não substring, senão "private" e "spot" acusam
  /\bvats?\b/i,
  /\bkettles?\b/i,
  /\bpots?\b/i,
];

/** Toda folha de texto de um dicionário, achatada, com o caminho até ela. */
function frasesDe(no: unknown, caminho: string[] = []): { onde: string; texto: string }[] {
  if (typeof no === 'string') return [{ onde: caminho.join('.'), texto: no }];
  if (no === null || typeof no !== 'object') return [];
  return Object.entries(no as Record<string, unknown>).flatMap(([chave, valor]) =>
    frasesDe(valor, [...caminho, chave]),
  );
}

test('no screen names a piece of equipment the owner does not use', async () => {
  const idiomas = {
    'pt-BR': (await import('./i18n/locales/pt-BR')).ptBR,
    en: (await import('./i18n/locales/en')).en,
    es: (await import('./i18n/locales/es')).es,
  };

  const achados: string[] = [];
  for (const [idioma, dic] of Object.entries(idiomas)) {
    const frases = frasesDe(dic);
    assert.ok(frases.length > 200, `${idioma}: a varredura veio vazia — a comparação seria de graça`);
    for (const { onde, texto } of frases) {
      const regua = NOME_DE_EQUIPAMENTO.find((r) => r.test(texto));
      if (regua) achados.push(`${idioma} ${onde}: "${texto}"`);
    }
  }

  assert.deepEqual(
    achados,
    [],
    `o dicionário nomeia equipamento que nem toda fábrica tem:\n  ${achados.join('\n  ')}\n` +
      'O aplicativo vai para as duas lojas e será instalado por quem faz sabonete, ração e ' +
      'pão de queijo. Diga o que ACONTECE — produção, receita, o que saiu — nunca em que ' +
      'panela aconteceu.',
  );
});

/**
 * As frases de um arquivo que NOMEIAM equipamento — e o que ele deixa passar, de propósito.
 *
 * Só o que está entre aspas, e só fora de comentário. As duas exclusões existem pela
 * mesma razão e ela é sobre a sobrevivência da guarda: nomear a palavra é como se
 * explica por que ela saiu, então uma régua que reprova o docblock que a explica — e o
 * desta própria função, que cita *tacho* três vezes — ensina a desligá-la. Guard que
 * grita no lugar errado morre desligado, não corrigido.
 *
 * **O estado de bloco não é zelo: é uma cicatriz de dez minutos atrás.** A primeira
 * versão olhava só o começo da linha, e um comentário de JSX (`{/* ... *​/}`) tem as
 * linhas seguintes começando em texto puro. Ela acusou um comentário do `Mosaic` que
 * dizia, com estas palavras, que o widget antigo usava *"uma palavra de fábrica de
 * sorvete"* — alguém já tinha visto o defeito e escrito isso, meses antes de o dono
 * cobrar, e a guarda quase reprovou a única linha do repositório que concordava com ela.
 *
 * O que ele deixa passar, dito em vez de escondido: uma linha de código que ABRE um
 * comentário no fim dela. Fechar isso pediria um analisador, e o que se ganharia é uma
 * frase de tela escrita ao lado de um `/*` — que não existe neste repositório e teria de
 * ser escrita de propósito.
 */
export function falaEquipamento(fonte: string): { linha: number; trecho: string }[] {
  // **A crase entra na régua, e faltava.**
  //
  // A guarda lia aspas simples e duplas, e o texto que o assistente FALA é montado
  // em template literal: `${n} tachos de ${nome}`. Ela achava zero e havia três — a
  // palavra que este projeto tirou de treze lugares em três idiomas continuava
  // saindo da boca do aplicativo, na resposta que a pessoa lê.
  //
  // É a terceira vez nesta casa que uma régua tropeça na crase; a diferença é que
  // as outras duas quebravam o código e esta ficava calada.
  const emAspas = /'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g;
  const achados: { linha: number; trecho: string }[] = [];
  let emBloco = false;
  for (const [n, linha] of fonte.split('\n').entries()) {
    const cru = linha.trimStart();
    const abre = cru.includes('/*');
    const fecha = linha.includes('*/');
    const eraBloco = emBloco;
    if (abre && !fecha) emBloco = true;
    else if (fecha) emBloco = false;
    if (eraBloco || abre || cru.startsWith('*') || cru.startsWith('//')) continue;
    // A exceção do casador do assistente: ACEITAR a palavra de quem fala é o contrário
    // de impor a de uma indústria. Por linha e escrita, nunca herdada.
    if (linha.includes('entrada, não fala')) continue;
    for (const trecho of linha.match(emAspas) ?? []) {
      if (NOME_DE_EQUIPAMENTO.some((r) => r.test(trecho))) achados.push({ linha: n + 1, trecho });
    }
  }
  return achados;
}

/**
 * O dicionário não é o único lugar que fala português — e a guarda de cima só olha ele.
 *
 * **Buraco achado no mesmo commit em que a guarda nasceu**, e é a forma exata da
 * fronteira que este projeto manda fechar em vez de documentar: o assistente escreve
 * as frases dele no código (`src/assistant/skills.ts`), a camada de dados escreve a
 * mensagem de erro, e nenhuma das duas passa por `src/i18n/locales/`. Sete das treze
 * ocorrências de *tacho* estavam ali, fora do alcance da varredura que eu tinha
 * acabado de escrever.
 *
 * **E a distinção que esta guarda precisa fazer é a que importa: ACEITAR não é FALAR.**
 * O casador do assistente continua entendendo *"em 2 tachos"*, e tem de continuar —
 * recusar o vocabulário de quem usa é o contrário do que a correção do dono pediu. O
 * que ele não pode é responder com a palavra. Por isso a exceção é por LINHA e escrita
 * (`// entrada, não fala`), do mesmo jeito que os marcadores da proofgate: quem
 * precisar dela justifica, e ninguém a ganha em silêncio.
 */
test('nothing outside the dictionary speaks the equipment name either', () => {
  const arquivos: string[] = [];
  const varrer = (dir: string) => {
    for (const entrada of readdirSync(dir)) {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) {
        varrer(caminho);
      } else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) {
        arquivos.push(caminho);
      }
    }
  };
  varrer('src');
  varrer('app');
  assert.ok(arquivos.length > 100, 'a varredura de arquivos veio vazia — a comparação seria de graça');

  const achados: string[] = [];
  for (const arquivo of arquivos) {
    if (arquivo.includes('locales')) continue; // a guarda de cima já cobre, e melhor
    for (const { linha, trecho } of falaEquipamento(readFileSync(arquivo, 'utf8'))) {
      achados.push(`${arquivo}:${linha}: ${trecho}`);
    }
  }

  assert.deepEqual(
    achados,
    [],
    `estas frases nomeiam equipamento fora do dicionário:\n  ${achados.join('\n  ')}\n` +
      'Diga o que ACONTECE, nunca em que panela aconteceu. Se a linha ACEITA a palavra de ' +
      'quem fala (um casador do assistente) em vez de dizê-la, escreva `// entrada, não fala` ' +
      'nela — a exceção é por linha e é justificada, nunca herdada.',
  );
});

test('the equipment guard tells a real name from a word that merely contains one', () => {
  const pega = (texto: string) => NOME_DE_EQUIPAMENTO.some((r) => r.test(texto));

  // Positivos: cada régua contra uma frase que ela existe para pegar.
  assert.ok(pega('A linha inteira — do tacho à caixa que saiu.'), 'tacho');
  assert.ok(pega('sin paila abierta, nada hecho'), 'paila');
  assert.ok(pega('from the vat to the crate that left'), 'vat');
  assert.ok(pega('what came out of the pot'), 'pot');
  assert.ok(pega('Trabalho por caldeirão'), 'caldeirão');

  // Negativos, e são eles que decidem se a régua serve: `\b` contra substring. Sem
  // ele "private", "innovative" e "spot" acusariam, o teste viraria ruído, e a
  // próxima pessoa o desligaria — que é como um guard morre.
  assert.ok(!pega('private.has_capability'), 'private contém "vat"');
  assert.ok(!pega('An innovative way to pack'), 'innovative contém "vat"');
  assert.ok(!pega('Spot the difference'), 'spot contém "pot"');
  assert.ok(!pega('Depot da transportadora'), 'depot contém "pot"');
  assert.ok(!pega('a produção de hoje'), 'a frase que substituiu o defeito tem de passar');
  assert.ok(!pega('Quantas vezes a receita rodou'), 'o rótulo já corrigido tem de passar');
});

test('the file scanner bites a spoken name and leaves the comment that explains it alone', () => {
  // Positivo: a frase de tela, que é o caso inteiro.
  const fala = falaEquipamento("  return { text: 'Nada saiu do tacho hoje ainda.' };");
  assert.deepEqual(
    fala.map((f) => f.trecho),
    ["'Nada saiu do tacho hoje ainda.'"],
    'a frase de tela tem que reprovar, senão a guarda não guarda nada',
  );

  // Negativo 1: o docblock que conta a cicatriz. Sem isto a guarda reprova a si mesma.
  assert.deepEqual(falaEquipamento(' * Quem disser "em 2 tachos" é obedecido ao pé da letra.'), []);
  assert.deepEqual(falaEquipamento('// o widget "tacho" saiu da capa em setembro'), []);

  // Negativo 2: o comentário de JSX, cujas linhas seguintes começam em texto puro — o
  // caso que a primeira versão errou, acusando a única linha do repositório que já
  // dizia que "tacho" era palavra de fábrica de sorvete.
  const jsx = ['        {/* O pulso vive aqui.', '            Ele era o widget "tacho", que', '            dizia o mesmo. */}'].join('\n');
  assert.deepEqual(falaEquipamento(jsx), [], 'comentário de JSX não é fala de tela');

  // Negativo 3: a exceção escrita, e ela é por LINHA.
  assert.deepEqual(
    falaEquipamento("      /rodei ([\\d]+) tachos?/, // entrada, não fala"),
    [],
    'aceitar a palavra de quem fala é o contrário de impor a de uma indústria',
  );
  // E a linha seguinte NÃO herda a exceção: marcador que vaza para baixo é a forma que
  // a proofgate chama de `dead-allow`, com o sinal trocado.
  assert.deepEqual(
    falaEquipamento("      /rodei ([\\d]+) tachos?/, // entrada, não fala\n      const frase = 'um tacho rodou';").map((f) => f.linha),
    [2],
    'a exceção vale na linha dela e só nela',
  );

  // Negativo 4: código sem aspas nenhuma, e a palavra que só CONTÉM a proibida.
  assert.deepEqual(falaEquipamento("const potenciaDoVat = private.has_capability(x);"), []);
});

/**
 * O espanhol trata a MESMA pessoa de um jeito só — e tratava de dois.
 *
 * A auditoria de 9 de setembro anotou "três segundas pessoas na mesma tela". Medido,
 * eram **duas**: `tú` e `usted`. `vos` e `vosotros` não aparecem em lugar nenhum, e o
 * número foi corrigido em vez de repetido.
 *
 * Duas bastam, e a prova estava numa frase só — a confirmação de cadastro de insumo
 * começava em `tú` (*"**Vas** a dar de alta..."*) e terminava em `usted` (*"si aún no
 * lo **compró**, **registre** la factura"*). Na ficha do item eram cinco frases em
 * `usted` e uma em `tú`, na mesma tela.
 *
 * O registro escolhido é `tú`, por três razões e nenhuma delas é gosto: é o par do
 * `você` do português e do `you` do inglês, que são os outros dois idiomas desta mesma
 * tela; é o que a regra de tom desta casa pede (*"frase curta, verbo na frente, segunda
 * pessoa"*, orientando em vez de fiscalizar, e `usted` põe distância onde o resto do
 * aplicativo não põe); e era já a maioria do arquivo, então unificar no outro sentido
 * seria reescrever o dicionário inteiro para ficar mais formal que o português.
 *
 * **O que esta guarda pega, e o que ela NÃO pega — dito, não subentendido.** Ela pega
 * as duas formas em que `usted` é inequívoco: a palavra em si, e o imperativo formal em
 * começo de frase. Ela NÃO pega o imperativo formal no meio de uma frase, porque ali
 * ele é indistinguível do subjuntivo, que é legítimo e está no arquivo — *"a quien lo
 * **tenga**"*, *"hace que cada persona **vea**"*. Uma guarda que acusasse esses mandaria
 * consertar o que está certo, que é o defeito do alerta inventado virado para o texto.
 */
const IMPERATIVO_DE_USTED = [
  'Haga', 'Ponga', 'Elija', 'Cuente', 'Registre', 'Escriba', 'Vea', 'Tenga',
  'Toque', 'Use', 'Ingrese', 'Traiga', 'Vuelva', 'Borre', 'Guarde', 'Anote', 'Deje',
];

export function tratamentosMisturados(fonte: string): string[] {
  const achados: string[] = [];
  for (const linha of fonte.split('\n')) {
    if (/\busted\b/i.test(linha)) achados.push(`usted: ${linha.trim().slice(0, 70)}`);
    for (const verbo of IMPERATIVO_DE_USTED) {
      // Começo de frase: depois da aspa que abre o texto, de um ponto, de um travessão
      // ou de uma interrogação. É onde o subjuntivo nunca aparece.
      const re = new RegExp(`(^|['"\`]|\\. |— |\\? |\\+ ')${verbo}\\b`);
      if (re.test(linha)) achados.push(`${verbo}: ${linha.trim().slice(0, 70)}`);
    }
  }
  return achados;
}

test('the Spanish speaks to one person, in one way', () => {
  const es = readFileSync('src/i18n/locales/es.ts', 'utf8');
  assert.deepEqual(
    tratamentosMisturados(es),
    [],
    'o espanhol voltou a tratar por "usted" em algum lugar. O aplicativo inteiro fala\n' +
      'por "tú" — é o par do "você" e do "you" das outras duas telas do mesmo dicionário.',
  );
});

test('the register ruler tells an order from a subjunctive', () => {
  // Os casos verdadeiros: a palavra, e o imperativo abrindo a frase.
  assert.equal(tratamentosMisturados(`      a: 'Esperando por usted',`).length, 1);
  assert.equal(tratamentosMisturados(`      a: 'Escriba las primeras letras.',`).length, 1);
  assert.equal(tratamentosMisturados(`      a: 'Falta algo. Traiga la carga de vuelta.',`).length, 1);

  // Os casos falsos, e eles estão no arquivo de verdade: subjuntivo depois de
  // "quien" e de "hace que" é espanhol correto nos dois tratamentos.
  assert.deepEqual(tratamentosMisturados(`      a: 'Pídelo a quien lo tenga.',`), []);
  assert.deepEqual(tratamentosMisturados(`      a: 'hace que cada persona vea solo su perfil',`), []);
  // E o registro certo não pode ser acusado.
  assert.deepEqual(tratamentosMisturados(`      a: 'Escribe las primeras letras.',`), []);
});

/**
 * **E agora por CHAVE, não por seção.**
 *
 * A seção era a unidade em que a doença apareceu quatro vezes, e ela deixa passar a
 * forma mais comum: uma seção viva com folhas mortas dentro. A varredura de 9 de
 * setembro achou 39 — dezesseis sobras da capa que emagreceu de quinze peças para
 * sete, três frases longas de clima guardadas "para a peça aberta" que é o seletor de
 * cidade, e um trio de lote duplicando o que `app/lots/[id].tsx` já diz com outras
 * chaves. Nenhuma delas é visível de dentro da seção: `app.home` tem leitor, `weather`
 * tem leitor, `app.productForm` tem leitor.
 *
 * **O detector precisa saber de índice dinâmico, senão ele fabrica alarme.** Três
 * formas de ler uma chave sem escrever o nome dela existem no aplicativo hoje:
 *
 * - direto — `t.app.backup.refuse[motivo]`
 * - por apelido — `const words = t.app.backup;` e depois `words.refuse[motivo]`
 * - por desestruturação — `const { lotIs } = t.app.productForm;`
 *
 * Então todo caminho indexado conta como lido **inteiro**, do ponto do índice para
 * baixo: quem escreve `words[x]` pode alcançar qualquer folha ali dentro, e o detector
 * não tem como saber quais. É perda de precisão deliberada, e ela erra para o lado
 * seguro — deixa chave morta passar, nunca acusa chave viva. O contrário ensinaria a
 * ignorar o teste, que é o defeito do alerta inventado aplicado a uma guarda.
 *
 * Teste morto não conta como leitor: uma frase que só o `node:test` lê é frase que
 * ninguém na fábrica vê. Por isso a varredura pula `*.test.*`.
 */
function folhasDo(no: unknown, caminho: string[] = []): string[][] {
  if (typeof no === 'string') return [caminho];
  if (!no || typeof no !== 'object') return [];
  return Object.entries(no).flatMap(([k, v]) => folhasDo(v, [...caminho, k]));
}

/** Os caminhos que alguém lê por índice — e por isso contam como lidos inteiros. */
function caminhosIndexados(textos: readonly string[]): Set<string> {
  const fora = new Set<string>();
  for (const texto of textos) {
    // O apelido é POR ARQUIVO: `words` é `t.app.backup` aqui e `t.app.transport` ali,
    // e juntar os arquivos num texto só faria um apelido cobrir a seção do outro.
    const apelido = new Map<string, string>();
    for (const m of texto.matchAll(
      /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(t(?:\.[A-Za-z_$][\w$]*)+)\s*;/g,
    )) {
      apelido.set(m[1], m[2].slice(2));
    }
    for (const m of texto.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\[/g)) {
      const alvo = m[1];
      if (alvo.startsWith('t.')) fora.add(alvo.slice(2));
      const [raiz, ...resto] = alvo.split('.');
      const base = apelido.get(raiz);
      if (base) fora.add([base, ...resto].join('.'));
    }
  }
  return fora;
}

/** As folhas do dicionário que nenhuma tela alcança. Exportada só para provar a régua. */
export function folhasSemLeitor(dicionario: unknown, textos: readonly string[]): string[] {
  const codigo = textos.join('\n');
  const indexados = caminhosIndexados(textos);

  return folhasDo(dicionario)
    .filter((caminho) => {
      const folha = caminho[caminho.length - 1];
      if (new RegExp(`\\.${folha}\\b`).test(codigo)) return false;
      if (new RegExp(`\\{[^}]*\\b${folha}\\b[^}]*\\}\\s*=`).test(codigo)) return false;
      const pais = caminho.slice(0, -1);
      for (let i = 1; i <= pais.length; i += 1) {
        if (indexados.has(pais.slice(0, i).join('.'))) return false;
      }
      return true;
    })
    .map((caminho) => caminho.join('.'));
}

/** Os arquivos que uma pessoa vê rodando — sem dicionário e sem teste. */
function telas(dir: string, into: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) telas(caminho, into);
    else if (/\.(ts|tsx)$/.test(entrada) && !caminho.includes('locales') && !/\.test\./.test(entrada))
      into.push(caminho);
  }
  return into;
}

test('every dictionary KEY has a reader, or lives in a written frontier', () => {
  const textos = [...telas('app'), ...telas('src')].map((f) => readFileSync(f, 'utf8'));
  assert.ok(textos.length > 50, 'a varredura não achou telas — a comparação abaixo seria de graça');

  const orfas = folhasSemLeitor(ptBR, textos).filter(
    (chave) => !ESCRITAS_ADIANTADO[chave.split('.')[0]],
  );

  assert.deepEqual(
    orfas,
    [],
    `estas chaves do dicionário não têm leitor: ${orfas.join(' · ')}. ` +
      'Frase morta é pior que frase ausente: quem for reescrever o texto acha primeiro a ' +
      'cópia que ninguém lê. Traga a tela no mesmo commit, apague a chave nos três ' +
      'idiomas, ou registre a seção em ESCRITAS_ADIANTADO dizendo quem vai lê-la.',
  );
});

/**
 * A régua provada nas duas direções, que é o que o `CLAUDE.md` exige de todo detector
 * novo: *"antes de dizer um número, rode a régua contra um caso que você sabe que ela
 * deve pegar e um que ela não deve"*.
 *
 * Os falsos aqui não são inventados: são as três formas de leitura que existem no
 * aplicativo de verdade, e a do apelido é exatamente a que fez a varredura anterior
 * contar 44 em vez de 39.
 */
test('the key ruler catches a dead phrase and spares all three ways of reading one', () => {
  const dicionario = {
    viva: { direta: 'a', porIndice: { sim: 'b', nao: 'c' }, porApelido: { um: 'd' } },
    morta: { ninguem: 'e' },
    destruturada: { solta: 'f' },
  };
  const tela = [
    'const w = t.viva.porApelido;',
    'const { solta } = t.destruturada;',
    'return [t.viva.direta, t.viva.porIndice[k], w[j], solta];',
  ].join('\n');

  assert.deepEqual(
    folhasSemLeitor(dicionario, [tela]),
    ['morta.ninguem'],
    'a régua tem de pegar a folha que ninguém lê e poupar as lidas por nome, por ' +
      'índice, por apelido e por desestruturação',
  );

  // E o negativo do negativo: sem o apelido na mesma FILE, `w[j]` não cobre nada —
  // é isso que impede um `const w = t.outra.coisa` de outro arquivo de dar alta a uma
  // seção inteira por acidente.
  assert.ok(
    folhasSemLeitor(dicionario, ['return [t.viva.direta, t.viva.porIndice[k], w[j]];']).includes(
      'viva.porApelido.um',
    ),
    'sem a declaração do apelido no arquivo, o índice não pode cobrir a seção',
  );
});

/**
 * Texto com marcador não chega à tela sem passar pelo `fill`.
 *
 * Achado usando o aplicativo, em 10 de setembro: criar uma ficha técnica abriu a
 * confirmação com o título **"Criar {{name}}?"** — o marcador cru, na cara de
 * quem usa. O corpo logo abaixo estava certo, porque ele passava pelo `fill` e o
 * título não. Uma linha esquecida entre duas que a fazem.
 *
 * A régua olha o CAMINHO da chave, não o nome da folha. A primeira versão casava
 * por folha (`.title`, `.more`, `.overline`) e acusou duzentas linhas inocentes,
 * porque nomes de folha se repetem entre seções — detector que não separa os dois
 * casos não entra, e este quase entrou.
 */
function textoDe(no: unknown, caminho: readonly string[]): string | null {
  let atual: unknown = no;
  for (const passo of caminho) {
    if (!atual || typeof atual !== 'object') return null;
    atual = (atual as Record<string, unknown>)[passo];
  }
  return typeof atual === 'string' ? atual : null;
}

/**
 * A frase é ESCOLHIDA aqui e enchida três linhas abaixo?
 *
 * O padrão aparece em três telas e é o certo: um encadeamento de ternários
 * escolhe qual frase serve, guarda numa variável, e o `fill` vem depois com os
 * dados. Acusar isso seria acusar a escolha de frase, que é justamente o que a
 * casa manda fazer quando o texto depende do caso.
 */
function viraLocalQueEnche(texto: string, posicao: number): boolean {
  const antes = texto.slice(0, posicao);
  const decl = [...antes.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/g)].pop();
  if (!decl) return false;
  const nome = decl[1];
  return new RegExp(`fill\\(\\s*${nome}\\b`).test(texto);
}

/** A linha inteira onde a leitura acontece. */
function linhaEm(texto: string, posicao: number): string {
  const inicio = texto.lastIndexOf('\n', posicao) + 1;
  const fim = texto.indexOf('\n', posicao);
  return texto.slice(inicio, fim === -1 ? undefined : fim);
}

/**
 * Quem recebe a frase por parâmetro e enche lá dentro.
 *
 * Uma régua estática não segue um argumento até dentro da função, então estes
 * ficam nomeados — com o motivo, como as outras exceções deste repositório. Quem
 * acrescentar um nome aqui está dizendo que leu a função e que ela chama `fill`.
 */
const ENTREGUE_A_QUEM_ENCHE = [
  // `describe(item, inStock, formatting, ofFull)` — `app/inputs/index.tsx:474`,
  // que enche as duas frases com a quantidade e a porcentagem do cheio.
  /\bdescribe\(/,
  /^\s*t\.app\.inputs\.(inStock|ofFull),\s*$/,
];

/**
 * Esta leitura está DENTRO de um `fill(...)`?
 *
 * Contar linhas não serve, e isso foi medido: a confirmação da contagem escolhe
 * entre sete frases num encadeamento de ternários e o `fill(` abre onze linhas
 * acima da última. Uma janela de linhas acusa as sete, todas inocentes. O que
 * responde a pergunta é o parêntese: anda-se para trás fechando o que se abriu, e
 * quando se sai de um parêntese olha-se quem o abriu.
 */
function dentroDeFill(texto: string, posicao: number): boolean {
  let profundidade = 0;
  for (let i = posicao - 1; i >= 0; i -= 1) {
    const c = texto[i];
    if (c === ')') profundidade += 1;
    else if (c === '(') {
      if (profundidade > 0) profundidade -= 1;
      else if (/fill\s*$/.test(texto.slice(Math.max(0, i - 8), i))) return true;
    }
  }
  return false;
}

/** Onde um texto com marcador é lido sem `fill` em volta. Exportada para provar a régua. */
export function marcadoresSoltos(
  dicionario: unknown,
  arquivos: readonly { caminho: string; texto: string }[],
): string[] {
  const comMarcador = new Set(
    folhasDo(dicionario)
      .filter((c) => (textoDe(dicionario, c) ?? '').includes('{{'))
      .map((c) => c.join('.')),
  );
  const soltos: string[] = [];

  for (const { caminho, texto } of arquivos) {
    // O apelido é POR ARQUIVO, pela mesma razão da régua de cima.
    const apelido = new Map<string, string>();
    for (const m of texto.matchAll(
      /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(t(?:\.[A-Za-z_$][\w$]*)+)\s*;/g,
    )) {
      apelido.set(m[1], m[2].slice(2));
    }

    for (const m of texto.matchAll(/\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\b/g)) {
      const alvo = m[1];
      const [raiz, ...resto] = alvo.split('.');
      const cheio =
        raiz === 't'
          ? resto.join('.')
          : apelido.has(raiz)
            ? [apelido.get(raiz), ...resto].join('.')
            : null;
      if (!cheio || !comMarcador.has(cheio)) continue;
      if (dentroDeFill(texto, m.index ?? 0)) continue;
      if (viraLocalQueEnche(texto, m.index ?? 0)) continue;
      if (ENTREGUE_A_QUEM_ENCHE.some((r) => r.test(linhaEm(texto, m.index ?? 0)))) continue;
      const linha = texto.slice(0, m.index).split('\n').length;
      soltos.push(`${caminho}:${linha}  ${cheio}`);
    }
  }
  return soltos;
}

test('nenhum texto com marcador chega à tela sem o fill', () => {
  const arquivos = [...telas('app'), ...telas('src')].map((caminho) => ({
    caminho,
    texto: readFileSync(caminho, 'utf8'),
  }));
  assert.deepEqual(
    marcadoresSoltos(ptBR, arquivos),
    [],
    'estes lugares põem na tela um texto com {{marcador}} sem passar pelo fill — ' +
      'foi assim que a confirmação da ficha técnica apareceu como "Criar {{name}}?"',
  );
});

test('a régua do marcador distingue o esquecido do preenchido', () => {
  const dicionario = { app: { x: { comMarca: 'Criar {{name}}?', semMarca: 'Criar' } } };
  const esquecido = [
    { caminho: 'f.tsx', texto: 'const words = t.app.x;\nconfirm({ title: words.comMarca });' },
  ];
  const preenchido = [
    {
      caminho: 'f.tsx',
      texto: 'const words = t.app.x;\nconfirm({ title: fill(words.comMarca, { name }) });',
    },
  ];
  const semMarcador = [
    { caminho: 'f.tsx', texto: 'const words = t.app.x;\nconfirm({ title: words.semMarca });' },
  ];
  assert.equal(marcadoresSoltos(dicionario, esquecido).length, 1, 'não acusa quem devia acusar');
  assert.equal(marcadoresSoltos(dicionario, preenchido).length, 0, 'acusa quem já usa o fill');
  assert.equal(marcadoresSoltos(dicionario, semMarcador).length, 0, 'acusa texto sem marcador');
});

/**
 * **Nenhuma frase manda na régua de quem fala.**
 *
 * A ficha técnica deixa o dono escolher em que se mede o que ela rende —
 * mililitro, grama ou unidade —, e a escolha ia para o banco certa. O que dizia
 * o contrário eram as FRASES: `'{{net}} ml de {{gross}}'`, `'Informe quantos ml
 * vão em cada unidade'`, `'{{perUnit}} ml por unidade'`. Uma padaria cadastrava
 * doze mil gramas e o aplicativo inteiro respondia em mililitro — o editor, a
 * dica da perda e a confirmação do produto —, três telas afirmando outra
 * grandeza sobre o mesmo número.
 *
 * A forma do defeito é estreita e por isso dá para pegar: **uma palavra de
 * medida colada logo depois de um marcador**. É diferente de citar as medidas
 * numa lista (*"a menor medida com que a receita trabalha: g, ml, un"*) ou de dar
 * exemplo de nome (*"240 ml, 500 ml, 1 litro"*) — nesses a medida não está
 * decidindo nada sobre um número que a tela calculou.
 */
const MEDIDAS_CHUMBADAS = /\{\{[a-zA-Z]+\}\}\s+(ml|kg|g|un|l)\b/;

function frasesDoDicionario(no: unknown, caminho: string[] = []): { onde: string; texto: string }[] {
  if (typeof no === 'string') return [{ onde: caminho.join('.'), texto: no }];
  if (!no || typeof no !== 'object') return [];
  return Object.entries(no as Record<string, unknown>).flatMap(([k, v]) =>
    frasesDoDicionario(v, [...caminho, k]),
  );
}

test('nenhuma frase decide a unidade de um número que a tela calculou', () => {
  const presas = frasesDoDicionario(ptBR)
    .filter(({ texto }) => MEDIDAS_CHUMBADAS.test(texto))
    .map(({ onde, texto }) => `${onde}: ${JSON.stringify(texto)}`);

  assert.deepEqual(
    presas,
    [],
    'a unidade vem da ficha, não da frase — troque a medida por {{unit}} e passe a régua escolhida',
  );
});

test('a régua da unidade separa a que decide da que só cita', () => {
  // O caso verdadeiro: a medida logo depois do número que a tela calculou.
  assert.ok(MEDIDAS_CHUMBADAS.test('Sobram {{net}} ml de {{gross}}.'));
  assert.ok(MEDIDAS_CHUMBADAS.test('{{perUnit}} ml por unidade.'));
  assert.ok(MEDIDAS_CHUMBADAS.test('{{amount}} kg no caminhão'));

  // O caso falso, que é o que faz esta régua valer alguma coisa: citar as
  // medidas, dar exemplo de nome, ou já receber a régua por marcador.
  assert.ok(!MEDIDAS_CHUMBADAS.test('A menor medida com que a receita trabalha: g, ml, un.'));
  assert.ok(!MEDIDAS_CHUMBADAS.test('o que divide a linha: Tradicional, Skimó — ou 240 ml, 500 ml'));
  assert.ok(!MEDIDAS_CHUMBADAS.test('Sobram {{net}} {{unit}} de {{gross}}.'));
  assert.ok(!MEDIDAS_CHUMBADAS.test('{{name}} mlado'), 'palavra que só COMEÇA com a medida não conta');
});

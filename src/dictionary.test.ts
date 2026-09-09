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

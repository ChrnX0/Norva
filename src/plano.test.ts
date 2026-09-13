import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * O plano dizendo a verdade sobre o código — executado, não prometido.
 *
 * **A cicatriz custou sete rodadas.** Em 7 de setembro eu peguei "a próxima coisa
 * da fila" seis vezes seguidas e nas seis o código já tinha a coisa pronta: o
 * extrato, o estorno, as três configurações da empresa, a conta do `[por quê?]`
 * na receita, a conta das perdas e o aviso de validade. Na sétima foi ao
 * contrário — o item **2** da tabela "A ORDEM" dizia *TRAVADO* esperando decisão
 * de dono, e a `0035` já tinha criado a tabela `people`, com `app/people.tsx`
 * aberto por cima dela.
 *
 * A causa não é desatenção. A seção *"As seis"* foi escrita como **aspiração** e
 * passou a ser lida como **fila**: aspiração não envelhece sozinha, fila envelhece
 * a cada commit. E o plano já tem a regra certa escrita — *"item fechado sai do
 * roadmap no mesmo commit que o fecha"* —, que é exatamente o tipo de regra que
 * ninguém cumpre no commit em que está com pressa.
 *
 * **`src/bar.test.ts` resolveu isso para a TABELA de números** e não para a prosa:
 * ele deriva telas, tabelas, migrações e papéis do sistema e cobra que os
 * documentos digam o mesmo. O que ficou de fora é o que mais custou — a fila, que
 * é texto.
 *
 * **Este arquivo é a mesma ideia aplicada à fila.** Cada item do plano carrega uma
 * *medida* escrita ao lado, em comentário de HTML (invisível no GitHub):
 *
 * ```
 * <!-- medida: ausente supabase/migrations :: create table people -->
 * <!-- medida: presente app/people.tsx :: listPeople -->
 * <!-- medida: espera :: cinco minutos de TalkBack; nenhum comando responde por isso -->
 * ```
 *
 * `ausente` é a medida de um item **aberto**: no dia em que alguém construir a
 * coisa, a busca acha e **esta guarda fica vermelha** — o plano tem de ser
 * atualizado no mesmo commit, que é a regra 1 dele deixando de depender de
 * memória. `presente` é a medida de um item **fechado**: no dia em que alguém
 * apagar a peça, o "FEITO" para de mentir. `espera` é a saída honesta para o que
 * nenhum comando responde — cinco minutos com o aplicativo, uma decisão de
 * faseamento, meses de entregas observadas — e ela **exige escrito o que se
 * espera**, como o ⚠️ da proofgate exige justificativa.
 *
 * **O lado que manda é sempre o código.** O documento é o que pode estar errado.
 */

const PLANO = readFileSync('docs/roadmap.md', 'utf8');

/** As linhas do plano, para dizer ONDE a medida falhou e não só que falhou. */
const LINHAS = PLANO.split('\n');

/** Onde cada medida está escrita, em número de linha. */
function linhaDe(indice: number): number {
  return PLANO.slice(0, indice).split('\n').length;
}

/** Todo arquivo sob um caminho, que pode ser um arquivo ou uma pasta. */
function arquivos(alvo: string, into: string[] = []): string[] {
  const info = statSync(alvo);
  if (!info.isDirectory()) {
    into.push(alvo);
    return into;
  }
  for (const entrada of readdirSync(alvo)) {
    if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
    arquivos(join(alvo, entrada), into);
  }
  return into;
}

/** O texto de tudo que está sob o alvo, concatenado uma vez só. */
const CACHE = new Map<string, string>();
function textoDe(alvo: string): string {
  const guardado = CACHE.get(alvo);
  if (guardado !== undefined) return guardado;
  const texto = arquivos(alvo)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  CACHE.set(alvo, texto);
  return texto;
}

type Medida =
  | { tipo: 'ausente' | 'presente'; alvo: string; agulha: string; linha: number }
  | { tipo: 'espera'; motivo: string; linha: number };

/**
 * As medidas escritas no plano.
 *
 * A gramática é deliberadamente pobre — três formas e um separador — porque
 * detector que exige gramática rica é detector que erra em silêncio. O separador
 * é `::` e não `|` de propósito: a medida precisa caber DENTRO de uma célula de
 * tabela markdown, e `|` fecharia a célula.
 */
function medidas(): Medida[] {
  const achadas: Medida[] = [];
  for (const m of PLANO.matchAll(/<!-- medida: (ausente|presente|espera) (.*?) -->/g)) {
    const linha = linhaDe(m.index ?? 0);
    const tipo = m[1] as Medida['tipo'];
    const resto = m[2].trim();
    if (tipo === 'espera') {
      achadas.push({ tipo, motivo: resto.replace(/^::\s*/, ''), linha });
      continue;
    }
    const corte = resto.indexOf(' :: ');
    achadas.push({
      tipo,
      alvo: corte < 0 ? resto : resto.slice(0, corte).trim(),
      agulha: corte < 0 ? '' : resto.slice(corte + 4).trim(),
      linha,
    });
  }
  return achadas;
}

/** A busca: a agulha é uma expressão regular, e o alvo é lido do disco. */
function acha(alvo: string, agulha: string): boolean {
  return new RegExp(agulha, 'm').test(textoDe(alvo));
}

test('a régua é régua: acha o que existe e não acha o que não existe', () => {
  // Dois casos escolhidos porque o repositório tem os dois lados da mesma troca:
  // `noturno` virou `escurecer` em 7 de setembro, no mesmo arquivo.
  assert.ok(acha('src/theme/tokens.ts', 'export function escurecer'), 'a função existe e a régua tem de achá-la');
  assert.ok(!acha('src/theme/tokens.ts', 'export function noturno'), 'o nome antigo não existe mais e a régua não pode inventá-lo');
  // E ela lê pasta, não só arquivo — que é o caso das 43 migrações.
  assert.ok(acha('supabase/migrations', 'create table people'), 'a 0035 cria a tabela de gente');
  assert.ok(!acha('supabase/migrations', 'create table asdfqwerty'), 'tabela que ninguém criou');
});

test('toda medida escrita no plano ainda vale contra o código', () => {
  const falhas: string[] = [];
  for (const medida of medidas()) {
    if (medida.tipo === 'espera') {
      if (medida.motivo.length < 20) {
        falhas.push(
          `docs/roadmap.md:${medida.linha} — medida "espera" sem dizer o que se espera. ` +
            'A espera declarada é honesta; a espera em branco é a mesma coisa que não medir.',
        );
      }
      continue;
    }
    if (!medida.agulha) {
      falhas.push(`docs/roadmap.md:${medida.linha} — medida sem agulha: "${medida.alvo}"`);
      continue;
    }
    let achou: boolean;
    try {
      achou = acha(medida.alvo, medida.agulha);
    } catch (erro) {
      falhas.push(`docs/roadmap.md:${medida.linha} — a medida não roda: ${(erro as Error).message}`);
      continue;
    }
    if (medida.tipo === 'ausente' && achou) {
      falhas.push(
        `docs/roadmap.md:${medida.linha} — o plano trata isto como ABERTO, e "${medida.agulha}" ` +
          `já existe em ${medida.alvo}. Se foi construído, o item sai do plano NESTE commit.`,
      );
    }
    if (medida.tipo === 'presente' && !achou) {
      falhas.push(
        `docs/roadmap.md:${medida.linha} — o plano trata isto como FEITO, e "${medida.agulha}" ` +
          `não está em ${medida.alvo}. O "FEITO" virou promessa.`,
      );
    }
  }

  assert.deepEqual(
    falhas,
    [],
    `o plano e o código discordam:\n  ${falhas.join('\n  ')}\n` +
      'Quem manda é o código. O que muda é o docs/roadmap.md.',
  );
});

/**
 * E a metade que faz a guarda valer alguma coisa: **item sem medida não existe**.
 *
 * Uma guarda que só confere as medidas escritas é uma guarda que se desliga
 * sozinha — basta não escrever a medida. A fila é a parte do plano que envelhece,
 * então é ela que tem de estar coberta inteira: da seção *"A FILA DE AGORA"* até
 * o fim da tabela *"A ORDEM"*, todo item carrega uma medida.
 */
const INICIO_DA_FILA = LINHAS.findIndex((l) => l.startsWith('## A FILA DE AGORA'));
/**
 * A fila é UMA seção, e a janela termina no próximo `##`.
 *
 * Ela terminava num cabeçalho nomeado (`## A entrada`), o que valia enquanto havia uma
 * fila só. Com a fila da auditoria de 9 de setembro entrando acima da anterior, a
 * janela passou a engolir a seção fechada do meio e a cobrar medida de item riscado —
 * guarda que acusa quem obedeceu, que é o defeito que esta casa já pagou três vezes.
 *
 * Terminar no próximo `##` é o que a frase "a fila de agora" quer dizer: o que vem
 * depois é outro assunto, seja ele qual for.
 */
const FIM_DA_FILA = (() => {
  const proxima = LINHAS.findIndex((l, i) => i > INICIO_DA_FILA && l.startsWith('## '));
  return proxima === -1 ? LINHAS.length : proxima;
})();

test('todo item da fila carrega uma medida', () => {
  assert.ok(INICIO_DA_FILA > 0 && FIM_DA_FILA > INICIO_DA_FILA, 'a fila mudou de nome — a guarda deixou de olhar para ela');

  const sem: string[] = [];
  let atual: { titulo: string; linha: number } | null = null;
  let temMedida = false;

  const fecha = () => {
    if (atual && !temMedida) sem.push(`docs/roadmap.md:${atual.linha} — ${atual.titulo}`);
  };

  for (let i = INICIO_DA_FILA; i < FIM_DA_FILA; i++) {
    const linha = LINHAS[i];
    if (linha.startsWith('### ')) {
      fecha();
      atual = { titulo: linha.slice(4).trim(), linha: i + 1 };
      temMedida = false;
      continue;
    }
    if (linha.includes('<!-- medida:')) temMedida = true;
  }
  fecha();

  assert.deepEqual(
    sem,
    [],
    `estes itens da fila não têm como ser conferidos contra o código:\n  ${sem.join('\n  ')}\n` +
      'Escreva ao lado do item uma linha <!-- medida: ausente <alvo> :: <agulha> --> (item aberto), ' +
      '<!-- medida: presente <alvo> :: <agulha> --> (item fechado) ou ' +
      '<!-- medida: espera :: <o que se espera, já que nenhum comando responde> -->.',
  );
});

/**
 * A medida cabe dentro de uma célula de tabela, e um `|` a rebenta.
 *
 * Escrevi `:: joinCode|join_code` numa linha da tabela *A ORDEM* e a célula se
 * partiu em duas: o markdown conta `|` antes de qualquer outra coisa, e o
 * comentário de HTML não o protege. A tabela renderizou com uma coluna a mais e
 * nada acusou — nem a suíte, que só lê a medida, nem o olho, que não conta cano.
 *
 * O separador da gramática já é `::` por causa disto; faltava a guarda.
 */
test('nenhuma medida carrega um cano que rebenta a tabela', () => {
  const rebentam: string[] = [];
  LINHAS.forEach((linha, i) => {
    for (const m of linha.matchAll(/<!-- medida: [^>]*-->/g)) {
      if (m[0].includes('|')) rebentam.push(`docs/roadmap.md:${i + 1} — ${m[0]}`);
    }
  });
  assert.deepEqual(
    rebentam,
    [],
    `estas medidas partem a célula em que estão:\n  ${rebentam.join('\n  ')}\n` +
      'Escolha uma agulha sem `|` — a alternância quase sempre dá para trocar por um ' +
      'trecho comum às duas formas.',
  );
});

/** As linhas numeradas da tabela "A ORDEM" — a que envelheceu por último. */
test('toda linha da tabela A ORDEM carrega uma medida', () => {
  const inicio = LINHAS.findIndex((l) => l.startsWith('## A ORDEM'));
  assert.ok(inicio > 0, 'a tabela A ORDEM mudou de nome — a guarda deixou de olhar para ela');
  const fim = LINHAS.findIndex((l, i) => i > inicio && l.startsWith('## '));

  const sem: string[] = [];
  for (let i = inicio; i < fim; i++) {
    const linha = LINHAS[i];
    const m = linha.match(/^\| \*\*(\d+[a-z]?)\*\* \|/);
    if (!m) continue;
    if (!linha.includes('<!-- medida:')) sem.push(`docs/roadmap.md:${i + 1} — linha ${m[1]} da tabela A ORDEM`);
  }

  assert.deepEqual(
    sem,
    [],
    `estas posições da ordem não têm medida:\n  ${sem.join('\n  ')}\n` +
      'Foi uma delas que disse TRAVADO por um dia inteiro com a migração 0035 já no disco.',
  );
});

test('nenhum item do plano aparece DUAS vezes na mesma seção', () => {
  /**
   * **A cicatriz é de 11 de setembro e ela é a irmã exata da que abre este arquivo.**
   *
   * A fila tinha os itens 29, 30 e 31 **duas vezes** dentro da mesma seção: as versões
   * fechadas escritas por cima, e o bloco antigo intacto quarenta linhas abaixo. As cópias
   * de 30 e 31 eram byte-a-byte idênticas — inócuas e confusas. A de 29 era o texto ORIGINAL
   * e estava **aberta**, num item que o código tinha fechado no dia anterior: as cinco
   * chaves mortas que ela nomeia não existem mais, e `folhasSemLeitor` já compara caminho
   * com caminho.
   *
   * Isso é pior que documentação velha, e é por isso que vale uma guarda em vez de atenção:
   * a fila é **a entrada de um laço automático** ("nunca ocioso: pegue a próxima da lista"),
   * então um item fantasma aberto manda reconstruir o que existe — que é a doença que este
   * arquivo inteiro existe para curar, e ela voltou por um caminho que nenhuma das guardas
   * de medida alcançava. O marcador de medida do item fechado estava certo; o fantasma
   * simplesmente não tinha marcador nenhum, e a guarda de "todo item carrega uma medida"
   * não pergunta se o NÚMERO já foi usado.
   */
  const secoes = new Map<string, Map<string, number[]>>();
  let secao = '(antes da primeira seção)';
  PLANO.split('\n').forEach((linha, i) => {
    if (/^#{2,4} /.test(linha)) {
      secao = `${i + 1}: ${linha.trim()}`;
      return;
    }
    const item = /^(\d+)\.\s/.exec(linha);
    if (!item) return;
    if (!secoes.has(secao)) secoes.set(secao, new Map());
    const daSecao = secoes.get(secao)!;
    daSecao.set(item[1], [...(daSecao.get(item[1]) ?? []), i + 1]);
  });

  const repetidos: string[] = [];
  for (const [nome, itens] of secoes) {
    for (const [numero, linhas] of itens) {
      if (linhas.length > 1) {
        repetidos.push(`"${nome}" tem o item ${numero} nas linhas ${linhas.join(' e ')}`);
      }
    }
  }
  assert.deepEqual(
    repetidos,
    [],
    `o docs/roadmap.md repete item na mesma seção:\n  ${repetidos.join('\n  ')}\n` +
      'Duas entradas com o mesmo número são duas verdades sobre a mesma coisa, e a fila é a ' +
      'entrada de um laço automático: a cópia velha manda reconstruir o que já existe. ' +
      'Apague a antiga — a regra 1 do plano diz que item fechado sai no mesmo commit.',
  );

  // A régua se confere: sem isto, um arquivo que ela não soubesse ler passaria vazio.
  const totalDeItens = [...secoes.values()].reduce(
    (soma, itens) => soma + [...itens.values()].reduce((s, l) => s + l.length, 0),
    0,
  );
  assert.ok(totalDeItens > 30, `a leitura achou só ${totalDeItens} itens no plano — ela não está lendo`);
});

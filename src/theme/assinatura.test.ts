import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { AREA_DO_GLIFO } from '@/components/glifos';
import { ambient } from './tokens';

/**
 * O guarda da assinatura: o mesmo assunto sai da mesma cor em todo o aplicativo.
 *
 * Ele existe por uma frase do dono e por um número. A frase: *"todo o app é um
 * organismo só, tem que ser tudo coerente e com a mesma assinatura, tanto lógica
 * quanto visual"*. O número: uma varredura das vinte e quatro telas achou
 * **trinta** pontos em que o mesmo assunto saía de duas cores — inclusive dois
 * cartões de dinheiro com tons diferentes no MESMO arquivo, trezentas linhas
 * separados.
 *
 * Nenhum desses trinta era desatenção de alguém distraído. Eles são o resultado
 * inevitável de a cor ser escolhida NA TELA, caso a caso: escolha caso a caso
 * diverge, sempre, e nenhuma quantidade de cuidado impede isso — só um guarda
 * impede. Foi a mesma lição do `law.test.ts`, que existe porque "toda conclusão
 * abre a conta" também não sobrevive à boa vontade.
 *
 * A regra que ele cobra:
 *
 * > O desenho carrega o tom do ASSUNTO de que fala, não o da tela em que mora.
 *
 * E as exceções são escritas, com motivo, no `SINAIS` abaixo — porque exceção
 * que não se escreve vira a próxima divergência.
 */

const RAIZES = ['app', 'src'];

/**
 * Onde a cor NÃO é área, e sim sinal — e por que, em cada caso.
 *
 * Vermelho e âmbar não dizem "de que assunto isto é": dizem "isto está
 * acontecendo agora". Um cartão de compra que fica âmbar porque o preço veio bem
 * acima do histórico continua sendo um cartão de compra; o âmbar ali é a decisão
 * de hoje, e some quando o preço volta. Por isso eles passam — mas passam
 * NOMEADOS, um por um, com o motivo ao lado.
 */
const SINAIS: Record<string, string> = {
  'app/inputs/[id].tsx:432':
    'o cartão só existe quando o insumo está acabando — sem alerta ele não é desenhado',
  'app/losses.tsx:151':
    'a abertura da conta do cartão de perdas: ela só aparece quando houve perda no mês',
  'app/recipes/[id].tsx:387':
    'falta o rendimento, então o custo não existe: o cartão É o impedimento (Lei 5)',
  'app/catalog.tsx:170':
    'ali a etiqueta é ETIQUETA e não preço, com a razão escrita no próprio arquivo: ' +
    '"a etiqueta é o desenho certo — o nome composto é o que vai no produto"',
};

/**
 * As PORTAS: um cartão que não fala de si, fala de para onde leva.
 *
 * A gaveta do "Mais" e a seção da capa nos Ajustes são menus. O assunto delas não
 * é a tela em que estão — é o DESTINO. Foi exatamente isso que o dono cobrou
 * olhando o "Mais": *"esses ícones devem seguir o padrão de todo o tema, falta um
 * pouco de cor aí"*. As quatro seções estavam no cinza da tela, então perguntar,
 * cadastrar e lançar liam todos como "mexer nas opções".
 *
 * O destino fica escrito aqui junto com o motivo, e não como um "ignore esta
 * linha": o guarda continua conferindo o valor. Porta sem destino declarado é
 * como a divergência voltaria.
 */
const PORTAS: Record<string, { destino: string; motivo: string }> = {
  'app/(tabs)/more.tsx:157': {
    destino: 'mint',
    motivo: 'gaveta de cadastros: abre insumos e lugares, que são estoque',
  },
  'app/settings.tsx:741': {
    destino: 'sky',
    motivo: 'a seção governa as peças da CAPA, e capa é a casa',
  },
};

function telas(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) out.push(...telas(caminho));
    else if (/\.tsx$/.test(entrada) && !/\.test\.tsx$/.test(entrada)) out.push(caminho);
  }
  return out;
}

/**
 * Apaga o comentário SEM mover uma linha de lugar.
 *
 * Comentário fala de cor à vontade — vários docblocks deste projeto citam
 * `palette.sky` para explicar por que ele saiu de lá —, então só o que roda pode
 * contar. Mas apagar o texto encurta o arquivo, e a primeira versão deste guarda
 * apontou catorze defeitos em linhas que não existiam: eu fui conferir
 * `purchase.tsx:167` e achei o meio de uma função.
 *
 * Guarda que aponta a linha errada é pior que guarda nenhum: ele gasta a
 * confiança de quem foi olhar. O bloco vira as mesmas quebras de linha que
 * tinha; a linha de `//` vira vazio, sem tirar a quebra dela.
 */
function codigo(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ' '))
    .replace(/^([ \t]*)\/\/.*$/gm, '$1');
}

type Uso = { arquivo: string; linha: number; glifo: string; tom: string; areaDaTela: string | null };

/** A área declarada pela tela — o `AreaProvider` que envolve tudo nela. */
function areaDaTela(fonte: string): string | null {
  return /<AreaProvider\s+area="(\w+)"/.exec(fonte)?.[1] ?? null;
}

/**
 * Acha cada `<Card>` que tem cor E desenho, e devolve o par.
 *
 * Lê a abertura da etiqueta — de `<Card` até o `>` que a fecha — e procura ali
 * dentro o `hue` e o primeiro `Glyph...` do `icon`. Cartão sem um dos dois não
 * entra: sem desenho não há assunto declarado, e sem cor não há o que conferir.
 */
function usos(arquivo: string): Uso[] {
  const fonte = codigo(readFileSync(arquivo, 'utf8'));
  const area = areaDaTela(fonte);
  const achados: Uso[] = [];

  for (const abre of fonte.matchAll(/<Card\b/g)) {
    // O fim da etiqueta não é o primeiro `>`: o atributo `icon` traz uma função
    // (`(c) => <Glyph ... />`), e ela tem dois. Só vale o `>` que estiver FORA
    // de qualquer chave — por isso a profundidade é contada em vez de casada.
    let i = abre.index + 5;
    let chaves = 0;
    for (; i < fonte.length; i += 1) {
      const ch = fonte[i];
      if (ch === '{') chaves += 1;
      else if (ch === '}') chaves -= 1;
      else if (ch === '>' && chaves === 0) break;
    }
    const corpo = fonte.slice(abre.index, i);

    const hue = /hue=\{/.exec(corpo);
    if (!hue) continue;
    // O valor do `hue` vai da abertura até a chave que a fecha, contada do mesmo
    // jeito: um ternário com `palette.x` e `color.danger` dentro é um valor só.
    let j = hue.index + hue[0].length;
    let dentro = 1;
    for (; j < corpo.length && dentro > 0; j += 1) {
      if (corpo[j] === '{') dentro += 1;
      else if (corpo[j] === '}') dentro -= 1;
    }
    const tom = corpo.slice(hue.index + hue[0].length, j - 1).replace(/\s+/g, ' ').trim();

    const glifo = /icon=\{[\s\S]*?<(Glyph\w+)/.exec(corpo);
    if (!glifo) continue;

    achados.push({
      arquivo,
      linha: fonte.slice(0, abre.index).split('\n').length,
      glifo: glifo[1],
      tom,
      areaDaTela: area,
    });
  }
  return achados;
}

const TODOS = RAIZES.flatMap((r) => telas(r)).flatMap(usos);

test('every drawing declares which subject it belongs to', () => {
  const fonte = readFileSync('src/components/Glyph.tsx', 'utf8');
  const exportados = [...fonte.matchAll(/^export function (Glyph\w+)/gm)].map((m) => m[1]);
  assert.ok(exportados.length >= 26, `só achei ${exportados.length} glifos — a varredura quebrou`);
  for (const nome of exportados) {
    assert.ok(
      nome in AREA_DO_GLIFO,
      `${nome} não diz de que assunto fala. Declare em src/components/glifos.ts antes de ` +
        'desenhar um traço: desenho sem assunto é desenho que cada tela vai pintar de um jeito.',
    );
  }
});

test('no drawing claims a tone the palette does not have', () => {
  // `anfitriao` não é um tom: é a declaração de que o desenho TOMA o tom de quem
  // o hospeda. Conferir isso contra a paleta era comparar duas coisas de espécies
  // diferentes — e foi o próprio guarda que reprovou, o que é o comportamento
  // certo dele com a pergunta errada.
  const conhecidos = new Set<string>([...ambient, 'danger', 'anfitriao']);
  for (const [nome, area] of Object.entries(AREA_DO_GLIFO)) {
    assert.ok(conhecidos.has(area), `${nome} pede "${area}", que não é um tom da paleta`);
  }
});

test('the same subject comes out in the same colour, in every screen', () => {
  assert.ok(TODOS.length > 20, `só achei ${TODOS.length} cartões com cor e desenho — a busca quebrou`);

  const erros: string[] = [];
  for (const uso of TODOS) {
    const declarado = AREA_DO_GLIFO[uso.glifo];
    if (declarado === undefined) continue;

    const chave = `${uso.arquivo}:${uso.linha}`;

    // Anfitrião: o desenho é uma MEDIDA e serve a mais de um assunto, então toma
    // o tom da tela. Continua cobrado — o que ele não pode é sair de um tom que
    // não é nem o dele nem o da casa em que está.
    const esperado = declarado === 'anfitriao' ? uso.areaDaTela : declarado;
    if (esperado === null) continue;
    if (chave in SINAIS) continue;

    const porta = PORTAS[chave];
    if (porta) {
      if (!uso.tom.includes(`palette.${porta.destino}`)) {
        erros.push(
          `${chave}: é porta para "${porta.destino}" (${porta.motivo}) e sai em "${uso.tom}"`,
        );
      }
      continue;
    }

    if (esperado === 'danger') {
      if (!/color\.danger/.test(uso.tom)) {
        erros.push(`${chave}: ${uso.glifo} é perda e devia sair em color.danger, saiu "${uso.tom}"`);
      }
      continue;
    }

    // O ternário é o caso comum e NÃO é exceção: um ramo é o sinal de agora, o
    // outro é o assunto. Só o ramo calmo responde "de que assunto isto é", e é
    // ele que a regra cobra — foi assim que apareceu um cartão de compra cujo
    // ramo calmo era azul de casa.
    const calmo = uso.tom.includes('?')
      ? (uso.tom
          .split(/[?:]/)
          .map((r) => r.trim())
          .filter((r) => r.startsWith('palette.') || r.startsWith('color.'))
          .find((r) => !/color\.(danger|warning)/.test(r)) ?? uso.tom)
      : uso.tom;

    // Cartão que nasce em sinal e não volta: a razão de existir dele É o alerta,
    // e isso se escreve, porque um cartão permanentemente vermelho é a definição
    // do alerta que ensina a ignorar alerta.
    if (/color\.(danger|warning)/.test(calmo)) {
      erros.push(
        `${chave}: ${uso.glifo} nasce em sinal ("${uso.tom}") e nunca volta ao tom do assunto. ` +
          'Se o cartão só existe enquanto há alerta, escreva o motivo em SINAIS.',
      );
      continue;
    }

    if (!calmo.includes(`palette.${esperado}`)) {
      erros.push(
        declarado === 'anfitriao'
          ? `${chave}: ${uso.glifo} é medida e devia tomar o tom da tela ("${esperado}"), saiu em "${calmo}".`
          : `${chave}: ${uso.glifo} fala de "${esperado}" e o ramo calmo dele é "${calmo}". ` +
              'O desenho carrega o tom do ASSUNTO, não o da tela em que mora.',
      );
    }
  }

  assert.deepEqual(erros, [], `\n${erros.join('\n')}\n`);
});

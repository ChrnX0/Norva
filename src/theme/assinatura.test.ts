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
 * As duas exceções, e por que elas moram no CÓDIGO e não numa lista aqui.
 *
 * A primeira versão guardava exceção por `arquivo:linha`. Ela durou uma edição:
 * acrescentei três linhas no cabeçalho do "Mais" e a exceção da linha 157 passou
 * a apontar para o nada, com o guarda reprovando o que ele mesmo tinha aprovado.
 * Endereço por número de linha apodrece — e uma lista longe do código é uma lista
 * que ninguém lê no dia em que mexe no código.
 *
 * Agora a exceção é um comentário logo acima do cartão, e ela anda junto com ele.
 * Escreve-se assim, em JSX:
 *
 *     porta: mint — a gaveta abre insumos e lugares, que são estoque
 *     sinal — o cartão só existe enquanto o insumo está acabando
 *
 * **porta**: o cartão não fala de si, fala de para onde leva — a gaveta do
 * "Mais", a seção da capa nos Ajustes. Carrega a cor do DESTINO, escrita no
 * marcador, e o guarda confere esse valor em vez de só desviar dele.
 *
 * **sinal**: vermelho e âmbar não dizem "de que assunto isto é", dizem "isto está
 * acontecendo agora". O ternário não precisa de marcador — o guarda lê os dois
 * ramos e cobra o calmo. O marcador é para o cartão que NASCE em sinal e não
 * volta, aquele cuja razão de existir é o alerta.
 */
const MARCADOR = /\{\/\*\s*(porta|sinal)\b([^*]*)\*\//;

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

type Uso = {
  arquivo: string;
  linha: number;
  glifo: string;
  tom: string;
  areaDaTela: string | null;
  /** O marcador de exceção achado logo acima do cartão, se houver. */
  marca: { tipo: string; resto: string } | null;
};

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
  const bruto = readFileSync(arquivo, 'utf8');
  const original = bruto.split('\n');
  const fonte = codigo(bruto);
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

    // O marcador vive nas seis linhas acima do cartão — perto o bastante para
    // quem lê o cartão ler o motivo junto. Ele sai do texto ORIGINAL, porque
    // `codigo()` apagou os comentários daquele que a busca usa.
    const linha = fonte.slice(0, abre.index).split('\n').length;
    const vizinhanca = original.slice(Math.max(0, linha - 7), linha - 1).join('\n');
    const m = MARCADOR.exec(vizinhanca);

    achados.push({
      arquivo,
      linha,
      glifo: glifo[1],
      tom,
      areaDaTela: area,
      marca: m ? { tipo: m[1], resto: m[2].trim() } : null,
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

    if (uso.marca?.tipo === 'sinal') continue;

    if (uso.marca?.tipo === 'porta') {
      const destino = /^:?\s*(\w+)/.exec(uso.marca.resto)?.[1];
      if (!destino) {
        erros.push(`${chave}: marcador "porta" sem destino — escreva "porta: mint — motivo"`);
      } else if (!uso.tom.includes(`palette.${destino}`)) {
        erros.push(`${chave}: é porta para "${destino}" e sai em "${uso.tom}"`);
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
          "Se o cartão só existe enquanto há alerta, ponha o marcador 'sinal' acima dele.",
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

/**
 * A espessura do traço mora no tema, e em nenhum outro lugar.
 *
 * Ela morava em VINTE E SEIS: `skin === 'papel' ? 1.7 : 2.2`, copiada em vinte e
 * cinco arquivos. Nenhuma cópia estava errada, e é isso que engana — a conta só
 * aparece no dia em que a decisão muda, porque aí são vinte e seis edições e uma
 * esquecida, e a tela esquecida fica desenhando na espessura da OUTRA cara.
 *
 * É a mesma doença que o guarda de cor acima cobra, na dimensão da forma: escolha
 * repetida caso a caso diverge, sempre. `useTheme().traco` responde a pergunta uma
 * vez.
 */
test('the stroke weight is decided once, in the theme', () => {
  const erros: string[] = [];
  for (const arquivo of RAIZES.flatMap((r) => telas(r))) {
    const fonte = codigo(readFileSync(arquivo, 'utf8'));
    const linhas = fonte.split('\n');
    linhas.forEach((linha, i) => {
      if (/1\.7\s*:\s*2\.2/.test(linha) || /\bconst\s+traco\s*=/.test(linha)) {
        erros.push(
          `${arquivo}:${i + 1}: a espessura do traço é decidida aqui. ` +
            'Ela vem de `useTheme().traco` — o tema é quem sabe qual cara está no ar.',
        );
      }
    });
  }
  assert.deepEqual(erros, [], `\n${erros.join('\n')}\n`);
});


/**
 * O que cada desenho FAZ — ou por que ele fica parado.
 *
 * **Por que esta tabela existe.** Em 6 de setembro o dono apontou uma tela e
 * disse: *"me incomoda esses ícones sem cor e sem animação"*. Fui contar: oito
 * dos vinte e seis se mexiam. Os outros dezoito não estavam parados por decisão
 * — estavam parados porque **ninguém tinha feito a pergunta** para cada um.
 *
 * A decisão escrita (`src/components/Card.tsx`) nunca disse "desenho não se
 * mexe". Ela recusou uma coisa diferente e mais específica: **um respiro
 * genérico, igual para os vinte e seis**. O que ficou no lugar foi *"a vida mora
 * DENTRO de cada desenho, e só onde ela tem o que dizer"* — e "só onde tem o que
 * dizer" é uma pergunta por glifo que nunca foi respondida por glifo.
 *
 * Então a resposta agora é obrigatória, e vale nos dois sentidos: quem declara um
 * movimento tem que ter `Vivo` ou `Coluna` no desenho, e quem declara `parado`
 * tem que dizer POR QUÊ e não pode ter. `src/theme/assinatura.test.ts` cobra as
 * duas metades.
 *
 * **E parado continua sendo resposta certa para a maioria.** Papel não se mexe.
 * Uma grade de produtos não se mexe. Um "+" que balança é ruído, não vida. O que
 * se mexe é o que a FÁBRICA mexe — e é por isso que o saco enche, o toldo balança
 * e a coluna do termômetro sobe.
 */
export const MOVIMENTO_DO_GLIFO: Record<string, string> = {
  // --- os que se mexem, e o que cada um faz ---
  GlyphProduction: 'anda',
  GlyphPrice: 'anda',
  GlyphKettle: 'sobe',
  GlyphVehicle: 'gira',
  GlyphCustomer: 'balanca',
  GlyphLabel: 'balanca',
  GlyphThermometer: 'coluna',
  GlyphSettings: 'gira',
  GlyphStock: 'coluna',
  GlyphStore: 'balanca',

  // --- os que ficam, e por quê ---
  GlyphBox:
    'parado: a caixa É o desenho inteiro, e mover tudo é exatamente o respiro genérico que o dono recusou. Ela anda quando está na esteira, e lá quem anda é o GlyphProduction',
  GlyphOrder: 'parado: prancheta apoiada. Papel não se mexe sozinho, e seis papéis balançando seria o respiro de volta com outro nome',
  GlyphRecipe: 'parado: a ficha é papel na parede — o que muda nela é o texto, não o papel',
  GlyphPurchase: 'parado: a nota chegou com a mercadoria e ficou. Recibo em cima da mesa não se mexe',
  GlyphCount: 'parado: a lista com os tiques é o registro de uma conferência que já aconteceu',
  GlyphCalendar: 'parado: folhinha na parede. O que muda é o dia marcado, e dia marcado não é movimento',
  GlyphCatalog: 'parado: a grade do que a fábrica sabe fazer é um índice, e índice não se agita',
  GlyphChart:
    'parado por ora, e é candidato: as três barras poderiam subir com a mesma peça do termômetro, mas hoje são `Path` e não `Rect` — mexer nisso é redesenhar, não animar',
  GlyphFactory:
    'parado por ora, e é candidato: a fumaça da chaminé SOBE na cena aprovada da capa, e este desenho não tem fumaça desenhada. Acrescentá-la é traço novo',
  GlyphSack: 'parado: o saco que chega no caminhão está no chão, cheio e fechado. Quem enche e esvazia é o almoxarifado (GlyphStock)',
  GlyphBucket: 'parado: balde em pé. Ele balança quando alguém o carrega, e ninguém o carrega dentro de um crachá',
  GlyphPackaging: 'parado: filme soldado é material em repouso, e o que ele faz é ficar fechado',
  GlyphStick: 'parado: palitos em leque, material contado por milheiro. Haste de madeira parada é haste de madeira',
  GlyphLoss:
    'parado: "a gota que escorreu" está no passado — ela já correu. Uma gota que escorre para sempre num crachá é a perda acontecendo agora, que não é o que a tela diz',
  GlyphAssistant: 'parado: balão de fala é a pergunta escrita, e escrita não treme',
  GlyphPlus: 'parado: gesto de interface, não coisa da fábrica. Um "+" que se mexe é ruído com cara de vida',
};

test('every drawing says what it does, or why it stays still', () => {
  // O dono apontou "ícones sem cor e sem animação" e o número era oito de vinte
  // e seis. Nenhum dos dezoito estava parado por decisão: estava parado porque a
  // pergunta nunca tinha sido feita para ele. Este guarda faz a pergunta virar
  // obrigatória — e obriga nos dois sentidos, senão a tabela vira enfeite.
  const fonte = readFileSync('src/components/Glyph.tsx', 'utf8');
  const blocos = fonte.split(/\nexport function (Glyph\w+)/);

  const semDeclaracao: string[] = [];
  const mente: string[] = [];

  for (let i = 1; i < blocos.length; i += 2) {
    const nome = blocos[i];
    const corpo = blocos[i + 1].split('\n}\n')[0];
    const declarado = MOVIMENTO_DO_GLIFO[nome];

    if (declarado === undefined) {
      semDeclaracao.push(nome);
      continue;
    }

    const seMexe = corpo.includes('<Vivo') || corpo.includes('<Coluna');
    const diseQueFica = declarado.startsWith('parado');

    if (diseQueFica && seMexe) {
      mente.push(`${nome} diz que fica parado e tem movimento no desenho`);
    }
    if (!diseQueFica && !seMexe) {
      mente.push(`${nome} declara "${declarado}" e não tem Vivo nem Coluna no desenho`);
    }
    if (diseQueFica && declarado.length < 40) {
      mente.push(`${nome}: "parado" precisa dizer POR QUÊ, e a razão tem que caber numa frase de verdade`);
    }
  }

  assert.deepEqual(
    semDeclaracao,
    [],
    `estes desenhos não dizem o que fazem: ${semDeclaracao.join(' · ')}. Declare em ` +
      'src/components/glifos.ts o movimento, ou "parado: <por quê>". Parado é resposta ' +
      'certa para papel e para grade — o que não é resposta é ninguém ter perguntado.',
  );
  assert.deepEqual(mente, [], mente.join(' · '));
});

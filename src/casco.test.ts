import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * **A leitura que falha não pode desenhar como um estado vazio.**
 *
 * Neste aplicativo vazio é uma AFIRMAÇÃO: "não saiu nada hoje", "não há saldo",
 * "não há ficha cadastrada". Uma consulta que quebrou produz exatamente a mesma
 * tela, e quem olha lê o fato errado sobre a própria fábrica — que é a pior
 * classe de defeito num produto cuja razão de existir é o número ser confiável.
 *
 * Medido em 10 de setembro, e o número é o motivo desta guarda existir: **32
 * telas chamavam `useQuery` e UMA olhava o `error`** — a capa, consertada no dia
 * anterior. As outras trinta e uma engoliam.
 *
 * O conserto não é editar trinta e uma telas do mesmo jeito trinta e uma vezes:
 * é o casco por onde todas passam saber desenhar a falha, e cada tela entregar o
 * dado. Comportamento mora no `CollapsingHeader`; o DADO é da tela, e por isso
 * ela precisa passá-lo. Quem cobra a entrega é esta guarda.
 */
function telas(dir: string, into: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) telas(caminho, into);
    else if (nome.endsWith('.tsx')) into.push(caminho);
  }
  return into;
}

/**
 * **As telas que ainda engolem, nomeadas uma a uma.**
 *
 * Esta lista existe para a guarda entrar HOJE em vez de esperar as trinta e uma
 * ficarem prontas — e ela só encolhe. Cada nome aqui é uma tela onde uma consulta
 * que falha continua desenhando como "não há nada". Não é fronteira permanente
 * como as do dicionário: é dívida com endereço.
 */
const POR_DECISAO: Record<string, string> = {
  'app/assistant.tsx':
    'fecha por OMISSÃO de propósito, e está escrito no docblock de `useCapacidades`: ' +
    '"se este useQuery falhar, o assistente responde menos em vez de responder o que não ' +
    'devia". Uma página de falha aqui trocaria uma tela que ainda serve por uma que não ' +
    'serve, e a permissão é justamente o que não pode falhar para o lado aberto.',
};

const AINDA_ENGOLEM: string[] = [];

/**
 * **A régua conta, não confere presença — e o que ela contava absolvia o arquivo inteiro.**
 *
 * Ela era `!fonte.includes('erro={')`, o que é uma pergunta por ARQUIVO. Só que uma tela
 * tem mais de um casco: o do ramo de carga (`if (loading) return …`) e o do caminho
 * principal. As cinco telas de dois cascos passavam o `erro` no PRIMEIRO e nenhuma no
 * segundo — e a régua ficava verde nas cinco, porque o primeiro basta para o `includes`.
 *
 * O defeito que isso deixava de pé é o que esta guarda existe para pegar, inteiro: `if
 * (loading)` não cobre a falha DEPOIS da carga. Ali `loading` já é falso, `data` é
 * undefined, e a tela cai no caminho principal desenhando *"Nada cadastrado ainda"* —
 * vazio, que neste aplicativo é uma AFIRMAÇÃO sobre a fábrica de quem olha.
 *
 * Medido em 13 de setembro: `app/inputs/[id].tsx`, `app/lots/[id].tsx`,
 * `app/production/new.tsx`, `app/purchase.tsx` e `app/transfer.tsx` — dois cascos e um
 * `erro=` em cada uma, e a guarda aprovando as cinco.
 */
function engole(caminho: string): boolean {
  const fonte = readFileSync(caminho, 'utf8');
  if (!fonte.includes('useQuery') || !fonte.includes('CollapsingHeader')) return false;
  const cascos = fonte.split('<CollapsingHeader').length - 1;
  const entregas = fonte.split('erro={').length - 1;
  return entregas < cascos;
}

test('toda tela que lê do banco sabe dizer que a leitura falhou', () => {
  const engolindo = telas('app').filter(engole).sort();
  const novas = engolindo.filter((t) => !AINDA_ENGOLEM.includes(t) && !(t in POR_DECISAO));

  assert.deepEqual(
    novas,
    [],
    'tela nova com useQuery: passe erro={error} e denovo={refresh} ao CollapsingHeader',
  );
});

test('a lista de dívida só guarda tela que de fato ainda engole', () => {
  const engolindo = telas('app').filter(engole);
  const pagas = AINDA_ENGOLEM.filter((t) => !engolindo.includes(t));
  assert.deepEqual(
    Object.keys(POR_DECISAO).filter((t) => !engolindo.includes(t)),
    [],
    'esta tela deixou de engolir — a fronteira escrita virou dívida paga, tire-a de POR_DECISAO',
  );

  assert.deepEqual(
    pagas,
    [],
    'estas telas já mostram a falha — tire-as de AINDA_ENGOLEM, que é dívida e só encolhe',
  );
});

test('a régua separa a tela que engole da que já avisa, e ignora quem não lê', () => {
  // Verdadeiro e falso do detector, contra as telas de verdade: a que acabou de
  // ser ligada não pode aparecer, e uma da lista tem de aparecer.
  assert.equal(engole('app/production/new.tsx'), false, 'esta já entrega o erro nos DOIS cascos');
  assert.equal(engole('app/assistant.tsx'), true, 'esta fecha por omissão, de propósito');
  // E uma tela sem consulta nenhuma não é assunto desta guarda.
  assert.equal(engole('app/_layout.tsx'), false);
});

/**
 * **E a irmã disto: a tela que desenha o VAZIO durante a CARGA.**
 *
 * A guarda acima cobre a leitura que FALHOU. Esta cobre a que ainda não respondeu, e as
 * duas são a mesma frase com outro sujeito: vazio, neste aplicativo, é uma AFIRMAÇÃO —
 * *"nenhuma loja cadastrada"*, *"não há nada em Loja Centro"*, *"ninguém cadastrado"* —, e
 * afirmar isso antes de saber conta um fato errado sobre a fábrica de quem olha, no primeiro
 * quadro de toda abertura.
 *
 * Medido em 13 de setembro: **sete** telas (`picking`, `transfer`, `places`, `mirror`, `who`,
 * `people`, `carriers`) não mencionavam `loading` em linha nenhuma, e `app/(tabs)/transport.tsx`
 * já tinha o molde certo desde antes — `{!loading && lista.length === 0 ? …}`.
 *
 * **E há DUAS formas válidas, não uma** — isto é o que a primeira versão desta régua errava.
 * `app/orders/new.tsx` escreve `{data && data.places.length === 0 ? …}`: com `data` undefined
 * durante a carga, o ramo não desenha, e o resultado é o mesmo. Uma régua que exigisse a
 * palavra `loading` acusaria uma tela correta — e o conserto que ela pediria seria decoração.
 *
 * A janela é de cinco linhas para trás mais a linha inteira, e as duas pontas têm razão
 * medida: a guarda aparece dos DOIS lados do predicado (`x.length === 0 && !dados.loading` é
 * a mesma resposta que o contrário), e o ramo de carga costuma ser o ternário de fora, duas a
 * cinco linhas acima (`app/inputs/index.tsx:404` é o caso que fixou o cinco).
 *
 * **A fronteira, dita porque ela não é descuido:** guarda em bloco envolvente MAIS distante
 * que cinco linhas esta régua não vê, e brace-matching em JSX é exatamente a armadilha que
 * este repositório já pagou (`[^)]*` parando no `()` da arrow function). Então o que sobra é
 * lista escrita, com o motivo e o número da linha que guarda — e ela só encolhe.
 */
const VAZIO_COM_RAZAO: Record<string, string> = {
  'app/assistant.tsx:244':
    '`turns` é a CONVERSA, estado local da tela, não resposta de consulta: ela nasce vazia ' +
    'de propósito e a frase de boas-vindas é o conteúdo, não uma afirmação sobre a fábrica.',
  'app/catalog.tsx:534':
    'dentro do `{loading ? null : (` da linha 526 — a carga é o ternário de fora, oito linhas ' +
    'acima, e `categoriasDaLinha` é derivada de dado JÁ carregado.',
  'app/catalog.tsx:625':
    'dentro do `{loading ? null : (` da linha 617, pela mesma razão: `tiposDaLinha` é recorte ' +
    'de dado já carregado.',
};

/** As palavras com que este repositório nomeia "ainda não respondeu". */
const CARGA = ['loading', 'carregando', 'buscando', 'procurando', 'searching'];

/** Um ramo de vazio sem guarda de carga, com a linha para poder ser nomeado. */
function vazioSemGuarda(caminho: string): string[] {
  const fonte = readFileSync(caminho, 'utf8');
  if (!fonte.includes('useQuery')) return [];
  const linhas = fonte.split('\n');
  const fora: string[] = [];
  linhas.forEach((linha, i) => {
    if (!linha.includes('.length === 0')) return;
    // Ramo condicional, não validação de formulário nem botão desligado.
    if (!linha.includes('?') && !linha.includes('&&')) return;
    if (linha.includes('disabled=') || linha.trim().startsWith('if ') || linha.includes('return set')) return;
    const janela = linhas.slice(Math.max(0, i - 5), i + 1).join(' ');
    if (CARGA.some((p) => janela.includes(p))) return;
    if (/\b\w+(\?\.\w+)* &&/.test(janela)) return;
    fora.push(`${caminho}:${i + 1}`);
  });
  return fora;
}

test('nenhuma tela afirma o vazio enquanto a consulta não respondeu', () => {
  const semGuarda = telas('app').flatMap(vazioSemGuarda).sort();
  const novos = semGuarda.filter((x) => !(x in VAZIO_COM_RAZAO));

  assert.deepEqual(
    novos,
    [],
    'este ramo desenha "não há nada" antes de a consulta responder: ponha o `!loading` (ou o ' +
      '`data &&`) na frente, ou escreva a razão em VAZIO_COM_RAZAO com a linha que guarda',
  );
});

test('a lista de vazio-com-razão só guarda ramo que de fato não tem guarda', () => {
  const semGuarda = telas('app').flatMap(vazioSemGuarda);
  const pagas = Object.keys(VAZIO_COM_RAZAO).filter((x) => !semGuarda.includes(x));
  assert.deepEqual(
    pagas,
    [],
    'este ramo ganhou guarda (ou mudou de linha) — tire-o de VAZIO_COM_RAZAO, que é fronteira ' +
      'escrita e não decoração',
  );
});

test('a régua do vazio separa a tela guardada da que afirma, e pelas DUAS formas', () => {
  // Falso: o molde que já estava certo desde antes desta rodada.
  assert.deepEqual(
    vazioSemGuarda('app/(tabs)/transport.tsx'),
    [],
    'esta usa `!loading && places.length === 0` — o molde',
  );
  // Falso pela OUTRA forma: `data &&` em vez da palavra `loading`.
  assert.deepEqual(
    vazioSemGuarda('app/orders/new.tsx'),
    [],
    'esta guarda com `data &&`, que é a segunda forma válida — acusá-la pediria decoração',
  );
  // Verdadeiro: o assistente está na lista escrita justamente porque a régua o acusa.
  assert.deepEqual(
    vazioSemGuarda('app/assistant.tsx'),
    ['app/assistant.tsx:244'],
    'a régua morde aqui, e é a razão escrita que o dispensa — não a régua',
  );
});

/**
 * **A DECISÃO DE COMPRAR é uma só, e ela estava escrita em quatro lugares.**
 *
 * Em 6 de setembro esta casa achou duas réguas para a mesma decisão e escreveu a boa: o dia
 * de comprar é quando a cobertura encosta no prazo do fornecedor mais a folga da empresa
 * (`precisaComprar`). O aviso passou a usá-la e a ficha do insumo desenha a mesma álgebra
 * em unidades (`reorderPoint`). **A capa continuou com duas réguas próprias**, e nenhuma
 * das duas olha prazo de fornecedor:
 *
 *  - o cartão "Insumo acabando" pedia `runningOut(…, 7, 7)` — sete dias cravados;
 *  - a barra da cobertura pintava de alerta a um quinto de trinta dias, ou seja a seis.
 *
 * Com fornecedor de seis dias e folga de dois, a notificação dizia *"compre"* a oito dias e
 * a capa ficava calada por dois. Com fornecedor de dez, por cinco. Não é o número que está
 * errado em nenhum dos lados — é o aplicativo discordando de si mesmo na mesma manhã, e
 * quem usa não tem como saber qual dos dois acreditar.
 *
 * A régua olha a FONTE porque não há outro jeito: o que ela guarda é a capa continuar
 * perguntando ao domínio em vez de recriar o limite. Um horizonte numérico no lugar do teto
 * de candidatos volta a ser régua nova, e é ele que esta guarda procura.
 */
test('a capa decide comprar pela régua do domínio, e não por um horizonte próprio', () => {
  const capa = readFileSync('app/(tabs)/index.tsx', 'utf8');

  assert.match(
    capa,
    /precisaComprar\(/,
    'a capa tem de perguntar ao domínio quando é dia de comprar — o aviso e a ficha já ' +
      'perguntam, e três réguas para uma decisão é o app discordando de si mesmo',
  );

  /**
   * E o horizonte passado à consulta é um TETO de candidatos, não a régua.
   *
   * A diferença é medível: o teto tem de ser largo o bastante para não excluir item
   * nenhum que a régua fosse pegar. Sete dias não é — um fornecedor de dez dias com dois
   * de folga decide a doze. Então o número mínimo aceitável aqui é uma constante nomeada,
   * e a guarda cobra o nome: `runningOut` com número cravado no lugar do horizonte é
   * exatamente a forma que estava errada.
   */
  // Sem a PROSA: este arquivo explica o defeito antigo em português, e a explicação
  // contém a forma que a régua procura. Foi medido — a guarda acusou o próprio comentário
  // que conta a história, que é a cicatriz do docblock do relógio, escrita no `CLAUDE.md`.
  // Marcar a prosa ensinaria a espalhar marcador; então a régua lê só o código.
  const codigo = capa
    .split('\n')
    .filter((linha) => !/^(\*|\/\/|\/\*)/.test(linha.trim()))
    .join('\n');
  /**
   * O QUINTO argumento de cada chamada, lido por posição e não por uma expressão regular
   * que adivinha o quarto.
   *
   * A primeira versão procurava `, 7,` para achar o horizonte depois dele — e ela casava
   * com a PROSA deste arquivo e não com as chamadas, porque `[^)]` não atravessa o `)` de
   * `empresaDaqui()`. Ou seja: ela acusava o comentário que conta a história e era cega
   * para o código. Só a asserção de vivacidade logo abaixo mostrou isso — sem ela a guarda
   * passaria para sempre sem ler nada, que é o defeito que este repositório mais persegue.
   */
  const chamadas = codigo
    .split('\n')
    .filter((linha) => linha.includes('runningOut('))
    .map((linha) => linha.slice(linha.indexOf('runningOut(') + 'runningOut('.length))
    .map((args) => args.split(',')[4]?.trim() ?? '')
    .filter((horizonte) => horizonte.length > 0);
  assert.ok(chamadas.length > 0, 'a capa deixou de perguntar o que está acabando');
  assert.deepEqual(
    chamadas.filter((horizonte) => /^\d+$/.test(horizonte)),
    [],
    'horizonte cravado em número: ou é o teto de candidatos (constante com nome) ou é ' +
      'infinito (a cobertura inteira) — número solto aqui é a régua de compra renascendo',
  );
});

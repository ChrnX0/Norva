import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TINTA_CLARA, TINTA_ESCURA, contraste, mistura, tintaSobre } from './contraste';
import { test } from 'node:test';

/**
 * O texto pequeno tem de ser legível no corredor da câmara, com luva e
 * condensação — e isso é um número, não uma opinião.
 *
 * **A cicatriz.** A auditoria mediu `inkFaint` em **2,55:1** no tema que sai da
 * caixa, com 124 corridas de texto de 11 e 13 px pintadas com ele. O rótulo que diz
 * O QUE o número é ("valor parado", "por mil", "conferido em") ficava ilegível
 * exatamente onde o aplicativo é usado: tela suja, luz de galpão, luva de frio. O
 * número aparecia sozinho, o que é o oposto da Lei 3.
 *
 * A régua é a da WCAG para texto normal: **4,5:1**. Este projeto não tem texto
 * grande o bastante para a régua de 3:1 valer — a maior fonte de corpo é 15 px, e
 * as três camadas de tinta são usadas em 11, 13 e 15.
 *
 * **Por que ler o arquivo em vez de importar os tokens.** Lendo o texto, cada paleta é
 * medida com a cor que alguém digitou ali — e uma cor nova, colada amanhã, entra na
 * medição sem ninguém acrescentar nada. Importar traria os objetos já montados, e uma
 * paleta que herdasse campos por espalhamento seria medida pelo que a herança produziu
 * em vez do que está escrito.
 *
 * *Este parágrafo dizia que o `Palette` do Papel herda do Orgânico por espalhamento.
 * Conferido em 9 de setembro: não há um `...` no arquivo inteiro — cada pele é um
 * literal completo. A razão de ler o texto continua boa; o exemplo dela envelheceu, e
 * exemplo que envelhece num docblock é o mesmo defeito da decisão registrada que
 * envelhece, com a diferença de que este é lido por quem vai mexer na guarda.*
 *
 * **E `lightPalette`/`darkPalette` não pintam nada.** Elas são a FORMA do tipo
 * (`Palette = typeof lightPalette`), e o `palettes` que as exporta não tem leitor — o
 * `ThemeProvider` resolve a paleta pela pele. Continuam medidas de propósito: são os
 * valores que uma pele nova copia ao nascer, e uma referência errada ali sai de graça
 * na terceira pele.
 */
const FONTE = readFileSync('src/theme/tokens.ts', 'utf8');

/** As camadas de tinta que pintam TEXTO, na ordem em que somem. */
const TINTAS = ['ink', 'inkMuted', 'inkFaint'] as const;

/**
 * Os acentos — e eles entraram aqui por uma cicatriz de 6 de setembro.
 *
 * Ao subir a saturação do Papel a pedido do dono (*"está bonito, mas um tanto
 * apagado"*), eu conferi cada tom novo contra `paper` e escrevi os catorze com o
 * contraste na mão. Cinco deles caíram abaixo de 4,5 sobre `sunken`, que é o
 * fundo mais escuro dos três — e **esta guarda passou verde**, porque media as
 * três camadas de tinta e não os acentos.
 *
 * Acento pinta texto: o "amanhã +2°" do tempo é `palette.apricot` em corpo 11, e
 * há pelo menos seis telas assim. A régua sempre valeu para eles; o que faltava
 * era alguém medir.
 *
 * `onAccent` fica de fora de propósito: ele não pinta sobre fundo de página, e
 * sim sobre o próprio acento — quem mede esse par é o `tintaSobre`, que o botão
 * usa em tempo de execução.
 */
const ACENTOS = [
  'sky',
  'apricot',
  'mint',
  'lilac',
  'rose',
  'sage',
  'sand',
  'mist',
  'ok',
  'warning',
  'danger',
  'neutral',
] as const;
/** Os fundos em que uma tela deste aplicativo pinta texto. */
const FUNDOS = ['paper', 'surface', 'sunken'] as const;
/** WCAG AA para texto normal. */
const MINIMO = 4.5;

// A régua mora em `contraste.ts` agora, porque o aplicativo também precisa dela
// em tempo de execução: o botão escolhe a tinta dele medindo, não declarando.

/** Cada paleta escrita no arquivo, com as cores que alguém digitou nela. */
function paletas(): { nome: string; cores: Record<string, string> }[] {
  const achadas: { nome: string; cores: Record<string, string> }[] = [];
  for (const m of FONTE.matchAll(/const (\w*[Pp]alette|\w*(?:Claro|Escuro))[^=]*= \{/g)) {
    const inicio = m.index ?? 0;
    const corpo = FONTE.slice(inicio, FONTE.indexOf('\n};', inicio));
    // Se dentro do corpo há outra declaração, o bloco não fechou onde eu pensei —
    // foi o caso de `const palettes = { light, dark }`, que não tem cor nenhuma e
    // engoliu a paleta escrita abaixo dela, medindo a mesma coisa duas vezes com o
    // nome errado.
    if (/\n(?:export )?(?:const|type|function) /.test(corpo)) continue;

    const cores: Record<string, string> = {};
    for (const c of corpo.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)) cores[c[1]] = c[2];
    // Só o que é paleta de verdade: tem fundo e tem tinta.
    if (cores.paper && cores.ink) achadas.push({ nome: m[1], cores });
  }
  return achadas;
}

/**
 * Toda pele do catálogo tem as duas paletas MEDIDAS aqui — e não só as que a
 * busca por nome encontrou.
 *
 * A leitura acima acha paleta por convenção de nome (`\w*Claro|\w*Escuro`). Isso
 * bastava com duas peles, e é exatamente o tipo de coisa que falha em silêncio na
 * terceira: uma paleta batizada fora do padrão simplesmente não é encontrada, e
 * o teste passa por não ter olhado. Aqui a lista de peles vem do catálogo, e o
 * que não foi medido é dito pelo nome.
 */
test('every skin in the catalogue has both palettes measured', async () => {
  const { skins } = await import('./tokens');
  const medidas = new Set(paletas().map((p) => p.nome.toLowerCase()));
  const faltando = Object.keys(skins).flatMap((pele) =>
    ['claro', 'escuro']
      .filter((luz) => !medidas.has(`${pele}${luz}`))
      .map((luz) => `${pele}${luz}`),
  );
  assert.deepEqual(
    faltando,
    [],
    `estas paletas não foram medidas por nenhuma checagem de contraste: ${faltando.join(', ')}`,
  );
});

test('every ink the app writes text with is legible on every ground it writes on', () => {
  const todas = paletas();
  assert.ok(todas.length >= 4, `a leitura das paletas veio com ${todas.length} — a comparação seria de graça`);

  const fracas: string[] = [];
  for (const { nome, cores } of todas) {
    for (const tinta of TINTAS) {
      for (const fundo of FUNDOS) {
        if (!cores[tinta] || !cores[fundo]) continue;
        const razao = contraste(cores[tinta], cores[fundo]);
        if (razao < MINIMO) {
          fracas.push(`${nome}.${tinta} sobre ${fundo}: ${razao.toFixed(2)}:1 (${cores[tinta]} / ${cores[fundo]})`);
        }
      }
    }
  }

  assert.deepEqual(
    fracas,
    [],
    `estas combinações reprovam a régua de ${MINIMO}:1 da WCAG:\n  ${fracas.join('\n  ')}\n` +
      'Texto de 11 e 13 px pintado assim é ilegível no corredor da câmara, com luva e ' +
      'condensação — e é justamente o rótulo que diz O QUE o número é.',
  );
});

test('the ruler is a ruler: black on white passes, gray on gray does not', () => {
  // A régua conferida com dois casos que não dependem de nenhuma paleta.
  assert.ok(contraste('#000000', '#FFFFFF') > 20, 'preto no branco é 21:1');
  assert.ok(contraste('#777777', '#888888') < 1.5, 'cinza em cinza não passa');
  // E ela é simétrica: contraste não tem ordem.
  assert.equal(contraste('#123456', '#FEDCBA'), contraste('#FEDCBA', '#123456'));
});

/**
 * O passo mínimo entre as três tintas — e por que "maior que" não bastava.
 *
 * **A cicatriz é de horas atrás e é minha.** Subir `inkFaint` até a régua da WCAG
 * empurrou ela para cima de `inkMuted` nos dois temas CLAROS: no Papel ficaram 5,07
 * e 5,34 contra o papel — 5% de diferença, que existe na conta e não existe no olho.
 * A guarda pedia ordem, e 5,34 > 5,07 passa. Três camadas viraram duas, a tela que
 * separa rótulo de corpo por tom ficou plana, e quem viu foi o dono abrindo o
 * aplicativo: *"cadê o tema papel light"*.
 *
 * 1,35× é o piso, e ele não é gosto: os dois temas ESCUROS, que estavam prontos,
 * medem 1,5× entre camadas. Eles são a referência que o claro perdeu.
 */
const PASSO = 1.35;

test('the three inks stay a hierarchy, not three names for one gray', () => {
  const frouxas: string[] = [];
  for (const { nome, cores } of paletas()) {
    const forte = contraste(cores.ink, cores.paper);
    const medio = contraste(cores.inkMuted, cores.paper);
    const fraco = contraste(cores.inkFaint, cores.paper);
    if (forte / medio < PASSO) frouxas.push(`${nome}: forte/média = ${(forte / medio).toFixed(2)}`);
    if (medio / fraco < PASSO) frouxas.push(`${nome}: média/fraca = ${(medio / fraco).toFixed(2)}`);
  }

  assert.deepEqual(
    frouxas,
    [],
    `estas camadas de tinta estão perto demais para o olho separar:\n  ${frouxas.join('\n  ')}\n` +
      `O piso é ${PASSO}× de razão de contraste entre camadas. Ordem não é hierarquia: ` +
      'duas tintas a 5% de distância passam em "maior que" e desenham a mesma tela plana.',
  );
});

/**
 * A palavra do botão, sobre a cor com que ele é de fato pintado.
 *
 * A guarda de cima mede as tintas de TEXTO sobre os fundos de PÁGINA, e passou
 * verde durante todo o tempo em que o botão primário do Papel escuro escrevia em
 * tinta escura sobre marrom médio. Ela não estava errada: estava medindo outra
 * coisa — o vizinho da propriedade, de novo, que é a família de defeito que este
 * repositório já registrou quatro vezes.
 *
 * O botão é a **única massa de cor forte** de uma tela e carrega a ação; se há um
 * texto neste aplicativo que não pode ficar ilegível, é esse. Aqui se mede o par
 * de verdade: cada cor com que um botão pode ser preenchido — os oito acentos de
 * área de cada paleta e a marca de cada paisagem — contra a tinta que o
 * `tintaSobre` escolheria para ela.
 */
test('the word on a button is legible on every colour a button is painted with', () => {
  const AREAS = ['apricot', 'mint', 'lilac', 'sage', 'sky', 'mist', 'danger', 'warning'] as const;
  const fracas: string[] = [];

  for (const { nome, cores } of paletas()) {
    const fundos = new Set<string>();
    for (const area of AREAS) if (cores[area]) fundos.add(cores[area]);
    for (const fundo of fundos) {
      const tinta = tintaSobre(fundo, TINTA_CLARA, TINTA_ESCURA);
      const razao = contraste(tinta, fundo);
      if (razao < MINIMO) fracas.push(`${nome}: ${tinta} sobre ${fundo} dá ${razao.toFixed(2)}:1`);
    }
  }

  // E as cinco paisagens do Orgânico, que pintam o botão pela `brand`.
  for (const m of FONTE.matchAll(/(\w+): \{ brand: '(#[0-9A-Fa-f]{6})'/g)) {
    const fundo = m[2];
    const tinta = tintaSobre(fundo, TINTA_CLARA, TINTA_ESCURA);
    const razao = contraste(tinta, fundo);
    if (razao < MINIMO) fracas.push(`paisagem ${m[1]}: ${tinta} sobre ${fundo} dá ${razao.toFixed(2)}:1`);
  }

  assert.deepEqual(
    fracas,
    [],
    `a palavra do botão reprova a régua de ${MINIMO}:1 nestas cores:\n  ${fracas.join('\n  ')}\n` +
      'Botão é a ação da tela: ilegível ali não é um detalhe de estilo.',
  );
});

/**
 * Os pontos de quebra são coerentes entre si, ou o telefone paga.
 *
 * Três números decidem a largura da página, e eles têm uma ordem obrigatória:
 * a medida de uma coluna (600), o ponto em que a página vira duas (840) e a
 * medida das duas juntas (900). Um dedo errado em qualquer um faz a grade de duas
 * colunas descer para o telefone — 393 dp partidos ao meio são duas tiras de 190,
 * que é menos que a largura de um botão.
 *
 * Isto é barato de conferir e caro de descobrir na tela de alguém.
 */
test('the width breakpoints keep the phone out of the two-column grid', async () => {
  const { MEDIDA_DA_PAGINA, MEDIDA_EM_PARES, PARES_A_PARTIR_DE } = await import('./tokens');

  // O piso do Android é 360 e o telefone comum é ~400 (CLAUDE.md). Nenhum dos
  // dois pode alcançar o ponto de parear.
  assert.ok(PARES_A_PARTIR_DE > 412, `${PARES_A_PARTIR_DE} deixaria um telefone parear`);

  // Parear só faz sentido depois que uma coluna já parou de crescer.
  assert.ok(
    PARES_A_PARTIR_DE > MEDIDA_DA_PAGINA,
    'a página vira duas colunas antes de a primeira parar de crescer',
  );

  // E as duas colunas precisam caber, com folga para o vão: cada uma tem de sair
  // mais larga que o telefone em que os cartões foram desenhados.
  assert.ok(
    MEDIDA_EM_PARES / 2 > 412,
    `cada coluna sairia com ${MEDIDA_EM_PARES / 2} dp, mais estreita que um telefone`,
  );
  assert.ok(MEDIDA_EM_PARES >= PARES_A_PARTIR_DE, 'a medida em pares não pode ser menor que o ponto de quebra');
});

/**
 * O mesmo para os ACENTOS, e este teste nasceu de um erro meu.
 *
 * Ele é separado do de cima porque a mensagem precisa dizer outra coisa: tinta
 * fraca some, acento fraco parece decisão de design. Quem lê a falha tem de
 * saber que a saída é escurecer o tom mantendo o matiz e a saturação, e não
 * baixar a régua.
 *
 * A conta que resolveu o caso de 6 de setembro está aqui para a próxima pessoa:
 * conferir contra `paper` (#FAF7F2) não basta, porque `sunken` (#F1EDE5) é meio
 * ponto de luminosidade mais escuro e é o fundo dos blocos rebaixados. Mede-se
 * contra o MAIS ESCURO dos fundos claros, e contra o MAIS CLARO dos escuros.
 */
/**
 * Os pares que reprovam HOJE e continuam de pé, com a razão escrita.
 *
 * Isto não é uma dispensa: é o contrário dela. Sem o registro, a única saída para
 * um achado que eu não posso consertar sozinho seria não medir — e aí a guarda
 * ficaria verde mentindo. Com ele o número está na cara de quem abre o arquivo, e
 * o teste falha nos DOIS sentidos: se aparecer um par novo, e se um par
 * registrado parar de reprovar, porque registro que virou mentira sai da lista.
 *
 * **A lista está VAZIA, e ficou assim em 6 de setembro.** Ela guardou oito pares
 * por algumas horas — sete do Orgânico e o `warning` do Papel — porque consertá-los
 * é mudar uma pele que o dono aprovou olhando, e essa é decisão dele. Ele decidiu:
 * *"faz tudo então"*.
 *
 * Os oito foram escurecidos pelo remédio que esta própria guarda prescreve na
 * mensagem de falha — **matiz e saturação intactos, só a luminosidade desce** — e
 * o cálculo achou o primeiro ponto em que cada um passa, não um valor escolhido a
 * olho. `apricot` foi de #E29B52 a #9D5C1A: matiz 30 nos dois, saturação 71% e
 * 72%, luminosidade de 60% para 36%. É a mesma cor mais escura, e não outra cor —
 * que era exatamente a dúvida que travava a decisão.
 *
 * **E o comentário antigo mentia sobre a própria lista.** Ele dizia "o PAPEL não
 * está aqui" com `lightPalette.warning` na segunda linha do conjunto. Registro se
 * escreve para ser lido depois, e um que se contradiz a três linhas de distância é
 * pior que nenhum: ele ensina a não conferir. Ficou como aviso — a lista manda, o
 * comentário só explica.
 *
 * **A lista vazia continua fazendo força**, e nos dois sentidos: um par novo
 * abaixo da régua reprova, e um par registrado que passe a estar em dia também —
 * porque registro que virou mentira sai da lista.
 */
const ABAIXO_DA_REGUA = new Set<string>([]);

test('every accent the app writes text with is legible on every ground it writes on', () => {
  const todas = paletas();
  assert.ok(todas.length >= 4, `a leitura das paletas veio com ${todas.length} — a comparação seria de graça`);

  const fracas: string[] = [];
  const reprovaram = new Set<string>();
  for (const { nome, cores } of todas) {
    for (const acento of ACENTOS) {
      for (const fundo of FUNDOS) {
        if (!cores[acento] || !cores[fundo]) continue;
        const razao = contraste(cores[acento], cores[fundo]);
        if (razao >= MINIMO) continue;
        const par = `${nome}.${acento}`;
        reprovaram.add(par);
        if (ABAIXO_DA_REGUA.has(par)) continue;
        fracas.push(
          `${par} sobre ${fundo}: ${razao.toFixed(2)}:1 (${cores[acento]} / ${cores[fundo]})`,
        );
      }
    }
  }

  const mentiras = [...ABAIXO_DA_REGUA].filter((par) => !reprovaram.has(par));
  assert.deepEqual(
    mentiras,
    [],
    `estes pares estão registrados como abaixo da régua e HOJE passam: ${mentiras.join(', ')}. ` +
      'Registro que virou mentira sai da lista — senão ela vira dispensa permanente que ' +
      'ninguém revisita, que é exatamente o defeito que o registro existe para não ter.',
  );

  assert.deepEqual(
    fracas,
    [],
    `estes acentos reprovam a régua de ${MINIMO}:1 da WCAG:\n  ${fracas.join('\n  ')}\n` +
      'Acento pinta texto neste aplicativo — o "amanhã +2°" do tempo é o acento em corpo 11. ' +
      'A saída é escurecer o tom mantendo o matiz E a saturação, nunca baixar a régua: ' +
      'foi assim que mint, sage e sand voltaram à faixa depois da subida de saturação de ' +
      '6 de setembro, que passou verde aqui porque esta checagem ainda não existia.',
  );
});

/**
 * O botão DESLIGADO também se lê — e a guarda de cima passava sem olhar para ele.
 *
 * A régua acima mede a palavra contra cada cor com que um botão é PINTADO. Um
 * botão desabilitado não é pintado com nenhuma delas: ele era desbotado inteiro
 * com `opacity: 0.45`, o que compõe preenchimento E rótulo sobre a página. Os
 * dois caminham juntos na direção do fundo e o contraste entre eles desaba —
 * enquanto a guarda continua verde, porque mede a cor cheia, que não está na
 * tela. Mesmo defeito do vizinho da propriedade, mais um andar acima.
 *
 * A foto de 9 de setembro mostrou: "Criar ficha" em branco sobre bege claro.
 *
 * Aqui se mede o que a tela mostra de verdade. E a asserção vale nos dois
 * sentidos de propósito: o jeito ANTIGO tem de REPROVAR nesta mesma régua — sem
 * isso, a guarda não distingue o mundo consertado do mundo quebrado, que é o
 * defeito que este repositório já registrou por escrito.
 */
test('the word on a DISABLED button is legible too, and the old way was not', () => {
  const AREAS = ['apricot', 'mint', 'lilac', 'sage', 'sky', 'mist', 'danger', 'warning'] as const;
  const DESBOTADO = 0.35;
  const ANTIGO = 0.45;
  const fracas: string[] = [];
  /** Quantas combinações o jeito antigo reprovaria — o caso falso da régua. */
  let reprovadasAntes = 0;

  for (const { nome, cores } of paletas()) {
    const pagina = cores.paper;
    if (!pagina) continue;
    for (const area of AREAS) {
      const cheio = cores[area];
      if (!cheio) continue;

      // O jeito novo: só o preenchimento desbota, e a tinta é medida depois.
      const fundo = mistura(cheio, pagina, DESBOTADO);
      const tinta = tintaSobre(fundo, TINTA_CLARA, TINTA_ESCURA);
      const razao = contraste(tinta, fundo);
      if (razao < MINIMO) fracas.push(`${nome}/${area}: ${tinta} sobre ${fundo} dá ${razao.toFixed(2)}:1`);

      // O jeito antigo: a tinta é escolhida contra a cor CHEIA e depois desbotada
      // junto com ela. É esta composição que a tela mostrava.
      const tintaAntes = tintaSobre(cheio, TINTA_CLARA, TINTA_ESCURA);
      const fundoAntes = mistura(cheio, pagina, ANTIGO);
      const escritaAntes = mistura(tintaAntes, pagina, ANTIGO);
      if (contraste(escritaAntes, fundoAntes) < MINIMO) reprovadasAntes += 1;
    }
  }

  assert.deepEqual(
    fracas,
    [],
    `a palavra do botão desligado reprova a régua de ${MINIMO}:1:
  ${fracas.join('\n  ')}
` +
      'Desligado tem de PARECER desligado; não tem de virar segredo.',
  );

  assert.ok(
    reprovadasAntes > 0,
    'o jeito antigo (desbotar o botão inteiro) passou nesta régua — então a régua não ' +
      'separa o mundo consertado do mundo quebrado, e o verde acima não quer dizer nada.',
  );
});

/**
 * A régua que separa tem de ser vista — e nenhuma régua deste projeto media isso.
 *
 * **O que este arquivo mede é TEXTO.** Tinta sobre papel, acento sobre fundo, palavra
 * de botão. O separador — `line` e `lineStrong` — nunca passou por medida nenhuma, e é
 * ele que carrega a estrutura da tela no Papel, uma pele que **não tem caixa**: o
 * docblock de `src/home/Capa.tsx` diz que é a régua "que faz a tela parecer uma página
 * em vez de um painel".
 *
 * O que a medida achou, em 9 de setembro:
 *
 * | pele | `line` antes | `lineStrong` antes |
 * |---|---|---|
 * | organicoClaro | **1,06** | 1,26 |
 * | organicoEscuro | 1,31 | 1,76 |
 * | papelClaro | 1,63 | 2,15 |
 * | papelEscuro | 2,09 | 2,84 |
 *
 * **1,06:1 não é uma linha fraca: é a mesma cor do papel.** A diferença que o olho
 * humano distingue em duas áreas planas grandes fica por volta de 1,2:1 — abaixo disso
 * não há linha, há a memória de uma linha no código. O divisor do dia do Orgânico
 * (`organico.tsx`, o vão entre o nível e as caixas) estava desenhando nada.
 *
 * **O piso é o PAPEL, e ele não foi escolhido por mim.** Duas razões, e as duas estão
 * escritas: o dono decidiu que *"o Papel é o produto e o Orgânico é a opção"*, e o
 * `PASSO` acima já usa exatamente esta forma — os temas escuros, que estavam prontos,
 * viraram a referência que o claro tinha perdido. Aqui a pele que o dono vê todo dia é
 * a referência que a outra tinha perdido. Nenhum número novo entra na casa: as cores do
 * Orgânico e das duas paletas-base foram derivadas de `mistura(ink, paper, α)` com o
 * menor α que alcança o Papel, então cada pele fica com a régua na SUA tinta.
 *
 * **E a referência não pode apodrecer.** Uma guarda cujo piso sai do próprio arquivo
 * que ela mede é a guarda que compara duas coisas escritas pela mesma mão — este
 * projeto já pagou por uma. Então a primeira metade não é relativa: nenhum separador
 * cai abaixo da diferença que o olho distingue, o Papel incluído.
 *
 * **O que este teste NÃO afirma:** que a régua cumpre a WCAG. A regra de contraste
 * não-textual (1.4.11) pede 3:1, e uma régua de página a 3:1 lê como borda — que é
 * outra pele, não esta. O que se mede aqui é se a linha existe para o olho, não se ela
 * identifica um controle.
 */
const VISIVEL = 1.2;

/** Os dois separadores, do mais fino ao mais forte. */
const REGUAS = ['line', 'lineStrong'] as const;

test('no skin ships a separator the eye cannot find', () => {
  const medidas = paletas();
  const papel = medidas.find((p) => p.nome === 'papelClaro');
  assert.ok(papel, 'sem o papelClaro não há referência — esta guarda mediria contra nada');

  const invisiveis: string[] = [];
  for (const { nome, cores } of medidas) {
    for (const regua of REGUAS) {
      const razao = contraste(cores[regua], cores.paper);
      if (razao < VISIVEL) invisiveis.push(`${nome}.${regua}: ${razao.toFixed(2)}:1`);
    }
  }
  assert.deepEqual(
    invisiveis,
    [],
    `estes separadores são a mesma cor do papel deles:\n  ${invisiveis.join('\n  ')}\n` +
      `Abaixo de ${VISIVEL}:1 duas áreas planas são uma cor só — a linha existe no código ` +
      'e não na tela. Esta metade é absoluta de propósito: sem ela, baixar a referência ' +
      'faria a metade de baixo passar por comparar duas coisas escritas pela mesma mão.',
  );
});

test('every skin separates at least as well as the product skin does', () => {
  const medidas = paletas();
  const papel = medidas.find((p) => p.nome === 'papelClaro');
  assert.ok(papel, 'sem o papelClaro não há referência');

  const piso = contraste(papel.cores.line, papel.cores.paper);
  assert.ok(piso >= VISIVEL, `a própria referência sumiu: ${piso.toFixed(2)}:1`);

  const fracas: string[] = [];
  for (const { nome, cores } of medidas) {
    const fina = contraste(cores.line, cores.paper);
    const forte = contraste(cores.lineStrong, cores.paper);
    // Tolerância de um milésimo: a referência se compara consigo mesma, e ponto
    // flutuante não devolve exatamente o mesmo número por dois caminhos.
    if (fina < piso * 0.999) fracas.push(`${nome}.line: ${fina.toFixed(2)}:1 contra ${piso.toFixed(2)}:1 do Papel`);
    if (forte / fina < PASSO) fracas.push(`${nome}: forte/fina = ${(forte / fina).toFixed(2)}, abaixo de ${PASSO}`);
  }

  assert.deepEqual(
    fracas,
    [],
    `estes separadores ficam atrás do Papel, que é a pele do produto:\n  ${fracas.join('\n  ')}\n` +
      'A saída é a mesma que consertou o Orgânico: `mistura(ink, paper, α)` com o menor α ' +
      'que alcança o piso — assim a régua fica na tinta da própria pele em vez de num ' +
      'cinza colado de outra.',
  );
});

test('the separator ruler tells a visible line from a remembered one', () => {
  // Os dois casos com as cores de verdade, e o falso é o que estava no arquivo até 9 de
  // setembro — não um exemplo escrito para reprovar.
  assert.ok(contraste('#DDE9DF', '#E4EFE7') < VISIVEL, 'a linha antiga do Orgânico é invisível');
  assert.ok(contraste('#B1BDB5', '#E4EFE7') >= VISIVEL, 'e a derivada da tinta aparece');
  // E o passo entre as duas réguas distingue hierarquia de "uma é maior que a outra".
  assert.ok(
    contraste('#C6D8CA', '#E4EFE7') / contraste('#DDE9DF', '#E4EFE7') < PASSO,
    'as duas réguas antigas do Orgânico eram a mesma linha com dois nomes',
  );
});

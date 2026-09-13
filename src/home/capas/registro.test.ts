import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * A pele é ponto de extensão, e este arquivo é o que impede que ela deixe de ser.
 *
 * Ordem do dono, 6 de setembro: *"qq tema futuro ou o q vc chama de skin tem q
 * poder ser aplicado sem problemas"*. Isso não se garante com cuidado — se
 * garante com o registro sendo o ÚNICO lugar que sabe qual pele está no ar.
 *
 * O defeito que ela nomeia já aconteceu: o Orgânico era o Papel com dois
 * ternários `skin === 'papel' ?` no meio da capa, e a foto que chegou ao dono
 * era a mesma tela duas vezes. Cada ternário novo é uma tela a mais que a
 * terceira pele vai ter que caçar uma a uma.
 */

function arquivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? arquivos(`${dir}/${e.name}`)
      : /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts')
        ? [`${dir}/${e.name}`]
        : [],
  );
}

test('nada decide pelo NOME da pele — nem a capa, nem o que ela usa', () => {
  // `src/home` é a capa; `src/components` é o vocabulário que toda tela usa. Nos
  // dois, a pergunta certa é o TRAÇO ("esta pele separa assunto por régua ou por
  // superfície?"), nunca o nome. Enquanto era o nome, uma terceira pele nascia
  // caindo no ramo `else` de oito componentes sem ninguém decidir isso.
  //
  // Fora ficam `capas/` — onde o nome é a chave do registro, que é o lugar em
  // que ele MORA — e `theme/`, que é quem monta os traços.
  const olhados = [...arquivos('src/home'), ...arquivos('src/components')].filter(
    (f) => !f.includes('/capas/'),
  );
  assert.ok(olhados.length > 20, 'a busca precisa achar arquivo, senão ela passa por não olhar');

  const culpados = olhados.filter((f) => {
    const fonte = readFileSync(f, 'utf8');
    // Só código: a linha citada dentro de um comentário é a explicação do
    // guarda, não a volta do defeito.
    return fonte
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .some((l) => /\bskin\s*[=!]==/.test(l));
  });
  assert.deepEqual(
    culpados,
    [],
    `estes arquivos decidem pelo nome da pele em vez de perguntar o traço: ${culpados.join(', ')}`,
  );
});

test('toda pele do catálogo tem roupa, e nenhuma usa a da irmã', async () => {
  const { skins } = await import('../../theme/tokens');

  // O registro se lê do FONTE, não por import: `vestimenta.ts` puxa a `Folha`,
  // que puxa o React Native, que esta suíte não carrega. É a mesma escolha dos
  // outros guardas deste repositório — quem verifica forma lê o arquivo.
  const fonte = readFileSync('src/home/capas/vestimenta.ts', 'utf8');
  const bloco = fonte.slice(fonte.indexOf('export const VESTIMENTAS'));
  const corpo = bloco.slice(bloco.indexOf('{') + 1, bloco.indexOf('};'));
  const entradas = [...corpo.matchAll(/^\s*(\w+):\s*(\w+),/gm)].map((m) => [m[1], m[2]]);

  assert.deepEqual(
    entradas.map(([pele]) => pele).sort(),
    Object.keys(skins).sort(),
    'toda pele de `skins` precisa de uma entrada em VESTIMENTAS',
  );

  // Duas peles apontando para a MESMA roupa é o defeito de origem com outro
  // nome: o Orgânico abrindo igual ao Papel. O tipo não vê isso.
  const roupas = entradas.map(([, roupa]) => roupa);
  assert.equal(new Set(roupas).size, roupas.length, `duas peles com a mesma roupa: ${roupas}`);
});

/**
 * O casco de uma peça vem da PELE, e nenhum componente compartilhado desenha o seu.
 *
 * **Este guarda nasceu de uma foto do dono, em 7 de setembro.** Ele circulou a quina
 * de um cartão dos Ajustes no Orgânico e disse o nome certo: *"tem elemento aí do
 * tema legado q está atrapalhando tudo"*. Estava: a capa ganhou o casco da pele
 * (`Bloco`) e as outras vinte telas continuaram com o cartão de antes de existir
 * `Tracos` — retângulo arredondado com uma borda ESQUERDA grossa. No aparelho, a
 * borda grossa da esquerda tem de encontrar a borda fina de cima ao longo de vinte
 * e oito unidades de curva, e o que aparece é uma cunha torta na quina.
 *
 * É a segunda vez no mesmo dia que a capa foi consertada e o resto ficou para trás
 * — a primeira foram as dezoito cenas de cabeçalho. Padrão que aparece duas vezes é
 * dívida, não coincidência, e por isso vira guarda em vez de conselho.
 *
 * A régua vale porque distingue: `Bloco` é a única coisa autorizada a pintar
 * superfície, e ele mora em `capas/`. Um componente compartilhado que volte a pintar
 * a sua reprova aqui.
 */
test('só a roupa da pele pinta superfície — componente compartilhado não desenha casco', () => {
  const olhados = arquivos('src/components');
  assert.ok(olhados.length > 20, 'a busca precisa achar arquivo, senão ela passa por não olhar');

  const culpados = olhados.filter((f) => cunha(semComentarios(readFileSync(f, 'utf8'))));
  assert.deepEqual(
    culpados,
    [],
    `estes desenham canto redondo com borda de um lado só — a cunha da quina: ${culpados.join(', ')}`,
  );
});

function semComentarios(fonte: string): string {
  return fonte
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

/**
 * O par que causa a cunha, procurado DENTRO do mesmo objeto de estilo.
 *
 * A primeira versão desta régua procurava os dois no arquivo inteiro e acusou o
 * próprio `Card` já consertado: o crachá redondo usa `radius.lg` num objeto, e a
 * régua reta usa `borderLeftWidth` noutro, a oitenta linhas de distância. Dois
 * estilos diferentes, nenhuma cunha. **Régua que erra é pior que régua que não
 * existe**, e esta errou no primeiro uso — o teste do caso falso é que pegou.
 *
 * Cada um sozinho é legítimo: pastilha tem canto, régua do Papel tem borda de um
 * lado só. O que não pode conviver é canto redondo com borda de um lado.
 */
function cunha(codigo: string): boolean {
  for (const bloco of objetos(codigo)) {
    if (/borderRadius:\s*radius\.(lg|xl)/.test(bloco) && /borderLeftWidth:\s*(?!0\b)[^,\n]/.test(bloco)) {
      return true;
    }
  }
  return false;
}

/**
 * Cada literal de OBJETO do código — e não todo par de chaves.
 *
 * A segunda versão da régua ainda acusava o `Card` consertado, e por um motivo
 * bobo: o corpo de uma função também é `{ … }`, então o arquivo inteiro entrava
 * como um "objeto" só e os dois sinais voltavam a se encontrar dentro dele. Bloco
 * de código se distingue de literal por ter verbo — `const`, `return`, `function`,
 * uma seta.
 */
function objetos(codigo: string): string[] {
  const achados: string[] = [];
  const pilha: number[] = [];
  for (let i = 0; i < codigo.length; i++) {
    if (codigo[i] === '{') pilha.push(i);
    else if (codigo[i] === '}' && pilha.length > 0) {
      const abre = pilha.pop() as number;
      const bloco = codigo.slice(abre, i + 1);
      if (!/\b(const|let|return|function)\b|=>/.test(bloco)) achados.push(bloco);
    }
  }
  return achados;
}

test('a régua reprova o caso errado — e aprova o certo, que é onde ela já errou', () => {
  // O que o `Card` tinha escrito, palavra por palavra, antes do conserto.
  const defeito = `{
    backgroundColor: toneColor ? tint(toneColor, wash) : color.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    borderLeftWidth: toneColor ? RAIL_WIDTH : StyleSheet.hairlineWidth,
  }`;
  assert.equal(cunha(defeito), true, 'tem de pegar o código que causou o defeito');

  // E o caso que fez a primeira versão desta régua acusar o inocente: os dois
  // sinais no mesmo ARQUIVO, em objetos diferentes.
  const separados = `
    const cracha = { borderRadius: radius.lg };
    const regua = { borderRadius: 0, borderLeftWidth: RAIL_WIDTH };
  `;
  assert.equal(cunha(separados), false, 'objetos diferentes não formam cunha nenhuma');
});

/**
 * A tinta de um rótulo sobre cor é MEDIDA, nunca declarada — e a régua é `onAccent`.
 *
 * `color.onAccent` é a tinta escolhida para o ACENTO DA ÁREA. Quem pinta um botão com
 * outra cor — a marca, o vermelho de apagar — e declara `onAccent` por cima acerta por
 * acaso: a foto do Papel escuro já mostrou o resultado, "Procurar cidade" em tinta
 * escura sobre marrom médio, ilegível de luva no corredor da câmara.
 *
 * O `Button` faz certo há tempo: mede com `tintaSobre` entre o branco e o quase-preto.
 * O que este guarda pega são as CÓPIAS dele — e havia três, todas declarando. Copiar a
 * regra em vez de usar a peça é o defeito; a assinatura dele é esta linha.
 *
 * A única leitura legítima de `onAccent` é como CANDIDATA de `tintaSobre`, que é o que
 * `app/who.tsx` faz. Por isso a régua olha a linha inteira e não a palavra.
 */
test('ninguém declara a tinta sobre cor — ela se mede', () => {
  const olhados = [...arquivos('src/components'), ...arquivos('src/home'), ...arquivos('app')];
  assert.ok(olhados.length > 40, 'a busca precisa achar arquivo, senão ela passa por não olhar');

  const culpados = olhados.filter((f) =>
    semComentarios(readFileSync(f, 'utf8')).split('\n').some(declara),
  );
  assert.deepEqual(
    culpados,
    [],
    `estes declaram a tinta em vez de medi-la — use o \`Button\` ou \`tintaSobre\`: ${culpados.join(', ')}`,
  );
});

/** A linha usa `onAccent` como cor pronta em vez de candidata de `tintaSobre`. */
function declara(linha: string): boolean {
  return /\bcolor\.onAccent\b/.test(linha) && !/tintaSobre\s*\(/.test(linha);
}

test('a régua separa a cópia do uso legítimo', () => {
  // O que o `WhatsNew` tinha escrito, palavra por palavra, antes do conserto.
  assert.equal(
    declara("          <Text style={[type.body, { color: color.onAccent, fontWeight: '600' }]}>"),
    true,
    'tem de pegar a tinta declarada',
  );
  // E o que `app/who.tsx` faz, que é o uso certo: candidata de uma medida.
  assert.equal(
    declara('{ color: ativo ? tintaSobre(palette.mint, color.onAccent, color.ink) : color.ink },'),
    false,
    'candidata de `tintaSobre` não é declaração',
  );
});

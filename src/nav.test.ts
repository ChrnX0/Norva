import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * **Voltar não pode significar sair do aplicativo.**
 *
 * As duas portas que este produto promete são LIGAÇÕES PROFUNDAS: o QR do engradado
 * lido na doca e o aviso de validade tocado na notificação. As duas chegam numa tela
 * com a pilha vazia atrás, e ali `router.back()` não volta — fecha o aplicativo.
 * Medido no aparelho em 10 de setembro: partida fria em `norva://losses`, um toque no
 * voltar, `mCurrentFocus` no launcher.
 *
 * `src/nav.ts` pergunta antes (`canGoBack`) e cai na capa quando não há para onde.
 * Esta guarda existe porque a correção é **por chamada**: dez das doze saídas
 * chamavam `back()` cru, e a décima quinta que alguém escrever amanhã chamaria também
 * — `router.back()` é o que a documentação do expo-router ensina, e está certo em
 * qualquer aplicativo cuja única entrada seja a capa.
 *
 * **E a âncora de rota fica de fora por medida, não por gosto.**
 * `unstable_settings = { anchor: '(tabs)' }` é o conserto de uma linha que a
 * documentação oferece para exatamente este defeito, e ele conserta o aparelho e
 * QUEBRA a web: com a âncora, a tela aberta por ligação profunda é montada como o
 * segundo cartão da pilha e fica deslocada uma largura inteira (janela de 412 px,
 * elemento em x = 607), sem nunca deslizar para o lugar — quem abre um link vê a capa.
 * Provado com uma variável só: a checagem `an invoice warns before it is committed`
 * estoura o clique em 30 s com a âncora e passa sem ela.
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
 * O código sem os comentários.
 *
 * Sem isto a guarda acusaria `app/who.tsx`, cujo docblock **explica** o defeito
 * citando `router.back()` — a frase que diz por que a regra existe seria lida como
 * quebra dela.
 */
function semComentario(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * Uma saída crua: a tela decidindo voltar sozinha.
 *
 * As quatro formas estão aqui porque a promessa desta guarda é *"nenhuma tela volta por
 * conta própria"*, e uma régua que só enxerga `back()` deixa `goBack()` — o nome do React
 * Navigation, que funciona igual por baixo do expo-router — entrar amanhã sem uma palavra.
 * Buraco admitido em comentário é buraco: ou a promessa encolhe, ou ele fecha.
 */
const SAIDA_CRUA =
  /(?:^|[^.\w])(?:router|navigation|nav)\s*\.\s*(?:back|goBack|dismiss|dismissAll|dismissTo)\s*\(/;

function saiSozinha(caminho: string): boolean {
  return SAIDA_CRUA.test(semComentario(readFileSync(caminho, 'utf8')));
}

test('nenhuma tela volta por conta própria — todas passam pelo voltar()', () => {
  const cruas = telas('app').filter(saiSozinha).sort();
  assert.deepEqual(
    cruas,
    [],
    'quem entra por ligação profunda tem a pilha vazia atrás: use voltar() de @/nav, ' +
      'que pergunta canGoBack antes e cai na capa em vez de fechar o aplicativo',
  );
});

test('a âncora de rota continua fora, e a medida está no docblock acima', () => {
  const raiz = readFileSync('app/_layout.tsx', 'utf8');
  assert.equal(
    /unstable_settings/.test(raiz),
    false,
    'a âncora conserta o aparelho e quebra a web (elemento em x = 607 numa janela de ' +
      '412 px); quem volta a precisar dela mede a web antes',
  );
});

test('a régua vê a chamada e ignora a prosa que a explica', () => {
  // Verdadeiro e falso contra arquivos de verdade: a tela que CITA o defeito no
  // docblock não pode aparecer, e a que chama de fato tem de aparecer.
  assert.equal(saiSozinha('app/who.tsx'), false, 'aqui `router.back()` é prosa de docblock');
  assert.equal(SAIDA_CRUA.test('const fechar = () => router.back();'), true);
  assert.equal(SAIDA_CRUA.test('navigation.back()'), true);
  assert.equal(SAIDA_CRUA.test('navigation.goBack()'), true, 'o nome do React Navigation');
  assert.equal(SAIDA_CRUA.test('router.dismissAll()'), true);
  // E o que a régua não pode confundir com uma saída crua. `canGoBack` é a PERGUNTA que
  // o voltar() faz — se ela casasse, a guarda acusaria o próprio conserto.
  assert.equal(SAIDA_CRUA.test('if (router.canGoBack()) voltar();'), false);
  assert.equal(SAIDA_CRUA.test('const anterior = fila.back();'), false);
  assert.equal(semComentario('/** router.back() */ voltar();').includes('back('), false);
});

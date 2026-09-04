import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A mesma língua visual em todas as telas.
 *
 * O dono abriu o aplicativo depois de a capa ser redesenhada e disse o que
 * viu: *"os temas antigo e os novos estão se sobrepondo"*. Não era bug de tema
 * — era que **uma tela tinha sido redesenhada e vinte não**. A capa com crachá
 * de ícone, faixa de cor por assunto, cena desenhada e entrada animada; o
 * almoxarifado, a produção, o transporte e os relatórios com a cara anterior,
 * que é parágrafo cinza dentro de retângulo cinza. Navegar entre as duas é o
 * que parece dois temas convivendo.
 *
 * A ordem que veio junto vale para tudo o que este arquivo protege: **destrói-se
 * o layout antigo para pôr o novo por cima**, nunca se acrescenta um caminho
 * novo ao lado do velho. Foi assim que o Papel ganhou um ramo dentro da cena do
 * Orgânico em vez de substituí-la, e o resultado foi um gradiente do tema errado
 * aparecendo no tema certo.
 *
 * Três regras, e as três são mecânicas de propósito — gosto não se testa, mas
 * "esta tela não tem desenho nenhum" se conta.
 */

/** O que conta como desenho: as duas famílias e as cenas. */
const DESENHO = /from '@\/components\/(Glyph|icons|Sky|Landscape|FactoryScene)'/;

/** A entrada animada, que é o que separa uma tela viva de uma folha impressa. */
const ANIMACAO = /\bReveal\b/;

/**
 * Telas que não desenham nada por si porque delegam a tela inteira.
 *
 * Registro, não exceção silenciosa: cada linha diz para quem delega, e o teste
 * confere que o destino existe e desenha.
 */
const DELEGAM: Record<string, string> = {
  'app/(tabs)/index.tsx': 'src/home/Mosaic.tsx',
};

/**
 * O que ainda não foi convertido — e esta lista só encolhe.
 *
 * Ela existe para o trabalho ser visível e finito em vez de virar "um dia a
 * gente arruma": enquanto tiver uma linha, o aplicativo tem duas caras. Tirar
 * uma tela daqui sem convertê-la quebra o teste na linha seguinte, porque a
 * conversão é medida no arquivo, não declarada aqui.
 */
const FALTAM = new Set<string>([
  'app/(tabs)/more.tsx',
  'app/(tabs)/production.tsx',
  'app/(tabs)/transport.tsx',
  'app/assistant.tsx',
  'app/catalog.tsx',
  'app/inputs/[id].tsx',
  'app/inputs/new.tsx',
  'app/orders/index.tsx',
  'app/orders/new.tsx',
  'app/production/new.tsx',
  'app/products/index.tsx',
  'app/products/new.tsx',
  'app/purchase.tsx',
  'app/settings.tsx',
  'app/transfer.tsx',
]);

/**
 * Cor crua na tela, que é o jeito mais rápido de rachar a identidade.
 *
 * Uma tela que escreve `#2F6B4F` na mão fica certa hoje e errada no dia em que
 * a paleta muda, em silêncio e só num lugar. Toda cor sai de `useTheme()`.
 */
const HEX = /#[0-9a-fA-F]{6}\b/g;

/** Onde a cor crua é a resposta certa, com o motivo escrito. */
const TINTA_PROPRIA: Record<string, string> = {
  'app/lots/[id].tsx':
    'a etiqueta é papel branco com tinta preta em qualquer tema, porque é o que sai da impressora — o tema da tela não muda a cor da tinta.',
};

function codigo(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function telasEm(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) out.push(...telasEm(caminho));
    else if (/\.tsx$/.test(entrada) && !/\.test\.tsx$/.test(entrada)) out.push(caminho);
  }
  return out;
}

/** Toda tela do aplicativo, menos os arranjos de rota, que não desenham nada. */
const TELAS = telasEm('app').filter((c) => !c.endsWith('_layout.tsx'));

test('every screen draws something - no screen is a wall of paragraphs', () => {
  for (const caminho of TELAS) {
    if (FALTAM.has(caminho)) continue;

    const destino = DELEGAM[caminho];
    const fonte = readFileSync(destino ?? caminho, 'utf8');
    assert.match(
      fonte,
      DESENHO,
      `${caminho} não mostra desenho nenhum${destino ? ` (nem ${destino}, para quem delega)` : ''}. ` +
        'A capa tem crachá de ícone por assunto; uma tela sem nenhum volta a ser lista de parágrafos, ' +
        'que é exatamente o que o dono recusou.',
    );
  }
});

test('every screen comes in animated, like the cover does', () => {
  for (const caminho of TELAS) {
    if (FALTAM.has(caminho)) continue;

    const fonte = readFileSync(DELEGAM[caminho] ?? caminho, 'utf8');
    assert.match(
      fonte,
      ANIMACAO,
      `${caminho} aparece de uma vez. A capa entra em cascata (Reveal), e uma tela que não entra ` +
        'parece de outro aplicativo no toque seguinte.',
    );
  }
});

test('no screen invents a colour', () => {
  for (const caminho of TELAS) {
    const cru = codigo(readFileSync(caminho, 'utf8')).match(HEX) ?? [];
    if (cru.length === 0) continue;

    const motivo = TINTA_PROPRIA[caminho];
    assert.ok(
      motivo,
      `${caminho} escreve cor na mão (${[...new Set(cru)].join(', ')}). Cor sai de useTheme(); ` +
        'se esta tela for a exceção, escreva o motivo em src/language.test.ts.',
    );
    assert.ok(motivo.length > 40, `${caminho}: o motivo tem que ser um motivo`);
  }
});

test('the pending list only shrinks, and never outlives the screens', () => {
  for (const caminho of FALTAM) {
    assert.ok(
      TELAS.includes(caminho),
      `${caminho} está na lista de telas por converter e não existe mais — tire a linha.`,
    );
  }

  // Quando a última sair, este arquivo passa a valer para o aplicativo inteiro,
  // e é aí que a asserção de baixo vira a que interessa.
  const convertidas = TELAS.length - FALTAM.size;
  assert.ok(convertidas > 0, 'pelo menos a capa está convertida');
});

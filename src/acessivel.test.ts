import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Todo alvo de toque se anuncia — para o leitor de tela, e para quem está de luva.
 *
 * **Esta guarda nasceu verde, e é de propósito.** Ela não conserta nada: tranca
 * uma coisa que hoje está certa e que se perde sem ninguém perceber, porque um
 * `Pressable` mudo funciona perfeitamente para quem enxerga. O defeito só aparece
 * na mão de quem não vê — e essa pessoa não abre chamado, ela desiste do
 * aplicativo.
 *
 * O dono levantou o assunto em 6 de setembro, falando de voz: *"até para quem eh
 * cego, imagina..."*. Medindo antes de responder, o app já estava pronto — o
 * vocabulário mora nos componentes compartilhados, que é o lugar certo. O que
 * faltava era ninguém poder desfazer isso em silêncio.
 *
 * **E ela existe porque meu primeiro detector mentiu.** Uma busca por
 * `<Pressable[^>]*>` acusou 34 alvos sem rótulo, e os 34 eram falsos: o `=>` de
 * `onPress={() => …}` fecha a busca antes dos props. Quase reportei uma dívida de
 * acessibilidade que não existe. Por isso a leitura aqui conta CHAVES em vez de
 * procurar o primeiro `>` — e por isso o teste negativo abaixo usa exatamente uma
 * função de seta.
 */

function propsDaTag(fonte: string, inicio: number): string {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i += 1) {
    const c = fonte[i];
    if (c === '{') profundidade += 1;
    else if (c === '}') profundidade -= 1;
    else if (c === '>' && profundidade === 0) return fonte.slice(inicio, i);
  }
  return fonte.slice(inicio, inicio + 2000);
}

const ALVOS = ['<Pressable', '<TouchableOpacity'] as const;

export function alvosMudos(arquivo: string, fonte: string): string[] {
  const mudos: string[] = [];
  for (const tag of ALVOS) {
    let i = fonte.indexOf(tag);
    while (i >= 0) {
      const props = propsDaTag(fonte, i);
      // Rótulo OU papel: um `accessibilityRole="button"` num alvo cujo filho é
      // texto já se anuncia inteiro. Exigir os dois faria a guarda cobrar
      // repetição, e regra que cobra repetição é regra que alguém desliga.
      if (!props.includes('accessibilityLabel') && !props.includes('accessibilityRole')) {
        mudos.push(`${arquivo}:${fonte.slice(0, i).split('\n').length}  ${tag}>`);
      }
      i = fonte.indexOf(tag, i + 1);
    }
  }
  return mudos;
}

function telas(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) out.push(...telas(caminho));
    else if (caminho.endsWith('.tsx')) out.push(caminho);
  }
  return out;
}

test('every touch target announces itself', () => {
  const mudos = [...telas('app'), ...telas('src')].flatMap((f) =>
    alvosMudos(f, readFileSync(f, 'utf8')),
  );

  assert.deepEqual(
    mudos,
    [],
    `estes alvos de toque não dizem nada a quem não vê a tela:\n  ${mudos.join('\n  ')}\n` +
      'Um `accessibilityLabel` quando o alvo não tem texto dentro, ou um ' +
      '`accessibilityRole` quando tem. Quem depende do leitor de tela não abre ' +
      'chamado sobre isso — desiste do aplicativo.',
  );
});

test('and the reading survives the arrow function that broke the first detector', () => {
  const comSeta = `
    <Pressable
      onPress={() => void mover(widget, 'up')}
      disabled={i === 0}
      accessibilityRole="button"
      accessibilityLabel={\`\${t.up}: \${t.widgets[widget]}\`}
    >
      <IconChevron size={20} />
    </Pressable>`;
  assert.deepEqual(alvosMudos('exemplo.tsx', comSeta), [], 'o `=>` não pode fechar a leitura dos props');
});

test('and it does catch a genuinely silent target', () => {
  const mudo = `
    <Pressable onPress={() => fechar()} style={{ flex: 1 }}>
      <IconChevron size={20} />
    </Pressable>`;
  assert.deepEqual(alvosMudos('exemplo.tsx', mudo), ['exemplo.tsx:2  <Pressable>']);
});

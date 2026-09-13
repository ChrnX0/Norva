import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A guard for the bug that cost an evening: `Alert` does nothing on the web.
 *
 * Every confirmation in this app went through `Alert.alert`, so in a browser
 * the app asked questions nobody saw and waited for answers that never came -
 * saving an input, recording an invoice and erasing everything all silently did
 * nothing, and no test noticed because the code was correct on the platform the
 * tests do not run on.
 *
 * There is no way to unit test a platform's dialog. What can be tested is that
 * the app never reaches for it again, which is the actual rule: confirmations
 * belong to `useConfirm`, which works everywhere and says what is about to
 * happen in words.
 */

const SCREENS = join(process.cwd(), 'app');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : [];
  });
}

test('no screen uses the platform Alert, which is a no-op on the web', () => {
  const offenders = walk(SCREENS).filter((path) => {
    const source = readFileSync(path, 'utf8');
    // The import is what matters: `Alert` reaching a screen at all is the bug.
    return /import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/.test(source);
  });

  assert.deepEqual(
    offenders.map((p) => p.replace(process.cwd() + '/', '')),
    [],
    'use useConfirm() from @/components/Confirm instead - Alert never appears in a browser',
  );
});

test('every screen that writes something asks before it does', () => {
  const writers = walk(SCREENS).filter((path) => {
    const source = readFileSync(path, 'utf8');
    return /\b(saveItem|saveProduct|saveRecipeVersion|recordPurchase|eraseArea|restoreStarterData)\s*\(/.test(
      source,
    );
  });

  assert.ok(writers.length >= 5, 'the writing screens should be findable');

  for (const path of writers) {
    const source = readFileSync(path, 'utf8');
    assert.match(
      source,
      /useConfirm\(\)/,
      `${path.replace(process.cwd() + '/', '')} writes without asking anybody first`,
    );
  }
});

/**
 * `destructive` obriga a segunda folha — a regra do dono, virada guarda.
 *
 * *"Toda ação destrutiva requer uma confirmação, toda ação irreversível deve
 * requerer duas confirmações."* Decisão do dono, 7 de setembro.
 *
 * O eixo, e ele é a parte difícil: num razão append-only **"irreversível" é o
 * caso normal**, não o raro — toda produção, perda e contagem fica para sempre e
 * o banco recusa apagá-la. Mas é CORRIGÍVEL pelo estorno. Aplicar a regra ao pé
 * da letra poria o operador de luva confirmando duas vezes por engradado, e isso
 * é o "alerta inventado" do `CLAUDE.md`: treina o dedo a passar batido, e a folha
 * que importa passa junto.
 *
 * Então o gatilho da segunda folha não é *irreversível*, é **irrecuperável** —
 * não há volta nenhuma, nem por correção. E o campo que já significa isso é o
 * `destructive`, que o próprio docblock define como *"reservado para as ações que
 * não podem ser desfeitas"*.
 *
 * Uma auditoria de 7 de setembro mediu 82 atos por três lentes: dos seis lugares
 * que passavam `destructive`, **quatro tinham volta** — três estornos e tirar um
 * insumo de circulação. A peça que marca "isto é grave" estava marcando o
 * mecanismo de recuperação.
 *
 * A guarda fecha os dois lados: quem marca `destructive` declara a segunda, e a
 * segunda tem de dizer coisa diferente da primeira.
 */
test('o que se marca como sem volta pergunta duas vezes, e a segunda diz outra coisa', () => {
  /**
   * Cada `confirm({...})` inteiro, contando chaves.
   *
   * A primeira versão era uma expressão regular preguiçosa até `\n  })`, e ela
   * cortava a chamada no primeiro objeto ANINHADO: em `app/backup.tsx` a
   * mensagem é um `fill(words.confirmBody, { … })`, cujo fecho casava antes de o
   * `destructive` aparecer. A guarda achou uma chamada onde há duas e quase
   * passou verde afirmando o contrário do que mede.
   *
   * Contar chave é feio e é certo. String e comentário ficam de fora da conta
   * porque `{` dentro de texto não abre nada.
   */
  const chamadas = (fonte: string): string[] => {
    const achadas: string[] = [];
    const limpa = fonte.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
    for (const inicio of [...limpa.matchAll(/confirm\(\{/g)].map((m) => m.index ?? 0)) {
      let nivel = 0;
      for (let i = inicio + 'confirm('.length; i < limpa.length; i++) {
        const c = limpa[i];
        if (c === '{') nivel += 1;
        else if (c === '}') {
          nivel -= 1;
          if (nivel === 0) {
            achadas.push(limpa.slice(inicio, i + 1));
            break;
          }
        }
      }
    }
    return achadas;
  };

  const telas = (dir: string, into: string[] = []): string[] => {
    for (const entrada of readdirSync(dir)) {
      if (entrada.startsWith('.')) continue;
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) telas(caminho, into);
      else if (/\.tsx$/.test(entrada)) into.push(caminho);
    }
    return into;
  };

  const semSegunda: string[] = [];
  const iguais: string[] = [];
  let comDestructive = 0;

  for (const arquivo of telas('app')) {
    const fonte = readFileSync(arquivo, 'utf8');
    for (const chamada of chamadas(fonte)) {
      // Comentário fala de `destructive` o tempo todo; só código conta.
      const codigo = chamada.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (!/\bdestructive:\s*true\b/.test(codigo)) continue;
      comDestructive += 1;
      if (!/\bsegunda:\s*\{/.test(codigo)) {
        semSegunda.push(arquivo);
        continue;
      }
      // A segunda não pode repetir a primeira: título e mensagem têm de vir de
      // chaves diferentes das de cima.
      const primeiroTitulo = codigo.match(/^\s*title:\s*(.+?),?$/m)?.[1];
      const segundaTitulo = codigo.match(/segunda:\s*\{[\s\S]*?title:\s*(.+?),/)?.[1];
      if (primeiroTitulo && segundaTitulo && primeiroTitulo === segundaTitulo) iguais.push(arquivo);
    }
  }

  assert.ok(comDestructive >= 2, `a leitura achou ${comDestructive} chamadas sem volta — a comparação seria de graça`);

  assert.deepEqual(
    semSegunda,
    [],
    `estas telas marcam um ato como SEM VOLTA e perguntam uma vez só:\n  ${semSegunda.join('\n  ')}\n` +
      'Declare `segunda`, e faça a segunda folha dizer o que se PERDE, com os números — ' +
      'a primeira já diz o que vai acontecer.',
  );
  assert.deepEqual(
    iguais,
    [],
    `estas telas fazem a segunda folha repetir a primeira:\n  ${iguais.join('\n  ')}\n` +
      'Duas perguntas iguais são uma com fricção, e fricção repetida treina a pessoa a passar batido.',
  );
});

test('a régua da segunda folha é régua: pega quem marca sem volta e não pergunta duas vezes', () => {
  // O caso verdadeiro e o falso, escritos à mão, para o número acima não sair de fé.
  const semSegunda = `await confirm({\n  title: t.a,\n  message: t.b,\n  destructive: true,\n})`;
  const comSegunda = `await confirm({\n  title: t.a,\n  message: t.b,\n  destructive: true,\n  segunda: { title: t.c, message: t.d },\n})`;
  const semNada = `await confirm({\n  title: t.a,\n  message: t.b,\n})`;

  const marcado = (s: string) => /\bdestructive:\s*true\b/.test(s);
  const temSegunda = (s: string) => /\bsegunda:\s*\{/.test(s);

  assert.ok(marcado(semSegunda) && !temSegunda(semSegunda), 'o caso que a guarda tem de pegar');
  assert.ok(marcado(comSegunda) && temSegunda(comSegunda), 'e o que ela tem de deixar passar');
  assert.ok(!marcado(semNada), 'e um ato comum não é marcado');
});

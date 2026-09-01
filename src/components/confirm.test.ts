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

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

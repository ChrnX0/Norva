import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { rotaDoAviso } from './rota';

/**
 * Provada nos dois sentidos, e o sentido FALSO aqui é o que o sistema operacional
 * entrega de verdade: dado de outra versão do aplicativo, dado truncado, dado nenhum.
 */
test('o toque no aviso abre a tela do assunto', () => {
  assert.equal(rotaDoAviso({ kind: 'insumo', subjectId: 'i1' }), '/inputs/i1');
  assert.equal(rotaDoAviso({ kind: 'volume', subjectId: 'p1' }), '/inputs/p1');
  assert.equal(rotaDoAviso({ kind: 'validade', subjectId: 'l1' }), '/lots/l1');

  // Pedido e ambiente abrem LISTA: a decisão é sobre a fila, não sobre um item.
  assert.equal(rotaDoAviso({ kind: 'pedido', subjectId: 'p1' }), '/orders');
  assert.equal(rotaDoAviso({ kind: 'ambiente', subjectId: 'c1' }), '/places');

  // Lote vencido abre a PERDA, que é a ação que sobrou para ele.
  assert.equal(rotaDoAviso({ kind: 'validade', subjectId: 'l1', venceu: true }), '/losses');
});

test('dado estranho não navega, porque navegar errado é pior que abrir na capa', () => {
  assert.equal(rotaDoAviso(undefined), null, 'aviso sem dado nenhum');
  assert.equal(rotaDoAviso(null), null);
  assert.equal(rotaDoAviso('insumo'), null, 'texto no lugar do objeto');
  assert.equal(rotaDoAviso({}), null, 'objeto vazio');
  assert.equal(rotaDoAviso({ kind: 'inventado', subjectId: 'x' }), null, 'tipo que não existe');
  assert.equal(rotaDoAviso({ kind: 'insumo' }), null, 'sem assunto não há ficha');
  assert.equal(rotaDoAviso({ kind: 'insumo', subjectId: '' }), null, 'assunto vazio é sem assunto');
  assert.equal(rotaDoAviso({ kind: 'insumo', subjectId: 7 }), null, 'assunto que não é texto');

  // E o que NÃO some com dado incompleto: as listas não usam o id.
  assert.equal(rotaDoAviso({ kind: 'pedido' }), '/orders');

  // `venceu` só vale ligado, e só para validade — um campo estranho não muda o destino.
  assert.equal(rotaDoAviso({ kind: 'validade', subjectId: 'l1', venceu: 'sim' }), '/lots/l1');
  assert.equal(rotaDoAviso({ kind: 'insumo', subjectId: 'i1', venceu: true }), '/inputs/i1');
});

/**
 * **As rotas existem — a régua não confere o aplicativo pela memória de quem escreveu.**
 *
 * Esta é a metade que uma tabela de destinos não garante: `/lots/[id]` pode ser renomeada
 * amanhã, e o texto `'/lots/'` continuaria compilando. O dossiê deste projeto tem uma
 * afirmação por tela justamente porque nomear arquivo em texto é a forma mais comum de
 * apontar para o que não existe mais.
 */
test('toda tela que o aviso abre existe em app/', () => {
  const rotas = [
    rotaDoAviso({ kind: 'insumo', subjectId: 'x' }),
    rotaDoAviso({ kind: 'volume', subjectId: 'x' }),
    rotaDoAviso({ kind: 'validade', subjectId: 'x' }),
    rotaDoAviso({ kind: 'validade', subjectId: 'x', venceu: true }),
    rotaDoAviso({ kind: 'pedido', subjectId: 'x' }),
    rotaDoAviso({ kind: 'ambiente', subjectId: 'x' }),
  ];

  const telas = new Set<string>();
  const andar = (dir: string, prefixo: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho, `${prefixo}/${nome}`);
      else if (nome.endsWith('.tsx') && nome !== '_layout.tsx') {
        telas.add(nome === 'index.tsx' ? prefixo || '/' : `${prefixo}/${nome.slice(0, -4)}`);
      }
    }
  };
  andar('app', '');

  const faltando = rotas.filter((r) => {
    if (r === null) return true;
    // `/inputs/i1` casa com o arquivo `[id]`, que é como o expo-router nomeia parâmetro.
    const generica = r.replace(/\/[^/]+$/, '/[id]');
    return !telas.has(r) && !telas.has(generica);
  });
  assert.deepEqual(
    faltando,
    [],
    'o aviso aponta para uma tela que não existe — o toque abriria a tela de rota não encontrada',
  );

  // A régua não pode passar por não achar nada: ela tem de ter lido as telas.
  assert.ok(telas.size > 20, `só ${telas.size} telas lidas — a comparação seria de graça`);
  assert.ok(!telas.has('/inventada'), 'a régua não acha tela que não existe');
});

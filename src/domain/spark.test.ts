import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sparkArea, sparkPath, sparkPoints } from './spark';

test('the line stays inside the box, ends included', () => {
  const pontos = sparkPoints([10, 90, 30, 70], 100, 40);

  assert.equal(pontos.length, 4);
  assert.equal(pontos[0].x, 0, 'o mais antigo começa na borda esquerda');
  assert.equal(pontos[3].x, 100, 'e o mais novo termina na direita');
  for (const p of pontos) {
    assert.ok(p.y >= 2 && p.y <= 38, `y=${p.y} escapou da caixa`);
  }

  // O maior valor fica no TOPO: y cresce para baixo em SVG, e trocar isso
  // desenharia a semana de cabeça para baixo com o cartão inteiro parecendo
  // certo.
  const maior = pontos[1];
  const menor = pontos[0];
  assert.ok(maior.y < menor.y, 'o pico desenha acima do vale');
});

test('a flat week draws in the middle, not on the floor', () => {
  // Uma fábrica que faz 400 todo dia tem uma linha reta no meio. Grudada
  // embaixo, o desenho contaria uma semana de fracasso que não aconteceu - e é
  // o caso que a divisão por zero produz se ninguém olhar.
  const pontos = sparkPoints([400, 400, 400], 90, 30);
  assert.deepEqual(
    pontos.map((p) => p.y),
    [15, 15, 15],
  );
  assert.ok(pontos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('one point and none at all do not produce NaN in the path', () => {
  // Um `d` com NaN apaga o desenho inteiro sem erro nenhum no console: o cartão
  // fica vazio e ninguém sabe por quê. É o caso do primeiro dia da fábrica.
  const um = sparkPoints([42], 100, 40);
  assert.equal(um.length, 1);
  assert.ok(!sparkPath(um).includes('NaN'));
  assert.equal(sparkPath([]), '');
  assert.equal(sparkArea(um, 40), '', 'sem dois pontos não existe área para preencher');

  const caminho = sparkPath(sparkPoints([1, 2, 3, 4, 5], 100, 40));
  assert.ok(!caminho.includes('NaN') && !caminho.includes('Infinity'));
});

test('the curve passes through every point, and invents none', () => {
  const valores = [5, 80, 20, 60, 10];
  const pontos = sparkPoints(valores, 120, 40);
  const d = sparkPath(pontos);

  // Cada ponto da série aparece como destino de um segmento: é o que separa
  // Catmull-Rom de uma Bézier solta, que passa PERTO dos pontos. Perto, aqui, é
  // a tela mostrando um dia que o banco não tem.
  for (const p of pontos.slice(1)) {
    assert.ok(
      d.includes(`${Math.round(p.x * 100) / 100} ${Math.round(p.y * 100) / 100}`),
      `o ponto (${p.x}, ${p.y}) não é destino de nenhum segmento`,
    );
  }

  // E a área fecha no chão, senão o preenchimento vaza para cima da linha.
  const area = sparkArea(pontos, 40);
  assert.ok(area.endsWith('Z'), 'a área é um caminho fechado');
  assert.ok(area.includes(' L 120 40 '), 'desce até o chão na ponta direita');
});

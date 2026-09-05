import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

/**
 * A prova do guarda que me torna imune a esperar.
 *
 * Ela existe porque a diretriz da casa é explícita: *"toda vez que um erro aqui
 * vira um padrão que um script pegaria, ele vira guard no repositório, **com
 * teste positivo e negativo**"*. Um guarda sem prova negativa é pior que nenhum —
 * ele reprova o trabalho legítimo e a primeira reação de quem trabalha é
 * desligá-lo, e aí ele deixa de existir sem que ninguém tenha decidido isso.
 *
 * Este guarda reprovou a si mesmo duas vezes na estreia, e as duas estão aqui
 * embaixo como caso: o commit que o introduziu cita o laço dentro de um heredoc,
 * e a própria prova passa os comandos ruins como argumento entre aspas. Falar de
 * uma coisa não é fazê-la.
 */
function guarda(comando: string): number {
  const r = spawnSync('bash', ['.claude/hooks/sem-espera.sh'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: comando } }),
    encoding: 'utf8',
  });
  return r.status ?? -1;
}

test('the waiting loop that idled for an hour cannot run again', () => {
  const recusados: [string, string][] = [
    ['o laço exato, com o pgrep que casa com o próprio shell',
      'until ! pgrep -f "e2e/flow.mjs" >/dev/null; do sleep 10; done; npm run e2e'],
    ['qualquer laço com sleep dentro', 'while true; do sleep 5; echo oi; done'],
    ['espera longa em primeiro plano', 'sleep 45; tail -5 log'],
    // A mutação órfã de 3 de setembro: oito horas em ppid 1, fora de toda árvore.
    ['nohup em segundo plano', 'nohup npm run e2e > log 2>&1 &'],
  ];
  for (const [porque, comando] of recusados) {
    assert.equal(guarda(comando), 2, `devia recusar (${porque}): ${comando}`);
  }
});

test('the guard lets the work through, including talking about what it forbids', () => {
  const passam: [string, string][] = [
    ['a suíte', 'npm test'],
    ['a ferramenta de fotos', 'npm run shot -- --tudo'],
    ['parar pelo PID anotado, que é a regra da casa', 'kill 16905'],
    ['um commit que CITA o laço num heredoc',
      "git commit -F - <<'FIM'\nlaço: until ! pgrep -f \"x\"; do sleep 10; done\nFIM\ngit push"],
    ['uma prova que passa o laço como argumento entre aspas',
      'testar \'until ! pgrep -f "x"; do sleep 10; done\' laco'],
    ['uma mensagem que por acaso tem a palavra sleep', 'git commit -m "sleep on it"'],
  ];
  for (const [porque, comando] of passam) {
    assert.equal(guarda(comando), 0, `devia passar (${porque}): ${comando}`);
  }
});

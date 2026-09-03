#!/usr/bin/env node
/**
 * A suíte do navegador em quatro frentes, com um export só.
 *
 * A espera era o gargalo do dia: `expo export` custa uns dois minutos e as
 * trinta checagens em série custavam outros cinco. O export é indivisível — é um
 * empacotamento —, mas as checagens não: cada uma abre contexto novo do
 * navegador, com armazenamento separado, então fatiar não muda o que nenhuma
 * prova.
 *
 * O export acontece AQUI, uma vez, imediatamente antes das fatias, e as fatias
 * reusam esse `dist`. Essa distinção é o que separa isto do defeito que a
 * própria `flow.mjs` documenta: reusar `dist` porque ele existia fazia a suíte
 * testar o pacote de ontem e passar verde para uma tela que não tinha a mudança —
 * a pior falha que um teste pode ter, porque é idêntica a sucesso. Aqui o pacote
 * é sempre o desta execução; o que se evita é empacotar quatro vezes o mesmo
 * código.
 *
 * Cada fatia sobe o seu próprio servidor numa porta própria, porque o servidor é
 * do processo. Uma fatia vermelha derruba a execução inteira: a suíte é um
 * veredito só, e "três de quatro fatias passaram" não é um veredito.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpus } from 'node:os';

const FATIAS = Math.max(1, Math.min(cpus().length, 4));
const PORTA_BASE = Number(process.env.E2E_PORT ?? 4300);

console.log('› exportando a versão web, uma vez');
const build = spawnSync('npx', ['expo', 'export', '--platform', 'web'], { stdio: 'inherit' });
if (build.status !== 0) {
  console.error('\nO export falhou. Sem pacote não há suíte.');
  process.exit(build.status ?? 1);
}

console.log(`\n› rodando as checagens em ${FATIAS} fatias\n`);

const resultados = await Promise.all(
  Array.from({ length: FATIAS }, (_, n) =>
    new Promise((resolve) => {
      const filho = spawn('node', ['e2e/flow.mjs', '--shard', `${n + 1}/${FATIAS}`], {
        env: { ...process.env, E2E_REUSE_BUILD: '1', E2E_PORT: String(PORTA_BASE + n) },
        encoding: 'utf8',
      });
      let saida = '';
      filho.stdout.on('data', (d) => (saida += d));
      filho.stderr.on('data', (d) => (saida += d));
      filho.on('close', (code) => resolve({ n, code, saida }));
    }),
  ),
);

// A saída sai na ordem das fatias, não na de quem terminou: relatório fora de
// ordem não se compara com o de ontem.
let falhou = 0;
let passaram = 0;
let total = 0;
for (const { saida, code } of resultados) {
  for (const linha of saida.split('\n')) {
    if (linha.startsWith('  ok') || linha.startsWith('  FAIL') || linha.startsWith('       ')) {
      console.log(linha);
    }
    const conta = linha.match(/^(\d+)\/(\d+) passaram/);
    if (conta) {
      passaram += Number(conta[1]);
      total += Number(conta[2]);
    }
  }
  if (code !== 0) falhou += 1;
}

console.log(`\n${passaram}/${total} passaram, em ${FATIAS} fatias`);
if (falhou > 0) {
  console.error(`${falhou} fatia(s) terminaram vermelhas.`);
  process.exit(1);
}

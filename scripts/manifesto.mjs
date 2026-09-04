import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Quando o pacote precisa ser exportado com o cache limpo.
 *
 * **A cicatriz.** A tela de Ajustes escreve a versão do aplicativo no cabeçalho,
 * lendo `Constants.expoConfig.version`. Numa revisão de rotina ela apareceu
 * dizendo `0.2.0` — cinco versões atrás do `app.json`, que dizia `0.7.0`. O
 * `expo config` resolvia `0.7.0` corretamente; quem estava velho era o PACOTE.
 *
 * O manifesto inteiro é embutido no `expo-constants` na hora de transformar o
 * módulo, e o cache do Metro tem como chave o conteúdo do arquivo transformado —
 * que não muda quando o `app.json` muda. Então o pacote sai fresco com o
 * manifesto velho, em silêncio, e continua assim para sempre.
 *
 * O custo disso não é a versão errada num canto: é que as duas ferramentas de
 * olhar deste repositório — `npm run shot` e o `e2e` — liam esse pacote. É a
 * mesma família do `dist` reusado "porque ele existia", que já fez a suíte
 * passar verde para uma tela que não tinha a mudança; um nível abaixo, e mais
 * difícil de ver, porque aqui a exportação É da execução.
 *
 * **Por que não limpar sempre.** A espera do portão já foi medida e encolhida de
 * propósito, e a exportação é a parte cara: limpar o cache em toda execução
 * devolveria o minuto que custou trabalho para ganhar. E não é preciso — o
 * manifesto só envelhece quando o `app.json` muda, então a marca é ele.
 */
export function precisaLimpar(raiz = process.cwd()) {
  const config = join(raiz, 'app.json');
  if (!existsSync(config)) return false;

  const marca = join(raiz, '.expo', 'manifesto.sha');
  const atual = createHash('sha256').update(readFileSync(config)).digest('hex');
  const guardado = existsSync(marca) ? readFileSync(marca, 'utf8').trim() : null;
  return guardado !== atual;
}

/** Grava a marca DEPOIS de uma exportação bem-sucedida, nunca antes. */
export function marcarExportado(raiz = process.cwd()) {
  const config = join(raiz, 'app.json');
  if (!existsSync(config)) return;

  const marca = join(raiz, '.expo', 'manifesto.sha');
  mkdirSync(dirname(marca), { recursive: true });
  writeFileSync(marca, createHash('sha256').update(readFileSync(config)).digest('hex'), 'utf8');
}

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * O pacote pode ser reusado quando o CÓDIGO é o mesmo — e só então.
 *
 * A cicatriz do reúso está escrita acima e continua valendo: reusar `dist`
 * **porque ele existia** já fez uma suíte passar verde para uma tela que não tinha
 * a mudança. Mas "porque existia" e "porque é o mesmo código" são coisas
 * diferentes, e a diferença é uma soma de verificação.
 *
 * Isto existe porque olhar ficou caro. Cada `npm run shot` exporta o aplicativo
 * inteiro (perto de um minuto e meio), e refazer um desenho pede dez olhadas: a
 * ferramenta de olhar cobrava quinze minutos de espera para quinze segundos de
 * conserto, e ferramenta cara é ferramenta que não se usa — que é como a capa foi
 * publicada com um degradê cor de lama.
 *
 * A soma cobre tudo o que entra no pacote: as telas, o código, os desenhos, o
 * manifesto e as dependências declaradas. Qualquer um deles diferente, exporta.
 */
export function fonteDoPacote(raiz = process.cwd()) {
  const hash = createHash('sha256');
  const visitar = (dir) => {
    if (!existsSync(dir)) return;
    for (const entrada of readdirSync(dir).sort()) {
      // O que o Metro não olha, esta soma também não: pastas geradas e o próprio
      // pacote entrariam na conta e a soma nunca fecharia.
      if (entrada === 'node_modules' || entrada.startsWith('.')) continue;
      const caminho = join(dir, entrada);
      const info = statSync(caminho);
      if (info.isDirectory()) visitar(caminho);
      else hash.update(caminho).update(readFileSync(caminho));
    }
  };
  for (const pasta of ['app', 'src', 'assets']) visitar(join(raiz, pasta));
  for (const arquivo of ['app.json', 'package.json', 'babel.config.js', 'metro.config.js']) {
    const caminho = join(raiz, arquivo);
    if (existsSync(caminho)) hash.update(arquivo).update(readFileSync(caminho));
  }
  return hash.digest('hex');
}

/** Verdadeiro quando o `dist` que está no disco é deste código. */
export function pacoteServe(raiz = process.cwd()) {
  const marca = join(raiz, '.expo', 'fonte.sha');
  if (!existsSync(join(raiz, 'dist', 'index.html')) || !existsSync(marca)) return false;
  return readFileSync(marca, 'utf8').trim() === fonteDoPacote(raiz);
}

/** Grava a soma DEPOIS de uma exportação bem-sucedida, nunca antes. */
export function marcarPacote(raiz = process.cwd()) {
  const marca = join(raiz, '.expo', 'fonte.sha');
  mkdirSync(dirname(marca), { recursive: true });
  writeFileSync(marca, fonteDoPacote(raiz));
}

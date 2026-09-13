/**
 * Monta `docs/DOSSIE.md` a partir das seções de `docs/dossie/`.
 *
 * O dossiê existe porque este repositório ia ser apagado e o que se perde num
 * apagamento não é o código — é a razão de cada decisão, que aqui morava em
 * docblock, em nome de migração e em `docs/insights.md`.
 *
 * As seções são a fonte e ficam versionadas uma por arquivo; o arquivo único é
 * derivado e NÃO entra no git, por dois motivos concretos: ele passa de 3 MB, e o
 * GitHub não renderiza markdown desse tamanho — mostra o texto cru ou trunca. As
 * seções soltas, de 50 a 200 KB cada, abrem no navegador normalmente. Quem quer o
 * arquivo único quer para dar `grep` ou para entregar a outra ferramenta, e para
 * isso ele se monta em meio segundo com este script.
 *
 * Ordem: `00-` é a capa e vem antes do sumário; `01-` a `35-` são as seções;
 * `90-` para cima são os apêndices verbatim.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const DIR = 'docs/dossie';
const SAIDA = 'docs/DOSSIE.md';

const arquivos = readdirSync(DIR)
  .filter((f) => /^\d\d-.+\.md$/.test(f))
  .sort();

const capa = arquivos.find((f) => f.startsWith('00-'));
if (!capa) throw new Error(`${DIR} não tem a capa 00-*.md`);
const corpo = arquivos.filter((f) => f !== capa);

/** A âncora que o GitHub gera para um título: minúsculas, sem acento, hífens. */
function ancora(titulo) {
  return titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

const secoes = corpo.map((f) => {
  const src = readFileSync(`${DIR}/${f}`, 'utf8');
  const m = src.match(/^##\s+(.+)$/m);
  if (!m) throw new Error(`${f} não começa com um título de nível 2`);
  // Cerca de código desbalanceada engole o resto do documento inteiro — e já
  // engoliu, quando um apêndice de markdown foi envolvido em ``` tendo ``` dentro.
  const cercas = (src.match(/^```/gm) ?? []).length;
  if (cercas % 2 !== 0) throw new Error(`${f} tem ${cercas} cercas de código: ímpar`);
  return { f, titulo: m[1].trim(), src };
});

const partes = [readFileSync(`${DIR}/${capa}`, 'utf8').trimEnd(), '', '## Sumário', ''];
for (const s of secoes) partes.push(`- [${s.titulo}](#${ancora(s.titulo)})`);
partes.push('', '---', '');
for (const s of secoes) partes.push(s.src.trimEnd(), '', '---', '');

const doc = partes.join('\n');
writeFileSync(SAIDA, doc);

const kb = (Buffer.byteLength(doc) / 1024).toFixed(0);
console.log(`${SAIDA} — ${doc.split('\n').length} linhas, ${kb} KB, ${secoes.length + 1} seções`);

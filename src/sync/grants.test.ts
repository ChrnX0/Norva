import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { APENAS_INSERE, sendableTables } from './serialize';

/**
 * Toda tabela que o aparelho sabe enviar tem permissão no papel do aplicativo.
 *
 * **A cicatriz é de 11 de setembro e é a terceira vez que ela cobra.** O `CLAUDE.md`
 * descreve o defeito desde 7 de setembro — *"a falta do `grant` para o papel do
 * aplicativo — sem ele a fila inteira é recusada por permissão"* — e ele voltou inteiro
 * com `product_categories`: a `0057` criou a tabela, o serializador declarou que sabe
 * enviá-la, e a lista de `grant` do `verify-migrations.sh` é escrita À MÃO e não ganhou o
 * nome. O `db:verify` respondeu `permission denied for table product_categories` e
 * derrubou a fila INTEIRA — não a tabela nova, a fila, porque o motor para no primeiro
 * buraco.
 *
 * O que torna isto um guard e não uma lista a mais: os dois lados vêm de **mãos
 * diferentes**. O que se espera é derivado de `serialize.ts` (TypeScript, quem decide o
 * que atravessa); o que existe é lido do script de shell (quem prepara o servidor). Uma
 * guarda que comparasse duas listas escritas no mesmo lugar não guardaria nada — regra
 * que este repositório já pagou para aprender.
 *
 * E ele cobra as DUAS direções, porque o privilégio errado a mais também é defeito:
 * tabela append-only que recebe `update` contradiz a fundação do livro-razão, e foi o
 * segundo achado desta guarda — `readings` tinha `update` aberto por um reenvio que o
 * aparelho não manda mais.
 */

/**
 * O `update` em tabela append-only que EXISTE de propósito, e por quê.
 *
 * Cada linha é uma decisão, não um esquecimento — mesmo desenho do `SO_DO_APARELHO` em
 * `columns.test.ts`, e pela mesma razão: a diferença entre "está aqui por engano" e "está
 * aqui porque a prova precisa" não está no nome da tabela, está numa decisão, e decisão
 * não escrita vira pergunta repetida.
 *
 * **E este registro nasceu de eu ter tirado um privilégio certo.** A guarda apontou
 * `readings` e eu li o apontamento como defeito, tirei o grant e reescrevi a checagem — e
 * o `db:verify` respondeu `permission denied for table readings`, derrubando a sonda que
 * provava a coisa mais forte. A regra do `CLAUDE.md` vale para achado de guarda igual:
 * *"antes de chamar algo de defeito, procure a decisão"*.
 */
const UPDATE_DE_PROPOSITO: Record<string, string> = {
  readings:
    'a checagem 12 do db:verify manda um "on conflict do update" para provar que a POLÍTICA ' +
    'recusa a reescrita; sem o privilégio o que reprova é "permission denied", que não diz ' +
    'nada sobre a política — prender a conta pelo privilégio é a prova mais fraca',
};

/** Só os `grant` de ESCRITA, e nunca a prosa ao lado deles. */
function permissoesDeEscrita(): Map<string, Set<string>> {
  const bruto = readFileSync(new URL('../../scripts/verify-migrations.sh', import.meta.url), 'utf8');
  // Comentário fora primeiro, e isto é o coração da leitura: o bloco de `grant` deste
  // script é mais comentário que SQL, e os comentários NOMEIAM tabelas ("a exceção é
  // movements", "como o razão e a história de preço"). Ler o arquivo cru daria por
  // permitida toda tabela citada em prosa — o detector aprovaria justamente o caso que
  // ele existe para pegar.
  const semComentario = bruto
    .split('\n')
    .map((linha) => linha.replace(/--.*$/, ''))
    .join('\n');

  const mapa = new Map<string, Set<string>>();
  for (const achado of semComentario.matchAll(/grant\s+([a-z,\s]+?)\s+on\s+([^;]*?)\s+to\s+app_user/gi)) {
    const privilegios = achado[1].split(',').map((x) => x.trim().toLowerCase());
    if (!privilegios.includes('insert') && !privilegios.includes('update')) continue;
    for (const alvo of achado[2].split(',').map((x) => x.trim().replace(/\s+/g, ' '))) {
      // `grant select on all tables in schema public` e `grant execute on function …`
      // não são permissão de tabela, e tratá-los como tal daria toda tabela por coberta.
      if (!alvo || /schema|function|all tables/i.test(alvo)) continue;
      if (!mapa.has(alvo)) mapa.set(alvo, new Set());
      for (const p of privilegios) mapa.get(alvo)!.add(p);
    }
  }
  return mapa;
}

test('toda tabela que o aparelho envia tem INSERT no papel do aplicativo', () => {
  const permissoes = permissoesDeEscrita();
  const semPermissao = sendableTables.filter((t) => !permissoes.get(t)?.has('insert'));
  assert.deepEqual(
    semPermissao,
    [],
    `estas tabelas atravessam e não têm grant de insert: ${semPermissao.join(', ')}. ` +
      'Sem ele o servidor responde "permission denied" e a fila INTEIRA para no primeiro ' +
      'buraco — não só a tabela nova. O grant mora em scripts/verify-migrations.sh.',
  );
});

test('tabela append-only NÃO recebe update, e a que se corrige recebe', () => {
  const permissoes = permissoesDeEscrita();
  const soInsere = new Set<string>(APENAS_INSERE as readonly string[]);

  // O caso que a fundação proíbe: privilégio de reescrita em série que é prova, sem uma
  // razão escrita ao lado.
  const reescreveOQueNaoSeReescreve = [...soInsere].filter(
    (t) => permissoes.get(t)?.has('update') && !UPDATE_DE_PROPOSITO[t],
  );
  assert.deepEqual(
    reescreveOQueNaoSeReescreve,
    [],
    `estas tabelas são append-only e têm grant de UPDATE sem razão escrita: ${reescreveOQueNaoSeReescreve.join(', ')}. ` +
      'O aparelho manda "on conflict do nothing" para elas, então o privilégio não serve à ' +
      'fila — ou ele existe para uma sonda provar a POLÍTICA (e aí entra em ' +
      'UPDATE_DE_PROPOSITO com o motivo), ou ele abre a porta que a fundação fecha.',
  );

  // E o registro não vira depósito: entrada que não corresponde a um grant de verdade é
  // desculpa guardada para um defeito que já foi consertado.
  const desculpaVelha = Object.keys(UPDATE_DE_PROPOSITO).filter(
    (t) => !permissoes.get(t)?.has('update'),
  );
  assert.deepEqual(
    desculpaVelha,
    [],
    `estas entradas de UPDATE_DE_PROPOSITO não têm grant de update: ${desculpaVelha.join(', ')}. ` +
      'A razão escrita perdeu o objeto — tire a entrada, senão ela libera o privilégio no ' +
      'dia em que alguém o acrescentar por engano.',
  );

  // E o outro lado, que é o que impede a guarda de ser satisfeita cortando privilégio:
  // cadastro que se corrige offline PRECISA de update, senão o reenvio é recusado.
  const semCorrecao = sendableTables.filter((t) => !soInsere.has(t) && !permissoes.get(t)?.has('update'));
  assert.deepEqual(
    semCorrecao,
    [],
    `estes cadastros se corrigem offline e não têm grant de UPDATE: ${semCorrecao.join(', ')}. ` +
      'A fila sobe com "on conflict do update" para eles; sem o privilégio, a correção ' +
      'nunca alcança o servidor.',
  );
});

test('a leitura dos grants distingue SQL de prosa — o caso falso que ela quase comprou', () => {
  // A régua descartável deste projeto tem uma regra escrita: nenhum detector reporta
  // número antes de passar num caso verdadeiro e num falso. Aqui o caso falso é o que
  // pegaria a primeira versão — o bloco de `grant` cita tabelas dentro de comentários, e
  // um `grep` pelo nome aprovaria a tabela que ninguém permitiu.
  const permissoes = permissoesDeEscrita();

  // VERDADEIRO: uma que está mesmo num grant de escrita.
  assert.ok(permissoes.get('products')?.has('insert'), 'products é permitida de verdade');

  // FALSO: `erase_requests` aparece em comentário dizendo "como o razão e a história de
  // preço" — as duas vizinhas citadas ali não ganham privilégio por serem citadas.
  assert.equal(permissoes.get('o razão')?.has('insert'), undefined, 'prosa não é grant');
  assert.equal(
    permissoes.get('erase_requests')?.has('insert'),
    true,
    'erase_requests tem insert de verdade',
  );
  assert.equal(
    permissoes.get('erase_requests')?.has('update'),
    false,
    'e NÃO tem update — se a leitura não separasse os dois privilégios, a guarda de cima passaria de graça',
  );
});

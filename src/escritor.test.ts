import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Toda coluna que o servidor LÊ para decidir tem alguém que a ESCREVE.
 *
 * **Esta guarda nasceu de três achados do mesmo formato num dia só, e o terceiro
 * é o que a justifica.** `companies.orders_need_approval` é lida por um gatilho
 * que decide se um pedido nasce `pending` ou `open` — e ninguém nunca a escrevia.
 * A aprovação existia inteira no aparelho: a bandeira no `meta`, o pedido
 * nascendo pendente por causa dela, a decisão indo para a fila. No dia em que a
 * sincronia subisse, o servidor reescreveria para `open` na inserção e a
 * aprovação viraria decoração — **sem erro, sem registro, sem teste vermelho**. A
 * empresa teria ligado um interruptor que não liga nada.
 *
 * **É a doença do portão P1 um nível abaixo, e é pior por dois motivos.** No
 * código, uma função exportada sem chamador acaba incomodando alguém — o
 * compilador, o revisor, esta suíte. Num esquema, ninguém reclama nunca. E uma
 * coluna com `default` nasce com um valor plausível (`false`, `'personal'`), então
 * o sistema não parece quebrado: **parece configurado**.
 *
 * O que conta como escritor é estreito de propósito: uma escrita SQL explícita
 * nas migrações, ou a travessia nomeando a coluna. Ler o nome dela em qualquer
 * lugar do aplicativo não vale — o app fala `ordersNeedApproval` em camelo, e
 * casar nome solto acha `state`, `name` e `id` em toda parte, o que faria a
 * guarda passar verde sempre. Guarda que nunca reprova é decoração.
 */

function semComentario(sql: string): string {
  return sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');
}

type Achado = { tabela: string; coluna: string; onde: string; comDefault: boolean };

/**
 * As colunas que uma política ou um gatilho lê e ninguém escreve.
 *
 * Separada do teste, e com os dois textos como argumento, porque é assim que ela
 * ganha exemplo negativo: o caso histórico é reproduzido em SQL sintético abaixo,
 * e a guarda tem de PEGÁ-LO. Uma guarda sem exemplo negativo é uma guarda que
 * ninguém sabe se funciona — e esta em particular passou verde na primeira
 * versão, porque o gatilho lê a coluna por APELIDO (`c.orders_need_approval`) e
 * eu só procurava `new.`/`old.`.
 */
export function colunasLidasSemEscritor(sql: string, travessia: string): Achado[] {
  const limpo = semComentario(sql);

  const colunas = new Map<string, Set<string>>();
  const comDefault = new Set<string>();
  /**
   * O banco preenche esta sozinho, e isso É um escritor.
   *
   * A distinção decide a guarda inteira e ela é fina: `default gen_random_uuid()`
   * ou `default now()` **produzem** um valor — a coluna nunca fica sem resposta e
   * ninguém precisa escrevê-la. `default false` não produz nada: é o valor de
   * quando ninguém disse, e é exatamente o caso que esta guarda existe para pegar,
   * porque ele faz o sistema parecer configurado em vez de vazio.
   */
  const seEnche = new Set<string>();
  const guardar = (t: string, c: string, linha: string) => {
    if (!colunas.has(t)) colunas.set(t, new Set());
    colunas.get(t)!.add(c);
    if (/default/.test(linha)) comDefault.add(`${t}.${c}`);
    if (/default\s+[\w.]+\s*\(/.test(linha)) seEnche.add(`${t}.${c}`);
  };

  for (const m of limpo.matchAll(/create table (\w+) \(([\s\S]*?)\n\);/g)) {
    for (const linha of m[2].split('\n')) {
      const c = /^\s*([a-z_]+)\s+[a-z]/.exec(linha);
      if (c && !['constraint', 'unique', 'primary', 'check', 'foreign'].includes(c[1])) {
        guardar(m[1], c[1], linha);
      }
    }
  }
  for (const m of limpo.matchAll(/alter table (\w+)\s+add column (?:if not exists )?([a-z_]+)([^;]*)/g)) {
    guardar(m[1], m[2], m[3]);
  }

  const lidas = new Map<string, { tabela: string; coluna: string; onde: string }>();
  const marcar = (tabela: string, coluna: string, onde: string) => {
    if (colunas.get(tabela)?.has(coluna) && !lidas.has(`${tabela}.${coluna}`)) {
      lidas.set(`${tabela}.${coluna}`, { tabela, coluna, onde });
    }
  };

  for (const m of limpo.matchAll(/create policy (\w+) on (\w+)([\s\S]*?);/g)) {
    for (const c of colunas.get(m[2]) ?? []) {
      if (new RegExp(`\\b${c}\\b`).test(m[3])) marcar(m[2], c, `política ${m[1]}`);
    }
  }

  // O gatilho lê por APELIDO, e foi isso que a primeira versão desta guarda não
  // viu: `select c.orders_need_approval from companies c`. Então as tabelas que o
  // corpo toca são descobertas, e os apelidos delas junto.
  for (const m of limpo.matchAll(
    /create (?:or replace )?function ([\w.]+)\(\)\s*returns trigger[\s\S]*?as \$\$([\s\S]*?)\$\$;/g,
  )) {
    const [, nome, corpo] = m;
    const tabelas = new Set([...corpo.matchAll(/(?:from|join|update|into)\s+(\w+)/g)].map((x) => x[1]));
    for (const t of tabelas) {
      for (const c of colunas.get(t) ?? []) {
        if (new RegExp(`\\b(?:new|old)\\.${c}\\b`).test(corpo)) marcar(t, c, `gatilho ${nome}`);
      }
      for (const a of corpo.matchAll(new RegExp(`\\b${t}\\s+(?:as\\s+)?(\\w+)\\b`, 'g'))) {
        const apelido = a[1];
        if (['set', 'where', 'on', 'select', 'values'].includes(apelido)) continue;
        for (const c of colunas.get(t) ?? []) {
          if (new RegExp(`\\b${apelido}\\.${c}\\b`).test(corpo)) marcar(t, c, `gatilho ${nome}`);
        }
      }
    }
  }

  const fora: Achado[] = [];
  for (const { tabela, coluna, onde } of lidas.values()) {
    const escrita =
      seEnche.has(`${tabela}.${coluna}`) ||
      new RegExp(`insert into ${tabela}\\s*\\([^)]*\\b${coluna}\\b`, 's').test(limpo) ||
      new RegExp(`update ${tabela}\\b[^;]{0,600}?\\b${coluna}\\s*=`, 's').test(limpo) ||
      new RegExp(`\\b${coluna}\\b`).test(travessia);
    if (!escrita) {
      fora.push({ tabela, coluna, onde, comDefault: comDefault.has(`${tabela}.${coluna}`) });
    }
  }
  return fora.sort((a, b) => `${a.tabela}.${a.coluna}`.localeCompare(`${b.tabela}.${b.coluna}`));
}

const MIGRACOES = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join('supabase/migrations', f), 'utf8'))
  .join('\n');

/** O que pode escrever no servidor: a fila, e a configuração da empresa. */
const TRAVESSIA =
  readFileSync('src/sync/serialize.ts', 'utf8') + readFileSync('src/data/configuracao.ts', 'utf8');

test('every column the server reads to decide has someone who writes it', () => {
  const fora = colunasLidasSemEscritor(MIGRACOES, TRAVESSIA);
  assert.deepEqual(
    fora.map((a) => `${a.tabela}.${a.coluna} — lida pela ${a.onde}${a.comDefault ? ' (com default)' : ''}`),
    [],
    'estas colunas o servidor LÊ para decidir, e nada as escreve.\n' +
      'Com `default` é pior: a coluna nasce com um valor plausível e o sistema não parece ' +
      'quebrado, parece configurado. Traga o escritor, ou tire a leitura.',
  );
});

/**
 * O exemplo NEGATIVO — o caso histórico, em SQL sintético.
 *
 * Sem ele esta guarda é uma afirmação sobre si mesma. E ela não é teórica: a
 * primeira versão passava verde neste mesmo caso, porque o gatilho lê a coluna
 * por apelido e eu procurava só `new.`.
 */
test('the guard catches the defect it was written for', () => {
  const antes = `
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null
);
alter table companies add column orders_need_approval boolean not null default false;
create table orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  status text not null
);
create or replace function private.order_starts_where_the_company_says()
returns trigger
language plpgsql
as $$
begin
  select case when c.orders_need_approval then 'pending' else 'open' end
    into new.status
    from companies c
   where c.id = new.company_id;
  return new;
end;
$$;`;

  const achados = colunasLidasSemEscritor(antes, '');
  assert.deepEqual(
    achados.map((a) => `${a.tabela}.${a.coluna}`),
    ['companies.orders_need_approval'],
    'a guarda tem de pegar a coluna lida por gatilho e sem escritor',
  );
  assert.equal(achados[0].comDefault, true, 'e tem de dizer que ela nasce plausível');
});

test('and stays quiet once someone writes it', () => {
  const antes = `
create table companies (id uuid primary key default gen_random_uuid(), name text not null);
alter table companies add column orders_need_approval boolean not null default false;
create or replace function private.decide()
returns trigger language plpgsql as $$
begin
  select c.orders_need_approval into new.status from companies c where c.id = new.company_id;
  return new;
end;
$$;`;
  assert.deepEqual(
    colunasLidasSemEscritor(antes, "update('companies').set({ orders_need_approval: true })"),
    [],
    'com escritor na travessia, a guarda cala',
  );
});

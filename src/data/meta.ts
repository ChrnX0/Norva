import { db } from './db';

/**
 * O bloco de anotações do aparelho: chave e valor, e nada mais.
 *
 * `app_meta` já existia para a marca do exemplo semeado. O que ela ganha aqui é
 * um par de funções em vez de SQL solto em cada arquivo que precisa lembrar de
 * alguma coisa — a semente escrevia a dela na mão, e a segunda a copiaria.
 *
 * O que cabe aqui é preferência e cache: a cidade da fábrica, a última previsão
 * do tempo. O que NÃO cabe é qualquer coisa que alguém vá somar. Saldo é a soma
 * dos movimentos, e uma chave/valor é exatamente o formato em que um
 * `estoque_atual` renasceria — sem trigger, sem histórico e sem ninguém notando.
 */
export async function readMeta(key: string): Promise<string | null> {
  const conn = await db();
  const row = await conn.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = ?`,
    [key],
  );
  return row?.value ?? null;
}

export async function writeMeta(key: string, value: string): Promise<void> {
  const conn = await db();
  await conn.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

/**
 * JSON guardado, lido com desconfiança.
 *
 * O que está aqui foi escrito por uma versão anterior do app, e a versão de
 * hoje não tem como saber por qual. Então texto quebrado ou de outro formato
 * devolve nulo em vez de derrubar a tela — um cache é, por definição, algo de
 * que se pode abrir mão.
 */
export async function readJson<T>(key: string): Promise<T | null> {
  const raw = await readMeta(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await writeMeta(key, JSON.stringify(value));
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gatilhoDeData } from './gatilho';

/**
 * O aviso é AGENDADO — e por um ano ele não era.
 *
 * `NotificationTriggerInput` é uma união, e `{ channelId, date }` sem `type` casa com
 * o membro errado: o `ChannelAwareTriggerInput`, cujo docblock na própria biblioteca
 * diz *"A trigger that will cause the notification to be delivered immediately"*. O
 * `date` atravessava o typecheck porque é propriedade conhecida de OUTRO membro da
 * união, e em execução `parseTrigger` descartava o instante — o alarme das sete da
 * manhã tocava às três da tarde, no segundo em que alguém abrisse o aplicativo.
 *
 * **A régua não pergunta ao aparelho.** A forma do gatilho é aritmética sobre um
 * objeto, e o valor esperado é lido da DECLARAÇÃO da biblioteca, não escrito aqui:
 * duas coisas escritas pela mesma mão concordam por construção e não guardam nada.
 */

/** O valor que a biblioteca declara para o gatilho de data — lido do disco. */
function valorDeclarado(): string {
  const fonte = readFileSync(
    'node_modules/expo-notifications/build/Notifications.types.d.ts',
    'utf8',
  );
  const bloco = fonte.slice(fonte.indexOf('enum SchedulableTriggerInputTypes'));
  const achado = /\bDATE\s*=\s*"([^"]+)"/.exec(bloco);
  assert.ok(achado, 'a biblioteca precisa declarar SchedulableTriggerInputTypes.DATE');
  return achado[1];
}

const DATE = valorDeclarado();
const lib = { SchedulableTriggerInputTypes: { DATE } } as never;

test('o gatilho carrega o type que faz a biblioteca ler o instante', () => {
  const quando = new Date('2026-09-10T10:00:00.000Z');
  const gatilho = gatilhoDeData(lib, quando) as unknown as Record<string, unknown>;

  assert.equal(
    gatilho.type,
    DATE,
    'sem o `type` a biblioteca cai no gatilho de canal, que entrega na hora',
  );
  assert.equal(gatilho.date, quando, 'e o instante é o que foi pedido');
  assert.equal(typeof gatilho.channelId, 'string');
});

test('o predicado da biblioteca separa o gatilho de data do que entrega na hora', () => {
  // A mesma pergunta que `parseDateTrigger` faz — `'type' in t && t.type === DATE &&
  // 'date' in t` —, rodada contra o caso VERDADEIRO e contra o FALSO. Sem o par, a
  // asserção acima mediria só que um campo existe.
  const ehDeData = (t: Record<string, unknown>) =>
    'type' in t && t.type === DATE && 'date' in t;

  const quando = new Date('2026-09-10T10:00:00.000Z');
  assert.ok(
    ehDeData(gatilhoDeData(lib, quando) as unknown as Record<string, unknown>),
    'o gatilho de hoje é de data',
  );

  // O falso é a forma exata que estava no código: canal e data, sem type.
  assert.equal(
    ehDeData({ channelId: 'norva.alerts', date: quando }),
    false,
    'a forma antiga não é gatilho de data — e é por isso que o aviso saía na hora',
  );
});

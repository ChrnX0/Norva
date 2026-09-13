import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { canalDoAviso, comportamentoDoAviso, gatilhoDeData } from './gatilho';

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

/** O valor que a biblioteca dá a uma importância de canal — lido do disco. */
function importanciaDeclarada(nome: string): number {
  const fonte = readFileSync(
    'node_modules/expo-notifications/build/NotificationChannelManager.types.d.ts',
    'utf8',
  );
  const bloco = fonte.slice(fonte.indexOf('enum AndroidImportance'));
  const achado = new RegExp(`\\b${nome}\\s*=\\s*(\\d+)`).exec(bloco);
  assert.ok(achado, `a biblioteca precisa declarar AndroidImportance.${nome}`);
  return Number(achado[1]);
}

/**
 * **O canal tem de EXISTIR, e ninguém o criava.**
 *
 * `CANAL` era citado no gatilho desde o primeiro dia. No Android 8 e acima, notificação
 * de canal inexistente é descartada pelo sistema, sem erro e sem aviso: o agendamento
 * certo, na hora certa, com a frase certa, entregava a lugar nenhum.
 *
 * A importância esperada é lida da DECLARAÇÃO da biblioteca, como o gatilho acima: o
 * número 5 escrito aqui à mão concordaria com o número 5 escrito lá por coincidência de
 * ter sido copiado, e concordância por cópia não guarda nada.
 */
test('o canal nasce com nome e com a importância que não interrompe', () => {
  const DEFAULT = importanciaDeclarada('DEFAULT');
  const HIGH = importanciaDeclarada('HIGH');
  const lib = { AndroidImportance: { DEFAULT, HIGH } } as never;

  const canal = canalDoAviso(lib, 'Avisos da fábrica');
  assert.equal(canal.name, 'Avisos da fábrica', 'o nome é o que a pessoa lê nos ajustes do sistema');
  assert.equal(
    canal.importance,
    DEFAULT,
    'a pauta da manhã não é interrupção: balão na frente do trabalho por três dias e a ' +
      'pessoa desliga o canal — e canal desligado pelo usuário o aplicativo não religa',
  );
  assert.notEqual(canal.importance, HIGH, 'e não é a que põe balão na frente');
});

/**
 * **O aviso com o aplicativo ABERTO era descartado pela biblioteca.**
 *
 * Sem `setNotificationHandler` o padrão de `expo-notifications` é não mostrar nada em
 * primeiro plano: o alarme das sete não aparecia justamente para quem estava com o
 * aparelho na mão às sete.
 *
 * E a régua confere o campo que ENGANA. A própria biblioteca documenta que, no Android,
 * `shouldPlaySound: false` faz o balão não aparecer *"no matter what the priority is"* —
 * então a escolha que parece a discreta é a que reproduz o defeito por outro caminho.
 * A lista de campos obrigatórios vem do tipo declarado no disco: se a biblioteca exigir
 * um campo novo numa atualização, este teste reprova em vez de o aviso sumir calado.
 */
test('o comportamento em primeiro plano mostra o aviso, e declara tudo que a biblioteca exige', () => {
  const comportamento = comportamentoDoAviso() as unknown as Record<string, unknown>;

  assert.equal(
    comportamento.shouldPlaySound,
    true,
    'no Android, som desligado apaga o balão junto — é a biblioteca que diz isso',
  );
  assert.equal(comportamento.shouldShowBanner, true, 'o balão é o aviso aparecendo');
  assert.equal(comportamento.shouldShowList, true, 'e ele fica na bandeja para quem olha depois');
  assert.equal(comportamento.shouldSetBadge, false, 'contador que ninguém zera só sobe');

  // Os obrigatórios, lidos da declaração: campo sem `?` dentro de NotificationBehavior.
  const fonte = readFileSync(
    'node_modules/expo-notifications/build/Notifications.types.d.ts',
    'utf8',
  );
  const corpo = fonte.slice(fonte.indexOf('interface NotificationBehavior'));
  const bloco = corpo.slice(0, corpo.indexOf('\n}'));
  const obrigatorios = [...bloco.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
  assert.ok(obrigatorios.length >= 4, `só ${obrigatorios.length} campos lidos — a régua não leu o tipo`);
  assert.deepEqual(
    obrigatorios.filter((campo) => !(campo in comportamento)),
    [],
    'a biblioteca exige um campo que este comportamento não declara',
  );
});

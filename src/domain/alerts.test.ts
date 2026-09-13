import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alertsDue,
  alertsRunToday,
  DEFAULT_ALERTS,
  nextAlertAt,
  proximosAvisos,
  volumeBand,
  type AlertFacts,
  type AlertSettings,
} from './alerts';

const nada: AlertFacts = { cover: [], orders: [], volumes: [], expiring: [], ambient: [] };

test('the alert fires on the decision date, not on the problem date', () => {
  // Lei 4. Polpa que acaba em dois dias, com três dias de antecedência
  // configurados: avisa. Açúcar que dura dez dias: cala.
  //
  // É por isso que o piso é em DIAS e não em quantidade — quantidade não sabe
  // quanto tempo leva para a compra chegar.
  const avisos = alertsDue(
    {
      ...nada,
      cover: [
        { itemId: 'polpa', name: 'Polpa de morango', daysLeft: 2, leadTimeDays: null },
        { itemId: 'acucar', name: 'Açúcar', daysLeft: 10, leadTimeDays: null },
      ],
    },
    DEFAULT_ALERTS,
  );

  assert.deepEqual(
    avisos.map((a) => a.subjectId),
    ['polpa'],
  );
  assert.equal(avisos[0].amount, 2, 'o aviso carrega o número que o gerou');
});

test('an alert nobody can act on is not sent', () => {
  // Lei 7, quatro vezes: pedido já coberto, item sem faixa cadastrada, alarme
  // desligado, e nada acontecendo. Alerta inventado ensina a ignorar alerta.
  const coberto = alertsDue(
    { ...nada, orders: [{ itemId: 'p', name: 'Picolé', missing: 0, daysUntil: 1, placeId: 'centro' }] },
    DEFAULT_ALERTS,
  );
  assert.deepEqual(coberto, []);

  const semNivel = alertsDue(
    { ...nada, volumes: [{ itemId: 'p', name: 'Picolé', onHand: 3, fullLevel: null }] },
    { ...DEFAULT_ALERTS, on: { ...DEFAULT_ALERTS.on, volume: true } },
  );
  assert.deepEqual(semNivel, [], 'sem nível cheio, o app estaria inventando o que é pouco');

  const desligado = alertsDue(
    { ...nada, cover: [{ itemId: 'x', name: 'X', daysLeft: 0, leadTimeDays: null }] },
    { ...DEFAULT_ALERTS, on: { ...DEFAULT_ALERTS.on, insumo: false } },
  );
  assert.deepEqual(desligado, []);

  assert.deepEqual(alertsDue(nada, DEFAULT_ALERTS), []);
});

test('the volume bands read the same in every item, and green is quiet', () => {
  // Desenho do dono: vermelho até 25%, amarelo até 40%, verde no meio, azul
  // acima de 80% — e zerado à parte. Porcentagem do nível cheio, porque 20% de
  // polpa e 20% de palito significam a mesma coisa para quem passa o olho, e
  // dois números absolutos não.
  const faixas = DEFAULT_ALERTS.bands;

  assert.equal(volumeBand(0, 100, faixas), 'zerado');
  assert.equal(volumeBand(20, 100, faixas), 'vermelho');
  assert.equal(volumeBand(25, 100, faixas), 'vermelho', 'o limite é do vermelho');
  assert.equal(volumeBand(35, 100, faixas), 'amarelo');
  assert.equal(volumeBand(60, 100, faixas), 'verde');
  assert.equal(volumeBand(90, 100, faixas), 'azul');
  assert.equal(volumeBand(120, 100, faixas), 'azul', 'mais que cheio continua azul');

  // Sem nível cheio não existe faixa: é a diferença entre não saber e chutar.
  assert.equal(volumeBand(50, null, faixas), null);
  assert.equal(volumeBand(50, 0, faixas), null, 'nível zero não é referência');

  const ligado: AlertSettings = {
    ...DEFAULT_ALERTS,
    on: { ...DEFAULT_ALERTS.on, volume: true, insumo: false, pedido: false, validade: false },
  };

  const avisos = alertsDue(
    {
      ...nada,
      volumes: [
        { itemId: 'vazio', name: 'Vazio', onHand: 0, fullLevel: 100 },
        { itemId: 'pouco', name: 'Pouco', onHand: 10, fullLevel: 100 },
        { itemId: 'meio', name: 'No meio', onHand: 60, fullLevel: 100 },
        { itemId: 'cheio', name: 'Cheio', onHand: 95, fullLevel: 100 },
      ],
    },
    ligado,
  );

  // O verde não notifica, e o AZUL também não por padrão: almoxarifado cheio
  // depois de uma compra é estado desejado, e aviso diário sobre estado desejado
  // é o alerta que ensina a ignorar alerta. A cor continua pintando a lista.
  assert.deepEqual(avisos.map((a) => a.subjectId).sort(), ['pouco', 'vazio']);

  // E o número do aviso é a porcentagem, que é o que a frase vai dizer.
  assert.equal(avisos.find((a) => a.subjectId === 'pouco')?.amount, 10);

  // Ligado, ele avisa — é o caso da câmara que enche até parar a produção, e
  // ninguém descobre isso olhando o que falta.
  const comCheio = alertsDue(
    { ...nada, volumes: [{ itemId: 'cheio', name: 'Cheio', onHand: 95, fullLevel: 100 }] },
    { ...ligado, bands: { ...ligado.bands, notifyFull: true } },
  );
  assert.equal(comCheio[0]?.band, 'azul');
});

test('the most urgent alert comes first, because a notification holds one sentence', () => {
  const avisos = alertsDue(
    {
      ...nada,
      cover: [
        { itemId: 'folgado', name: 'Folgado', daysLeft: 3, leadTimeDays: null },
        { itemId: 'apertado', name: 'Apertado', daysLeft: 0, leadTimeDays: null },
      ],
      expiring: [{ lotId: 'l1', code: '20260903-01', name: 'Picolé de morango', daysLeft: 1 }],
    },
    DEFAULT_ALERTS,
  );

  assert.deepEqual(
    avisos.map((a) => a.subjectId),
    ['apertado', 'folgado', 'l1'],
    'insumo antes de validade, e dentro de cada um o mais apertado primeiro',
  );
});

/**
 * **Dentro do tipo, `amount` não é a mesma grandeza — e em dois tipos ele ordenava ao
 * contrário.**
 *
 * A ordenação era `urgencia[kind] || a.amount - b.amount` para os cinco. Isso é certo em
 * três (dias que faltam, dias até vencer, parcela do cheio: menor é mais apertado) e
 * invertido em dois:
 *
 *  - **pedido**: `amount` é quanto FALTA produzir. Crescente põe na frente o pedido de que
 *    falta menos — faltar 20 para a semana que vem antes de faltar 300 para ontem.
 *  - **ambiente**: `amount` é a temperatura MEDIDA. Crescente põe o freezer mais frio na
 *    frente — o de -25 antes do de -8, quando a faixa é -22 a -16 e o de -8 é o que está
 *    derretendo o estoque.
 *
 * E isto decide o que CHEGA: `src/notify/index.ts` agenda `avisos[0]` e só ele, porque
 * bandeja com sete linhas do mesmo aplicativo é bandeja que a pessoa limpa sem ler. Ordem
 * errada aqui não é ordem feia numa lista — é o aviso errado no bolso, e os outros
 * calados.
 */
test('inside one kind, the order follows what that kind measures', () => {
  const pedidos = alertsDue(
    {
      ...nada,
      orders: [
        // Falta pouco, e o dia pedido ainda está à frente (dentro da janela de dois
        // dias que o padrão avisa — cinco dias não geraria aviso nenhum, e a régua
        // da ordem nunca seria exercitada).
        { itemId: 'depois', name: 'Depois', missing: 20, daysUntil: 2, placeId: 'a' },
        // Falta muito, e era para ANTEONTEM.
        { itemId: 'atrasado', name: 'Atrasado', missing: 300, daysUntil: -2, placeId: 'b' },
        // Mesmo dia do atrasado, faltando menos: desempata por quanto falta.
        { itemId: 'atrasado-menor', name: 'Atrasado menor', missing: 40, daysUntil: -2, placeId: 'c' },
      ],
    },
    { ...DEFAULT_ALERTS, on: { ...DEFAULT_ALERTS.on, pedido: true } },
  );
  assert.deepEqual(
    pedidos.map((a) => a.subjectId),
    ['atrasado', 'atrasado-menor', 'depois'],
    'pedido ordena pelo dia pedido, do mais atrasado ao mais folgado, e desempata por quanto falta',
  );

  const camaras = alertsDue(
    {
      ...nada,
      ambient: [
        // Dois graus abaixo do piso: porta mal fechada do lado frio.
        { locationId: 'pouco', place: 'Pouco', kind: 'temperature', value: -24, unit: 'C', min: -22, max: -16, hoursOld: 1 },
        // Oito graus acima do teto: estoque derretendo.
        { locationId: 'muito', place: 'Muito', kind: 'temperature', value: -8, unit: 'C', min: -22, max: -16, hoursOld: 1 },
      ],
    },
    { ...DEFAULT_ALERTS, on: { ...DEFAULT_ALERTS.on, ambiente: true } },
  );
  assert.deepEqual(
    camaras.map((a) => a.subjectId),
    ['muito', 'pouco'],
    'ambiente ordena pela distância PARA FORA da faixa, não pela temperatura medida',
  );

  // E a faixa viaja com o aviso, porque é ela que a frase compara e é ela que ordena.
  assert.equal(camaras[0].max, -16, 'o aviso de ambiente leva o teto');
  assert.equal(camaras[0].min, -22, 'o aviso de ambiente leva o piso');
});

/**
 * **Um aviso agendado é silêncio a partir do dia seguinte.**
 *
 * O adaptador agendava UM e reagendava na próxima abertura do aplicativo. Telefone
 * deixado na fábrica na sexta à noite: aviso no sábado, e nada no domingo nem na
 * segunda. E a falha é invisível — ninguém nota a notificação que não chegou.
 */
test('several alert instants are scheduled ahead, and they respect the chosen weekdays', () => {
  // Sexta, 10h. O aviso é às 7h, todos os dias.
  const sexta = new Date('2026-09-11T13:00:00.000Z');
  const tres = proximosAvisos(DEFAULT_ALERTS, sexta, 3);

  assert.equal(tres.length, 3, 'três instantes à frente, não um');
  assert.deepEqual(
    tres.map((d) => d.getTime()),
    [...new Set(tres.map((d) => d.getTime()))],
    'instantes repetidos seriam três notificações no mesmo minuto',
  );
  for (let i = 1; i < tres.length; i += 1) {
    assert.ok(tres[i].getTime() > tres[i - 1].getTime(), 'cada um depois do anterior');
  }
  assert.ok(tres[0].getTime() > sexta.getTime(), 'nenhum no passado — agendado para trás não dispara');

  // Só terça e quinta: os três instantes caem nesses dois dias, e em nenhum outro.
  const soDoisDias = { ...DEFAULT_ALERTS, weekdays: (1 << 2) | (1 << 4) };
  const escolhidos = proximosAvisos(soDoisDias, sexta, 3);
  assert.equal(escolhidos.length, 3);
  for (const dia of escolhidos) {
    assert.ok(
      alertsRunToday(soDoisDias, dia.getDay()),
      `caiu num dia que a empresa não escolheu: ${dia.toISOString()}`,
    );
  }

  // E pedir zero devolve zero: quem chama decide quantos, e a função não inventa um.
  assert.deepEqual(proximosAvisos(DEFAULT_ALERTS, sexta, 0), []);
});

test('no chosen weekday means every day, never silence', () => {
  // A configuração vazia é o estado inicial de todo mundo. Se ela silenciasse,
  // o aplicativo emudeceria sem ninguém ter pedido - e o dono descobriria no
  // dia em que faltasse polpa.
  for (let dia = 0; dia < 7; dia += 1) {
    assert.ok(alertsRunToday(DEFAULT_ALERTS, dia), `dia ${dia} tinha que avisar`);
  }

  const soTerca = { ...DEFAULT_ALERTS, weekdays: 1 << 2 };
  assert.ok(alertsRunToday(soTerca, 2));
  assert.ok(!alertsRunToday(soTerca, 3));
  assert.ok(!alertsRunToday(soTerca, 9), 'dia que não existe não avisa');
});

test('the next alert is never in the past', () => {
  // Notificação agendada para trás não dispara, e o aviso desaparece sem
  // ninguém saber que existiu.
  const seteDaManha = { ...DEFAULT_ALERTS, minuteOfDay: 7 * 60 };

  const antes = nextAlertAt(seteDaManha, new Date('2026-09-03T04:00:00'));
  assert.ok(antes);
  assert.equal(antes.getDate(), 3, 'ainda dá hoje');
  assert.equal(antes.getHours(), 7);
  assert.equal(antes.getMinutes(), 0);

  // E a fábrica que começa às cinco e meia: o minuto existe porque ela existe.
  const cincoEMeia = nextAlertAt(
    { ...DEFAULT_ALERTS, minuteOfDay: 5 * 60 + 30 },
    new Date('2026-09-03T04:00:00'),
  );
  assert.ok(cincoEMeia);
  assert.equal(cincoEMeia.getHours(), 5);
  assert.equal(cincoEMeia.getMinutes(), 30);

  const depois = nextAlertAt(seteDaManha, new Date('2026-09-03T09:00:00'));
  assert.ok(depois);
  assert.equal(depois.getDate(), 4, 'passou da hora: amanhã');

  // Exatamente na hora conta como passada: agendar para o instante presente é
  // uma corrida que o sistema operacional ganha.
  const naHora = nextAlertAt(seteDaManha, new Date('2026-09-03T07:00:00'));
  assert.ok(naHora);
  assert.equal(naHora.getDate(), 4);

  // E com um dia só combinado, ele acha o próximo dele em vez de desistir.
  const soDomingo = { ...seteDaManha, weekdays: 1 << 0 };
  const proximo = nextAlertAt(soDomingo, new Date('2026-09-03T09:00:00')); // quinta
  assert.ok(proximo);
  assert.equal(proximo.getDay(), 0);
  assert.ok(proximo.getTime() > new Date('2026-09-03T09:00:00').getTime());
});

test('the order alert counts stores, because that is the decision it feeds', () => {
  // Pedido do dono: "faltam 300 picolés" não diz se é uma loja para ligar ou
  // quatro para reorganizar o dia. E a loja que espera três itens conta UMA vez.
  const avisos = alertsDue(
    {
      ...nada,
      orders: [
        { itemId: 'morango', name: 'Morango', missing: 100, daysUntil: 1, placeId: 'centro' },
        { itemId: 'coco', name: 'Coco', missing: 50, daysUntil: 1, placeId: 'centro' },
        { itemId: 'uva', name: 'Uva', missing: 20, daysUntil: 0, placeId: 'norte' },
        // Longe demais para hoje: não entra, e não conta loja.
        { itemId: 'limao', name: 'Limão', missing: 90, daysUntil: 9, placeId: 'sul' },
      ],
    },
    DEFAULT_ALERTS,
  );

  assert.equal(avisos.length, 3, 'três itens em falta dentro do prazo');
  assert.ok(
    avisos.every((a) => a.places === 2),
    'duas lojas esperando, não três nem quatro',
  );
});

test('the cold room comes first, and a room with no range stays quiet', () => {
  // A ordem é o custo do erro: insumo que acaba custa uma compra atrasada;
  // câmara fora de faixa custa o estoque inteiro numa noite.
  const avisos = alertsDue(
    {
      ...nada,
      cover: [{ itemId: 'polpa', name: 'Polpa', daysLeft: 0, leadTimeDays: null }],
      ambient: [
        {
          locationId: 'c1',
          place: 'Câmara 1',
          kind: 'temperature',
          value: -8,
          unit: 'C',
          min: -22,
          max: -16,
          hoursOld: 1,
        },
        // Sem faixa: o aplicativo não sabe qual é a temperatura boa da câmara de
        // outra pessoa, e -18 é o número comum de freezer, não uma verdade.
        {
          locationId: 'c2',
          place: 'Câmara 2',
          kind: 'temperature',
          value: 40,
          unit: 'C',
          min: null,
          max: null,
          hoursOld: 1,
        },
        // Dentro da faixa: calado.
        {
          locationId: 'c3',
          place: 'Câmara 3',
          kind: 'temperature',
          value: -19,
          unit: 'C',
          min: -22,
          max: -16,
          hoursOld: 1,
        },
      ],
    },
    DEFAULT_ALERTS,
  );

  assert.equal(avisos[0].kind, 'ambiente', 'a câmara vem antes do insumo');
  assert.equal(avisos[0].subject, 'Câmara 1');
  assert.equal(avisos[0].unit, 'C', 'o número vem com a unidade: 4 é bom em C e quebrado em F');
  assert.equal(avisos[0].quantity, 'temperature');
  assert.deepEqual(
    avisos.filter((a) => a.kind === 'ambiente').map((a) => a.subjectId),
    ['c1'],
    'sem faixa e dentro da faixa não avisam',
  );

  // Desligado, nem a câmara aberta avisa: quem desligou escolheu.
  const mudo = alertsDue(
    { ...nada, ambient: [{ locationId: 'c1', place: 'C1', kind: 'temperature', value: 10, unit: 'C', min: -22, max: -16, hoursOld: 1 }] },
    { ...DEFAULT_ALERTS, on: { ...DEFAULT_ALERTS.on, ambiente: false } },
  );
  assert.deepEqual(mudo, []);
});

/**
 * Uma régua só para a decisão de comprar — e este teste existe porque havia DUAS.
 *
 * Medido em 6 de setembro: a ficha do insumo dizia "compre" quando a cobertura
 * encostava no prazo do fornecedor mais a folga da empresa, e o aviso ficava
 * calado até `daysAhead.insumo`, um número fixo sem prazo nenhum dentro. Com
 * fornecedor de seis dias e folga de dois, a tela pedia para comprar a oito dias
 * de cobertura e a notificação só falava a três. **Cinco dias em que o aplicativo
 * discordava de si mesmo** — e quem lê o aviso é justamente quem não estava
 * olhando a tela.
 */
test('the alert buys on the same day the item card does', () => {
  const settings = { ...DEFAULT_ALERTS, purchaseSafetyDays: 2 };

  // Fornecedor de seis dias, folga de dois: o dia da decisão é a oito de
  // cobertura. Com a régua velha isto ficava calado.
  const avisos = alertsDue(
    {
      ...nada,
      cover: [{ itemId: 'i1', name: 'Polpa', daysLeft: 8, leadTimeDays: 6 }],
    },
    settings,
  );
  assert.deepEqual(
    avisos.map((a) => a.subject),
    ['Polpa'],
    'oito dias de cobertura com fornecedor de seis e folga de dois é o dia de comprar',
  );

  // E um dia antes disso ainda não é.
  assert.deepEqual(
    alertsDue(
      { ...nada, cover: [{ itemId: 'i1', name: 'Polpa', daysLeft: 9, leadTimeDays: 6 }] },
      settings,
    ),
    [],
    'nove dias ainda não é o dia da decisão',
  );
});

/**
 * E sem prazo anotado, o piso configurado — que é a resposta honesta de quem
 * ainda não anotou a data de nenhum pedido. O aviso é tão inteligente quanto o
 * dado permite, e nunca mais burro que a configuração.
 */
test('without an observed lead time it falls back to the configured floor', () => {
  const settings = { ...DEFAULT_ALERTS, daysAhead: { ...DEFAULT_ALERTS.daysAhead, insumo: 3 } };

  assert.deepEqual(
    alertsDue(
      { ...nada, cover: [{ itemId: 'i1', name: 'Polpa', daysLeft: 8, leadTimeDays: null }] },
      settings,
    ),
    [],
    'sem prazo, oito dias não dispara: o piso é três',
  );
  assert.equal(
    alertsDue(
      { ...nada, cover: [{ itemId: 'i1', name: 'Polpa', daysLeft: 3, leadTimeDays: null }] },
      settings,
    ).length,
    1,
    'e três dispara',
  );
});

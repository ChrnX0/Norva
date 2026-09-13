import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIEFING_WIDGETS } from '@/domain/briefing';
import { en } from '@/i18n/locales/en';
import { es } from '@/i18n/locales/es';
import { ptBR } from '@/i18n/locales/pt-BR';
import type { Alert, AlertKind } from '@/domain/alerts';
import { alertPhrase } from './phrase';

const IDIOMAS = { ptBR, en, es };

/** Um aviso de cada tipo, com o número que aquele tipo mede. */
const EXEMPLOS: Record<AlertKind, Alert> = {
  insumo: { kind: 'insumo', subjectId: 'i', subject: 'Polpa de morango', amount: 2 },
  pedido: {
    kind: 'pedido',
    subjectId: 'p',
    subject: 'Picolé de morango',
    amount: 300,
    places: 2,
  },
  volume: { kind: 'volume', subjectId: 'v', subject: 'Palito', amount: 12, band: 'vermelho' },
  validade: {
    kind: 'validade',
    subjectId: 'l',
    subject: 'Picolé de morango',
    code: '20260903-01',
    amount: 3,
  },
  ambiente: {
    kind: 'ambiente',
    subjectId: 'c',
    subject: 'Câmara 1',
    amount: -8.4,
    unit: 'C',
    quantity: 'temperature',
    min: -22,
    max: -16,
    hoursOld: 0.2,
  },
  semMedida: {
    kind: 'semMedida',
    subjectId: 'c',
    subject: 'Câmara 1',
    // O número deste aviso são as HORAS de silêncio, e o limite é a última medida.
    amount: 30,
    unit: 'C',
    quantity: 'temperature',
    lastValue: -19,
    hoursOld: 30,
  },
};

/** O outro lado da faixa: mesma câmara, congelando além do piso. */
const CONGELANDO: Alert = { ...EXEMPLOS.ambiente, amount: -27.5 };

/** O mesmo lote, três dias DEPOIS de vencer. */
const VENCIDO: Alert = { ...EXEMPLOS.validade, amount: -3 };

test('no notification ever ships a hole to the lock screen', () => {
  // `{{subject}}` na tela de bloqueio é um defeito que nenhuma outra rede pega:
  // notificação não se lê num teste de navegador, e o tipo não sabe se a chave da
  // frase tem o mesmo buraco que os valores preenchem.
  for (const [idioma, t] of Object.entries(IDIOMAS)) {
    for (const [kind, alert] of Object.entries(EXEMPLOS)) {
      const { title, body } = alertPhrase(alert, t);

      assert.doesNotMatch(title, /\{\{/, `${idioma}/${kind}: buraco no título`);
      assert.doesNotMatch(body, /\{\{/, `${idioma}/${kind}: buraco no corpo`);
      assert.ok(title.trim().length > 0, `${idioma}/${kind}: título vazio`);
      assert.ok(body.trim().length > 0, `${idioma}/${kind}: corpo vazio`);
    }
  }
});

test('each alert carries the number in the unit that alert measures', () => {
  const t = ptBR;

  // Dias para insumo e validade: "acaba em 2" sem unidade não decide nada.
  assert.match(alertPhrase(EXEMPLOS.insumo, t).body, /2 dias/);
  assert.match(alertPhrase(EXEMPLOS.validade, t).body, /3 dias/);

  // Lojas para pedido, que foi correção do dono: "faltam 300" não diz se é um
  // telefonema ou quatro.
  assert.match(alertPhrase(EXEMPLOS.pedido, t).title, /2 lojas/);
  assert.match(alertPhrase(EXEMPLOS.pedido, t).body, /300/);

  // Porcentagem para volume, e o assunto no título: a notificação é lida de
  // relance, então o que decide vem primeiro.
  assert.match(alertPhrase(EXEMPLOS.volume, t).title, /Palito em 12%/);

  // Grandeza física guarda a FRAÇÃO: meio grau de freezer é diferença real, e
  // arredondar aqui repetiria o defeito que a tela de leitura já teve.
  const camara = alertPhrase(EXEMPLOS.ambiente, t);
  assert.match(camara.title, /Câmara 1 fora da faixa/);
  assert.match(camara.body, /-8,4 °C|-8\.4 °C/);
});

/**
 * **Lei 3 na notificação: o número vem com a comparação, e com a comparação CERTA.**
 *
 * O corpo do ambiente dizia só a medida — *"-8 °C agora"* —, e na tela de bloqueio isso
 * não decide nada: quem lê não sabe se -8 é a câmara quente ou o balcão normal. O número
 * da faixa já estava nos fatos (`AlertFacts.ambient.min/max`) e morria ali.
 *
 * O limite dito é o CRUZADO, não os dois: aviso de ambiente só existe porque um dos lados
 * foi ultrapassado, e não há faixa em que o valor esteja abaixo do piso e acima do teto ao
 * mesmo tempo. Dois limites numa notificação é a conta que sobra para quem lê fazer.
 */
test('the range alert names the limit it crossed, on either side', () => {
  const t = ptBR;

  // Quente: -8,4 num freezer de -22 a -16 passou do TETO.
  const quente = alertPhrase(EXEMPLOS.ambiente, t).body;
  assert.match(quente, /teto é -16/, 'o corpo tem de dizer o teto que foi cruzado');
  assert.doesNotMatch(quente, /piso/, 'dizer o piso aqui é dizer o limite que não foi cruzado');

  // Frio: -27,5 na mesma câmara passou do PISO — e isto é avaria de outro tipo,
  // não "está tudo bem porque freezer é frio".
  const frio = alertPhrase(CONGELANDO, t).body;
  assert.match(frio, /piso é -22/, 'o corpo tem de dizer o piso que foi cruzado');
  assert.doesNotMatch(frio, /teto/, 'dizer o teto aqui é dizer o limite que não foi cruzado');

  // E o limite nunca sai VAZIO: `{{limit}}` preenchido com nada não é buraco para a
  // guarda de cima, e é exatamente o mesmo defeito para quem lê — "e o teto é ."
  for (const [idioma, dic] of Object.entries(IDIOMAS)) {
    for (const alerta of [EXEMPLOS.ambiente, CONGELANDO]) {
      const corpo = alertPhrase(alerta, dic).body;
      assert.match(corpo, /-16|-22/, `${idioma}: o corpo do ambiente ficou sem o limite`);
    }
  }
});

/**
 * **O aviso que mandava despachar picolé vencido para a loja.**
 *
 * O número saía por `Math.max(0, …)`, então `daysLeft = -3` virava zero e a frase era a
 * mesma de um lote que ainda vai vencer: *"em 0 dias — mande esse primeiro"*. Lote vencido
 * não se manda primeiro; se registra como perda. Um aviso que manda fazer a coisa errada é
 * pior que nenhum, porque ele chega com a autoridade do sistema atrás.
 *
 * E o produto entrou no lugar do código no título pela mesma razão de leitura: na tela de
 * bloqueio *"Lote 20260903-01 vence"* não diz o que é, e quem lê não abre o aplicativo para
 * descobrir. O código continua na frase — é o endereço do saco na câmara.
 */
test('an expired lot is a different fact, with a different action', () => {
  const t = ptBR;

  const vai = alertPhrase(EXEMPLOS.validade, t);
  assert.match(vai.title, /Picolé de morango vence/, 'o título diz o produto, não o código');
  assert.match(vai.body, /20260903-01/, 'o código do lote continua na frase');
  assert.match(vai.body, /3 dias/);
  assert.match(vai.body, /mande esse primeiro/);

  const passou = alertPhrase(VENCIDO, t);
  assert.match(passou.title, /venceu/, 'venceu é passado, e a frase tem de dizer isso');
  assert.match(passou.body, /3 dias/, 'três dias VENCIDO, e não "em 0 dias"');
  assert.doesNotMatch(
    passou.body,
    /mande esse primeiro/,
    'mandar lote vencido para a loja é a coisa errada, e o app a estava pedindo',
  );
  assert.match(passou.body, /registre a perda/, 'o que se faz com lote vencido é registrar');

  // Nos três idiomas, porque a frase nova é frase nova em três lugares.
  for (const [idioma, dic] of Object.entries(IDIOMAS)) {
    const { title, body } = alertPhrase(VENCIDO, dic);
    assert.doesNotMatch(title, /\{\{/, `${idioma}: buraco no título do vencido`);
    assert.doesNotMatch(body, /\{\{/, `${idioma}: buraco no corpo do vencido`);
    assert.match(body, /3/, `${idioma}: o corpo do vencido perdeu o número de dias`);
  }
});

/**
 * **A palavra "agora" estava cravada, e `hoursOld` estava nos fatos sem leitor.**
 *
 * O corpo do aviso de câmara dizia *"-8 °C agora"* — sempre. Uma leitura de ontem à noite
 * chegava como se fosse deste minuto, e numa câmara fria a diferença decide o que se faz:
 * "está quente agora" é abrir a porta e olhar o motor; "estava quente às onze da noite" é
 * olhar o que sobrou lá dentro.
 */
test('the range alert says WHEN it was measured, instead of claiming it is now', () => {
  const t = ptBR;

  // Fresca: menos de uma hora é agora, e nenhuma decisão muda por vinte minutos.
  const agora = alertPhrase(EXEMPLOS.ambiente, t).body;
  assert.match(agora, /agora/, 'leitura desta hora é agora');
  assert.doesNotMatch(agora, /Medido há/, 'e não diz há quanto tempo foi');

  // Velha: a mesma leitura, quatorze horas depois.
  const velha = alertPhrase({ ...EXEMPLOS.ambiente, hoursOld: 14 }, t).body;
  assert.match(velha, /Medido há 14 horas/, 'o corpo tem de dizer QUANDO');
  assert.doesNotMatch(
    velha,
    /Medição de agora/,
    'dizer "agora" sobre a medição de ontem à noite é o aviso mentindo com o número certo',
  );

  // Sem a informação, nenhuma das duas frases: o aviso não inventa quando foi medido.
  const semHora = alertPhrase({ ...EXEMPLOS.ambiente, hoursOld: undefined }, t).body;
  assert.doesNotMatch(semHora, /agora|Medido há/);

  // E o aviso de "parou de medir" conta as horas no próprio corpo, com a última medida —
  // que é o número pelo qual quem recebe decide a pressa.
  for (const [idioma, dic] of Object.entries(IDIOMAS)) {
    const { title, body } = alertPhrase(EXEMPLOS.semMedida, dic);
    assert.doesNotMatch(title, /\{\{/, `${idioma}: buraco no título do sensor mudo`);
    assert.doesNotMatch(body, /\{\{/, `${idioma}: buraco no corpo do sensor mudo`);
    assert.match(body, /30/, `${idioma}: as horas de silêncio saíram do corpo`);
    assert.match(body, /-19/, `${idioma}: a última medida saiu do corpo`);
  }
});

test('one alert kind cannot be added without its words in three languages', () => {
  // O `Widen<T>` obriga a CHAVE a existir nos três idiomas; ele não obriga um
  // tipo novo de alarme a ter chave nenhuma. Este caso fecha essa fresta: um
  // `AlertKind` novo sem frase reprova aqui em vez de sair silencioso na bandeja.
  const kinds = Object.keys(EXEMPLOS) as AlertKind[];
  for (const t of Object.values(IDIOMAS)) {
    for (const kind of kinds) {
      assert.ok(t.alertText[kind], `falta a frase de ${kind}`);
      assert.ok(t.alertText[kind].title, `falta o título de ${kind}`);
      // O ambiente tem DOIS corpos, um por lado da faixa, e nenhum genérico: um
      // `body` de ambiente seria texto que nenhum caso alcança, porque todo aviso
      // de ambiente cruzou um limite. Quem acrescentar um lado sem frase reprova aqui.
      const corpos =
        kind === 'ambiente'
          ? [
              t.alertText.ambiente.aboveMax,
              t.alertText.ambiente.belowMin,
              t.alertText.ambiente.justNow,
              t.alertText.ambiente.measuredAgo,
            ]
          : kind === 'validade'
            ? [t.alertText.validade.body, t.alertText.validade.expiredBody]
            : [t.alertText[kind].body];
      for (const corpo of corpos) assert.ok(corpo, `falta o corpo de ${kind}`);
    }
  }

  // E o catálogo de widgets continua nomeado nos três, que é a mesma fresta um
  // andar acima: peça nova sem nome aparece como chave crua na tela de Ajustes.
  for (const [idioma, t] of Object.entries(IDIOMAS)) {
    for (const widget of BRIEFING_WIDGETS) {
      assert.ok(
        t.app.settings.briefing.widgets[widget],
        `${idioma}: falta o nome do widget ${widget}`,
      );
    }
  }
});

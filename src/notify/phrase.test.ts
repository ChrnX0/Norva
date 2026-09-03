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
  validade: { kind: 'validade', subjectId: 'l', subject: '20260903-01', amount: 3 },
  ambiente: {
    kind: 'ambiente',
    subjectId: 'c',
    subject: 'Câmara 1',
    amount: -8.4,
    unit: 'C',
    quantity: 'temperature',
  },
};

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

test('one alert kind cannot be added without its words in three languages', () => {
  // O `Widen<T>` obriga a CHAVE a existir nos três idiomas; ele não obriga um
  // tipo novo de alarme a ter chave nenhuma. Este caso fecha essa fresta: um
  // `AlertKind` novo sem frase reprova aqui em vez de sair silencioso na bandeja.
  const kinds = Object.keys(EXEMPLOS) as AlertKind[];
  for (const t of Object.values(IDIOMAS)) {
    for (const kind of kinds) {
      assert.ok(t.alertText[kind], `falta a frase de ${kind}`);
      assert.ok(t.alertText[kind].title, `falta o título de ${kind}`);
      assert.ok(t.alertText[kind].body, `falta o corpo de ${kind}`);
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

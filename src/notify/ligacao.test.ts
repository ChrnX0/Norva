import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

/**
 * **A LIGAÇÃO do aviso — a metade que nenhum teste de unidade alcança.**
 *
 * Esta rodada achou cinco defeitos no caminho que vai do razão ao bolso, e quatro deles
 * têm a mesma forma: a peça existia, estava certa, e **ninguém a chamava**. O canal era
 * citado no gatilho e nunca criado. O `{kind, subjectId}` era gravado no aviso e nunca
 * lido. O comportamento em primeiro plano nunca foi declarado, então a biblioteca
 * descartava o aviso. O motivo de não ter agendado era devolvido e morria num `.then` de
 * corpo vazio.
 *
 * Nenhum desses quatro é alcançável por `typecheck`, por `lint` ou por teste de função:
 * as funções estavam corretas. É o P1 do `CLAUDE.md` na sua metade mais difícil — *quem
 * EXERCITA isto?* —, e aqui não há navegador nem celular que responda, porque
 * notificação não se lê num teste de navegador.
 *
 * Então a régua é de FONTE, e ela é honesta sobre o que prova: que a chamada está escrita
 * no caminho. Ela não prova que o Android entregou — isso é o aparelho do dono. O que ela
 * impede é a regressão silenciosa, que é a forma que este defeito teve por um ano.
 */

const ADAPTADOR = readFileSync('src/notify/index.ts', 'utf8');
const COMPONENTE = readFileSync('src/notify/Alerts.tsx', 'utf8');
const AJUSTES = readFileSync('app/settings.tsx', 'utf8');

test('o adaptador declara o comportamento, cria o canal e agenda vários dias', () => {
  assert.match(
    ADAPTADOR,
    /setNotificationHandler\(/,
    'sem declarar o comportamento, a biblioteca DESCARTA o aviso com o aplicativo aberto — ' +
      'o alarme das sete não aparece para quem está com o aparelho na mão às sete',
  );

  assert.match(
    ADAPTADOR,
    /setNotificationChannelAsync\(CANAL/,
    'no Android 8 e acima, aviso de canal inexistente é descartado pelo sistema sem erro: ' +
      'o agendamento certo entrega a lugar nenhum',
  );

  // A ORDEM importa, e é a única coisa aqui que um `includes` solto não pegaria: canal
  // criado depois do agendamento é canal que não existia quando o aviso foi aceito.
  assert.ok(
    ADAPTADOR.indexOf('setNotificationChannelAsync') <
      ADAPTADOR.indexOf('scheduleNotificationAsync'),
    'o canal tem de ser criado ANTES de agendar',
  );

  assert.match(
    ADAPTADOR,
    /proximosAvisos\(/,
    'um aviso agendado é silêncio a partir do dia seguinte: o telefone deixado na fábrica ' +
      'na sexta recebe o de sábado e mais nada',
  );

  assert.match(
    ADAPTADOR,
    /rotaDoAviso\(/,
    'o aviso carrega o assunto desde que foi escrito — sem ler, o toque abre a capa',
  );
  assert.match(ADAPTADOR, /getLastNotificationResponseAsync/, 'o toque do aplicativo MORTO');
  assert.match(
    ADAPTADOR,
    /addNotificationResponseReceivedListener/,
    'e o toque do aplicativo em segundo plano — atender um só deixa o defeito de pé na ' +
      'metade das vezes, como o voltar() que atendia a seta e não a tecla',
  );
});

test('o componente liga as duas pontas: o toque navega e a recusa fica guardada', () => {
  assert.match(COMPONENTE, /aoTocarNoAviso\(/, 'ninguém liga o toque à árvore de telas');
  assert.match(
    COMPONENTE,
    /guardarPorQueNaoAgendou\(/,
    'a permissão negada morria num `.then` de corpo vazio, e a pessoa via seis ' +
      'interruptores ligados de um sistema que não manda nada',
  );
});

test('os Ajustes dizem que o sistema não deixou, em vez de mostrar interruptor ligado à toa', () => {
  assert.match(
    AJUSTES,
    /porQueNaoAgendou\(/,
    'a tela precisa LER o motivo para poder dizer qualquer coisa sobre ele',
  );
  assert.match(
    AJUSTES,
    /t\.app\.settings\.alerts\.never/,
    'a frase existia no dicionário nos três idiomas e nenhuma tela a usava — chave morta ' +
      'sobre o defeito que ela nomeia',
  );
});

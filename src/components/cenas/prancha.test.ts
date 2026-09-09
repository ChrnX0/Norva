import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRANCHA_DO_CABECALHO, alturaDaCena } from './prancha';

/**
 * A cena do cabeçalho, medida — e nada a media.
 *
 * O cabeçalho vivo é o pedido do dono para TODAS as telas, e são dezenove cenas. A
 * altura dele saía de três contas espalhadas, e as três liam a largura da JANELA
 * enquanto o desenho vive dentro de uma coluna que trava em `maxWidth`. Nenhum teste
 * citava `CollapsingHeader` nem `PRANCHA_DO_CABECALHO`, e uma foto de uma largura não
 * responde "adapta?" — foi a auditoria de 9 de setembro que fez a conta.
 *
 * O que estas asserções prendem é a PROPRIEDADE, não o número: acima da coluna, a
 * altura para de crescer. É ela que o código antigo violava.
 */

const PAGINA = 600;
const PARES = 900;
const PADDING = 16;

test('acima da coluna a altura da cena para de crescer', () => {
  const naColuna = alturaDaCena({
    larguraDaTela: PAGINA,
    medidaDaColuna: PAGINA,
    padding: PADDING,
    cabecalho: 'paisagem',
  });

  for (const larguraDaTela of [PAGINA, 800, 900, 1280, 2000]) {
    assert.equal(
      alturaDaCena({ larguraDaTela, medidaDaColuna: PAGINA, padding: PADDING, cabecalho: 'paisagem' }),
      naColuna,
      `a ${larguraDaTela} dp a reserva seguiu a janela em vez da coluna`,
    );
  }

  // E abaixo dela a altura AINDA acompanha a tela, senão a guarda estaria medindo
  // "a altura é constante" em vez de "ela segue o contêiner".
  assert.ok(
    alturaDaCena({ larguraDaTela: 360, medidaDaColuna: PAGINA, padding: PADDING, cabecalho: 'paisagem' }) <
      naColuna,
    'num telefone a cena é mais baixa que na página inteira',
  );
});

test('a reserva é a altura que o desenho vai ocupar, nas cinco larguras', () => {
  // O desenho usa `aspectRatio`, então a altura dele é a largura REAL dividida pela
  // proporção da prancheta. A reserva tem de dar o mesmo número — banda vazia e
  // corte são as duas metades do mesmo erro.
  const proporcao = PRANCHA_DO_CABECALHO.largura / PRANCHA_DO_CABECALHO.altura;

  for (const larguraDaTela of [360, 393, 430, 600, 800, 900, 1280]) {
    for (const medidaDaColuna of [PAGINA, PARES]) {
      const coluna = Math.min(larguraDaTela, medidaDaColuna);

      // Tolerância porque as duas expressões são a MESMA álgebra escrita em ordens
      // diferentes — `(w/364)*72` contra `w/(364/72)` —, e ponto flutuante não é
      // associativo. Um `equal` aqui mediria a ordem das operações, não a altura.
      assert.ok(
        Math.abs(
          alturaDaCena({ larguraDaTela, medidaDaColuna, padding: PADDING, cabecalho: 'paisagem' }) -
            coluna / proporcao,
        ) < 1e-9,
        `paisagem a ${larguraDaTela}/${medidaDaColuna}`,
      );

      assert.ok(
        Math.abs(
          alturaDaCena({ larguraDaTela, medidaDaColuna, padding: PADDING, cabecalho: 'vinheta' }) -
            (coluna - PADDING * 2) / proporcao,
        ) < 1e-9,
        `vinheta a ${larguraDaTela}/${medidaDaColuna}`,
      );
    }
  }
});

test('a paisagem é mais alta que a vinheta, e por exatamente o padding que ela sangra', () => {
  // A diferença entre as duas é a única coisa que as separa, e era ela que produzia
  // o corte de 6,33 dp: a reserva descontava o padding e a paisagem o devolvia com a
  // margem negativa, então o desenho ficava sempre mais alto que a fatia que o corta.
  const proporcao = PRANCHA_DO_CABECALHO.largura / PRANCHA_DO_CABECALHO.altura;

  for (const larguraDaTela of [360, 393, 800]) {
    const paisagem = alturaDaCena({
      larguraDaTela,
      medidaDaColuna: PAGINA,
      padding: PADDING,
      cabecalho: 'paisagem',
    });
    const vinheta = alturaDaCena({
      larguraDaTela,
      medidaDaColuna: PAGINA,
      padding: PADDING,
      cabecalho: 'vinheta',
    });
    assert.ok(
      Math.abs(paisagem - vinheta - (PADDING * 2) / proporcao) < 1e-9,
      `a ${larguraDaTela} dp a diferença não é o padding`,
    );
  }
});

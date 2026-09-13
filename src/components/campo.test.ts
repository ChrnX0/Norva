import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { aceitaDoPai, campoComSugestao } from './campo';

/** As telas, para a régua de fonte lá embaixo achar quem usa o molde. */
function achar(dir: string, into: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achar(caminho, into);
    else if (nome.endsWith('.tsx')) into.push(caminho);
  }
  return into;
}

/**
 * Provada contra o caso que ela deve pegar e o caso que ela não deve — o que o
 * `CLAUDE.md` exige de todo detector antes de ele reportar qualquer coisa. E o
 * caso falso aqui não é hipótese: é o defeito que a PRIMEIRA versão desta régua
 * tinha, achado lendo o conserto antes de ele chegar ao aparelho.
 */
test('com o dedo no campo, quem manda é quem digita', () => {
  // Verdadeiro: o pai devolveu "Pi" enquanto a pessoa já digitou "Pic" — uma
  // renderização atrasado. Obedecer isso apaga a letra que ela acabou de pôr.
  assert.equal(aceitaDoPai('Pi', 'Pic', true), false);
  // E vale mesmo quando o pai transforma de propósito: enquanto o dedo está ali,
  // nada de fora entra. O que ele decidiu chega ao sair.
  assert.equal(aceitaDoPai('PIC', 'Pic', true), false);
});

test('fora do campo, quem manda é o pai — inclusive para esvaziar', () => {
  // O caso que a régua com memória engolia: formulário que se limpa ao salvar,
  // com nome curto o bastante para ainda estar na janela de memória.
  assert.equal(aceitaDoPai('', 'Loja', false), true);
  // Transformação vinda do pai entra ao sair do campo.
  assert.equal(aceitaDoPai('LOJA', 'Loja', false), true);
  // E o que já está igual não vira renderização à toa.
  assert.equal(aceitaDoPai('Loja', 'Loja', false), false);
  assert.equal(aceitaDoPai('Loja', 'Loja', true), false);
});

/**
 * A distinção que o `||` apaga, e que o navegador não consegue medir.
 *
 * A checagem de navegador de "apagar o sugerido fica apagado" passou **com o defeito
 * plantado** — `??` trocado por `||` —, porque o `input` controlado não repõe o texto
 * quando o valor calculado não muda. No aparelho repõe: é a mesma armadilha do
 * `aceitaDoPai` acima, vista do outro lado.
 *
 * Então a régua se prova aqui, onde ela é decidível: cada linha abaixo é uma das quatro
 * respostas possíveis, e a terceira é a que o `||` quebra.
 */
test('a sugestão vale para quem não digitou, e vazio é uma digitação', () => {
  // Ninguém digitou: vale o palpite, e a tela tem o que explicar.
  assert.deepEqual(campoComSugestao(undefined, 'Distribuidora Aurora'), {
    valor: 'Distribuidora Aurora',
    ehSugestao: true,
  });

  // Digitou outra coisa: manda quem digita, e a dica sai.
  assert.deepEqual(campoComSugestao('Atacado São Jorge', 'Distribuidora Aurora'), {
    valor: 'Atacado São Jorge',
    ehSugestao: false,
  });

  // **A linha que o `||` quebra.** Apagou o campo: ele fica apagado. Com `||` a sugestão
  // voltaria, e a tela passaria a brigar com quem usa — pior que campo vazio.
  assert.deepEqual(campoComSugestao('', 'Distribuidora Aurora'), {
    valor: '',
    ehSugestao: false,
  });

  // Sem nota anterior não há palpite, e o padrão não é sugestão de nada: a dica não pode
  // aparecer embaixo de um "1" que veio do código.
  assert.deepEqual(campoComSugestao(undefined, null, '1'), { valor: '1', ehSugestao: false });

  // Nome gravado vazio pela sincronia não é sugestão — sugerir "" é sugerir nada.
  assert.deepEqual(campoComSugestao(undefined, ''), { valor: '', ehSugestao: false });
});

/**
 * **O valor que a tela MOSTRA é o valor que o save GRAVA — e isto é guarda de fonte.**
 *
 * `campoComSugestao` é puro e tem as respostas dele provadas acima. O que nenhum teste de
 * unidade alcança é a tela LER o estado cru num lugar e a resposta noutro: em 13 de setembro
 * eu escrevi exatamente isso em `app/products/new.tsx` — o campo exibia
 * `perUnit || sugestao` e o `onSave` gravava `num(perUnit)`, então a tela mostrava 75 ml e o
 * produto nascia com rendimento ZERO. Um dos dois campos é `unitPackagingRate`, que vira
 * **taxa congelada** de toda corrida: o número errado não se corrige, se estorna.
 *
 * `typecheck`, `lint` e a suíte inteira passaram com o defeito de pé, e o navegador também
 * passaria — o `CLAUDE.md` já tem escrito que campo controlado cujo valor derivado não muda é
 * um dos casos que o navegador estruturalmente não vê.
 *
 * Então a régua é: onde a tela usa `campoComSugestao`, o estado cru aparece SÓ no `useState` e
 * no `onChangeText`. Toda outra leitura passa pela resposta. A lista de telas é derivada do
 * próprio código — quem passar a usar o molde entra na régua sem ninguém lembrar de nada.
 */
test('onde a tela sugere, o estado cru não é lido fora do useState e do onChangeText', () => {
  const telas = achar('app').filter((f) => readFileSync(f, 'utf8').includes('campoComSugestao'));
  assert.ok(telas.length > 0, 'nenhuma tela usa o molde — a régua passaria à toa');

  const falhas: string[] = [];
  for (const caminho of telas) {
    const fonte = readFileSync(caminho, 'utf8');
    // Os estados que o molde resolve: `const [x, setX] = useState<string | undefined>`.
    for (const m of fonte.matchAll(/const \[(\w+), set\w+\] = useState<string \| undefined>/g)) {
      const nome = m[1];
      fonte.split('\n').forEach((linha, i) => {
        if (linha.includes('useState<string | undefined>')) return;  // a declaração
        /**
         * A resolução, e a dispensa é da MESMA linha — de propósito.
         *
         * A tentativa de olhar as duas linhas de cima, para tolerar a chamada quebrada em
         * três, foi medida e **desligou a guarda**: `const units = parseTyped(quantity)` duas
         * linhas abaixo da chamada passou a ser absolvido, que é exatamente o defeito que
         * esta régua existe para pegar. Régua alargada para evitar um falso positivo comprou
         * um falso NEGATIVO, e este repositório já escreveu qual dos dois é pior.
         *
         * Então a dispensa continua estreita, e o preço é uma regra de escrita: a chamada de
         * `campoComSugestao` fica numa linha só. Se ela não couber, o nome está longo demais —
         * e a régua acusando é o aviso, não o defeito.
         */
        if (linha.includes('campoComSugestao(')) return;
        if (linha.trim().startsWith('*') || linha.trim().startsWith('//')) return;  // prosa
        /**
         * O nome CRU, e não o nome em qualquer posição — medido contra três falsos.
         *
         * A primeira versão desta régua acusou quatro linhas e três eram ela mesma: a chave
         * de objeto (`perUnit: formatQuantity(…)`), e o caminho do dicionário
         * (`t.app.productForm.perUnit`). Nome de campo, chave de dicionário e variável de
         * estado se chamam igual neste projeto de propósito — é a mesma coisa dita em três
         * lugares —, então a régua tem de olhar a POSIÇÃO: precedido de ponto é acesso a
         * propriedade, e seguido de dois-pontos é chave que está sendo escrita.
         *
         * A quarta era verdadeira e valeu a régua inteira: o array de dependências do
         * `useMemo` lia o estado cru, então a prévia do custo não recalculava quando o irmão
         * mudava — a tela mostrando um rendimento e a conta usando outro.
         */
        const cru = new RegExp(`(^|[^.\\w])${nome}\\b(?!\\s*:)`);
        if (!cru.test(linha)) return;
        falhas.push(`${caminho}:${i + 1}: \`${nome}\` cru — leia a resposta de campoComSugestao`);
      });
    }
  }
  assert.deepEqual(
    falhas,
    [],
    'o valor exibido e o valor gravado têm de sair da MESMA expressão: ler o estado cru aqui ' +
      'é a tela mostrar um número e o razão receber outro\n  ' + falhas.join('\n  '),
  );
});

/**
 * O que a pessoa disse que fez, guardado enquanto o cadastro não alcança.
 *
 * **Isto existe por uma decisão do dono, 11 de setembro:** *"partir dos dois lados: inicio
 * e fim, ambos valendo desde que o resultado seja o mesmo"*. O passo a passo continua
 * sendo o padrão e o seguro; o caminho de trás começa em *"o que você fez?"* e vai
 * buscando o que falta na ordem em que a pessoa pensa.
 *
 * E a medida de 11 de setembro decidiu a FORMA disto: `recordProduction` recusa produto
 * sem ficha, então começar pelo fim **não economiza cadastro — ele reordena**. Logo o que
 * precisa ser guardado não é um rascunho de produção: é uma INTENÇÃO, uma frase que a
 * pessoa disse antes de o aplicativo poder aceitá-la. Nada aqui chega ao livro-razão.
 *
 * **Por que fora do banco.** Intenção não é fato: ela não tem centavo, não tem saldo, não
 * atravessa para o servidor e não vira movimento. Dar-lhe tabela custaria migração (portão
 * P3) para guardar uma frase que vive minutos. Ela mora no `AsyncStorage` do aparelho, pelo
 * mesmo desenho que o `WhatsNew` usa — e por isso sobrevive ao aplicativo ser fechado no
 * meio do caminho, que é o caso comum de quem está cadastrando uma fábrica.
 *
 * Este arquivo é PURO: ele traduz entre texto guardado e fato, e não toca no
 * armazenamento. É o corte que este projeto faz em toda decisão — teste de Node não
 * importa arquivo que puxa `react-native`, então lógica dentro do componente é lógica sem
 * guarda.
 */

/** A chave no armazenamento do aparelho. Uma só: a pessoa faz uma coisa de cada vez. */
export const CHAVE_DA_INTENCAO = 'norva.intencao.v1';

export type Intencao = {
  /** O que saiu, nas palavras de quem fez. Pode não existir como produto ainda. */
  oQue: string;
  /** Quantas unidades, ou nulo quando a pessoa não disse. */
  quanto: number | null;
  /** Quando ela disse, em ISO. Serve para a tela não ressuscitar intenção de outro mês. */
  quando: string;
};

/** Depois disto a frase deixa de valer sozinha. */
export const DIAS_DE_VALIDADE = 7;

/**
 * Lê o que estava guardado, e devolve nulo para qualquer coisa que não seja intenção.
 *
 * Recusar em silêncio é o certo AQUI e só aqui: não há dado de ninguém em jogo — é uma
 * frase que a pessoa escreveu e que perdeu o sentido. O contrário (tela quebrada porque o
 * armazenamento tinha lixo de uma versão antiga) seria trocar um incômodo por uma parede.
 */
export function lerIntencao(bruto: string | null, agora: string): Intencao | null {
  if (!bruto) return null;
  let cru: unknown;
  try {
    cru = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (!cru || typeof cru !== 'object') return null;
  const obj = cru as Record<string, unknown>;
  const oQue = typeof obj.oQue === 'string' ? obj.oQue.trim() : '';
  // Frase vazia não é intenção: é o campo que ninguém preencheu. Guardá-la faria a tela
  // abrir no meio de um caminho que não começou.
  if (oQue.length === 0) return null;
  const quando = typeof obj.quando === 'string' ? obj.quando : '';
  if (!quando || Number.isNaN(Date.parse(quando))) return null;
  if (venceu(quando, agora)) return null;
  const quanto =
    typeof obj.quanto === 'number' && Number.isFinite(obj.quanto) && obj.quanto > 0
      ? obj.quanto
      : null;
  return { oQue, quanto, quando };
}

/**
 * A intenção venceu?
 *
 * Uma frase de dez dias atrás não é o que a pessoa está fazendo agora, e abrir o aplicativo
 * com ela na tela é o alerta inventado com outro rosto — ensina a ignorar. Sete dias é o
 * prazo de quem está montando a fábrica num fim de semana e volta na segunda.
 */
export function venceu(quando: string, agora: string): boolean {
  const entao = Date.parse(quando);
  const hoje = Date.parse(agora);
  if (Number.isNaN(entao) || Number.isNaN(hoje)) return true;
  // Data no FUTURO não vence: o relógio do aparelho anda para trás quando o fuso muda ou
  // quando alguém corrige a hora, e apagar a frase da pessoa por causa disso é perder
  // trabalho dela por um defeito que não é dela.
  if (entao > hoje) return false;
  return hoje - entao > DIAS_DE_VALIDADE * 24 * 60 * 60 * 1000;
}

/** O texto a guardar. O nome é aparado aqui para o que se lê ser o que se guardou. */
export function escreverIntencao(intencao: Intencao): string {
  return JSON.stringify({
    oQue: intencao.oQue.trim(),
    quanto: intencao.quanto,
    quando: intencao.quando,
  });
}

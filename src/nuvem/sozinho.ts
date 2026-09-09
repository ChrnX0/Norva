/**
 * O que acontece sozinho — decisão do dono, 8 de setembro: *"os backups e
 * sincronizações devem ser automáticos, ok. assim como as atualizações ota."*
 *
 * As três estavam construídas e as três dependiam de alguém lembrar: a fila só
 * subia por um botão em Ajustes, a cópia só era feita por um toque, e a
 * atualização chegava um lançamento atrasada. Coisa que depende de lembrança é
 * coisa que não acontece na fábrica — e a que não acontece aqui é justamente a que
 * só se descobre no dia em que o celular morreu.
 *
 * **Isto é REGRA, e por isso mora sem `expo-`.** Quem decide *o que* roda, *em que
 * ordem* e *se já é hora* é este arquivo, provado em `node --test`. Quem sabe
 * conversar com o navegador, com o cofre do sistema e com o servidor de
 * atualização é `src/nuvem/aparelho.ts`. É o mesmo corte de `backup.ts` contra
 * `copia.ts`, e ele existe porque a peça cujo prejuízo não tem conserto é a última
 * que pode ficar sem prova.
 *
 * **A ordem não é arbitrária, e inverter custa dado.** Sobe a fila primeiro,
 * depois faz a cópia: uma cópia feita antes da subida guarda um estado que o
 * servidor ainda não conhece, e se o aparelho morrer no meio a restauração
 * ressuscita linhas que já estavam a caminho. Atualização por último porque ela
 * pode reiniciar o aplicativo — reiniciar antes de subir a fila é perder a janela.
 */

/** Uma tentativa: o que se tentou, e o que aconteceu. Nunca uma frase. */
export type Tentativa = {
  o: 'fila' | 'copia' | 'atualizacao';
  /** `pulou` não é falha: é "não era hora", e a tela conta isso diferente. */
  fim: 'feito' | 'pulou' | 'falhou';
  /** Por que pulou ou falhou — dado, nunca texto de tela. */
  porque?: string;
};

/**
 * Quanto tempo entre cópias automáticas.
 *
 * Um dia, e não uma hora: a cópia é o razão inteiro, e subir 300 kB de manhã e de
 * tarde não protege mais do que subir de manhã — protege igual e gasta a franquia
 * de quem está no 3G da estrada. E não é uma semana porque a perda máxima
 * aceitável é um dia de trabalho: uma fábrica que registra 40 movimentos por dia
 * perde 40, não 280.
 */
export const ENTRE_COPIAS_MS = 24 * 60 * 60 * 1000;

/**
 * Se já é hora de copiar — e a resposta é NÃO quando nada mudou.
 *
 * Duas condições, e a segunda é a que evita backup inútil: passou o intervalo E o
 * razão cresceu. Uma fábrica fechada no domingo não gera cópia nova, porque uma
 * cópia idêntica à de ontem não protege nada e ainda assim consome dado do dono.
 *
 * Nunca ter copiado é hora, sempre — é o caso do aparelho novo, e é o único em que
 * a contagem de movimentos não importa.
 */
export function horaDeCopiar(
  ultima: { feitoEm: string; movimentos: number } | null,
  movimentosAgora: number,
  agora: string,
): boolean {
  if (!ultima) return true;
  const passou = new Date(agora).getTime() - new Date(ultima.feitoEm).getTime() >= ENTRE_COPIAS_MS;
  // **DIFERENTE, não maior.**
  //
  // "Cresceu" é a pergunta certa quando o razão só cresce, e ele nem sempre só
  // cresce: depois de um Reset ou de restaurar uma cópia mais antiga, o número
  // DESCE — e a régua passava a responder "não é hora" para sempre, calada, até a
  // fábrica gravar mais movimentos do que tinha antes. Um backup que para de
  // acontecer sem nada na tela é a pior forma de não ter backup, porque a pessoa
  // acredita que tem.
  return passou && movimentosAgora !== ultima.movimentos;
}

/** As peças que a rodada precisa — cada uma substituível por uma de mentira no teste. */
export type Pecas = {
  /** Sobe a fila. Devolve quantas linhas foram. */
  subirFila: () => Promise<number>;
  /** Quantos movimentos o aparelho tem agora — a régua do "mudou algo". */
  movimentos: () => Promise<number>;
  /** A última cópia registrada, ou nulo em aparelho novo. */
  ultima: () => Promise<{ feitoEm: string; movimentos: number } | null>;
  /** Faz a cópia e manda para o destino configurado. */
  copiar: () => Promise<void>;
  /** Existe destino de nuvem configurado e autorizado? Sem isso, copiar é para onde? */
  temDestino: () => Promise<boolean>;
  /** Procura atualização e baixa. Devolve se há uma pronta para valer. */
  buscarAtualizacao: () => Promise<boolean>;
};

/** Uma rodada por vez. Duas cópias simultâneas disputam o mesmo arquivo. */
let rodando = false;

/**
 * Uma rodada do que acontece sozinho.
 *
 * **Ela nunca levanta exceção.** Quem a chama é o boot e a volta do aplicativo ao
 * primeiro plano, e uma exceção ali é tela branca na mão de quem só queria abrir o
 * aplicativo. Cada peça falha por conta própria e a rodada segue: fila recusada
 * não impede a cópia, cópia recusada não impede a atualização. O que aconteceu sai
 * no relatório, para a tela poder contar sem inventar.
 *
 * **E a atualização não reinicia nada aqui.** Ela é baixada e fica pronta; quem
 * aplica é a próxima abertura do aplicativo. Reiniciar por conta própria no meio de
 * uma contagem na câmara fria seria trocar dado por novidade — e a pessoa que
 * perde a contagem uma vez não conta de novo.
 */
export async function umaRodada(pecas: Pecas, agora: string): Promise<Tentativa[]> {
  if (rodando) return [{ o: 'fila', fim: 'pulou', porque: 'jaRodando' }];
  rodando = true;
  const feito: Tentativa[] = [];
  try {
    try {
      const linhas = await pecas.subirFila();
      feito.push({ o: 'fila', fim: linhas > 0 ? 'feito' : 'pulou', porque: linhas > 0 ? undefined : 'filaVazia' });
    } catch (e) {
      feito.push({ o: 'fila', fim: 'falhou', porque: nome(e) });
    }

    try {
      if (!(await pecas.temDestino())) {
        feito.push({ o: 'copia', fim: 'pulou', porque: 'semDestino' });
      } else {
        const [ultima, movimentos] = await Promise.all([pecas.ultima(), pecas.movimentos()]);
        if (!horaDeCopiar(ultima, movimentos, agora)) {
          feito.push({ o: 'copia', fim: 'pulou', porque: ultima ? 'aindaVale' : 'semRazao' });
        } else {
          await pecas.copiar();
          feito.push({ o: 'copia', fim: 'feito' });
        }
      }
    } catch (e) {
      feito.push({ o: 'copia', fim: 'falhou', porque: nome(e) });
    }

    try {
      const pronta = await pecas.buscarAtualizacao();
      feito.push({ o: 'atualizacao', fim: pronta ? 'feito' : 'pulou', porque: pronta ? undefined : 'semNovidade' });
    } catch (e) {
      feito.push({ o: 'atualizacao', fim: 'falhou', porque: nome(e) });
    }
  } finally {
    rodando = false;
  }
  return feito;
}

/** O nome do erro, nunca a mensagem: mensagem de biblioteca não é frase de tela. */
function nome(e: unknown): string {
  if (e instanceof Error) {
    const comMotivo = e as Error & { motivo?: string };
    return comMotivo.motivo ?? e.name;
  }
  return 'desconhecido';
}

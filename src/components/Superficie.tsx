import { createContext, useContext, type ReactNode } from 'react';

/**
 * "Você já está sobre uma superfície" — dito por quem a desenhou.
 *
 * O casco de peça de uma pele pode SER a superfície: no Orgânico cada assunto da
 * capa mora num cartão branco de canto generoso, e é o cartão que separa um
 * assunto do outro. Um `Card` dentro dele desenha um segundo cartão, e a foto
 * mostra caixa dentro de caixa — que é exatamente o que o dono circulou quando
 * recusou a "pilha de retângulos".
 *
 * A resposta não podia ser a peça saber em que pele está: isso é o `if` que esta
 * rodada inteira arrancou. Ela é o contrário — quem desenha a superfície AVISA,
 * e quem ia desenhar outra por cima ouve. Uma pele nova cujo casco também seja
 * superfície liga isto e ganha o mesmo comportamento sem tocar em nenhum cartão.
 *
 * O que o cartão perde aqui é só o casco: fundo, borda e canto. O crachá, o
 * título, a régua da cor do assunto e o espaçamento continuam — eles são o
 * conteúdo, não a moldura.
 */
const SuperficieContext = createContext(false);

export function Superficie({ children }: { children: ReactNode }) {
  return <SuperficieContext.Provider value={true}>{children}</SuperficieContext.Provider>;
}

/** Verdadeiro quando quem chama já está desenhando sobre uma superfície. */
export function useSuperficie(): boolean {
  return useContext(SuperficieContext);
}

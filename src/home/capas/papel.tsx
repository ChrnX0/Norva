import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Folha } from '../Capa';
import type { Vestimenta } from './vestimenta';

/**
 * A roupa do Papel: uma página impressa, e o casco dela é o nada.
 *
 * Nada aqui desenha caixa em volta de peça — de propósito. A identidade do
 * Papel é a régua horizontal e o espaço em branco, e cartão em volta de tudo é
 * exatamente o que o dono recusou quando chamou a primeira capa de "pilha de
 * retângulos iguais". A peça já traz o que precisa; a pele só a deixa respirar.
 */
function CascoPapel({
  marca,
  data,
  heroi,
  children,
}: {
  marca: string;
  data: string;
  heroi: ReactNode;
  children: ReactNode;
}) {
  const { space } = useTheme();
  return (
    <Folha olho={`${marca} · ${data}`}>
      {/* O Papel não tem peça que sangre, então isto é sempre nulo hoje. Fica
          escrito mesmo assim: o dia em que ele ganhar uma, o espaço já existe —
          e o contrário (descobrir na foto que o herói colou na peça de baixo) é
          uma rodada. */}
      {heroi ? <View style={{ marginBottom: space.xl }}>{heroi}</View> : null}
      {children}
    </Folha>
  );
}

function BlocoPapel({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}

export const PAPEL: Vestimenta = {
  Casco: CascoPapel,
  Bloco: BlocoPapel,
};

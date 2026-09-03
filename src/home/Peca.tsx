import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Um widget da capa que abre no lugar.
 *
 * O dono pediu widgets "dinâmicos e clicáveis", e a primeira versão da capa
 * respondia isso com navegação: tocar levava para outra tela. Não é a mesma
 * coisa e ele estava certo — sair da capa custa a capa. Uma pergunta como
 * "quanto saiu hoje?" tem uma resposta curta que cabe no cartão e uma resposta
 * longa que cabe embaixo dela; navegar para a segunda joga a primeira fora.
 *
 * Então o toque abre, e a tela cheia continua a um toque de distância DENTRO da
 * peça aberta. Duas coisas seguem disso, e as duas são de propósito:
 *
 *   - **Uma peça aberta por vez.** Duas abertas empurram o resto para fora da
 *     tela, e a capa deixa de ser capa. Abrir uma fecha a outra sozinha.
 *   - **Peça sem mais nada a dizer não convida.** Sem `mais`, não há seta e o
 *     toque não faz nada — botão que não obedece é pior que botão ausente.
 */
export function Peca({
  index,
  hue,
  tone,
  icon,
  title,
  aberta,
  onToggle,
  children,
  mais,
}: {
  index?: number;
  hue?: string;
  tone?: 'plain' | 'area' | 'warning';
  icon?: (color: string) => ReactNode;
  title?: string;
  aberta: boolean;
  onToggle: () => void;
  /** O resumo, que é o que a capa mostra fechada. */
  children: ReactNode;
  /** O detalhe, que só existe depois do toque. Ausente: a peça não abre. */
  mais?: ReactNode;
}) {
  const { color, type, space } = useTheme();
  const { t } = useLocale();

  const corpo = (
    <Card hue={hue} tone={tone} icon={icon} title={title}>
      {children}
      {mais && aberta ? (
        // A entrada escalonada é a mesma da capa: o detalhe aparece de baixo,
        // então o olho acompanha em vez de a tela dar um pulo.
        <Reveal index={0} style={{ marginTop: space.md }}>
          <View style={{ gap: space.sm }}>{mais}</View>
        </Reveal>
      ) : null}
      {mais ? (
        <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
          {aberta ? t.app.home.less : t.app.home.more}
        </Text>
      ) : null}
    </Card>
  );

  if (!mais) return index === undefined ? corpo : <Reveal index={index}>{corpo}</Reveal>;

  const tocavel = (
    <Touchable onPress={onToggle} accessibilityLabel={title ?? ''}>
      {corpo}
    </Touchable>
  );
  return index === undefined ? tocavel : <Reveal index={index}>{tocavel}</Reveal>;
}

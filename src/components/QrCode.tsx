import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrPath } from '@/domain/qr';

/**
 * O QR desenhado, e desenhado do jeito que a câmara fria pede.
 *
 * Três decisões, e as três saem da mesma frase do `CLAUDE.md` sobre a Fase 3 —
 * *"QR a um braço de distância"*, com luva, a -18°C:
 *
 * **A zona de silêncio e o caminho único moram no domínio**, em `qrPath`, e não
 * aqui: são regra, não desenho, e dentro de um componente de React não havia
 * como um teste alcançá-las. A mutação que zerava a margem branca sobreviveu à
 * suíte inteira enquanto essa conta estava neste arquivo.
 *
 * **Preto sobre branco, sempre.** O QR não herda o tema: em modo escuro, um
 * código claro sobre fundo escuro é invertido e metade dos leitores recusa. O
 * fundo branco é parte do código, não do estilo da tela.
 */
export function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const { path, span } = useMemo(() => qrPath(text), [text]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`} accessibilityRole="image">
      <Rect x="0" y="0" width={span} height={span} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

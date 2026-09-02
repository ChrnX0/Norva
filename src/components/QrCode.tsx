import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrModules } from '@/domain/qr';

/**
 * O QR desenhado, e desenhado do jeito que a câmara fria pede.
 *
 * Três decisões, e as três saem da mesma frase do `CLAUDE.md` sobre a Fase 3 —
 * *"QR a um braço de distância"*, com luva, a -18°C:
 *
 * **Quieto de zona de silêncio.** O padrão exige quatro módulos de margem
 * branca em volta; sem ela, o papelão da caixa encosta no código e o leitor
 * desiste. É a parte que todo mundo corta para caber, e é a que faz falta.
 *
 * **Um caminho só, não mil retângulos.** A grade tem 441 módulos; desenhar cada
 * um como `<Rect>` seriam 441 nós no SVG e o mesmo tanto de trabalho a cada
 * quadro. Um único `<Path>` com 441 sub-comandos desenha igual e monta numa
 * fração do tempo — importa num celular barato, que é o que a fábrica compra.
 *
 * **Preto sobre branco, sempre.** O QR não herda o tema: em modo escuro, um
 * código claro sobre fundo escuro é invertido e metade dos leitores recusa. O
 * fundo branco é parte do código, não do estilo da tela.
 */
export function QrCode({ text, size = 180 }: { text: string; size?: number }) {
  const { path, span } = useMemo(() => {
    const modules = qrModules(text);
    const quiet = 4;
    const span = modules.length + quiet * 2;

    let path = '';
    for (let y = 0; y < modules.length; y++) {
      for (let x = 0; x < modules.length; x++) {
        if (modules[y][x]) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
      }
    }
    return { path, span };
  }, [text]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`} accessibilityRole="image">
      <Rect x="0" y="0" width={span} height={span} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

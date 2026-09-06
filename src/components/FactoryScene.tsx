import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';
import type { CenaDaFabrica } from './cena';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** A prancheta do desenho aprovado. Toda coordenada aqui é medida nela. */
const PRANCHA = { largura: 364, altura: 150 };

/**
 * A linha da fábrica desenhada em traço — a ilustração APROVADA, ao pé da letra.
 *
 * Ela não é decoração e não é minha: o dono mandou o desenho pronto
 * (`docs/design/aprovados/papel.html`) e disse *"nada alem disso. TODO o
 * aplicativo tem q seguir esse padrão"*. Então este arquivo é uma **transcrição**
 * daquele SVG, não uma interpretação dele: as mesmas coordenadas, os mesmos
 * grupos, a mesma prancheta de 364×150.
 *
 * **O que eu tinha feito e por que foi desfeito.** Esta cena já existiu com
 * quatro grupos: eu tinha tirado a nuvem e o morango ("não pousam em nada"),
 * trocado os picolés por potes ("nada de regra chumbada de sorvete") e enfiado o
 * floco para dentro da câmara ("asterisco azul no céu"). Cada corte tinha um
 * argumento — e todos os três morrem contra a mesma frase: o desenho estava
 * aprovado, e o que chegou na tela dele não era o desenho. Fundação se aplica ao
 * que o sistema DECIDE (receita, saldo, dinheiro), não ao que ele DESENHA; um
 * morango na capa não chumba regra nenhuma, e a prova é que o esquema não tem
 * uma linha sobre sorvete.
 *
 * O que a transcrição não abre mão é da **função**, porque a Lei da Inteligência
 * vale para pixel também: nada aqui se mexe por enfeite.
 *
 *  - A **fumaça** sobe só com tacho aberto. Fábrica parada, chaminé parada.
 *  - O **picolé do meio** enche na proporção do dia contra ontem, e PARA cheio:
 *    encher e esvaziar em ciclo seria a fábrica desfazendo o que fez.
 *  - A **caixa** entra pela direita quando saiu carga hoje, e não existe quando
 *    não saiu — a ausência é dado.
 *  - **Sol** e **floco** giram devagar (30 s e 48 s): sol parado num céu lê como
 *    imagem quebrada, e é o único movimento aqui que é só ambiente.
 *
 * **Por que quatro peças moram fora do `<Svg>`.** `transform` animado dentro de
 * um nó de SVG não atravessa igual no Android, no iOS e no navegador — foi
 * cicatriz, não preferência. Uma `View` por cima anima igual nos três. O preço é
 * ter que repetir a posição; para ela não sair do lugar, a posição é calculada da
 * MESMA prancheta do desenho (`caixaDe`), medindo a largura real em vez de
 * chutar porcentagem. Assim o desenho e as camadas escalam juntos, do telefone
 * de 360 dp ao tablet — que é a regra de layout deste projeto.
 */
export function FactoryScene({ running, dayShare, shipped }: CenaDaFabrica) {
  const { color, palette } = useTheme();
  const [largura, setLargura] = useState(0);
  const escala = largura / PRANCHA.largura;

  const fumacaA = useSharedValue(0);
  const fumacaB = useSharedValue(0);
  const fumacaC = useSharedValue(0);
  const sol = useSharedValue(0);
  const floco = useSharedValue(0);
  const enche = useSharedValue(0);
  const caixa = useSharedValue(0);

  useEffect(() => {
    let cancelado = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduzido) => {
      if (cancelado) return;
      if (reduzido) {
        // Parado, mas COMPLETO: quem desligou movimento vê a mesma cena, com o
        // picolé no nível certo e a caixa no lugar. Movimento é a forma, nunca
        // o conteúdo.
        enche.value = dayShare ?? 0;
        caixa.value = shipped ? 1 : 0;
        return;
      }
      const puxar = (v: SharedValue<number>, ms: number, atraso = 0) => {
        v.value = withDelay(atraso, withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false));
      };
      if (running) {
        // Três baforadas defasadas de dois segundos: uma coluna contínua, e não
        // três nuvens piscando juntas.
        puxar(fumacaA, 6000);
        puxar(fumacaB, 6000, 2000);
        puxar(fumacaC, 6000, 4000);
      } else {
        fumacaA.value = 0;
        fumacaB.value = 0;
        fumacaC.value = 0;
      }
      puxar(sol, 30000);
      puxar(floco, 48000);
      enche.value = withDelay(
        600,
        withTiming(dayShare ?? 0, { duration: 3200, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
      );
      caixa.value = withDelay(
        shipped ? 2400 : 0,
        withTiming(shipped ? 1 : 0, { duration: 1400, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
      );
    });
    return () => {
      cancelado = true;
    };
  }, [running, dayShare, shipped, fumacaA, fumacaB, fumacaC, sol, floco, enche, caixa]);

  /** Uma caixa da prancheta traduzida para pixels da tela, na escala medida. */
  const caixaDe = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: x * escala,
    top: y * escala,
    width: w * escala,
    height: h * escala,
  });

  // A rotação é escrita duas vezes de propósito. Ela já esteve fatorada num
  // `girar(v)` — três linhas a menos e o app MORTO na abertura: worklet não
  // chama função comum de forma síncrona, e o erro ("Tried to synchronously
  // call a Remote Function") só existe em tempo de execução. Typecheck e lint
  // passaram verdes na versão quebrada; quem pegou foi a foto do emulador.
  const estiloSol = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sol.value * 360}deg` }],
  }));
  const estiloFloco = useAnimatedStyle(() => ({
    transform: [{ rotate: `${floco.value * 360}deg` }],
  }));

  return (
    <View
      onLayout={(e) => setLargura(e.nativeEvent.layout.width)}
      style={{ width: '100%', aspectRatio: PRANCHA.largura / PRANCHA.altura }}
      pointerEvents="none"
      accessibilityRole="image"
    >
      <Svg
        viewBox={`0 0 ${PRANCHA.largura} ${PRANCHA.altura}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <ClipPath id="corte">
            <Rect x="216" y="82" width="20" height="34" rx="7" />
          </ClipPath>
        </Defs>
        <G fill="none" stroke={color.ink} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
          {/* A linha de chão: tudo pousa nela, e é ela que faz sete objetos
              lerem como uma linha de produção em vez de figurinhas espalhadas. */}
          <Path d="M0 133h364" stroke={color.line} />
          <Path
            d="M28 34c-5 0-8-3-8-7s4-7 8-6c1-6 8-8 12-3 5-2 10 2 9 8"
            stroke={color.lineStrong}
          />

          {/* Fábrica: telhado dentado, corpo, janelas, porta. */}
          <Path d="M20 88l0-16 16 16 0-16 16 16 0-16 16 16 0-16 16 16" />
          <Path d="M20 88h64v45H20z" />
          <Path d="M28 98h9v9h-9zM42 98h9v9h-9zM56 98h9v9h-9zM28 113h9v9h-9z" />
          <Path d="M56 133v-23h12v23" />

          {/* Chaminé. */}
          <Path d="M92 133V58h14v75M90 62h18" />

          {/* Câmara fria. */}
          <Path d="M124 76h54v57h-54z" />
          <Path d="M124 96h54M168 84v8M168 102v12" />

          {/* Três picolés; o do meio é o medidor do dia. */}
          <Rect x="192" y="82" width="20" height="34" rx="7" />
          <Path d="M202 116v14" />
          <Rect x="216" y="82" width="20" height="34" rx="7" stroke={palette.apricot} />
          <Path d="M226 116v14" stroke={palette.apricot} />
          <G clipPath="url(#corte)">
            <Enchimento progresso={enche} cor={palette.apricot} />
          </G>
          <Rect x="240" y="82" width="20" height="34" rx="7" />
          <Path d="M250 116v14" />

          {/* Morango. */}
          <G stroke={palette.apricot}>
            <Path d="M290 122c-14-9-18-22-9-27 4-2.5 7-1 9 1 2-2 5-3.5 9-1 9 5 5 18-9 27z" />
            <Path d="M290 96l-9-6M290 96l9-6M290 96v-9" />
          </G>
        </G>
      </Svg>

      {/* Daqui para baixo, as camadas animadas — posicionadas pela mesma
          prancheta do desenho, então elas escalam junto com ele. */}
      {escala > 0 ? (
        <>
          <Fumaca progresso={fumacaA} cor={color.lineStrong} caixa={caixaDe(88, 18, 22, 40)} />
          <Fumaca progresso={fumacaB} cor={color.lineStrong} caixa={caixaDe(88, 18, 22, 40)} />
          <Fumaca progresso={fumacaC} cor={color.lineStrong} caixa={caixaDe(88, 18, 22, 40)} />

          <Animated.View style={[caixaDe(315, 9, 42, 42), estiloSol]}>
            <Svg viewBox="0 0 42 42" width="100%" height="100%">
              <Circle cx="21" cy="21" r="11" stroke={palette.apricot} strokeWidth={1.3} fill="none" />
              <G stroke={palette.apricot} strokeWidth={1.3} strokeLinecap="round">
                <Path d="M21 2v6M21 34v6M2 21h6M34 21h6M8 8l4 4M30 30l4 4M34 8l-4 4M12 30l-4 4" />
              </G>
            </Svg>
          </Animated.View>

          <Animated.View style={[caixaDe(139, 46, 24, 24), estiloFloco]}>
            <Svg viewBox="0 0 24 24" width="100%" height="100%">
              <G stroke={palette.sky} strokeWidth={1.3} strokeLinecap="round" fill="none">
                <Path d="M12 3v18M4 7.5l16 9M4 16.5l16-9" />
              </G>
            </Svg>
          </Animated.View>

          <Caixa progresso={caixa} cor={color.ink} caixa={caixaDe(310, 94, 48, 41)} escala={escala} />
        </>
      ) : null}
    </View>
  );
}

/** Uma baforada: sobe vinte e dois e some. Seis segundos é uma respiração longa. */
function Fumaca({
  progresso,
  cor,
  caixa,
}: {
  progresso: SharedValue<number>;
  cor: string;
  caixa: object;
}) {
  const estilo = useAnimatedStyle(() => ({
    opacity: progresso.value === 0 ? 0 : Math.sin(progresso.value * Math.PI) * 0.9,
    transform: [{ translateY: 6 - progresso.value * 22 }],
  }));
  return (
    <Animated.View style={[caixa, estilo]}>
      <Svg viewBox="0 0 22 40" width="100%" height="100%">
        <Path
          d="M11 38c-7-5 5-11-2-17c-5-5 3-9 0-13"
          stroke={cor}
          strokeWidth={1.3}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * O picolé do meio enchendo.
 *
 * As medidas seguem o próprio picolé (x 216, y 82, altura 34): separadas, o
 * preenchimento sai do molde no dia em que alguém mexer no desenho — e ninguém
 * percebe, porque a cena continua bonita com a barra fora do lugar.
 */
function Enchimento({ progresso, cor }: { progresso: SharedValue<number>; cor: string }) {
  const props = useAnimatedProps(() => ({
    y: 116 - 34 * progresso.value,
    height: 34 * progresso.value,
  }));
  return <AnimatedRect animatedProps={props} x={216} width={20} fill={cor} fillOpacity={0.22} stroke="none" />;
}

/** A caixa da expedição, entrando pela direita — uma vez, quando saiu carga. */
function Caixa({
  progresso,
  cor,
  caixa,
  escala,
}: {
  progresso: SharedValue<number>;
  cor: string;
  caixa: object;
  escala: number;
}) {
  const estilo = useAnimatedStyle(() => ({
    opacity: progresso.value,
    // Quarenta e seis unidades da prancheta, não quarenta e seis pixels: no
    // tablet a cena é o dobro, e a entrada tem de percorrer o dobro junto.
    transform: [{ translateX: (1 - progresso.value) * 46 * escala }],
  }));
  return (
    <Animated.View style={[caixa, estilo]}>
      <Svg viewBox="0 0 48 41" width="100%" height="100%">
        <G stroke={cor} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d="M2 10h44v29H2z" />
          <Path d="M2 19h44M24 10v29M8 10l6-8h26l6 8" />
        </G>
      </Svg>
    </Animated.View>
  );
}

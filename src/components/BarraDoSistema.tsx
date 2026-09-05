import { StatusBar } from 'expo-status-bar';
import { NavigationBar } from 'expo-navigation-bar';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * As duas faixas do Android que não são nossas — e que estavam mentindo sobre o tema.
 *
 * A foto do tema escuro mostrou uma **tarja branca** embaixo da barra de abas,
 * com os três botões do sistema. O tema nativo já declarava a faixa
 * transparente, então eu tinha dado o assunto por resolvido; o que faltava ler é
 * que, do Android 10 em diante, o sistema **pinta um véu por cima de uma faixa
 * transparente** para garantir contraste com os próprios botões — e escolhe a
 * cor desse véu pelo tema do APARELHO, não pelo do aplicativo.
 *
 * O aparelho estava no claro e o aplicativo no escuro. As duas coisas certas,
 * cada uma por si, davam uma tarja branca no rodapé de uma página preta.
 *
 * São duas correções e elas andam juntas: o `styles.xml` desliga o véu
 * (`enforceNavigationBarContrast`), e isto aqui manda a cor dos BOTÕES seguir a
 * luz que o aplicativo escolheu. Só a primeira deixaria botões escuros sobre
 * fundo escuro, que é trocar uma tarja por um sumiço.
 *
 * E a barra de cima vem junto pelo mesmo motivo: `style="auto"` do
 * `expo-status-bar` segue o aparelho. Aqui quem manda é a escolha da pessoa nos
 * Ajustes, que pode ser o contrário — o dono no escritório com o celular no
 * claro e o aplicativo no escuro para a câmara fria.
 */
export function BarraDoSistema() {
  const { scheme } = useTheme();
  const claro = scheme === 'light';

  // Componente e não efeito: o `expo-navigation-bar` do SDK 57 desenha por
  // declaração, e no iOS ele não faz nada — a barrinha de gesto de lá é do
  // sistema. `style` aqui é a cor dos BOTÕES, então ela é o contrário do papel:
  // página clara pede botão escuro.
  return (
    <>
      <NavigationBar style={claro ? 'dark' : 'light'} />
      <StatusBar style={claro ? 'dark' : 'light'} />
    </>
  );
}

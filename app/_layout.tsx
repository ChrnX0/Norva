import { Stack, useRouter, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { BarraDoSistema } from '@/components/BarraDoSistema';
import { useEffect, useState } from 'react';
import { AppState, BackHandler } from 'react-native';
import * as Linking from 'expo-linking';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfirmProvider } from '@/components/Confirm';
import { Crash } from '@/components/Crash';
import { WhatsNew } from '@/components/WhatsNew';
import { Alerts } from '@/notify/Alerts';
import { carregarEmpresa } from '@/data/empresa';
import { carregarUnidade } from '@/data/unidade';
import { rodadaAutomatica } from '@/nuvem/aparelho';
import { ensureStarterData } from '@/data/seed';
import { floorSignIn, namesWhoRecorded, setCurrentOperator } from '@/data/repository';
import { decidirVolta, porFora } from '@/volta';
import { LocaleProvider } from '@/i18n/Locale';
import { AppearanceProvider, useAppearance } from '@/theme/Appearance';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * A abertura fica até o aplicativo saber QUE CARA desenhar.
 *
 * A tela de abertura era a padrão da Expo — um branco sem nada, com a marca que
 * o `scripts/icons.mjs` gera para ela existindo no disco e não sendo citada em
 * lugar nenhum (`app.json` não tinha `expo-splash-screen`). Peça desenhada com
 * cuidado e jogada fora é o P1 desta casa, na primeira tela que alguém vê.
 *
 * Configurada, ela ainda sumia cedo demais. O casco abre o banco e, enquanto
 * abre, devolvia uma `View` vazia; depois a `AppearanceProvider` lê do disco qual
 * cara e qual luz a empresa escolheu, e só então a página nasce. Entre uma coisa
 * e outra o aparelho mostrava BRANCO — e num celular no escuro, entre uma
 * abertura carvão e uma página carvão, esse branco é um flash na cara de quem
 * abriu. É a mesma cicatriz do tema claro ilegível, na primeira tela.
 *
 * Então: `preventAutoHideAsync` no escopo do módulo (como a documentação manda,
 * fora de componente, senão chega tarde) e a abertura sai quando as DUAS coisas
 * estão prontas — o banco e a escolha da cara. Do carvão para o carvão, sem
 * costura.
 */
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Cento e sessenta milissegundos: o mesmo assentar do resto do aplicativo. */
SplashScreen.setOptions({ duration: 160, fade: true });

/**
 * Some a abertura quando a cara já está escolhida.
 *
 * Componente em vez de efeito no casco porque `ready` mora DENTRO da
 * `AppearanceProvider` — e é justamente essa leitura que não pode ficar de fora
 * da conta. Não desenha nada.
 */
function AberturaSai() {
  const { ready } = useAppearance();
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
  return null;
}

/**
 * O que acontece sozinho, também quando o aplicativo volta do bolso.
 *
 * Decisão do dono, 8 de setembro: backup, sincronia e atualização são
 * automáticos. O boot já dispara uma rodada; esta peça existe porque o celular da
 * fábrica **não é reiniciado** — ele fica semanas aberto em segundo plano, e um
 * automático que só roda no boot é um automático que roda uma vez por mês.
 *
 * Só na volta ao primeiro plano, e nunca ao sair: quem está indo embora não
 * espera. E a rodada se recusa a rodar duas vezes ao mesmo tempo, então voltar
 * duas vezes rápido não faz duas cópias.
 */
function OQueAconteceSozinho() {
  useEffect(() => {
    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void rodadaAutomatica();
    });
    return () => inscricao.remove();
  }, []);
  return null;
}

/** Para onde a tecla leva quem não tem nada atrás: a capa. */
const DESTINO = '/';

/**
 * A TECLA voltar do aparelho — a outra entrada do mesmo gesto, e a que estava solta.
 *
 * O `voltar()` (`src/nav.ts`) atende a SETA DO CABEÇALHO. A tecla do aparelho nunca
 * passava por ele: ela ia para o padrão da navegação, que numa pilha de um cartão
 * encerra a Activity. Medido em 11 de setembro, partida fria em `norva://losses` com
 * `voltar()` já no lugar — o foco foi para o launcher do mesmo jeito.
 *
 * Por que o casco e não cada tela: a regra é uma e não depende de qual tela recebeu a
 * ligação. Vinte telas registrando o mesmo ouvinte é a divergência esperando a vez.
 *
 * A decisão mora em `src/volta.ts`, fora do React, porque ela tem três casos e um
 * deles protege uma decisão escrita — a grade de nomes tem de SAIR, não ir para a
 * capa. Aqui fica só a ligação com o aparelho.
 */
function TeclaVoltar() {
  const router = useRouter();
  const caminho = usePathname();
  const [veioDeFora, setVeioDeFora] = useState(false);

  // Lida uma vez: a ligação que ABRIU esta sessão não muda enquanto ela dura.
  useEffect(() => {
    let vivo = true;
    void Linking.getInitialURL().then((url) => {
      if (vivo) setVeioDeFora(porFora(url));
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const inscricao = BackHandler.addEventListener('hardwareBackPress', () => {
      const decisao = decidirVolta({
        podeVoltar: router.canGoBack(),
        noDestino: caminho === DESTINO,
        porFora: veioDeFora,
      });
      // `false` devolve a tecla para quem a atendia — voltar na pilha ou sair do
      // aplicativo. Só `true` engole, e engolir sem levar a algum lugar seria
      // prender a pessoa.
      if (decisao === 'padrao') return false;
      router.replace(DESTINO as never);
      return true;
    });
    return () => inscricao.remove();
  }, [router, caminho, veioDeFora]);

  return null;
}

/**
 * O aparelho compartilhado pergunta quem está com ele, a cada abertura.
 *
 * Não desenha nada, e existe pelo mesmo motivo que o `Alerts` ao lado: regra sem
 * chamador é peça morta, e esta regra é a diferença entre nomear e mentir.
 *
 * **Por que ESQUECER e não lembrar.** Num celular que passa de mão, o nome
 * guardado é do turno anterior. Manter o último faria a carga da tarde sair
 * assinada por quem foi embora ao meio-dia — e isso é pior que não nomear
 * ninguém, porque tem cara de informação. Abrir o app é a evidência mais forte
 * que existe de que o aparelho trocou de mão, então é ali que o nome cai.
 *
 * **E só quando as duas coisas valem.** A empresa que não nomeia ninguém nunca
 * vê esta tela; a que dá um celular por pessoa escolhe uma vez e fica. Os dois
 * caminhos existem e o padrão é não perguntar nada.
 */
function QuemEstaComOAparelho() {
  const router = useRouter();
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [nomeia, entrada] = await Promise.all([namesWhoRecorded(), floorSignIn()]);
      if (!vivo || !nomeia || entrada !== 'shared') return;
      await setCurrentOperator(null);
      // `replace`, não `push`: com `push` o gesto de voltar deixa a pessoa no
      // estado de ninguém identificado sem ter tocado em nada — e num aparelho
      // compartilhado esse estado é o PISO (`currentCapabilities`), então voltar
      // seria um jeito de operar sem dizer quem é. A grade não tem "atrás".
      if (vivo) router.replace('/who' as never);
    })();
    return () => {
      vivo = false;
    };
  }, [router]);
  return null;
}

/**
 * Expo Router renders this instead of the screen when a render throws.
 *
 * Without it the person gets a blank screen, which for someone still deciding
 * whether to trust software with their money is the worst possible answer: they
 * cannot tell a bug from their own mistake, so they assume it was theirs.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <SafeAreaProvider>
      <LocaleProvider>
        <AppearanceProvider>
          <ThemeProvider>
            <AberturaSai />
            <Crash error={error} retry={() => void retry()} />
          </ThemeProvider>
        </AppearanceProvider>
      </LocaleProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  // The database is opened, migrated and seeded once, here, before any screen
  // asks it anything. It used to happen on the home screen, which meant every
  // other entry point - a deep link, a shared address - opened onto an empty
  // app and said there was nothing registered.
  //
  // What happens when that fails is half of this component's job. The `catch`
  // that used to be here swallowed the failure and let the app draw anyway:
  // with no database every screen answers "nothing registered yet" and the
  // briefing writes "everything steady" - the app lying calmly, which is the
  // worst possible state for somebody still deciding whether to trust it with
  // their money. The law says the opposite: an error stops the thing, it does
  // not complain about it, and "all is well" only counts when it is true.
  const [state, setState] = useState<{ ready: boolean; error: Error | null }>({
    ready: false,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    // A empresa vem ANTES do exemplo, e a ordem é a regra: `ensureStarterData`
    // carimba o que escreve com a empresa deste aparelho, e quem responde isso é
    // um fato lido do disco. Semear primeiro e ler depois carimbaria o exemplo
    // com a semente num aparelho que já tem empresa.
    carregarEmpresa()
      // A unidade vem junto da empresa e pelo mesmo motivo: as duas carimbam o
      // que se grava, e as duas são lidas do disco antes da primeira tela. A
      // unidade DEPOIS da empresa porque o padrão dela deriva da empresa.
      .then(() => carregarUnidade())
      .then(() => ensureStarterData())
      // O automático dispara e NÃO é esperado: subir fila, copiar e buscar
      // atualização não podem atrasar a primeira tela em um milissegundo. Decisão
      // do dono, 8 de setembro — as três acontecem sozinhas. `rodadaAutomatica`
      // não levanta exceção por desenho, então o `void` aqui não engole nada.
      .then(() => {
        void rodadaAutomatica();
      })
      .then(
      () => {
        if (alive) setState({ ready: true, error: null });
      },
      (e: unknown) => {
        if (alive) {
          setState({ ready: true, error: e instanceof Error ? e : new Error(String(e)) });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  // Retrying means opening the database again, not redrawing the screen: the
  // disk may have room now, the file may have been released.
  const retry = () => {
    setState({ ready: false, error: null });
    setAttempt((a) => a + 1);
  };

  // The same screen the ErrorBoundary uses, because to the person holding the
  // phone it is the same event: it stopped, nothing was lost, it can be tried
  // again.
  if (state.error) {
    return (
      <SafeAreaProvider>
        <LocaleProvider>
          <AppearanceProvider>
            <ThemeProvider>
              <AberturaSai />
              <Crash error={state.error} retry={retry} />
            </ThemeProvider>
          </AppearanceProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    );
  }

  // `null`, e não uma `View` branca: enquanto isto vale, quem está na tela é a
  // abertura, e uma folha branca por baixo dela é a costura que ela existe para
  // não ter.
  if (!state.ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* O idioma e a moeda da empresa envolvem tudo, e ficam FORA da cara: a
            escolha da empresa não muda porque alguém trocou a identidade da
            tela. Trinta e três telas a leem pelo `useLocale`. */}
        <LocaleProvider>
          {/* A cara escolhida envolve tudo: ela decide a paleta, a tipografia e
              o raio dos cantos que o resto do aplicativo lê do tema. */}
          <AppearanceProvider>
            <ThemeProvider>
              <AberturaSai />
              <ConfirmProvider>
                <BarraDoSistema />
                <Stack screenOptions={{ headerShown: false }} />
                <TeclaVoltar />
                <QuemEstaComOAparelho />
                <OQueAconteceSozinho />
                {/* Sits above every screen: the update may land on any of them. */}
                <WhatsNew />
                {/* Reagenda os avisos a cada abertura. Não desenha nada; existe
                    para a regra de alarme ter chamador — peça sem chamador é a
                    doença que o P1 descreve, e este repositório já a teve quatro
                    vezes. */}
                <Alerts />
              </ConfirmProvider>
            </ThemeProvider>
          </AppearanceProvider>
        </LocaleProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

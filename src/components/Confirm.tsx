import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "@/i18n/useLocale";
import { tatoDeFalha } from "./tato";
import type { Ambient } from "@/theme/tokens";
import { AreaProvider, useTheme } from "@/theme/ThemeProvider";
import { Button } from "./Button";

/**
 * The app's own confirmation, replacing `Alert.alert`.
 *
 * It exists because `Alert` is a no-op on the web: every save in this app was
 * asking a question nobody was shown and waiting for an answer that never came,
 * so the whole thing was quietly read-only in a browser and nothing said so.
 *
 * Owning it also makes the confirmation what the design asks for rather than
 * whatever the platform provides. The confirmations here are not "are you
 * sure" - they spell out what is about to happen, in words, with the numbers
 * written out, which is the one thing standing between a tired person and a
 * wrong entry. That needs real typography and room to breathe.
 *
 * It rises from the bottom, except when it is destructive: a centred dialog is
 * reserved for the actions that cannot be undone, so the shape itself carries a
 * warning before the words are read.
 */

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * O ato NÃO tem volta. Desenha a folha centrada, em vermelho, e sem padrão.
   *
   * **O eixo estava invertido, e dava para provar por este campo.** O docblock
   * acima diz, desde que a folha existe, que a forma centrada é *"reservada para
   * as ações que não podem ser desfeitas"*. Ele estava ligado em três estornos —
   * o único ato do aplicativo cujo propósito inteiro é **ser** o caminho de
   * volta — e em tirar um insumo de circulação, que o mesmo botão traz de volta.
   *
   * Uma auditoria de 7 de setembro classificou 82 atos por três lentes e mediu
   * isso: dos seis lugares que passavam `destructive`, **quatro tinham volta**.
   * A peça que marca "isto é grave" estava marcando o mecanismo de recuperação.
   *
   * Agora ele quer dizer o que sempre disse que queria, e **obriga a segunda
   * folha**: `src/components/confirm.test.ts` recusa `destructive` sem `segunda`.
   * Assim a regra do dono — *"toda ação irreversível deve requerer duas
   * confirmações"* — não depende de cada tela lembrar.
   */
  destructive?: boolean;
  /**
   * A segunda folha, e ela tem de dizer coisa DIFERENTE da primeira.
   *
   * Duas perguntas iguais não são duas confirmações: são uma com fricção, e
   * fricção repetida treina o dedo a passar batido — que é o "alerta inventado"
   * do `CLAUDE.md` na forma mais cara, porque estraga justamente a folha que
   * importa.
   *
   * A primeira diz **o que vai acontecer**. A segunda diz **o que se perde e não
   * volta**, com os números por extenso. É a decisão do dono, 7 de setembro:
   * *"duas etapas de confirmações explicando isso do registro aí antes de
   * apagar"*.
   */
  segunda?: { title: string; message: string; confirmLabel?: string };
  /** Drops the cancel button: for telling, not asking. */
  acknowledge?: boolean;
  /**
   * De que ÁREA veio a pergunta. Preenchido por `useConfirm`, nunca na chamada.
   *
   * A folha mora na raiz do aplicativo, acima de todo `AreaProvider` — então ela
   * lia a área padrão, que é a da capa, e **toda confirmação do aplicativo saía
   * azul**: apagar receita nos ajustes, despachar carga no transporte, tudo com o
   * tom da home. No Papel isso nem se notava, porque lá o botão cheio é da marca;
   * no Orgânico, onde a cor É o assunto, a folha respondia o assunto errado.
   */
  area?: Ambient;
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<
  ((request: ConfirmRequest) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const queue = useRef<Pending[]>([]);

  const ask = useCallback((request: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      const entry = { ...request, resolve };
      setPending((current) => {
        if (current) {
          // Two questions at once would stack invisibly; the second waits.
          queue.current.push(entry);
          return current;
        }
        return entry;
      });
    });
  }, []);

  /**
   * O sim da primeira folha abre a segunda; o não resolve na hora.
   *
   * A segunda entra como uma pergunta nova com o mesmo `resolve`, então quem
   * chamou continua esperando UMA promessa e recebe `true` só se as duas forem
   * respondidas. A tela não sabe que houve dois passos, e é isso que faz a regra
   * caber numa declaração em vez de num `if` repetido em cada chamada.
   *
   * `destructive` continua ligado na segunda: a forma centrada e vermelha é o
   * aviso antes da leitura, e ela não pode afrouxar no passo mais grave.
   */
  const settle = (answer: boolean) => {
    setPending((current) => {
      if (answer && current?.segunda) {
        return {
          ...current,
          title: current.segunda.title,
          message: current.segunda.message,
          confirmLabel: current.segunda.confirmLabel ?? current.confirmLabel,
          segunda: undefined,
        };
      }
      current?.resolve(answer);
      return queue.current.shift() ?? null;
    });
  };

  const value = useMemo(() => ask, [ask]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? <ConfirmSurface request={pending} onAnswer={settle} /> : null}
    </ConfirmContext.Provider>
  );
}

/**
 * Asks, and resolves to what the person chose.
 *
 * Outside a provider it resolves to `false` rather than throwing: a screen that
 * cannot ask must not act, and refusing to act is always the safe direction.
 */
export function useConfirm(): (request: ConfirmRequest) => Promise<boolean> {
  const ask = useContext(ConfirmContext);
  // A área é lida AQUI, que é o único ponto do caminho que ainda está dentro da
  // tela que perguntou. Ela viaja como nome e não como cor: cor passada na mão é
  // o que a regra do tema proíbe — *"No screen ever passes a color down by
  // hand"* —, e com o nome a folha abre um `AreaProvider` e o botão, a régua e o
  // crachá acertam sozinhos.
  const { area } = useTheme();
  return useCallback(
    (request: ConfirmRequest) =>
      (ask ?? (async () => false))({ area, ...request }),
    [ask, area],
  );
}

function ConfirmSurface({
  request,
  onAnswer,
}: {
  request: ConfirmRequest;
  onAnswer: (ok: boolean) => void;
}) {
  const { color, radius, space, type } = useTheme();
  const { t } = useLocale();
  const insets = useSafeAreaInsets();

  const destructive = request.destructive ?? false;

  /**
   * **O tremor de "não deu", e ele mora AQUI porque toda recusa passa por aqui.**
   *
   * Uma folha com `acknowledge` é o aplicativo contando que a gravação não aconteceu:
   * `avisoDeFalha` monta a frase e a folha a mostra sem botão de cancelar, porque não há o
   * que escolher. Nove telas fazem isso, e nenhuma delas precisa saber de vibração.
   *
   * Pedido do dono: *"cor de confirmação e cor de erro… ou até um aviso sonoro"*, porque
   * cada canal falha num ambiente diferente — quem está de luva na câmara fria não olha a
   * tela para descobrir que a carga não foi gravada.
   *
   * Uma vez por folha, e por isso o efeito depende da mensagem: a segunda etapa de uma
   * confirmação destrutiva troca o texto e reusa a mesma folha, e sem a mensagem na lista
   * de dependências a folha nova entraria calada.
   */
  useEffect(() => {
    if (request.acknowledge) tatoDeFalha();
  }, [request.acknowledge, request.message]);

  const body = (
    <>
      <Text style={[type.section, { color: color.ink }]}>{request.title}</Text>

      <ScrollView style={{ maxHeight: 260 }}>
        <Text
          style={[type.body, { color: color.inkMuted, marginTop: space.md }]}
        >
          {request.message}
        </Text>
      </ScrollView>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        {/* Os botões são o `Button`, e não uma cópia dele.
            
            A cópia que estava aqui já tinha divergido três vezes: a forma do canto
            (consertada uma vez, copiando a regra em vez de usar a peça), a tinta do
            preenchimento (ignorava `tintaCheia`, então o Papel ganhava acento de
            área onde a regra manda a marca) e a tinta do rótulo (declarada como
            `onAccent` em vez de medida contra o fundo, que é o defeito que a foto
            do Papel escuro já mostrou uma vez). Regra copiada diverge; peça usada,
            não. */}
        <Button
          label={request.confirmLabel ?? t.app.confirm.confirm}
          onPress={() => onAnswer(true)}
          variant={destructive ? "danger" : "primary"}
          style={estilos.cheio}
        />

        {request.acknowledge ? null : (
          <Button
            label={request.cancelLabel ?? t.app.confirm.cancel}
            onPress={() => onAnswer(false)}
            variant="ghost"
            style={estilos.cheio}
          />
        )}
      </View>
    </>
  );

  return (
    <Modal
      visible
      transparent
      animationType={destructive ? "fade" : "slide"}
      onRequestClose={() => onAnswer(false)}
    >
      {/* A folha veste a área de quem perguntou, e tudo lá dentro segue. */}
      <AreaProvider area={request.area ?? "sky"}>
        {destructive ? (
          <View
            style={[
              styles.centred,
              { backgroundColor: "rgba(0,0,0,0.45)", padding: space.lg },
            ]}
          >
            <View
              style={{
                backgroundColor: color.paper,
                borderRadius: radius.xl,
                padding: space.xl,
                width: "100%",
                maxWidth: 420,
              }}
            >
              {body}
            </View>
          </View>
        ) : (
          <>
            <Pressable
              style={styles.backdrop}
              onPress={() => onAnswer(false)}
              accessibilityLabel={request.cancelLabel ?? t.app.confirm.cancel}
            />
            <View
              style={{
                backgroundColor: color.paper,
                borderTopLeftRadius: radius.xl,
                borderTopRightRadius: radius.xl,
                paddingTop: space.md,
                paddingBottom: insets.bottom + space.lg,
                paddingHorizontal: space.lg,
              }}
            >
              <View
                style={[styles.grabber, { backgroundColor: color.lineStrong }]}
              />
              {body}
            </View>
          </>
        )}
      </AreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  centred: { flex: 1, alignItems: "center", justifyContent: "center" },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
});

const estilos = StyleSheet.create({
  /** A ação da folha ocupa a largura: aqui não há nada ao lado dela. */
  cheio: { alignSelf: "stretch", justifyContent: "center" },
});

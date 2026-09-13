import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { aceitaDoPai } from './campo';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A labelled input.
 *
 * `hint` is where the intelligence shows up: the field explains what the system
 * already worked out from what was typed ("R$ 4,72 per kilo becomes 0.472
 * cents per gram"), so the person confirms an answer instead of computing one.
 *
 * The label is always visible - never a placeholder that vanishes the moment
 * someone starts typing and leaves them guessing what the box was for.
 *
 * **E o campo tem duas caras, como o resto do aplicativo.** Ele tinha uma só — a
 * caixa de canto arredondado com fundo de superfície — e ela é vocabulário do
 * Orgânico. No Papel, que é serifa, traço fino e canto reto, uma caixa pastel é
 * objeto de outro aplicativo: é o mesmo defeito que o dono circulou nos cartões
 * (*"como é que essas 'caixas' continuam aí?"*), sobrevivendo em trinta e nove
 * campos porque ninguém tinha olhado um formulário no Papel.
 *
 * A forma do Papel para um campo é a da ficha impressa: **o nome em cima, a
 * resposta numa linha, e nada em volta.** A linha engrossa e toma a cor da área
 * quando o dedo está ali — que é a única coisa que a caixa fazia de útil, dizer
 * onde se está escrevendo, e continua sendo dita.
 */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  suffix,
  keyboardType = 'default',
  autoFocus = false,
  segredo = false,
  caixaAutomatica = 'sentences',
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  hint?: string;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
  /**
   * Senha: esconde o que se digita e desliga o corretor.
   *
   * Entrou com a tela de conta. E o `hint` continua servindo aqui, que é o que
   * separa um campo de senha decente de um ruim — "faltam 3 letras" dito enquanto
   * se digita evita o erro depois de enviar, que é a Lei 5 desta casa: erro se
   * IMPEDE, não se reclama.
   */
  segredo?: boolean;
  /**
   * E-mail não começa com maiúscula. O padrão do Android é `sentences`, e num
   * campo de e-mail isso produz `Rockx0@…` — que o servidor aceita e o dono não
   * reconhece quando erra a senha.
   */
  caixaAutomatica?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const { color, radius, space, type, accent, tracos } = useTheme();
  const papel = tracos.genero === 'pagina';

  // Onde o dedo está. No Orgânico a caixa já responde por si; no Papel a linha é
  // a única resposta que existe, e um formulário de oito campos sem ela é uma
  // pilha de traços iguais.
  const [aceso, setAceso] = useState(false);

  /**
   * **O campo desenha o que a pessoa digitou, e o pai só manda quando discorda
   * de propósito.**
   *
   * `TextInput` controlado no Android repõe o texto nativo sempre que o `value`
   * que volta do JS difere do que está na caixa. Com o valor DERIVADO — o nome do
   * produto sai de `composed`, que junta linha, tipo e sabor quando ninguém
   * digitou — esse valor volta uma renderização atrasada, e o que foi digitado no
   * meio some.
   *
   * Medido no aparelho, mesma chamada e as mesmas dezessete letras: o campo do
   * nome da FICHA (`value={name}`, eco puro) ficou com "Picole de morango"
   * inteiro; o campo do nome do PRODUTO ficou com "Picole de moran", depois
   * "Picole de mor", depois "Picole ". Comprimento diferente a cada vez é
   * assinatura de corrida, não de limite — e o nome do produto é o que aparece em
   * toda tela, etiqueta e relatório dali em diante.
   *
   * A régua está em `./campo`, e ela não guarda nada: **com o dedo no campo, quem
   * manda é quem digita; fora dele, quem manda o pai.** A primeira versão tinha
   * memória — ignorava o que já tivesse subido — e engolia o formulário que se
   * esvazia depois de salvar.
   *
   * **A fronteira, dita por extenso:** o que o pai transforma a cada tecla — o
   * código de convite que vira maiúsculo em `app/account.tsx` — só aparece ao
   * sair do campo. Ali isso não muda nada, porque o teclado já entra em maiúscula
   * por `caixaAutomatica`; e nas quatro telas de valor derivado o que se ganha é
   * maior: digitar a hora do aviso mostra "9" enquanto se digita, em vez de
   * "09" com o cursor pulando.
   */
  const [texto, setTexto] = useState(value);
  const [anterior, setAnterior] = useState(value);

  // O ajuste acontece DURANTE a renderização e não num efeito. É o padrão que o
  // React documenta para "estado que depende de uma propriedade que mudou", e o
  // `react-hooks/set-state-in-effect` cobra: efeito que chama `setState` renderiza
  // a árvore duas vezes por tecla, o que num campo é exatamente o lugar onde não
  // se pode pagar renderização à toa — foi a lentidão da thread de JS que fez as
  // letras sumirem em primeiro lugar.
  if (value !== anterior) {
    setAnterior(value);
    if (aceitaDoPai(value, texto, aceso)) setTexto(value);
  }

  const mudou = (proximo: string) => {
    setTexto(proximo);
    onChangeText(proximo);
  };

  return (
    <View style={{ gap: space.xs }}>
      <Text style={[type.overline, { color: color.inkFaint }]}>{label.toUpperCase()}</Text>

      <View
        style={[
          styles.box,
          papel
            ? {
                backgroundColor: 'transparent',
                borderRadius: 0,
                borderWidth: 0,
                borderBottomWidth: aceso ? 1.5 : StyleSheet.hairlineWidth,
                borderBottomColor: aceso ? accent : color.line,
                paddingHorizontal: 0,
                gap: space.sm,
              }
            : {
                backgroundColor: color.surface,
                borderColor: aceso ? accent : color.line,
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                gap: space.sm,
              },
        ]}
      >
        <TextInput
          value={texto}
          onChangeText={mudou}
          placeholder={placeholder}
          placeholderTextColor={color.inkFaint}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          secureTextEntry={segredo}
          autoCapitalize={caixaAutomatica}
          autoCorrect={!segredo}
          /**
           * **O teclado não pode comer a dica.**
           *
           * Deitado — e o dono tem tablet —, o Android troca a tela inteira pelo
           * "editor extraído": uma caixa de texto no topo e branco embaixo. É o
           * padrão da plataforma e faz sentido para um campo de busca; aqui ele
           * apaga exatamente a metade que justifica este componente existir. O
           * docblock lá em cima diz qual: *"`hint` é onde a inteligência
           * aparece: o campo explica o que o sistema já deduziu do que foi
           * digitado"* — R$ 4,72 por quilo virando 0,472 centavo por grama,
           * "faltam 3 letras", "sobram 12.000 g de 12.000".
           *
           * Sem a dica o campo vira uma caixa vazia pedindo um número, que é o
           * tipo de formulário que este aplicativo existe para não ser. Eu vi
           * essa tela uma vez numa foto do emulador; o que decide não é a foto, é
           * que o custo dela é perder a conta enquanto se digita.
           */
          disableFullscreenUI
          textContentType={segredo ? 'password' : 'none'}
          accessibilityLabel={label}
          selectionColor={accent}
          onFocus={() => setAceso(true)}
          // Sair do campo é quando o pai volta a mandar: o que ele decidiu
          // enquanto o dedo estava aqui — a maiúscula do código de convite, um
          // campo esvaziado de fora — entra agora.
          onBlur={() => {
            setAceso(false);
            if (aceitaDoPai(value, texto, false)) setTexto(value);
          }}
          style={[
            type.body,
            styles.input,
            { color: color.ink, fontVariant: keyboardType === 'default' ? [] : ['tabular-nums'] },
            /**
             * O anel de foco do navegador sai, porque o campo desenha o dele.
             *
             * No aparelho isto não existe; na exportação web o `TextInput` vira
             * `<input>` e ganha o retângulo preto de quatro lados do Chrome. Com a
             * caixa do Orgânico em volta ele passava despercebido; no Papel, que não
             * tem caixa, ele É a caixa — e a primeira foto do formulário no Papel
             * saiu com um retângulo preto grosso em volta do campo aceso, que é
             * exatamente o vocabulário que o Papel recusa.
             *
             * Tirar o anel sem pôr nada no lugar seria quebrar o teclado de quem
             * navega por tabulação. Não é o caso: a régua acesa na cor da área diz a
             * mesma coisa, e diz nas duas caras. O `as never` é porque `outlineStyle`
             * é do react-native-web e não existe no tipo do React Native.
             */
            { outlineStyle: 'none' } as never,
          ]}
        />
        {suffix ? (
          <Text style={[type.secondary, { color: color.inkFaint }]}>{suffix}</Text>
        ) : null}
      </View>

      {hint ? (
        <Text style={[type.caption, { color: color.inkMuted }]} accessibilityLiveRegion="polite">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  input: { flex: 1, paddingVertical: 12 },
});

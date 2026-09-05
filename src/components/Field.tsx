import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
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
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  hint?: string;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
}) {
  const { color, radius, space, type, accent, skin } = useTheme();
  const papel = skin === 'papel';

  // Onde o dedo está. No Orgânico a caixa já responde por si; no Papel a linha é
  // a única resposta que existe, e um formulário de oito campos sem ela é uma
  // pilha de traços iguais.
  const [aceso, setAceso] = useState(false);

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
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={color.inkFaint}
          keyboardType={keyboardType}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          selectionColor={accent}
          onFocus={() => setAceso(true)}
          onBlur={() => setAceso(false)}
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

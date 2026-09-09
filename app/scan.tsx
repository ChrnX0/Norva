import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GlyphLabel } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Ler a etiqueta do lote com a câmera.
 *
 * **Não é uma tela de conferência: é um atalho para a que já existe.** Quem digita
 * os onze caracteres do código abre a etiqueta do lote; quem aponta a câmera abre a
 * MESMA etiqueta. Uma porta a mais, não um caminho paralelo — dois caminhos que
 * fazem a mesma coisa envelhecem em velocidades diferentes, e um deles vira mentira.
 *
 * **O que o quadrado carrega é o código, não o uuid** — decisão medida e registrada
 * em `src/domain/qr.ts`: onze caracteres cabem na menor grade que existe (21×21), e
 * cada quadradinho maior é o que decide a leitura a um braço de distância, de luva.
 * Então aqui não há tradução nenhuma a fazer: o que a câmera lê é o que a rota pede.
 *
 * **A permissão é pedida com a frase que diz para quê**, e a recusa não é beco: a
 * tela lembra que o código está impresso embaixo do quadrado e que digitá-lo segue
 * funcionando. Erro que impede tem de dizer o caminho.
 *
 * **Nada é fotografado.** A câmera fica ligada enquanto esta tela está aberta e o
 * único dado que sai dela é o texto do código.
 */
export default function Scan() {
  return (
    <AreaProvider area="apricot">
      <Leitor />
    </AreaProvider>
  );
}

function Leitor() {
  const { color, type, space, palette, traco } = useTheme();
  const { t } = useLocale();
  const words = t.app.lotLabel;
  const [permissao, pedirPermissao] = useCameraPermissions();
  /** Um código por abertura: a câmera dispara o mesmo quadrado dezenas de vezes. */
  const [lido, setLido] = useState(false);

  useEffect(() => {
    // Pede assim que a tela abre: quem tocou em "ler com a câmera" já disse que
    // quer. Um segundo toque para pedir o que a pessoa acabou de pedir é atrito.
    if (permissao && !permissao.granted && permissao.canAskAgain) void pedirPermissao();
  }, [permissao, pedirPermissao]);

  const fechar = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/production' as never);
  };

  if (!permissao || !permissao.granted) {
    const podePedir = permissao?.canAskAgain !== false;
    return (
      <View style={[styles.cheio, { backgroundColor: color.paper, padding: space.lg }]}>
        <Reveal index={0}>
        <Card
          hue={palette.apricot}
          icon={(c) => <GlyphLabel size={26} color={c} weight={traco} />}
          title={words.scanTitle}
        >
          <Text style={[type.body, { color: color.ink }]}>
            {podePedir ? words.scanAsk : words.scanDenied}
          </Text>
          {podePedir ? (
            <Button
              label={words.scanAllow}
              onPress={() => void pedirPermissao()}
              style={{ marginTop: space.md }}
            />
          ) : null}
          <Button
            label={words.scanClose}
            variant="ghost"
            onPress={fechar}
            style={{ marginTop: space.sm }}
          />
        </Card>
        </Reveal>
      </View>
    );
  }

  return (
    <View style={[styles.cheio, { backgroundColor: color.ink }]}>
      <CameraView
        style={styles.cheio}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (lido) return;
          const codigo = data.trim();
          if (!codigo) return;
          setLido(true);
          // A etiqueta já sabe responder por código que ela não acha, com a porta
          // de volta — conferir aqui seria dois lugares dizendo a mesma coisa, e
          // um deles envelhecendo. É a mesma razão escrita no campo de digitar.
          //
          // `lido` é o único fato que ela não tem como deduzir: quem chegou por
          // câmera pode ter lido um quadrado que não é etiqueta nenhuma, e aí a
          // resposta é "esse código não é de um lote desta fábrica" em vez de
          // "esse lote não está mais aqui" — que afirmaria um passado que não
          // houve. Ver o docblock do vazio em `app/lots/[id].tsx`.
          router.replace(`/lots/${codigo}?lido=1` as never);
        }}
      />
      {/* O véu existe para o texto ter fundo: sobre vídeo, qualquer cor de letra
          fica ilegível em metade dos quadros. Ele é a TINTA da casa com opacidade,
          e a letra é o PAPEL — o mesmo par de contraste que o resto do aplicativo
          usa, em vez de um branco escrito na mão que não sabe de pele nenhuma. */}
      <View style={[styles.rodape, { padding: space.lg, backgroundColor: color.ink + 'CC' }]}>
        <Text style={[type.body, { color: color.paper }]}>{words.scanTitle}</Text>
        <Text style={[type.caption, { color: color.paper }]}>{words.scanHint}</Text>
        <Button
          label={words.scanClose}
          variant="ghost"
          onPress={fechar}
          style={{ marginTop: space.md }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cheio: { flex: 1 },
  rodape: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

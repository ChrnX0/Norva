/**
 * A assinatura de ENTREGA, e o que ela está protegendo.
 *
 * **Medido em 13 de setembro, no artefato:** o APK release saía assinado com
 * `CN=Android Debug, OU=Android, O=Unknown`, SHA-256
 * `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Essa é a `debug.keystore`
 * que vem dentro de todo template do React Native — a chave privada dela está no computador de
 * quem quiser, e o `android/app/build.gradle` gerado tem `signingConfig signingConfigs.debug`
 * dentro do bloco `release`, com o aviso do próprio template ao lado.
 *
 * Duas consequências, e a segunda é a que importa:
 *
 *   1. a Play recusa o pacote — é a barreira óbvia, e ela só atrasa;
 *   2. **qualquer pessoa pode assinar um APK que o Android aceita como ATUALIZAÇÃO deste.**
 *      Mesmo pacote, mesma assinatura: o aparelho troca o aplicativo e o substituto herda o
 *      banco de dados. Num aplicativo cujo trabalho é guardar o livro-razão de uma fábrica,
 *      isso é a única fundação que vale menos que zero quando quebrada.
 *
 * ## Por que um plugin e não uma edição no `build.gradle`
 *
 * `android/` é saída do `expo prebuild` e está no `.gitignore`: editar o `build.gradle` gerado é
 * escrever numa folha que o próximo prebuild joga fora. O plugin é a forma que sobrevive, e é o
 * mesmo princípio que `app.json` já segue para o resto — a configuração mora no repositório, o
 * `android/` é derivado.
 *
 * ## Sem a chave, ele NÃO FAZ NADA — e isso é a decisão, não uma lacuna
 *
 * Gerar a chave de entrega e guardá-la é ato do dono, e é irreversível no pior sentido: perder a
 * `keystore` de um aplicativo publicado significa nunca mais poder atualizá-lo. Então este plugin
 * não cria chave nenhuma e não inventa senha: ele lê do ambiente e, sem ele, deixa o gradle como
 * está — o APK continua saindo com a chave de depuração, e `conferirAPK` DIZ isso em voz alta.
 *
 * O que o dono precisa pôr no ambiente, quando for a vez:
 *
 *   NORVA_KEYSTORE        caminho do arquivo .jks
 *   NORVA_KEYSTORE_SENHA  senha do arquivo
 *   NORVA_KEY_ALIAS       nome da chave dentro dele
 *   NORVA_KEY_SENHA       senha da chave
 *
 * Nada disso entra no repositório, e é por isso que são variáveis e não um arquivo versionado.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

/** O bloco que o template escreve, e que este plugin substitui quando há chave. */
const DEBUG_NO_RELEASE = 'signingConfig signingConfigs.debug';

module.exports = function assinaturaDeEntrega(config) {
  return withAppBuildGradle(config, (cfg) => {
    const keystore = process.env.NORVA_KEYSTORE;
    const senhaArquivo = process.env.NORVA_KEYSTORE_SENHA;
    const alias = process.env.NORVA_KEY_ALIAS;
    const senhaChave = process.env.NORVA_KEY_SENHA;

    // Sem as quatro, o plugin devolve o gradle intocado. Meia configuração seria pior que
    // nenhuma: o gradle falharia no fim de uma compilação de oito minutos.
    if (!keystore || !senhaArquivo || !alias || !senhaChave) return cfg;

    let gradle = cfg.modResults.contents;

    // A configuração nova entra ao lado da `debug`, dentro do mesmo `signingConfigs { … }`.
    const entrega = [
      '        entrega {',
      `            storeFile file('${keystore}')`,
      `            storePassword '${senhaArquivo}'`,
      `            keyAlias '${alias}'`,
      `            keyPassword '${senhaChave}'`,
      '        }',
    ].join('\n');

    gradle = gradle.replace('    signingConfigs {', `    signingConfigs {\n${entrega}`);

    /**
     * A troca é a ÚLTIMA ocorrência, porque `debug { … }` também tem uma.
     *
     * O `build.gradle` do template usa `signingConfig signingConfigs.debug` duas vezes: no bloco
     * `debug`, onde está certo, e no bloco `release`, onde é o defeito. Trocar a primeira
     * assinaria a build de depuração com a chave de entrega e deixaria a entrega com a de
     * depuração — exatamente invertido, e com a compilação saindo zero.
     */
    const ultima = gradle.lastIndexOf(DEBUG_NO_RELEASE);
    if (ultima === -1) {
      throw new Error(
        'o build.gradle gerado não tem `signingConfig signingConfigs.debug` no release — ' +
          'o template mudou, e este plugin precisa ser lido de novo antes de confiar nele',
      );
    }
    gradle =
      gradle.slice(0, ultima) +
      'signingConfig signingConfigs.entrega' +
      gradle.slice(ultima + DEBUG_NO_RELEASE.length);

    cfg.modResults.contents = gradle;
    return cfg;
  });
};

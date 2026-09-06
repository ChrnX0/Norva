/**
 * A cópia encostada no aparelho: onde o arquivo mora e como ele sai daqui.
 *
 * Separado do `backup.ts` de propósito, e pelo mesmo motivo que `configuracao.ts`
 * não está em `src/sync/`: o `backup.ts` é a regra, e regra se prova em
 * `node --test` contra um SQLite de verdade. Se ele importasse `expo-file-system`
 * a prova morreria, e a peça cujo prejuízo não tem conserto é a última que pode
 * ficar sem prova. Aqui embaixo mora só o que precisa do aparelho.
 *
 * **O `VACUUM INTO` quer caminho, não URI.** O `expo-file-system` fala
 * `file:///data/user/0/...` e o SQLite espera `/data/user/0/...`. É uma linha, e
 * é o tipo de linha que falha calada: com o `file://` na frente o SQLite cria um
 * arquivo com esse nome literal dentro do diretório de trabalho, e a cópia
 * "existe" onde ninguém procura.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { gravarCopia, lerCopia, restaurar, type CopiaLida } from './backup';

/** O `file://` fora, que é o que o SQLite entende. */
function caminhoDe(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

/**
 * O nome do arquivo carrega a data, para a pessoa achar a cópia certa numa lista
 * de conversa — o selo de dentro é para o aplicativo, o nome é para o olho.
 */
export function nomeDaCopia(agora: string): string {
  return `norva-${agora.slice(0, 10)}.db`;
}

/**
 * Onde a cópia é montada: o cache, e não os documentos.
 *
 * A cópia recém-feita é um arquivo de passagem — ela vai embora pela folha de
 * partilha. Deixá-la nos documentos dobraria o tamanho do aplicativo no aparelho
 * a cada cópia, e ninguém apaga o que não vê.
 */
function pastaDePassagem(): Directory {
  return Paths.cache;
}

/** Grava a cópia e devolve o que ela ficou sendo. */
export async function guardarCopia(agora: string): Promise<{
  uri: string;
  caminho: string;
  bytes: number;
  movimentos: number;
  feitoEm: string;
}> {
  const arquivo = new File(pastaDePassagem(), nomeDaCopia(agora));
  // `VACUUM INTO` recusa sobrescrever, e a recusa é a favor de quem chama — mas
  // duas cópias no mesmo dia são normais, e a primeira já foi partilhada.
  if (arquivo.exists) arquivo.delete();

  const feita = await gravarCopia(caminhoDe(arquivo.uri), agora);
  return {
    uri: arquivo.uri,
    caminho: feita.arquivo,
    bytes: feita.bytes,
    movimentos: feita.movimentos,
    feitoEm: feita.feitoEm,
  };
}

/**
 * Manda a cópia para onde a pessoa quiser.
 *
 * Devolve `false` quando o aparelho não sabe partilhar — a tela então diz onde o
 * arquivo ficou, em vez de fingir que mandou. Isso acontece na web, e a web é
 * onde o `e2e` roda.
 */
export async function partilharCopia(uri: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  // `octet-stream` e não `application/vnd.sqlite3`, e isto é achado do emulador.
  //
  // A folha de partilha abriu dizendo **"Nenhum app pode realizar esta ação"**. No
  // emulador nu não há mesmo nada instalado, mas o tipo declarado piora o caso em
  // aparelho de verdade: `vnd.sqlite3` é um mimetype que quase nenhum aplicativo
  // diz aceitar, e a folha só oferece quem declarou. WhatsApp, Drive e e-mail
  // aceitam `octet-stream` — que é o que um arquivo para guardar é.
  //
  // Nenhum teste pegaria isto: a chamada é a mesma, a promessa resolve igual, e o
  // que muda é a lista que o Android monta do outro lado. É o motivo de a foto
  // existir.
  await Sharing.shareAsync(uri, {
    mimeType: 'application/octet-stream',
    UTI: 'public.data',
    dialogTitle: 'NORVA',
  });
  return true;
}

/** O arquivo que a pessoa escolheu, ou `null` se ela desistiu. */
export async function escolherCopia(): Promise<{ caminho: string; lida: CopiaLida } | null> {
  const escolha = await DocumentPicker.getDocumentAsync({
    // O SQLite não tem tipo declarado em todo aparelho, e um filtro que esconde a
    // cópia é pior que nenhum filtro: a pessoa vê a pasta vazia e conclui que
    // perdeu o arquivo.
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (escolha.canceled || !escolha.assets?.[0]) return null;
  const caminho = caminhoDe(escolha.assets[0].uri);
  return { caminho, lida: await lerCopia(caminho) };
}

/** Traz a cópia de volta. Ou tudo, ou nada — a regra mora no `backup.ts`. */
export async function trazerDeVolta(caminho: string) {
  return restaurar(caminho);
}

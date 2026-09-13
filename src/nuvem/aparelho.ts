/**
 * O que a nuvem precisa do aparelho: navegador, cofre e servidor de atualização.
 *
 * Espelho de `copia.ts` para `backup.ts`: aqui embaixo mora tudo o que não roda em
 * `node --test`, e nada mais. A regra — a forma do pedido, quando renovar, se já é
 * hora de copiar, em que ordem as três coisas acontecem — está em `drive.ts` e
 * `sozinho.ts`, e é lá que ela é provada.
 *
 * **O que este arquivo NÃO consegue provar, dito em vez de fingido:** a tela de
 * consentimento do Google e a volta dela para o aplicativo. Isso é navegador de
 * verdade em aparelho de verdade, e continua E1 até o dono tocar. O resto do
 * caminho — trocar o código, renovar, montar o multipart, sobreviver a um 401 —
 * está provado contra um cliente HTTP de mentira, que é o que dá para provar aqui.
 */

import Constants from 'expo-constants';
import { empresaDaqui } from '@/data/empresa';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { countMovements } from '@/data/repository';
import { registrarCopia, ultimaCopia } from '@/data/backup';
import { guardarCopia, nomeDaCopia } from '@/data/copia';
import { drain } from '@/sync/engine';
import { transporte } from '@/sync/transporte';
import { contaAtual } from '@/sync/conta';
import {
  bytesParaUrl,
  copiasNoDrive,
  enderecoDaAutorizacao,
  paraUrl,
  enviarCopia,
  trocarCodigo,
  type Cofre,
  type CopiaNoDrive,
  type Http,
  type Tokens,
} from './drive';
import { descer } from '@/sync/descer';
import { umaRodada, type Tentativa } from './sozinho';

/**
 * A chave do cliente OAuth, que é do DONO e não do repositório.
 *
 * Fica em `app.json` (`extra.driveClientId`) porque cliente de aplicativo
 * instalado não tem segredo: o que autentica é o PKCE, e o identificador é
 * público por desenho — qualquer um abre o pacote e o lê, e isso não dá acesso a
 * nada. Vazio é estado legítimo: sem ele o backup automático PULA a cópia com
 * motivo `semDestino`, e nenhuma tela quebra.
 */
function clienteDoDrive(): string {
  const extra = Constants.expoConfig?.extra as { driveClientId?: string } | undefined;
  return (extra?.driveClientId ?? '').trim();
}

/**
 * Para onde o Google devolve a autorização.
 *
 * Configurável e não deduzido porque o Google exige formas diferentes conforme o
 * tipo de cliente OAuth, e adivinhar a forma errada é uma tela de erro em
 * português do Google no meio do fluxo. O valor certo para cada tipo está escrito
 * em `docs/roadmap.md`, junto do que o dono cria no console.
 */
function voltaDoDrive(): string {
  const extra = Constants.expoConfig?.extra as { driveRedirect?: string } | undefined;
  return (extra?.driveRedirect ?? 'norva://drive').trim();
}

/** O cofre do sistema: `SharedPreferences` cifrado no Android, keychain no iOS. */
const CHAVE_NO_COFRE = 'norva.drive.tokens';

export const cofreDoSistema: Cofre = {
  ler: async () => {
    const cru = await SecureStore.getItemAsync(CHAVE_NO_COFRE);
    if (!cru) return null;
    try {
      return JSON.parse(cru) as Tokens;
    } catch {
      // Cofre com lixo dentro é cofre vazio: melhor pedir autorização de novo que
      // levantar exceção no boot por causa de uma vírgula.
      return null;
    }
  },
  gravar: async (t) => {
    await SecureStore.setItemAsync(CHAVE_NO_COFRE, JSON.stringify(t));
  },
  apagar: async () => {
    await SecureStore.deleteItemAsync(CHAVE_NO_COFRE);
  },
};

/** O `fetch` do aparelho, na forma que `drive.ts` espera. */
const httpDoAparelho: Http = async (url, init) => {
  const r = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body as BodyInit | undefined,
  });
  return {
    status: r.status,
    json: async () => {
      try {
        return (await r.json()) as unknown;
      } catch {
        return {};
      }
    },
    text: async () => r.text(),
  };
};

/**
 * O par do PKCE: um segredo de uma vez, e o resumo dele que viaja.
 *
 * É isto que substitui o segredo do cliente. Aplicativo instalado não guarda
 * segredo — quem abre o pacote lê —, então o Google aceita o par: manda-se o
 * RESUMO na ida e o segredo na volta, e quem interceptar o código não tem o
 * segundo. 32 bytes porque o mínimo do padrão é 32 caracteres e o máximo 128.
 */
async function parDoPkce(): Promise<{ verificador: string; desafio: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const verificador = bytesParaUrl(bytes);
  const resumo = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verificador, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return { verificador, desafio: paraUrl(resumo) };
}

/**
 * Liga o Drive: abre o consentimento, espera a volta, guarda os tokens.
 *
 * Uma função e não quatro exportadas porque a tela tem UMA pergunta a fazer, e
 * cada peça solta exportada daqui seria uma peça sem chamador — o portão P1 desta
 * casa, que já pegou quatro casos.
 *
 * Devolve o que aconteceu em vez de levantar exceção no caminho normal: fechar o
 * navegador no meio é coisa que a pessoa faz de propósito, e não é erro.
 */
export async function ligarDrive(): Promise<'ligado' | 'desistiu' | 'semCliente'> {
  if (!clienteDoDrive()) return 'semCliente';
  const { verificador, desafio } = await parDoPkce();
  const volta = voltaDoDrive();
  const r = await WebBrowser.openAuthSessionAsync(
    enderecoDaAutorizacao({ clientId: clienteDoDrive(), redirect: volta, desafio }),
    volta,
  );
  if (r.type !== 'success') return 'desistiu';
  const codigo = new URL(r.url).searchParams.get('code');
  if (!codigo) return 'desistiu';
  await trocarCodigo(
    httpDoAparelho,
    cofreDoSistema,
    { clientId: clienteDoDrive(), redirect: volta, codigo, verificador },
    new Date().toISOString(),
  );
  return 'ligado';
}

/** O dono desligou o Drive: o token sai do cofre e o automático volta a pular. */
export async function esquecerDrive(): Promise<void> {
  await cofreDoSistema.apagar();
}

/** Existe destino configurado E autorizado? As duas coisas, porque falham diferente. */
export async function temDestino(): Promise<boolean> {
  if (!clienteDoDrive()) return false;
  return (await cofreDoSistema.ler()) !== null;
}

/** O que já subiu — para a tela dizer quando foi a última, não "ligado". */
export async function copiasGuardadas(): Promise<CopiaNoDrive[]> {
  return copiasNoDrive(httpDoAparelho, cofreDoSistema, clienteDoDrive(), new Date().toISOString());
}

/**
 * Faz a cópia e manda para o Drive.
 *
 * `arrayBuffer()` traz o arquivo inteiro para a memória, e isso é aceitável no
 * tamanho de hoje — a cópia de uma fábrica com seis mil movimentos pesa centenas
 * de kB. No dia em que ela passar de uns megabytes isto vira envio em pedaços
 * (`uploadType=resumable`), e a linha que avisa é esta.
 */
async function copiarParaODrive(): Promise<void> {
  const agora = new Date().toISOString();
  const feita = await guardarCopia(agora);
  const bytes = new Uint8Array(await new File(feita.uri).arrayBuffer());
  await enviarCopia(
    httpDoAparelho,
    cofreDoSistema,
    clienteDoDrive(),
    { nome: nomeDaCopia(agora), bytes },
    agora,
  );

  // **Só DEPOIS do envio, e é a mesma linha que o toque manual grava.**
  //
  // O caminho automático não anotava nada: `rodadaAutomatica` pergunta a
  // `ultimaCopia()` se está na hora, `horaDeCopiar(null, …)` responde sim quando
  // nunca houve, e o laço não fechava. O Drive recebia o razão inteiro a cada volta
  // ao primeiro plano — banda, bateria e cota de conta dele —, e a capa continuava
  // cobrando um backup que já tinha subido.
  //
  // Depois do envio porque só conta como cópia o que SAIU do aparelho: gravar antes
  // faria uma subida falhada parecer feita, que é a mentira mais cara das duas.
  await registrarCopia(feita);
}

/**
 * Procura atualização e baixa — sem aplicar.
 *
 * Aplicar é reiniciar o aplicativo, e reiniciar no meio de uma contagem na câmara
 * fria troca dado por novidade. Quem aplica é a próxima abertura, que é o
 * comportamento padrão do `expo-updates` depois de a atualização estar baixada.
 *
 * Em desenvolvimento não há canal nenhum, e `Updates.isEnabled` é falso: pedir
 * assim mesmo levanta exceção, e uma exceção no boot é tela branca.
 *
 * **E hoje ela não pergunta nada — decisão do dono, 10 de setembro.** `app.json` traz
 * `updates.enabled: false`, então `Updates.isEnabled` é falso e esta função devolve na
 * primeira linha sem tocar a rede. O canal `preview` não tem nada publicado, e uma
 * pergunta que não pode dar certo é bateria e dado gastos por nada. A URL e o canal ficam
 * declarados: religar é apagar uma linha, não redescobrir qual era o canal. A guarda com a
 * razão inteira está em `src/release.test.ts`.
 *
 * O que vem abaixo continua valendo para o dia em que ela voltar a perguntar.
 *
 * **E esta é a ÚNICA pergunta por abertura — cicatriz de 10 de setembro.** O
 * `app.json` trazia `checkAutomatically: "ON_LOAD"`, então o `expo-updates` nativo
 * perguntava sozinho antes de a primeira tela existir e esta função perguntava de
 * novo: duas viagens por abertura, as duas falhando enquanto o canal `preview`
 * estiver vazio, cada uma com aperto de mão TLS e rastro de pilha no log. No log do
 * aparelho foram 21 falhas numa janela só. Quem saiu foi a nativa, porque a falha
 * dela vira rastro e a daqui vira `Tentativa` — dado que a tela sabe contar.
 */
async function buscarAtualizacao(): Promise<boolean> {
  if (!Updates.isEnabled) return false;
  const achou = await Updates.checkForUpdateAsync();
  if (!achou.isAvailable) return false;
  await Updates.fetchUpdateAsync();
  return true;
}

/**
 * Desce o que o servidor já sabe. Sem conta, não há de onde descer.
 *
 * Espelho do `subirFila` logo abaixo, e as duas travas são as mesmas pelo mesmo motivo: sem
 * conta aberta não há a quem pedir, e sem servidor configurado não há para onde olhar.
 * Devolve zero em vez de jogar, porque "não há de onde descer" não é falha — é a fábrica
 * trabalhando offline, que é o estado normal deste aplicativo.
 */
async function baixarDoServidor(): Promise<number> {
  const quem = await contaAtual();
  if (!quem) return 0;
  const relatorio = await descer(
    transporte({ userId: quem.id, companyId: empresaDaqui() }),
    empresaDaqui(),
  );
  if (relatorio.erro) throw Object.assign(new Error('descida com erro'), { motivo: 'servidorRecusou' });
  return relatorio.linhas;
}

/** Sobe a fila com a conta que estiver aberta. Sem conta, não há para onde subir. */
async function subirFila(): Promise<number> {
  const quem = await contaAtual();
  if (!quem) return 0;
  const relatorio = await drain(transporte({ userId: quem.id, companyId: empresaDaqui() }));
  // `recusa` é "nem tentei" e `error` é "parou no meio" — a rodada precisa saber a diferença,
  // senão uma fila que nunca sobe parece uma fila vazia.
  //
  // **E o motivo vem do RELATÓRIO, não cravado aqui.** Esta linha dizia `'servidorRecusou'`
  // para toda parada, e o comentário acima dela dizia o mesmo em prosa — enquanto a parada
  // podia ser falta de sinal, uma linha que sumiu do aparelho ou uma tabela sem travessia. O
  // painel do dono contava "a fila falhou porque o servidor recusou" sobre coisa que o
  // servidor nunca viu.
  if (relatorio.recusa) throw Object.assign(new Error('fila recusada'), { motivo: relatorio.recusa });
  if (relatorio.error) {
    throw Object.assign(new Error('fila parou'), { motivo: relatorio.error.motivo });
  }
  return relatorio.sent;
}

/**
 * Uma rodada do automático, com as peças de verdade.
 *
 * Chamada no boot e na volta do aplicativo ao primeiro plano. Não levanta
 * exceção: quem chama é o `_layout`, e uma exceção ali é tela branca na mão de
 * quem só queria abrir o aplicativo.
 */
export async function rodadaAutomatica(): Promise<Tentativa[]> {
  return umaRodada(
    {
      subirFila,
      descer: baixarDoServidor,
      movimentos: countMovements,
      ultima: async () => {
        const u = await ultimaCopia();
        return u ? { feitoEm: u.feitoEm, movimentos: u.movimentos } : null;
      },
      temDestino,
      copiar: copiarParaODrive,
      buscarAtualizacao,
    },
    new Date().toISOString(),
  );
}

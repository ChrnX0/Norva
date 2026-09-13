/**
 * A cópia subindo para o Drive do dono — a REGRA, sem tocar no aparelho.
 *
 * Mesmo corte de `backup.ts` contra `copia.ts`, e pelo mesmo motivo: aqui mora o
 * que se prova em `node --test` — a forma do pedido, a troca do código, a hora de
 * renovar o token, o que fazer com um 401 — e em `src/nuvem/aparelho.ts` mora o
 * que precisa de navegador e de cofre do sistema. A peça cujo prejuízo não tem
 * conserto é a última que pode ficar sem prova, e perder o razão é esse prejuízo.
 *
 * **Por que `appDataFolder` e não uma pasta comum.** A pasta de dados do
 * aplicativo é invisível no Drive do dono: nenhum outro aplicativo a lista, e ele
 * não a apaga por engano limpando o Drive. O preço é justo — quem entra na conta
 * Google dele **lê a margem da fábrica**, porque o arquivo é o razão inteiro com
 * custo e fornecedor dentro. A tela diz isso em uma linha ANTES do primeiro
 * backup, nunca depois; é decisão escrita.
 *
 * **Backup não é sincronia.** Isto resolve *"o celular morreu"*. Não resolve
 * *"dois celulares escrevendo na mesma fábrica"* — isso é o servidor, com
 * `recorded_by` imposto por política. Então o Drive não adianta o servidor: ele
 * torna seguro o servidor demorar, que é a decisão do dono.
 *
 * **E o destino é configuração, não escolha nossa.** Nem todo dono tem conta
 * Google, e o aplicativo vai para as duas lojas — quem está no iPhone espera
 * iCloud. Este arquivo é o PRIMEIRO destino, atrás da costura de `destino.ts`,
 * e não o único possível.
 */

/** Onde o Google atende. Escrito aqui porque teste não fala com a internet. */
export const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TROCAR = 'https://oauth2.googleapis.com/token';
export const SUBIR = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
export const LISTAR =
  'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime%20desc';

/**
 * O único escopo pedido, e ele é o menor que resolve.
 *
 * `drive.appdata` alcança **apenas** a pasta privada deste aplicativo. Não lê um
 * arquivo do dono, não lista o Drive dele, não apaga nada. Pedir `drive` inteiro
 * seria pedir a chave da casa para guardar uma caixa no quintal — e a tela de
 * consentimento do Google diz, com essas palavras, o que está sendo pedido.
 */
export const ESCOPO = 'https://www.googleapis.com/auth/drive.appdata';

export type Tokens = {
  acesso: string;
  /**
   * O que sobrevive ao token de acesso — e sem ele o dono reautoriza toda hora.
   *
   * O Google só devolve isto com `access_type=offline`, e só na PRIMEIRA
   * autorização de cada conta: quem pedir de novo sem `prompt=consent` recebe um
   * token de acesso e nenhum de renovação, e o backup automático morre no dia
   * seguinte sem ninguém notar. É por isso que os dois parâmetros estão juntos em
   * `enderecoDaAutorizacao` e não são opcionais.
   */
  renovacao: string | null;
  /** Quando o de acesso vence, em ISO. Guardado, não calculado depois. */
  vencePor: string;
};

/** O mínimo que este módulo precisa de um cliente HTTP, para o teste poder ser um. */
export type Resposta = {
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};
export type Http = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string | Uint8Array },
) => Promise<Resposta>;

/** Onde os tokens ficam. No aparelho é o cofre do sistema; no teste, memória. */
export type Cofre = {
  ler(): Promise<Tokens | null>;
  gravar(t: Tokens): Promise<void>;
  apagar(): Promise<void>;
};

export type MotivoDaRecusa =
  /** Ninguém configurou o identificador do cliente OAuth: não há a quem pedir. */
  | 'semCliente'
  /** O dono nunca autorizou, ou a autorização foi revogada na conta dele. */
  | 'semAutorizacao'
  /** O Google recusou a renovação — senha trocada, acesso removido, conta fechada. */
  | 'renovacaoRecusada'
  /** O Google respondeu o que não se esperava. Guarda o corpo para a tela contar. */
  | 'respostaEstranha';

export class DriveRecusouError extends Error {
  constructor(
    readonly motivo: MotivoDaRecusa,
    readonly detalhe?: string,
  ) {
    super(`drive recusou: ${motivo}${detalhe ? ` (${detalhe})` : ''}`);
    this.name = 'DriveRecusouError';
  }
}

/**
 * O endereço da tela de consentimento.
 *
 * `access_type=offline` + `prompt=consent` porque o backup é AUTOMÁTICO: sem o
 * token de renovação ele funciona uma hora e morre calado. O `code_challenge` é
 * PKCE, e ele é o que substitui o segredo do cliente — segredo não se guarda em
 * aplicativo instalado, porque qualquer um abre o pacote e lê.
 */
export function enderecoDaAutorizacao(entrada: {
  clientId: string;
  redirect: string;
  desafio: string;
}): string {
  if (!entrada.clientId.trim()) throw new DriveRecusouError('semCliente');
  const p = new URLSearchParams({
    client_id: entrada.clientId,
    redirect_uri: entrada.redirect,
    response_type: 'code',
    scope: ESCOPO,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: entrada.desafio,
    code_challenge_method: 'S256',
  });
  return `${AUTORIZAR}?${p.toString()}`;
}

/** Base64 do jeito que URL aceita — o `+/=` do base64 comum quebra a query. */
export function paraUrl(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Bytes para base64url, à mão — e o "à mão" é a lição de hoje aplicada.
 *
 * A primeira versão usava `Buffer.from(bytes).toString('base64')`, e o typecheck
 * aceitou: `@types/node` está no projeto, então o tipo existe. `Buffer` **não é
 * global no React Native**. Seria exatamente o defeito da câmera de algumas horas
 * antes — tipo presente, implementação ausente na plataforma, e a falha só
 * aparecendo no aparelho, no primeiro toque em "ligar o Drive".
 *
 * `btoa` também não serve: existe em algumas versões e não em todas, e o que se
 * ganharia são três linhas menos. Isto não depende de ambiente nenhum.
 */
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesParaUrl(bytes: Uint8Array): string {
  let fora = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const c = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    fora += ALFABETO[a >> 2];
    fora += ALFABETO[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;
    fora += ALFABETO[((b & 0x0f) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;
    fora += ALFABETO[c & 0x3f];
  }
  return fora;
}

/** Corpo de formulário, que é o que o endpoint de token do Google aceita. */
function form(campos: Record<string, string>): { headers: Record<string, string>; body: string } {
  return {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos).toString(),
  };
}

type RespostaDeToken = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

function lerTokens(bruto: unknown, anterior: Tokens | null, agora: string): Tokens {
  const r = (bruto ?? {}) as RespostaDeToken;
  if (r.error) {
    // `invalid_grant` é o caso que importa distinguir: não é rede ruim nem bug
    // nosso — é o dono tendo removido o acesso, trocado a senha ou fechado a
    // conta. A tela precisa dizer "autorize de novo", não "tente mais tarde".
    throw new DriveRecusouError(
      r.error === 'invalid_grant' ? 'renovacaoRecusada' : 'respostaEstranha',
      r.error_description ?? r.error,
    );
  }
  if (!r.access_token) throw new DriveRecusouError('respostaEstranha', 'sem access_token');
  const segundos = typeof r.expires_in === 'number' ? r.expires_in : 3600;
  return {
    acesso: r.access_token,
    // A renovação vem UMA vez. Uma resposta sem ela não apaga a que já existe —
    // esse é o defeito que faz o backup automático morrer no segundo dia.
    renovacao: r.refresh_token ?? anterior?.renovacao ?? null,
    vencePor: new Date(new Date(agora).getTime() + segundos * 1000).toISOString(),
  };
}

/** Troca o código de uma volta do navegador pelos tokens, e guarda. */
export async function trocarCodigo(
  http: Http,
  cofre: Cofre,
  entrada: { clientId: string; redirect: string; codigo: string; verificador: string },
  agora: string,
): Promise<Tokens> {
  const { headers, body } = form({
    client_id: entrada.clientId,
    redirect_uri: entrada.redirect,
    grant_type: 'authorization_code',
    code: entrada.codigo,
    code_verifier: entrada.verificador,
  });
  const r = await http(TROCAR, { method: 'POST', headers, body });
  const tokens = lerTokens(await r.json(), await cofre.ler(), agora);
  await cofre.gravar(tokens);
  return tokens;
}

/**
 * Quanto antes do vencimento o token já conta como vencido.
 *
 * Sessenta segundos porque a subida leva tempo: um token que vence "agora" passa
 * a checagem, começa o envio e é recusado no meio dele. A folga é o que faz a
 * renovação acontecer ANTES em vez de virar um 401 no caminho.
 */
export const FOLGA_MS = 60_000;

/** O token de acesso válido — renovando se preciso. Nunca devolve vencido. */
export async function tokenValido(
  http: Http,
  cofre: Cofre,
  clientId: string,
  agora: string,
): Promise<string> {
  const guardado = await cofre.ler();
  if (!guardado) throw new DriveRecusouError('semAutorizacao');
  if (new Date(guardado.vencePor).getTime() - FOLGA_MS > new Date(agora).getTime()) {
    return guardado.acesso;
  }
  if (!guardado.renovacao) throw new DriveRecusouError('semAutorizacao', 'sem token de renovação');

  const { headers, body } = form({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: guardado.renovacao,
  });
  const r = await http(TROCAR, { method: 'POST', headers, body });
  const novos = lerTokens(await r.json(), guardado, agora);
  await cofre.gravar(novos);
  return novos.acesso;
}

/** A fronteira do corpo multipart. Fixa, e por isso conferível no teste. */
const LIMITE = 'norva-copia-limite';

/**
 * Monta o corpo multipart de um envio ao Drive.
 *
 * Separado do envio porque é a parte que erra calada: um `\r\n` a menos e o
 * Google aceita o pedido e grava um arquivo com o cabeçalho dentro. A forma é
 * conferida por teste em vez de por leitura.
 */
export function corpoMultipart(nome: string, bytes: Uint8Array): { tipo: string; corpo: Uint8Array } {
  const cabeca =
    `--${LIMITE}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify({ name: nome, parents: ['appDataFolder'] })}\r\n` +
    `--${LIMITE}\r\n` +
    // `octet-stream` e não `application/vnd.sqlite3`: o mimetype do SQLite fez o
    // Android não oferecer aplicativo nenhum na partilha, e a lição vale aqui —
    // tipo exótico é tipo que alguém do outro lado não conhece.
    'Content-Type: application/octet-stream\r\n\r\n';
  const pe = `\r\n--${LIMITE}--\r\n`;
  const enc = new TextEncoder();
  const a = enc.encode(cabeca);
  const z = enc.encode(pe);
  const corpo = new Uint8Array(a.length + bytes.length + z.length);
  corpo.set(a, 0);
  corpo.set(bytes, a.length);
  corpo.set(z, a.length + bytes.length);
  return { tipo: `multipart/related; boundary=${LIMITE}`, corpo };
}

/**
 * Sobe a cópia. Um 401 no meio vira uma renovação e UMA segunda tentativa.
 *
 * Uma e não um laço: se o token recém-renovado também é recusado, o problema não
 * é o token, e repetir só transforma um erro que a tela poderia explicar numa
 * espera que ela não explica.
 */
export async function enviarCopia(
  http: Http,
  cofre: Cofre,
  clientId: string,
  arquivo: { nome: string; bytes: Uint8Array },
  agora: string,
): Promise<{ id: string; bytes: number; enviadoEm: string }> {
  const { tipo, corpo } = corpoMultipart(arquivo.nome, arquivo.bytes);

  const tentar = async (token: string) =>
    http(SUBIR, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': tipo },
      body: corpo,
    });

  let r = await tentar(await tokenValido(http, cofre, clientId, agora));
  if (r.status === 401) {
    const guardado = await cofre.ler();
    if (guardado) await cofre.gravar({ ...guardado, vencePor: agora });
    r = await tentar(await tokenValido(http, cofre, clientId, agora));
  }
  if (r.status < 200 || r.status >= 300) {
    throw new DriveRecusouError('respostaEstranha', `${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  const corpoResposta = (await r.json()) as { id?: string };
  if (!corpoResposta.id) throw new DriveRecusouError('respostaEstranha', 'envio sem id');
  return { id: corpoResposta.id, bytes: arquivo.bytes.length, enviadoEm: agora };
}

export type CopiaNoDrive = { id: string; nome: string; bytes: number; modificadoEm: string };

/**
 * O que já está lá — para a tela dizer "a última subiu quinta" em vez de nada.
 *
 * Lei 3 desta casa: nenhum número aparece sozinho. "Backup ligado" não informa;
 * "a última subiu quinta, 4 de setembro, com 1.198 movimentos" informa.
 */
export async function copiasNoDrive(
  http: Http,
  cofre: Cofre,
  clientId: string,
  agora: string,
): Promise<CopiaNoDrive[]> {
  const token = await tokenValido(http, cofre, clientId, agora);
  const r = await http(LISTAR, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  if (r.status < 200 || r.status >= 300) {
    throw new DriveRecusouError('respostaEstranha', `${r.status}`);
  }
  const corpo = (await r.json()) as {
    files?: { id?: string; name?: string; size?: string; modifiedTime?: string }[];
  };
  return (corpo.files ?? [])
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: f.id as string,
      nome: f.name as string,
      // O Drive devolve tamanho como TEXTO. `Number(undefined)` é NaN, e NaN numa
      // tela vira "NaN kB" — a tela não tem como saber que o servidor omitiu.
      bytes: Number(f.size ?? 0) || 0,
      modificadoEm: f.modifiedTime ?? agora,
    }));
}

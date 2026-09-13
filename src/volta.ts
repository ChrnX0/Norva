/**
 * O que a TECLA VOLTAR DO APARELHO deve fazer — e por que ela não é o mesmo botão
 * que o `voltar()` do `src/nav.ts` atende.
 *
 * **A medida que abriu este arquivo, 11 de setembro.** O item 6 do roadmap estava
 * fechado com `voltar()` e uma ressalva escrita: a foto do foco na capa havia sido
 * tirada com a âncora de rota, não com esta versão. Repetindo a partida fria no
 * aparelho — `am force-stop`, `norva://losses`, `input keyevent 4` — o foco foi para
 * `com.android.fakesystemapp`: **o aplicativo saiu de novo**, com o `voltar()` no
 * lugar.
 *
 * E a causa não é o `canGoBack()` errar. É que **a tecla do aparelho nunca chega ao
 * `voltar()`**. O `voltar()` é o que a seta do cabeçalho chama; a tecla é atendida
 * pelo padrão da navegação, que numa pilha de um cartão encerra a Activity. Não
 * existia um `BackHandler` em lugar nenhum deste projeto.
 *
 * O agravante é o que isso ensina sobre a prova: a checagem de navegador CLICA na
 * seta, então ela ficou verde — verde no caminho que não estava quebrado. Duas
 * entradas para o mesmo gesto, e a suíte só conhecia uma.
 *
 * **Por que PROCEDÊNCIA e não uma lista de telas.** Três telas chegam com a pilha
 * vazia atrás, e só uma delas tem defeito:
 *
 * - a capa — sair está certo, é o que o Android manda na tela inicial;
 * - a grade de nomes (`app/who.tsx`, aberta por `replace` na abertura do aparelho
 *   compartilhado) — sair está certo, e ir para a capa está ERRADO por decisão
 *   escrita: o piso de capacidades deixa operar, então voltar dali seria um jeito de
 *   operar sem dizer quem é (`app/_layout.tsx`, `QuemEstaComOAparelho`);
 * - uma tela aberta por ligação de fora (o QR do engradado na doca, o aviso de
 *   validade) — aqui sair é o defeito.
 *
 * Estruturalmente as três são idênticas: primeira rota, nada atrás. O que as separa
 * é de onde veio a abertura, e é isso que este arquivo pergunta. Uma lista de nomes
 * de tela envelheceria no primeiro `replace` novo; a pergunta não.
 */

/** O estado que decide, e nada mais — para a decisão caber num teste. */
export type Volta = {
  /** `router.canGoBack()`: existe cartão atrás nesta pilha? */
  podeVoltar: boolean;
  /** A rota de agora JÁ é o destino para onde iríamos? */
  noDestino: boolean;
  /** Esta sessão do aplicativo foi aberta por uma ligação de fora? */
  porFora: boolean;
};

/**
 * `'padrao'` devolve a tecla para quem a atendia (voltar na pilha, ou sair do
 * aplicativo); `'destino'` pede para ir ao destino em vez de sair.
 */
export type Decisao = 'padrao' | 'destino';

export function decidirVolta({ podeVoltar, noDestino, porFora }: Volta): Decisao {
  // Há para onde voltar: o padrão sabe fazer isso melhor do que nós, inclusive a
  // animação e o gesto de arrastar da borda.
  if (podeVoltar) return 'padrao';
  // Já estamos no destino. Sem esta linha, quem entrou por fora e foi levado à capa
  // apertaria voltar para sempre sem sair — trocar "o app fecha sozinho" por "o app
  // não fecha nunca" é trocar de defeito, não consertar.
  if (noDestino) return 'padrao';
  // Entrada normal com a pilha vazia: a capa e a grade de nomes. Sair está certo nas
  // duas, e na grade ir para a capa está errado por decisão escrita.
  if (!porFora) return 'padrao';
  return 'destino';
}

/**
 * A ligação que abriu o aplicativo aponta para DENTRO?
 *
 * `Linking.getInitialURL()` devolve `null` quando alguém tocou no ícone — esse é o
 * caso normal e não é "por fora". Quando devolve algo, ainda pode ser a raiz
 * (`norva://`, `norva:///`, `https://…/`), que é a capa: abrir a capa por link não
 * cria tela nenhuma atrás, então sair continua certo.
 *
 * Na web isto nunca é consultado, porque a tecla do aparelho não existe lá — e é
 * justamente por isso que este conserto não repete o da âncora de rota, que
 * consertava o aparelho e quebrava a web (item 33 do roadmap).
 */
export function porFora(url: string | null | undefined): boolean {
  if (!url) return false;
  const esquemaEBarras = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/*/.exec(url);
  if (!esquemaEBarras) return false;
  const esquema = esquemaEBarras[1].toLowerCase();
  let resto = url.slice(esquemaEBarras[0].length);
  // **As duas formas não se leem com a mesma régua, e a primeira versão deste arquivo
  // tentou — o caso falso do teste é que pegou.** Em `norva://losses` o "losses" está
  // na posição de HOST, e num `https://` essa posição é o DOMÍNIO: lido igual,
  // `https://norva.app/` respondia "por fora" com a rota vazia, e a pessoa ficaria
  // presa na capa apertando voltar.
  if (esquema === 'http' || esquema === 'https') {
    const barra = resto.indexOf('/');
    resto = barra === -1 ? '' : resto.slice(barra + 1);
  }
  const rota = resto.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  return rota.length > 0;
}

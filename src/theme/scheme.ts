import type { ColorScheme } from './tokens';

/**
 * Claro, escuro, ou o que o aparelho disser.
 *
 * **A cicatriz.** Isto não existia: o `ThemeProvider` lia `useColorScheme()` e
 * ponto, então a luz da tela era do aparelho e de mais ninguém. O dono abriu o
 * Papel num celular em modo escuro e não teve como trocar — *"nao consigo mudar
 * o tema papel de dark para o light"*.
 *
 * O erro não foi de código, foi de fundação. Claro contra escuro é **preferência
 * de quem segura o aparelho**: o dono no escritório e o operador na câmara fria
 * podem querer coisas diferentes no mesmo dia, e nenhum dos dois está errado. O
 * `CLAUDE.md` diz o que fazer com isso — vira dado, com os dois caminhos
 * existindo, e a única pergunta legítima ao dono é qual é o **padrão**. Eu tinha
 * escolhido um lado e escrito a escolha num comentário da tela de Ajustes, que é
 * o oposto disso.
 *
 * **E a regra mora aqui, fora do componente, de propósito.** Ela nasceu dentro do
 * `ThemeProvider`, onde só o navegador podia prová-la — e a suíte de mutação roda
 * a unidade, não o navegador, então as duas mutações que protegem esta regra
 * teriam sobrevivido. Regra que só o e2e alcança é regra protegida por vinte
 * minutos de CI em vez de por milissegundos.
 */
export type SchemeChoice = 'claro' | 'escuro' | 'sistema';

/** As três, para quem precisa validar o que veio da gaveta. */
export const SCHEMES: SchemeChoice[] = ['claro', 'escuro', 'sistema'];

/**
 * O padrão é o **claro** — decisão do dono, 4 de setembro.
 *
 * Não é "o que o aparelho disser": um aplicativo de fábrica é aberto na mão de
 * quem está trabalhando, e a luz da fábrica é acesa. `sistema` continua
 * existindo para quem já configurou o celular para virar sozinho ao anoitecer —
 * é o terceiro caminho, não o único.
 */
export const SCHEME_PADRAO: SchemeChoice = 'claro';

/**
 * A escolha manda; o aparelho só responde quando ela é `sistema`.
 *
 * O tipo do aparelho é largo de propósito. O `ColorSchemeName` do React Native
 * não é só claro e escuro: ele também diz `'unspecified'`, e existe `null` num
 * navegador que não responde. Estreitar o parâmetro para os dois que eu esperava
 * obrigaria quem chama a mentir num `as` — e a mentira ficaria no lugar onde o
 * defeito apareceria. Aqui a regra é uma só e cabe numa frase: **só `dark`
 * escurece; qualquer outra resposta é o claro**, pelo mesmo motivo do padrão.
 */
export function resolveScheme(
  escolha: SchemeChoice,
  doAparelho: string | null | undefined,
): ColorScheme {
  if (escolha === 'claro') return 'light';
  if (escolha === 'escuro') return 'dark';
  return doAparelho === 'dark' ? 'dark' : 'light';
}

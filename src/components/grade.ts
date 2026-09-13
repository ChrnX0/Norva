/**
 * O que a grade PERGUNTA, separado de como ela é desenhada.
 *
 * Mora fora do `.tsx` porque decisão se testa e desenho se olha — é o mesmo corte que
 * `colunas.ts`, `campo.ts` e `cabecalho.ts` já fazem aqui. E o corte não é estético:
 * um teste de Node não consegue importar arquivo que puxa `react-native`, então lógica
 * dentro do componente é lógica sem guarda.
 */
export type NaGrade = {
  id: string;
  name: string;
  lineId: string | null;
  categoryId: string | null;
  typeId: string | null;
  flavorId: string | null;
};

/** O que a pessoa escolheu até agora, em cada degrau. */
export type Escolha = {
  lineId: string | null;
  categoryId: string | null;
  typeId: string | null;
};

/**
 * Os níveis que filtram, de cima para baixo. A variação não entra: ela é o que SOBRA,
 * e o que sobra é a lista final — perguntar por ela seria perguntar duas vezes.
 */
const NIVEIS = ['lineId', 'categoryId', 'typeId'] as const;

type Opcao = { id: string; name: string };

/**
 * Os degraus que a grade mostra para um conjunto de produtos.
 *
 * Devolve fato, não tela: quais produtos existem, quais categorias do produto escolhido,
 * quais tipos do que sobrou, e quais variações restam. Quem desenha é a tela; quem
 * decide "isto é pergunta ou não" é esta função, e por isso ela dá para testar sem
 * React — que é como este projeto trata geometria, custo e a grade.
 *
 * **A regra que faz quatro níveis não virarem quatro toques:** um nível com UMA opção ou
 * NENHUMA devolve lista vazia — ele não é pergunta, ele desaparece, e o filtro dele
 * passa reto. É o que torna verdadeira a decisão do dono de 11 de setembro (*"o produto
 * nao necessariamente requeira todas as subclasses"*), e é a resposta à objeção que a
 * migração `0018` levantou ao recusar um quarto nível: *"a tela com uma pergunta que não
 * se aplica"*. Sem isto, a categoria que a fábrica dele não usa custaria um toque por
 * registro, para sempre.
 *
 * **E o laço não é economia de linhas.** Com um bloco por nível, a opcionalidade era uma
 * frase repetida três vezes — e frase repetida diverge no dia em que alguém mexe em uma
 * só. Aqui ela é a estrutura: acrescentar um nível é acrescentar um nome em `NIVEIS`.
 */
export function degraus(
  produtos: NaGrade[],
  escolha: Escolha,
  nome: (id: string) => string,
): {
  linhas: Opcao[];
  categorias: Opcao[];
  tipos: Opcao[];
  restantes: NaGrade[];
} {
  let restantes = produtos;
  const mostrados: Record<string, Opcao[]> = {};

  for (const nivel of NIVEIS) {
    const ids = [...new Set(restantes.map((p) => p[nivel]).filter((x): x is string => !!x))];
    const opcoes = ids
      .map((id) => ({ id, name: nome(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Com uma opção só — ou nenhuma — a escolha não existe, e o que vale é a única que
    // há. Filtrar por ela mesmo assim importa: sem isso, um produto sem tipo ficaria na
    // lista de um tipo que ele não tem.
    const valendo = opcoes.length > 1 ? escolha[nivel] : (opcoes[0]?.id ?? null);
    if (valendo) restantes = restantes.filter((p) => p[nivel] === valendo);

    mostrados[nivel] = opcoes.length > 1 ? opcoes : [];
  }

  return {
    linhas: mostrados.lineId,
    categorias: mostrados.categoryId,
    tipos: mostrados.typeId,
    restantes,
  };
}

/**
 * Os níveis do MEIO, juntos, para o nome que a grade monta.
 *
 * Duas telas compõem esse nome — a que ensina (`app/catalog.tsx`) e a que grava
 * (`app/products/new.tsx`) — e o docblock de lá diz por que elas têm de compor igual:
 * *"se a tela que ensina compusesse o nome por uma regra diferente da tela que grava, o
 * ensino estaria mentindo"*. Duas cópias da mesma regra é exatamente o que este projeto
 * chama de dívida; aqui ela passa a existir uma vez.
 *
 * **E o que ela resolve de verdade é a explosão de frase de dicionário.** O nome tinha
 * três moldes (`composed`, `composedNoType`, `composedNoFlavor`) para dois níveis do
 * meio; com a categoria aprovada em 11 de setembro seriam oito, em três idiomas. Juntando
 * categoria e tipo num só `{{type}}`, os três moldes continuam servindo e a ordem da
 * cadeia é respeitada: Picolé **Leite 60 ml** de Morango.
 *
 * Vazio é resposta legítima e comum — a fábrica que não usa nível do meio nenhum devolve
 * string vazia, e quem chama cai no molde sem tipo.
 */
export function meioDaGrade(categoria: string | null, tipo: string | null): string {
  return [categoria, tipo]
    .map((x) => (x ?? '').trim())
    .filter((x) => x.length > 0)
    .join(' ');
}

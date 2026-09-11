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
  typeId: string | null;
  flavorId: string | null;
};

/** O que a pessoa escolheu até agora, em cada degrau. */
export type Escolha = { lineId: string | null; typeId: string | null };

/**
 * Os degraus que a grade mostra para um conjunto de produtos.
 *
 * Devolve fato, não tela: quais linhas existem, quais tipos da linha escolhida, e quais
 * produtos sobram. Quem desenha é a tela; quem decide "isto é pergunta ou não" é esta
 * função, e por isso ela dá para testar sem React — que é como este projeto trata
 * geometria, custo e agora a grade.
 */
export function degraus(
  produtos: NaGrade[],
  escolha: Escolha,
  nome: (id: string) => string,
): {
  linhas: { id: string; name: string }[];
  tipos: { id: string; name: string }[];
  restantes: NaGrade[];
} {
  const idsDeLinha = [...new Set(produtos.map((p) => p.lineId).filter((x): x is string => !!x))];
  const linhas = idsDeLinha.map((id) => ({ id, name: nome(id) })).sort((a, b) => a.name.localeCompare(b.name));

  // Com uma linha só — ou nenhuma — a escolha de linha não existe, e o filtro passa reto.
  const linhaValendo = linhas.length > 1 ? escolha.lineId : (linhas[0]?.id ?? null);
  const naLinha = linhaValendo ? produtos.filter((p) => p.lineId === linhaValendo) : produtos;

  const idsDeTipo = [...new Set(naLinha.map((p) => p.typeId).filter((x): x is string => !!x))];
  const tipos = idsDeTipo.map((id) => ({ id, name: nome(id) })).sort((a, b) => a.name.localeCompare(b.name));

  const tipoValendo = tipos.length > 1 ? escolha.typeId : (tipos[0]?.id ?? null);
  const restantes = tipoValendo ? naLinha.filter((p) => p.typeId === tipoValendo) : naLinha;

  return {
    linhas: linhas.length > 1 ? linhas : [],
    tipos: tipos.length > 1 ? tipos : [],
    restantes,
  };
}


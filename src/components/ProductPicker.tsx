import { Pressable, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { useTheme } from '@/theme/ThemeProvider';
import { degraus, type Escolha, type NaGrade } from './grade';

/**
 * Escolher o que foi produzido, ou o que vai sair — pela grade, e não por uma fileira.
 *
 * **O defeito que ela conserta.** O aplicativo obriga a montar uma árvore no cadastro —
 * linha, tipo, variação — e depois entregava tudo achatado na hora de usar: uma etiqueta
 * por produto, com o nome composto inteiro, numa fileira só. Na fábrica que o dono
 * descreveu isso é 3 tipos de picolé × N sabores + 2 volumes de pote × N sabores + o
 * Top, lado a lado. Ele resumiu em uma frase: *"o app está complicadíssimo de se usar"*.
 *
 * **E ela é a MESMA peça na produção e no transporte**, que é o que ele pediu depois:
 * *"a tela de transporte é [igual], a diferença é que na de produção entra e na de
 * transporte sai da câmara fria"*. Duas telas com o mesmo gesto se aprendem uma vez.
 *
 * **Nível com uma opção só não é pergunta.** É a regra que este aplicativo já aplica no
 * tipo do catálogo e na linha do produto, e aqui ela é o que impede a árvore de virar
 * cerimônia: quem tem um produto só continua vendo um toque, não três. E o exemplo
 * semeado — que não tem linha, tipo nem variação — cai justamente nesse caso, então a
 * grade some e sobra a fileira de sempre.
 */
/**
 * Só os degraus de cima da grade — a linha e o tipo —, sem a lista final.
 *
 * Existe porque a lista final NÃO é a mesma coisa nas duas telas, e fingir que é seria
 * coerência de fachada. Na produção o fim da grade é uma etiqueta por produto; no
 * transporte é uma linha com nome E quantidade, ordenada por uma regra de domínio que
 * põe o provável na frente. Trocar a segunda pela primeira perderia o número que a tela
 * existe para mostrar.
 *
 * Então o que se compartilha é o GESTO — linha, depois tipo — e cada tela termina do
 * jeito dela. É o pedido de coerência do dono lido no que ele significa: *"a diferença é
 * que na de produção entra e na de transporte sai"*. A diferença é o sentido, não o
 * caminho até ali.
 */
export function GradeFiltro({
  produtos,
  nome,
  escolha,
  onEscolha,
}: {
  produtos: NaGrade[];
  nome: (id: string) => string;
  escolha: Escolha;
  onEscolha: (proxima: Escolha) => void;
}) {
  const { space } = useTheme();
  const { linhas, tipos } = degraus(produtos, escolha, nome);
  if (linhas.length === 0 && tipos.length === 0) return null;
  return (
    <View style={{ gap: space.md }}>
      {linhas.length > 0
        ? fileiraDeEscolha(linhas, escolha.lineId, (id) => onEscolha({ lineId: id, typeId: null }), space)
        : null}
      {tipos.length > 0
        ? fileiraDeEscolha(tipos, escolha.typeId, (id) => onEscolha({ ...escolha, typeId: id }), space)
        : null}
    </View>
  );
}

/**
 * Uma fileira de escolha, com papel de rádio.
 *
 * `Pressable` cru e não `Touchable`: isto é um grupo de escolha, e o que o leitor de tela
 * precisa dizer é qual está valendo — não que dá para tocar.
 */
function fileiraDeEscolha(
  opcoes: { id: string; name: string }[],
  ativo: string | null,
  aoTocar: (id: string) => void,
  space: { sm: number },
) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {opcoes.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => aoTocar(o.id)}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.id === ativo }}
          accessibilityLabel={o.name}
        >
          <Chip signal={o.id === ativo ? 'ok' : 'neutral'} label={o.name} />
        </Pressable>
      ))}
    </View>
  );
}

export function ProductPicker({
  produtos,
  nome,
  escolha,
  onEscolha,
  escolhido,
  onEscolher,
}: {
  produtos: NaGrade[];
  /** Resolve o id de uma linha ou tipo para o nome que o dono cadastrou. */
  nome: (id: string) => string;
  escolha: Escolha;
  onEscolha: (proxima: Escolha) => void;
  escolhido: string | null;
  onEscolher: (productId: string) => void;
}) {
  const { space } = useTheme();
  const { restantes } = degraus(produtos, escolha, nome);

  return (
    <View style={{ gap: space.md }}>
      <GradeFiltro produtos={produtos} nome={nome} escolha={escolha} onEscolha={onEscolha} />
      {fileiraDeEscolha(
        restantes.map((p) => ({ id: p.id, name: p.name })),
        escolhido,
        onEscolher,
        space,
      )}
    </View>
  );
}

import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader, Inteiro } from '@/components/CollapsingHeader';
import {
  GlyphAssistant,
  GlyphOrder,
  GlyphProduction,
  GlyphPurchase,
  GlyphRecipe,
  GlyphSettings,
  GlyphStock,
  GlyphCustomer,
  GlyphStore,
  GlyphThermometer,
} from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { IconChevron } from '@/components/icons';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { useLocale } from '@/i18n/useLocale';
import { namesWhoRecorded } from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';
import type { Dictionary } from '@/i18n';

/**
 * As gavetas: o que se abre uma vez por mês, não uma vez por turno.
 *
 * Só três assuntos moram aqui — perguntar, cadastrar, ajustar — e cada um é um
 * cartão com o desenho dele. O que estava aqui antes era outra coisa: um crachá
 * de cor desenhado à mão em cada linha (dez pixels de `backgroundColor` com
 * `borderRadius`), um título de grupo escrito em caixa alta como parágrafo, e
 * `Pressable` cru no lugar do toque que afunda. Os pontinhos coloridos são o
 * defeito que a língua da casa nomeia: ícone em toda linha de lista vira papel
 * de parede e some — e sem legenda nenhuma, um ponto laranja não ensina que
 * laranja é produção. O tom agora é do CARTÃO, que é o assunto, e a linha volta
 * a ser o que ela é: um nome e o que se acha lá dentro.
 *
 * **E cada linha passou a dizer o que a tela dela responde.** Uma lista onde
 * toda linha é só um nome obriga a abrir uma por uma para descobrir qualquer
 * coisa; a frase que cada tela já usa na própria sobrelinha ("o que você
 * compra", "onde está o que você tem") serve exatamente para isso e já existe
 * nos três idiomas.
 *
 * O que continua FORA, e por motivo escrito: a tela desenhava três grupos, e o
 * terceiro — "Financeiro" e "Notas fiscais" — não tem nada atrás. Não existe
 * preço de venda neste aplicativo, nem conta, e o fiscal é um projeto .NET à
 * parte com certificado A1 e homologação na SEFAZ, do qual o plano diz que nada
 * depende. Gaveta que abre no vazio é pior que gaveta não desenhada.
 *
 * "Pessoas" faltava pelo mesmo motivo — `operator_id` era coluna sem tabela de
 * gente atrás — e **entrou em 6 de setembro**, quando a tabela passou a existir
 * (`supabase/migrations/0035`, que separa PESSOA de CONTA). A regra continua
 * valendo para o terceiro grupo, que segue fora.
 *
 * E um cartão aqui NÃO está na tela desenhada: "Pergunte". O assistente existe,
 * responde catorze perguntas offline, e as cinco pranchas nunca o desenharam —
 * deixá-lo inalcançável apagaria em silêncio uma coisa pronta, então ele fica em
 * cima, inteiro. Essa colocação é minha, e é a única coisa desta tela que o dono
 * não desenhou.
 */
export default function More() {
  return (
    <AreaProvider area="mist">
      <Drawers />
    </AreaProvider>
  );
}

/**
 * Uma porta: o nome dela, o que se acha do outro lado, e para onde vai.
 *
 * O `detail` não é enfeite — é o que faz a pessoa não precisar abrir para saber
 * se era ali. Ele vem da sobrelinha da própria tela de destino, que é a frase
 * que aquela tela já usa para se apresentar.
 */
type Porta = {
  key: keyof Dictionary['app']['more']['rows'];
  detail: string;
  route: string;
  /** O desenho do destino — o mesmo que a tela de lá usa no cabeçalho dela. */
  desenho: (c: string) => ReactNode;
  /** O tom do destino, do mapa de áreas. */
  tom: string;
};

function Drawers() {
  const { color, type, space, palette, traco } = useTheme();
  const { t } = useLocale();
  const router = useRouter();

  /**
   * A porta da grade de nomes só existe quando a empresa nomeia.
   *
   * Sem nomear ninguém, "quem está com o aparelho" é uma pergunta sem
   * consequência: o movimento nasce sem operador de qualquer jeito. Gaveta que
   * abre no vazio é pior que gaveta não desenhada — foi por isso que "Pessoas"
   * ficou fora desta tela até ter tabela atrás.
   */
  const { data: nomeia } = useQuery<boolean>(() => namesWhoRecorded());

  const glifo =
    (G: (p: { size?: number; color: string; weight?: number }) => ReactNode) => (c: string) =>
      G({ size: 22, color: c, weight: traco });

  const cadastros: Porta[] = [
    { key: 'inputs', detail: t.app.inputs.overline, route: '/inputs', desenho: glifo(GlyphStock), tom: palette.mint },
    { key: 'recipes', detail: t.app.recipes.overline, route: '/recipes', desenho: glifo(GlyphRecipe), tom: palette.apricot },
    { key: 'products', detail: t.app.products.overline, route: '/products', desenho: glifo(GlyphProduction), tom: palette.apricot },
    { key: 'places', detail: t.app.places.overline, route: '/places', desenho: glifo(GlyphStore), tom: palette.mint },
    // A porta que a prancha desenhava e o código recusava: ela entra agora
    // porque `people` existe, não porque coube na lista.
    { key: 'people', detail: t.app.people.overline, route: '/people', desenho: glifo(GlyphCustomer), tom: palette.sky },
  ];

  /**
   * O que acontece, e não o que se cadastra.
   *
   * As duas linhas estavam sob "CADASTROS", e o cabeçalho era falso justamente
   * sobre a porta mais consequente das seis: compra escreve no livro-razão
   * append-only — o próprio detalhe da linha diz "a nota move o custo", que é
   * movimento — e pedido é o livro de pedidos, com aprovar, entregar e cancelar.
   *
   * A palavra não é neutra para quem lê: cadastro se corrige editando, escrita
   * no livro-razão só se corrige por estorno. Prometer a classe de risco errada
   * é o mesmo defeito de um rótulo que discorda do número embaixo dele.
   */
  const chao: Porta[] = nomeia
    ? [
        {
          key: 'who',
          detail: t.app.who.overline,
          route: '/who',
          desenho: glifo(GlyphCustomer),
          tom: palette.mist,
        },
      ]
    : [];

  const lancamentos: Porta[] = [
    { key: 'orders', detail: t.app.orders.overline, route: '/orders', desenho: glifo(GlyphOrder), tom: palette.sage },
    { key: 'purchases', detail: t.app.purchase.overline, route: '/purchase', desenho: glifo(GlyphPurchase), tom: palette.sage },
  ];

  const ajustes: Porta[] = [
    // A porta que não depende de rede: o cartão do clima na capa só existe
    // quando há previsão guardada, e quem abre o app pela primeira vez dentro da
    // câmara fria não tem nenhuma. Sem esta linha, trocar a cidade dependeria de
    // ter internet — que é a única coisa que essa tela existe para consertar.
    // A conta fica AQUI e não na frente do aplicativo, e isso é decisão: a
    // fábrica offline na câmara fria é o caso normal, tudo funciona no aparelho,
    // e a conta existe para o que SAI daqui. Uma tela de senha entre a pessoa e a
    // caixa que ela está segurando seria o defeito mais caro deste produto.
    { key: 'account', detail: t.app.account.overline, route: '/account', desenho: glifo(GlyphCustomer), tom: palette.sky },
    { key: 'weather', detail: t.app.weather.change, route: '/weather', desenho: glifo(GlyphThermometer), tom: palette.sky },
    { key: 'settings', detail: t.app.settings.stored, route: '/settings', desenho: glifo(GlyphSettings), tom: palette.mist },
  ];

  /** O convite de abrir, dito uma vez, no pé do cartão que leva a algum lugar. */
  const abrir = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
      <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>{t.app.home.openScreen}</Text>
      <IconChevron size={16} color={color.inkFaint} />
    </View>
  );

  const portas = (porta: Porta) => (
    <ListRow
      key={porta.route}
      label={t.app.more.rows[porta.key]}
      detail={porta.detail}
      icon={porta.desenho}
      hue={porta.tom}
      onPress={() => router.push(porta.route as never)}
    />
  );

  return (
    // A única tela do aplicativo que não tinha linha de olho. Cabeçalho de vinte e
    // três telas tem os dois; esta tinha um, e a diferença aparece na folha de
    // contato: o título dela nasce numa altura diferente de todas as outras.
    // A gaveta é uma grade de grupos: cada um é uma caixa fechada com as portas
    // dele dentro, e dois grupos lado a lado continuam sendo dois grupos.
    <CollapsingHeader cena="mais" title={t.app.more.title} overline={t.app.more.overline} pares>
      {/* Cada seção carrega a cor da ÁREA que ela abre, e não um cinza só.
          O dono apontou a tela: *"esses ícones devem seguir o padrão de todo o
          tema. falta um pouco de cor aí"*. As quatro seções estavam pintadas com
          `mist` — o tom dos Ajustes —, então a página inteira lia como uma lista
          de configuração: perguntar, cadastrar e lançar tinham a mesma cor de
          "mexer nas opções". A regra da casa já existia e estava sendo quebrada
          aqui: cor de área é SIGNIFICADO, e quem vê verde sabe que é estoque
          antes de ler. Só a última seção fica no cinza, porque ela É os ajustes. */}

      {/* Perguntar vem antes de cadastrar: é a única coisa aqui que se usa sem
          saber o nome da tela que responde. */}
      <Inteiro>
      <Reveal index={0}>
        <Touchable
          onPress={() => router.push('/assistant')}
          accessibilityLabel={t.app.more.ask.label}
        >
          <Card
            hue={palette.sky}
            icon={(c) => <GlyphAssistant size={26} color={c} weight={traco} />}
            title={t.app.more.ask.label}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>{t.app.more.ask.hint}</Text>
            {abrir}
          </Card>
        </Touchable>
      </Reveal>
      </Inteiro>

      {/* Quem está com o aparelho, quando a empresa nomeia.
          Em cima porque é a primeira coisa que muda o que vai ser gravado, e o
          resto desta tela é o que se abre uma vez por mês. */}
      {chao.length > 0 ? (
        <Reveal index={1}>
          <Card hue={palette.mist} title={t.app.who.title}>
            {chao.map(portas)}
          </Card>
        </Reveal>
      ) : null}

      {/* O que a fábrica cadastra uma vez e usa todo dia. Nenhuma destas linhas
          tem número para mostrar aqui — a tela não consulta nada, e cartão que
          diz zero é alerta inventado. Então cada uma é linha, com a porta
          inteira preservada. */}
      <Reveal index={1}>
        {/* porta: mint — a gaveta abre insumos e lugares, e lugar é estoque */}
        <Card
          hue={palette.mint}
          title={t.app.more.groups.registers}
        >
          {cadastros.map(portas)}
        </Card>
      </Reveal>

      {/* O que se lança: o fato que já aconteceu e vai para o livro-razão. */}
      <Reveal index={2}>
        <Card
          hue={palette.sage}
          title={t.app.more.groups.entries}
        >
          {lancamentos.map(portas)}
        </Card>
      </Reveal>

      <Reveal index={3}>
        <Card
          hue={palette.mist}
          title={t.app.more.groups.settings}
        >
          {ajustes.map(portas)}
        </Card>
      </Reveal>
    </CollapsingHeader>
  );
}

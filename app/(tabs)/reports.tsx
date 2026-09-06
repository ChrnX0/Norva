import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphLoss, GlyphPrice, GlyphStock, GlyphStore } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { IconChevron } from '@/components/icons';
import { Reveal } from '@/components/Reveal';
import { Sparkline } from '@/components/Sparkline';
import { Touchable } from '@/components/Touchable';
import { nowIso } from '@/data/db';
import {
  canSeeMoney,
  lossesOn,
  recentRuns,
  runningOut,
  stockByPlace,
  type Run,
  type Running,
  type LossRow,
  type PlaceStock,
} from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import type { Cents } from '@/domain/money';
import { fill, formatMoney, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Os três resumos, e cada um já diz o titular dele.
 *
 * Isto era um índice: três linhas de texto com um chevron, uma tela inteira que
 * não respondia nenhuma das três perguntas da Lei da Inteligência — nem o que é
 * normal, nem o que mudou, nem qual é a próxima ação. Abrir para descobrir é
 * exatamente o que a lei chama de pedir o que o sistema já sabe.
 *
 * Agora cada assunto é um cartão com o número dele e a comparação ao lado, e o
 * toque abre o detalhe em vez de revelar o básico. O que não tem o que dizer não
 * aparece — uma fábrica sem perda nenhuma não precisa de um cartão dizendo zero.
 *
 * As três linhas que NÃO estão aqui continuam fora, e por motivo escrito:
 * margem não existe porque não há preço de venda em lugar nenhum deste
 * aplicativo; o Espelho da Loja é corte do dono de 1 de setembro, porque o
 * relatório mente com duas semanas de dado.
 */
export default function Reports() {
  return (
    <AreaProvider area="sand">
      <ReportIndex />
    </AreaProvider>
  );
}

type Loaded = {
  lugares: PlaceStock[];
  cobertura: Running[];
  corridas: Run[];
  mes: LossRow[];
  mesAnterior: LossRow[];
  /** Se quem está com o aparelho vê dinheiro. Junto, para não piscar cifra. */
  dinheiro: boolean;
};

function ReportIndex() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();

  const { data } = useQuery<Loaded>(async () => {
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const trintaDias = dayWindow(nowIso(), locale.timeZone, -29);
    const anterior = {
      de: dayWindow(nowIso(), locale.timeZone, -59),
      ate: dayWindow(nowIso(), locale.timeZone, -30),
    };
    const semanaAtras = dayWindow(nowIso(), locale.timeZone, -6);

    const [lugares, cobertura, corridas, mes, mesAnterior, dinheiro] = await Promise.all([
      stockByPlace(LOCAL_COMPANY_ID),
      runningOut(LOCAL_COMPANY_ID, semanaAtras.from, hoje.to, 7, Number.POSITIVE_INFINITY),
      recentRuns(LOCAL_COMPANY_ID, 8),
      lossesOn(LOCAL_COMPANY_ID, trintaDias.from, hoje.to),
      lossesOn(LOCAL_COMPANY_ID, anterior.de.from, anterior.ate.to),
      canSeeMoney(LOCAL_COMPANY_ID),
    ]);
    return { lugares, cobertura, corridas, mes, mesAnterior, dinheiro };
  });

  /**
   * Os três cartões desta tela são dinheiro, e sem ele a tela fica sem assunto.
   *
   * Os três já desaparecem sozinhos quando não há número — é a decisão escrita de
   * que "ainda sem número" continua tendo porta. O que o portão acrescenta é a
   * frase: sem ela, a mesma tela vazia diria "esta fábrica não tem estoque, não
   * custeia nada e não perdeu nada", que é notícia falsa sobre a fábrica em vez de
   * um fato sobre quem está olhando.
   */
  const dinheiro = data?.dinheiro === true;
  const parado = (data?.lugares ?? []).reduce((n, l) => n + (l.valueCents ?? 0), 0) as Cents;
  const comCusto = (data?.corridas ?? []).filter((r) => r.unitCostRate !== null);
  const perdido = (data?.mes ?? []).reduce((n, l) => n + (l.valueCents ?? 0), 0) as Cents;
  const perdidoAntes = (data?.mesAnterior ?? []).reduce(
    (n, l) => n + (l.valueCents ?? 0),
    0,
  ) as Cents;

  /** O que ainda não tem número, para continuar tendo porta. */
  const faltando = (
    [
      { chave: 'stock' as const, rota: '/places', temDado: parado > 0, desenho: (c: string) => <GlyphStock size={22} color={c} weight={traco} /> },
      { chave: 'cost' as const, rota: '/recipes', temDado: comCusto.length > 0, desenho: (c: string) => <GlyphPrice size={22} color={c} weight={traco} /> },
      { chave: 'losses' as const, rota: '/losses', temDado: perdido > 0, desenho: (c: string) => <GlyphLoss size={22} color={c} weight={traco} /> },
      /**
       * O Espelho entra como PORTA e nunca como cartão de resumo.
       *
       * `temDado: false` é literal aqui e não um descuido: o resumo do Espelho é uma
       * fração por item por loja, e escolher UMA para o índice seria a tela decidindo
       * qual loja importa — a mesma decisão que a lista inteira existe para não tomar.
       * Então ele não vira cartão em nenhum estado, e a linha leva a todas.
       */
      { chave: 'mirror' as const, rota: '/mirror', temDado: false, desenho: (c: string) => <GlyphStore size={22} color={c} weight={traco} /> },
    ] as const
    /**
     * **Porta não é número, e filtrar por dinheiro aqui apagava a única porta.**
     *
     * Eu tinha escrito `&& dinheiro` com um argumento que parecia certo — sem
     * custo os três não estão "sem número", estão fora de vista. A refutação
     * mediu o que isso custava: `/losses` só é alcançável por aqui (`grep -rn
     * "/losses"` devolve duas linhas, as duas neste arquivo; a peça da capa não
     * navega). Então quem registra a perda — e `record_loss` é capacidade do
     * operador — deixava de conseguir olhar as perdas que registrou, na mesma
     * mudança em que a tela de perdas aprendeu a falar em contagem para ela.
     *
     * O motivo de a lista existir está escrito duas linhas abaixo, e vale igual:
     * esconder a linha deixa as telas sem porta.
     */
  ).filter((r) => !r.temDado);

  /** O rodapé de todo cartão: o convite de abrir, dito uma vez só. */
  const abrir = (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }]}>
      <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>{t.app.home.openScreen}</Text>
      <IconChevron size={16} color={color.inkFaint} />
    </View>
  );

  return (
    // Três cartões irmãos — estoque, custo, perdas —, do mesmo tamanho e da
    // mesma importância: é a definição da tela que pareia.
    <CollapsingHeader title={t.app.reports.title} overline={t.app.reports.subtitle} pares>
      {/* Estoque: o dinheiro que está parado, e por quantos dias ele dura. Duas
          grandezas diferentes do mesmo fato, que é o que faz o número decidir
          alguma coisa em vez de só existir. */}
      {parado > 0 ? (
        <Reveal index={0}>
          <Touchable onPress={() => router.push('/places')} accessibilityLabel={t.app.reports.rows.stock.label}>
            <Card
              hue={palette.mint}
              icon={(c) => <GlyphStock size={26} color={c} weight={traco} />}
              title={t.app.reports.rows.stock.label}
            >
              <Text style={[type.figure, { color: color.ink }]}>{formatMoney(parado, locale)}</Text>
              <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
                {plural((data?.lugares ?? []).length, t.app.places.placeCount)}
                {(data?.cobertura ?? []).length > 0
                  ? ` · ${fill(t.app.home.coverDays, {
                      days: plural(
                        Math.floor(data!.cobertura[0].daysLeft),
                        t.app.home.dayCount,
                      ),
                    })}`
                  : ''}
              </Text>
              {abrir}
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* Custo: o que a última corrida congelou, com a linha das anteriores.
          Sozinho ele não decide nada — quem produz sabe de cabeça a ordem de
          grandeza, e o que interessa é se subiu. */}
      {comCusto.length > 0 ? (
        <Reveal index={1}>
          <Touchable onPress={() => router.push('/recipes')} accessibilityLabel={t.app.reports.rows.cost.label}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}
              title={t.app.reports.rows.cost.label}
            >
              <Text style={[type.figure, { color: color.ink }]}>
                {formatMoney(Math.round(comCusto[0]!.unitCostRate!) as Cents, locale)}
              </Text>
              <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
                {comCusto[0]!.name}
              </Text>
              {comCusto.length > 1 ? (
                <Sparkline
                  values={[...comCusto].reverse().map((r) => r.unitCostRate ?? 0)}
                  hue={palette.sky}
                />
              ) : null}
              {abrir}
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* Perdas: só existe quando houve. Uma fábrica que não perdeu nada este
          mês não precisa de um cartão dizendo zero — alerta inventado ensina a
          ignorar alerta, e um zero em vermelho é um alerta inventado. */}
      {perdido > 0 ? (
        <Reveal index={2}>
          <Touchable onPress={() => router.push('/losses')} accessibilityLabel={t.app.reports.rows.losses.label}>
            <Card
              hue={color.danger}
              icon={(c) => <GlyphLoss size={26} color={c} weight={traco} />}
              title={t.app.reports.rows.losses.label}
            >
              <Text style={[type.figure, { color: color.ink }]}>{formatMoney(perdido, locale)}</Text>
              <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
                {perdidoAntes > 0
                  ? fill(t.app.home.lossVsBefore, { amount: formatMoney(perdidoAntes, locale) })
                  : t.app.home.lossFirst}
              </Text>
              {abrir}
            </Card>
          </Touchable>
        </Reveal>
      ) : null}

      {/* E o que ainda não tem número continua alcançável.
          Peça sem dado não vira cartão — mas sumir não é a resposta: este
          índice também é o CAMINHO para o custo e para as perdas, e esconder a
          linha deixou as duas telas sem porta na primeira instalação. Cartão
          para o que tem o que dizer, linha para o resto. */}
      {faltando.length > 0 ? (
        <Reveal index={3}>
          <Card>
            {faltando.map(({ chave, rota }) => (
              <ListRow
                key={rota}
                label={t.app.reports.rows[chave].label}
                detail={t.app.reports.rows[chave].detail}
                onPress={() => router.push(rota as never)}
              />
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* Os três cartões desta tela são dinheiro. Sem ele a tela ficaria em
          branco, e tela em branco é a pior das respostas: parece defeito. Um
          cartão dizendo onde o número mora responde a pergunta que a pessoa
          traz ao abrir aqui, e o caminho de volta fica dito por extenso para
          quem é o dono e emprestou o aparelho. */}
      {dinheiro ? null : (
        <Reveal index={4}>
          {/* Sem título: a foto mostrou "Custo" no cartão logo abaixo da porta
              chamada "Custo", e a repetição faz o cartão parecer o resumo daquela
              linha em vez de a explicação da tela. É a mesma regra que a tela de
              perdas registrou quando três cartões repetiam "Perdas". */}
          <Card hue={palette.sky} icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.inkMuted }]}>{t.common.moneyHidden}</Text>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {t.common.moneyHiddenWay}
            </Text>
          </Card>
        </Reveal>
      )}
    </CollapsingHeader>
  );
}

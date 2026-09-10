import { useRouter } from 'expo-router';
import { avisoDeFalha } from '@/i18n/falha';
import { ERROS } from '@/data/erros';
import { StyleSheet, Text, View } from 'react-native';
import { CountUp } from '@/components/CountUp';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { GlyphBox, GlyphStore, GlyphVehicle } from '@/components/Glyph';
import { IconChevron } from '@/components/icons';
import { Reveal } from '@/components/Reveal';
import { Touchable } from '@/components/Touchable';
import { nowIso } from '@/data/db';
import { recordCheck, shipmentsOn, type Shipment } from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { unidadeDaqui } from '@/data/unidade';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import { boxesOf } from '@/domain/units';
import { fill, formatPacked, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Where today's load went, and whether anybody opened it.
 *
 * The screen is read from the positive legs of today's transfers - nothing here
 * is typed, and nothing is summed across items that do not share a unit.
 *
 * **O desenho anterior era uma lista de parágrafos**, e foi destruído em vez de
 * embrulhado: retângulo cinza por destino, ícone fino de barra de abas usado
 * como crachá, nenhuma cor de assunto, nenhuma entrada em cena e o número do dia
 * dito numa linha solta acima dos cartões. Agora o dia é um cartão com o número
 * grande e a comparação embaixo, e cada destino é um assunto com o tom dele.
 *
 * O tom é o que separa os dois estados sem precisar de leitura: destino
 * conferido é lilás, o tom do transporte em todo o aplicativo; destino cuja
 * caixa ninguém abriu ainda é âmbar. E a frase continua sendo a ausência de um
 * fato, nunca uma acusação - ninguém está atrasado, ninguém errou, a caixa
 * simplesmente não foi aberta. Tocar registra o que a loja contou.
 *
 * A destination reads as checked only when EVERY shipment that landed there
 * today was checked. A store that received the morning load and the afternoon
 * one has opened one box; saying "conferido" would be telling the owner
 * something nobody verified.
 */
export default function Transport() {
  return (
    <AreaProvider area="lilac">
      <WhereItWent />
    </AreaProvider>
  );
}

function WhereItWent() {
  const { color, type, space, palette, traco } = useTheme();
  const { locale, t } = useLocale();
  const router = useRouter();

  const confirm = useConfirm();

  const { data, loading, error, refresh } = useQuery<{ hoje: Shipment[]; ontem: Shipment[] }>(async () => {
    const today = dayWindow(nowIso(), locale.timeZone);
    const yesterday = dayWindow(nowIso(), locale.timeZone, -1);
    const [hoje, ontem] = await Promise.all([
      shipmentsOn(empresaDaqui(), today.from, today.to, { unidade: unidadeDaqui() }),
      // Ontem entra pela Lei 3: "3 destinos" não é muito nem pouco até estar ao
      // lado do que foi ontem. Esta aba dizia o número sozinho.
      shipmentsOn(empresaDaqui(), yesterday.from, yesterday.to, { unidade: unidadeDaqui() }),
    ]);
    return { hoje, ontem };
  });

  const places = data?.hoje ?? [];
  const ontem = new Set((data?.ontem ?? []).map((p) => p.locationId)).size;

  // O resumo do dia conta DESTINOS, não caixas.
  //
  // A prancha escreve "18 caixas em 3 destinos", e a metade das caixas é o que
  // este app não pode dizer: açúcar e polpa não têm camada de caixa, então
  // somar tudo numa unidade só inventaria um número que ninguém consegue contar
  // na doca. Destino é contável sempre, e é o que a linha diz.
  /**
   * A quantidade dita na unidade que a pessoa manuseia.
   *
   * O número aparecia cru — "6.000 açúcar cristal" na confirmação e "6.000" na
   * linha do destino — numa lista que mistura grandezas de propósito: seis
   * quilos de açúcar e seis mil picolés escreviam o mesmo "6.000". O comentário
   * já dizia "cada item na unidade que ele tem", e a unidade não era impressa
   * em lugar nenhum.
   *
   * A escolha é pela camada de embalagem, não pelo tipo do item: quem tem caixa
   * fala em caixas, quem não tem fala na unidade de uso. `formatPacked` sozinho
   * chamaria grama de "unidade", porque a faixa `unit` é a única que o item
   * solto tem — é o mesmo defeito que a capa cometia.
   */
  const naUnidade = (item: Shipment['items'][number]) =>
    boxesOf(item.baseUnits, item.packaging)
      ? formatPacked(item.baseUnits, item.packaging, t.units, locale)
      : `${formatQuantity(item.baseUnits, locale)} ${item.baseUnit}`;

  /**
   * Conferir é dizer que a caixa foi aberta e o que havia dentro.
   *
   * A confirmação spelling out what will be written, como toda escrita deste
   * app: o padrão é "chegou tudo", porque é o que acontece na maioria das
   * vezes e porque um formulário de contagem por item, no celular, na doca,
   * ninguém preenche. Quem achou diferença corrige na tela do lugar, que já
   * sabe registrar contagem cega.
   */
  const ask = async (place: Shipment) => {
    const said = place.items
      // **O nome que o dono digitou não se dobra.** Minusculizar palavra do
      // DICIONÁRIO para caber no meio de uma frase é certo — "Derreteu" vira
      // "derreteu". Fazer o mesmo com o nome de um item é decidir sobre uma
      // palavra que não é nossa: "Picole" virava "picole", e uma marca como
      // "Açaí Premium" viraria "açaí premium" na confirmação de um ato
      // irreversível. Nome próprio mantém a maiúscula no meio da frase.
      .map((i) => `${naUnidade(i)} ${i.name}`)
      .join(' · ');

    const yes = await confirm({
      title: fill(t.app.transport.checkTitle, { place: place.locationName }),
      message: said,
      confirmLabel: t.app.transport.check,
    });
    if (!yes) return;

    // Sem lista de contagem: "chegou tudo" é a resposta, e cada remessa é
    // conferida contra as próprias pernas. Mandar a soma do destino para cada
    // remessa contaria a mesma mercadoria duas vezes quando a loja recebeu duas
    // cargas no mesmo dia.
    // Conferir pede `check_receipt`, e a recusa chega aqui — sem `catch` o toque
    // não conferia nada e nada aparecia. Para na primeira: conferir metade das
    // remessas e dizer que deu certo é pior que não conferir nenhuma.
    try {
      // As PENDENTES, e não as do dia: conferir duas vezes é recusado desde 9 de
      // setembro, e uma loja que recebeu duas cargas com a primeira já conferida
      // ficaria com a segunda presa atrás da recusa da primeira.
      for (const groupId of place.pendentes) {
        await recordCheck(empresaDaqui(), { groupId });
      }
    } catch (e) {
      const aviso = avisoDeFalha(e, t, ERROS);
      await confirm({
        title: aviso.title,
        message: aviso.message,
        acknowledge: true,
        confirmLabel: t.app.confirm.understood,
      });
      return;
    }
    refresh();
  };

  const summary = plural(places.length, t.app.transport.destinations, formatQuantity(places.length, locale));

  /** O convite de abrir, dito uma vez só - e só onde há o que abrir. */
  const abrir = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.sm }}>
      <Text style={[type.caption, { color: color.inkFaint, flex: 1 }]}>{t.app.home.openScreen}</Text>
      <IconChevron size={16} color={color.inkFaint} />
    </View>
  );

  // A posição do botão na cascata, para a entrada nunca abrir buraco: um passo
  // pelo cartão do dia mais um por destino, ou o único passo do convite quando
  // nada saiu. Carregando, ele é o primeiro - não há cartão nenhum antes dele.
  const passos = places.length > 0 ? places.length + 1 : loading ? 0 : 1;

  return (
    <CollapsingHeader
      cena="transporte"
      title={t.app.transport.title}
      // Sem resumo ainda, a linha de olho diz o que a tela é — nunca some.
      // Cabeçalho que aparece e desaparece conforme o dado faz a página pular, e
      // a Lei diz que nenhum campo nasce vazio: um vazio aqui é um campo vazio
      // do tamanho de uma linha.
      overline={places.length > 0 ? fill(t.app.transport.today, { summary }) : t.app.transport.subtitle}
      erro={error}
      denovo={refresh}
    >
      {/* O dia, e a Lei 3 no mesmo cartão: o número grande com a contagem por
          extenso embaixo e ontem embaixo dela. A comparação NÃO cabe no overline
          - ele é maiúsculo e truncado em uma linha, então num celular estreito a
          metade que importa seria cortada. */}
      {places.length > 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.lilac}
            icon={(c) => <GlyphVehicle size={26} color={c} weight={traco} />}
            title={t.app.transport.dayTitle}
          >
            <CountUp
              value={places.length}
              format={(v) => formatQuantity(v, locale)}
              style={{ ...type.figure, color: color.ink }}
            />
            <Text style={[type.caption, { color: color.inkMuted }]} numberOfLines={2}>
              {summary}
            </Text>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]} numberOfLines={2}>
              {ontem === 0
                ? t.app.transport.noYesterday
                : fill(t.app.transport.vsYesterday, {
                    count: plural(ontem, t.app.transport.destinations, formatQuantity(ontem, locale)),
                  })}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {/* Um destino é um assunto: crachá, tom e nome no cabeçalho do cartão. O
          que ele recebeu são linhas, e linha não leva ícone - ícone em toda
          linha vira papel de parede e some. */}
      {places.map((place, i) => (
        <Reveal key={place.locationId} index={i + 1}>
          <Touchable
            // Sem rótulo: o cartão já diz o lugar, o que chegou e se foi conferido.
            onPress={() => (place.checked ? router.push('/places') : void ask(place))}
          >
            <Card
              hue={place.checked ? palette.lilac : color.warning}
              icon={(c) => <GlyphStore size={26} color={c} weight={traco} />}
              title={place.locationName}
            >
              {/* Quem levou, quando não foi o carro da fábrica. É o LEITOR que
                  justifica a coluna existir: `suppliers` está no esquema desde a
                  fundação sem ninguém que a leia, e foi por isso que `carrier_id`
                  não entrou antes desta linha. Ausente não vira frase — "carro da
                  fábrica" em toda entrega é papel de parede. */}
              {place.carrierName ? (
                <Text style={[type.caption, { color: color.inkMuted, marginBottom: space.xs }]}>
                  {fill(t.app.transport.carrierTook, { carrier: place.carrierName })}
                </Text>
              ) : null}
              {/* Orienta, não fiscaliza: a frase fala do que chegou, nunca de
                  quem deveria ter conferido. E o cartão inteiro é o toque que
                  registra a conferência. */}
              <Chip
                signal={place.checked ? 'ok' : 'warning'}
                label={
                  place.checked
                    ? t.signals.checked
                    : fill(t.app.transport.notChecked, { place: place.locationName })
                }
              />

              {/* Cada item na unidade que ele tem. Nada é convertido para caber
                  numa coluna só. */}
              <View style={{ marginTop: space.sm, gap: space.xs }}>
                {place.items.map((item) => (
                  // Com a unidade dita, a coluna da direita ficou longa — "1
                  // engradado · 1 caixa · 14 unidades" — e o nome, que é
                  // `flex: 1`, encostava nela. Espaço entre os dois, como toda
                  // linha de duas colunas deste aplicativo.
                  <View key={item.itemId} style={[styles.row, styles.quebra, { gap: space.md }]}>
                    {/* O nome NÃO encolhe até sumir — ele desce a coluna do número.
                        Na foto de 412 dp isto saía "Picolé de choc…" ao lado de "1
                        engradado · 1 caixa · 48 unidades": o nome, que é `flex: 1`,
                        cedia tudo, e quem lê ficava com três letras do produto e a
                        conta inteira. É a mesma cegueira do "UNIDADES · HOJ" da capa.
                        Aqui a linha reflui em vez de escalar, que é a regra da casa:
                        cabendo, uma linha; não cabendo, o número desce inteiro. */}
                    <Text
                      style={[type.secondary, { color: color.inkMuted, flexGrow: 1, flexShrink: 1, minWidth: 150 }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    <Text style={[type.secondary, styles.number, styles.direita, { color: color.ink }]}>
                      {naUnidade(item)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* O rodapé só existe no destino conferido, porque só ali o toque
                  abre uma tela. No outro, o toque é a conferência - e prometer
                  duas coisas no mesmo cartão é prometer a errada. */}
              {place.checked ? abrir : null}
            </Card>
          </Touchable>
        </Reveal>
      ))}

      {/* Nada saiu hoje: um convite, não um cartão dizendo zero. O desenho, a
          frase e a próxima ação - que é o botão logo abaixo, e por isso este
          cartão não é tocável: um mesmo caminho não se oferece duas vezes. */}
      {!loading && places.length === 0 ? (
        <Reveal index={0}>
          <Card
            hue={palette.lilac}
            icon={(c) => <GlyphBox size={26} color={c} weight={traco} />}
            title={t.app.transport.empty}
          >
            <Text style={[type.secondary, { color: color.inkMuted }]}>
              {t.app.transport.emptyHint}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {/* Duas portas, e a ordem entre elas é a do dia: primeiro se separa, depois
          se manda. A carga de um item só continua indo direto pela transferência —
          abrir uma lista de conferência para mandar uma caixa seria cobrar cinco
          toques de quem precisava de um. */}
      <Reveal index={passos}>
        <Button
          label={t.app.picking.title}
          onPress={() => router.push('/picking' as never)}
          icon={(c) => <GlyphBox size={22} color={c} weight={traco} />}
        />
      </Reveal>

      <Reveal index={passos + 1}>
        <Button
          label={t.app.transport.send}
          variant="ghost"
          onPress={() => router.push('/transfer')}
          icon={(c) => <GlyphVehicle size={22} color={c} weight={traco} />}
        />
      </Reveal>
      {/* A porta do cadastro fica no fim e existe SEMPRE — inclusive no dia sem
          carga, que é justamente quando alguém tem tempo de cadastrar quem leva. */}
      <Reveal index={places.length + 1}>
        <Button
          label={t.app.transport.carrierTitle}
          variant="ghost"
          onPress={() => router.push('/carriers' as never)}
          icon={(c) => <GlyphVehicle size={22} color={c} weight={traco} />}
        />
      </Reveal>
    </CollapsingHeader>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  quebra: { flexWrap: 'wrap' },
  /** Descendo de linha, o número continua à direita, onde a coluna dele mora. */
  direita: { marginLeft: 'auto' },
  number: { fontVariant: ['tabular-nums'], fontWeight: '600' },
});

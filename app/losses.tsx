import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphChart, GlyphLoss } from '@/components/Glyph';
import { ListRow } from '@/components/ListRow';
import { Reveal } from '@/components/Reveal';
import { nowIso } from '@/data/db';
import { lossesOn, type LossRow } from '@/data/repository';
import { LOCAL_COMPANY_ID } from '@/data/seed';
import { useQuery } from '@/data/useQuery';
import { dayWindow } from '@/domain/day';
import { fill, formatDayMonth, formatMoney, formatQuantity, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * Onde o dinheiro que some está indo.
 *
 * A prancha desenha a linha "Perdas — quanto, onde e por quê", e ela ficou fora
 * do índice até agora porque nada escrevia perda. O motivo é o que faz esta
 * tela existir: "sumiram quatro quilos" não muda decisão nenhuma; "quatro
 * quilos venceram" muda a compra, e "derreteram" muda a manutenção do freezer.
 *
 * Ordenada por DINHEIRO, não por data. A pergunta não é "o que aconteceu
 * ontem" - é "o que está pesando", e uma caixa que derreteu pesa mais que
 * trinta picolés de cortesia.
 *
 * Trinta dias porque é a janela em que uma fábrica decide: menos que isso é
 * ruído de uma semana ruim, mais que isso já é história.
 *
 * **O corpo desta tela foi reescrito na língua da capa** (`docs/linguagem.md`),
 * e o layout anterior saiu inteiro em vez de ganhar um caminho ao lado: era um
 * cartão de resumo no tom da área — laranja de produção para falar de perda — e
 * embaixo dele um retângulo por perda, quatro parágrafos cinzas empilhados com o
 * dinheiro em negrito no canto. Doze perdas eram doze retângulos, e nenhum deles
 * respondia por quê.
 *
 * O que existe agora são três leituras do mesmo fato, na ordem em que se decide:
 * **quanto** (a figura com a janela anterior ao lado), **por quê** (o motivo, com
 * quanto cada um pesou — a conta do "o que mais pesou" logo acima) e **onde**
 * (cada perda com item, quantidade, lugar e dia). Nenhuma caixa é desenhada
 * aqui: `Card` e `ListRow` já sabem virar régua no Papel e bloco no Orgânico.
 *
 * Nenhum cartão leva título: o cabeçalho já diz "Perdas" em cima da janela, e
 * repetir a palavra em três crachás seria rótulo inventado. O que separa os três
 * é o desenho e o tom — a gota vermelha é o dinheiro perdido, as barras âmbar
 * são o porquê.
 */
export default function Losses() {
  return (
    <AreaProvider area="apricot">
      <WhatWasLost />
    </AreaProvider>
  );
}

function WhatWasLost() {
  const { color, type, space, skin } = useTheme();
  const router = useRouter();
  const { locale, t } = useLocale();
  const words = t.app.losses;
  const traco = skin === 'papel' ? 1.7 : 2.2;

  /**
   * Trinta dias, e os trinta de antes.
   *
   * R$ 148 em perdas não diz nada sozinho: numa fábrica é um mês ruim, noutra é
   * terça-feira. A janela anterior é a única comparação honesta aqui — mesma
   * duração, mesmos motivos, mesmo dinheiro — e é ela que transforma o número
   * em decisão de trocar o freezer ou não.
   */
  const { data, loading } = useQuery<{ agora: LossRow[]; antes: LossRow[] }>(async () => {
    const hoje = dayWindow(nowIso(), locale.timeZone);
    const inicio = dayWindow(nowIso(), locale.timeZone, -29);
    const antesInicio = dayWindow(nowIso(), locale.timeZone, -59);
    const antesFim = dayWindow(nowIso(), locale.timeZone, -30);
    const [agora, antes] = await Promise.all([
      lossesOn(LOCAL_COMPANY_ID, inicio.from, hoje.to),
      lossesOn(LOCAL_COMPANY_ID, antesInicio.from, antesFim.to),
    ]);
    return { agora, antes };
  });

  const rows = data?.agora ?? [];
  const total = rows.reduce((n, r) => n + r.valueCents, 0);
  const antes = (data?.antes ?? []).reduce((n, r) => n + r.valueCents, 0);

  // Por motivo, para a tela dizer o que mais pesou em vez de listar e calar. A
  // contagem vem junto porque uma caixa de R$ 80 e oito caixinhas de R$ 10 são
  // o mesmo dinheiro e problemas diferentes: uma é acidente, outra é rotina.
  const byReason = new Map<LossRow['reason'], { money: number; count: number }>();
  for (const r of rows) {
    const atual = byReason.get(r.reason) ?? { money: 0, count: 0 };
    byReason.set(r.reason, { money: atual.money + r.valueCents, count: atual.count + 1 });
  }
  const porMotivo = [...byReason.entries()].sort((a, b) => b[1].money - a[1].money);
  const worst = porMotivo[0];

  /**
   * A cascata não pula número, e o motivo só tem cartão quando há mais de um.
   *
   * Um motivo sozinho já está dito por extenso na linha "o que mais pesou" do
   * cartão de cima; um cartão de barras com uma barra só é o mesmo defeito do
   * alerta inventado — desenho que não responde nada ensina a não olhar.
   */
  const mostraMotivos = porMotivo.length > 1;
  const indiceLista = mostraMotivos ? 2 : 1;

  return (
    <CollapsingHeader title={words.title} overline={words.window}>
      {/* QUANTO. A figura e, ao lado dela, quantas perdas somam esse dinheiro;
          embaixo, a conclusão do que pesou mais e a janela anterior — que é a
          única comparação honesta de uma perda com ela mesma. */}
      {rows.length > 0 ? (
        <Reveal index={0}>
          <Card hue={color.danger} icon={(c) => <GlyphLoss size={26} color={c} weight={traco} />}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.md }}>
              <Text style={[type.figure, { color: color.ink }]}>{formatMoney(total, locale)}</Text>
              <Text style={[type.secondary, { color: color.inkMuted, flex: 1 }]}>
                {plural(rows.length, words.lossCount)}
              </Text>
            </View>

            {worst ? (
              <Text style={[type.caption, { color: color.inkFaint, marginTop: space.sm }]}>
                {fill(words.worst, {
                  reason: t.loss[worst[0]].toLocaleLowerCase(locale.formatting),
                  money: formatMoney(worst[1].money, locale),
                })}
              </Text>
            ) : null}

            {/* A janela anterior. Zero lá atrás não é "R$ 0,00" — é não ter com o
                que comparar, e dizer isso é mais honesto que fingir queda total. */}
            <Text style={[type.caption, { color: color.inkFaint }]}>
              {antes > 0
                ? fill(words.vsPrevious, { money: formatMoney(antes, locale) })
                : words.firstWindow}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {/* POR QUÊ. A conta que abre a conclusão de cima (Lei 6): cada motivo com
          o que ele custou e em quantas vezes. Sem ícone nas linhas — desenho em
          toda linha vira papel de parede e para de ser visto. */}
      {mostraMotivos ? (
        <Reveal index={1}>
          <Card hue={color.warning} icon={(c) => <GlyphChart size={26} color={c} weight={traco} />}>
            {porMotivo.map(([motivo, soma]) => (
              <ListRow
                key={motivo}
                label={t.loss[motivo]}
                detail={plural(soma.count, words.lossCount)}
                trailing={formatMoney(soma.money, locale)}
                trailingTone="muted"
              />
            ))}
          </Card>
        </Reveal>
      ) : null}

      {/* ONDE. Cada perda, na ordem do dinheiro que a consulta já devolve: item,
          quanto era, o motivo, o lugar e o dia. A sobrelinha diz de que soma
          esta lista é a conta, no lugar de um título que repetiria "Perdas". */}
      {rows.length > 0 ? (
        <Reveal index={indiceLista}>
          <Card>
            <Text style={[type.overline, { color: color.inkFaint, marginBottom: space.xs }]}>
              {fill(words.total, {
                money: formatMoney(total, locale),
                count: plural(rows.length, words.lossCount),
              }).toLocaleUpperCase(locale.formatting)}
            </Text>
            {rows.map((row) => {
              const quanto = `${formatQuantity(row.baseUnits, locale)} ${row.baseUnit}`;
              const motivo = t.loss[row.reason].toLocaleLowerCase(locale.formatting);
              const dia = formatDayMonth(row.occurredAt, locale);
              return (
                <ListRow
                  key={`${row.itemId}-${row.occurredAt}`}
                  label={row.name}
                  detail={`${quanto} · ${motivo} · ${row.locationName} · ${dia}`}
                  trailing={formatMoney(row.valueCents, locale)}
                />
              );
            })}
          </Card>
        </Reveal>
      ) : null}

      {/* Nada se perdeu, e isso é estado válido e bonito: desenho, a frase, e
          onde a próxima perda se registra. Sem tom de alerta — um cartão
          vermelho dizendo que está tudo bem é alerta inventado.
          A frase diz que a perda se registra no item; sem um caminho, ela era
          instrução sem porta — o mesmo defeito que os relatórios tiveram hoje,
          em versão mais branda. */}
      {!loading && rows.length === 0 ? (
        <Reveal index={0}>
          <Card icon={(c) => <GlyphLoss size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.ink }]}>{words.empty}</Text>
            <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
              {words.emptyHint}
            </Text>
            <Button
              label={t.app.inputs.title}
              variant="ghost"
              onPress={() => router.push('/inputs')}
              style={{ marginTop: space.md }}
            />
          </Card>
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

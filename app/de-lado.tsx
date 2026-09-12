import { Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphCount } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { checksSetAside, type LinhaDeLado } from '@/data/repository';
import { empresaDaqui } from '@/data/empresa';
import { useQuery } from '@/data/useQuery';
import { fill, formatDayMonth, formatQuantity, formatTime } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * O que a fila pôs de lado, linha por linha — e por que esta tela precisou existir.
 *
 * Os Ajustes contavam: *"3 não sobem: o servidor já tinha esse registro"*. O docblock daquela
 * frase promete *"diz o que ficou, ONDE VER, e segue"*, e o "onde ver" não existia — a pessoa
 * lia o número sem ter como saber QUAIS três. É a mesma classe do defeito que esta rodada
 * consertou no extrato, onde o aplicativo mandava desfazer a conferência e não dava como: texto
 * que aponta para uma porta fechada.
 *
 * **Ela é a metade da decisão do dono que roda no aparelho.** A decisão de 11 de setembro:
 * *"assim q sincronizarem uma mensagem aparece dizendo q tem duplicação de dados, mostra os
 * dados (com a data, horário e local e nome do operador, por exemplo) para os dois celulares e
 * o primeiro q aceitar fica como permanente."* Os quatro fatos que ela nomeia são os quatro
 * que cada cartão mostra.
 *
 * **E a fronteira, dita para ninguém dar o degrau 3 por fechado:** a conferência que GANHOU
 * está no servidor, e não existe sincronia de entrada para `movements` — então este aparelho
 * mostra a SUA, não as duas. E "o primeiro que aceitar fica" continua esperando a leitura do
 * servidor e a pergunta de esquema que está no item 42 do plano.
 *
 * **Nada aqui culpa ninguém, e o caso real manda.** Duas pessoas conferindo a mesma carga na
 * doca, as duas sem sinal: as duas estão certas, e o servidor é que só aceita uma. Então a
 * tela conta o que aconteceu e o que vale daqui em diante, sem uma palavra sobre quem errou.
 *
 * **O mesmo desenho em todos os cartões é de propósito, e a regra da casa é a favor.** A
 * cicatriz do extrato — *"repetição regular lê como papel de parede"* — é sobre dar o MESMO
 * glifo a espécies DIFERENTES de ato. Aqui todas as linhas são a mesma espécie de coisa, uma
 * conferência posta de lado, e alternar desenho para variar seria cor que não quer dizer nada.
 */
export default function DeLadoScreen() {
  const { t, locale } = useLocale();
  const { color, space, type, traco } = useTheme();
  const words = t.app.setAside;
  const dados = useQuery<LinhaDeLado[]>(() => checksSetAside(empresaDaqui()));
  const linhas = dados.data ?? [];

  /**
   * A diferença dita como notícia, não como número com sinal.
   *
   * "-500 g" é a linguagem do livro-razão; quem está na doca lê "faltaram 500 g". E zero é uma
   * terceira frase, não uma falta de zero: a conferência que bateu também pode ser posta de
   * lado, e dizer "faltaram 0 g" seria inventar um problema.
   */
  const diferenca = (c: NonNullable<LinhaDeLado['conferencia']>): string => {
    const quanto = `${formatQuantity(Math.abs(c.difference), locale)}${c.baseUnit ? ` ${c.baseUnit}` : ''}`;
    if (c.difference === 0) return words.matched;
    return fill(c.difference < 0 ? words.shortBy : words.overBy, { amount: quanto });
  };

  return (
    <CollapsingHeader
      cena="ajustes"
      title={words.title}
      overline={words.overline}
      erro={dados.error}
      denovo={dados.refresh}
    >
      {/* "Está tudo bem" é estado válido: quem abre isto sem nada de lado lê uma frase. */}
      {linhas.length === 0 && !dados.loading ? (
        <Reveal index={0}>
          <Card icon={(c) => <GlyphCount size={26} color={c} weight={traco} />}>
            <Text style={[type.body, { color: color.ink }]}>{words.empty}</Text>
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {words.emptyHint}
            </Text>
          </Card>
        </Reveal>
      ) : null}

      {linhas.length > 0 ? (
        <Reveal index={0}>
          <Card>
            <Text style={[type.body, { color: color.ink }]}>{words.intro}</Text>
          </Card>
        </Reveal>
      ) : null}

      {linhas.map((linha, i) => (
        <Reveal key={linha.entryId} index={i + 1}>
          <Card
            icon={(c) => <GlyphCount size={26} color={c} weight={traco} />}
            title={
              linha.conferencia
                ? linha.conferencia.itemName
                  ? fill(words.checkTitle, { item: linha.conferencia.itemName })
                  : words.checkTitleNoItem
                : undefined
            }
          >
            {linha.conferencia ? (
              <View>
                <Text style={[type.body, { color: color.ink }]}>
                  {diferenca(linha.conferencia)}
                </Text>
                {/* Data e hora juntas, porque duas conferências da mesma carga no mesmo dia
                    só se distinguem pela hora — e é distinguir que esta tela existe para fazer. */}
                <Text style={[type.caption, { color: color.inkMuted, marginTop: space.xs }]}>
                  {`${formatDayMonth(linha.conferencia.occurredAt, locale)} · ${formatTime(
                    linha.conferencia.occurredAt,
                    locale,
                  )}`}
                  {linha.conferencia.placeName
                    ? ` · ${fill(words.place, { place: linha.conferencia.placeName })}`
                    : ''}
                  {linha.conferencia.operatorName
                    ? ` · ${fill(words.recordedBy, { name: linha.conferencia.operatorName })}`
                    : ''}
                </Text>
              </View>
            ) : (
              <Text style={[type.body, { color: color.ink }]}>
                {fill(words.otherRow, { table: linha.table })}
              </Text>
            )}
            <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
              {fill(words.setAsideAt, { when: formatDayMonth(linha.setAsideAt, locale) })}
            </Text>
          </Card>
        </Reveal>
      ))}

      {/* O caminho de volta, uma vez no fim e não em cada cartão: ele é o mesmo para todos. */}
      {linhas.some((l) => l.conferencia) ? (
        <Reveal index={linhas.length + 1}>
          <Card>
            <Text style={[type.body, { color: color.ink }]}>{words.whatNow}</Text>
          </Card>
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

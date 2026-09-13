import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { useConfirm } from '@/components/Confirm';
import { decidirDisputa, disputasAbertas, type Disputa } from '@/data/candidata';
import { contaAtual } from '@/sync/conta';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { GlyphCount } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { checksSetAside, type LinhaDeLado } from '@/data/repository';
import { todasJaExistem } from '@/sync/recusa';
import { tipoDaDiferenca } from '@/domain/ledger';
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
 * **E a fronteira, dita para ninguém dar o degrau 3 por fechado — ela ENCOLHEU em 12 de
 * setembro e não sumiu.** A descida existe desde a `0061`, então o razão do outro celular
 * chega aqui e esta tela pode mostrar a conferência que GANHOU. O que ainda falta é o
 * **aceitar**: a que perdeu não está em `movements` (a `0051` a recusa, e é ela que impede o
 * saldo dobrar), então ela precisa de um lugar próprio no servidor — a tabela de candidatas
 * da rodada 14. Até lá esta tela mostra a que este aparelho anotou e, agora, a que o
 * servidor aceitou; falta o botão que decide entre as duas.
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
   * A frase afirma uma CAUSA, então ela pergunta o código em vez de supor.
   *
   * *"O servidor já tinha o registro da mesma carga"* é verdade para `23505`, o código que a
   * nossa `0051` escolhe, e para mais nenhum. Hoje ele é o único promovido — então sem esta
   * pergunta a frase estaria certa por coincidência do tamanho de uma lista noutro arquivo, e no
   * dia em que um segundo código entrasse ela explicaria como duplicação uma recusa que não é.
   */
  const duplicadas = todasJaExistem(linhas.map((l) => l.codigo));

  /**
   * As disputas abertas: a conferência que o servidor recusou, esperando alguém escolher.
   *
   * Consulta própria e não um campo de `checksSetAside` porque as duas respondem perguntas
   * diferentes: aquela conta o que saiu da fila (inclusive o que não é conferência), e esta
   * conta o que ainda pode ser decidido. Juntá-las faria a lista de cima crescer com linhas
   * que já foram resolvidas.
   */
  const emDisputa = useQuery<Disputa[]>(() => disputasAbertas(empresaDaqui()));
  const disputas = emDisputa.data ?? [];
  const confirm = useConfirm();

  const decidir = async (d: Disputa, escolha: 'first' | 'second') => {
    /**
     * As DUAS confirmações falam da conferência DESTE celular, e por isso não há escolha aqui.
     *
     * Era um ternário com os dois lados iguais, que lê como defeito e convida um conserto que
     * seria o defeito de verdade — trocar um lado por `quantoVencedora`. As frases dizem por
     * que: *"a SUA conferência de {{amount}} será desfeita"* e *"a sua entra no lugar:
     * {{amount}}"*. Nas duas, o número é o desta pessoa.
     */
    const quanto = formatQuantity(Math.abs(d.quantoCandidata), locale);
    const vai = await confirm({
      title: escolha === 'second' ? words.keepMine : words.keepTheirs,
      message: fill(escolha === 'second' ? words.keepMineConfirm : words.keepTheirsConfirm, {
        amount: quanto,
      }),
      confirmLabel: t.app.confirm.confirm,
    });
    if (!vai) return;
    const quem = (await contaAtual())?.id ?? '';
    await decidirDisputa(d.candidataId, escolha, quem);
    await emDisputa.refresh();
    await dados.refresh();
  };

  /**
   * A diferença dita como notícia, não como número com sinal.
   *
   * "-500 g" é a linguagem do livro-razão; quem está na doca lê "faltaram 500 g". E zero é uma
   * terceira frase, não uma falta de zero: a conferência que bateu também pode ser posta de
   * lado, e dizer "faltaram 0 g" seria inventar um problema.
   */
  const diferenca = (c: NonNullable<LinhaDeLado['conferencia']>): string => {
    // A classificação é do domínio (`tipoDaDiferenca`) e a FRASE é daqui. O sinal decidido na
    // tela era regra que só o navegador alcançava, e a oficina mede a unidade.
    const tipo = tipoDaDiferenca(c.difference);
    if (tipo === 'exata') return words.matched;
    const quanto = `${formatQuantity(Math.abs(c.difference), locale)}${c.baseUnit ? ` ${c.baseUnit}` : ''}`;
    return fill(tipo === 'falta' ? words.shortBy : words.overBy, { amount: quanto });
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
            <Text style={[type.body, { color: color.ink }]}>
              {duplicadas ? words.intro : words.introOther}
            </Text>
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

      {/* **AS DUAS CONTAGENS, e o botão que decide — a decisão do dono de 11 de setembro.**

          Ela pede três coisas, e cada uma está aqui por um motivo:

          *"mostra os dados"* — as duas linhas com quanto e quando, lado a lado. A da pessoa
          sai do que este aparelho gravou; a outra desce do servidor, e quando ela ainda não
          chegou a tela DIZ isso em vez de desenhar meia disputa.

          *"para os dois celulares"* — é por isso que a candidata sobe. O aparelho que perdeu
          já sabia da disputa; o que ganhou não sabia de nada, e agora a mesma linha desce
          para ele.

          *"o primeiro q aceitar fica"* — quem arbitra é a política do servidor, não este
          botão. Aqui a escrita é otimista, para a tela responder na hora e offline; se
          outra pessoa decidiu antes, a descida traz a decisão de verdade por cima. */}
      {disputas.map((d, i) => (
        <Reveal key={d.candidataId} index={linhas.length + 1 + i}>
          <Card hue={color.warning} title={words.disputeTitle}>
            <Text style={[type.body, { color: color.inkMuted }]}>{words.disputeIntro}</Text>

            <Text style={[type.body, { color: color.ink, marginTop: space.md }]}>
              {fill(words.disputeMine, {
                amount: formatQuantity(Math.abs(d.quantoCandidata), locale),
                when: formatDayMonth(d.quandoCandidata, locale),
              })}
            </Text>
            <Text style={[type.body, { color: color.ink, marginTop: space.xs }]}>
              {d.vencedoraId && d.quandoVencedora !== null && d.quantoVencedora !== null
                ? fill(words.disputeTheirs, {
                    amount: formatQuantity(Math.abs(d.quantoVencedora), locale),
                    when: formatDayMonth(d.quandoVencedora, locale),
                  })
                : words.disputeTheirsUnknown}
            </Text>

            <View style={{ marginTop: space.md, gap: space.sm }}>
              <Button
                label={words.keepTheirs}
                onPress={() => void decidir(d, 'first')}
                variant="ghost"
              />
              <Button label={words.keepMine} onPress={() => void decidir(d, 'second')} />
            </View>
          </Card>
        </Reveal>
      ))}

      {/* O caminho de volta, uma vez no fim e não em cada cartão: ele é o mesmo para todos.

          Ele some quando há disputa com botão: mandar "quem conferiu primeiro desfaz no
          aparelho dele" ao lado de um botão que resolve aqui é dar duas instruções
          contraditórias para o mesmo problema — e a que pede outra pessoa é a pior das duas. */}
      {duplicadas && disputas.length === 0 && linhas.some((l) => l.conferencia) ? (
        <Reveal index={linhas.length + 1}>
          <Card>
            <Text style={[type.body, { color: color.ink }]}>{words.whatNow}</Text>
          </Card>
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

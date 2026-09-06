import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { useConfirm } from '@/components/Confirm';
import { GlyphArchive, GlyphPrice } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { nowIso } from '@/data/db';
import { readJson, writeJson } from '@/data/meta';
import { CopiaRecusadaError, type MotivoDaCopia } from '@/data/backup';
import { escolherCopia, guardarCopia, partilharCopia, trazerDeVolta } from '@/data/copia';
import { countMovements } from '@/data/repository';
import { useQuery } from '@/data/useQuery';
import { fill, formatDayMonth, plural } from '@/i18n';
import { useLocale } from '@/i18n/useLocale';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A cópia do aparelho.
 *
 * **Por que esta tela é o item zero da fila.** Todo o resto do plano atrasa
 * funcionalidade; isto perde dado. O livro-razão inteiro mora em `norva.db`, e
 * aparelho quebrado, roubado ou formatado é a fábrica sem histórico — para o que
 * não existe estorno. A fundação promete conserto por estorno e nunca por
 * exclusão; ela não promete nada contra o celular cair no tanque.
 *
 * **O tom custa uma linha a mais e ela não é opcional.** *"Você pode perder
 * tudo"* é verdade e é o jeito de fazer alguém fechar a tela. Orienta, não
 * fiscaliza: *"Guarde uma cópia"*. A mesma verdade virada para a ação, que é a
 * regra da casa e aqui ela vale mais do que em qualquer outro lugar — a tela que
 * assusta é a que a pessoa não abre de novo.
 *
 * **A confirmação de trazer de volta diz os dois números por extenso.**
 * Restaurar é o ato mais destrutivo do aplicativo, e a Lei da Inteligência não
 * abre exceção para ele: *"a cópia é de 4 de setembro e tem 1.198 movimentos;
 * este aparelho tem 1.240 agora, e eles serão substituídos"*. Sem os dois lados a
 * pessoa não tem como saber se está consertando ou destruindo.
 *
 * **E ela diz o que vai dentro do arquivo, antes e não depois.** A cópia leva
 * custo e fornecedor. No `appDataFolder` do Drive ela é privada ao aplicativo, e
 * ainda assim quem entra na conta lê a margem da fábrica. Isso é uma linha na
 * tela, não uma nota de rodapé em documento nenhum.
 *
 * O Drive automático é o passo seguinte (`docs/roadmap.md`, item 0c) e ele é
 * conveniência. **O risco fecha aqui**, com a folha de partilha: o arquivo existe,
 * volta, e vai para onde a pessoa já guarda o que importa.
 */

const ULTIMA_COPIA = 'ultima.copia';

/**
 * O que se lembra da última cópia — e são TRÊS coisas, não a data sozinha.
 *
 * "Última cópia: quinta" não responde nada: a pergunta de quem olha é se a cópia
 * cobre o que ele fez desde então. Com a contagem ao lado, a tela pode dizer
 * quantos movimentos entraram depois dela, que é a Lei 3 — nenhum número aparece
 * sozinho.
 */
type UltimaCopia = { feitoEm: string; movimentos: number; bytes: number };

/** Bytes em algo que uma pessoa lê. Cópia de fábrica pequena tem kilobytes. */
function tamanho(bytes: number, locale: { formatting: string }): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${new Intl.NumberFormat(locale.formatting, { maximumFractionDigits: 1 }).format(mb)} MB`
    : `${new Intl.NumberFormat(locale.formatting, { maximumFractionDigits: 0 }).format(bytes / 1024)} kB`;
}

export default function BackupScreen() {
  const { t, locale } = useLocale();
  const { color, palette, space, type, traco } = useTheme();
  const confirm = useConfirm();
  const words = t.app.backup;

  const [ocupado, setOcupado] = useState<'guardando' | 'lendo' | 'voltando' | null>(null);
  const [recusa, setRecusa] = useState<MotivoDaCopia | 'naoDeuParaGuardar' | null>(null);
  const [ondeFicou, setOndeFicou] = useState<string | null>(null);

  const estado = useQuery(
    useCallback(
      async () => ({
        ultima: await readJson<UltimaCopia>(ULTIMA_COPIA),
        movimentos: await countMovements(),
      }),
      [],
    ),
  );

  const guardar = useCallback(async () => {
    setRecusa(null);
    setOndeFicou(null);
    setOcupado('guardando');
    try {
      const feita = await guardarCopia(nowIso());
      await writeJson(ULTIMA_COPIA, {
        feitoEm: feita.feitoEm,
        movimentos: feita.movimentos,
        bytes: feita.bytes,
      } satisfies UltimaCopia);
      estado.refresh();
      // A partilha vem logo depois de gravar, no mesmo toque: uma cópia que fica
      // no cache do aparelho não protege de aparelho perdido, e pedir um segundo
      // toque para o passo que fecha o risco é onde as pessoas param.
      const foi = await partilharCopia(feita.uri);
      if (!foi) setOndeFicou(feita.caminho);
    } catch {
      setRecusa('naoDeuParaGuardar');
    } finally {
      setOcupado(null);
    }
  }, [estado]);

  const trazer = useCallback(async () => {
    setRecusa(null);
    setOndeFicou(null);
    setOcupado('lendo');
    try {
      const escolha = await escolherCopia();
      if (!escolha) return;

      const daCopia = plural(escolha.lida.movimentos, words.countsMovements);
      const daqui = plural(estado.data?.movimentos ?? 0, words.countsMovements);
      const quando = escolha.lida.feitoEm;
      const sim = await confirm({
        title: words.confirmTitle,
        message: quando
          ? fill(words.confirmBody, {
              when: formatDayMonth(quando, locale),
              copyMovements: daCopia,
              hereMovements: daqui,
            })
          : fill(words.confirmNoDate, { copyMovements: daCopia, hereMovements: daqui }),
        confirmLabel: words.confirm,
        destructive: true,
      });
      if (!sim) return;

      setOcupado('voltando');
      const volta = await trazerDeVolta(escolha.caminho);

      // 2) A tela mentiria aqui, e o motivo é fino: `ULTIMA_COPIA` mora no
      // `app_meta`, que é tabela do banco — a restauração acabou de sobrescrevê-lo
      // com o que a cópia tinha dentro. Restaurar uma cópia feita antes de existir
      // qualquer registro faria a tela dizer "você ainda não guardou nenhuma
      // cópia" logo depois de uma restauração bem-sucedida.
      //
      // O conserto grava o selo da cópia que acabou de voltar, e isso não é
      // remendo: ela É a última cópia que existe. Quem restaurou não perdeu a
      // rede de segurança — ela é exatamente o arquivo que ele acabou de usar.
      await writeJson(ULTIMA_COPIA, {
        feitoEm: escolha.lida.feitoEm ?? nowIso(),
        movimentos: escolha.lida.movimentos,
        bytes: escolha.lida.bytes,
      } satisfies UltimaCopia);
      estado.refresh();

      // `acknowledge` porque não há o que confirmar: a fábrica já voltou. Sem
      // isto o aviso sai com botão de cancelar, e cancelar o quê? O componente já
      // previa o caso — *"Drops the cancel button: for telling, not asking"* — e
      // eu não tinha lido a API antes de usá-la.
      await confirm({
        title: words.doneTitle,
        message: fill(words.doneBody, {
          rows: plural(volta.linhas, words.rowCount),
          tables: plural(volta.tabelas, words.tableCount),
        }),
        confirmLabel: words.confirm,
        acknowledge: true,
      });
    } catch (e) {
      setRecusa(e instanceof CopiaRecusadaError ? e.motivo : 'ilegivel');
    } finally {
      setOcupado(null);
    }
  }, [confirm, estado, locale, words]);

  const ultima = estado.data?.ultima ?? null;
  const movimentos = estado.data?.movimentos ?? 0;

  return (
    <CollapsingHeader cena="copia" title={words.title} overline={words.overline}>
      {/* O ESTADO. Nenhum campo nasce vazio e nenhum número aparece sozinho: a
          data da última cópia vem com o que ela guarda, e a ausência de cópia é
          um fato dito por extenso — não um espaço em branco. */}
      <Reveal index={0}>
        {/* Cópia em dia sai no tom CALMO do assunto, não em verde: verde é
            recompensa, e "está tudo bem" é estado válido e bonito, não prêmio. O
            aviso só entra quando não há cópia nenhuma — que é o único fato aqui
            que pede ação. Foi o guarda da assinatura que cobrou isto, e ele
            estava certo pelo motivo que ele diz: o desenho carrega o tom do
            ASSUNTO, e o assunto continua o mesmo com cópia ou sem. */}
        <Card
          hue={ultima ? palette.mist : color.warning}
          icon={(c) => <GlyphArchive size={26} color={c} weight={traco} />}
        >
          <Text style={[type.body, { color: color.ink }]}>{words.lead}</Text>
          <Text style={[type.secondary, { color: color.ink, marginTop: space.sm }]}>
            {ultima
              ? fill(words.lastOne, { when: formatDayMonth(ultima.feitoEm, locale) })
              : words.never}
          </Text>
          <Text style={[type.caption, { color: color.inkFaint }]}>
            {ultima
              ? fill(words.holds, {
                  movements: plural(ultima.movimentos, words.countsMovements),
                  size: tamanho(ultima.bytes, locale),
                })
              : words.neverHint}
          </Text>
          {/* A comparação, que é o que decide: não é a data da cópia, é o que
              ficou de fora dela. Zero é estado válido e bonito — a tela diz que
              está em dia em vez de inventar um alerta. */}
          {ultima ? (
            <Text style={[type.caption, { color: color.inkFaint }]}>
              {movimentos > ultima.movimentos
                ? fill(words.sinceThen, {
                    movements: plural(movimentos - ultima.movimentos, words.countsMovements),
                  })
                : words.upToDate}
            </Text>
          ) : null}
          <Button
            label={ocupado === 'guardando' ? words.making : words.make}
            onPress={guardar}
            disabled={ocupado !== null}
            weighty
            style={{ marginTop: space.md }}
          />
        </Card>
      </Reveal>

      {/* O QUE VAI DENTRO — antes do primeiro toque, não depois. */}
      <Reveal index={1}>
        {/* A etiqueta de preço, e não o balde de estoque que estava aqui.
            O que este cartão avisa é que a cópia leva DINHEIRO dentro — custo e
            fornecedor — e o balde dizia "estoque", que é o assunto errado. A
            guarda da assinatura passou nos dois porque ela cobra que o tom case
            com o assunto declarado, não que o desenho signifique a coisa certa.
            Guarda passando não é desenho certo. */}
        <Card icon={(c) => <GlyphPrice size={26} color={c} weight={traco} />}>
          <Text style={[type.secondary, { color: color.ink }]}>{words.inside}</Text>
          <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
            {words.insideBody}
          </Text>
          {/* E as preferências vêm junto, o que é decisão e não descuido.
              O caso principal é celular morto e celular novo: ali o aparelho não
              tem cidade do tempo, nem ordem de capa, nem grade de nomes — e
              trazê-las de volta é justamente o que faz o aparelho novo parecer o
              antigo. Meu instinto foi o contrário ("a cópia é da fábrica, as
              preferências são do aparelho") e ele não sobreviveu ao caso que
              acontece de verdade. O que faltava não era mudar o código: era a
              tela DIZER. */}
          <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
            {words.insidePrefs}
          </Text>
        </Card>
      </Reveal>

      {/* A VOLTA. Fica embaixo porque é o caso raro, e a ordem da página é a
          ordem da probabilidade. */}
      <Reveal index={2}>
        {/* A MESMA gaveta do cartão de cima, de propósito: guardar e trazer de
            volta são o mesmo assunto visto dos dois lados, e repetir o desenho é
            o que faz o par ser lido como par. A lista de conferência que estava
            aqui dizia "checagem", que não é o que acontece nesta tela. */}
        <Card icon={(c) => <GlyphArchive size={26} color={c} weight={traco} />}>
          <Text style={[type.secondary, { color: color.ink }]}>{words.restoreTitle}</Text>
          <Text style={[type.caption, { color: color.inkFaint, marginTop: space.xs }]}>
            {words.restoreLead}
          </Text>
          <Button
            label={
              ocupado === 'lendo'
                ? words.reading
                : ocupado === 'voltando'
                  ? words.restoring
                  : words.pick
            }
            onPress={trazer}
            variant="ghost"
            disabled={ocupado !== null}
            style={{ marginTop: space.md }}
          />
        </Card>
      </Reveal>

      {/* Erro que IMPEDE, e ele diz o que fazer. "Atualize o aplicativo" é uma
          saída; "cópia inválida" é uma reclamação. */}
      {recusa ? (
        <Reveal index={3}>
          <Card hue={color.danger}>
            <Text style={[type.body, { color: color.ink }]}>{words[recusa]}</Text>
          </Card>
        </Reveal>
      ) : null}

      {ondeFicou ? (
        <Reveal index={4}>
          <Card hue={color.warning}>
            <Text style={[type.caption, { color: color.ink }]}>
              {fill(words.semPartilha, { path: ondeFicou })}
            </Text>
          </Card>
        </Reveal>
      ) : null}
    </CollapsingHeader>
  );
}

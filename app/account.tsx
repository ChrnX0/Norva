import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useConfirm } from '@/components/Confirm';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphCustomer, GlyphFactory, GlyphLabel } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { useQuery } from '@/data/useQuery';
import { useLocale } from '@/i18n/useLocale';
import { ROLES } from '@/domain/access';
import { fill } from '@/i18n';
import { AdocaoRecusadaError, adotarEmpresa, type MotivoDaRecusa } from '@/data/adocao';
import { puxar } from '@/data/configuracao';
import { empresaDaqui } from '@/data/empresa';
import {
  aprovar,
  contaAtual,
  criarConta,
  criarEmpresa,
  entrar,
  minhaEmpresa,
  pedidos,
  pedirAssociacao,
  recusar,
  sair,
  type Conta,
  type Empresa,
  type MotivoDaConta,
  type Pedido,
} from '@/sync/conta';
import { AreaProvider, useTheme } from '@/theme/ThemeProvider';

/**
 * A conta da empresa.
 *
 * **Ela não fica na frente do aplicativo, e isso é decisão e não esquecimento.**
 * A fábrica offline na câmara fria é o caso normal: tudo funciona no aparelho, a
 * fila guarda o que for gravado, e a conta existe para o que SAI daqui — a cópia
 * no servidor, a lista de gente, o mesmo dado noutro celular. Uma tela de senha
 * entre a pessoa e a caixa que ela está segurando seria o defeito mais caro que
 * este produto poderia ter. Por isso a porta dela está nos Ajustes.
 *
 * **A conta é da EMPRESA, não da pessoa** — decisão do dono: *"o login autentica
 * o sistema, não a pessoa"*. Quem estava com o aparelho é anotação do registro,
 * escolhida na hora, e é outra pergunta com outra resposta.
 *
 * **Três estados, e a tela mostra um de cada vez**, porque são três perguntas
 * diferentes e mostrar as três juntas é pedir que alguém descubra em qual está:
 * sem conta (entrar ou criar), com conta e sem empresa (dar nome à empresa), e
 * com as duas (quem entrou, qual empresa, e a saída).
 */
export default function AccountScreen() {
  const { t } = useLocale();
  const { color, type, space, palette } = useTheme();

  /**
   * A pergunta é UMA e a resposta é o par: quem entrou e qual empresa.
   *
   * Pela consulta da casa, e não por um `useEffect` com `setState` dentro —
   * que é o que a regra `set-state-in-effect` recusa, e com razão: efeito que
   * guarda estado roda de novo a cada render que mude a dependência, e a versão
   * escrita à mão já tinha `reler` numa `useCallback` só para segurar isso.
   * `useQuery` faz a mesma coisa com uma chave e uma releitura explícita.
   */
  const confirm = useConfirm();
  const { data: estado, refresh } = useQuery<{
    conta: Conta | null;
    empresa: Empresa | null;
    fila: Pedido[];
  }>(async () => {
    const quem = await contaAtual();
    if (!quem) return { conta: null, empresa: null, fila: [] };
    const resposta = await minhaEmpresa();
    const empresaAgora = resposta.ok ? resposta.valor : null;
    // A fila só é perguntada quando há empresa: sem associação ativa a política
    // devolveria vazio de qualquer jeito, e uma consulta que sempre volta vazia é
    // uma ida ao servidor para confirmar o que já se sabe.
    const espera = empresaAgora ? await pedidos() : null;
    // Entrou e há empresa: a casa manda no que a casa combinou. É aqui que a
    // aprovação de pedido para de ser decoração — o gatilho do servidor lê a
    // coluna, e até hoje ninguém a escrevia nem a lia de volta.
    if (empresaAgora) await puxar();
    return {
      conta: quem,
      empresa: empresaAgora,
      fila: espera && espera.ok ? espera.valor : [],
    };
  });
  const conta = estado?.conta ?? null;
  const empresa = estado?.empresa ?? null;
  // O aparelho é desta empresa? Comparação de fato com fato: o id que o servidor
  // devolveu contra o que este aparelho carimba nas linhas dele.
  const ligado = empresa !== null && empresa.id === empresaDaqui();
  const fila = estado?.fila ?? [];
  const carregando = estado === null;

  const [criando, setCriando] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeDaEmpresa, setNomeDaEmpresa] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pedidoPara, setPedidoPara] = useState<string | null>(null);

  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDaConta | null>(null);
  const [recusa, setRecusa] = useState<MotivoDaRecusa | null>(null);
  const [confirmePorEmail, setConfirmePorEmail] = useState(false);

  const podeEnviar = email.trim().length > 3 && senha.length >= 6 && !ocupado;

  const enviar = async () => {
    setOcupado(true);
    setMotivo(null);
    setConfirmePorEmail(false);
    const resposta = criando ? await criarConta(email, senha) : await entrar(email, senha);
    if (!resposta.ok) {
      setMotivo(resposta.motivo);
      setOcupado(false);
      return;
    }
    // Criar conta nem sempre abre sessão: o servidor pode exigir confirmação por
    // e-mail. Dizer "conta criada" e deixar a pessoa numa tela que recusa a senha
    // dela é o pior desfecho deste caminho, então os dois casos são ditos.
    if (criando && 'sessao' in resposta.valor && !resposta.valor.sessao) {
      setConfirmePorEmail(true);
      setCriando(false);
      setSenha('');
      setOcupado(false);
      return;
    }
    setSenha('');
    refresh();
    setOcupado(false);
  };

  const abrirEmpresa = async () => {
    setOcupado(true);
    setMotivo(null);
    const resposta = await criarEmpresa(nomeDaEmpresa);
    if (!resposta.ok) setMotivo(resposta.motivo);
    else setNomeDaEmpresa('');
    refresh();
    setOcupado(false);
  };

  /**
   * Liga este aparelho à empresa — uma vez, e com o dono sabendo o que muda.
   *
   * Uma confirmação e não duas: nada é apagado aqui. O carimbo das linhas passa a
   * ser o da empresa de verdade, que é o que faz a fila ter para onde subir. O
   * eixo desta casa é irrecuperável, não irreversível — e adoção não perde dado.
   */
  const ligar = async () => {
    if (!empresa) return;
    const vai = await confirm({
      title: fill(t.app.account.adoptAction, { company: empresa.nome }),
      message: fill(t.app.account.adoptAsk, { company: empresa.nome }),
      confirmLabel: t.app.confirm.confirm,
    });
    if (!vai) return;
    setOcupado(true);
    setRecusa(null);
    try {
      await adotarEmpresa(empresa.id);
    } catch (erro) {
      // Fato virando frase é trabalho da tela: a camada de dados devolveu um
      // código, e cada código tem uma frase que diz o que FAZER.
      setRecusa(erro instanceof AdocaoRecusadaError ? erro.motivo : 'idVazio');
    }
    refresh();
    setOcupado(false);
  };

  const pedir = async () => {
    setOcupado(true);
    setMotivo(null);
    const resposta = await pedirAssociacao(codigo);
    if (!resposta.ok) setMotivo(resposta.motivo);
    else {
      setPedidoPara(resposta.valor);
      setCodigo('');
    }
    setOcupado(false);
  };

  const decidir = async (id: string, sim: boolean) => {
    setOcupado(true);
    setMotivo(null);
    // O papel entra na APROVAÇÃO e não no pedido: quem pede não escolhe o que
    // pode fazer. `operator` é o padrão pela decisão do dono — aparelho
    // emprestado produz, despacha e confere, e não vê dinheiro em lugar nenhum.
    const resposta = sim ? await aprovar(id, [...ROLES.operator]) : await recusar(id);
    if (!resposta.ok) setMotivo(resposta.motivo);
    refresh();
    setOcupado(false);
  };

  const encerrar = async () => {
    setOcupado(true);
    await sair();
    refresh();
    setOcupado(false);
  };

  return (
    <AreaProvider area="sky">
      <CollapsingHeader cena="gente" title={t.app.account.title} overline={t.app.account.overline}>
        {carregando ? (
          <Reveal index={0}>
            <Text style={[type.body, { color: color.inkMuted }]}>{t.app.account.working}</Text>
          </Reveal>
        ) : null}

        {/* Sem conta: entrar, ou criar. */}
        {!carregando && !conta ? (
          <Reveal index={0}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphCustomer size={26} color={c} />}
              title={criando ? t.app.account.signUp : t.app.account.signIn}
            >
              <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
                {t.app.account.why}
              </Text>

              <View style={{ gap: space.md }}>
                <Field
                  label={t.app.account.email}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  caixaAutomatica="none"
                />
                <Field
                  label={t.app.account.password}
                  value={senha}
                  onChangeText={setSenha}
                  segredo
                  hint={senha.length > 0 && senha.length < 6 ? t.app.account.passwordHint : undefined}
                />
              </View>

              <Button
                label={criando ? t.app.account.signUp : t.app.account.signIn}
                onPress={() => void enviar()}
                disabled={!podeEnviar}
                style={{ marginTop: space.lg }}
              />
              <Button
                variant="ghost"
                label={criando ? t.app.account.switchToSignIn : t.app.account.switchToSignUp}
                onPress={() => {
                  setCriando((antes) => !antes);
                  setMotivo(null);
                }}
              />
            </Card>
          </Reveal>
        ) : null}

        {/* Com conta e sem empresa: falta o nome. */}
        {!carregando && conta && !empresa ? (
          <Reveal index={0}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphFactory size={26} color={c} />}
              title={t.app.account.companyTitle}
            >
              <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
                {t.app.account.companyBody}
              </Text>
              <Field
                label={t.app.account.companyName}
                value={nomeDaEmpresa}
                onChangeText={setNomeDaEmpresa}
                autoFocus
              />
              <Button
                label={t.app.account.createCompany}
                onPress={() => void abrirEmpresa()}
                disabled={nomeDaEmpresa.trim().length < 2 || ocupado}
                style={{ marginTop: space.lg }}
              />
            </Card>
          </Reveal>
        ) : null}

        {/* E o outro caminho, que é o do dono e não escolha nossa: quem não vai
            criar empresa nenhuma entra na de alguém, com o código de seis letras
            que essa pessoa dita. Os dois existem, lado a lado, porque as duas
            situações são igualmente comuns no primeiro dia. */}
        {!carregando && conta && !empresa ? (
          <Reveal index={1}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphCustomer size={26} color={c} />}
              title={t.app.account.joinTitle}
            >
              <Text style={[type.secondary, { color: color.inkMuted, marginBottom: space.md }]}>
                {t.app.account.joinBody}
              </Text>
              <Field
                label={t.app.account.joinCode}
                value={codigo}
                onChangeText={(texto) => setCodigo(texto.toUpperCase())}
                caixaAutomatica="characters"
              />
              <Button
                variant="ghost"
                label={t.app.account.joinAsk}
                onPress={() => void pedir()}
                disabled={codigo.trim().length < 6 || ocupado}
                style={{ marginTop: space.md }}
              />
              {pedidoPara ? (
                <Text style={[type.body, { color: color.ink, marginTop: space.sm }]}>
                  {fill(t.app.account.joinSent, { company: pedidoPara })}
                </Text>
              ) : null}
            </Card>
          </Reveal>
        ) : null}

        {/* Com as duas: quem entrou, qual empresa, e a saída. */}
        {!carregando && conta && empresa ? (
          <Reveal index={0}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphFactory size={26} color={c} />}
              title={empresa.nome}
            >
              <Text style={[type.overline, { color: color.inkFaint }]}>
                {t.app.account.signedInAs.toUpperCase()}
              </Text>
              <Text style={[type.body, { color: color.ink, marginTop: 2 }]}>
                {conta.email ?? conta.id}
              </Text>
              <Button
                variant="ghost"
                label={t.app.account.signOut}
                onPress={() => void encerrar()}
                disabled={ocupado}
                style={{ marginTop: space.lg }}
              />
              <Text style={[type.caption, { color: color.inkFaint }]}>
                {t.app.account.signOutHint}
              </Text>
            </Card>
          </Reveal>
        ) : null}

        {/* E a ligação, que só aparece enquanto ela falta. Tela que oferece o que
            já está feito ensina a ignorar o que ela oferece. */}
        {!carregando && conta && empresa && !ligado ? (
          <Reveal index={1}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphFactory size={26} color={c} />}
              title={t.app.account.adoptTitle}
            >
              <Text style={[type.secondary, { color: color.inkMuted }]}>
                {fill(t.app.account.adoptBody, { company: empresa.nome })}
              </Text>
              <Button
                label={fill(t.app.account.adoptAction, { company: empresa.nome })}
                onPress={() => void ligar()}
                disabled={ocupado}
                style={{ marginTop: space.md }}
              />
              {recusa ? (
                <Text style={[type.body, { color: color.ink, marginTop: space.sm }]}>
                  {t.app.account.adoptRefuse[recusa]}
                </Text>
              ) : null}
            </Card>
          </Reveal>
        ) : null}

        {/* O código, em corpo grande e espaçado: ele é DITADO em voz alta, com
            barulho de fábrica, para alguém digitar do outro lado. Seis letras
            apertadas em corpo de legenda seriam sopradas errado. */}
        {!carregando && empresa?.codigo ? (
          <Reveal index={1}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphLabel size={26} color={c} />}
              title={t.app.account.codeTitle}
            >
              <Text
                style={[
                  type.figure,
                  { color: color.ink, letterSpacing: 6, marginBottom: space.sm },
                ]}
                accessibilityLabel={empresa.codigo.split('').join(' ')}
              >
                {empresa.codigo}
              </Text>
              <Text style={[type.secondary, { color: color.inkMuted }]}>
                {t.app.account.codeBody}
              </Text>
            </Card>
          </Reveal>
        ) : null}

        {/* Quem está esperando. A peça só existe quando há alguém — "ninguém
            pediu" é um cartão que ensina a ignorar cartão, e a regra da capa vale
            aqui igual: ligar não é forçar. */}
        {!carregando && empresa && fila.length > 0 ? (
          <Reveal index={2}>
            <Card
              hue={palette.sky}
              icon={(c) => <GlyphCustomer size={26} color={c} />}
              title={t.app.account.waitingTitle}
            >
              {fila.map((pedido) => (
                <View key={pedido.id} style={{ marginBottom: space.md }}>
                  <Text style={[type.body, { color: color.ink }]}>{pedido.nome}</Text>
                  <Text style={[type.caption, { color: color.inkFaint }]}>
                    {t.app.account.approveAs}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.sm }}>
                    <Button
                      label={t.app.account.approve}
                      onPress={() => void decidir(pedido.id, true)}
                      disabled={ocupado}
                      style={{ flex: 1 }}
                    />
                    <Button
                      variant="ghost"
                      label={t.app.account.refuse}
                      onPress={() => void decidir(pedido.id, false)}
                      disabled={ocupado}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ))}
            </Card>
          </Reveal>
        ) : null}

        {/* O que deu errado, dito como fato e com o que fazer. Nunca a mensagem
            crua do servidor: ela é inglês de biblioteca e muda de versão. */}
        {motivo ? (
          <Reveal index={1}>
            <Text style={[type.body, { color: color.danger }]}>{t.app.account.reason[motivo]}</Text>
          </Reveal>
        ) : null}

        {confirmePorEmail ? (
          <Reveal index={1}>
            <Text style={[type.body, { color: color.ink }]}>{t.app.account.checkEmail}</Text>
          </Reveal>
        ) : null}
      </CollapsingHeader>
    </AreaProvider>
  );
}

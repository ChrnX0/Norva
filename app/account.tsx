import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CollapsingHeader } from '@/components/CollapsingHeader';
import { Field } from '@/components/Field';
import { GlyphCustomer, GlyphFactory } from '@/components/Glyph';
import { Reveal } from '@/components/Reveal';
import { useQuery } from '@/data/useQuery';
import { useLocale } from '@/i18n/useLocale';
import {
  contaAtual,
  criarConta,
  criarEmpresa,
  entrar,
  minhaEmpresa,
  sair,
  type Conta,
  type Empresa,
  type MotivoDaConta,
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
  const { data: estado, refresh } = useQuery<{ conta: Conta | null; empresa: Empresa | null }>(
    async () => {
      const quem = await contaAtual();
      if (!quem) return { conta: null, empresa: null };
      const resposta = await minhaEmpresa();
      return { conta: quem, empresa: resposta.ok ? resposta.valor : null };
    },
  );
  const conta = estado?.conta ?? null;
  const empresa = estado?.empresa ?? null;
  const carregando = estado === null;

  const [criando, setCriando] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeDaEmpresa, setNomeDaEmpresa] = useState('');

  const [ocupado, setOcupado] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDaConta | null>(null);
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

import { supabase } from './supabase';

/**
 * A conta da empresa — entrar, criar, e criar a empresa.
 *
 * **Este módulo devolve FATO, nunca frase.** É a fundação da casa e aqui ela
 * custa trabalho de verdade: o Supabase responde em inglês, com mensagens que
 * mudam entre versões (*"Invalid login credentials"*, *"User already
 * registered"*), e uma tela que exibisse isso estaria mostrando texto de
 * biblioteca para o dono de uma fábrica. Cada resposta vira um dos motivos
 * abaixo, e quem escreve português é a tela.
 *
 * **E o que a conta É, aqui, não é o que ela é em outros aplicativos.** Decisão
 * do dono: *"o login autentica o sistema, não a pessoa"*. A conta é da EMPRESA.
 * Ela distribui acesso criando outros e-mails ou mandando convite; não é o
 * e-mail pessoal do operador que entra. Quem estava com o aparelho é anotação
 * do registro, escolhida na hora — são duas perguntas diferentes, e uma coluna
 * só respondendo as duas já custou uma rodada inteira.
 *
 * **Nada aqui bloqueia o aplicativo.** A fábrica offline na câmara fria é o caso
 * normal, e o aplicativo inteiro funciona no aparelho. A conta existe para a
 * sincronia e para a lista de gente — por isso a porta dela fica nos Ajustes, e
 * não na frente da primeira tela.
 */

/** Por que não deu certo. Fato, não frase. */
export type MotivoDaConta =
  /** Não há servidor configurado neste aplicativo. Estado legítimo. */
  | 'semServidor'
  /** O aparelho não alcançou o servidor. Câmara fria, avião, chip sem sinal. */
  | 'semRede'
  /** E-mail ou senha não conferem. */
  | 'credenciais'
  /** Já existe conta com este e-mail. */
  | 'emailEmUso'
  /** A senha não atende ao mínimo do servidor. */
  | 'senhaFraca'
  /** O e-mail existe mas ainda não foi confirmado. */
  | 'emailNaoConfirmado'
  /** Nada acima. A mensagem crua vem junto, para o suporte. */
  | 'desconhecido';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: MotivoDaConta; cru?: string };

/** Quem está com a sessão aberta neste aparelho, ou nulo. */
export type Conta = { id: string; email: string | null };

/**
 * Traduz a resposta do servidor num dos motivos.
 *
 * Casa por PEDAÇO da mensagem e em minúsculas, e isso é deliberado: o texto do
 * Supabase muda de versão para versão e casar a frase inteira quebraria em
 * silêncio na próxima atualização — que é a pior forma de quebrar, porque o
 * aplicativo continuaria dizendo "não deu certo" sem dizer por quê.
 */
function motivoDe(mensagem: string): MotivoDaConta {
  const m = mensagem.toLowerCase();
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) return 'semRede';
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'credenciais';
  if (m.includes('already registered') || m.includes('already been registered')) return 'emailEmUso';
  if (m.includes('password') && (m.includes('short') || m.includes('least') || m.includes('weak')))
    return 'senhaFraca';
  if (m.includes('not confirmed') || m.includes('email not confirmed')) return 'emailNaoConfirmado';
  return 'desconhecido';
}

function semServidor<T>(): Resultado<T> {
  return { ok: false, motivo: 'semServidor' };
}

/** A sessão guardada neste aparelho. Nulo é estado normal, não erro. */
export async function contaAtual(): Promise<Conta | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const usuario = data.session?.user;
  return usuario ? { id: usuario.id, email: usuario.email ?? null } : null;
}

export async function entrar(email: string, senha: string): Promise<Resultado<Conta>> {
  if (!supabase) return semServidor();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: senha,
  });
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  const usuario = data.user;
  if (!usuario) return { ok: false, motivo: 'desconhecido' };
  return { ok: true, valor: { id: usuario.id, email: usuario.email ?? null } };
}

/**
 * Cria a conta e devolve se ela já veio com sessão.
 *
 * O servidor pode estar configurado para exigir confirmação por e-mail; nesse
 * caso `sessao` volta falso e ninguém entrou ainda. A tela precisa saber a
 * diferença — dizer "conta criada" e deixar a pessoa numa tela de login que
 * recusa a senha dela é o pior desfecho possível deste caminho.
 */
export async function criarConta(
  email: string,
  senha: string,
): Promise<Resultado<{ conta: Conta | null; sessao: boolean }>> {
  if (!supabase) return semServidor();
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: senha });
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  const usuario = data.user;
  return {
    ok: true,
    valor: {
      conta: usuario ? { id: usuario.id, email: usuario.email ?? null } : null,
      sessao: Boolean(data.session),
    },
  };
}

export async function sair(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** A empresa desta conta, ou nulo quando ela ainda não criou nenhuma. */
export type Empresa = { id: string; nome: string };

/**
 * Qual empresa esta conta enxerga.
 *
 * Uma consulta e não uma leitura de campo: a política `companies_read` filtra
 * por associação ativa, então o servidor já responde só o que é desta conta —
 * que é a fundação de permissão desta casa, a checagem ANTES da consulta e não
 * um filtro depois dela.
 */
export async function minhaEmpresa(): Promise<Resultado<Empresa | null>> {
  if (!supabase) return semServidor();
  const { data, error } = await supabase.from('companies').select('id, name').limit(1);
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  const linha = data?.[0];
  return { ok: true, valor: linha ? { id: linha.id as string, nome: linha.name as string } : null };
}

/**
 * Cria a empresa desta conta, com ela como dona.
 *
 * Chama a função do servidor e não dois `insert`, e a diferença é a transação:
 * uma política de INSERT em `companies` deixaria a associação do dono como um
 * segundo passo, e entre os dois existe o instante em que a empresa não tem
 * dono. Uma conta que caísse ali criaria uma empresa ÓRFÃ — invisível para ela
 * mesma, porque `companies_read` filtra por associação, e impossível de apagar.
 * Ou nasce empresa com dono, ou não nasce.
 */
export async function criarEmpresa(nome: string): Promise<Resultado<string>> {
  if (!supabase) return semServidor();
  const { data, error } = await supabase.rpc('create_company_for_me', { company_name: nome.trim() });
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  return { ok: true, valor: data as string };
}

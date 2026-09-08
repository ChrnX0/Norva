/**
 * O cliente, buscado quando alguém precisa dele — e não no topo do arquivo.
 *
 * `./supabase` arrasta o `@supabase/supabase-js` e, por baixo dele, o React Native,
 * que o transformador da suíte não atravessa: com o import estático aqui, **este
 * arquivo inteiro não podia ser exercitado por teste nenhum** — e ele é a camada de
 * conta, onde moram entrar, criar empresa, aprovar quem pediu e recusar. Ficou assim
 * por dias, e o que apontou foi a guarda que nasceu do mesmo defeito em
 * `configuracao.ts` e `transporte.ts`.
 *
 * Nulo continua sendo estado legítimo: o aplicativo funciona inteiro sem servidor.
 */
async function cliente() {
  const { supabase } = await import('./supabase');
  return supabase;
}

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
  /** O código de convite digitado não pertence a nenhuma empresa. */
  | 'codigoNaoConfere'
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
  const sb = await cliente();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const usuario = data.session?.user;
  return usuario ? { id: usuario.id, email: usuario.email ?? null } : null;
}

export async function entrar(email: string, senha: string): Promise<Resultado<Conta>> {
  const sb = await cliente();
  if (!sb) return semServidor();
  const { data, error } = await sb.auth.signInWithPassword({
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
  const sb = await cliente();
  if (!sb) return semServidor();
  const { data, error } = await sb.auth.signUp({ email: email.trim(), password: senha });
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
  const sb = await cliente();
  if (!sb) return;
  await sb.auth.signOut();
}

/** A empresa desta conta, ou nulo quando ela ainda não criou nenhuma. */
export type Empresa = {
  id: string;
  nome: string;
  /**
   * O código que o dono dita para alguém pedir associação.
   *
   * Nulo só em empresa nascida antes da `0041`, e o gatilho de lá já não deixa
   * isso acontecer de novo. Ele não dá acesso a nada sozinho: cria um pedido
   * pendente, e pendente não vê nada — quem decide é a `0011`, no banco, e não
   * uma checagem de tela.
   */
  codigo: string | null;
};

/** Quem pediu para entrar e ainda espera. */
export type Pedido = { id: string; nome: string; quando: string };

/**
 * Qual empresa esta conta enxerga.
 *
 * Uma consulta e não uma leitura de campo: a política `companies_read` filtra
 * por associação ativa, então o servidor já responde só o que é desta conta —
 * que é a fundação de permissão desta casa, a checagem ANTES da consulta e não
 * um filtro depois dela.
 */
export async function minhaEmpresa(): Promise<Resultado<Empresa | null>> {
  const sb = await cliente();
  if (!sb) return semServidor();
  const { data, error } = await sb.from('companies').select('id, name, join_code').limit(1);
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  const linha = data?.[0];
  return {
    ok: true,
    valor: linha
      ? {
          id: linha.id as string,
          nome: linha.name as string,
          codigo: (linha.join_code as string | null) ?? null,
        }
      : null,
  };
}

/**
 * Pedir associação com o código da empresa.
 *
 * Devolve o NOME da empresa, e isso é o que faz a tela poder dizer "seu pedido
 * foi para a Sorvetes do Zé" em vez de "pedido enviado" — quem digitou seis
 * letras precisa saber que acertou a empresa certa antes de esperar.
 *
 * Chama a função do servidor e não um `insert`, porque as duas portas estão
 * trancadas por dentro do lado de fora: quem ainda não é membro não enxerga a
 * empresa (a política filtra por associação ativa) e não pode escrever em
 * `memberships`. É a mesma forma do problema que o dono tinha para criar a
 * empresa dele, do outro lado.
 */
export async function pedirAssociacao(codigo: string): Promise<Resultado<string>> {
  const sb = await cliente();
  if (!sb) return semServidor();
  const { data, error } = await sb.rpc('request_to_join', { code: codigo.trim() });
  if (error) {
    // "Código não confere" vem da função e não é falha de rede nem de senha: é a
    // única resposta desta chamada que a pessoa consegue consertar sozinha.
    if (error.message.toLowerCase().includes('confere')) {
      return { ok: false, motivo: 'codigoNaoConfere', cru: error.message };
    }
    return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  }
  return { ok: true, valor: data as string };
}

/**
 * Quem está esperando aprovação.
 *
 * Sem filtro de empresa na consulta, e isso é a fundação e não descuido: a
 * política `memberships_read` já devolve só o que é das empresas em que esta
 * conta é membro ATIVA. A checagem roda antes da consulta, então não existe
 * linha de outra empresa para vazar.
 */
export async function pedidos(): Promise<Resultado<Pedido[]>> {
  const sb = await cliente();
  if (!sb) return semServidor();
  const { data, error } = await sb
    .from('memberships')
    .select('id, display_name, created_at')
    .eq('state', 'pending')
    .order('created_at', { ascending: true });
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  return {
    ok: true,
    valor: (data ?? []).map((linha) => ({
      id: linha.id as string,
      nome: linha.display_name as string,
      quando: linha.created_at as string,
    })),
  };
}

/**
 * Dizer sim a um pedido.
 *
 * Aprovar é `update` direto e não outra função de servidor, porque aqui a porta
 * não está trancada: `memberships_manage` já exige `manage_company`, que só quem
 * administra tem. Criar uma função para isto seria repetir no código uma
 * permissão que o banco já impõe — e a fundação desta casa é o contrário disso.
 *
 * O papel entra na aprovação e não no pedido: quem pediu não escolhe o que pode
 * fazer.
 */
export async function aprovar(idDaAssociacao: string, capacidades: string[]): Promise<Resultado<true>> {
  const sb = await cliente();
  if (!sb) return semServidor();
  const { error } = await sb
    .from('memberships')
    .update({ state: 'active', capabilities: capacidades })
    .eq('id', idDaAssociacao);
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  return { ok: true, valor: true };
}

/** Dizer não. A linha fica, revogada, porque quem pediu uma vez pode pedir de novo. */
export async function recusar(idDaAssociacao: string): Promise<Resultado<true>> {
  const sb = await cliente();
  if (!sb) return semServidor();
  const { error } = await sb
    .from('memberships')
    .update({ state: 'revoked' })
    .eq('id', idDaAssociacao);
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  return { ok: true, valor: true };
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
  const sb = await cliente();
  if (!sb) return semServidor();
  const { data, error } = await sb.rpc('create_company_for_me', { company_name: nome.trim() });
  if (error) return { ok: false, motivo: motivoDe(error.message), cru: error.message };
  return { ok: true, valor: data as string };
}

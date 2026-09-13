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
  /** O servidor pediu para esperar: tentativas demais em pouco tempo. */
  | 'muitasTentativas'
  /** A sessão guardada neste aparelho não vale mais. Entrar de novo resolve. */
  | 'sessaoVencida'
  /** Nada acima. A mensagem crua vem junto, para o suporte. */
  | 'desconhecido';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: MotivoDaConta; cru?: string };

/** Quem está com a sessão aberta neste aparelho, ou nulo. */
export type Conta = { id: string; email: string | null };

/**
 * Traduz a resposta do servidor num dos motivos — pelo CÓDIGO primeiro, e a prosa como reserva.
 *
 * **O que este docblock dizia, e onde ele parava.** Ele explicava que casar por pedaço da
 * mensagem era deliberado, porque o texto do Supabase muda de versão para versão e casar a
 * frase inteira quebraria em silêncio. Os dois fatos estão certos — e a conclusão era a
 * segunda melhor: a biblioteca instalada JÁ devolve um código estável.
 *
 * Medido no disco em 13 de setembro, não suposto: `node_modules/@supabase/auth-js`, arquivo
 * `dist/module/lib/errors.d.ts:20`, declara `code` em `AuthError`, e `lib/error-codes.d.ts`
 * traz os sete que interessam aqui — `invalid_credentials`, `email_not_confirmed`,
 * `user_already_exists`, `weak_password`, `over_request_rate_limit`, `session_expired` e
 * `session_not_found`.
 *
 * Então o código manda, e a prosa continua existindo para o que ele não cobre: um servidor mais
 * velho que não o preencha, e a falha de REDE — que não é resposta do servidor e por isso não
 * tem código nenhum. Sem a reserva, "sem sinal" viraria "desconhecido" e a tela pediria para
 * conferir e-mail e senha a quem está numa câmara fria.
 *
 * `PGRST301` é do PostgREST e não do `auth`: é a sessão vencida chegando por uma consulta em
 * vez de por um login, e ela pede a mesma coisa — entrar de novo.
 *
 * *Exportada para a régua, com oito chamadores dentro deste arquivo: cai no balde que a
 * varredura de órfãos deste projeto chama de "fronteira larga, não defeito". Sem exportá-la, o
 * único caminho seria fingir um cliente do Supabase inteiro para exercitar uma tabela de
 * tradução — cerimônia que mede o fingimento.*
 */
const PELO_CODIGO: Readonly<Record<string, MotivoDaConta>> = {
  invalid_credentials: 'credenciais',
  email_not_confirmed: 'emailNaoConfirmado',
  user_already_exists: 'emailEmUso',
  weak_password: 'senhaFraca',
  over_request_rate_limit: 'muitasTentativas',
  session_expired: 'sessaoVencida',
  session_not_found: 'sessaoVencida',
  PGRST301: 'sessaoVencida',
};

export function motivoDe(erro: { code?: string; message: string }): MotivoDaConta {
  const pelo = erro.code ? PELO_CODIGO[erro.code] : undefined;
  if (pelo) return pelo;

  const m = erro.message.toLowerCase();
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
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
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
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
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
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
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
 * O que ESTA conta pode fazer, dito pelo servidor.
 *
 * **O buraco que isto fecha, e ele tem duas metades.** `pisoDoAparelho` devolvia
 * `capabilitiesFor('owner')` no modo `personal` — as doze capacidades —, e a suposição
 * embutida é que a conta que entrou é a do dono. Ela é verdadeira na fábrica de hoje e falsa no
 * dia em que o dono criar uma conta restrita, que é uma decisão escrita dele (*"perfil é dado"*)
 * e o caminho normal de quem compra o aplicativo para uma equipe.
 *
 * A primeira metade é dinheiro na tela: aquele aparelho mostraria custo e preço a quem o
 * servidor não deixa ver. A segunda é a fila: com o portão de capacidade no lugar (`src/data/
 * repository.ts`), um piso mais largo que a verdade deixa a linha nascer aqui para o servidor
 * recusá-la com `42501` — e `42501` é passageira, então a fila trava para sempre. As duas
 * metades somem quando o piso é a lista de verdade.
 *
 * Uma consulta e não um campo: `memberships_read` (`0011`) já filtra por associação ATIVA, e
 * `user_id = auth.uid()` restringe à própria linha. A checagem roda antes da consulta, como
 * manda a fundação — não há lista de outra pessoa para filtrar depois.
 *
 * Devolve nulo quando não há linha: conta sem associação ativa (o pedido ainda pendente) não
 * tem capacidade nenhuma a declarar, e nulo é diferente de lista vazia — vazia seria *"o
 * servidor disse que você não pode nada"*.
 */
export async function minhasCapacidades(): Promise<Resultado<string[] | null>> {
  const sb = await cliente();
  if (!sb) return semServidor();
  /**
   * Sem conta aberta devolve NULO e não um motivo novo, e isso é escolha.
   *
   * Um motivo novo obrigaria uma frase nos três idiomas (o `Widen` faz chave nova quebrar a
   * compilação das outras duas), e nenhuma tela mostraria essa frase — quem chama isto é a
   * rodada automática. Chave de dicionário sem leitor é a doença que o portão P1 existe para
   * pegar.
   *
   * E as duas respostas pedem a MESMA ação de quem chama: não há lista para guardar, então o
   * piso do aparelho fica como está. Colapsá-las não perde informação nenhuma.
   */
  const eu = await contaAtual();
  if (!eu) return { ok: true, valor: null };
  const { data, error } = await sb
    .from('memberships')
    .select('capabilities')
    .eq('user_id', eu.id)
    .eq('state', 'active')
    .limit(1);
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
  const linha = data?.[0];
  if (!linha) return { ok: true, valor: null };
  const lista = linha.capabilities;
  return { ok: true, valor: Array.isArray(lista) ? lista.map(String) : [] };
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
    return { ok: false, motivo: motivoDe(error), cru: error.message };
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
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
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
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
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
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
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
  if (error) return { ok: false, motivo: motivoDe(error), cru: error.message };
  return { ok: true, valor: data as string };
}

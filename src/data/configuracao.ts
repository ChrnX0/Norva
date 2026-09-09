/**
 * A configuração da empresa atravessando — a metade que faltava.
 *
 * **O defeito que isto conserta é silencioso e caro.** A aprovação de pedido
 * existe inteira no aparelho: a bandeira mora no `meta`, `saveOrder` nasce
 * `pending` por causa dela, e a decisão vai para a fila. Mas o gatilho
 * `order_starts_where_the_company_says` (`0019`) lê
 * `companies.orders_need_approval` **no servidor** — e ninguém nunca escreveu
 * essa coluna. No dia em que a sincronia subisse, a empresa ligaria a aprovação,
 * o aparelho gravaria `pending`, e o servidor reescreveria para `open` na
 * inserção. A aprovação viraria decoração.
 *
 * E o gatilho está certo: a regra não pode morar no aplicativo quando o pedido
 * vem de fora. O que faltava era a linha de `companies` existir e alguém
 * escrevê-la — e a linha passou a existir com a camada de conta.
 *
 * **Isto não é a fila.** A fila carrega FATO — movimento, leitura, pedido — e é
 * append-only porque fato não se reescreve. Configuração é o contrário: é uma
 * preferência que a empresa muda quando quer, e a última palavra vale. Passá-la
 * pela fila seria gravar no livro-razão que alguém mexeu num interruptor.
 *
 * **Quem manda, e a resposta honesta.** O aparelho continua funcionando offline
 * com a cópia local — ela é a verdade DESTE celular e nunca fica esperando rede.
 * O servidor é a cópia da casa: quem muda, empurra; quem entra, puxa. Sem
 * carimbo de tempo não dá para resolver duas mudanças simultâneas, e não vale
 * inventar um: quem mexe nestes cinco interruptores é o dono, num aparelho, e
 * duas mãos no mesmo interruptor no mesmo minuto não é o problema deste produto.
 *
 * **E por que este arquivo NÃO mora em `src/sync/`.** Uma guarda proíbe a
 * travessia de ler pelo repositório, e a razão dela é o livro-razão: leitura de
 * repositório passa pelo portão do dinheiro, e o celular de quem não vê custo
 * subiria a fila com `unit_cost_rate` nulo — apagando dinheiro do que ATRAVESSA
 * em vez de do que se mostra. Isto aqui não é a travessia: são três interruptores
 * sem portão nenhum. Mas abrir exceção numa guarda que protege o razão para
 * acomodar uma configuração seria pagar caro por conveniência, então quem se
 * move é o arquivo.
 */
import { readMeta, writeMeta } from './meta';
import {
  aplicarConfigDoServidor,
  eraseGraceDays,
  floorSignIn,
  namesWhoRecorded,
  ordersNeedApproval,
  purchaseSafetyDays,
  type FloorSignIn,
} from './repository';

/** As cinco chaves que a empresa combina, do jeito que o servidor as guarda. */
export type ConfiguracaoDaEmpresa = {
  names_who_recorded: boolean;
  floor_sign_in: FloorSignIn;
  orders_need_approval: boolean;
  purchase_safety_days: number;
  /** Nulo é "nunca destrói no servidor", e é uma das três respostas. */
  erase_grace_days: number | null;
};

/**
 * A marca de que este aparelho mexeu num interruptor e a mudança NÃO subiu.
 *
 * **Ela existe por causa de um caminho de perda silenciosa.** O docblock acima
 * decide, com razão, que não há carimbo de tempo e que a última palavra vale —
 * quem mexe nestes interruptores é o dono, num aparelho. O que essa decisão não
 * cobre é o dono mexendo **sem rede**: `empurrar` falha calado (de propósito, e
 * está certo — a mudança já vale neste celular), e a próxima descida sobrescreve
 * a escolha dele com o valor velho do servidor. Ninguém vê, e o interruptor volta
 * sozinho.
 *
 * Isto não é um relógio nem uma resolução de conflito: é uma pergunta de sim ou
 * não — *"o que está aqui já foi contado para a casa?"*. Enquanto a resposta for
 * não, a descida não escreve; ela tenta subir primeiro.
 */
const PENDENTE = 'company.naoSubiu';

/**
 * O que a casa sabe fazer com a configuração — duas perguntas, e nada de rede.
 *
 * A costura existe para este arquivo ter teste. Ele é inteiro sobre COMPORTAMENTO
 * de rede — subiu, não subiu, e o que a descida faz depois — e nada disso se
 * exercita com um cliente de Supabase construído no topo do módulo. É a mesma
 * forma que o motor de sincronia já usa para o relógio: quem chama passa o de
 * verdade, e o teste passa um que responde o que ele precisa provar.
 */
export type Casa = {
  /** Conta para a casa o que este aparelho combinou. `false` é "não chegou". */
  escrever(valores: ConfiguracaoDaEmpresa): Promise<boolean>;
  /** O que a casa combinou, ou nulo quando não deu para perguntar. */
  ler(): Promise<Partial<ConfiguracaoDaEmpresa> | null>;
};

/**
 * A casa de verdade, quando existe servidor.
 *
 * **Sem `where` de empresa, e isso é a fundação e não descuido:**
 * `companies_write` já exige `manage_company`, então o servidor decide ANTES da
 * consulta quais linhas esta conta pode tocar. Carregar o id daqui seria repetir
 * no aplicativo uma permissão que o banco impõe — e repetir permissão é como duas
 * verdades nascem. Sem sessão, ou sem ser quem administra, isto simplesmente não
 * escreve nada.
 */
async function daCasa(): Promise<Casa | null> {
  // Importado AQUI, e não no topo: `@/sync/supabase` arrasta o cliente do
  // servidor e, por baixo dele, o React Native inteiro — e o React Native não
  // atravessa o transformador da suíte de teste. Com o import no topo, este
  // arquivo não podia ser exercitado por teste nenhum, o que é exatamente o que
  // acontecia até agora: o arquivo é todo sobre comportamento de rede e não tinha
  // uma linha de teste.
  const { supabase } = await import('@/sync/supabase');
  const cliente = supabase;
  if (!cliente) return null;
  return {
    escrever: async (valores) => {
      const { error } = await cliente.from('companies').update(valores).not('id', 'is', null);
      return !error;
    },
    ler: async () => {
      const { data, error } = await cliente
        .from('companies')
        .select(
          'names_who_recorded, floor_sign_in, orders_need_approval, purchase_safety_days, erase_grace_days',
        )
        .limit(1);
      if (error || !data?.[0]) return null;
      return data[0] as Partial<ConfiguracaoDaEmpresa>;
    },
  };
}

/** O que este aparelho tem guardado. */
export async function daqui(): Promise<ConfiguracaoDaEmpresa> {
  const [nomes, entrada, aprovacao, folga, prazo] = await Promise.all([
    namesWhoRecorded(),
    floorSignIn(),
    ordersNeedApproval(),
    purchaseSafetyDays(),
    eraseGraceDays(),
  ]);
  return {
    names_who_recorded: nomes,
    floor_sign_in: entrada,
    orders_need_approval: aprovacao,
    purchase_safety_days: folga,
    erase_grace_days: prazo,
  };
}

/**
 * Escreve no aparelho o que veio do servidor.
 *
 * Leitura tolerante de propósito: isto é texto que veio pela rede, e um valor
 * inesperado em `floor_sign_in` não pode derrubar a tela de ajustes. O que não
 * se reconhece cai no padrão, que é o mesmo que o aplicativo usa quando nunca
 * ninguém escolheu.
 */
export async function guardarAqui(vinda: Partial<ConfiguracaoDaEmpresa>): Promise<void> {
  await aplicarConfigDoServidor({
    namesWhoRecorded: vinda.names_who_recorded === true,
    floorSignIn: vinda.floor_sign_in === 'shared' ? 'shared' : 'personal',
    ordersNeedApproval: vinda.orders_need_approval === true,
    // Zero é resposta válida, então o padrão só entra quando NÃO É NÚMERO. Um
    // `|| 2` aqui trocaria "a fábrica não quer folga" por "dois dias" em silêncio,
    // que é a classe de defeito mais cara deste projeto: o número plausível.
    purchaseSafetyDays:
      typeof vinda.purchase_safety_days === 'number' ? vinda.purchase_safety_days : 2,
    // Nulo aqui é RESPOSTA — "nunca destrói no servidor" —, e é por isso que a
    // leitura distingue nulo de ausente: `undefined` cai no padrão de dez, `null`
    // atravessa. Tratar os dois igual apagaria a escolha mais conservadora que a
    // empresa pode fazer.
    eraseGraceDays:
      vinda.erase_grace_days === undefined
        ? 10
        : vinda.erase_grace_days === null
          ? null
          : Number(vinda.erase_grace_days),
  });
}

/**
 * Empurra o que este aparelho combinou para a casa.
 *
 * Silencioso quando falha, e isso é decisão: o dono acabou de mexer num
 * interruptor e a mudança já valeu no aparelho dele. Uma mensagem de erro de
 * rede aqui transformaria uma configuração que funcionou numa que parece ter
 * falhado — e ela não falhou, só ainda não foi contada para a casa.
 */
export async function empurrar(casa?: Casa | null): Promise<boolean> {
  const alvo = casa === undefined ? await daCasa() : casa;
  if (!alvo) return false;
  const deu = await alvo.escrever(await daqui());
  // Falhou: fica a marca, para a próxima descida não passar por cima.
  await writeMeta(PENDENTE, deu ? '' : '1');
  return deu;
}

/** Puxa o que a casa combinou para este aparelho. */
export async function puxar(casa?: Casa | null): Promise<boolean> {
  const alvo = casa === undefined ? await daCasa() : casa;
  if (!alvo) return false;
  // O que está aqui ainda não foi contado para a casa: sobe primeiro. Se subir,
  // a casa passa a concordar com o aparelho e a descida seguinte é inofensiva; se
  // não subir, a descida NÃO acontece — melhor uma configuração velha no servidor
  // do que o interruptor do dono voltando sozinho.
  if ((await readMeta(PENDENTE)) === '1') {
    const subiu = await empurrar(alvo);
    if (!subiu) return false;
    // Subiu: a casa acabou de aprender o que este aparelho tinha, e **a descida
    // para aqui**. Continuar e escrever a leitura da mesma rodada é como o teste
    // desta regra me pegou: a resposta pode ter sido montada antes da minha
    // escrita, e o interruptor do dono voltava — pela mão do conserto que existe
    // para impedir isso. Não há nada a aprender numa rodada em que quem falou fui
    // eu; a próxima descida traz o que a casa tiver de novo.
    return true;
  }
  const vinda = await alvo.ler();
  if (!vinda) return false;
  await guardarAqui(vinda);
  return true;
}

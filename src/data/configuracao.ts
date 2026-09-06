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
import { supabase } from '@/sync/supabase';
import {
  floorSignIn,
  namesWhoRecorded,
  ordersNeedApproval,
  purchaseSafetyDays,
  setFloorSignIn,
  setNamesWhoRecorded,
  setOrdersNeedApproval,
  setPurchaseSafetyDays,
  type FloorSignIn,
} from './repository';

/** As cinco chaves que a empresa combina, do jeito que o servidor as guarda. */
export type ConfiguracaoDaEmpresa = {
  names_who_recorded: boolean;
  floor_sign_in: FloorSignIn;
  orders_need_approval: boolean;
  purchase_safety_days: number;
};

/** O que este aparelho tem guardado. */
export async function daqui(): Promise<ConfiguracaoDaEmpresa> {
  const [nomes, entrada, aprovacao, folga] = await Promise.all([
    namesWhoRecorded(),
    floorSignIn(),
    ordersNeedApproval(),
    purchaseSafetyDays(),
  ]);
  return {
    names_who_recorded: nomes,
    floor_sign_in: entrada,
    orders_need_approval: aprovacao,
    purchase_safety_days: folga,
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
  await Promise.all([
    setNamesWhoRecorded(vinda.names_who_recorded === true),
    setFloorSignIn(vinda.floor_sign_in === 'shared' ? 'shared' : 'personal'),
    setOrdersNeedApproval(vinda.orders_need_approval === true),
    // Zero é resposta válida, então o padrão só entra quando NÃO É NÚMERO. Um
    // `|| 2` aqui trocaria "a fábrica não quer folga" por "dois dias" em silêncio,
    // que é a classe de defeito mais cara deste projeto: o número plausível.
    setPurchaseSafetyDays(
      typeof vinda.purchase_safety_days === 'number' ? vinda.purchase_safety_days : 2,
    ),
  ]);
}

/**
 * Empurra o que este aparelho combinou para a casa.
 *
 * Silencioso quando falha, e isso é decisão: o dono acabou de mexer num
 * interruptor e a mudança já valeu no aparelho dele. Uma mensagem de erro de
 * rede aqui transformaria uma configuração que funcionou numa que parece ter
 * falhado — e ela não falhou, só ainda não foi contada para a casa.
 */
export async function empurrar(): Promise<boolean> {
  if (!supabase) return false;
  // Sem `where` de empresa, e isso é a fundação e não descuido: `companies_write`
  // já exige `manage_company`, então o servidor decide ANTES da consulta quais
  // linhas esta conta pode tocar. Carregar o id daqui seria repetir no aplicativo
  // uma permissão que o banco impõe — e repetir permissão é como duas verdades
  // nascem. Sem sessão, ou sem ser quem administra, isto simplesmente não
  // escreve nada.
  const { error } = await supabase.from('companies').update(await daqui()).not('id', 'is', null);
  return !error;
}

/** Puxa o que a casa combinou para este aparelho. */
export async function puxar(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('companies')
    .select('names_who_recorded, floor_sign_in, orders_need_approval, purchase_safety_days')
    .limit(1);
  if (error || !data?.[0]) return false;
  await guardarAqui(data[0] as Partial<ConfiguracaoDaEmpresa>);
  return true;
}

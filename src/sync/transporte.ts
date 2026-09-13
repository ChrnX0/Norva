import { empresaAdotada } from '@/data/empresa';
import { linhaDaFila, type OutboxEntry } from '@/data/outbox';
import type { PedidoDeDescida, PushResult, Transport } from './engine';
import { APENAS_INSERE, LinhaSumiuError, serialize, type ServerTable, type SyncActor } from './serialize';
import type { ClasseLocal } from './recusa';

/**
 * O caminho de verdade entre a fila e o servidor — a peça que faltava.
 *
 * Tudo atrás dela existia há dias: o motor com as três regras (`engine.ts`), a fila
 * append-only (`outbox.ts`), o tradutor de colunas (`serialize.ts`), a conta
 * (`conta.ts`) e a empresa adotada (`empresa.ts`). O que não existia era **uma
 * implementação de `Transport`** — e sem ela nada nunca saiu deste aparelho.
 *
 * **Uma linha por vez, na ordem em que a fábrica gravou.** Parece desperdício e é a
 * regra: a fila é escrita em ordem de dependência (o tipo antes do produto, o lugar
 * antes do movimento), e agrupar por tabela para mandar em lote reordenaria tudo —
 * o servidor recusaria por chave estrangeira, e o motor pararia no primeiro buraco
 * com a fila inteira presa atrás. O motor já manda em fatias de cem; dentro da
 * fatia, a ordem é sagrada.
 *
 * **Para no primeiro erro, e isso é decisão do motor, não daqui.** O que voltou
 * como aceito é o que o servidor guardou; o resto fica na fila exatamente onde
 * estava. Continuar depois de uma recusa mandaria linhas cujos pais o servidor não
 * tem, e transformaria uma recusa em muitas.
 *
 * **E ele não lê pelo repositório.** A guarda de camadas proíbe, com a razão
 * escrita: toda leitura de repositório filtra, arredonda ou esconde algo para uma
 * tela — inclusive o portão do dinheiro —, e o que atravessa não pode depender de
 * quem estava com o aparelho na hora de sincronizar. Aqui a linha vem crua.
 */
/**
 * O que o servidor respondeu quando recusou — e o CÓDIGO é metade disto.
 *
 * Antes daqui saía só a frase (`Promise<string | null>`), e o código era descartado uma linha
 * antes de poder ser usado: `return error ? error.message : null`. O objeto do PostgREST
 * carrega `code` — o `SQLSTATE` do Postgres —, e é ele que separa "o servidor está ocupado"
 * de "esta remessa já foi conferida". Sem o código, a fila trata as duas do único jeito
 * seguro que lhe resta: tentar de novo para sempre, presa na segunda.
 *
 * A frase fica porque ela é o que chega à tela; o código entra porque ele é o que decide.
 */
export type ProblemaDoServidor = {
  /** O `SQLSTATE`, quando o servidor manda um. Nulo quando a falha é de rede ou de cliente. */
  codigo: string | null;
  mensagem: string;
};

export type Casa = {
  /** Escreve uma linha. Devolve o problema do servidor, ou nulo quando deu certo. */
  escrever(
    tabela: ServerTable,
    linha: Record<string, unknown>,
    apenasInsere: boolean,
  ): Promise<ProblemaDoServidor | null>;
  /**
   * Lê uma página, na ordem do cursor. O outro sentido.
   *
   * O razão vem pela VIEW e não pela tabela: `movements_visible` põe o portão do dinheiro
   * do lado de dentro da consulta (`security_invoker` mais `has_capability`), então um
   * aparelho sem `view_cost` recebe a linha com o custo NULO em vez de recebê-lo e
   * esconder na tela. Esconder na tela é decoração; a fundação desta casa manda a
   * permissão morar na consulta.
   */
  ler(
    pedido: PedidoDeDescida,
  ): Promise<{ linhas: Record<string, unknown>[]; erro?: ProblemaDoServidor }>;
};

/**
 * A casa de verdade: o cliente do Supabase, quando há servidor configurado.
 *
 * O import é PREGUIÇOSO, e isso não é estilo: `./supabase` arrasta o cliente do
 * servidor e, por baixo dele, o React Native inteiro — que não atravessa o
 * transformador da suíte. Com o import no topo, este arquivo não pode ser exercitado
 * por teste nenhum, e ele é justamente o que decide se a fila anda ou trava. Foi o
 * mesmo defeito que deixou `configuracao.ts` sem uma linha de teste por dias, e agora
 * existe guarda para os dois em `src/layers.test.ts`.
 */
export async function casaDoServidor(): Promise<Casa | null> {
  const { supabase } = await import('./supabase');
  const cliente = supabase;
  if (!cliente) return null;
  return {
    escrever: async (tabela, linha, apenasInsere) => {
      const { error } = await cliente
        .from(tabela)
        // `ignoreDuplicates` é o que separa corrigir de reescrever, e quem decide é
        // a política do servidor: onde não há `for update`, mandar `on conflict do
        // update` é pedir uma permissão que a conta não tem — e a resposta é
        // `permission denied` sem dizer qual das duas falta.
        .upsert(linha, { onConflict: 'id', ignoreDuplicates: apenasInsere });
      if (!error) return null;
      // `code` é o `SQLSTATE` quando o erro veio do Postgres, e ausente quando ele veio da
      // rede ou do cliente — e ausente é exatamente o que `classeDaRecusa` trata como
      // passageiro. Nada aqui decide: quem decide é a lista, num arquivo puro.
      const codigo = typeof error.code === 'string' && error.code.length > 0 ? error.code : null;
      return { codigo, mensagem: error.message };
    },

    ler: async (p) => {
      // A view para o razão, a tabela para o resto. `movements` é a única que tem dinheiro
      // dentro, e é a única cuja leitura precisa passar pelo portão.
      const de = p.tabela === 'movements' ? 'movements_visible' : p.tabela;
      let q = cliente
        .from(de)
        .select(p.colunas.join(','))
        .order('received_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(p.limite);

      // O par ordenado: "depois deste relógio, ou no mesmo relógio com id maior". Sem a
      // segunda metade, a segunda linha de um lote que entrou na mesma transação — mesmo
      // `now()` — fica do lado errado do "maior que" e some para sempre.
      if (p.depoisDe) {
        const { recebidoEm, id } = p.depoisDe;
        q = q.or(`received_at.gt.${recebidoEm},and(received_at.eq.${recebidoEm},id.gt.${id})`);
      }

      const { data, error } = await q;
      if (error) {
        const codigo = typeof error.code === 'string' && error.code.length > 0 ? error.code : null;
        return { linhas: [], erro: { codigo, mensagem: error.message } };
      }
      return { linhas: (data ?? []) as unknown as Record<string, unknown>[] };
    },
  };
}

/**
 * O transporte que o motor usa.
 *
 * A casa entra por parâmetro para o teste poder responder o que ele precisa provar —
 * a mesma costura que a configuração da empresa já usa, e pelo mesmo motivo: o
 * cliente do servidor arrasta o React Native, que não atravessa o transformador da
 * suíte.
 */
export function transporte(actor: SyncActor, casa?: Casa | null): Transport {
  return {
    push: async (entries: readonly OutboxEntry[]): Promise<PushResult> => {
      const alvo = casa === undefined ? await casaDoServidor() : casa;
      // Duas travas antes de falar com a rede, e as duas dizem a mesma coisa de
      // formas diferentes: sem empresa adotada o carimbo das linhas é a semente, que
      // o servidor não conhece; sem casa não há para onde mandar. O motor também
      // recusa a primeira — aqui é cinto e suspensório, porque este módulo é o que
      // um dia vai ser chamado de outro lugar.
      if (!alvo || !empresaAdotada()) return { acceptedIds: [] };

      const aceitos: string[] = [];
      /**
       * A culpada, com o código do servidor — e ela SEMPRE foi conhecida aqui.
       *
       * Este laço manda linha por linha e para na primeira que falha, então o `break` de
       * baixo sabia exatamente quem era. O que faltava era o contrato ter onde dizer:
       * `PushResult` tinha um campo só, `acceptedIds`, e o motor recebia apenas "entraram
       * menos do que eu mandei" — que ele tratava como lacuna passageira, para sempre.
       *
       * Quem decide se a recusa é definitiva não é este arquivo: é `classeDaRecusa`, numa
       * lista curta e num arquivo puro. Aqui só se relata.
       */
      const rejeitadas: { id: string; codigo: string | null; local?: ClasseLocal }[] = [];
      for (const entry of entries) {
        // **Exceção no meio da fatia não pode apagar o que o servidor já guardou.**
        //
        // `linhaDaFila` lança quando a linha sumiu do aparelho e `serialize` lança
        // quando a área ou a tabela não é conhecida. Sem este `try`, a exceção sobe
        // até o `catch` do motor, que não marca NADA — e as noventa e nove entradas
        // que o servidor acabou de aceitar voltam a parecer pendentes. Na corrida
        // seguinte elas sobem de novo: o servidor as reescreve (upsert), então não há
        // dano de dado, mas há a mesma parede na centésima entrada, para sempre, e a
        // mensagem que chega à tela do dono é a do programador, em inglês.
        //
        // **E a falha local volta NOMEADA, em vez de virar lacuna do servidor.**
        //
        // Este `catch` era `break` mudo, e o efeito era pior do que parecia. O motor recebia
        // "entraram menos do que eu mandei", lia isso como lacuna do servidor, gastava
        // tentativa, esperava e repetia — para sempre, porque retentativa não conserta linha
        // que sumiu do aparelho nem tabela que ninguém ensinou a atravessar. A fila daquele
        // celular parava, e a tela dizia *"o servidor aceitou N de M registros"* sobre uma
        // linha que o servidor NUNCA VIU. Quem fosse depurar olharia o servidor.
        //
        // Agora a culpada volta com classe LOCAL — sem código, porque não houve Postgres —,
        // e `ehDefinitiva` a põe de lado. Parar continua certo (mandar o que vem depois
        // transformaria uma recusa em muitas), e o que muda é que a fila volta a andar na
        // rodada seguinte em vez de bater na mesma parede.
        let write;
        try {
          const linha = await linhaDaFila(entry);
          write = serialize(entry, linha, actor);
        } catch (e) {
          rejeitadas.push({
            id: entry.id,
            codigo: null,
            local: e instanceof LinhaSumiuError ? 'linhaSumiu' : 'tabelaDesconhecida',
          });
          break;
        }

        // Valor derivado tem um dono só, e é o servidor: a entrada sai da fila sem
        // viajar, senão ela fica presa para sempre esperando uma viagem que não existe.
        if (write.kind === 'derived') {
          aceitos.push(entry.id);
          continue;
        }
        if (write.kind !== 'upsert') continue;

        const problema = await alvo.escrever(
          write.table,
          write.row,
          (APENAS_INSERE as readonly string[]).includes(write.table),
        );
        // Para no primeiro buraco. O que já foi aceito volta aceito — e agora a culpada
        // volta com ele, nomeada, em vez de morrer neste `break`.
        if (problema !== null) {
          rejeitadas.push({ id: entry.id, codigo: problema.codigo });
          break;
        }
        aceitos.push(entry.id);
      }
      return { acceptedIds: aceitos, rejeitadas };
    },
  };
}

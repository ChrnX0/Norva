/**
 * Uma rodada de DESCIDA: o que o servidor já sabe, chegando neste aparelho.
 *
 * O motor da subida (`engine.ts`) e este são deliberadamente separados, e não por gosto: a
 * subida tem FILA — ela retenta, classifica recusa, põe de lado o que nunca vai entrar — e a
 * descida não tem nada disso. O que desce ou entrou ou não entrou, e não entrar é apenas
 * "tenta de novo daqui a pouco", porque o cursor não avançou. Fundir os dois faria a
 * máquina de estados da fila valer para um lado que não tem estado.
 *
 * ## O que ela garante, na ordem
 *
 * **Tabela por tabela, na ordem das chaves estrangeiras** (`DESCEM`): item antes do
 * movimento que o cita, receita antes da versão. O aparelho tem `foreign_keys` ligado, então
 * a ordem errada não corrompe — ela RECUSA, e a fábrica perderia exatamente os movimentos
 * mais novos, calada.
 *
 * **Página por página, até a tabela secar.** Uma página curta quer dizer "acabou"; uma
 * página cheia quer dizer que pode haver mais, e o laço continua. O teto de páginas por
 * rodada existe para um aparelho novo, entrando numa fábrica com anos de histórico, não
 * segurar a abertura do aplicativo — ele volta na rodada seguinte, de onde parou.
 *
 * **O cursor avança DEPOIS da gravação, e só se ela deu certo.** `gravarPagina` é uma
 * transação; o cursor é escrito fora dela, com a página já no disco. A ordem inversa —
 * cursor primeiro — perderia a página inteira numa queda, para sempre, sem nada na tela.
 *
 * **A média de custo é recomposta para os ITENS cujo razão andou.** `recomputeItemCost` é o
 * que transforma movimento em número de custo, e ele roda dentro da escrita local; o que
 * desce não passa por ali. A descida junta os itens que apareceram nas páginas de
 * `movements` e recompõe cada um UMA vez, no fim — recompor por linha refaria a mesma conta
 * cinquenta vezes, com respostas intermediárias erradas no meio.
 */
import { readMeta, writeMeta } from '@/data/meta';
import { honrarDecisoes } from '@/data/candidata';
import { gravarPagina, recomporCustos } from '@/data/descida';
import type { Transport } from './engine';
import {
  DESCEM,
  chaveDoCursor,
  cursorDeTexto,
  cursorParaTexto,
  pedido,
  proximoCursor,
} from './descida';

export type RelatorioDaDescida = {
  /** Quantas linhas entraram, somando todas as tabelas. */
  linhas: number;
  /** Quantas tabelas trouxeram alguma coisa — para a tela dizer "chegou" sem contar linha. */
  tabelas: number;
  /** Presente quando a rodada parou antes de secar. O cursor fica onde estava. */
  erro?: string;
};

/**
 * O teto de páginas por tabela numa rodada.
 *
 * Cinquenta páginas de quinhentas linhas são vinte e cinco mil linhas por tabela — mais do
 * que uma fábrica gera em muitos meses. O teto não é sobre volume normal: é sobre o aparelho
 * novo que entra numa empresa com histórico e não pode ficar preso na primeira abertura.
 * Atingido o teto, o cursor está gravado e a rodada seguinte continua exatamente dali.
 */
const PAGINAS_POR_RODADA = 50;

export async function descer(transporte: Transport, empresa: string): Promise<RelatorioDaDescida> {
  if (!transporte.pull) return { linhas: 0, tabelas: 0, erro: 'semDescida' };

  let linhas = 0;
  let tabelas = 0;
  const itensQueMexeram = new Set<string>();

  for (const tabela of DESCEM) {
    const chave = chaveDoCursor(tabela);
    let cursor = cursorDeTexto(await readMeta(chave));
    let trouxe = 0;

    for (let pagina = 0; pagina < PAGINAS_POR_RODADA; pagina += 1) {
      const p = pedido(tabela, cursor);
      const resposta = await transporte.pull(p);
      if (resposta.erro) {
        // Parar a TABELA e seguir para a próxima seria pular dependência: o movimento desce
        // depois do item, e sem o item ele é recusado. Parar a rodada inteira deixa tudo
        // como estava, e a próxima tenta do mesmo ponto.
        return { linhas, tabelas, erro: resposta.erro.mensagem };
      }
      if (resposta.linhas.length === 0) break;

      trouxe += await gravarPagina(tabela, p.colunas, resposta.linhas);
      if (tabela === 'movements') {
        for (const linha of resposta.linhas) {
          const item = linha.item_id;
          if (typeof item === 'string') itensQueMexeram.add(item);
        }
      }
      cursor = proximoCursor(cursor, resposta.linhas);
      await writeMeta(chave, cursorParaTexto(cursor));

      if (resposta.linhas.length < p.limite) break;
    }

    if (trouxe > 0) {
      linhas += trouxe;
      tabelas += 1;
    }
  }

  // Só depois de tudo: cada uma lê o razão inteiro daquele item, e a resposta certa só
  // existe com todas as páginas no disco.
  await recomporCustos(empresa, itensQueMexeram);

  /**
   * E a decisão que desceu VIRA razão aqui, não na tela.
   *
   * Depois da recomposição de propósito: `honrarDecisoes` escreve estorno, e estorno mexe na
   * média — ela mesma recompõe o item que tocou. Chamá-la antes faria a recomposição de cima
   * ler um razão que ia mudar logo em seguida.
   *
   * Depois de TODAS as tabelas, também de propósito: a candidata desce por último (ver
   * `DESCEM`) justamente para o razão já estar no disco quando ela chegar. Honrar no meio
   * decidiria com meio razão.
   */
  await honrarDecisoes(empresa);

  return { linhas, tabelas };
}

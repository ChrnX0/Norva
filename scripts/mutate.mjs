#!/usr/bin/env node
/**
 * Asks the only question a green suite cannot answer on its own: would these
 * tests still pass if the code were wrong?
 *
 * It breaks the code on purpose, one defect at a time, runs the suite, and puts
 * the file back. A defect nobody notices is a hole in the bar, and the run
 * fails on it.
 *
 * The list is curated rather than random, and that is deliberate. Blind
 * mutation spends most of its time on changes nobody would ever make; this one
 * carries the defects that would actually hurt in this product - money rounding
 * the wrong way, a permission check that stops checking, a balance that counts
 * instead of summing. Each entry is a sentence about what would go wrong in the
 * factory if it slipped through.
 *
 * The first run of this found `Math.round` in `amountOf` could become
 * `Math.floor` with ninety-two tests staying green - the project's headline
 * rule about money held up by nothing but arithmetic coincidence.
 *
 * Add to the list whenever a defect gets fixed: the mutation is the cheapest
 * possible proof that the test written alongside it actually bites.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { spawnSync } from 'node:child_process';

/** @type {{file: string, from: string, to: string, hurts: string}[]} */
const DEFECTS = [
  // --- a camara fria invisivel para o aviso de validade, 4 de setembro -------
  //
  // Achado da auditoria. O filtro por almoxarifado silenciava o aviso EXATAMENTE
  // no dia em que o picolé ia para a câmara — que é o dia seguinte ao de
  // produzi-lo, numa fábrica de picolés.
  {
    file: 'app/(tabs)/index.tsx',
    from: '      expiringSoon(empresaDaqui(), trintaDias, 5, { unidade: unidadeDaqui() }),',
    to: '      expiringSoon(empresaDaqui(), trintaDias, 5, { sala: unidadeDaqui() }),',
    hurts:
      'o cartao de validade da capa volta a olhar so o almoxarifado, e emudece no dia em que o lote vai para a camara fria ou para a loja - o produto vence longe dos olhos e o aviso nunca toca',
  },

  // --- o estorno que devolvia a quantidade e nao o dinheiro, 4 de setembro ---
  //
  // Achado da auditoria. O saldo voltava certinho e a media movel ficava com o
  // erro dentro para sempre, embaixo de todo numero de dinheiro do aplicativo.
  {
    file: 'src/data/repository.ts',
    from: '  for (const itemId of new Set(plan.legs.map((l) => l.itemId))) {',
    to: '  for (const itemId of new Set([])) {',
    hurts:
      'estornar volta a devolver so a quantidade: quem digitou 50 onde sairam 500 conserta o estoque e fica com o custo dez vezes alto embaixo de "dinheiro parado", do valor de cada lugar e do valor da carga que chega na loja',
  },
  {
    file: 'src/data/repository.ts',
    // Âncora refeita em 9 de setembro: a ordenação passou a desempatar por `m.rowid`
    // em vez de `m.id`, e o literal antigo deixou de existir.
    from: "        AND m.kind <> 'reversal'\n        AND ${NAO_ESTORNADO}\n      ORDER BY m.occurred_at, m.recorded_at, m.rowid",
    to: "      ORDER BY m.occurred_at, m.recorded_at, m.rowid",
    hurts:
      'a recomposicao do custo passa a contar a corrida errada E a perna do estorno, entao a media fica no valor envenenado com a quantidade certa - o estorno vira maquiagem',
  },

  // --- o apagador que conhecia 12 das 21 tabelas, 4 de setembro -------------
  //
  // A guarda que devia pegar isto comparava uma lista escrita a mao consigo
  // mesma. Agora ela LE o esquema, e estas duas mutacoes provam que ela le.
  {
    file: 'src/data/erase.ts',
    from: "        'lots',\n",
    to: '',
    hurts:
      'lots volta a ficar de pe quando "apagar tudo" some com items, e o DELETE levanta FOREIGN KEY: a transacao inteira volta atras, nada e apagado, e a tela mostra erro cru de SQLite em ingles depois do toque',
  },
  {
    file: 'src/data/erase.ts',
    from: "      return { ...nothing, purchases: counts.purchases, movements: counts.movements };",
    to: '      return { ...nothing, purchases: counts.purchases };',
    hurts:
      'apagar "compras" volta a levar TODO movimento da fabrica sem dizer: a confirmacao fala so de custo medio, e producao, contagem, perda e transferencia somem sem aviso e sem volta',
  },

  // --- a luz da tela, 4 de setembro ----------------------------------------
  //
  // O dono abriu o Papel num celular em modo escuro e nao teve como trocar. O
  // erro nao era de codigo: claro contra escuro e preferencia de quem segura o
  // aparelho, entao tinha que ser dado com os dois caminhos, e a unica pergunta
  // legitima era qual e o padrao. Duas mutacoes, uma por metade da regra.
  {
    file: 'src/theme/scheme.ts',
    from: "  if (escolha === 'claro') return 'light';",
    to: "  if (escolha === 'claro') return doAparelho === 'dark' ? 'dark' : 'light';",
    hurts:
      'escolher Claro volta a nao valer nada: quem esta com o celular no escuro fica preso no escuro com o botao Claro aceso na tela, que e o defeito relatado com um rotulo mentindo por cima',
  },
  {
    file: 'src/theme/scheme.ts',
    from: "export const SCHEME_PADRAO: SchemeChoice = 'claro';",
    to: "export const SCHEME_PADRAO: SchemeChoice = 'sistema';",
    hurts:
      'o padrao deixa de ser o claro que o dono decidiu e volta a ser o do aparelho: quem instala num celular escuro abre no escuro sem ter pedido',
  },

  // --- o rótulo que conta uma variável e nomeia outra, 4 de setembro --------
  //
  // Trinta e um defeitos da mesma família num dia, e nenhum deles é erro de
  // conta: o número está certo e a palavra ao lado afirma outra coisa sobre
  // ele. As três regras que ganharam código nesse dia ganham mutação aqui,
  // porque regra nova sem mutação é regra protegida por coincidência — e duas
  // das asserções que existiam passavam vacuamente, o que é pior que faltar.
  {
    file: 'src/data/seed.ts',
    from: '  return (found?.n ?? 0) > 0;',
    to: '  return true;',
    hurts:
      'o selo "inclui os dados de exemplo" volta a ser permanente: acende em todo aparelho para sempre, inclusive depois de apagar tudo e cadastrar o primeiro insumo proprio',
  },
  {
    file: 'src/data/repository.ts',
    from: '            COUNT(DISTINCT o.id) AS orders,',
    to: '            1 AS orders,',
    hurts:
      'a dica da separacao volta ao singular somando varios pedidos: "pedido para 04/09: 420 un" com dois pedidos em aberto e a data so do primeiro',
  },
  {
    file: 'src/data/repository.ts',
    from: `        baseUnits: r.total,
        baseUnit: r.base_unit,`,
    to: `        baseUnits: r.total,
        baseUnit: 'un',`,
    hurts:
      'seis quilos de acucar voltam a ser "6.000 unidades" na capa e na aba de transporte: a unidade existe no tipo e diz a coisa errada, que e pior que nao existir',
  },

  // --- o que estava dentro da câmara quando a leitura saiu da faixa ---------
  //
  // A dobra em memória que prometia isso morreu por forma; a consulta é SQL, e o
  // corte no tempo é a regra inteira.
  {
    file: 'src/data/repository.ts',
    from: `        AND m.occurred_at <= ?
      GROUP BY l.id, l.code, i.name, l.expires_on`,
    to: `      GROUP BY l.id, l.code, i.name, l.expires_on`,
    hurts:
      'a camara passa a listar o que esta la AGORA em vez do que estava na hora da leitura ruim, e o recall perde justamente o lote que ja viajou',
  },

  // --- a seção de dicionário que ninguém lê ---------------------------------
  //
  // O CLAUDE.md cita "quatro seções de dicionário nos três idiomas sem uma tela"
  // ao explicar por que o portão virou por item. Quando eu varri, eram sete.
  {
    file: 'src/i18n/locales/pt-BR.ts',
    from: `  posts: {`,
    to: `  postsSemLeitor: {`,
    hurts:
      'uma secao de dicionario passa a nao ter leitor nem motivo escrito, e volta a parecer viva para quem for renomear o texto',
  },

  // --- o seletor do e2e contra o dicionário --------------------------------
  //
  // O defeito que esta guarda pega custou um CI vermelho de vinte minutos: um
  // rótulo renomeado numa linha de tradução, e três checagens do navegador
  // esperando trinta segundos cada por um campo que não existe mais.
  {
    file: 'src/i18n/locales/pt-BR.ts',
    from: "      howMany: 'Quantidade, em {{pack}}',",
    to: "      howMany: 'Quantas {{pack}}',",
    hurts:
      'um rotulo renomeado deixa tres seletores do e2e procurando um campo que nao existe, e a suite so descobre no navegador vinte minutos depois',
  },

  // --- a lista de compras de um plano -------------------------------------
  {
    file: 'src/domain/recipe.ts',
    from: '      return { itemId, needed: amount, held, missing: Math.max(0, amount - held) };',
    to: '      return { itemId, needed: amount, held, missing: amount };',
    hurts:
      'a lista de compras volta a dizer o que a receita pede em vez do que falta: quem tem 40.000 g de polpa na prateleira e um plano de 54.000 le "compre 54.000"',
  },
  {
    file: 'src/domain/recipe.ts',
    from: '    const units = (netYieldOf(recipe) * line.batches) / perUnit;',
    to: '    const units = line.batches;',
    hurts:
      'o palito e o saquinho entram na lista de compras por TACHO em vez de por unidade: um tacho de quinhentos picoles pede um palito',
  },

  {
    file: 'src/data/repository.ts',
    from: '       LEFT JOIN order_lines ol ON ol.item_id = p.item_id',
    to: '       JOIN order_lines ol ON ol.item_id = p.item_id',
    hurts:
      'a consulta volta a partir da linha de pedido: produto sem pedido some, e a tela de anotar pedido fica sem dica nenhuma no primeiro pedido do dia',
  },

  // --- qual ficha rodou, que o lote passou a carimbar ----------------------
  {
    file: 'src/data/repository.ts',
    from: '      [lotId, companyId, product.itemId, code, input.producedOn, expires, recipe.versionId, at],',
    to: '      [lotId, companyId, product.itemId, code, input.producedOn, expires, product.recipeId, at],',
    hurts:
      'o lote volta a carimbar o id da RECEITA onde vai o da versao: corrigir a formula em marco reescreve de que ficha saiu o que janeiro produziu',
  },
  {
    file: 'src/data/repository.ts',
    from: '    [id, companyId, product.id, recipe.versionId, input.batches, locationId, at],',
    to: '    [id, companyId, product.id, product.recipeId, input.batches, locationId, at],',
    hurts:
      'a corrida aberta grava o id da receita na coluna da versao - um uuid legitimo no lugar errado, que so aparece no dia em que alguem for perguntar qual ficha rodou',
  },

  // --- o estorno e o custo do que sai do tacho, que entraram hoje -----------
  //
  // Regra nova sem mutação é regra protegida por coincidência: a suíte fica
  // verde porque os exemplos escolhidos não a exercitam. Estas seis quebram de
  // propósito o que o estorno e a média do produto prometem.
  {
    file: 'src/data/repository.ts',
    from: `        AND ${'${recorte.sql}'}
        AND ${'${NAO_ESTORNADO}'}
      GROUP BY m.item_id, i.name`,
    to: `        AND ${'${recorte.sql}'}
      GROUP BY m.item_id, i.name`,
    hurts:
      'a corrida corrigida volta a contar como produzida: o almoxarifado fica certo e "produzido hoje" continua dizendo o numero errado',
  },
  {
    file: 'src/data/repository.ts',
    from: '  if (plan.alreadyReversed || plan.blocked.length > 0) throw new CannotReverseError(plan);',
    equivalente:
      'o estorno tem DUAS checagens em camadas — a de fora evita abrir transacao, a de dentro fecha a corrida entre dois aparelhos. Tirar uma deixa a outra pegando, com o mesmo erro e o mesmo plano, entao nenhum teste de uma linha de execucao so pode distinguir. So concorrencia real separaria as duas, e a suite nao tem duas conexoes.',
    to: '  if (plan.alreadyReversed) throw new CannotReverseError(plan);',
    hurts:
      'estornar uma corrida cujos picoles ja viajaram deixa saldo negativo na fabrica, e saldo negativo o livro-razao nao desfaz depois',
  },
  {
    file: 'src/data/repository.ts',
    from: `    const dentro = await planReversal(companyId, input.groupId, input.apenas);
    if (dentro.alreadyReversed || dentro.blocked.length > 0) throw new CannotReverseError(dentro);`,
    equivalente:
      'o estorno tem DUAS checagens em camadas — a de fora evita abrir transacao, a de dentro fecha a corrida entre dois aparelhos. Tirar uma deixa a outra pegando, com o mesmo erro e o mesmo plano, entao nenhum teste de uma linha de execucao so pode distinguir. So concorrencia real separaria as duas, e a suite nao tem duas conexoes.',
    to: `    const dentro = await planReversal(companyId, input.groupId, input.apenas);
    if (dentro.alreadyReversed && false) throw new CannotReverseError(dentro);`,
    hurts:
      'dois aparelhos estornam a mesma corrida no mesmo minuto e a correcao entra duas vezes, dobrada',
  },
  {
    file: 'src/data/repository.ts',
    from: `      WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind <> 'reversal'
        \${escopo}
      ORDER BY m.quantity_base_units DESC`,
    to: `      WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind = 'production'
        \${escopo}
      ORDER BY m.quantity_base_units DESC`,
    hurts:
      'o estorno desfaz so a producao e deixa o consumo de pe: picole que nao consumiu nada, que parece certo e some com o insumo',
  },
  {
    file: 'src/data/repository.ts',
    // Âncora refeita em 9 de setembro: o cálculo virou laço de recomposição, e o
    // literal antigo não existia mais — mutação com âncora cega não testa nada e ainda
    // entra na conta como defeito que atravessou.
    from: `        averageRate: blendRate(estado, {
          baseUnits: l.quantity_base_units,
          rate: l.unit_cost_rate as Rate,
        }),`,
    to: `        averageRate: estado.averageRate,`,
    hurts:
      'o produto fabricado volta a valer o que valia antes da corrida - zero, na primeira - e o dinheiro evapora do balanco a cada tacho',
  },
  {
    file: 'src/domain/cost.ts',
    from: '  return ((held.averageRate * heldUnits + arriving.rate * arriving.baseUnits) / total) as Rate;',
    to: '  return arriving.rate;',
    hurts:
      'a media do produto vira o custo da ULTIMA corrida em vez da media do que esta em maos, e o estoque antigo passa a valer o preco de hoje',
  },

  {
    file: 'src/domain/picking.ts',
    // Âncora refeita em 9 de setembro: a expressão de várias linhas virou um `if`
    // de uma, e o literal antigo deixou de existir. A troca continua a mesma —
    // `every` por `some` faz carga parcial fechar o pedido inteiro.
    from: '    if (!order.lines.every((line) => (sobra.get(line.itemId) ?? 0) >= line.baseUnits)) continue;',
    to: '    if (!order.lines.some((line) => (sobra.get(line.itemId) ?? 0) >= line.baseUnits)) continue;',
    hurts:
      'carga parcial passa a fechar o pedido inteiro: a loja fica sem quarenta caixas e o sistema diz que entregou',
  },

  {
    file: 'src/data/repository.ts',
    from: `  return moveBetween(companyId, input, 'return');`,
    to: `  return moveBetween(companyId, input, 'transfer');`,
    hurts:
      'a devolucao volta a ser gravada como carga, e "mandei 6.000 e voltaram 1.000" fica identico a "mandei 5.000" no livro-razao',
  },

  {
    file: 'src/domain/briefing.ts',
    from: '  return [...ordenadas, ...novas].filter((w) => !escondidas.has(w));',
    to: '  return [...ordenadas, ...novas];',
    hurts:
      'o que o aparelho escondeu volta a aparecer na capa, e quem tirou o cartao de preco do caminho na camara fria o encontra la de novo',
  },
  {
    file: 'src/domain/briefing.ts',
    from: '  const ordenadas = companyOrder.filter((w): w is BriefingWidget => known.has(w));',
    to: '  const ordenadas = companyOrder as BriefingWidget[];',
    hurts:
      'uma peca que saiu do catalogo continua na preferencia guardada e a capa quebra na atualizacao, no aparelho de quem ja usava',
  },

  {
    file: 'src/domain/picking.ts',
    from: '  if (sources.ordered != null) return Math.max(0, sources.ordered - sources.alreadySent);',
    to: '  if (sources.lastSent != null) return sources.lastSent;',
    hurts:
      'a separacao volta a sugerir o envio da semana passada em vez do que a loja pediu, e quem esta com a lista na mao repete o habito em vez de atender o combinado',
  },
  {
    file: 'src/domain/picking.ts',
    from: '  if (sources.ordered != null) return Math.max(0, sources.ordered - sources.alreadySent);',
    to: '  if (sources.ordered != null) return sources.ordered;',
    hurts:
      'a segunda viagem ao freezer volta a oferecer o pedido inteiro: quem mandou 300 de um pedido de 500 ve 500 de novo no campo, e a loja recebe 800',
  },
  {
    file: 'src/domain/picking.ts',
    from: `    if (order.placeId === input.toPlaceId) continue;
    if (order.requestedFor !== null && order.requestedFor > input.through) continue;`,
    to: `    if (order.requestedFor !== null && order.requestedFor > input.through) continue;`,
    hurts:
      'a carga que vai ATENDER um pedido passa a ser avisada como se roubasse dele, em toda carga legitima - e alerta que aparece sempre ensina a ignorar alerta',
  },
  {
    file: 'src/domain/picking.ts',
    from: `    if (order.placeId === input.toPlaceId) continue;
    if (order.requestedFor !== null && order.requestedFor > input.through) continue;`,
    to: `    if (order.placeId === input.toPlaceId) continue;`,
    hurts:
      'pedido para daqui a cinco semanas volta a disputar o caminhao de hoje, e o aviso dispara sobre uma promessa que a fabrica tem um mes para cumprir',
  },
  {
    file: 'src/domain/picking.ts',
    from: '    short: Math.max(0, promised - (input.onHand - input.amount)),',
    to: '    short: Math.max(0, promised - input.onHand),',
    hurts:
      'o aviso para de olhar a quantidade digitada: mandar dez unidades passa a acusar a mesma falta que mandar o freezer inteiro',
  },
  {
    file: 'src/data/repository.ts',
    from: `        AND o.place_id = ?
        AND o.status IN ('pending', 'open')`,
    to: `        AND o.status IN ('pending', 'open')`,
    hurts:
      'a lista de separacao passa a somar o pedido de TODAS as lojas, e a carga da loja centro sai com o que era da loja norte',
  },

  {
    file: 'src/data/repository.ts',
    // A troca é sempre-verdadeira em vez de apagar a linha, e é de propósito:
    // apagar mudaria a ARIDADE do comando (dois `?` a menos) e o SQLite recusaria
    // por parâmetro sobrando. A mutação seria "pega" por um erro de ligação, que
    // não prova nada sobre a regra — mede o binder, não o filtro.
    from: 'sql: `(? IS NULL OR ${coluna} = ?)',
    to: 'sql: `(? IS NULL OR ? IS NOT NULL)',
    hurts:
      'o almoxarifado volta a somar a empresa inteira mesmo quando perguntam por uma sala, e quem esta no tacho ve 34 kg de polpa que estao na camara fria',
  },

  {
    file: 'src/data/repository.ts',
    from: `    const gasto = linha.quantityPerUnit * input.unitsProduced;`,
    to: `    const gasto = linha.quantityPerUnit * input.batches;`,
    hurts:
      'o palito passa a ser gasto por TACHO em vez de por unidade, e a corrida de 500 picoles baixa um palito do almoxarifado',
  },

  // **A âncora ganhou contexto em 11 de setembro, e a irmã dela nasceu junto.**
  //
  // O `from` era só `(unitPackaging.itemsRate ?? 0) +`, e o trecho passou a aparecer DUAS
  // vezes no arquivo — `unitCost` e `packCost`. A mutação deixou de ser aplicada, e o
  // relatório a contou como "atravessou a suíte", que é notícia sobre os testes quando o
  // serviço era aqui. Duas consequências: a âncora leva a linha de cima (que difere pelo
  // parêntese), e o segundo caminho ganhou mutação própria — ele existia sem nenhuma,
  // que é a razão de o trecho ter ficado ambíguo em primeiro lugar.
  {
    file: 'src/domain/recipe.ts',
    from: `  return (recipeCost.perYieldUnit * yieldPerUnit +
    (unitPackaging.itemsRate ?? 0) +`,
    to: `  return (recipeCost.perYieldUnit * yieldPerUnit +
    0 * (unitPackaging.itemsRate ?? 0) +`,
    hurts:
      'as telas cotam o custo sem a embalagem que sai do estoque, e a producao congela um numero maior que o que sete telas prometeram',
  },

  // A embalagem FECHADA é o outro caminho, e ele guarda a doutrina do arredondamento:
  // `packCost` multiplica ANTES de arredondar, em vez de multiplicar centavo já
  // arredondado. Trocar a ordem é o defeito clássico deste repositório — perder um
  // quinto antes da primeira multiplicação — e ele não tinha mutação nenhuma.
  {
    file: 'src/domain/recipe.ts',
    from: `    (recipeCost.perYieldUnit * yieldPerUnit +
      (unitPackaging.itemsRate ?? 0) +
      (unitPackaging.typedRate ?? 0)) *
      unitsPerPack,`,
    to: `    cents(recipeCost.perYieldUnit * yieldPerUnit +
      (unitPackaging.itemsRate ?? 0) +
      (unitPackaging.typedRate ?? 0)) *
      unitsPerPack,`,
    hurts:
      'a caixa fechada passa a custar centavo arredondado vezes o numero de unidades: o erro de arredondamento multiplica, e a cotacao de um engradado de 264 picoles sai errada para mais ou para menos sem ninguem ver',
  },

  {
    file: 'src/domain/alerts.ts',
    from: `      if (faixa === 'azul' && !settings.bands.notifyFull) continue;`,
    to: `      if (faixa === 'azul' && settings.bands.notifyFull) continue;`,
    hurts:
      'o aviso de cheio inverte: quem PEDIU para ser avisado deixa de receber, e quem nao pediu recebe todo dia que o almoxarifado esta cheio',
  },

  {
    file: 'src/notify/phrase.ts',
    from: `        ? // Grandeza física guarda a fração: meio grau de freezer é diferença`,
    to: `        ? String(Math.round(alert.amount)) ||`,
    hurts:
      'a notificacao da camara arredonda o grau e -18,4 chega como -18: meia diferenca de freezer some justamente no aviso que deveria acusar a porta aberta',
  },

  {
    file: 'src/notify/facts.ts',
    from: `        placeId: o.placeId,`,
    to: `        placeId: d.itemId,`,
    hurts:
      'o aviso passa a contar SABOR como se fosse loja, e quatro sabores pedidos pela mesma loja viram "quatro lojas esperando"',
  },

  {
    file: 'src/domain/alerts.ts',
    from: `  if (settings.weekdays === 0) return true;`,
    to: `  if (settings.weekdays === 0) return false;`,
    hurts:
      'a configuracao vazia — que e a de todo mundo no primeiro dia — silencia TODOS os avisos, e o dono descobre no dia em que faltar polpa',
  },

  {
    file: 'src/domain/alerts.ts',
    from: `  if (share <= bands.red) return 'vermelho';`,
    to: `  if (share < bands.red) return 'vermelho';`,
    hurts:
      'o limite da faixa passa a ser do amarelo, e o item exatamente no piso vermelho e desenhado como se estivesse melhor do que esta',
  },

  {
    file: 'src/domain/alerts.ts',
    from: `    if (dia.getTime() <= now.getTime()) continue;`,
    to: `    if (dia.getTime() < now.getTime()) continue;`,
    hurts:
      'o aviso pode ser agendado para o instante presente, que e uma corrida com o sistema operacional — ele nao dispara e o aviso desaparece sem ninguem saber',
  },

  {
    file: 'src/domain/agreement.ts',
    from: `  for (let ahead = 0; ahead < 7; ahead += 1) {`,
    to: `  for (let ahead = 1; ahead < 7; ahead += 1) {`,
    hurts:
      'quem faz o pedido no proprio dia de entrega da loja e empurrado para a semana que vem, e a carga que sairia hoje fica para dia 7',
  },

  {
    file: 'src/domain/agreement.ts',
    from: `  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {`,
    to: `  if (!Number.isInteger(weekday) || weekday < 0) {`,
    hurts:
      'um oitavo dia da semana recebe "nao combinado" em vez de parar, e o bug de quem chamou vira frase plausivel na tela',
  },

  {
    file: 'src/data/repository.ts',
    // A troca preserva a aridade: `${recorte.sql}` vale seis `?`, e apagá-los faria o
    // SQLite recusar por parâmetro sobrando — a mutação apareceria "pega" por erro de
    // ligação, medindo o ligador em vez do recorte.
    from: `                         AND m.quantity_base_units < 0
                         AND \${recorte.sql}`,
    to: `                         AND m.quantity_base_units < 0
                         AND (? IS NULL OR ? IS NOT NULL OR ? IS NULL OR ? IS NULL OR ? IS NULL OR ? IS NULL)`,
    hurts:
      'o que dorme parado numa loja passa a ter data de acabar por causa do consumo da fabrica, e a tela manda comprar o que ninguem esta usando',
  },

  {
    file: 'src/domain/qr.ts',
    from: "  const code = create(text, { errorCorrectionLevel: 'H' });",
    to: "  const code = create(text, { errorCorrectionLevel: 'L' });",
    hurts:
      'a etiqueta perde metade da tolerancia a dano de graca: com onze caracteres os quatro niveis cabem na mesma grade, e o codigo arranhado no frio deixa de ser lido',
  },
  {
    file: 'src/domain/qr.ts',
    from: 'export const QUIET_ZONE = 4;',
    to: 'export const QUIET_ZONE = 0;',
    hurts:
      'a zona de silencio do QR some, o papelao da caixa encosta no codigo e o leitor desiste de ler',
  },

  {
    file: 'src/data/repository.ts',
    from: "    await write(productionId, 'production', product.itemId, input.unitsProduced, unitCostRate, lotId);",
    to: "    await write(productionId, 'production', product.itemId, input.unitsProduced, unitCostRate, null);",
    hurts:
      'a corrida cria o lote e nao o carimba em linha nenhuma: o recall procura o picole e nao acha de onde ele saiu',
  },
  {
    file: 'src/data/repository.ts',
    from: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null, line.locationId);",
    to: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, lotId, line.locationId);",
    hurts:
      'o lote do picole passa a carimbar a saida da polpa, e um recall de picole manda recolher o saco de acucar',
  },
  {
    file: 'src/data/repository.ts',
    from: "    const code = input.lotCode ?? lotCode(input.producedOn, (runsToday?.n ?? 0) + 1);",
    to: "    const code = input.lotCode ?? lotCode(input.producedOn, 1);",
    hurts:
      'as duas corridas do mesmo dia recebem o mesmo codigo, e recolher uma passa a significar recolher as duas',
  },
  {
    file: 'src/domain/lot.ts',
    from: "  if (shelfLifeDays === null || !Number.isFinite(shelfLifeDays) || shelfLifeDays <= 0) return null;",
    to: "  if (!Number.isFinite(shelfLifeDays)) return null;",
    hurts:
      'produto sem prazo cadastrado passa a vencer no dia em que foi feito, e a camara fria descarta mercadoria boa',
  },

  // O piso do tacho, e as DUAS direcoes de errar nele. A mutacao anterior apontava
  // para o SQL cru que conferia uma sala so; ele deixou de existir em 8 de setembro,
  // quando o piso virou o da unidade e o consumo passou a sair da sala que tinha o
  // insumo. Regra que mudou de forma leva a mutacao com ela — senao ela nao acha o
  // alvo, e o relatorio conta isso como sobrevivente, com razao.
  {
    file: 'src/data/repository.ts',
    from: "  const recorte = noEscopo('m.location_id', escopoDoConsumo);",
    to: "  const recorte = noEscopo('m.location_id', undefined);",
    hurts:
      'o tacho passa a ser autorizado pelo açúcar que está na loja, a dez quilômetros dali, e o consumo entra na fábrica deixando a sala negativa',
  },
  {
    file: 'src/data/repository.ts',
    from: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null, line.locationId);",
    to: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null);",
    hurts:
      'o consumo passa a sair todo do piso do tacho: a soma da unidade continua certa, o piso fica negativo e a camara fria continua cheia — e é a camara que alguem confere com os olhos',
  },
  {
    file: 'src/domain/day.ts',
    from: '    const day = localDate(event.occurredAt, timeZone);',
    to: '    const day = event.occurredAt.slice(0, 10);',
    hurts:
      'a régua da semana passa a cortar o dia em UTC, e o tacho fechado às 22h aparece na coluna do dia seguinte',
  },

  {
    file: 'src/data/repository.ts',
    // O trecho mudou de forma quando a consulta passou a partir do PRODUTO: o
    // filtro do pedido saiu do WHERE e foi para o EXISTS do LEFT JOIN, porque no
    // WHERE ele eliminaria a linha sem pedido que ela existe para trazer. A
    // regra é a mesma; o texto da mutação acompanhou.
    from: `                       AND o.status IN ('pending', 'open')`,
    to: `                       AND o.status IN ('pending', 'open', 'delivered')`,
    hurts: 'pedido entregue continua contando como demanda, e a fabrica produz de novo o que ja saiu pela porta',
  },
  {
    file: 'src/data/repository.ts',
    from: "  const status: OrderStatus = (await ordersNeedApproval()) ? 'pending' : 'open';",
    to: "  const status: OrderStatus = 'open';",
    hurts: 'a fabrica que exige aprovacao passa a gravar pedido ja valendo, e a aprovacao que ela ligou vira decoracao',
  },
  {
    file: 'src/domain/day.ts',
    from: '  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);',
    to: '  return dayWindow(atIso, timeZone, days).from.slice(0, 10);',
    hurts: 'a data combinada volta a sair do instante, e o pedido de quinta aparece como quarta em todo fuso positivo',
  },
  {
    file: 'src/i18n/index.ts',
    from: "  const nowhereToPutIt = !variants.one.includes('{{n}}') && !variants.other.includes('{{n}}');",
    to: '  const nowhereToPutIt = false;',
    hurts: 'o numero some da frase que nao tem onde recebe-lo, e o cartao anuncia uma falta sem dizer de quanto',
  },

  {
    file: 'src/assistant/skills.ts',
    from: '    const batches = declarados ?? (porTacho > 0 ? units / porTacho : 0);',
    to: '    const batches = declarados ?? 1;',
    hurts: 'o assistente volta a debitar um tacho inteiro por qualquer quantidade dita, e a polpa some do papel sem sair da prateleira',
  },
  {
    file: 'src/assistant/text.ts',
    from: '    return null;\n  }\n\n  // Last resort',
    to: '    return [...contains].sort((a, b) => a.name.length - b.name.length)[0];\n  }\n\n  // Last resort',
    hurts: 'com a grade de linha x tipo x sabor, "morango" alcanca doze produtos e o assistente grava calado contra o de nome mais curto',
  },
  {
    file: 'src/assistant/skills.ts',
    // O `?? 0` entrou quando o portão do dinheiro passou a devolver `valueCents`
    // nulo para quem não vê custo, e esta mutação ficou apontando para a linha de
    // antes — caduca, que a ferramenta marca com `?` e conta como defeito. É o
    // conserto certo: mutação que não aplica não prova nada, e uma que não aplica
    // em silêncio seria pior.
    from: "    for (const p of perdas) porMotivo.set(p.reason, (porMotivo.get(p.reason) ?? 0) + (p.valueCents ?? 0));",
    to: "    for (const p of perdas) porMotivo.set(p.reason, Math.max(porMotivo.get(p.reason) ?? 0, p.valueCents ?? 0));",
    hurts: 'o assistente aponta a maior perda isolada como causa, e manda olhar o freezer quando quem come o mes e a validade',
  },
  {
    file: 'src/domain/money.ts',
    from: 'return Math.round(unitRate * quantity) as Cents;',
    to: 'return Math.floor(unitRate * quantity) as Cents;',
    hurts: 'todo custo sai um pouco baixo, sempre para o mesmo lado, e a margem sai alta',
  },
  {
    file: 'src/domain/money.ts',
    from: 'return ((pricePerPurchaseUnit * 100) / baseUnitsPerPurchaseUnit) as Rate;',
    to: 'return (pricePerPurchaseUnit / baseUnitsPerPurchaseUnit) as Rate;',
    hurts: 'preço por unidade fica cem vezes menor: o picolé custa quase nada',
  },
  {
    file: 'src/domain/money.ts',
    from: 'const shortfall = total - floors.reduce((a, b) => a + b, 0);',
    to: 'const shortfall = 0;',
    hurts: 'o detalhamento do [por quê?] deixa de somar o número que ele explica',
  },
  {
    file: 'src/domain/recipe.ts',
    // O trecho saiu de três cópias para UMA função (`netYieldOf`), e a mutação seguiu para
    // dentro dela. Isso é ganho e não empate: antes ela media um dos três caminhos e os
    // outros dois ficavam sem guarda; agora o sinal trocado atinge os três de uma vez.
    from: '  return recipe.yieldAmount * (1 - recipe.lossFraction);',
    to: '  return recipe.yieldAmount * (1 + recipe.lossFraction);',
    hurts: 'a perda barateia o produto em vez de encarecer',
  },
  {
    file: 'src/domain/recipe.ts',
    from: `if (cached) return cached;

  if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);`,
    to: `if (cached) return cached;

  if (false) throw new RecipeCycleError([...stack, recipeId]);`,
    hurts: 'receita que se referencia trava o aplicativo em vez de recusar',
  },
  {
    file: 'src/domain/recipe.ts',
    from: `if (cached) return cached;

  if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);

  const recipe = recipes[recipeId];
  if (!recipe) throw new MissingRecipeError(recipeId);`,
    to: `if (cached) return cached;

  if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);

  const recipe = recipes[recipeId];
  if (!recipe) return { recipeId, version: 0, batchCents: cents(0), netYield: 0, perYieldUnit: 0 as Rate, lines: [], lossFraction: 0 };`,
    hurts: 'semi-acabado que sumiu deixa todos os sabores dele mais baratos, calado',
  },
  {
    file: 'src/domain/cost.ts',
    from: "if (change > PRICE_ALARM) return 'wellAbove';",
    to: "if (change > PRICE_ALARM * 10) return 'wellAbove';",
    hurts: 'a compradora deixa de ser avisada de um aumento de 40%',
  },
  {
    file: 'src/domain/cost.ts',
    from: 'return Math.ceil(dailyConsumption * (leadTimeDays + safetyDays));',
    to: 'return Math.floor(dailyConsumption * (leadTimeDays + safetyDays));',
    hurts: 'o ponto de pedido pede menos do que o consumo, e a fábrica para',
  },
  {
    file: 'src/data/repository.ts',
    from: `(SELECT COALESCE(SUM(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = i.company_id AND m.item_id = i.id`,
    to: `(SELECT COALESCE(COUNT(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = i.company_id AND m.item_id = i.id`,
    hurts: 'o estoque passa a contar movimentos em vez de somar quantidade',
  },
  {
    file: 'src/data/repository.ts',
    from: 'const delta = counted - expected;',
    to: 'const delta = counted;',
    hurts: 'conferir a prateleira dobra o estoque em vez de corrigi-lo',
  },
  {
    file: 'src/data/erase.ts',
    from: 'if (counts.recipeLinesUsingInputs > 0) {',
    to: 'if (false) {',
    hurts: 'apagar insumos deixa receitas apontando para o nada',
  },
  {
    file: 'src/data/db.ts',
    from: 'CAST(l.total_cents AS REAL) / l.base_units',
    to: 'CAST(l.total_cents AS REAL) / 100.0 / l.base_units',
    hurts: 'a migração congela o custo de toda compra antiga cem vezes menor',
  },
  {
    file: 'src/data/repository.ts',
    from: "VALUES (?, ?, '', 'factory', ?)",
    to: "VALUES (?, ?, '', 'factory_room', ?)",
    hurts: 'o local vai com um kind que o servidor não conhece e trava a fila inteira atrás dele',
  },
  {
    file: 'src/sync/serialize.ts',
    from: "  if (entry.table === 'item_costs' || entry.table === 'item_cost_history') {",
    to: '  if (false) {',
    hurts: 'a média derivada volta a ter dois autores, e eles discordam',
  },
  {
    file: 'src/domain/access.ts',
    from: "  operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss', 'adjust_stock'],",
    to: "  operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss', 'adjust_stock', 'view_cost'],",
    hurts: 'o operador de fábrica passa a ver o custo, e ninguém pediu isso',
  },
  {
    file: 'src/sync/serialize.ts',
    // Com CONTEXTO, porque `'operator_id',` passou a aparecer duas vezes: a travessia de
    // `check_candidates` (rodada 14) também manda quem estava com o aparelho. A troca pegaria
    // só a primeira — a de `check_candidates` —, e a medida sairia sobre a tabela errada.
    //
    // E o contexto é o comentário da coluna SEGUINTE, não outra coluna: trocar o alvo para
    // `return_reason` deixaria o `hurts` abaixo falando de operador enquanto a medida seria de
    // motivo de devolução. Mensagem que não nomeia o que foi medido é pior que mutação
    // ausente, porque ela entra na contagem.
    from: `      'operator_id',
      // Por que a carga voltou.`,
    to: `      // 'operator_id',
      // Por que a carga voltou.`,
    hurts: 'quem estava operando some no caminho, e a empresa que ligou a pergunta não recebe a resposta',
  },
  {
    file: 'src/assistant/index.ts',
    from: 'if (skill.requires && !context.capabilities.has(skill.requires)) {',
    to: 'if (false) {',
    hurts: 'o assistente entrega custo a quem não pode ver custo',
  },
  {
    file: 'src/domain/ledger.ts',
    from: 'if (dailyOutflow <= 0) return null;',
    to: 'if (false) return null;',
    hurts: 'item que não sai nada vira cobertura infinita, e o briefing manda não produzir para sempre',
  },
  // A mutação do `balanceAt` saiu com a função.
  //
  // Ela prometia que quebrar o limite faria "a excursão de temperatura acusar o
  // lote errado" — e não existe tela de excursão, nem chamador para aquela
  // função. Era uma mordida numa regra sem efeito em produção: o portão dizendo
  // "a suíte morde onde promete morder" sobre uma promessa que ninguém podia
  // cobrar. Quando a tela existir, a mutação volta apontando para o SQL que ela
  // vai usar.
  {
    file: 'src/domain/units.ts',
    from: 'if (h.tiers[0].perBaseUnit !== 1) return false;',
    to: 'if (false) return false;',
    hurts: 'hierarquia que começa na caixa passa a valer, e toda quantidade sai multiplicada por cinquenta',
  },
  // A mutação do `multiplyCents` saiu com a função, como a do `balanceAt` acima.
  //
  // Ela prometia que multiplicar dinheiro passaria a cortar em vez de arredondar. A função foi
  // APAGADA em 12 de setembro por não ter um único chamador de produção — e a justificativa
  // escrita dela era falsa: dizia existir "para ninguém escrever `Math.round(x * f)` inline",
  // e um `grep` pela ARITMÉTICA achou cinco sítios que a escreviam inline de qualquer forma.
  //
  // Deixar a mutação aqui seria pior que tirá-la: ela entra na contagem de 151, sai como "não
  // medida" em toda execução, e quem lê o número acha que uma regra ficou sem guarda. A regra
  // de verdade — só o valor final arredonda, uma vez — continua protegida onde ela mora, no
  // `Math.round(unitRate * quantity)` do `amountOf`, que tem mutação própria algumas dezenas
  // de linhas acima. Uma mutação sobre função morta não é proteção: é contagem.
  {
    file: 'src/domain/measure.ts',
    from: 'return Number.isInteger(total) ? total : null;',
    to: 'return Math.round(total);',
    hurts: 'uma embalagem de 2,5 g vira 3 g calado, e o fator errado fica embaixo de todo custo daquele insumo',
  },
  {
    file: 'src/domain/measure.ts',
    from: 'if (matches.length !== 1) return null; // two numbers is ambiguous, not clever',
    to: 'if (matches.length === 0) return null;',
    hurts: '"caixa 6 x 500 ml" é lido como 6 ml, e o custo do insumo sai cem vezes errado',
  },
  {
    file: 'src/assistant/skills.ts',
    from: 'const existing = items.find((i) => normalize(i.name) === normalize(name));',
    to: 'const existing = findByName(items, name);',
    hurts: 'cadastrar polpa de açaí é recusado porque já existe polpa de morango, e a fábrica tem várias',
  },
  {
    file: 'src/assistant/skills.ts',
    from: "  match: (q) => q.match(/(?:cadastrar|cadastre|criar|crie|novo)\\s+(?:insumo\\s+)?(.+?)\\s*,\\s*(.+)$/i),",
    to: "  match: (q) => normalize(q).match(/(?:cadastrar|cadastre|criar|crie|novo)\\s+(?:insumo\\s+)?(.+?)\\s*,\\s*(.+)$/),",
    hurts: 'o insumo entra no catálogo sem acento - "polpa de acai" - e fica assim para sempre',
  },
  {
    file: 'src/assistant/skills.ts',
    from: `            purchaseQuantity: packs,
            baseUnits,
            totalCents,
            assistantPhrase: ctx.question,`,
    to: `            purchaseQuantity: packs,
            baseUnits,
            totalCents,
            assistantPhrase: undefined,`,
    hurts: 'o que o assistente lançou fica indistinguível do que a pessoa digitou, e "o que ele lançou este mês?" deixa de ter resposta',
  },
  {
    file: 'src/data/repository.ts',
    from: '       FROM movements WHERE company_id = ? AND item_id = ? AND location_id = ?`,',
    to: '       FROM movements WHERE company_id = ? AND item_id = ?`,',
    hurts: 'contar a prateleira de um lugar compara com o saldo da empresa inteira e teleporta estoque entre salas, com o operador tendo feito tudo certo',
  },
  {
    file: 'src/data/repository.ts',
    from:
      '  const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingRate) as Rate;',
    to: '  const unitCostRate = (consumedValue / (input.batches * 500) + product.unitPackagingRate) as Rate;',
    hurts: 'o custo congela pelo rendimento prometido em vez do que saiu do tacho, e a perda some no instante em que aconteceu',
  },
  {
    file: 'src/data/repository.ts',
    from:
      '  const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingRate) as Rate;',
    to: '  const unitCostRate = (consumedValue / input.unitsProduced) as Rate;',
    hurts:
      'o palito e o saquinho somem do custo congelado, e toda margem futura sai inflada exatamente pela embalagem - com sete telas continuando a prometer o número certo',
  },
  {
    file: 'src/data/repository.ts',
    from: '     HAVING SUM(m.quantity_base_units) <> 0',
    to: '     HAVING SUM(m.quantity_base_units) <> -1',
    hurts:
      'lugar esvaziado volta a aparecer como "0 g", e a tela manda alguém conferir uma prateleira onde não tem nada',
  },
  {
    file: 'src/data/repository.ts',
    from: "        AND kind = 'transfer' AND quantity_base_units > 0",
    to: "        AND kind = 'transfer' AND quantity_base_units < 0",
    hurts:
      'o palpite da remessa lê a perna de saída em vez da de entrada, e o campo nasce com um número negativo que o botão recusa em silêncio',
  },
  {
    file: 'src/data/repository.ts',
    from: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null, line.locationId);",
    to: "      await write(newId(), 'consumption', line.itemId, line.baseUnits, line.rate, null, line.locationId);",
    hurts: 'produzir passa a AUMENTAR o estoque de insumo, e o almoxarifado enche sozinho a cada tacho',
  },
  {
    file: 'src/data/repository.ts',
    from: '    await leg(inId, at, input.baseUnits, input.toLocationId, input.fromLocationId);',
    to: '    void inId;',
    hurts: 'a carga sai da fábrica e não chega em lugar nenhum: some do saldo da empresa como se tivesse evaporado no caminho',
  },
  {
    file: 'src/assistant/skills.ts',
    from: '  stockAtPlace,\n  whereIsItem,\n  stockOfInput,',
    to: '  stockOfInput,\n  stockAtPlace,\n  whereIsItem,',
    hurts:
      '"quanto tem na loja centro" vira procura por um insumo chamado "na loja centro" e responde que não existe, com o saldo da loja ali do lado',
  },
  {
    file: 'src/assistant/skills.ts',
    from: '    if (amount > held) {',
    to: '    if (amount > held * 1000) {',
    hurts:
      'o rascunho da carga é preparado sem ter o que mandar, e só falha na hora de gravar - depois que a pessoa já confiou nele',
  },
  {
    file: 'src/assistant/skills.ts',
    from: "      : ' Contei os insumos pelo que saiu; se rodou a receita inteira, diga \"em 2 vezes\" que eu refaço.';",
    to: "      : '';",
    hurts:
      'o assistente conta os insumos pelo que saiu e nao diz, e quem rodou a receita inteira nao sabe que precisa corrigir',
  },
  {
    file: 'src/assistant/skills.ts',
    from: "  requires: 'record_production',",
    to: "  requires: 'dispatch',",
    hurts:
      'quem só pode despachar passa a poder gravar produção, e o consumo de insumo entra pelas maos de quem nunca produziu',
  },

  // --- a contagem comparada com o saldo de outra sala, 4 de setembro ---------
  //
  // Achado da auditoria. A tela mostrava o total da empresa e gravava no
  // almoxarifado: quem contasse a camara fria e digitasse o que viu apagava da
  // FABRICA a diferenca entre as duas salas. Contagem nao se apaga, se estorna.
  {
    file: 'src/data/repository.ts',
    from: '  const all = await listItems(companyId, undefined, true, onde);',
    to: '  const all = await listItems(companyId, undefined, true);',
    hurts:
      'findItem volta a responder o total da empresa mesmo quando a pergunta e de uma sala: a tela da camara fria mostra o saldo da fabrica somado ao dela, e a diferenca da contagem sai desse numero',
  },
  // --- a porcentagem montada a mao, 4 de setembro ----------------------------
  //
  // Achado da auditoria (um dos medios). `formatPercent` existia e tres chamadores
  // continuavam com `(x * 100).toFixed(1)` — conserto pela metade, que e a forma
  // mais barata de produzir e a mais dificil de notar.
  {
    file: 'app/purchase.tsx',
    from: "                  {draft.change >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(draft.change), locale)}",
    to: "                  {draft.change >= 0 ? '▲' : '▼'} {(Math.abs(draft.change) * 100).toFixed(1)}%",
    hurts:
      'a tela da compra volta a escrever "9.4%" para uma fabrica brasileira: ponto decimal do JavaScript no lugar da virgula de quem le, na tela onde o dono decide se a nota subiu demais',
  },

  // --- os dois idiomas sem caminho, 4 de setembro ----------------------------
  //
  // Achado da auditoria. O dicionario tinha os tres completos e `useLocale`
  // devolvia uma constante: dois tercos do que duas pessoas escreveram palavra por
  // palavra eram alcancaveis so editando o codigo.
  {
    file: 'src/i18n/company.ts',
    from: '  const currency = stored.currency && isCurrency(stored.currency) ? stored.currency : padrao.currency;',
    to: '  const currency = padrao.currency;',
    hurts:
      'a moeda escolhida pela empresa deixa de ser lida da gaveta: o botao marca peso mexicano, o aplicativo continua cobrando em real, e a escolha que nao vale e pior que a escolha que nao existe',
  },
  {
    file: 'src/i18n/company.ts',
    from: '  return region ? `${language}-${region}` : language;',
    to: '  return language;',
    hurts:
      'a moeda para de decidir a regiao: espanhol passa a escrever 1.234,56 no Mexico, onde se escreve 1,234.56 - numero de dinheiro lido ao contrario, que muda uma decisao de compra',
  },

  // --- a tinta ilegivel no corredor da camara, 4 de setembro -----------------
  //
  // Achado da auditoria. `inkFaint` pinta o rotulo que diz O QUE o numero e, em 11
  // e 13 px, e media 2,55:1 no tema que sai da caixa.
  {
    file: 'src/theme/tokens.ts',
    from: "  inkFaint: '#6D6963',",
    to: "  inkFaint: '#8A857D',",
    hurts:
      'a tinta do rotulo volta a 3,39:1 no tema que sai da caixa: "por mil", "valor parado" e "conferido em" ficam ilegiveis no corredor da camara, com luva e tela suja - e a Lei 3 diz que numero nao aparece sozinho',
  },

  // --- os tres atos sem grupo, logo sem estorno, 4 de setembro ---------------
  //
  // Achado da auditoria. A primeira fundacao do projeto diz que se corrige por
  // estorno, e tres dos sete caminhos de escrita nao gravavam grupo: a compra, a
  // contagem e a perda. O que nao tem grupo nao e achado, e o que nao e achado
  // nao e desfeito.
  {
    file: 'src/data/repository.ts',
    from: `        // que a nota tiver duas, o grupo por linha desfaria metade de uma nota,
        // que é a coisa que o estorno por ato existe para não deixar acontecer.
        purchaseId,`,
    to: `        // que a nota tiver duas, o grupo por linha desfaria metade de uma nota,
        // que é a coisa que o estorno por ato existe para não deixar acontecer.
        lineId,`,
    hurts:
      'o grupo da compra passa a ser a LINHA em vez da nota: no dia em que uma nota tiver duas linhas, desfazer volta meia nota e deixa a outra metade de pe',
  },
  {
    file: 'src/data/repository.ts',
    from: `        // outra, e um zero digitado com o dedo torto ficava no razão para sempre.
        id,`,
    to: `        // outra, e um zero digitado com o dedo torto ficava no razão para sempre.
        null,`,
    hurts:
      'a contagem volta a nascer sem grupo, e um zero digitado com o dedo torto fica no razao para sempre - sem estorno e sem exclusao, que e a fundacao quebrada nas duas pontas',
  },
  {
    file: 'src/data/repository.ts',
    from: `        // não sumiram.
        id,`,
    to: `        // não sumiram.
        null,`,
    hurts:
      'a perda volta a nascer sem grupo: "digitei 40 onde era 4" desconta trinta e seis quilos de dinheiro que nao sumiram, para sempre',
  },

  // --- a orfa que travava a fila, 4 de setembro ------------------------------
  //
  // Achado da auditoria. Apagar uma area menor deixava a fila apontando para
  // linhas apagadas, e orfa nao e recusa: e excecao que repete.
  {
    file: 'src/data/repository.ts',
    from: '    // e tudo o que a fábrica gravar depois fica preso atrás dela para sempre.\n    await forgetOrphans(conn);',
    to: '',
    hurts:
      'apagar as compras de exemplo volta a deixar a fila apontando para movimentos que nao existem: o serializador levanta excecao, o motor para no primeiro buraco, e tudo o que a fabrica gravar depois fica preso atras dela',
  },

  // --- a producao impossivel com insumo na camara, 4 de setembro ------------
  //
  // Achado da auditoria. O piso do livro-razao conta a SALA, com razao escrita, e
  // a tela lia o total da empresa: com a polpa na camara (que e onde polpa mora),
  // a tela liberava o botao e TODA corrida batia num erro em ingles.
  {
    file: 'app/production/new.tsx',
    from: "          de === 'sala' ? { sala: unidadeDaqui() } : { unidade: unidadeDaqui() },",
    to: '          undefined,',
    hurts:
      'a tela de producao volta a ler o saldo da empresa e a liberar o botao com o insumo noutra sala: cada toque devolve o erro de programador do piso, e nenhuma corrida entra',
  },

  // --- as duas guardas preventivas da costura, 9 de setembro -----------------
  //
  // Elas nasceram sem defeito para consertar: as listas ja concordavam. Entram aqui
  // porque a regra que eu mesmo escrevi nesta noite manda — guarda nova entra com uma
  // mutacao junto, senao ninguem sabe se ela morde.
  {
    file: 'src/sync/serialize.ts',
    from: "  'movements',\n  'readings',",
    to: "  'readings',",
    hurts:
      'a fila volta a mandar `on conflict do update` para movements, que nao tem politica de UPDATE: o reenvio de um lote parcial e recusado por politica e o motor para na primeira recusa, com tudo o que a fabrica gravar depois preso atras',
  },
  {
    file: 'src/data/db.ts',
    from: '  quantity_base_units  INTEGER NOT NULL,',
    to: '  quantity_base_units  INTEGER,',
    hurts:
      'o aparelho passa a aceitar movimento sem quantidade e o servidor recusa por restricao: a linha entra aqui, a fila manda, e o motor para — o defeito nao aparece em tela nenhuma deste lado',
  },

  // --- o portao de escrita que protege a FILA, 9 de setembro -----------------
  //
  // Nenhuma das sete escritas conferia capacidade, e o botao de desfazer nao tinha
  // portao nenhum. O SQLite aceita qualquer linha; o servidor recusa; e `drain` PARA
  // na primeira recusada. Um toque do entregador travava a fila daquele celular para
  // sempre, sem nada na tela.
  {
    file: 'src/data/repository.ts',
    from: "  await podeGravar(companyId, 'reversal');",
    to: '',
    hurts:
      'o entregador volta a poder desfazer: a linha entra no aparelho, o servidor a recusa por permissao, e a fila daquele celular nunca mais anda — com tudo o que a fabrica gravar depois preso atras dela',
  },
  {
    file: 'src/domain/ledger.ts',
    from: "  return QUEM_ESCREVE[kind].some((c) => tem.has(c));",
    to: '  return true;',
    hurts:
      'o portao de escrita passa a deixar tudo passar: a tabela existe, o teste da paridade continua verde, e a fila volta a travar na primeira linha que o servidor recusar',
  },

  // --- os dois mundos de onde a corrida consome, 8 de setembro ---------------
  //
  // O padrao foi decidido sob defeito e a configuracao e a outra metade da regra da
  // casa. Uma configuracao que da o mesmo resultado nos dois valores nao e
  // configuracao: e decoracao com teste verde.
  {
    file: 'src/data/repository.ts',
    from: "    (await consumoDaProducao()) === 'sala'",
    to: '    false',
    hurts:
      'a fabrica que pediu saldo DECLARADO por sala volta a consumir de qualquer sala calada: a configuracao existe na tela, nao muda nada no razao, e o dono descobre no dia em que conferir a camara com os olhos',
  },

  // --- a venda, o fato que faltava para a margem existir, 8 de setembro -------
  //
  // `movement_kind` tem `sale` desde a 0001 e atravessou 46 migracoes sem escritor.
  // Quem o escreve e a contagem numa loja propria: o que saiu da prateleira foi
  // comprado por alguem. Cada uma destas cinco troca uma das decisoes dessa regra,
  // e as cinco produzem numero de dinheiro errado em silencio.
  {
    file: 'src/data/repository.ts',
    from: "        vendeu ? 'sale' : 'adjustment',",
    to: "        'adjustment',",
    hurts:
      'a contagem na loja volta a gravar correcao em vez de venda: o razao para de saber que houve receita, e a margem deixa de existir sem nenhuma tela mudar',
  },
  {
    file: 'src/data/repository.ts',
    // A âncora ficou cega em 9 de setembro, quando `vendeu` ganhou a segunda pergunta
    // (a espécie do ITEM). O que a mutação testa continua o mesmo: tirar o `delta < 0`
    // faz sobra positiva virar venda negativa.
    from: '    delta < 0 &&\n    lugar !== null &&',
    to: '    lugar !== null &&',
    hurts:
      'contar MAIS do que o livro diz passa a gravar uma venda negativa: receita inventada no razao, e ela some da soma do mes como se alguem tivesse desvendido picole',
  },
  {
    file: 'src/data/repository.ts',
    from: '  if (acordo) return acordo.price_rate as Rate;',
    to: '',
    hurts:
      'o preco combinado com a loja deixa de valer e todo mundo fatura pelo catalogo: a margem da loja que negociou sai inflada para cima, que e o lado perigoso de errar dinheiro',
  },
  {
    file: 'src/data/repository.ts',
    from: '          revenueCents: priceRate === null ? null : amountOf(priceRate, -delta),',
    to: '          revenueCents: amountOf(priceRate ?? (0 as Rate), -delta),',
    hurts:
      'venda sem preco combinado passa a valer zero em vez de "ninguem disse por quanto": a tela afirma que a mercadoria saiu de graca, e a margem do mes fica negativa por falta de cadastro',
  },
  {
    file: 'src/domain/ledger.ts',
    from: "export const COUNT_KINDS = ['adjustment', 'sale'] as const;",
    to: "export const COUNT_KINDS = ['adjustment'] as const;",
    hurts:
      'a contagem que virou venda deixa de provar que alguem andou ate a prateleira: o "conferido em" de toda loja propria congela no dia em que ela bateu exato, e o app manda contar de novo o que foi contado hoje de manha',
  },
  {
    file: 'src/domain/ledger.ts',
    from: "export const RETAIL_PLACE_KINDS = ['own_store'] as const;",
    to: "export const RETAIL_PLACE_KINDS = ['own_store', 'cold_room'] as const;",
    hurts:
      'contar a camara fria passa a faturar: a polpa que faltou na conferencia entra como receita, e o mes fecha com venda de insumo que ninguem vendeu',
  },

  // --- o freezer cheio que a conta nao via, 4 de setembro --------------------
  //
  // Achado da auditoria (item 4, o terco que faltava). A conta de quanto da para
  // prometer lia um lugar so - certo enquanto havia um so, e cego no dia seguinte
  // ao de produzir, que e quando o picole esta na camara.
  {
    file: 'src/data/repository.ts',
    from: "                AND l.kind IN ('factory', 'cold_room', 'store_room')\n                -- A unidade e o que está DENTRO dela, pela peça de noEscopo.",
    to: "                AND l.kind IN ('factory', 'store_room')\n                -- A unidade e o que está DENTRO dela, pela peça de noEscopo.",
    hurts:
      'o que esta na camara fria para de contar como prometivel: a tela de anotar pedido nao avisa excesso nenhum com o freezer cheio, e a capa manda produzir o que ja existe',
  },
  // --- a unidade de fábrica, 8 de setembro -----------------------------------
  //
  // As duas regras que nasceram hoje, e sem mutação elas seriam duas afirmações.
  // As trocas são sempre-verdadeiras em vez de apagar a linha porque apagar mudaria
  // a aridade do comando: o SQLite recusaria por parâmetro sobrando, a mutação
  // apareceria "pega" por erro de ligação, e o que ficaria medido é o binder.
  {
    file: 'src/data/repository.ts',
    from: `          AND (? IS NULL OR EXISTS (
                SELECT 1 FROM locations esc`,
    to: `          AND (? IS NULL OR ? IS NOT NULL OR ? IS NULL OR ? IS NULL OR 1 = 1) AND (0 = 1 OR EXISTS (
                SELECT 1 FROM locations esc`,
    hurts:
      'o saldo de "aqui" volta a ser da empresa: quem esta na unidade de Marilia ve o almoxarifado de Bauru somado ao dele, e decide producao com um numero que nao existe em lugar nenhum',
  },
  {
    file: 'src/data/repository.ts',
    from: "                            AND esc.kind IN (${UNIT_ROOM_KINDS.map((k) => `'${k}'`).join(', ')})",
    to: "                            AND 1 = 1",
    hurts:
      'o atalho de compatibilidade volta a ser largo: a segunda unidade cai dentro da primeira e a loja do cliente tambem, entao o freezer de outra cidade prometa pedido daqui e o lote entregue volta a avisar de validade',
  },
  // A regra do PAR, que substituiu "transferência nunca conta quando a pergunta é da
  // empresa" em 8 de setembro. Sem esta mutação ela é uma afirmação com teste verde
  // ao lado: o teste existe, mas nada garante que ele morde a troca.
  {
    file: 'src/data/repository.ts',
    // Âncora refeita em 9 de setembro: o predicado saiu da consulta e virou a ajudante
    // `saidaDeVerdade`, que é onde ele mora agora. A troca continua a mesma — o par
    // deixa de ser consultado e TODA transferência volta a ser ignorada.
    from: "    `NOT (m.kind IN ('transfer', 'return') AND ${parNoEscopoSql})`,",
    to: "    `NOT (m.kind IN ('transfer', 'return') AND 1 = 1)`,",
    hurts:
      'a cobertura volta a ignorar QUALQUER transferencia: mandar polpa de Bauru para Marilia deixa de contar como saida de Bauru, e a regua de la fica infinita com a camara vazia — o conselho cala exatamente onde falta',
  },
  {
    file: 'app/inputs/[id].tsx',
    from: '      locationId: contarEm,',
    to: '      locationId: defaultLocationId(empresaDaqui()),',
    hurts:
      'a tela volta a gravar a contagem no almoxarifado qualquer que seja a sala aberta: contar a camara fria apaga da fabrica a diferenca entre as duas',
  },
  {
    file: 'src/assistant/skills.ts',
    from: '    if (holding.length > 1) {',
    to: '    if (holding.length > 99) {',
    hurts:
      'o assistente volta a preparar contagem de item que esta em duas salas comparando com o total da empresa, e a gravar a diferenca no almoxarifado - a mesma teleportacao que a tela tinha, agora por voz',
  },
  // --- a regra aprovada dos niveis, 11 de setembro -----------------------------
  //
  // O dono aprovou o que cada nivel MUDA: categoria muda a receita, tipo muda
  // tamanho, variacao muda o sabor. Com Leite virando CATEGORIA, "morango so no
  // leite" passou a depender de `flavors.category_id` (`0059`). As quatro abaixo
  // quebram as quatro regras que a aprovacao criou.
  {
    file: 'src/data/repository.ts',
    from: "        AND (category_id IS NULL OR ? IS NULL OR category_id = ?)",
    to: "        AND (category_id = ? OR ? IS NULL)",
    hurts:
      'a sobreposicao de alcance deixa de ser sobreposicao: morango do produto inteiro para de colidir com o morango que ja vale numa categoria dele, e a tela de produto lista Morango duas vezes - o "confunde na hora de registrar" que o dono mandou travar',
  },
  {
    file: 'src/data/repository.ts',
    from: "        AND COALESCE(p.category_id, '') = COALESCE(?, '')",
    to: "        AND COALESCE(p.category_id, '') = COALESCE(p.category_id, ?)",
    hurts:
      'a grade ocupada volta a ter tres colunas contra as quatro do indice: dois produtos que diferem SO na categoria sao recusados por "classificacao ocupada", e o picole de leite e o de agua nao cabem juntos - frase certa sobre fato falso',
  },
  {
    file: 'src/components/grade.ts',
    from: '  return [categoria, tipo]',
    to: '  return [tipo, categoria]',
    hurts:
      'a etiqueta impressa passa a dizer "60 ml Leite" em vez de "Leite 60 ml": sai gramaticalmente aceitavel e semanticamente invertido, e ninguem nota olhando uma etiqueta',
  },

  // --- o caminho de trás, 11 de setembro ---------------------------------------
  {
    file: 'src/intencao.ts',
    from: '  if (entao > hoje) return false;',
    to: '  if (entao > hoje) return true;',
    hurts:
      'relogio do aparelho andando para tras - fuso trocado, hora corrigida na mao, aparelho sem bateria - apaga a frase que a pessoa acabou de escrever, e ela perde o caminho por um defeito que nao e dela',
  },
  // --- a fila que sai da frente, 11 de setembro -------------------------------
  //
  // --- o estorno parcial, 12 de setembro -------------------------------------
  //
  // A conferência não tem ato próprio (o grupo é o da remessa, e tem de ser: é a chave que
  // faz a trava do servidor reconhecer a mesma carga conferida por dois celulares). Então
  // desfazê-la sozinha obrigou três predicados a crescer de "alguma perna estornada" para
  // "nenhuma de pé". As quatro abaixo quebram cada um deles.
  {
    file: 'src/data/repository.ts',
    from: "    apenas: ['discrepancy'],",
    to: '',
    hurts:
      'desfazer a conferência volta a estornar a CARGA junto: a remessa sai da doca, a mercadoria volta para a fabrica no papel, e conferir de novo responde "remessa nao existe" - que e o erro de programador que a mensagem da tela produzia',
  },
  {
    file: 'src/data/repository.ts',
    from: '    alreadyReversed: dePe.length === 0,',
    to: '    alreadyReversed: legs.some((l) => l.reversed === 1),',
    hurts:
      'a remessa com a conferencia desfeita passa a contar como "ja estornada" e trava para sempre: ninguem mais consegue trazer a carga de volta, e a recusa diz que o grupo ja foi estornado quando a mercadoria esta toda na loja',
  },
  {
    file: 'src/data/repository.ts',
    from: "                 AND ${naoEstornado('c')}",
    to: '',
    hurts:
      'a doca volta a dizer "conferida" para sempre: a conferencia desfeita continua contando, e quem desfez para contar de novo nao tem mais onde tocar',
  },
  {
    file: 'src/data/repository.ts',
    from: '    if (l.reversed === 0) ja.reversed = false;',
    to: '    if (l.reversed === 1) ja.reversed = true;',
    hurts:
      'o extrato passa a marcar o ato inteiro como "Desfeito" depois de desfazer so a conferencia: a etiqueta mente e o botao de trazer a carga de volta desaparece, com a mercadoria ainda na loja',
  },
  // A OUTRA metade da mesma agregação, e ela decide se a PORTA estreita é desenhada. A de cima
  // sobreviveu à oficina por falta de asserção — a bandeira é lida pela tela, e a unidade não
  // renderiza tela. As duas agora têm igualdade no teste do estorno parcial.
  {
    file: 'src/data/repository.ts',
    from: "    if (l.kind === 'discrepancy' && l.reversed === 0) ja.temConferencia = true;",
    to: "    if (l.kind === 'discrepancy') ja.temConferencia = true;",
    hurts:
      'o extrato oferece "Desfazer so a conferencia" numa remessa cuja conferencia JA foi desfeita: o toque nao faz nada e devolve zero, e a pessoa conclui que o aplicativo travou',
  },

  // --- a tela do que ficou de lado, 12 de setembro ---------------------------
  //
  // A frase dos Ajustes prometia "diz o que ficou, ONDE VER, e segue", e o onde ver não
  // existia. As três abaixo quebram o que a tela nova depende para não mentir.
  {
    file: 'src/data/repository.ts',
    // O `?` FICA, e isto é a diferença entre medir a regra e medir a sintaxe: tirando o
    // marcador, o SQLite reclama de "column index out of range" antes de qualquer portão ser
    // exercitado, e a mutação sai "pega" sem ter tocado no assunto. Quem removesse o portão
    // mantendo a contagem de parâmetros — que é o defeito plausível — passaria.
    from: "              CASE WHEN ? = 1 THEN pe.name END AS operator_name",
    to: '              CASE WHEN ? = 1 THEN pe.name ELSE pe.name END AS operator_name',
    hurts:
      'o nome de quem operou sai do banco com a chave "nomear quem gravou" DESLIGADA: a empresa que escolheu falar de onde e nao de quem passa a nomear pessoa numa tela de recusa, que e o pior lugar para isso - e esconder na tela seria decoracao, porque o numero ja saiu da consulta',
  },
  {
    file: 'src/data/repository.ts',
    from: '  return deLado.map((e) => ({\n    entryId: e.id,',
    to: '  return deLado.filter((e) => fatos.has(e.rowId)).map((e) => ({\n    entryId: e.id,',
    hurts:
      'a lista esconde a linha posta de lado que nao e conferencia, e os Ajustes continuam contando todas: a pessoa le "3 nao sobem" e ve dois cartoes, sem nada explicando o terceiro',
  },
  {
    file: 'src/data/outbox.ts',
    from: "       FROM outbox WHERE recusada_em IS NOT NULL",
    to: '       FROM outbox WHERE recusada_em IS NULL',
    hurts:
      'a tela do que ficou de lado passa a mostrar o que AINDA VAI SUBIR: a pessoa le que o servidor ja tinha o registro de coisa que nunca foi oferecida a ele, e a conferencia que espera sinal aparece como perdida',
  },

  // --- a frase que afirma uma CAUSA, e o sinal da diferença, 12 de setembro ------
  //
  // As duas réguas saíram da tela para módulo puro pelo mesmo motivo: a oficina mede a unidade,
  // e a unidade não renderiza tela. Sem isso as três seriam mutações que ninguém pega.
  {
    file: 'src/sync/recusa.ts',
    from: "  return codigos.every((c) => c !== null && c.trim() === CODIGO_JA_EXISTE);",
    to: "  return codigos.some((c) => c !== null && c.trim() === CODIGO_JA_EXISTE);",
    hurts:
      'uma lista com uma duplicada e uma recusa de outro codigo passa a ser explicada INTEIRA como duplicacao: a tela afirma com confianca que o servidor ja tinha o registro de linhas que ele recusou por outro motivo',
  },
  {
    file: 'src/domain/day.ts',
    from: '  return Math.round((meiaNoiteUtc(ate) - meiaNoiteUtc(de)) / 86_400_000);',
    to: '  return Math.round((meiaNoiteUtc(de) - meiaNoiteUtc(ate)) / 86_400_000);',
    hurts:
      'o sinal de TODA contagem de dias do aplicativo vira: a fila de avisos diz "vence em 3 dias" de um lote que venceu ha tres, o pedido para quinta aparece como atrasado, e a capa conta a copia de seguranca como feita no futuro',
  },
  {
    file: 'src/domain/ledger.ts',
    from: "  return baseUnits < 0 ? 'falta' : 'sobra';",
    to: "  return baseUnits > 0 ? 'falta' : 'sobra';",
    hurts:
      'a tela do que ficou de lado troca falta por sobra: quem conferiu 5.500 de 6.000 le "sobraram 500" e conclui que chegou mais do que veio - o numero certo com a palavra invertida, que e pior que numero errado porque parece certo',
  },
  {
    file: 'src/domain/ledger.ts',
    from: "  if (baseUnits === 0) return 'exata';",
    to: '  if (false) return \'exata\';',
    hurts:
      'a conferencia que BATEU passa a ser contada como sobra de zero: a tela diz "sobraram 0 g" onde devia dizer que bateu com o que veio, que e o alerta inventado com outro rosto',
  },

  // --- a conta aberta que não fechava, 12 de setembro --------------------------
  //
  // `costPerProductUnit` soma massa, embalagem digitada e embalagem que é ITEM; o
  // detalhamento do assistente mostrava duas. A mutação tira a linha do estoque, e o teste
  // reprova dizendo "e a que sai do estoque, sem a qual a conta abre e não fecha".
  {
    file: 'src/assistant/skills.ts',
    from: "                  label: 'Embalagem do estoque',",
    to: "                  label: 'Embalagem',",
    hurts:
      'a conta aberta passa a ter DUAS linhas com o mesmo rotulo e valores diferentes: quem lista palito le "Embalagem R$ 0,05" e "Embalagem R$ 0,03" e nao tem como saber qual e qual, o que e pior que a linha faltando porque parece erro de calculo',
  },
  {
    file: 'src/assistant/skills.ts',
    from: '      const doEstoque = packagingRatePerUnit(product.packagingItems, costs ?? {});',
    to: '      const doEstoque = 0;',
    hurts:
      'a embalagem que sai do estoque volta a entrar no total e a nao aparecer no detalhamento: quem lista palito ve a manchete subir sem nenhuma linha explicando, e conta que nao fecha ensina a desconfiar do numero inteiro - inclusive dos que estao certos',
  },

  // --- a ficha que ROUDOU, 12 de setembro -------------------------------------
  //
  // O lote carimbava a versão do FECHAMENTO e congelava a taxa dela, para um tacho que
  // rodou a anterior. A mutação tira a linha do conserto, e o teste reprova pelo dinheiro:
  // "esperava 4 centavos por unidade, veio 8".
  {
    file: 'src/data/repository.ts',
    from: '    fichaCravada: run.recipeVersionId,',
    to: '',
    hurts:
      'quem salvar a ficha nova entre abrir e fechar o tacho faz o lote nascer com a ficha nova e o custo congelado dela: o denominador de toda margem futura passa a ser de uma formula que aquele lote nao rodou, e o carimbo do lote afirma procedencia errada - pior que nao carimbar, porque parece resposta',
  },
  {
    file: 'src/data/repository.ts',
    from: '    if (escolhida) grafo[escolhida.recipe_id] = monta(escolhida);',
    to: '    if (!escolhida) grafo[fixar.recipeId] = grafo[fixar.recipeId];',
    hurts:
      'a versao cravada chega ao grafo e e descartada em silencio: o parametro existe, o chamador passa, e o custo continua saindo da formula mais nova - a forma de defeito que mais engana, porque o conserto aparece no diff e nao acontece',
  },

  // A nota que some no arredondamento: o aparelho aceitava, o servidor recusa para
  // sempre com `23514`, e `23514` é passageira de propósito — então a fila tentaria de
  // novo eternamente com tudo atrás preso. O conserto é na origem, e estas duas o
  // quebram nos dois lugares onde ele mora.
  {
    file: 'src/data/repository.ts',
    from: "  if (!(input.baseUnits > 0)) {\n    throw new Error('essa quantidade some no arredondamento: a nota não move nada');",
    to: "  if (false) {\n    throw new Error('essa quantidade some no arredondamento: a nota não move nada');",
    hurts:
      'uma nota de ZERO unidade entra no razao do aparelho e o Postgres a recusa para sempre (base_units > 0 e movement_moved_something), com `23514` classificado como passageiro: a fila tenta de novo eternamente e tudo o que o aparelho gravar depois fica preso atras, calado',
  },
  {
    file: 'app/purchase.tsx',
    from: '    if (baseUnits <= 0) return null;',
    to: '    if (false) return null;',
    hurts:
      'a tela volta a oferecer o botao de lancar para uma nota que nao move nada, e a linha embaixo do campo mostra a conversao "0 g" como se fosse resultado valido em vez de mandar aumentar a quantidade',
  },
  // Esta sobreviveu à oficina na primeira execução, e é por isso que a guarda de FONTE
  // existe: `mutate` roda a suíte de unidade, e a unidade não renderiza tela. A régua que
  // a pega agora é `src/layers.test.ts`, por CHAMADA de `purchaseToBaseUnits`.
  {
    file: 'src/assistant/skills.ts',
    from: '    if (baseUnits <= 0) {',
    to: '    if (false) {',
    hurts:
      'o assistente volta a montar o rascunho de uma compra que nao move nada, mostrando "= 0 g" como confirmacao legitima, e a recusa passa a vir no apply - erro reclamando depois do toque em vez de impedindo antes',
  },

  // O conserto da conferência duplicada abriu um caminho que PERDE DADO se a
  // classificação errar para o lado errado. As duas abaixo quebram os dois lados.
  {
    file: 'src/sync/recusa.ts',
    from: "  return PERMANENTES.has(codigo.trim()) ? 'permanente' : 'passageira';",
    to: "  return PERMANENTES.has(codigo.trim()) ? 'passageira' : 'permanente';",
    hurts:
      'toda recusa desconhecida passa a sair da frente da fila: falta de rede, permissao faltando, servidor ocupado - tudo vira "nao sobe nunca" e o dado nunca chega ao servidor, em silencio, que e o pior resultado que esta fila tem',
  },
  {
    file: 'src/sync/engine.ts',
    from: "      if (classeDaRecusa(recusada.codigo) !== 'permanente') continue;",
    to: "      if (classeDaRecusa(recusada.codigo) === 'permanente') continue;",
    hurts:
      'a fila volta a travar exatamente onde este conserto existe para destravar - a conferencia duplicada fica pendente para sempre e tudo o que o aparelho gravou depois fica preso atras dela',
  },
];

/**
 * A cicatriz que este desenho fecha, escrita para não se repetir.
 *
 * A versão anterior mutava o arquivo DE VERDADE e desfazia depois. Uma execução
 * foi interrompida, o `finally` não rodou, e o guarda de ciclo de receita ficou
 * desativado na árvore de trabalho — enquanto um build de APK começava a
 * empacotar exatamente esse diretório. A resposta na época foram três redes:
 * `finally`, ganchos de SIGINT/SIGTERM/SIGHUP, e uma checagem de árvore suja na
 * entrada que ABORTAVA a execução seguinte.
 *
 * Três redes para o mesmo abismo é sinal de que o abismo não devia existir.
 * Mutando cópias, o pior caso de uma morte no meio é um diretório para apagar —
 * e a checagem de árvore suja, que já custou uma rodada travada ("A árvore já
 * está suja nos arquivos que este script muda"), deixou de fazer sentido.
 *
 */
/**
 * As mutações rodam em CÓPIAS, e a árvore de trabalho nunca é tocada.
 *
 * A versão anterior escrevia o defeito no arquivo de verdade e desfazia depois —
 * com `finally`, com gancho de sinal e com uma checagem de árvore suja na
 * entrada, porque a falha desse desenho não é um teste vermelho: é código
 * quebrado viajando dentro de um aplicativo. Três redes para o mesmo abismo.
 *
 * Copiando, o abismo não existe: o pior caso de uma execução morta no meio é um
 * diretório temporário para apagar. E aí a paralelização vem de graça, porque
 * cada trabalhador tem a sua cópia — 64 mutações em série custavam doze minutos
 * de espera por commit, e essa espera se paga em toda rodada, todo dia.
 *
 * `node_modules` é ligado por link simbólico, não copiado: são centenas de
 * megabytes que os quatro trabalhadores leem sem escrever.
 */
const RAIZ = process.cwd();
const OFICINA = join(RAIZ, '.mutate');
const TRABALHADORES = Math.max(1, Math.min(cpus().length, 4));

/**
 * O que NÃO vai para a cópia. Lista de exclusão, e isso é cicatriz.
 *
 * Era uma lista de INCLUSÃO — `['src', 'scripts', 'package.json',
 * 'tsconfig.json']` — escrita em 3 de setembro, quando os testes só liam
 * `src/`. Depois disso a suíte ganhou guardas que leem o repositório: o
 * dicionário varre `app/`, os seletores leem `e2e/flow.mjs`, o acordo lê
 * `supabase/migrations`, a tabela lê `CLAUDE.md` e `docs/roadmap.md`.
 *
 * Na oficina esses arquivos não existiam, então esses testes morriam no
 * carregamento com ENOENT — e a suíte da oficina saía com **19 falhas antes de
 * qualquer mutação**. Como `pego = !suitePasses(dir)` e `suitePasses` procura
 * `# fail 0`, TODA mutação era declarada pega sem a suíte nunca ter sido
 * consultada. Sessenta e seis commits com "os N defeitos foram pegos" que não
 * queriam dizer nada, no CI e no portão de entrega.
 *
 * Lista de inclusão é uma segunda cópia do que os testes precisam, mantida à
 * mão, longe deles — e o segundo autor sempre atrasa. Exclusão nomeia só o que
 * é derivado ou pesado, e um teste novo que leia um arquivo novo continua
 * funcionando sem ninguém lembrar de nada.
 */
const NAO_COPIAR = new Set([
  'node_modules', // ligado por link simbólico logo abaixo
  '.git',
  '.mutate',
  'dist',
  '.expo',
  '.shots',
  'android',
]);

function prepararOficina() {
  rmSync(OFICINA, { recursive: true, force: true });
  const alvos = readdirSync(RAIZ).filter((e) => !NAO_COPIAR.has(e));
  for (let n = 0; n < TRABALHADORES; n += 1) {
    const dir = join(OFICINA, `w${n}`);
    mkdirSync(dir, { recursive: true });
    for (const alvo of alvos) {
      cpSync(join(RAIZ, alvo), join(dir, alvo), { recursive: true });
    }
    symlinkSync(join(RAIZ, 'node_modules'), join(dir, 'node_modules'), 'dir');
  }
}

/**
 * A oficina prova que serve ANTES de julgar qualquer coisa.
 *
 * Sem esta checagem, uma oficina quebrada é indistinguível de uma suíte
 * perfeita: as duas fazem `suitePasses` devolver falso, e falso quer dizer
 * "pego". O relatório mais bonito que este script já imprimiu — "os 90 defeitos
 * foram pegos" — foi impresso por uma oficina que não rodava a suíte.
 *
 * É a asserção de presença ao lado da de ausência, que este projeto já
 * conserta pela terceira vez: antes de afirmar que a mutação derrubou a suíte,
 * prove que a suíte estava DE PÉ.
 */
function oficinaConfere(dir) {
  const run = spawnSync('npx', ['tsx', '--test', 'src/**/*.test.ts'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const saida = `${run.stdout}`;
  if (saida.includes('# fail 0')) return;
  const falhas = saida.match(/^# fail (\d+)/m)?.[1] ?? '?';
  console.error(
    `\nA oficina não roda a suíte: ${falhas} falha(s) SEM mutação nenhuma.\n\n` +
      'Enquanto isso for verdade, todo defeito plantado é declarado "pego" sem a\n' +
      'suíte ter sido consultada — que é o pior relatório possível: verde por\n' +
      'construção. Provavelmente um teste passou a ler um arquivo que a cópia não\n' +
      'leva; veja NAO_COPIAR.\n',
  );
  console.error(saida.split('\n').filter((l) => /^not ok|Error:/.test(l)).slice(0, 12).join('\n'));
  process.exit(1);
}

/**
 * Como se lê a saída de uma execução da suíte — e por que "não passou" não basta.
 *
 * **A cicatriz, e é a terceira aparição da mesma.** Isto era
 * `return stdout.includes('# fail 0')`, e essa linha diz "pegou" para tudo o que
 * não imprimiu o resumo: uma execução morta por falta de memória, um `npx` que não
 * subiu, um teste que estourou o tempo com a máquina disputada. A primeira
 * aparição foi a oficina que não copiava as pastas dos testes (a suíte morria lá
 * com 19 falhas, e "falhou" queria dizer "pegou", por 66 commits). A segunda foi a
 * própria oficina declarando "pego" sem consultar a suíte. Esta é a terceira, e a
 * menor: com a máquina disputada, uma execução sem resumo virou "pego" — e como o
 * defeito carregava marcador de equivalente, o relatório acusou MARCADOR ERRADO num
 * marcador que estava certo. Alarme inventado no instrumento que existe para não
 * inventar alarme.
 *
 * Três resultados, não dois. Terminou sem falha, terminou com falha, e **não
 * terminou** — e o terceiro não é proteção nem buraco: é medida que não houve.
 */
function lerSuite(run) {
  const saida = `${run.stdout}`;
  if (saida.includes('# fail 0')) return 'passou';
  if (/^# fail [1-9]/m.test(saida)) return 'falhou';
  return 'inconclusivo';
}

/**
 * A régua conferida antes de medir, com quatro casos sintéticos.
 *
 * Não tem custo (são duas expressões regulares) e fecha a única forma de o
 * conserto acima voltar em silêncio: alguém mexe no formato e `inconclusivo`
 * desaparece de novo dentro de `falhou`.
 */
function conferirRegua() {
  const casos = [
    ['# tests 300\n# pass 300\n# fail 0\n', 'passou'],
    ['# tests 300\n# pass 299\n# fail 1\n', 'falhou'],
    ['', 'inconclusivo'],
    ['FATAL ERROR: Reached heap limit', 'inconclusivo'],
  ];
  for (const [saida, esperado] of casos) {
    const lido = lerSuite({ stdout: saida });
    if (lido !== esperado) {
      throw new Error(
        `a régua da suíte está quebrada: "${saida.slice(0, 30)}" foi lida como ${lido}, e é ${esperado}`,
      );
    }
  }
}

function suitePasses(dir) {
  const rodar = () =>
    spawnSync('npx', ['tsx', '--test', 'src/**/*.test.ts'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' },
    });

  let lido = lerSuite(rodar());
  // Uma segunda chance só para o que não terminou: execução disputada acontece, e
  // repetir uma medida que não houve é barato. O que TERMINOU não se repete —
  // repetir resultado até gostar dele é o oposto de medir.
  if (lido === 'inconclusivo') lido = lerSuite(rodar());
  return lido;
}

/**
 * Cada defeito, na cópia de um trabalhador.
 *
 * Devolve o veredito em vez de imprimir: a ordem de impressão é a da LISTA, não
 * a de quem terminou primeiro. Relatório fora de ordem é relatório que ninguém
 * consegue comparar com a execução de ontem.
 */
async function julgar(defect, dir) {
  const original = readFileSync(join(RAIZ, defect.file), 'utf8');

  if (!original.includes(defect.from)) {
    return { estado: 'obsoleta', defect };
  }
  // Duas ocorrências do mesmo trecho é uma mutação que mente.
  //
  // `String.replace` com texto troca a PRIMEIRA e cala sobre o resto. Quando o
  // mesmo SQL aparece em duas funções — foi o caso do piso por local, que a
  // contagem e a perda escrevem igual — o relatório diz "ok" tendo exercitado
  // metade da regra, e a outra metade fica sem rede achando que tem.
  const hits = original.split(defect.from).length - 1;
  if (hits > 1) return { estado: 'ambigua', defect, hits };

  writeFileSync(join(dir, defect.file), original.replace(defect.from, defect.to));
  const lido = suitePasses(dir);
  // Restaura a cópia para o próximo defeito deste trabalhador.
  writeFileSync(join(dir, defect.file), original);

  // Medida que não houve não é veredito. Contar como "pego" é o que fez este
  // relatório acusar um marcador certo de errado.
  if (lido === 'inconclusivo') return { estado: 'inconclusivo', defect };
  const pego = lido === 'falhou';

  // "Não pegou" e "não DÁ para pegar" são coisas diferentes, e sair iguais no
  // relatório apaga a diferença.
  //
  // Uma mutação é EQUIVALENTE quando nenhum teste possível a distingue do
  // original — o caso clássico é defesa em profundidade: duas checagens em
  // camadas guardando a mesma coisa, onde tirar uma deixa a outra pegando e o
  // comportamento observável não muda. Chamar isso de "sobreviveu" manda alguém
  // caçar um buraco que não existe; chamar de "pego" é mentira.
  //
  // O marcador não é escapatória: ele exige motivo escrito, e se a mutação FOR
  // pega o marcador vira erro — senão a lista apodrece guardando desculpas para
  // buracos que já foram fechados.
  if (defect.equivalente) {
    return { estado: pego ? 'marcador-errado' : 'equivalente', defect };
  }
  return { estado: pego ? 'pego' : 'sobreviveu', defect };
}

prepararOficina();
process.on('exit', () => rmSync(OFICINA, { recursive: true, force: true }));
conferirRegua();
oficinaConfere(join(OFICINA, 'w0'));

console.log(
  `Quebrando o código de propósito, ${DEFECTS.length} vezes, em ${TRABALHADORES} frentes.\n`,
);

const vereditos = new Array(DEFECTS.length);
let proximo = 0;

await Promise.all(
  Array.from({ length: TRABALHADORES }, async (_, n) => {
    const dir = join(OFICINA, `w${n}`);
    for (;;) {
      const meu = proximo;
      proximo += 1;
      if (meu >= DEFECTS.length) return;
      vereditos[meu] = await julgar(DEFECTS[meu], dir);
    }
  }),
);

/**
 * **Três desfechos ruins, e eles NÃO são a mesma notícia — medido em 11 de setembro.**
 *
 * Este relatório somava tudo num contador só e fechava dizendo *"N defeito(s) atravessaram
 * a suíte inteira"*. Numa execução em que a única pendência era uma âncora ambígua — o
 * trecho do `from` passou a aparecer duas vezes no arquivo, então a mutação **não foi
 * aplicada** —, a frase mandava procurar fraqueza na suíte. Nada atravessou: nada foi
 * plantado.
 *
 * Falhar continua certo (guarda que não roda não guarda). O que estava errado era a
 * frase, e ela custa a rodada de quem a lê: quem procura teste fraco não encontra, porque
 * o serviço é consertar a âncora.
 *
 * `sobreviveram` = a mutação ENTROU e a suíte ficou verde. É a notícia sobre a suíte.
 * `naoMedidos`   = a mutação não entrou (trecho mudou, ambíguo, ou a suíte não rodou).
 *                  É notícia sobre o arquivo de mutações, não sobre a suíte.
 */
let sobreviveram = 0;
let naoMedidos = 0;
const equivalentes = [];

for (const veredito of vereditos) {
  const { defect } = veredito;
  if (veredito.estado === 'obsoleta') {
    naoMedidos += 1;
    console.log(`?  ${defect.file}: o trecho mudou — atualize esta mutação`);
    console.log(`   ${defect.hurts}\n`);
  } else if (veredito.estado === 'ambigua') {
    naoMedidos += 1;
    console.log(`?  ${defect.file}: o trecho aparece ${veredito.hits} vezes`);
    console.log(`   a troca pega só a primeira — dê contexto ao \`from\` até ele ser único`);
    console.log(`   ${defect.hurts}\n`);
  } else if (veredito.estado === 'equivalente') {
    equivalentes.push(defect);
  } else if (veredito.estado === 'inconclusivo') {
    naoMedidos += 1;
    console.log(`\nNÃO MEDIDO  ${defect.file}`);
    console.log('   a suíte não chegou a imprimir resumo, duas vezes — máquina disputada,');
    console.log('   memória, ou o `npx` que não subiu. Não é proteção e não é buraco: é');
    console.log('   medida que não houve. Rode de novo com a máquina livre.');
    console.log(`   ${defect.hurts}\n`);
  } else if (veredito.estado === 'marcador-errado') {
    sobreviveram += 1;
    console.log(`\nMARCADOR ERRADO  ${defect.file}`);
    console.log(`   marcada como equivalente e a suíte PEGOU: ${defect.equivalente}`);
    console.log('   tire o marcador — a regra ganhou teste desde que ele foi escrito\n');
  } else if (veredito.estado === 'pego') {
    console.log(`ok ${defect.hurts}`);
  } else {
    sobreviveram += 1;
    console.log(`\nPASSOU DESPERCEBIDO  ${defect.file}`);
    console.log(`   ${defect.from.slice(0, 90)}`);
    console.log(`   vira ${defect.to.slice(0, 90)}`);
    console.log(`   e ninguém percebe: ${defect.hurts}\n`);
  }
}

console.log();
if (sobreviveram > 0) {
  console.log(`${sobreviveram} defeito(s) atravessaram a suíte inteira.`);
  console.log('Verde não quer dizer protegido — quer dizer que os exemplos não exercitam a regra.');
}
if (naoMedidos > 0) {
  console.log(`${naoMedidos} mutação(ões) NÃO foram medidas — e isto não é notícia sobre a suíte.`);
  console.log('Elas não chegaram a ser plantadas: o trecho do `from` mudou, ficou ambíguo,');
  console.log('ou a execução não fechou. O serviço é no arquivo de mutações, não nos testes —');
  console.log('e enquanto não for feito, a regra que cada uma protege está SEM guarda.');
}
if (sobreviveram > 0 || naoMedidos > 0) process.exit(1);
const pegos = DEFECTS.length - equivalentes.length;
console.log(`Os ${pegos} defeitos foram pegos. A suíte morde onde promete morder.`);
if (equivalentes.length > 0) {
  console.log(
    `\nE ${equivalentes.length} mutação(ões) são EQUIVALENTES — nenhum teste possível as distingue:`,
  );
  for (const d of equivalentes) console.log(`   ${d.file}: ${d.equivalente}`);
  console.log('   Elas ficam na lista porque apagá-las esconderia a redundância que as torna assim.');
}

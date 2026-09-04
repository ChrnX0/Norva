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
    from: '      expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5),',
    to: '      expiringSoon(LOCAL_COMPANY_ID, trintaDias, 5, LOCAL_COMPANY_ID),',
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
    from: "        AND m.kind <> 'reversal'\n        AND ${NAO_ESTORNADO}\n      ORDER BY m.occurred_at, m.recorded_at, m.id",
    to: "      ORDER BY m.occurred_at, m.recorded_at, m.id",
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
    from: '    const units = (recipe.yieldAmount * (1 - recipe.lossFraction) * line.batches) / perUnit;',
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
    from: `        AND m.kind = 'production'
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
        AND ${'${NAO_ESTORNADO}'}
      GROUP BY m.item_id, i.name`,
    to: `        AND m.kind = 'production'
        AND m.occurred_at >= ?
        AND m.occurred_at < ?
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
    from: `    const dentro = await planReversal(companyId, input.groupId);
    if (dentro.alreadyReversed || dentro.blocked.length > 0) throw new CannotReverseError(dentro);`,
    equivalente:
      'o estorno tem DUAS checagens em camadas — a de fora evita abrir transacao, a de dentro fecha a corrida entre dois aparelhos. Tirar uma deixa a outra pegando, com o mesmo erro e o mesmo plano, entao nenhum teste de uma linha de execucao so pode distinguir. So concorrencia real separaria as duas, e a suite nao tem duas conexoes.',
    to: `    const dentro = await planReversal(companyId, input.groupId);
    if (dentro.alreadyReversed && false) throw new CannotReverseError(dentro);`,
    hurts:
      'dois aparelhos estornam a mesma corrida no mesmo minuto e a correcao entra duas vezes, dobrada',
  },
  {
    file: 'src/data/repository.ts',
    from: `      WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind <> 'reversal'
      ORDER BY m.quantity_base_units DESC`,
    to: `      WHERE m.company_id = ? AND m.movement_group_id = ? AND m.kind = 'production'
      ORDER BY m.quantity_base_units DESC`,
    hurts:
      'o estorno desfaz so a producao e deixa o consumo de pe: picole que nao consumiu nada, que parece certo e some com o insumo',
  },
  {
    file: 'src/data/repository.ts',
    from: `    const mediaNova = blendRate(antes, {
      baseUnits: input.unitsProduced,
      rate: unitCostRate,
    });`,
    to: `    const mediaNova = antes.averageRate;`,
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
    from: '      order.lines.every((line) => (sent.get(line.itemId) ?? 0) >= line.baseUnits),',
    to: '      order.lines.some((line) => (sent.get(line.itemId) ?? 0) >= line.baseUnits),',
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
    from: '  return sources.ordered ?? sources.lastSent ?? null;',
    to: '  return sources.lastSent ?? sources.ordered ?? null;',
    hurts:
      'a separacao volta a sugerir o envio da semana passada em vez do que a loja pediu, e quem esta com a lista na mao repete o habito em vez de atender o combinado',
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
    from: `              WHERE m.company_id = i.company_id AND m.item_id = i.id
                AND (? IS NULL OR m.location_id = ?))`,
    to: `              WHERE m.company_id = i.company_id AND m.item_id = i.id)`,
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

  {
    file: 'src/domain/recipe.ts',
    from: `      (unitPackaging.itemsRate ?? 0) +`,
    to: `      0 * (unitPackaging.itemsRate ?? 0) +`,
    hurts:
      'as telas cotam o custo sem a embalagem que sai do estoque, e a producao congela um numero maior que o que sete telas prometeram',
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
    from: `                         AND m.quantity_base_units < 0
                         AND (? IS NULL OR m.location_id = ?)`,
    to: `                         AND m.quantity_base_units < 0`,
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
    from: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null);",
    to: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, lotId);",
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

  {
    file: 'src/data/repository.ts',
    from: '      WHERE m.company_id = ? AND m.location_id = ?\n      GROUP BY m.item_id, i.name`,',
    to: '      WHERE m.company_id = ?\n      GROUP BY m.item_id, i.name`,',
    hurts:
      'o tacho passa a ser autorizado pelo açúcar que está na loja, a dez quilômetros dali, e o consumo entra na fábrica deixando a sala negativa',
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
    from: "    for (const p of perdas) porMotivo.set(p.reason, (porMotivo.get(p.reason) ?? 0) + p.valueCents);",
    to: "    for (const p of perdas) porMotivo.set(p.reason, Math.max(porMotivo.get(p.reason) ?? 0, p.valueCents));",
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
    from: 'const netYield = recipe.yieldAmount * (1 - recipe.lossFraction);',
    to: 'const netYield = recipe.yieldAmount * (1 + recipe.lossFraction);',
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
              WHERE m.company_id = i.company_id AND m.item_id = i.id
                AND (? IS NULL OR m.location_id = ?))`,
    to: `(SELECT COALESCE(COUNT(m.quantity_base_units), 0) FROM movements m
              WHERE m.company_id = i.company_id AND m.item_id = i.id
                AND (? IS NULL OR m.location_id = ?))`,
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
    from: "VALUES (?, ?, '', 'store_room', ?)",
    to: "VALUES (?, ?, '', 'storeroom', ?)",
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
    from: "      'operator_id',",
    to: "      // 'operator_id',",
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
  {
    file: 'src/domain/money.ts',
    from: 'return Math.round(value * factor) as Cents;',
    to: 'return Math.trunc(value * factor) as Cents;',
    hurts: 'multiplicar dinheiro passa a cortar em vez de arredondar, sempre para baixo',
  },
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
      '  const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingCents) as Rate;',
    to: '  const unitCostRate = (consumedValue / (input.batches * 500) + product.unitPackagingCents) as Rate;',
    hurts: 'o custo congela pelo rendimento prometido em vez do que saiu do tacho, e a perda some no instante em que aconteceu',
  },
  {
    file: 'src/data/repository.ts',
    from:
      '  const unitCostRate = (consumedValue / input.unitsProduced + product.unitPackagingCents) as Rate;',
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
    from: "      await write(newId(), 'consumption', line.itemId, -line.baseUnits, line.rate, null);",
    to: "      await write(newId(), 'consumption', line.itemId, line.baseUnits, line.rate, null);",
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
    from: "      : ' Contei os insumos pelo que saiu; se rodou tacho cheio, diga \"em 2 tachos\" que eu refaço.';",
    to: "      : '';",
    hurts:
      'o assistente conta os insumos pelo que saiu e nao diz, e quem rodou tacho cheio nao sabe que precisa corrigir',
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
    from: '  const all = await listItems(companyId, undefined, true, locationId);',
    to: '  const all = await listItems(companyId, undefined, true);',
    hurts:
      'findItem volta a responder o total da empresa mesmo quando a pergunta e de uma sala: a tela da camara fria mostra o saldo da fabrica somado ao dela, e a diferenca da contagem sai desse numero',
  },
  {
    file: 'app/inputs/[id].tsx',
    from: '      locationId: contarEm,',
    to: '      locationId: defaultLocationId(LOCAL_COMPANY_ID),',
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

function suitePasses(dir) {
  const run = spawnSync('npx', ['tsx', '--test', 'src/**/*.test.ts'], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  return `${run.stdout}`.includes('# fail 0');
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
  const pego = !suitePasses(dir);
  // Restaura a cópia para o próximo defeito deste trabalhador.
  writeFileSync(join(dir, defect.file), original);

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

let survivors = 0;
const equivalentes = [];

for (const veredito of vereditos) {
  const { defect } = veredito;
  if (veredito.estado === 'obsoleta') {
    survivors += 1;
    console.log(`?  ${defect.file}: o trecho mudou — atualize esta mutação`);
    console.log(`   ${defect.hurts}\n`);
  } else if (veredito.estado === 'ambigua') {
    survivors += 1;
    console.log(`?  ${defect.file}: o trecho aparece ${veredito.hits} vezes`);
    console.log(`   a troca pega só a primeira — dê contexto ao \`from\` até ele ser único`);
    console.log(`   ${defect.hurts}\n`);
  } else if (veredito.estado === 'equivalente') {
    equivalentes.push(defect);
  } else if (veredito.estado === 'marcador-errado') {
    survivors += 1;
    console.log(`\nMARCADOR ERRADO  ${defect.file}`);
    console.log(`   marcada como equivalente e a suíte PEGOU: ${defect.equivalente}`);
    console.log('   tire o marcador — a regra ganhou teste desde que ele foi escrito\n');
  } else if (veredito.estado === 'pego') {
    console.log(`ok ${defect.hurts}`);
  } else {
    survivors += 1;
    console.log(`\nPASSOU DESPERCEBIDO  ${defect.file}`);
    console.log(`   ${defect.from.slice(0, 90)}`);
    console.log(`   vira ${defect.to.slice(0, 90)}`);
    console.log(`   e ninguém percebe: ${defect.hurts}\n`);
  }
}

console.log();
if (survivors > 0) {
  console.log(`${survivors} defeito(s) atravessaram a suíte inteira.`);
  console.log('Verde não quer dizer protegido — quer dizer que os exemplos não exercitam a regra.');
  process.exit(1);
}
const pegos = DEFECTS.length - equivalentes.length;
console.log(`Os ${pegos} defeitos foram pegos. A suíte morde onde promete morder.`);
if (equivalentes.length > 0) {
  console.log(
    `\nE ${equivalentes.length} mutação(ões) são EQUIVALENTES — nenhum teste possível as distingue:`,
  );
  for (const d of equivalentes) console.log(`   ${d.file}: ${d.equivalente}`);
  console.log('   Elas ficam na lista porque apagá-las esconderia a redundância que as torna assim.');
}

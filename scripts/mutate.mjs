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

import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { spawnSync } from 'node:child_process';

/** @type {{file: string, from: string, to: string, hurts: string}[]} */
const DEFECTS = [
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
    from: `      WHERE o.company_id = ?
        AND o.status IN ('pending', 'open')`,
    to: `      WHERE o.company_id = ?
        AND o.status IN ('pending', 'open', 'delivered')`,
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
  {
    file: 'src/domain/ledger.ts',
    from: 'return balanceOf(movements.filter((m) => new Date(m.occurredAt).getTime() <= cutoff));',
    to: 'return balanceOf(movements.filter((m) => new Date(m.occurredAt).getTime() < cutoff));',
    hurts: 'o saldo "às 3h" perde o movimento das 3h em ponto, e a excursão de temperatura acusa o lote errado',
  },
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

/** O que uma cópia precisa para rodar a suíte rápida. Nada mais. */
const COPIAR = ['src', 'scripts', 'package.json', 'tsconfig.json'];

function prepararOficina() {
  rmSync(OFICINA, { recursive: true, force: true });
  for (let n = 0; n < TRABALHADORES; n += 1) {
    const dir = join(OFICINA, `w${n}`);
    mkdirSync(dir, { recursive: true });
    for (const alvo of COPIAR) {
      cpSync(join(RAIZ, alvo), join(dir, alvo), { recursive: true });
    }
    symlinkSync(join(RAIZ, 'node_modules'), join(dir, 'node_modules'), 'dir');
  }
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
  return { estado: pego ? 'pego' : 'sobreviveu', defect };
}

prepararOficina();
process.on('exit', () => rmSync(OFICINA, { recursive: true, force: true }));

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
console.log(`Os ${DEFECTS.length} defeitos foram pegos. A suíte morde onde promete morder.`);

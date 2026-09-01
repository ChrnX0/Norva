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

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** @type {{file: string, from: string, to: string, hurts: string}[]} */
const DEFECTS = [
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
    from: 'if (stack.includes(recipeId)) throw new RecipeCycleError([...stack, recipeId]);',
    to: 'if (false) throw new RecipeCycleError([...stack, recipeId]);',
    hurts: 'receita que se referencia trava o aplicativo em vez de recusar',
  },
  {
    file: 'src/domain/recipe.ts',
    from: 'if (!recipe) throw new MissingRecipeError(recipeId);',
    to: 'if (!recipe) return { recipeId, version: 0, batchCents: cents(0), netYield: 0, perYieldUnit: 0 as Rate, lines: [], lossFraction: 0 };',
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
    from: 'COALESCE(SUM(m.quantity_base_units), 0)',
    to: 'COALESCE(COUNT(m.quantity_base_units), 0)',
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
    from: "  operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss'],",
    to: "  operator: ['record_production', 'dispatch', 'check_receipt', 'record_loss', 'view_cost'],",
    hurts: 'o operador de fábrica passa a ver o custo, e ninguém pediu isso',
  },
  {
    file: 'src/assistant/index.ts',
    from: 'if (skill.requires && !context.capabilities.has(skill.requires)) {',
    to: 'if (false) {',
    hurts: 'o assistente entrega custo a quem não pode ver custo',
  },
];

function suitePasses() {
  const run = spawnSync('npm', ['test'], { encoding: 'utf8' });
  return `${run.stdout}`.includes('# fail 0');
}

let survivors = 0;

console.log(`Quebrando o código de propósito, ${DEFECTS.length} vezes.\n`);

for (const defect of DEFECTS) {
  const original = readFileSync(defect.file, 'utf8');

  if (!original.includes(defect.from)) {
    console.log(`?  ${defect.file}: o trecho mudou — atualize esta mutação`);
    console.log(`   ${defect.hurts}\n`);
    survivors += 1;
    continue;
  }

  writeFileSync(defect.file, original.replace(defect.from, defect.to));
  let caught = false;
  try {
    caught = !suitePasses();
  } finally {
    writeFileSync(defect.file, original);
  }

  if (caught) {
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

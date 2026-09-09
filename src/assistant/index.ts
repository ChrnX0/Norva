import { phase1Skills } from './skills';
import type { Answer, Capability, Skill, SkillContext } from './types';

export * from './types';
export { phase1Skills } from './skills';

/**
 * The assistant speaks Portuguese only, and that is a boundary rather than an
 * oversight.
 *
 * The screens read every word from the dictionary and run in three languages.
 * The assistant cannot follow yet, because what it matches on is Portuguese
 * phrasing: "quanto custa", "comprei 4 sacos de". Translating the answers would
 * be half a job - the questions would still only arrive in one language, and an
 * assistant that answers in Spanish but only understands Portuguese is worse
 * than one that is honestly monolingual.
 *
 * The design already says how this ends: when a language model does the
 * matching, it maps any phrasing to a skill and its slots, and the language of
 * the question stops being the matcher's problem. The answers move to the
 * dictionary then, in the same change.
 *
 * ---
 *
 * **CONGELADO em 6 de setembro, e congelado não é apagado.**
 *
 * O dono aprovou o modo conversa com áudio — *"imagina o padeiro com a mão suja…
 * até para quem eh cego"* — e isso muda a FORMA desta camada, não o conteúdo dela:
 * a entrada deixa de ser caixa de texto e passa a ser fala, e a resposta deixa de
 * ser parágrafo e passa a ser algo dito. O casamento por frase em português, que é
 * o que ocupa as 1142 linhas do `skills.ts`, é exatamente a peça que um modelo
 * substitui.
 *
 * Então o que vale daqui até o áudio existir: **nada de habilidade nova aqui, e
 * nada de tradução das respostas.** Investir nesta forma agora é construir para
 * jogar fora, e jogar fora custa duas vezes — a construção e a coragem de apagar.
 *
 * O que continua valendo sem prazo: conserto de defeito, e o `[por quê?]` que toda
 * resposta abre. Essa parte não muda de forma, porque ela não é do casador — é da
 * doutrina.
 */

/**
 * The one door every question goes through.
 *
 * There was a `registerSkills` here, so a module could extend the assistant by
 * pushing into a mutable registry. Nothing ever pushed: the list has always been
 * `phase1Skills`, and a registry with one writer and no extender is a mutable
 * array pretending to be an extension point. The P1 gate of this project asks who
 * calls it in the same commit — when a second module has skills to add, it comes
 * back with its caller, and a `const` becomes a registry again in one line.
 */
export function knownSkills(capabilities: ReadonlySet<Capability>): Skill[] {
  return phase1Skills.filter((s) => !s.requires || capabilities.has(s.requires));
}

/**
 * Answers a question.
 *
 * The permission check runs *before* the query, which is the whole security
 * design in one line: a figure the person may not see never enters the answer,
 * so there is nothing for a model to leak later. Telling a model to keep a
 * secret is not a control - the filter belongs in the data path.
 *
 * When a language model is added it sits in front of this function, choosing a
 * skill and its slots. It never reaches the data, and it never produces a
 * number.
 */
/**
 * O que se diz quando a habilidade não é desta pessoa — uma frase por capacidade.
 *
 * O padrão está escrito no resto do aplicativo: *"Este pedido espera aprovação, e
 * aprovar não faz parte do seu acesso."* Diz o que se pediu, diz que não é seu, e
 * diz para quem é — sem culpar ninguém, que é o tom desta casa.
 *
 * Fica aqui, e não no dicionário, pela mesma razão que o resto do assistente: ele
 * responde em português por congelamento registrado no topo deste módulo, até o modo
 * áudio existir. Quando o dicionário alcançá-lo, este mapa vira uma seção dele.
 */
const RECUSA: Record<Capability, string> = {
  view_cost: 'Esse número não faz parte do seu acesso. Quem cuida do financeiro consegue ver.',
  view_sale_price: 'O preço de venda não faz parte do seu acesso. Quem cuida do comercial consegue ver.',
  view_finance: 'O financeiro não faz parte do seu acesso.',
  record_production: 'Lançar produção não faz parte do seu acesso. Quem opera a fábrica consegue.',
  adjust_stock: 'Ajustar estoque não faz parte do seu acesso. Quem conta a prateleira consegue.',
  dispatch: 'Despachar carga não faz parte do seu acesso. Quem carrega consegue.',
  check_receipt: 'Conferir recebimento não faz parte do seu acesso.',
  record_loss: 'Lançar perda não faz parte do seu acesso.',
  place_order: 'Anotar pedido não faz parte do seu acesso. Quem compra consegue.',
  approve_order: 'Aprovar pedido não faz parte do seu acesso.',
  manage_company: 'Isso é de quem administra a empresa.',
  issue_invoice: 'Emitir nota não faz parte do seu acesso.',
};

export async function ask(question: string, context: SkillContext): Promise<Answer> {
  const trimmed = question.trim();
  if (!trimmed) return { text: 'Pode perguntar.' };

  for (const skill of phase1Skills) {
    const match = skill.match(trimmed);
    if (!match) continue;

    if (skill.requires && !context.capabilities.has(skill.requires)) {
      // Said plainly and without embarrassment: this is a boundary of the role,
      // not a failure of the person.
      //
      // **A frase vem da CAPACIDADE barrada, e era uma só.** Ela dizia *"Esse número
      // não faz parte do seu acesso. Quem cuida do financeiro consegue ver"* para
      // todas — inclusive para lançar produção, contar prateleira, anotar pedido e
      // cadastrar insumo, que não são número nem financeiro. Quem ouve isso depois
      // de pedir para registrar um tacho entende que o app está quebrado, não que
      // aquilo não é dele.
      return { text: RECUSA[skill.requires] };
    }

    // The words that reached here travel with the context, so a skill that
    // writes can put them in the ledger. Nothing else needs them.
    return skill.run(match, { ...context, question: trimmed });
  }

  const available = knownSkills(context.capabilities);
  return {
    text:
      available.length > 0
        ? 'Ainda não sei responder isso. Por enquanto eu sei, por exemplo:'
        : 'Ainda não sei responder isso.',
    // Lista, não conta: é o que a frase acima acabou de prometer com o
    // dois-pontos. Estas linhas ficavam atrás de um botão escrito "POR QUÊ?".
    list: available.map((skill) => ({ label: skill.example })),
  };
}

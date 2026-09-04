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
 */

/**
 * The one door every question goes through.
 *
 * Modules register what they can answer and what they can fill, so turning a
 * module on extends the assistant automatically instead of leaving it behind.
 */
const registry: Skill[] = [...phase1Skills];

export function registerSkills(skills: readonly Skill[]): void {
  for (const skill of skills) {
    if (!registry.some((existing) => existing.id === skill.id)) registry.push(skill);
  }
}

export function knownSkills(capabilities: ReadonlySet<Capability>): Skill[] {
  return registry.filter((s) => !s.requires || capabilities.has(s.requires));
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
export async function ask(question: string, context: SkillContext): Promise<Answer> {
  const trimmed = question.trim();
  if (!trimmed) return { text: 'Pode perguntar.' };

  for (const skill of registry) {
    const match = skill.match(trimmed);
    if (!match) continue;

    if (skill.requires && !context.capabilities.has(skill.requires)) {
      // Said plainly and without embarrassment: this is a boundary of the role,
      // not a failure of the person.
      return {
        text: 'Esse número não faz parte do seu acesso. Quem cuida do financeiro consegue ver.',
      };
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

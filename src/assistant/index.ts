import { phase1Skills } from './skills';
import type { Answer, Capability, Skill, SkillContext } from './types';

export * from './types';
export { phase1Skills } from './skills';

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

    return skill.run(match, context);
  }

  const available = knownSkills(context.capabilities);
  return {
    text:
      available.length > 0
        ? 'Ainda não sei responder isso. Por enquanto eu sei, por exemplo:'
        : 'Ainda não sei responder isso.',
    detail: available.map((skill) => ({ label: '·', value: skill.example })),
  };
}

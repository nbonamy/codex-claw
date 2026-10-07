import { product } from '@workspace/core/product';
import type { MissionRun } from '@workspace/core/mission-execution';
import type { MissionStage } from '@workspace/core/missions';
import html from './korus-inline-html/SKILL.md?raw';
import computerUse from './korus-computer-use/SKILL.md?raw';
import visualize from './korus-visualize/SKILL.md?raw';
import requirements from './mission-shape-requirements/SKILL.md?raw';
import tickets from './mission-to-tickets/SKILL.md?raw';
import implementation from './mission-implement-ticket/SKILL.md?raw';
import review from './mission-review/SKILL.md?raw';

type SkillContext = { computerUseEnabled?: boolean; missionStage?: MissionStage };
type Skill = { name: string; description: string; markdown: string };

// Bundled, authored frontmatter uses single-line unquoted name/description fields.
function skill(source: string): Skill {
  const markdown = source.replaceAll('\r\n', '\n').replaceAll('{{productName}}', product.name).replaceAll('{{mcpServerName}}', product.mcpServerName);
  const header = /^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1];
  const name = header && /^name: (.+)$/m.exec(header)?.[1];
  const description = header && /^description: (.+)$/m.exec(header)?.[1];
  if (!name || !description) throw new Error('Invalid bundled skill metadata.');
  return { name, description, markdown };
}

const generalSkills = [skill(html), skill(visualize)];
const computerUseSkill = skill(computerUse);
const missionSkills: Partial<Record<MissionStage, Skill>> = {
  requirements: skill(requirements), tickets: skill(tickets),
  implementation: skill(implementation), review: skill(review),
};

function availableSkills(context: SkillContext): Skill[] {
  const mission = context.missionStage && missionSkills[context.missionStage];
  return [...generalSkills, ...(context.computerUseEnabled ? [computerUseSkill] : []), ...(mission ? [mission] : [])];
}

export function readBundledSkill(name: string, context: SkillContext): Skill {
  const result = availableSkills(context).find(candidate => candidate.name === name);
  if (!result) throw new Error(`Skill '${name}' is unavailable in this session.`);
  return result;
}

export function bundledSkillInstructions(context: SkillContext): string {
  return [
    `Bundled ${product.name} skills: before using a matching capability, call read-skill with its name and follow the returned instructions. These are loaded through MCP, not filesystem paths or the provider's native skill loader.`,
    ...availableSkills(context).map(({ name, description }) => `- ${name}: ${description}`),
  ].join('\n');
}

export function missionStageSkills(stage: MissionStage): MissionRun['skills'] {
  const definition = missionSkills[stage];
  return definition ? [{ name: definition.name }] : [];
}

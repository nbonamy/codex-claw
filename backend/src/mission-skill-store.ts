import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MissionRun } from '@codex-claw/core/mission-execution';
import type { MissionStage } from '@codex-claw/core/missions';

interface MissionSkillStorage {
  ensure(missionId: string, stage: MissionStage): Promise<MissionRun['skills']>;
}

type MissionSkillDefinition = { name: string; markdown: string };

const definitions: Partial<Record<MissionStage, MissionSkillDefinition>> = {
  requirements: {
    name: 'mission-shape-requirements',
    markdown: `---
name: mission-shape-requirements
description: Shape a Mission outcome, constraints, and acceptance criteria through conversation.
disable-model-invocation: true
---

# Shape Mission requirements

Turn the user's idea into a reviewable Mission brief through conversation.

1. Start with the outcome. If the idea is still open, ask what the user wants to build and why it matters.
2. Interview for users, scope, constraints, non-goals, risks, and observable acceptance criteria. Use the provider's structured question tool for bounded choices and normal conversation for open-ended ideation.
3. Keep repository selection optional while shaping. Use represented repositories only when they provide useful context.
4. Resolve material ambiguity before drafting. Record decisions in the artifact instead of repeating them in chat.
5. Set a concise outcome-oriented Mission title with \`codex_claw.set-mission-title\`.
6. Write the requirements artifact with \`codex_claw.write-mission-artifact\`, then submit the complete proposal with \`codex_claw.submit-mission-result\`.

The requirements are done when the outcome, boundaries, and acceptance criteria are specific enough to derive implementation tickets and the proposal is waiting for user review.
`,
  },
  tickets: {
    name: 'mission-to-tickets',
    markdown: `---
name: mission-to-tickets
description: Turn approved Mission requirements into repository-scoped tracer-bullet tickets.
disable-model-invocation: true
---

# Turn a Mission into tickets

Convert the accepted requirements into a small, ordered backlog that Mission agents can execute.

1. Read the accepted requirements and shared Mission artifacts. Inspect represented repositories or delegate focused repository research when code context affects the breakdown.
2. Draft tracer-bullet vertical slices. Each ticket must deliver independently verifiable behavior, fit one agent context, name exactly one represented repository, and include acceptance criteria plus meaningful verification.
3. Record real blocking edges only. Use an expand-migrate-contract sequence for a wide mechanical refactor that cannot land as independent vertical slices.
4. Upsert each draft through \`codex_claw.upsert-mission-ticket\` as soon as it is coherent, then revise it through the same tool as the breakdown improves. Use the stable Mission ticket IDs returned by the tool for dependencies.
5. Review granularity, dependencies, repository assignment, and execution policy with the user. Record the policy through \`codex_claw.set-mission-execution-policy\`.
6. When an existing tracker and its repository instructions are already configured, preserve its labels and publish only after review. Otherwise keep Mission tickets as the canonical backlog and continue without tracker setup.
7. Submit the complete proposal with \`codex_claw.submit-mission-result\`.

The ticket stage is done when every ticket has one represented repository, the dependency frontier is valid, the user has reviewed the breakdown, and the proposal is waiting for approval.
`,
  },
  implementation: {
    name: 'mission-implement-ticket',
    markdown: `---
name: mission-implement-ticket
description: Implement one assigned Mission ticket in its isolated repository worktree.
disable-model-invocation: true
---

# Implement a Mission ticket

Complete only the assigned ticket in the assigned isolated worktree.

1. Read the canonical ticket, accepted requirements, repository instructions, and relevant existing code before editing.
2. Make the smallest coherent vertical change that satisfies every acceptance criterion. Keep changes inside the assigned repository worktree.
3. Commit at coherent, reviewable milestones. Prefer one commit for a focused ticket; use a few commits when the work has independently understandable steps. Keep behavior and its tests together, follow the repository's commit convention, and never split work into commits per file or tiny edit.
4. Run the repository's meaningful focused checks and inspect the resulting diff and commit history. Before final submission, commit every intended ticket change and verify the working tree is clean. At least one new commit must represent this ticket. Keep commits local: do not push, merge, or open a pull request.
5. Report blockers in the stage conversation. Report successful changed paths, commit SHAs, and exact verification results through \`codex_claw.submit-mission-result\`.

The ticket is done when its acceptance criteria are met, its intended changes are committed with a clean working tree, and its evidence is submitted for the configured review policy.
`,
  },
  review: {
    name: 'mission-review',
    markdown: `---
name: mission-review
description: Review Mission implementation evidence and repository changes before delivery.
disable-model-invocation: true
---

# Review a Mission

Assess the completed implementation against the accepted Mission artifacts.

1. Read the accepted requirements, tickets, implementation evidence, and repository instructions.
2. Inspect the actual changes in every affected Mission worktree and run checks needed to validate material claims.
3. Report concrete findings with severity, evidence, and affected repository. Separate blocking findings from residual risks.
4. Write the review artifact with \`codex_claw.write-mission-artifact\`, then submit the delivery recommendation through \`codex_claw.submit-mission-result\`.

The review is done when every affected repository is accounted for and the user has enough evidence to approve fixes or continue to Ship.
`,
  },
};

export class FileMissionSkillStore implements MissionSkillStorage {
  constructor(private readonly ensureMissionHome: (missionId: string) => Promise<string>) {}

  async ensure(missionId: string, stage: MissionStage): Promise<MissionRun['skills']> {
    const definition = definitions[stage];
    if (!definition) return [];
    const directory = path.join(await this.ensureMissionHome(missionId), 'skills', definition.name);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const skillPath = path.join(directory, 'SKILL.md');
    await writeFile(skillPath, definition.markdown, { encoding: 'utf8', mode: 0o600 });
    return [{ name: definition.name, path: skillPath }];
  }
}

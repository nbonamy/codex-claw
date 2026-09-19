import type { BackendSkillSummary } from './contracts';
import type { Mission, MissionArtifacts, MissionStage } from './missions';

export type MissionRun = {
  id: string;
  stage: MissionStage;
  memberId: string;
  workerId?: string;
  ticketIndex?: number;
  status: 'preparing' | 'running' | 'awaitingReview' | 'accepted' | 'cancelled' | 'failed';
  skills: { name: string; path: string }[];
  feedback: string;
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
  proposal?: MissionArtifacts;
};
export type MissionExecution = {
  teamId: string;
  repoPath: string;
  memberIds: string[];
  workspace?: { path: string; branch: string; baseSha?: string };
  runs: MissionRun[];
};
export type MissionExecutionInput = { id: string; revision: number } & (
  | { action: 'configure'; teamId: string; repoPath: string; memberIds: string[] }
  | { action: 'run'; memberId?: string; ticketIndex?: number; feedback?: string }
  | { action: 'accept'; runId: string }
  | { action: 'cancel'; runId: string }
  | { action: 'reopen'; stage: MissionStage }
);
export type MissionResultInput = { missionId: string; runId: string; artifacts: MissionArtifacts; summary: string };
export type MissionToolContext = { missionId: string; runId: string; stage: MissionStage };

export function pendingMissionRun(mission: Mission): MissionRun | undefined {
  return mission.execution?.runs.slice().reverse().find(run => ['preparing', 'running', 'awaitingReview'].includes(run.status));
}

// Each group represents one capability, with current names preferred over older aliases.
const skillNames: Record<MissionStage, string[][]> = {
  requirements: [['grill-with-docs', 'grilling', 'grill-me'], ['to-spec', 'to-prd', 'write-a-prd']],
  tickets: [['to-tickets', 'to-issues', 'prd-to-issues', 'design']],
  implementation: [['implement'], ['tdd'], ['codex-claw-testing-coverage']],
  review: [['code-review', 'review'], ['codex-claw-dod']],
};
export function missionSkills(stage: MissionStage, available: BackendSkillSummary[]): MissionRun['skills'] {
  return skillNames[stage].flatMap(alternatives => {
    for (const name of alternatives) {
      const match = available.find(skill => skill.enabled && (skill.name === name || skill.name.endsWith(`:${name}`)));
      if (match) return [{ name: match.name, path: match.path }];
    }
    return [];
  });
}

export function missionRunPrompt(mission: Mission, run: MissionRun): string {
  const instructions: Record<MissionStage, string> = {
    requirements: 'Investigate the repository and shape the outcome with the user. Clarify scope, constraints, non-goals, and observable acceptance criteria. Ask questions through the conversation when needed. Once the outcome is clear, call codex_claw.set-mission-title with a concise outcome-oriented title. Do not implement code. First grill and clarify with the user; only after that, synthesize the agreed conversation with the spec skill if available. Submit requirements when they are ready for user review.',
    tickets: 'Read the configured repository issue tracker instructions, including docs/agents/issue-tracker.md when present. Preserve its custom label mappings. Tracker choices are alternatives: never create a duplicate local/GitHub tracker. Turn the approved requirements into a small ordered implementation backlog. Each ticket must describe the change, acceptance criteria, dependencies, and meaningful verification in its title text. Keep tickets independently reviewable. Return each ticket with title, done:false, reference (canonical URL or repo-relative file path for published tickets), and dependsOn (zero-based indices of blocking tickets). Read the published artifact back before reporting its reference. Review the breakdown with the user before publishing according to the ticketing skill. Preserve the configured tracker as the authority; mission completion flags record acceptance of implementation, not remote issue closure. Do not implement code.',
    implementation: `Implement ONLY ticket ${(run.ticketIndex ?? 0) + 1} below. Read the assigned ticket from its canonical reference when present, including tracker comments and configured label meanings. Mission done flags mean accepted implementation, not tracker issue closure. Read repository instructions and follow its test strategy. Run relevant tests and inspect the actual diff. Leave changes in this mission worktree for review. Do not merge, push, or open a PR. Mark only your ticket done after it meets acceptance; record changed paths and exact verification commands/results. If blocked, explain it in the conversation rather than claim completion.`,
    review: 'Review the mission branch and uncommitted changes against the approved requirements and tickets. Inspect actual code/diffs and run appropriate checks. Report concrete findings, risks, and a delivery recommendation. Do not silently fix findings, merge, push, or create a PR. The user controls delivery from the workflow.',
  };
  return [
    `Mission: ${mission.outcome}`,
    `Stage: ${run.stage}. Mission ID: ${mission.id}. Run ID: ${run.id}.`,
    `Mission baseline commit: ${mission.execution?.workspace?.baseSha ?? 'unavailable'}. Review committed branch changes against this baseline as well as uncommitted changes.`,
    `Work only in the isolated mission worktree: ${mission.execution?.workspace?.path}. Do not edit the source checkout or other worktrees.`,
    'Do not automatically invoke setup-matt-pocock-skills: setup is an explicit user action. If tracker setup is missing and a skill needs it, explain the missing setup to the user in the stage conversation.\nThis is an explicitly assigned mission task. Follow repository instructions. User approval of artifacts and delivery remains required.',
    instructions[run.stage],
    run.skills.length ? `Use these available skills: ${run.skills.map(skill => `${skill.name} (${skill.path})`).join(', ')}. Read their SKILL.md instructions before applying them. The mission task authorizes their relevant work. Do not push code, open pull requests, or merge. Ticket publication must follow the ticketing skill’s human review and configured tracker instructions.` : 'No matching stage skill was available in your backend catalog. Apply the stage instructions and repository guidance directly; do not claim you used an unavailable skill.',
    run.feedback ? `User revision feedback:\n${run.feedback}` : '',
    `Current accepted artifacts:\n${JSON.stringify(mission.artifacts, null, 2)}`,
    'When ready, call codex_claw.submit-mission-result with missionId, runId, summary, and the complete artifacts object using the same schema shown above. Update only artifacts belonging to your assigned stage (and only your assigned implementation ticket). This submits a proposal for user review; it does not approve a stage. Do not merely paste the result into chat. Do not claim a stage was approved or a mission completed.',
  ].filter(Boolean).join('\n\n');
}

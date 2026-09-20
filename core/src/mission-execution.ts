import type { BackendSkillSummary } from './contracts';
import type { Mission, MissionArtifacts, MissionStage, MissionTicket } from './missions';

export type MissionRun = {
  id: string;
  stage: MissionStage;
  memberId: string;
  workerId?: string;
  ticketIndex?: number;
  repositoryPath?: string;
  status: 'preparing' | 'running' | 'awaitingReview' | 'accepted' | 'cancelled' | 'failed';
  skills: { name: string; path: string }[];
  feedback: string;
  startedAt: string;
  finishedAt?: string;
  summary?: string;
  error?: string;
  proposal?: MissionArtifacts;
  draftTickets?: MissionTicket[];
  implementationResult?: { changes: string; tests: string };
};
export type MissionReviewPolicy = 'reviewEachTicket' | 'reviewAfterImplementation';
export type MissionWorkspace = { repositoryPath: string; path: string; branch: string; baseSha?: string };
export type MissionDelivery = {
  repositoryPath: string;
  agentId: string;
  status: 'pending' | 'pullRequestCreated' | 'merged';
  pullRequest?: { number: number; url: string };
};
export type MissionExecution = {
  teamId: string;
  repoPath?: string;
  memberIds: string[];
  workspace?: { path: string; branch: string; baseSha?: string };
  workspaceName?: string;
  workspaces?: MissionWorkspace[];
  deliveries?: MissionDelivery[];
  reviewPolicy?: MissionReviewPolicy;
  runs: MissionRun[];
};
export type MissionExecutionInput = { id: string; revision: number } & (
  | { action: 'configure'; teamId: string; memberIds: string[] }
  | { action: 'attachRepository'; repoPath: string }
  | { action: 'run'; memberId?: string; ticketIndex?: number; feedback?: string }
  | { action: 'accept'; runId: string }
  | { action: 'cancel'; runId: string }
  | { action: 'recordDelivery'; repositoryPath: string; result: { kind: 'pullRequest'; number: number; url: string } | { kind: 'merge' } }
  | { action: 'reopen'; stage: MissionStage }
);
export type MissionResultInput = { missionId: string; runId: string; artifacts: MissionArtifacts; summary: string };
export type MissionToolContext = { missionId: string; runId: string; stage: MissionStage };
export type MissionArtifactWriteInput = { stage: MissionStage; content: string; expectedRevision?: number };
export type MissionArtifactReadResult = { stage: MissionStage; content: string; revision: number; updatedAt: string };
export type MissionTicketDraftInput = { ticketId?: string; title: string; body: string; repositoryPath: string; reference?: string; blockedByTicketIds?: string[] };
export type MissionTicketDraftResult = { success: true; ticketId: string; index: number; artifactRevision: number };
export type MissionExecutionPolicyResult = { success: true; reviewPolicy: MissionReviewPolicy };

export function pendingMissionRun(mission: Mission): MissionRun | undefined {
  return mission.execution?.runs.slice().reverse().find(run => ['preparing', 'running', 'awaitingReview'].includes(run.status));
}

// Each group represents one capability, with current names preferred over older aliases.
const skillNames: Record<MissionStage, string[][]> = {
  requirements: [['grill-with-docs', 'grilling', 'grill-me'], ['to-spec', 'to-prd', 'write-a-prd']],
  tickets: [['to-tickets', 'to-issues', 'prd-to-issues', 'design']],
  implementation: [['implement'], ['tdd'], ['codex-claw-testing-coverage']],
  review: [['code-review', 'review'], ['codex-claw-dod']],
  ship: [],
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

export function missionDeveloperInstructions(mission: Mission, run: MissionRun, repositories: string[] = []): string {
  const instructions: Record<MissionStage, string> = {
    requirements: "Treat the user's first message as the beginning of requirements shaping. If it does not yet state an outcome, ask what they want to build. Shape the outcome through conversation before assuming a repository or solution. Clarify scope, constraints, non-goals, and observable acceptance criteria. For bounded choices during grilling, use the provider's structured ask-user-question tool when available (for Codex, request_user_input) so the user can answer interactively; keep open-ended ideation in normal conversation. Once the outcome is clear, call codex_claw.set-mission-title with a concise outcome-oriented title. Do not implement code. First grill and clarify with the user; only after that, synthesize the agreed conversation with the spec skill if available. Submit requirements when they are ready for user review.",
    tickets: 'Continue as the same Mission orchestrator. Tell the user that the requirements are approved and you are turning them into tickets. Read and apply the to-tickets skill when available. Read the configured repository issue tracker instructions, including docs/agents/issue-tracker.md when present, and preserve its custom label mappings. Tracker choices are alternatives: never create a duplicate local/GitHub tracker. Turn the approved requirements into a small ordered implementation backlog. Each ticket must be a tracer-bullet vertical slice assigned to exactly one represented repository, with acceptance criteria, dependencies, and meaningful verification. Use codex_claw.upsert-mission-ticket for every draft and revision so tickets appear in the Mission while you work. Ask whether the user wants to review every completed ticket or review once after implementation, then record that choice with codex_claw.set-mission-execution-policy. The tool assigns a stable Mission ticket ID; tracker issue numbers remain optional external references assigned only when published. Review the breakdown, affected repositories, and execution policy with the user before publishing according to the ticketing skill. You may delegate repository research to agents created in the relevant represented repositories, then incorporate their findings into the Mission tickets yourself. Preserve the configured tracker as the authority; mission completion flags record acceptance of implementation, not remote issue closure. Do not implement code.',
    implementation: `Implement ONLY ticket ${(run.ticketIndex ?? 0) + 1} in ${run.repositoryPath ?? 'the assigned repository'}. Read the assigned ticket from its canonical reference when present, including tracker comments and configured label meanings. Mission done flags mean accepted implementation, not tracker issue closure. Read repository instructions and follow its test strategy. Run relevant tests and inspect the actual diff. Leave changes in this mission worktree for review. Do not merge, push, or open a PR. Mark only your ticket done after it meets acceptance; record changed paths and exact verification commands/results in submit-mission-result. Do not write the shared Implementation artifact directly; Claw aggregates accepted ticket evidence. If blocked, explain it in the conversation rather than claim completion.`,
    review: 'Review the mission branch and uncommitted changes against the approved requirements and tickets. Inspect actual code/diffs and run appropriate checks. Report concrete findings, risks, and a delivery recommendation. Do not silently fix findings, merge, push, or create a PR. The user controls delivery from the workflow.',
    ship: 'Shipping is controlled by the Mission workspace. Do not start an agent run for this stage.',
  };
  const context = [
    `Mission: ${mission.outcome}`,
    `Stage: ${run.stage}. Mission ID: ${mission.id}. Run ID: ${run.id}.`,
    `Repositories currently represented in the team: ${repositories.length ? repositories.join(', ') : 'none'}. Repository attachment is optional during shaping.`,
    mission.execution?.workspaces?.length
      ? `Mission workspace ${mission.execution.workspaceName ?? ''}:\n${mission.execution.workspaces.map(workspace => `- ${workspace.repositoryPath} -> ${workspace.path} at ${workspace.baseSha ?? 'unavailable'}`).join('\n')}\nWork only in your assigned isolated worktree. Do not edit source checkouts or other Mission worktrees.`
      : mission.execution?.workspace
        ? `Mission baseline commit: ${mission.execution.workspace.baseSha ?? 'unavailable'}. Work only in the isolated mission worktree: ${mission.execution.workspace.path}. Do not edit the source checkout or other worktrees.`
      : 'This stage runs from the Claw-owned mission home. No Git worktree is attached yet.',
    'Do not automatically invoke setup-matt-pocock-skills: setup is an explicit user action. If tracker setup is missing and a skill needs it, explain the missing setup to the user in the stage conversation.\nThis is an explicitly assigned mission task. Follow repository instructions. User approval of artifacts and delivery remains required.',
    'Keep stage conversation concise. Use it for questions, decisions, progress, and blockers; do not restate complete requirements, tickets, or evidence that is already visible in the Mission workspace.',
    instructions[run.stage],
    run.skills.length ? `Use these available skills: ${run.skills.map(skill => `${skill.name} (${skill.path})`).join(', ')}. Read their SKILL.md instructions before applying them. The mission task authorizes their relevant work. Do not push code, open pull requests, or merge. Ticket publication must follow the ticketing skill’s human review and configured tracker instructions.` : 'No matching stage skill was available in your backend catalog. Apply the stage instructions and repository guidance directly; do not claim you used an unavailable skill.',
    run.feedback ? `User revision feedback:\n${run.feedback}` : '',
    `Current accepted artifacts:\n${JSON.stringify(mission.artifacts, null, 2)}`,
    `Canonical artifact files:\n${JSON.stringify(mission.artifactFiles, null, 2)}`,
    'Use codex_claw.list-mission-artifacts and codex_claw.read-mission-artifact to inspect shared mission work. For Requirements and Review, write your stage artifact with codex_claw.write-mission-artifact before submitting it. During Tickets, use only codex_claw.upsert-mission-ticket for ticket content; pass the exact represented repository path for every ticket. During Implementation, submit ticket-scoped changes and verification directly; Claw aggregates the canonical Implementation artifact. These tools are the canonical handoff between mission agents.',
    'When ready, call codex_claw.submit-mission-result with missionId, runId, summary, and the complete artifacts object using the same schema shown above. Update only artifacts belonging to your assigned stage (and only your assigned implementation ticket). This submits a proposal for user review; it does not approve a stage. Do not merely paste the result into chat. Do not claim a stage was approved or a mission completed.',
  ].filter(Boolean).join('\n\n');
  return `<context>\n${context}\n</context>`;
}

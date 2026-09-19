import { randomUUID } from 'node:crypto';
import {
  activeCodeReviewRound,
  codeReviewLedger,
  type CodeReviewAssignmentInput,
  type CodeReviewDecisionInput,
  type CodeReviewDiscussionInput,
  type CodeReviewFinding,
  type CodeReviewFindingInput,
  type CodeReviewFindingUpdateInput,
  type CodeReviewRound,
  type CodeReviewSession,
} from '@codex-claw/core/code-review';
import type { Agent, AgentStatus, AppSnapshot } from '@codex-claw/core/contracts';
import type { ReviewFindingCompletionInput, ReviewToolHandlers } from './review-tool-registry';

export type CodeReviewToolPort = {
  createReviewToolContext(agentId: string, handlers: ReviewToolHandlers): { id: string; url: string };
  closeReviewToolContext(contextId: string): void;
};

export type CodeReviewServiceOptions = {
  snapshot: AppSnapshot;
  tools: CodeReviewToolPort;
  runReview(agent: Agent, prompt: string, reviewMcpServerUrl: string): Promise<{ text: string }>;
  sendFixPrompt(agentId: string, prompt: string): void;
  changed(): Promise<void> | void;
  now?: () => Date;
};

export class CodeReviewService {
  private readonly now: () => Date;

  constructor(private readonly options: CodeReviewServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  start(agent: Agent): CodeReviewSession {
    if (!agent.folder) throw new Error('Code review requires an agent workspace.');
    const current = agent.codeReview;
    if (current && current.status !== 'finished' && current.status !== 'failed') {
      throw new Error('This agent already has an active code review.');
    }
    const session = this.newSession(agent);
    agent.codeReview = session;
    void this.options.changed();
    void this.executeRound(agent, session, activeCodeReviewRound(session));
    return session;
  }

  decide(agent: Agent, input: CodeReviewDecisionInput): void {
    const { session, finding } = this.findFinding(agent, input);
    this.requireArbitration(session);
    const decidedAt = this.timestamp();
    finding.disposition = input.decision === 'accept'
      ? { state: 'accepted', decidedAt }
      : { state: 'declined', decidedAt, reason: requiredText(input.reason, 'A decline reason is required.') };
    finding.updatedAt = decidedAt;
    session.updatedAt = decidedAt;
  }

  assign(agent: Agent, input: CodeReviewAssignmentInput): void {
    const { session, finding } = this.findFinding(agent, input);
    this.requireArbitration(session);
    if (finding.disposition.state !== 'accepted') throw new Error('Only accepted findings can be assigned.');
    if (!this.options.snapshot.agents.some((candidate) => candidate.id === input.assignedAgentId)) {
      throw new Error('Assigned agent was not found.');
    }
    finding.assignedAgentId = input.assignedAgentId;
    finding.updatedAt = this.timestamp();
    session.updatedAt = finding.updatedAt;
  }

  discuss(agent: Agent, input: CodeReviewDiscussionInput): void {
    const { session, round, finding } = this.findFinding(agent, input);
    this.requireArbitration(session);
    const question = requiredText(input.question, 'A finding question is required.');
    const createdAt = this.timestamp();
    finding.discussion.push({ id: randomUUID(), author: 'user', body: question, createdAt });
    finding.updatedAt = createdAt;
    session.updatedAt = createdAt;
    void this.options.changed();
    void this.executeDiscussion(agent, session, round, finding, question);
  }

  submit(agent: Agent, sessionId: string): void {
    const session = this.findSession(agent, sessionId);
    this.requireArbitration(session);
    const round = activeCodeReviewRound(session);
    if (round.findings.some((finding) => finding.disposition.state === 'unresolved')) {
      throw new Error('Resolve every finding before submitting the review round.');
    }
    const accepted = round.findings.filter((finding) => finding.disposition.state === 'accepted');
    const unassigned = accepted.find((finding) => !finding.assignedAgentId);
    if (unassigned) throw new Error(`Assign accepted finding “${unassigned.summary}” before submitting.`);
    const submittedAt = this.timestamp();
    round.status = 'submitted';
    session.status = accepted.length > 0 ? 'fixing' : 'readyToFinish';
    session.updatedAt = submittedAt;
    for (const finding of accepted) {
      const assignedAgentId = finding.assignedAgentId!;
      finding.verification = { state: 'queued', assignedAgentId, requestedAt: submittedAt };
      finding.updatedAt = submittedAt;
    }
    for (const [assignedAgentId, findings] of groupByAssignee(accepted)) {
      this.options.sendFixPrompt(assignedAgentId, fixPrompt(session, round, findings));
    }
  }

  finish(agent: Agent, sessionId: string): void {
    const session = this.findSession(agent, sessionId);
    if (session.status !== 'readyToFinish') throw new Error('The review is not ready to finish.');
    const finishedAt = this.timestamp();
    session.status = 'finished';
    session.finishedAt = finishedAt;
    session.updatedAt = finishedAt;
    delete agent.codeReview;
  }

  reviewAgain(agent: Agent, sessionId: string): CodeReviewRound {
    const session = this.findSession(agent, sessionId);
    if (session.status !== 'readyToFinish') throw new Error('Complete the current fix round before reviewing again.');
    const round = this.newRound(session.rounds.length + 1);
    session.rounds.push(round);
    session.activeRoundId = round.id;
    session.status = 'reviewing';
    session.updatedAt = round.startedAt;
    void this.options.changed();
    void this.executeRound(agent, session, round);
    return round;
  }

  handleAgentStatusChanged(agentId: string, status: AgentStatus): void {
    let changed = false;
    const now = this.timestamp();
    for (const owner of this.options.snapshot.agents) {
      for (const session of owner.codeReview ? [owner.codeReview] : []) {
        if (session.status !== 'fixing') continue;
        let sessionChanged = false;
        const accepted = session.rounds.flatMap((round) => round.findings)
          .filter((finding) => finding.disposition.state === 'accepted' && finding.assignedAgentId === agentId);
        for (const finding of accepted) {
          if (status.type === 'working' && finding.verification.state === 'queued') {
            finding.verification = { state: 'fixing', assignedAgentId: agentId, startedAt: now };
            finding.updatedAt = now;
            changed = true;
            sessionChanged = true;
          } else if (status.type === 'idle' && finding.verification.state === 'fixing') {
            finding.verification = { state: 'awaitingVerification', assignedAgentId: agentId, completedAt: now };
            finding.updatedAt = now;
            changed = true;
            sessionChanged = true;
          }
        }
        if (sessionChanged && this.fixesComplete(session)) {
          activeCodeReviewRound(session).status = 'completed';
          session.status = 'readyToFinish';
          session.updatedAt = now;
        }
      }
    }
    if (changed) void this.options.changed();
  }

  private async executeRound(agent: Agent, session: CodeReviewSession, round: CodeReviewRound): Promise<void> {
    const context = this.options.tools.createReviewToolContext(agent.id, this.reviewToolHandlers(session, round));
    try {
      await this.options.runReview(agent, reviewPrompt(session), context.url);
      const completedAt = this.timestamp();
      round.status = 'ready';
      round.completedAt = completedAt;
      session.status = 'ready';
      session.updatedAt = completedAt;
    } catch (error) {
      round.status = 'failed';
      round.error = error instanceof Error ? error.message : String(error);
      round.completedAt = this.timestamp();
      session.status = 'failed';
      session.updatedAt = round.completedAt;
    } finally {
      this.options.tools.closeReviewToolContext(context.id);
    }
    await this.options.changed();
  }

  private async executeDiscussion(
    agent: Agent,
    session: CodeReviewSession,
    round: CodeReviewRound,
    finding: CodeReviewFinding,
    question: string,
  ): Promise<void> {
    const context = this.options.tools.createReviewToolContext(agent.id, this.reviewToolHandlers(session, round));
    try {
      const result = await this.options.runReview(agent, discussionPrompt(session, round, finding, question), context.url);
      const body = result.text.trim();
      if (!body) throw new Error('Reviewer did not answer the finding discussion.');
      const createdAt = this.timestamp();
      finding.discussion.push({ id: randomUUID(), author: 'reviewer', body, createdAt });
      finding.updatedAt = createdAt;
      session.updatedAt = createdAt;
    } catch {
      // A failed discussion turn leaves the user's question in the durable ledger.
    } finally {
      this.options.tools.closeReviewToolContext(context.id);
    }
    await this.options.changed();
  }

  private reviewToolHandlers(session: CodeReviewSession, round: CodeReviewRound): ReviewToolHandlers {
    return {
      reportFinding: (input) => this.reportFinding(session, round, input),
      updateFinding: (input) => this.updateFinding(session, input),
      markFindingComplete: (input) => this.markFindingComplete(session, round, input),
    };
  }

  private async reportFinding(
    session: CodeReviewSession,
    round: CodeReviewRound,
    input: CodeReviewFindingInput,
  ): Promise<CodeReviewFinding> {
    const now = this.timestamp();
    const ledger = codeReviewLedger(session);
    const excluded = ledger.exclusions.find((finding) => finding.fingerprint === input.fingerprint);
    if (excluded && !input.materiallyNewEvidence) {
      throw new Error(`Finding ${excluded.findingId} was declined and requires materially new evidence to be raised again.`);
    }
    const prior = input.priorFindingId
      ? this.findFindingInSession(session, input.priorFindingId)
      : undefined;
    const finding: CodeReviewFinding = {
      id: prior?.id ?? randomUUID(),
      roundId: round.id,
      fingerprint: input.fingerprint,
      priority: input.priority,
      summary: input.summary,
      rationale: input.rationale,
      suggestedResolution: input.suggestedResolution,
      ...(input.location ? { location: { ...input.location } } : {}),
      disposition: prior?.disposition.state === 'accepted' ? { ...prior.disposition } : { state: 'unresolved' },
      ...(prior?.assignedAgentId ? { assignedAgentId: prior.assignedAgentId } : {}),
      discussion: prior?.discussion.map((message) => ({ ...message })) ?? [],
      verification: prior?.disposition.state === 'accepted'
        ? { state: 'failed', verifiedAt: now, roundId: round.id, evidence: input.rationale }
        : { state: 'notRequested' },
      ...(input.materiallyNewEvidence ? { materiallyNewEvidence: input.materiallyNewEvidence } : {}),
      createdAt: prior?.createdAt ?? now,
      updatedAt: now,
    };
    const existingIndex = round.findings.findIndex((candidate) => candidate.id === finding.id);
    if (existingIndex >= 0) round.findings.splice(existingIndex, 1, finding);
    else round.findings.push(finding);
    session.updatedAt = now;
    await this.options.changed();
    return structuredClone(finding);
  }

  private async updateFinding(session: CodeReviewSession, input: CodeReviewFindingUpdateInput): Promise<CodeReviewFinding> {
    const finding = this.findFindingInSession(session, input.findingId);
    if (!finding) throw new Error('Code review finding was not found.');
    if (input.priority) finding.priority = input.priority;
    if (input.summary) finding.summary = input.summary;
    if (input.rationale) finding.rationale = input.rationale;
    if (input.suggestedResolution) finding.suggestedResolution = input.suggestedResolution;
    if (input.location) finding.location = { ...input.location };
    if (input.materiallyNewEvidence) finding.materiallyNewEvidence = input.materiallyNewEvidence;
    finding.updatedAt = this.timestamp();
    session.updatedAt = finding.updatedAt;
    await this.options.changed();
    return structuredClone(finding);
  }

  private async markFindingComplete(
    session: CodeReviewSession,
    round: CodeReviewRound,
    input: ReviewFindingCompletionInput,
  ): Promise<CodeReviewFinding> {
    const finding = this.findFindingInSession(session, input.findingId);
    if (!finding) throw new Error('Code review finding was not found.');
    if (finding.disposition.state !== 'accepted') throw new Error('Only an accepted finding can be marked complete.');
    const verifiedAt = this.timestamp();
    finding.verification = { state: 'passed', verifiedAt, roundId: round.id, ...(input.evidence ? { evidence: input.evidence } : {}) };
    finding.updatedAt = verifiedAt;
    session.updatedAt = verifiedAt;
    await this.options.changed();
    return structuredClone(finding);
  }

  private findFindingInSession(session: CodeReviewSession, findingId: string): CodeReviewFinding | undefined {
    for (let index = session.rounds.length - 1; index >= 0; index -= 1) {
      const finding = session.rounds[index]?.findings.find((candidate) => candidate.id === findingId);
      if (finding) return finding;
    }
    return undefined;
  }

  private fixesComplete(session: CodeReviewSession): boolean {
    const accepted = session.rounds.flatMap((round) => round.findings)
      .filter((finding) => finding.disposition.state === 'accepted');
    return accepted.every((finding) => finding.verification.state === 'awaitingVerification'
      || finding.verification.state === 'passed');
  }

  private newSession(agent: Agent): CodeReviewSession {
    const createdAt = this.timestamp();
    const round = this.newRound(1, createdAt);
    return {
      id: randomUUID(),
      agentId: agent.id,
      status: 'reviewing',
      activeRoundId: round.id,
      rounds: [round],
      createdAt,
      updatedAt: createdAt,
    };
  }

  private newRound(number: number, startedAt = this.timestamp()): CodeReviewRound {
    return {
      id: randomUUID(),
      number,
      status: 'reviewing',
      reviewerContextId: randomUUID(),
      findings: [],
      startedAt,
    };
  }

  private findSession(agent: Agent, sessionId: string): CodeReviewSession {
    const session = agent.codeReview?.id === sessionId ? agent.codeReview : undefined;
    if (!session) throw new Error('Code review session was not found.');
    return session;
  }

  private findFinding(agent: Agent, input: { sessionId: string; roundId: string; findingId: string }) {
    const session = this.findSession(agent, input.sessionId);
    const round = session.rounds.find((candidate) => candidate.id === input.roundId);
    if (!round) throw new Error('Code review round was not found.');
    const finding = round.findings.find((candidate) => candidate.id === input.findingId);
    if (!finding) throw new Error('Code review finding was not found.');
    return { session, round, finding };
  }

  private requireArbitration(session: CodeReviewSession): void {
    if (session.status !== 'ready') throw new Error('The review round is not ready for arbitration.');
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

function reviewPrompt(session: CodeReviewSession): string {
  const ledger = codeReviewLedger(session);
  return `Review the current branch and working-tree diff independently. Use the ordinary repository tools already supplied by the harness to inspect code and tests.

Findings are the only review artifact. For every actionable defect, call report_finding with concrete evidence. Use update_finding to correct or enrich a reported finding. For each regression check that is fixed, call mark_finding_complete. If a regression remains, report it again with its prior finding ID. Do not raise an exclusion again unless materially new evidence changes the conclusion; if it does, include that evidence. Ending your turn ends the review pass; there is no tool for completing the review workflow.

Structured review ledger:
${JSON.stringify(ledger, null, 2)}`;
}

function discussionPrompt(
  session: CodeReviewSession,
  round: CodeReviewRound,
  finding: CodeReviewFinding,
  question: string,
): string {
  return `Answer a question about one existing code review finding. Inspect the current code when useful. Do not create new findings and do not change review workflow state. Answer directly in your normal assistant response.

Session: ${session.id}
Round: ${round.id}
Finding: ${JSON.stringify(finding, null, 2)}
Question: ${question}`;
}

function fixPrompt(session: CodeReviewSession, round: CodeReviewRound, findings: CodeReviewFinding[]): string {
  return `Fix the accepted findings from code review ${session.id}, round ${round.number}. Keep the work focused, add or update behavior-level tests, and report completion normally.

${JSON.stringify(findings.map((finding) => ({
    id: finding.id,
    priority: finding.priority,
    summary: finding.summary,
    rationale: finding.rationale,
    location: finding.location,
    suggestedResolution: finding.suggestedResolution,
    discussion: finding.discussion,
  })), null, 2)}`;
}

function groupByAssignee(findings: CodeReviewFinding[]): Map<string, CodeReviewFinding[]> {
  const grouped = new Map<string, CodeReviewFinding[]>();
  for (const finding of findings) {
    const agentId = finding.assignedAgentId!;
    grouped.set(agentId, [...(grouped.get(agentId) ?? []), finding]);
  }
  return grouped;
}

function requiredText(value: string, message: string): string {
  const text = value.trim();
  if (!text) throw new Error(message);
  return text;
}

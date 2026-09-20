import { randomUUID } from 'node:crypto';
import {
  activeCodeReviewRound,
  codeReviewLedger,
  type CodeReviewDecisionInput,
  type CodeReviewDiscussionInput,
  type CodeReviewFinding,
  type CodeReviewFindingInput,
  type CodeReviewFindingUpdateInput,
  type CodeReviewRound,
  type CodeReviewSession,
} from '@codex-claw/core/code-review';
import type { BackendCodeReviewResult } from '@codex-claw/core/backend-driver';
import type { Agent, AppSnapshot, BackendSession } from '@codex-claw/core/contracts';
import type { ReviewFindingCompletionInput, ReviewToolHandlers } from './review-tool-registry';

export type CodeReviewToolPort = {
  createReviewToolContext(agentId: string, handlers: ReviewToolHandlers): { id: string; url: string };
  closeReviewToolContext(contextId: string): void;
};

export type CodeReviewServiceOptions = {
  snapshot: AppSnapshot;
  tools: CodeReviewToolPort;
  runReview(
    agent: Agent,
    prompt: string,
    reviewMcpServerUrl: string,
    reviewerSession?: BackendSession,
  ): Promise<BackendCodeReviewResult>;
  changed(): Promise<void> | void;
  now?: () => Date;
};

export class CodeReviewService {
  private readonly now: () => Date;
  private readonly activeRoundTurns = new Set<string>();

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
    finding.decision = input.decision === 'select'
      ? { state: 'selected', decidedAt }
      : { state: 'rejected', decidedAt, reason: requiredText(input.reason, 'A rejection reason is required.') };
    finding.updatedAt = decidedAt;
    session.updatedAt = decidedAt;
  }

  discuss(agent: Agent, input: CodeReviewDiscussionInput): void {
    const { session, round, finding } = this.findFinding(agent, input);
    this.requireArbitration(session);
    this.requireIdleRound(round);
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
    this.requireIdleRound(round);
    if (round.findings.some((finding) => finding.decision.state === 'undecided')) {
      throw new Error('Select or reject every finding before starting remediation.');
    }
    const submittedAt = this.timestamp();
    round.status = 'submitted';
    session.status = round.findings.some((finding) => finding.decision.state === 'selected')
      ? 'fixing'
      : 'readyToFinish';
    session.updatedAt = submittedAt;
    for (const finding of round.findings) {
      finding.remediation = finding.decision.state === 'selected'
        ? { state: 'pending', queuedAt: submittedAt }
        : { state: 'skipped', startedAt: submittedAt };
      finding.updatedAt = submittedAt;
    }
    if (session.status === 'readyToFinish') round.status = 'completed';
    void this.options.changed();
    if (session.status === 'fixing') void this.executeFixes(agent, session, round);
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
    if (session.status !== 'readyToFinish') throw new Error('Complete the current remediation before reviewing again.');
    const round = this.newRound(session.rounds.length + 1);
    session.rounds.push(round);
    session.activeRoundId = round.id;
    session.status = 'reviewing';
    session.updatedAt = round.startedAt;
    void this.options.changed();
    void this.executeRound(agent, session, round);
    return round;
  }

  resumeInterrupted(agent: Agent): void {
    const session = agent.codeReview;
    if (!session) return;
    const round = activeCodeReviewRound(session);
    if (session.status === 'reviewing') {
      round.findings = [];
      delete round.reviewerSession;
      delete round.completedAt;
      delete round.error;
      void this.options.changed();
      void this.executeRound(agent, session, round);
      return;
    }
    if (session.status !== 'fixing') return;
    const resumedAt = this.timestamp();
    for (const finding of round.findings) {
      if (finding.remediation.state !== 'fixing') continue;
      finding.remediation = { state: 'pending', queuedAt: resumedAt };
      finding.updatedAt = resumedAt;
    }
    round.status = 'submitted';
    delete round.error;
    session.updatedAt = resumedAt;
    void this.options.changed();
    void this.executeFixes(agent, session, round);
  }

  private async executeRound(agent: Agent, session: CodeReviewSession, round: CodeReviewRound): Promise<void> {
    this.activeRoundTurns.add(round.id);
    const context = this.options.tools.createReviewToolContext(agent.id, this.reviewToolHandlers(session, round));
    try {
      const result = await this.options.runReview(agent, reviewPrompt(session), context.url);
      round.reviewerSession = result.reviewerSession;
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
      this.activeRoundTurns.delete(round.id);
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
    this.activeRoundTurns.add(round.id);
    const context = this.options.tools.createReviewToolContext(agent.id, this.reviewToolHandlers(session, round));
    try {
      const result = await this.options.runReview(
        agent,
        discussionPrompt(session, round, finding, question),
        context.url,
        requiredReviewerSession(round),
      );
      round.reviewerSession = result.reviewerSession;
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
      this.activeRoundTurns.delete(round.id);
    }
    await this.options.changed();
  }

  private async executeFixes(agent: Agent, session: CodeReviewSession, round: CodeReviewRound): Promise<void> {
    this.activeRoundTurns.add(round.id);
    try {
      for (;;) {
        const finding = round.findings.find((candidate) => candidate.remediation.state === 'pending');
        if (!finding) break;
        const startedAt = this.timestamp();
        finding.remediation = { state: 'fixing', startedAt };
        finding.updatedAt = startedAt;
        session.updatedAt = startedAt;
        await this.options.changed();

        const context = this.options.tools.createReviewToolContext(agent.id, this.reviewToolHandlers(session, round));
        try {
          const result = await this.options.runReview(
            agent,
            fixPrompt(session, round, finding),
            context.url,
            requiredReviewerSession(round),
          );
          round.reviewerSession = result.reviewerSession;
        } finally {
          this.options.tools.closeReviewToolContext(context.id);
        }
        const completedFinding = this.findFindingInSession(session, finding.id);
        if (completedFinding?.remediation.state !== 'fixed') {
          throw new Error(`Reviewer did not mark “${finding.summary}” fixed.`);
        }
      }
      const completedAt = this.timestamp();
      round.status = 'completed';
      round.completedAt = completedAt;
      session.status = 'readyToFinish';
      session.updatedAt = completedAt;
    } catch (error) {
      round.status = 'failed';
      round.error = error instanceof Error ? error.message : String(error);
      session.status = 'failed';
      session.updatedAt = this.timestamp();
    } finally {
      this.activeRoundTurns.delete(round.id);
    }
    await this.options.changed();
  }

  private reviewToolHandlers(session: CodeReviewSession, round: CodeReviewRound): ReviewToolHandlers {
    return {
      reportFinding: (input) => this.reportFinding(session, round, input),
      updateFinding: (input) => this.updateFinding(session, input),
      markFindingComplete: (input) => this.markFindingComplete(session, input),
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
      throw new Error(`Finding ${excluded.findingId} was rejected and requires materially new evidence to be raised again.`);
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
      decision: { state: 'undecided' },
      discussion: prior?.discussion.map((message) => ({ ...message })) ?? [],
      remediation: { state: 'notStarted' },
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
    input: ReviewFindingCompletionInput,
  ): Promise<CodeReviewFinding> {
    const finding = this.findFindingInSession(session, input.findingId);
    if (!finding) throw new Error('Code review finding was not found.');
    if (finding.remediation.state !== 'fixing') throw new Error('Only the finding currently being fixed can be marked complete.');
    const completedAt = this.timestamp();
    finding.remediation = { state: 'fixed', completedAt, ...(input.evidence ? { evidence: input.evidence } : {}) };
    finding.updatedAt = completedAt;
    session.updatedAt = completedAt;
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
    if (session.status !== 'ready') throw new Error('The review round is not ready for decisions.');
  }

  private requireIdleRound(round: CodeReviewRound): void {
    if (this.activeRoundTurns.has(round.id)) throw new Error('The reviewer is already responding in this round.');
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

function reviewPrompt(session: CodeReviewSession): string {
  const ledger = codeReviewLedger(session);
  return `Review the current branch and working-tree diff independently. Use the ordinary repository tools already supplied by the harness to inspect code and tests.

Findings are the only review artifact. For every actionable defect, call report_finding with concrete evidence. Use update_finding to correct or enrich a reported finding. Do not raise an exclusion again unless materially new evidence changes the conclusion; if it does, include that evidence. Check prior fixed findings for regressions; only report one again when it is currently actionable, using its prior finding ID. Ending your turn ends this review pass; there is no tool for completing the review workflow.

Structured review ledger:
${JSON.stringify(ledger, null, 2)}`;
}

function discussionPrompt(
  session: CodeReviewSession,
  round: CodeReviewRound,
  finding: CodeReviewFinding,
  question: string,
): string {
  return `Continue this review conversation by answering the user's clarification about one existing finding. Inspect the current code when useful. Do not create findings or change workflow state. Answer directly in your normal assistant response.

Session: ${session.id}
Round: ${round.id}
Finding ID: ${finding.id}
User prompt:
${question}`;
}

function fixPrompt(session: CodeReviewSession, round: CodeReviewRound, finding: CodeReviewFinding): string {
  return `Continue this same review conversation by fixing the one selected finding below. Keep the change focused and add or update behavior-level tests when appropriate. After the code and checks are complete, call mark_finding_complete for this finding. Do not start another finding; Claw will send it separately.

Review: ${session.id}
Round: ${round.number}
Finding:
${JSON.stringify({
    id: finding.id,
    priority: finding.priority,
    summary: finding.summary,
    rationale: finding.rationale,
    location: finding.location,
    suggestedResolution: finding.suggestedResolution,
    discussion: finding.discussion,
  }, null, 2)}`;
}

function requiredReviewerSession(round: CodeReviewRound): BackendSession {
  if (!round.reviewerSession) throw new Error('Review conversation is not available.');
  return round.reviewerSession;
}

function requiredText(value: string, message: string): string {
  const text = value.trim();
  if (!text) throw new Error(message);
  return text;
}

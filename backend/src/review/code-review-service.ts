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
  type CodeReviewStartInput,
} from '@codex-claw/core/code-review';
import type { BackendCodeReviewResult } from '@codex-claw/core/backend-driver';
import type { Agent, AppSnapshot, BackendSession, CreateAgentInput } from '@codex-claw/core/contracts';
import type { AgentCreationOptions } from '../agents/agent-creation-service';
import type { ReviewToolHandlers } from './review-tool-registry';

export type CodeReviewToolPort = {
  createReviewToolContext(agentId: string, handlers: ReviewToolHandlers): { id: string; url: string };
  closeReviewToolContext(contextId: string): void;
};

export type CodeReviewServiceOptions = {
  snapshot: AppSnapshot;
  createAgent(input: CreateAgentInput, options?: AgentCreationOptions): Agent;
  tools: CodeReviewToolPort;
  runReview(
    agent: Agent,
    prompt: string,
    reviewMcpServerUrl: string,
    reviewerSession?: BackendSession,
  ): Promise<BackendCodeReviewResult>;
  resetReviewer(agent: Agent): Promise<void>;
  deleteReviewer(agent: Agent, handoff?: { targetAgentId: string; content: string }): Promise<void>;
  changed(): Promise<void> | void;
  now?: () => Date;
};

export class CodeReviewService {
  private readonly now: () => Date;
  private readonly activeRoundTurns = new Set<string>();
  private readonly reviewContexts = new WeakMap<CodeReviewSession, { id: string; url: string }>();

  constructor(private readonly options: CodeReviewServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  start(agent: Agent, input: CodeReviewStartInput): CodeReviewSession {
    if (!agent.folder) throw new Error('Code review requires an agent workspace.');
    if (input.threadMode === 'current' && !agent.backendSession) {
      throw new Error('The current thread is not available for review.');
    }
    if (input.scope.type === 'branch' && !input.scope.baseRef.trim()) {
      throw new Error('A branch review requires a base reference.');
    }
    const current = agent.codeReview;
    if (
      current?.status === 'failed'
      && current.threadMode === 'independent'
      && current.reviewerAgentId === agent.id
      && input.threadMode === 'independent'
    ) {
      const target = this.options.snapshot.agents.find((candidate) => candidate.id === current.targetAgentId);
      if (!target) throw new Error('The review target is no longer available.');
      return this.restartFailedIndependentReview(target, agent, input);
    }
    if (current && current.status !== 'finished' && current.status !== 'failed') {
      throw new Error('This agent already has an active code review.');
    }
    const existing = this.options.snapshot.agents.find((candidate) => (
      candidate.codeReview?.targetAgentId === agent.id
      && candidate.codeReview.status !== 'finished'
      && candidate.codeReview.status !== 'failed'
    ));
    if (existing) throw new Error('This agent already has an active code review.');

    const reviewer = input.threadMode === 'current'
      ? agent
      : this.createIndependentReviewer(agent);
    if (current?.status === 'failed') this.closeReviewToolContext(current);
    const session = this.newSession(agent, reviewer, input);
    const firstRound = activeCodeReviewRound(session);
    if (input.threadMode === 'current') firstRound.reviewerSession = agent.backendSession;
    reviewer.codeReview = session;
    void this.options.changed();
    void this.executeRound(
      reviewer,
      session,
      firstRound,
      firstRound.reviewerSession,
    );
    return session;
  }

  private restartFailedIndependentReview(
    target: Agent,
    reviewer: Agent,
    input: CodeReviewStartInput,
  ): CodeReviewSession {
    if (reviewer.codeReview) this.closeReviewToolContext(reviewer.codeReview);
    const session = this.newSession(target, reviewer, input);
    reviewer.codeReview = session;
    void this.options.changed();
    void this.resetAndExecuteRound(reviewer, session, activeCodeReviewRound(session));
    return session;
  }

  private async resetAndExecuteRound(
    reviewer: Agent,
    session: CodeReviewSession,
    round: CodeReviewRound,
  ): Promise<void> {
    try {
      await this.options.resetReviewer(reviewer);
    } catch (error) {
      round.status = 'failed';
      round.error = error instanceof Error ? error.message : String(error);
      round.completedAt = this.timestamp();
      session.status = 'failed';
      session.updatedAt = round.completedAt;
      await this.options.changed();
      return;
    }
    if (reviewer.codeReview !== session) return;
    await this.executeRound(reviewer, session, round, undefined);
  }

  decide(agent: Agent, input: CodeReviewDecisionInput): void {
    const { session, finding } = this.findFinding(agent, input);
    this.requireArbitration(session);
    const decidedAt = this.timestamp();
    finding.decision = input.decision === 'select'
      ? { state: 'selected', decidedAt }
      : {
          state: 'rejected',
          decidedAt,
          ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        };
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
    const submittedAt = this.timestamp();
    for (const finding of round.findings) {
      if (finding.decision.state === 'undecided') {
        finding.decision = { state: 'selected', decidedAt: submittedAt };
        finding.updatedAt = submittedAt;
      }
    }
    round.status = 'submitted';
    session.status = round.findings.some((finding) => (
      finding.decision.state === 'selected' && finding.remediation.state !== 'fixed'
    ))
      ? 'fixing'
      : 'readyToFinish';
    session.updatedAt = submittedAt;
    for (const finding of round.findings) {
      if (finding.remediation.state !== 'fixed') {
        finding.remediation = finding.decision.state === 'selected'
          ? { state: 'pending', queuedAt: submittedAt }
          : { state: 'skipped', startedAt: submittedAt };
      }
      finding.updatedAt = submittedAt;
    }
    if (session.status === 'readyToFinish') round.status = 'completed';
    void this.options.changed();
    if (session.status === 'fixing') void this.executeFixes(agent, session, round);
  }

  async finish(agent: Agent, sessionId: string): Promise<void> {
    const session = this.findSession(agent, sessionId);
    if (session.status !== 'readyToFinish') throw new Error('The review is not ready to finish.');
    if (session.threadMode === 'independent') {
      const target = this.options.snapshot.agents.find((candidate) => candidate.id === session.targetAgentId);
      await this.options.deleteReviewer(agent, target
        ? { targetAgentId: target.id, content: independentReviewHandoff(session) }
        : undefined);
      this.closeReviewToolContext(session);
      return;
    }
    const finishedAt = this.timestamp();
    session.status = 'finished';
    session.finishedAt = finishedAt;
    session.updatedAt = finishedAt;
    this.closeReviewToolContext(session);
    delete agent.codeReview;
  }

  async discard(agent: Agent, sessionId: string): Promise<void> {
    const session = this.findSession(agent, sessionId);
    if (session.threadMode === 'independent') {
      await this.options.deleteReviewer(agent);
      this.closeReviewToolContext(session);
      return;
    }
    this.closeReviewToolContext(session);
    delete agent.codeReview;
    await this.options.changed();
  }

  closeForAgentRemoval(agent: Agent): void {
    if (agent.codeReview) this.closeReviewToolContext(agent.codeReview);
  }

  async reviewAgain(agent: Agent, sessionId: string): Promise<CodeReviewRound> {
    const session = this.findSession(agent, sessionId);
    if (session.status !== 'readyToFinish') throw new Error('Complete the current remediation before reviewing again.');
    const previousRound = activeCodeReviewRound(session);
    if (session.threadMode === 'independent') {
      await this.options.resetReviewer(agent);
      delete previousRound.reviewerSession;
    }
    const round = this.newRound(session.rounds.length + 1);
    if (session.threadMode === 'current') round.reviewerSession = requiredReviewerSession(previousRound);
    session.rounds.push(round);
    session.activeRoundId = round.id;
    session.status = 'reviewing';
    session.updatedAt = round.startedAt;
    void this.options.changed();
    void this.executeRound(agent, session, round, round.reviewerSession);
    return round;
  }

  async resumeInterrupted(agent: Agent): Promise<void> {
    const session = agent.codeReview;
    if (!session) return;
    const round = activeCodeReviewRound(session);
    if (session.status === 'reviewing') {
      round.findings = [];
      if (session.threadMode === 'independent' && round.reviewerSession) {
        await this.options.resetReviewer(agent);
        delete round.reviewerSession;
      }
      delete round.completedAt;
      delete round.error;
      void this.options.changed();
      void this.executeRound(agent, session, round, round.reviewerSession);
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

  async handleTurnInterrupted(agent: Agent): Promise<boolean> {
    const session = agent.codeReview;
    if (!session) return false;
    const round = activeCodeReviewRound(session);
    const interruptedRemediation = session.status === 'fixing'
      || (
        session.status === 'failed'
        && round.status === 'failed'
        && round.findings.some((finding) => finding.remediation.state === 'fixing')
      );
    if (!interruptedRemediation) return false;

    const interruptedAt = this.timestamp();
    for (const finding of round.findings) {
      if (finding.remediation.state !== 'pending' && finding.remediation.state !== 'fixing') continue;
      finding.remediation = { state: 'notStarted' };
      finding.updatedAt = interruptedAt;
    }
    round.status = 'ready';
    delete round.completedAt;
    delete round.error;
    session.status = 'ready';
    session.updatedAt = interruptedAt;
    await this.options.changed();
    return true;
  }

  private async executeRound(
    agent: Agent,
    session: CodeReviewSession,
    round: CodeReviewRound,
    initialReviewerSession?: BackendSession,
  ): Promise<void> {
    this.activeRoundTurns.add(round.id);
    const context = this.reviewToolContext(agent, session);
    try {
      const result = await this.options.runReview(agent, reviewPrompt(session), context.url, initialReviewerSession);
      if (agent.codeReview !== session) {
        return;
      }
      agent.backendSession = result.reviewerSession;
      round.reviewerSession = result.reviewerSession;
      const completedAt = this.timestamp();
      round.status = 'ready';
      round.completedAt = completedAt;
      session.status = 'ready';
      session.updatedAt = completedAt;
    } catch (error) {
      if (agent.codeReview !== session) return;
      round.status = 'failed';
      round.error = error instanceof Error ? error.message : String(error);
      round.completedAt = this.timestamp();
      session.status = 'failed';
      session.updatedAt = round.completedAt;
    } finally {
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
    const context = this.reviewToolContext(agent, session);
    try {
      const result = await this.options.runReview(
        agent,
        discussionPrompt(session, round, finding, question),
        context.url,
        requiredReviewerSession(round),
      );
      agent.backendSession = result.reviewerSession;
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
      this.activeRoundTurns.delete(round.id);
    }
    await this.options.changed();
  }

  private async executeFixes(agent: Agent, session: CodeReviewSession, round: CodeReviewRound): Promise<void> {
    this.activeRoundTurns.add(round.id);
    try {
      if (agent.codeReview !== session) return;
      const findings = round.findings.filter((candidate) => candidate.remediation.state === 'pending');
      if (findings.length > 0) {
        const startedAt = this.timestamp();
        for (const finding of findings) {
          finding.remediation = { state: 'fixing', startedAt };
          finding.updatedAt = startedAt;
        }
        session.updatedAt = startedAt;
        await this.options.changed();

        const context = this.reviewToolContext(agent, session);
        const result = await this.options.runReview(
          agent,
          fixPrompt(session, round, findings),
          context.url,
          requiredReviewerSession(round),
        );
        if (agent.codeReview !== session || session.status !== 'fixing') return;
        agent.backendSession = result.reviewerSession;
        round.reviewerSession = result.reviewerSession;
        const incomplete = findings.filter((finding) => (
          this.findFindingInSession(session, finding.id)?.remediation.state !== 'fixed'
        ));
        if (incomplete.length > 0) {
          throw new Error(`Reviewer did not update ${incomplete.length} finding(s) to fixed: ${incomplete.map((finding) => finding.title).join(', ')}.`);
        }
      }
      const completedAt = this.timestamp();
      round.status = 'completed';
      round.completedAt = completedAt;
      session.status = 'readyToFinish';
      session.updatedAt = completedAt;
    } catch (error) {
      if (session.status !== 'fixing') return;
      round.status = 'failed';
      round.error = error instanceof Error ? error.message : String(error);
      session.status = 'failed';
      session.updatedAt = this.timestamp();
    } finally {
      this.activeRoundTurns.delete(round.id);
    }
    await this.options.changed();
  }

  private reviewToolContext(agent: Agent, session: CodeReviewSession): { id: string; url: string } {
    const existing = this.reviewContexts.get(session);
    if (existing) return existing;
    const context = this.options.tools.createReviewToolContext(agent.id, this.reviewToolHandlers(session));
    this.reviewContexts.set(session, context);
    return context;
  }

  private closeReviewToolContext(session: CodeReviewSession): void {
    const context = this.reviewContexts.get(session);
    if (!context) return;
    this.options.tools.closeReviewToolContext(context.id);
    this.reviewContexts.delete(session);
  }

  private reviewToolHandlers(session: CodeReviewSession): ReviewToolHandlers {
    return {
      reportFinding: (input) => this.reportFinding(session, activeCodeReviewRound(session), input),
      updateFinding: (input) => this.updateFinding(session, input),
    };
  }

  private async reportFinding(
    session: CodeReviewSession,
    round: CodeReviewRound,
    input: CodeReviewFindingInput,
  ): Promise<CodeReviewFinding> {
    if (
      session.status !== 'reviewing'
      || round.status !== 'reviewing'
      || !this.activeRoundTurns.has(round.id)
    ) {
      throw new Error('Findings can only be reported during an active review turn.');
    }
    const now = this.timestamp();
    const prior = input.priorFindingId
      ? this.findFindingInSession(session, input.priorFindingId)
      : undefined;
    const finding: CodeReviewFinding = {
      id: prior?.id ?? randomUUID(),
      roundId: round.id,
      priority: input.priority,
      title: input.title,
      body: input.body,
      ...(input.location ? { location: { ...input.location } } : {}),
      decision: { state: 'selected', decidedAt: now },
      discussion: prior?.discussion.map((message) => ({ ...message })) ?? [],
      remediation: { state: 'notStarted' },
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
    if (input.status === 'fixed' && finding.remediation.state !== 'fixing') {
      throw new Error('Only a finding currently being fixed can be marked fixed.');
    }
    if (input.priority) finding.priority = input.priority;
    if (input.title) finding.title = input.title;
    if (input.body) finding.body = input.body;
    if (input.location) finding.location = { ...input.location };
    const updatedAt = this.timestamp();
    if (input.status === 'fixed') {
      finding.remediation = {
        state: 'fixed',
        completedAt: updatedAt,
        ...(input.evidence ? { evidence: input.evidence } : {}),
      };
    }
    finding.updatedAt = updatedAt;
    session.updatedAt = finding.updatedAt;
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

  private newSession(target: Agent, reviewer: Agent, input: CodeReviewStartInput): CodeReviewSession {
    const createdAt = this.timestamp();
    const round = this.newRound(1, createdAt);
    return {
      id: randomUUID(),
      targetAgentId: target.id,
      reviewerAgentId: reviewer.id,
      scope: input.scope.type === 'branch'
        ? { type: 'branch', baseRef: input.scope.baseRef.trim() }
        : { type: 'uncommitted' },
      threadMode: input.threadMode,
      status: 'reviewing',
      activeRoundId: round.id,
      rounds: [round],
      createdAt,
      updatedAt: createdAt,
    };
  }

  private createIndependentReviewer(target: Agent): Agent {
    const sourceDefaults = target.backendDefaults?.kind === target.backend
      ? target.backendDefaults
      : undefined;
    const reviewer = this.options.createAgent({
      name: 'Review',
      folder: target.folder ?? '',
      avatar: target.avatar,
      backend: target.backend,
      backendDefaults: {
        ...sourceDefaults,
        kind: target.backend,
      },
      teamId: target.teamId,
    }, { select: false, afterAgentId: target.id });
    if (target.workspace) reviewer.workspace = structuredClone(target.workspace);
    if (target.openInApplication) reviewer.openInApplication = target.openInApplication;
    const gitStatus = this.options.snapshot.agentGitStatuses[target.id];
    if (gitStatus) this.options.snapshot.agentGitStatuses[reviewer.id] = structuredClone(gitStatus);
    return reviewer;
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

function independentReviewHandoff(session: CodeReviewSession): string {
  const latestFindings = new Map<string, CodeReviewFinding>();
  for (const round of session.rounds) {
    for (const finding of round.findings) latestFindings.set(finding.id, finding);
  }
  const remediated = [...latestFindings.values()].filter((finding) => finding.remediation.state === 'fixed');
  const summary = remediated.length
    ? ['Independent review completed. Please give the user a concise update with these remediated findings:',
        ...remediated.map((finding) => `- ${finding.priority.toUpperCase()} — ${finding.title.replace(/\s+/g, ' ').trim()}`)]
    : ['Independent review completed. No findings were remediated. Please give the user a concise update.'];
  return [...summary, 'No reply to the reviewer is needed.'].join('\n');
}

function reviewPrompt(session: CodeReviewSession): string {
  const ledger = codeReviewLedger(session);
  const detailedScope = session.scope.type === 'branch'
    ? `the current branch against ${session.scope.baseRef}, including uncommitted changes`
    : 'only the current uncommitted changes (staged, unstaged, and untracked)';
  const visibleScope = session.scope.type === 'branch'
    ? `the current branch against ${session.scope.baseRef}`
    : 'the current uncommitted changes';
  return `<context>
This structured review ledger is cumulative across every previous round in this review session. The exclusions array contains all findings the user skipped, not only findings from the immediately preceding round. Do not raise an excluded finding again unless materially new evidence changes the conclusion. Regression checks must be verified against the latest code. Prior discussion records decisions that changed expected behavior.

${JSON.stringify(ledger, null, 2)}

Review ${detailedScope} independently. Do not report findings outside this scope. Use the ordinary repository tools already supplied by the harness to inspect code and tests.

Structured findings are the source of truth for this review. For every actionable defect, call report_finding with an imperative title of at most 80 characters and one concise Markdown paragraph explaining why it matters. Use update_finding to correct a reported finding. Check prior fixed findings for regressions; only report one again when it is currently actionable, using its prior finding ID. After the inspection and all finding tool calls are complete, end the turn with a natural summary of one or two short sentences. If there are no actionable findings, say so plainly; otherwise state how many findings you reported and invite the user to review them or ask questions. Do not list or repeat the findings in chat, imply that the review is an approval to ship, or use a generic "Review complete" response. There is no tool for completing the review workflow.
</context>

Review ${visibleScope}.`;
}

function fixPrompt(session: CodeReviewSession, round: CodeReviewRound, findings: CodeReviewFinding[]): string {
  const noun = findings.length === 1 ? 'finding' : 'findings';
  const findingContext = findings.map((finding) => [
    `${finding.id}: ${finding.title}`,
    `  priority: ${finding.priority}`,
    `  body: ${finding.body}`,
    ...(finding.location ? [`  location: ${JSON.stringify(finding.location)}`] : []),
    ...(finding.discussion.length > 0 ? [`  discussion: ${JSON.stringify(finding.discussion)}`] : []),
  ].join('\n')).join('\n\n');
  return `Fix the ${findings.length} following ${noun}.

<context>
Review: ${session.id}
Round: ${round.number}

${findingContext}

Keep the changes focused and add or update behavior-level tests when appropriate. Immediately after each individual finding is fixed and verified, call update_finding with its id and status "fixed" before moving to the next finding. Do not wait until all findings are fixed to update their statuses. Include concise verification evidence when useful.
</context>`;
}

function discussionPrompt(
  session: CodeReviewSession,
  round: CodeReviewRound,
  finding: CodeReviewFinding,
  question: string,
): string {
  const findingContext = {
    id: finding.id,
    priority: finding.priority,
    title: finding.title,
    body: finding.body,
    ...(finding.location ? { location: finding.location } : {}),
    ...(finding.discussion.length > 1 ? { priorDiscussion: finding.discussion.slice(0, -1) } : {}),
  };
  return `<context>
Review: ${session.id}
Round: ${round.id}
Finding: ${JSON.stringify(findingContext, null, 2)}

Answer the user's question about this specific finding. If the clarification materially changes the finding, call update_finding before answering.
</context>

${question}`;
}

function requiredReviewerSession(round: CodeReviewRound): BackendSession {
  if (!round.reviewerSession) throw new Error('Review conversation is not available.');
  return round.reviewerSession;
}

function requiredText(value: string | null | undefined, message: string): string {
  const text = value?.trim();
  if (!text) throw new Error(message);
  return text;
}

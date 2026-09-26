import { describe, expect, it, vi } from 'vitest';
import type { Agent, AppSnapshot, BackendSession } from '@codex-claw/core/contracts';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { activeCodeReviewRound, codeReviewLedger } from '@codex-claw/core/code-review';
import { CodeReviewService, type CodeReviewToolPort } from '../code-review-service';
import type { ReviewToolHandlers } from '../review-tool-registry';
import { AgentCreationService } from '../../agents/agent-creation-service';

function agent(id: string): Agent {
  return {
    id, name: id, folder: '/repo', backend: 'codex', status: { type: 'idle' },
    createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z',
  };
}

type ReviewScript = (handlers: ReviewToolHandlers) => Promise<{ text: string }>;

function harness(scripts: ReviewScript[], deleteReviewer = async (_agent: Agent): Promise<void> => undefined) {
  const snapshot: AppSnapshot = createEmptySnapshot();
  const owner = agent('owner');
  snapshot.agents = [owner];
  let context = 0;
  let activeHandlers: ReviewToolHandlers | null = null;
  const turns: Array<{ prompt: string; reviewerSession?: BackendSession }> = [];
  const reset: string[] = [];
  const deleted: string[] = [];
  const handoffs: Array<{ from: string; to: string; content: string }> = [];
  const changed = vi.fn();
  const agentCreation = new AgentCreationService(snapshot);
  const tools: CodeReviewToolPort = {
    createReviewToolContext: (agentId, _sessionId, handlers) => {
      activeHandlers = handlers;
      return { id: `context-${++context}`, url: `http://review.test/mcp?agentId=${agentId}&reviewContextId=${context}` };
    },
    closeReviewToolContext: vi.fn(() => { activeHandlers = null; }),
  };
  let tick = 0;
  const service = new CodeReviewService({
    snapshot,
    createAgent: (input, options) => agentCreation.create(input, options),
    tools,
    now: () => new Date(`2026-09-19T10:${String(tick++).padStart(2, '0')}:00.000Z`),
    runReview: async (_agent, prompt, _url, reviewerSession) => {
      turns.push({ prompt, ...(reviewerSession ? { reviewerSession } : {}) });
      const script = scripts.shift();
      const result = script && activeHandlers ? await script(activeHandlers) : { text: '' };
      return { ...result, reviewerSession: reviewerSession ?? { kind: 'codex', threadId: `review-thread-${turns.length}` } };
    },
    resetReviewer: async (reviewer) => {
      reset.push(reviewer.id);
      delete reviewer.backendSession;
    },
    deleteReviewer: async (reviewer, handoff) => {
      deleted.push(reviewer.id);
      await deleteReviewer(reviewer);
      if (handoff) handoffs.push({ from: reviewer.id, to: handoff.targetAgentId, content: handoff.content });
      snapshot.agents = snapshot.agents.filter((candidate) => candidate.id !== reviewer.id);
    },
    changed,
  });
  return { owner, snapshot, service, turns, reset, deleted, handoffs, changed };
}

function reviewer(test: ReturnType<typeof harness>, session: { reviewerAgentId: string }): Agent {
  const found = test.snapshot.agents.find((candidate) => candidate.id === session.reviewerAgentId);
  if (!found) throw new Error('Reviewer agent missing from test snapshot.');
  return found;
}

describe('CodeReviewService', () => {
  it('uses a selected reviewer backend without copying the source provider settings', () => {
    const test = harness([]);
    test.snapshot.general.claudeCodeEnabled = true;
    test.owner.backendDefaults = { kind: 'codex', model: 'codex-model', reasoningEffort: 'high' };
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent', backend: 'claude',
    });
    expect(reviewer(test, session)).toMatchObject({ backend: 'claude', backendDefaults: { kind: 'claude' } });
    expect(reviewer(test, session).backendDefaults).toStrictEqual({ kind: 'claude' });
  });
  it('creates an independent reviewer as a normal adjacent agent for the same workspace', async () => {
    const test = harness([async () => ({ text: '' })]);
    const neighbor = agent('neighbor');
    test.owner.avatar = 'owl';
    test.owner.openInApplication = 'vscode';
    test.owner.backendDefaults = {
      kind: 'codex', model: 'gpt-5.6-sol', reasoningEffort: 'high',
    };
    test.owner.workspace = {
      kind: 'git', folder: '/repo', repositoryName: 'claw', repositoryRoot: '/repo',
      branch: 'feat/review', isLinkedWorktree: false, primaryWorktreeRoot: '/repo',
      updatedAt: '2026-09-19T10:00:00.000Z',
    };
    test.snapshot.agents.push(neighbor);
    test.snapshot.agentGitStatuses[test.owner.id] = {
      folder: '/repo', branch: 'feat/review', ahead: 1, behind: 0,
      changedFiles: 2, addedLines: 12, removedLines: 3, hasUntracked: false,
      state: 'dirty', updatedAt: '2026-09-19T10:00:00.000Z',
    };

    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    const visibleReviewer = reviewer(test, session);

    expect(test.snapshot.agents.map((candidate) => candidate.id)).toEqual([
      test.owner.id, visibleReviewer.id, neighbor.id,
    ]);
    expect(visibleReviewer).toMatchObject({
      name: 'Review', avatar: 'owl', folder: '/repo', workspace: test.owner.workspace,
      backend: test.owner.backend,
      backendDefaults: { kind: 'codex', model: 'gpt-5.6-sol', reasoningEffort: 'high' },
      openInApplication: 'vscode', status: { type: 'idle' },
    });
    expect(visibleReviewer.backendSession).toBeUndefined();
    expect(test.snapshot.agentGitStatuses[visibleReviewer.id]).toStrictEqual(
      test.snapshot.agentGitStatuses[test.owner.id],
    );
    expect(test.snapshot.agentGitStatuses[visibleReviewer.id]).not.toBe(
      test.snapshot.agentGitStatuses[test.owner.id],
    );
  });

  it('discards an independent review by deleting its visible reviewer agent', async () => {
    const test = harness([async () => ({ text: '' })]);
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);

    await test.service.discard(visibleReviewer, session.id);

    expect(test.snapshot.agents).toStrictEqual([test.owner]);
    expect(test.deleted).toStrictEqual([visibleReviewer.id]);
    expect(test.handoffs).toStrictEqual([]);
  });

  it('retains an independent review ledger when its visible reviewer cannot be deleted', async () => {
    const test = harness([async () => ({ text: '' })], async () => {
      throw new Error('Reviewer agent could not be deleted.');
    });
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    test.service.submit(visibleReviewer, session.id);

    await expect(test.service.finish(visibleReviewer, session.id)).rejects.toThrow('could not be deleted');

    expect(visibleReviewer.codeReview).toBe(session);
    expect(session.status).toBe('readyToFinish');
    expect(test.handoffs).toStrictEqual([]);
  });

  it('notifies the original thread when an independent review finishes without fixes', async () => {
    const test = harness([async () => ({ text: '' })]);
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);

    test.service.submit(visibleReviewer, session.id);
    await test.service.finish(visibleReviewer, session.id);

    expect(test.handoffs).toStrictEqual([{
      from: visibleReviewer.id,
      to: test.owner.id,
      content: 'Independent review completed. No code changes were made.',
    }]);
  });

  it('retries a failed independent review against the original target in the same visible reviewer', async () => {
    const test = harness([
      async () => { throw new Error('Reviewer stopped.'); },
      async () => ({ text: '' }),
    ]);
    const failed = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(failed.status).toBe('failed'));
    const visibleReviewer = reviewer(test, failed);

    const retried = test.service.start(visibleReviewer, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(retried.status).toBe('ready'));

    expect(retried.targetAgentId).toBe(test.owner.id);
    expect(retried.reviewerAgentId).toBe(visibleReviewer.id);
    expect(test.snapshot.agents).toHaveLength(2);
    expect(test.reset).toStrictEqual([visibleReviewer.id]);
    expect(test.turns[1]?.reviewerSession).toBeUndefined();
  });

  it('keeps every round in the current thread and never disposes that user-owned conversation', async () => {
    const test = harness([
      async () => ({ text: '' }),
      async () => ({ text: '' }),
    ]);
    test.owner.backendSession = { kind: 'codex', threadId: 'current-thread' };

    const session = test.service.start(test.owner, {
      scope: { type: 'branch', baseRef: 'origin/main' },
      threadMode: 'current',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    expect(session.scope).toStrictEqual({ type: 'branch', baseRef: 'origin/main' });
    expect(session.threadMode).toBe('current');
    expect(test.turns[0]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    const initialPrompt = test.turns[0]!.prompt;
    const contextEnd = initialPrompt.indexOf('</context>');
    expect(initialPrompt.slice(0, contextEnd)).toContain('the current branch against origin/main');
    expect(initialPrompt.slice(0, contextEnd)).toContain('end the turn with a natural summary of one or two short sentences');
    expect(initialPrompt.slice(contextEnd + '</context>'.length).trim()).toBe(
      'Review the current branch against origin/main.',
    );

    test.service.submit(test.owner, session.id);
    await test.service.reviewAgain(test.owner, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    expect(test.turns[1]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    expect(session.rounds[1]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    test.service.submit(test.owner, session.id);
    await test.service.finish(test.owner, session.id);
    expect(test.reset).toStrictEqual([]);
    expect(test.deleted).toStrictEqual([]);
    expect(test.handoffs).toStrictEqual([]);
  });

  it('removes a reobserved finding from every round and the cumulative ledger', async () => {
    let tools!: ReviewToolHandlers;
    let findingId = '';
    const test = harness([
      async (context) => {
        tools = context;
        findingId = (await context.reportFinding({
          priority: 'p2', title: 'Check the retry path', body: 'The retry may fail.',
        })).id;
        return { text: '' };
      },
      async (context) => {
        await context.reportFinding({
          priority: 'p2', title: 'Check the retry path again', body: 'The latest code still fails.',
          priorFindingId: findingId,
        });
        return { text: '' };
      },
    ]);
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    test.service.decide(visibleReviewer, {
      sessionId: session.id, roundId: activeCodeReviewRound(session).id, findingId,
      decision: 'reject', reason: 'The retry already handles this.',
    });
    test.service.submit(visibleReviewer, session.id);
    await test.service.reviewAgain(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    await tools.deleteFinding({ findingId });

    expect(session.rounds.map((round) => round.findings)).toStrictEqual([[], []]);
    expect(codeReviewLedger(session)).toStrictEqual({ exclusions: [], regressionChecks: [], behaviorDecisions: [] });
  });

  it('carries skipped findings from every prior round inside the reviewer context', async () => {
    let firstSkippedId = '';
    let secondSkippedId = '';
    const test = harness([
      async (tools) => {
        firstSkippedId = (await tools.reportFinding({
          priority: 'p2', title: 'Invalidate the round one cache',
          body: 'The cache could be stale.',
        })).id;
        return { text: '' };
      },
      async (tools) => {
        secondSkippedId = (await tools.reportFinding({
          priority: 'p3', title: 'Reduce round two logging',
          body: 'The log could be noisy.',
        })).id;
        return { text: '' };
      },
      async () => ({ text: '' }),
    ]);

    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    let round = activeCodeReviewRound(session);
    test.service.decide(visibleReviewer, {
      sessionId: session.id, roundId: round.id, findingId: firstSkippedId,
      decision: 'reject', reason: 'The event stream already invalidates this cache.',
    });
    test.service.submit(visibleReviewer, session.id);

    await test.service.reviewAgain(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    round = activeCodeReviewRound(session);
    test.service.decide(visibleReviewer, {
      sessionId: session.id, roundId: round.id, findingId: secondSkippedId,
      decision: 'reject', reason: 'This verbosity is intentional during migration.',
    });
    test.service.submit(visibleReviewer, session.id);

    await test.service.reviewAgain(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    const thirdRoundPrompt = test.turns[2]!.prompt;
    const contextEnd = thirdRoundPrompt.indexOf('</context>');
    expect(thirdRoundPrompt.startsWith('<context>')).toBe(true);
    expect(contextEnd).toBeGreaterThan(0);
    expect(thirdRoundPrompt.slice(0, contextEnd)).toContain('Invalidate the round one cache');
    expect(thirdRoundPrompt.slice(0, contextEnd)).toContain('Reduce round two logging');
    expect(thirdRoundPrompt.slice(contextEnd + '</context>'.length).trim()).toBe(
      'Review the current uncommitted changes.',
    );
  });

  it('uses one reviewer thread for clarification and batched fixes, then starts review again fresh', async () => {
    let selectedId = '';
    let rejectedId = '';
    const test = harness([
      async (tools) => {
        selectedId = (await tools.reportFinding({
          priority: 'p1', title: 'Authorize before writing',
          body: 'The public mutation writes before checking ownership.',
          location: { file: 'src/auth.ts', line: 42 },
        })).id;
        rejectedId = (await tools.reportFinding({
          priority: 'p3', title: 'Reduce the cache lifetime',
          body: 'The value may be stale.',
        })).id;
        await tools.updateFinding({ findingId: selectedId, priority: 'p0' });
        await expect(tools.updateFinding({
          findingId: selectedId,
          title: 'This mutation must not stick',
          status: 'fixed',
        })).rejects.toThrow('Only a finding currently being fixed can be marked fixed.');
        return { text: '' };
      },
      async () => ({ text: 'The public route reaches the mutation directly.' }),
      async (tools) => {
        await tools.updateFinding({
          findingId: selectedId,
          status: 'fixed',
          evidence: 'Focused regression test passes.',
        });
        return { text: '' };
      },
      async () => ({ text: '' }),
    ]);

    const session = test.service.start(test.owner, { scope: { type: 'uncommitted' }, threadMode: 'independent' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    const firstRound = activeCodeReviewRound(session);
    expect(firstRound.findings[0]?.priority).toBe('p0');
    expect(firstRound.findings[0]?.title).toBe('Authorize before writing');
    expect(firstRound.findings.map((finding) => finding.decision.state)).toEqual(['selected', 'selected']);
    expect(firstRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });

    test.service.discuss(visibleReviewer, {
      sessionId: session.id, roundId: firstRound.id, findingId: selectedId,
      question: 'Is this reachable outside admin routes?',
    });
    await vi.waitFor(() => expect(firstRound.findings[0]?.discussion).toHaveLength(2));
    expect(firstRound.findings[0]?.discussion[0]?.body).toBe('Is this reachable outside admin routes?');
    expect(test.turns[1]?.prompt).toContain(`Review: ${session.id}`);
    expect(test.turns[1]?.prompt).toContain(`Round: ${firstRound.id}`);
    expect(test.turns[1]?.prompt).toContain(`"id": "${selectedId}"`);
    expect(test.turns[1]?.prompt).toContain('"priority": "p0"');
    expect(test.turns[1]?.prompt).toContain('"title": "Authorize before writing"');
    expect(test.turns[1]?.prompt).toContain('Is this reachable outside admin routes?');

    test.service.decide(visibleReviewer, {
      sessionId: session.id, roundId: firstRound.id, findingId: rejectedId,
      decision: 'reject',
    });
    test.service.submit(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('readyToFinish'));

    expect(firstRound.findings.find((finding) => finding.id === selectedId)?.remediation).toMatchObject({
      state: 'fixed', evidence: 'Focused regression test passes.',
    });
    expect(firstRound.findings.find((finding) => finding.id === rejectedId)?.remediation.state).toBe('skipped');
    expect(test.turns.slice(1, 3).map((turn) => turn.reviewerSession)).toEqual([
      { kind: 'codex', threadId: 'review-thread-1' },
      { kind: 'codex', threadId: 'review-thread-1' },
    ]);

    const secondRound = await test.service.reviewAgain(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    expect(secondRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-4' });
    expect(test.turns[3]?.reviewerSession).toBeUndefined();
    expect(test.turns[3]?.prompt).toContain('Not selected for remediation.');
    expect(test.turns[3]?.prompt).toContain(selectedId);
    expect(test.reset).toStrictEqual([visibleReviewer.id]);

    test.service.submit(visibleReviewer, session.id);
    expect(session.status).toBe('readyToFinish');
    await test.service.finish(visibleReviewer, session.id);
    expect(test.deleted).toStrictEqual([visibleReviewer.id]);
    expect(test.snapshot.agents).toStrictEqual([test.owner]);
    expect(test.handoffs).toStrictEqual([{
      from: visibleReviewer.id,
      to: test.owner.id,
      content: 'Independent review completed. Please give the user a concise update with these remediated findings:\n- P0 — Authorize before writing\nNo reply to the reviewer is needed.',
    }]);
  });

  it('keeps one review tool URL alive when the provider caches it for the reviewer thread', async () => {
    const snapshot = createEmptySnapshot();
    const owner = agent('owner');
    owner.backendSession = { kind: 'codex', threadId: 'current-thread' };
    snapshot.agents = [owner];
    const contexts = new Map<string, ReviewToolHandlers>();
    const reviewUrls: string[] = [];
    let cachedReviewUrl = '';
    let findingId = '';
    let contextSequence = 0;
    const closeReviewToolContext = vi.fn((contextId: string) => {
      contexts.delete(contextId);
    });
    const service = new CodeReviewService({
      snapshot,
      createAgent: (input, options) => new AgentCreationService(snapshot).create(input, options),
      tools: {
        createReviewToolContext: (agentId, _sessionId, handlers) => {
          const id = `context-${++contextSequence}`;
          contexts.set(id, handlers);
          return { id, url: `http://review.test/mcp?agentId=${agentId}&reviewContextId=${id}` };
        },
        closeReviewToolContext,
      },
      runReview: async (_agent, _prompt, reviewMcpServerUrl, reviewerSession) => {
        reviewUrls.push(reviewMcpServerUrl);
        cachedReviewUrl ||= reviewMcpServerUrl;
        const contextId = new URL(cachedReviewUrl).searchParams.get('reviewContextId') ?? '';
        const tools = contexts.get(contextId);
        if (!tools) throw new Error('Tool not found: update_finding');
        if (!findingId) {
          findingId = (await tools.reportFinding({
            priority: 'p1', title: 'Keep the review tool context alive',
            body: 'The reviewer thread retains its initial MCP server configuration.',
          })).id;
        } else {
          await tools.updateFinding({ findingId, status: 'fixed' });
        }
        return { text: '', reviewerSession: reviewerSession ?? { kind: 'codex', threadId: 'current-thread' } };
      },
      resetReviewer: async () => undefined,
      deleteReviewer: async () => undefined,
      changed: vi.fn(),
    });

    const session = service.start(owner, { scope: { type: 'uncommitted' }, threadMode: 'current' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    service.submit(owner, session.id);
    await vi.waitFor(() => expect(session.status).not.toBe('fixing'));

    expect(session.status).toBe('readyToFinish');
    expect(reviewUrls[1]).toBe(reviewUrls[0]);
    expect(closeReviewToolContext).not.toHaveBeenCalled();
    await service.finish(owner, session.id);
    expect(closeReviewToolContext).toHaveBeenCalledOnce();
  });

  it('restores the review tool URL for an open reviewer after backend restart', async () => {
    const test = harness([async () => ({ text: '' })]);
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const snapshot = structuredClone(test.snapshot);
    let restoredTools!: ReviewToolHandlers;
    const createReviewToolContext = vi.fn((agentId: string, sessionId: string, handlers: ReviewToolHandlers) => {
      restoredTools = handlers;
      return { id: sessionId, url: `http://review.test/mcp?agentId=${agentId}&reviewContextId=${sessionId}` };
    });
    new CodeReviewService({
      snapshot,
      createAgent: (input, options) => new AgentCreationService(snapshot).create(input, options),
      tools: { createReviewToolContext, closeReviewToolContext: vi.fn() },
      runReview: vi.fn(),
      resetReviewer: vi.fn(),
      deleteReviewer: vi.fn(),
      changed: vi.fn(),
    });

    expect(createReviewToolContext).toHaveBeenCalledWith(session.reviewerAgentId, session.id, expect.any(Object));
    const finding = await restoredTools.reportFinding({
      priority: 'p1', title: 'Keep the restored review alive', body: 'The follow-up found a defect.',
    });
    const restoredReviewer = snapshot.agents.find((agent) => agent.id === session.reviewerAgentId)!;
    expect(activeCodeReviewRound(restoredReviewer.codeReview!).findings[0]?.id).toBe(finding.id);
  });

  it('sends every selected finding in one fix turn and records each fixed update', async () => {
    const ids: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstFixCanFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const test = harness([
      async (tools) => {
        for (const title of ['First', 'Second']) {
          ids.push((await tools.reportFinding({
            priority: 'p2', title, body: `${title} finding body.`,
          })).id);
        }
        return { text: '' };
      },
      async (tools) => {
        await firstFixCanFinish;
        await tools.updateFinding({ findingId: ids[0]!, status: 'fixed' });
        await tools.updateFinding({ findingId: ids[1]!, status: 'fixed' });
        return { text: '' };
      },
    ]);
    const session = test.service.start(test.owner, { scope: { type: 'uncommitted' }, threadMode: 'independent' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    const round = activeCodeReviewRound(session);
    expect(round.findings.map((finding) => finding.decision.state)).toEqual(['selected', 'selected']);
    round.findings[0]!.decision = { state: 'undecided' };

    test.service.submit(visibleReviewer, session.id);
    expect(round.findings[0]!.decision.state).toBe('selected');
    await vi.waitFor(() => expect(round.findings.map((finding) => finding.remediation.state)).toEqual(['fixing', 'fixing']));
    expect(test.turns).toHaveLength(2);
    expect(test.turns[1]?.prompt).toContain('Fix the 2 following findings.');
    expect(test.turns[1]?.prompt).toContain(`${ids[0]}: First`);
    expect(test.turns[1]?.prompt).toContain(`${ids[1]}: Second`);
    expect(test.turns[1]?.prompt).toContain(
      'Immediately after each individual finding is fixed and verified, call update_finding',
    );
    expect(test.turns[1]?.prompt).toContain(
      'Do not wait until all findings are fixed to update their statuses.',
    );
    releaseFirst?.();
    await vi.waitFor(() => expect(round.findings.map((finding) => finding.remediation.state)).toEqual(['fixed', 'fixed']));
    expect(session.status).toBe('readyToFinish');
    expect(test.turns).toHaveLength(2);
    await test.service.finish(visibleReviewer, session.id);
    expect(test.turns).toHaveLength(2);
    expect(test.handoffs).toStrictEqual([{
      from: visibleReviewer.id,
      to: test.owner.id,
      content: 'Independent review completed. Please give the user a concise update with these remediated findings:\n- P2 — First\n- P2 — Second\nNo reply to the reviewer is needed.',
    }]);
  });

  it('keeps finding tools available after the review turn and reopens a completed round', async () => {
    let tools!: ReviewToolHandlers;
    const test = harness([async (context) => { tools = context; return { text: '' }; }]);
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const round = activeCodeReviewRound(session);
    const finding = await tools.reportFinding({
      priority: 'p1', title: 'Fix the late finding', body: 'The failure is actionable.',
    });
    await tools.updateFinding({ findingId: finding.id, priority: 'p2' });
    expect(round.findings[0]).toMatchObject({ id: finding.id, priority: 'p2' });
    test.service.decide(reviewer(test, session), {
      sessionId: session.id, roundId: round.id, findingId: finding.id, decision: 'reject',
    });
    test.service.submit(reviewer(test, session), session.id);
    expect(session.status).toBe('readyToFinish');

    const late = await tools.reportFinding({
      priority: 'p1', title: 'Handle the missed path', body: 'A missed path still fails.',
    });
    expect(session.status).toBe('ready');
    expect(round.status).toBe('ready');
    expect(round.findings.map((item) => item.id)).toContain(late.id);
    await expect(tools.deleteFinding({ findingId: finding.id })).resolves.toStrictEqual({ findingId: finding.id, deleted: true });
    expect(round.findings.map((item) => item.id)).toStrictEqual([late.id]);
    expect(test.changed).toHaveBeenCalled();
  });

  it('accepts new findings during remediation and returns them for arbitration', async () => {
    let findingId = '';
    let lateFindingId = '';
    const test = harness([
      async (tools) => {
        findingId = (await tools.reportFinding({
          priority: 'p1', title: 'Fix the original finding',
          body: 'The review identified one concrete defect.',
        })).id;
        return { text: '' };
      },
      async (tools) => {
        lateFindingId = (await tools.reportFinding({
          priority: 'p2', title: 'Late finding',
          body: 'The follow-up exposed another issue.',
        })).id;
        await tools.updateFinding({ findingId, status: 'fixed' });
        return { text: '' };
      },
    ]);

    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);

    test.service.submit(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    expect(activeCodeReviewRound(session).findings).toHaveLength(2);
    expect(activeCodeReviewRound(session).findings.find((finding) => finding.id === lateFindingId)?.remediation.state).toBe('notStarted');
    expect(activeCodeReviewRound(session).findings.find((finding) => finding.id === findingId)?.remediation.state).toBe('fixed');
  });

  it('lets the reviewer retract a finding during remediation', async () => {
    let findingId = '';
    const test = harness([
      async (tools) => {
        findingId = (await tools.reportFinding({
          priority: 'p2', title: 'Check this suspected failure', body: 'This might fail.',
        })).id;
        return { text: '' };
      },
      async (tools) => {
        await tools.deleteFinding({ findingId });
        return { text: '' };
      },
    ]);
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    test.service.submit(reviewer(test, session), session.id);
    await vi.waitFor(() => expect(session.status).toBe('readyToFinish'));
    expect(activeCodeReviewRound(session).findings).toStrictEqual([]);
  });

  it('preserves completed fixes when remediation is interrupted and only retries unfinished findings', async () => {
    const ids: string[] = [];
    let signalFirstFixed: (() => void) | undefined;
    let releaseInterruptedTurn: (() => void) | undefined;
    let signalInterruptedTurnFinished: (() => void) | undefined;
    const firstFixed = new Promise<void>((resolve) => { signalFirstFixed = resolve; });
    const interruptedTurnCanFinish = new Promise<void>((resolve) => { releaseInterruptedTurn = resolve; });
    const interruptedTurnFinished = new Promise<void>((resolve) => { signalInterruptedTurnFinished = resolve; });
    const test = harness([
      async (tools) => {
        for (const title of ['Already fixed', 'Still pending']) {
          ids.push((await tools.reportFinding({
            priority: 'p1', title, body: `${title} body.`,
          })).id);
        }
        return { text: '' };
      },
      async (tools) => {
        await tools.updateFinding({
          findingId: ids[0]!, status: 'fixed', evidence: 'The first regression passes.',
        });
        signalFirstFixed?.();
        await interruptedTurnCanFinish;
        signalInterruptedTurnFinished?.();
        return { text: '' };
      },
      async (tools) => {
        await tools.updateFinding({ findingId: ids[1]!, status: 'fixed' });
        return { text: '' };
      },
    ]);

    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    const round = activeCodeReviewRound(session);

    test.service.submit(visibleReviewer, session.id);
    await firstFixed;
    await test.service.handleTurnInterrupted(visibleReviewer);

    expect(round.findings[0]?.remediation).toMatchObject({
      state: 'fixed', evidence: 'The first regression passes.',
    });
    expect(round.findings[1]?.remediation).toStrictEqual({ state: 'notStarted' });

    releaseInterruptedTurn?.();
    await interruptedTurnFinished;
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    test.service.submit(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('readyToFinish'));

    expect(test.turns[2]?.prompt).not.toContain(`${ids[0]}: Already fixed`);
    expect(test.turns[2]?.prompt).toContain(`${ids[1]}: Still pending`);
    expect(round.findings.map((finding) => finding.remediation.state)).toEqual(['fixed', 'fixed']);
  });

  it('restores an interrupted fixing round and resumes it in the persisted reviewer thread', async () => {
    let findingId = '';
    const original = harness([async (tools) => {
      findingId = (await tools.reportFinding({
        priority: 'p1', title: 'Restore this fix',
        body: 'The process stopped mid-fix; resume the same review thread.',
      })).id;
      return { text: '' };
    }]);
    const session = original.service.start(original.owner, { scope: { type: 'uncommitted' }, threadMode: 'independent' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const round = activeCodeReviewRound(session);
    round.status = 'submitted';
    round.findings[0]!.decision = { state: 'selected', decidedAt: 'now' };
    round.findings[0]!.remediation = { state: 'fixing', startedAt: 'now' };
    session.status = 'fixing';

    const restored = harness([async (tools) => {
      await tools.updateFinding({ findingId, status: 'fixed' });
      return { text: '' };
    }]);
    const restoredReviewer: Agent = {
      ...structuredClone(reviewer(original, session)),
      codeReview: structuredClone(session),
    };
    restored.snapshot.agents.push(restoredReviewer);
    await restored.service.resumeInterrupted(restoredReviewer);

    await vi.waitFor(() => expect(restoredReviewer.codeReview?.status).toBe('readyToFinish'));
    expect(restoredReviewer.codeReview?.rounds[0]?.findings[0]?.remediation.state).toBe('fixed');
    expect(restored.turns[0]?.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });
  });
});

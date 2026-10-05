import { flushPromises, mount } from '@vue/test-utils';
import { computed } from 'vue';
import { backendChoicesKey } from '../backend-selection';
import { describe, expect, it, vi } from 'vitest';
import type { Agent, AgentGitStatus, AppSnapshot } from '@workspace/core/contracts';
import type { CodeReviewFinding, CodeReviewSession } from '@workspace/core/code-review';
import { i18n } from '../../i18n';
import CodeReviewPanel from '../CodeReviewPanel.vue';

function finding(overrides: Partial<CodeReviewFinding> = {}): CodeReviewFinding {
  return {
    id: 'finding-1',
    roundId: 'round-1',
    priority: 'p1',
    title: 'Authorize before writing',
    body: 'The public mutation writes before checking `ownership`. Authorize before writing.',
    location: { file: 'src/auth.ts', line: 42 },
    decision: { state: 'selected', decidedAt: '2026-09-19T10:00:00.000Z' },
    discussion: [],
    remediation: { state: 'notStarted' },
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:00:00.000Z',
    ...overrides,
  };
}

function session(findings: CodeReviewFinding[], status: CodeReviewSession['status'] = 'ready'): CodeReviewSession {
  const roundStatus = status === 'reviewing' ? 'reviewing'
    : status === 'failed' ? 'failed'
      : status === 'fixing' ? 'submitted'
        : status === 'readyToFinish' || status === 'finished' ? 'completed'
          : 'ready';
  return {
    id: 'review-1', targetAgentId: 'owner', reviewerAgentId: 'reviewer', scope: { type: 'uncommitted' }, threadMode: 'independent', status, activeRoundId: 'round-1',
    createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:05:00.000Z',
    rounds: [{
      id: 'round-1', number: 1, status: roundStatus,
      reviewerSession: { kind: 'codex', threadId: 'review-thread-1' },
      findings, startedAt: '2026-09-19T10:00:00.000Z',
    }],
  };
}

function mountPanel(
  review?: CodeReviewSession,
  gitStatus?: AgentGitStatus,
  currentThreadAvailable = true,
) {
  const actions = {
    startReview: vi.fn().mockResolvedValue({} as AppSnapshot),
    decideFinding: vi.fn().mockResolvedValue({} as AppSnapshot),
    submitReviewRound: vi.fn().mockResolvedValue({} as AppSnapshot),
    finishReview: vi.fn().mockResolvedValue({} as AppSnapshot),
    reviewAgain: vi.fn().mockResolvedValue({} as AppSnapshot),
  };
  const owner: Agent = {
    id: 'owner', name: 'Owner', folder: '/repo', backend: 'codex', status: { type: 'idle' },
    ...(currentThreadAvailable
      ? { backendSession: { kind: 'codex' as const, threadId: 'current-thread' } }
      : {}),
    createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z',
    ...(review ? { codeReview: review } : {}),
  };
  return {
    actions,
    wrapper: mount(CodeReviewPanel, {
      props: { agent: owner, gitStatus, ...actions },
      global: { plugins: [i18n], provide: { [backendChoicesKey as symbol]: computed(() => ['codex', 'claude']) } },
    }),
  };
}

describe('CodeReviewPanel', () => {
  it('starts an independent review from an artifact-first empty state', async () => {
    const { wrapper, actions } = mountPanel();

    expect(wrapper.text()).toContain('Start a review');
    expect(wrapper.text()).not.toContain('Choose a scope and reviewer.');
    expect(wrapper.findAll('fieldset')).toHaveLength(2);
    expect(wrapper.findAll('.code-review-panel__choices')).toHaveLength(2);
    expect(wrapper.findAll('.code-review-panel__choice-icon')).toHaveLength(4);
    const independent = wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Independent reviewer'))!;
    expect(independent.attributes('aria-checked')).toBe('true');
    expect(getComputedStyle(wrapper.get('.code-review-panel__backend').element).justifySelf).toBe('start');
    const selector = wrapper.get('.code-review-panel__choices > .code-review-panel__backend');
    expect(getComputedStyle(selector.element).width).toBe('100%');
    expect(getComputedStyle(selector.element).gridColumn).toBe('1');
    await wrapper.findAll('button').find((button) => button.text().includes('Start review'))!.trigger('click');
    expect(actions.startReview).toHaveBeenCalledWith('owner', {
      scope: { type: 'uncommitted' },
      backend: 'codex',
      threadMode: 'independent',
    });
  });

  it('offers branch scope when available and can review it in the current thread', async () => {
    const gitStatus: AgentGitStatus = {
      folder: '/repo', repository: 'app', branch: 'feature/review-setup',
      ahead: 2, behind: 0, changedFiles: 3, addedLines: 24, removedLines: 4,
      hasUntracked: false, state: 'dirty', updatedAt: '2026-09-19T10:00:00.000Z',
      diffCatalog: {
        defaultTarget: { type: 'branch', baseRef: 'origin/main' },
        branch: { baseRef: 'origin/main', addedLines: 24, removedLines: 4, changedFiles: 3 },
        uncommitted: { addedLines: 5, removedLines: 1, changedFiles: 1 },
        unstaged: { addedLines: 5, removedLines: 1, changedFiles: 1 },
        staged: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        commits: [{
          sha: 'abcdef123456', shortSha: 'abcdef1', subject: 'add review setup',
          addedLines: 19, removedLines: 3, changedFiles: 2,
        }],
      },
    };
    const { wrapper, actions } = mountPanel(undefined, gitStatus);

    expect(wrapper.text()).toContain('Against origin/main');
    expect(wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Uncommitted changes'))!.attributes('aria-checked')).toBe('true');
    await wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Current branch'))!.trigger('click');
    await wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Current thread'))!.trigger('click');
    expect(wrapper.get('.backend-selector select').attributes('disabled')).toBeDefined();
    await wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Independent reviewer'))!.trigger('click');
    expect(wrapper.get('.backend-selector select').attributes('disabled')).toBeUndefined();
    await wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Current thread'))!.trigger('click');
    await wrapper.findAll('button').find((button) => button.text().includes('Start review'))!.trigger('click');

    expect(actions.startReview).toHaveBeenCalledWith('owner', {
      scope: { type: 'branch', baseRef: 'origin/main' },
      threadMode: 'current',
    });
  });

  it('defaults to the branch when there are commits but no uncommitted changes', async () => {
    const gitStatus: AgentGitStatus = {
      folder: '/repo', repository: 'app', branch: 'feature/review-setup',
      ahead: 1, behind: 0, changedFiles: 0, addedLines: 0, removedLines: 0,
      hasUntracked: false, state: 'clean', updatedAt: '2026-09-19T10:00:00.000Z',
      diffCatalog: {
        defaultTarget: { type: 'branch', baseRef: 'origin/main' },
        branch: { baseRef: 'origin/main', addedLines: 19, removedLines: 3, changedFiles: 2 },
        uncommitted: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        unstaged: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        staged: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        commits: [{
          sha: 'abcdef123456', shortSha: 'abcdef1', subject: 'add review setup',
          addedLines: 19, removedLines: 3, changedFiles: 2,
        }],
      },
    };
    const { wrapper, actions } = mountPanel(undefined, gitStatus);

    const uncommitted = wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Uncommitted changes'))!;
    expect(uncommitted.attributes('disabled')).toBeDefined();
    expect(uncommitted.text()).toContain('No uncommitted changes');
    const branch = wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Current branch'))!;
    expect(branch.attributes('aria-checked')).toBe('true');
    await wrapper.findAll('button').find((button) => button.text().includes('Start review'))!.trigger('click');

    expect(actions.startReview).toHaveBeenCalledWith('owner', {
      scope: { type: 'branch', baseRef: 'origin/main' },
      threadMode: 'independent',
      backend: 'codex',
    });
  });

  it('keeps unavailable branch and current-thread choices visible but disabled', () => {
    const gitStatus: AgentGitStatus = {
      folder: '/repo', repository: 'app', branch: 'feature/review-setup',
      ahead: 0, behind: 0, changedFiles: 1, addedLines: 3, removedLines: 0,
      hasUntracked: false, state: 'dirty', updatedAt: '2026-09-19T10:00:00.000Z',
      diffCatalog: {
        defaultTarget: { type: 'uncommitted' },
        branch: { baseRef: 'origin/main', addedLines: 0, removedLines: 0, changedFiles: 0 },
        uncommitted: { addedLines: 3, removedLines: 0, changedFiles: 1 },
        unstaged: { addedLines: 3, removedLines: 0, changedFiles: 1 },
        staged: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        commits: [],
      },
    };
    const { wrapper } = mountPanel(undefined, gitStatus, false);

    const branch = wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Current branch'))!;
    const current = wrapper.findAll('[role="radio"]').find((radio) => radio.text().includes('Current thread'))!;
    expect(branch.attributes('disabled')).toBeDefined();
    expect(branch.text()).toContain('No branch changes');
    expect(current.attributes('disabled')).toBeDefined();
    expect(current.text()).toContain('Start a conversation first');
  });

  it('shows nothing to review when the working tree and branch are clean', () => {
    const gitStatus: AgentGitStatus = {
      folder: '/repo', repository: 'app', branch: 'main',
      ahead: 0, behind: 0, changedFiles: 0, addedLines: 0, removedLines: 0,
      hasUntracked: false, state: 'clean', updatedAt: '2026-09-19T10:00:00.000Z',
      diffCatalog: {
        defaultTarget: { type: 'uncommitted' },
        branch: { baseRef: 'origin/main', addedLines: 0, removedLines: 0, changedFiles: 0 },
        uncommitted: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        unstaged: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        staged: { addedLines: 0, removedLines: 0, changedFiles: 0 },
        commits: [],
      },
    };
    const { wrapper, actions } = mountPanel(undefined, gitStatus);

    expect(wrapper.text()).toContain('Nothing to review');
    expect(wrapper.text()).not.toContain('Start review');
    expect(wrapper.find('.code-review-panel__setup').exists()).toBe(false);
    expect(actions.startReview).not.toHaveBeenCalled();
  });

  it('shows findings as they arrive while describing the active review scope', async () => {
    const uncommittedReview = session([], 'reviewing');
    const { wrapper } = mountPanel(
      uncommittedReview,
      { branch: 'feat/iterative-review' } as AgentGitStatus,
    );

    expect(wrapper.get('.code-review-panel__header h2').text()).toBe('feat/iterative-review');
    expect(wrapper.get('.code-review-panel__working').classes()).toContain('is-waiting');
    expect(wrapper.get('.code-review-panel__working').text()).toContain('Review in progress');
    expect(wrapper.get('.code-review-panel__working').text()).toContain('Inspecting uncommitted changes.');
    expect(wrapper.find('.code-review-panel__progress').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Independent review');

    const reported = finding({ title: 'Validate the live finding' });
    await wrapper.setProps({
      agent: { ...wrapper.props('agent'), codeReview: session([reported], 'reviewing') },
    });

    expect(wrapper.get('.code-review-panel__working').text()).toContain('1 found');
    expect(wrapper.get('.code-review-panel__working').classes()).not.toContain('is-waiting');
    expect(wrapper.get('.review-finding').text()).toContain('Validate the live finding');
    expect(wrapper.find('.review-finding__quick-actions').exists()).toBe(false);

    const branchReview = session([], 'reviewing');
    branchReview.scope = { type: 'branch', baseRef: 'origin/main' };
    await wrapper.setProps({
      agent: { ...wrapper.props('agent'), codeReview: branchReview },
      gitStatus: { branch: 'feature/review-copy' } as AgentGitStatus,
    });

    expect(wrapper.get('.code-review-panel__working').text()).toContain(
      'Inspecting feature/review-copy against origin/main.',
    );
    expect(wrapper.get('.code-review-panel__header h2').text()).toBe('feature/review-copy');
  });

  it('shows a compact priority-ordered triage list and expands only one finding body from its header', async () => {
    const low = finding({ id: 'finding-low', priority: 'p3', title: 'Address the low priority issue', location: undefined });
    const critical = finding({ id: 'finding-critical', priority: 'p0', title: 'Address the critical issue', location: { file: 'src/auth.ts', line: 42, endLine: 47 } });
    const { wrapper } = mountPanel(session([low, critical]));

    expect(wrapper.get('[role="tab"]').text()).toBe('Round 1');
    expect(wrapper.findAll('.review-finding').map((node) => node.text())).toEqual([
      expect.stringContaining('Address the critical issue'),
      expect.stringContaining('Address the low priority issue'),
    ]);
    expect(wrapper.find('.review-finding__body').exists()).toBe(false);
    expect(wrapper.findAll('.review-finding__quick-action')).toHaveLength(2);
    expect(wrapper.findAll('.review-finding__quick-action').map((button) => button.attributes('aria-label'))).toEqual([
      'Clarify', 'Clarify',
    ]);
    expect(wrapper.findAll('.review-finding__selection')).toHaveLength(2);

    const criticalCard = wrapper.findAll('.review-finding')[0]!;
    await criticalCard.get('.review-finding__selection').trigger('click');
    expect(criticalCard.find('.review-finding__body').exists()).toBe(false);
    await criticalCard.get('.review-finding__quick-action').trigger('click');
    expect(criticalCard.find('.review-finding__body').exists()).toBe(false);
    await criticalCard.get('.review-finding__toggle').trigger('click');
    expect(criticalCard.text()).toContain('The public mutation writes before checking ownership.');
    expect(criticalCard.text()).toContain('Authorize before writing.');
    expect(criticalCard.get('code').text()).toBe('ownership');
    expect(criticalCard.get('.review-finding__location').text()).toBe('src/auth.ts:42–47');

    const lowCard = wrapper.findAll('.review-finding')[1]!;
    await lowCard.get('.review-finding__toggle').trigger('click');
    expect(criticalCard.get('.review-finding__toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('.review-finding__body')).toHaveLength(1);
    expect(lowCard.find('.review-finding__location').exists()).toBe(false);
  });

  it('deselects findings through compact toggles and visually mutes unselected cards', async () => {
    const low = finding({
      id: 'finding-low',
      priority: 'p3',
      title: 'Address the low priority issue',
      decision: { state: 'rejected', decidedAt: 'now' },
    });
    const critical = finding({ id: 'finding-critical', priority: 'p0', title: 'Address the critical issue' });
    const { wrapper, actions } = mountPanel(session([low, critical]));

    expect(wrapper.find('.review-finding__state').exists()).toBe(false);
    const criticalCard = wrapper.findAll('.review-finding')[0]!;
    expect((criticalCard.get('.review-finding__selection input').element as HTMLInputElement).checked).toBe(true);
    await criticalCard.get('.review-finding__selection').trigger('click');
    await flushPromises();
    expect(actions.decideFinding).toHaveBeenCalledWith('owner', expect.objectContaining({
      findingId: 'finding-critical', decision: 'reject',
    }));

    const lowCard = wrapper.findAll('.review-finding')[1]!;
    expect(lowCard.attributes('data-decision')).toBe('rejected');
    expect((lowCard.get('.review-finding__selection input').element as HTMLInputElement).checked).toBe(false);
    await lowCard.get('.review-finding__selection').trigger('click');
    await flushPromises();
    expect(actions.decideFinding).toHaveBeenCalledWith('owner', expect.objectContaining({
      findingId: 'finding-low', decision: 'select',
    }));
  });

  it('keeps the review controls stable while a finding decision is saved', async () => {
    let resolveDecision!: (snapshot: AppSnapshot) => void;
    const pendingDecision = new Promise<AppSnapshot>((resolve) => {
      resolveDecision = resolve;
    });
    const { wrapper } = mountPanel(session([
      finding({ id: 'finding-critical', priority: 'p0' }),
      finding({ id: 'finding-secondary', priority: 'p2' }),
    ]));
    await wrapper.setProps({ decideFinding: vi.fn().mockReturnValue(pendingDecision) });

    const findingCards = wrapper.findAll('.review-finding');
    const footerAction = wrapper.get('.code-review-panel__footer .app-button--primary');
    const secondaryClarify = findingCards[1]!.get('.review-finding__quick-action');
    await findingCards[0]!.get('.review-finding__selection').trigger('click');

    expect(footerAction.attributes('disabled')).toBeUndefined();
    expect(secondaryClarify.attributes('disabled')).toBeUndefined();

    resolveDecision({} as AppSnapshot);
    await flushPromises();
  });

  it('hands clarification to the owning conversation without rendering a local composer or history', async () => {
    const selected = finding({
      decision: { state: 'selected', decidedAt: 'now' },
      discussion: [{
        id: 'discussion-1',
        author: 'reviewer',
        body: 'This belongs in the conversation.',
        createdAt: 'now',
      }],
    });
    const { wrapper } = mountPanel(session([selected]));

    await wrapper.get('.review-finding__quick-action').trigger('click');
    expect(wrapper.emitted('clarifyFinding')).toEqual([[
      { sessionId: 'review-1', roundId: 'round-1', finding: selected },
    ]]);
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.find('form').exists()).toBe(false);
    await wrapper.get('.review-finding__toggle').trigger('click');
    expect(wrapper.text()).not.toContain('This belongs in the conversation.');
  });

  it('shows only remediation statuses after the round starts', async () => {
    const { wrapper } = mountPanel(session([
      finding({ id: 'skipped', decision: { state: 'rejected', decidedAt: 'now', reason: 'Expected by contract.' }, remediation: { state: 'skipped', startedAt: 'now' } }),
      finding({ id: 'pending', decision: { state: 'selected', decidedAt: 'now' }, remediation: { state: 'pending', queuedAt: 'now' } }),
      finding({ id: 'fixing', decision: { state: 'selected', decidedAt: 'now' }, remediation: { state: 'fixing', startedAt: 'now' } }),
      finding({ id: 'fixed', decision: { state: 'selected', decidedAt: 'now' }, remediation: { state: 'fixed', completedAt: 'now' } }),
    ], 'fixing'));

    expect(wrapper.findAll('.review-finding').map((node) => node.attributes('data-state'))).toEqual([
      'skipped', 'pending', 'fixing', 'fixed',
    ]);
    expect(wrapper.findAll('.review-finding__state').map((node) => node.text())).toEqual([
      'Skipped', 'Pending', 'Fixing', 'Fixed',
    ]);
    await wrapper.findAll('.review-finding__toggle')[0]!.trigger('click');
    expect(wrapper.text()).toContain('Expected by contract.');
  });

  it('offers the exact finish and repeat actions after fixes complete', async () => {
    const { wrapper, actions } = mountPanel(session([], 'readyToFinish'));
    const buttons = wrapper.findAll('.code-review-panel__footer button');
    const clearCopy = wrapper.get('.code-review-panel__clear');

    expect(clearCopy.text()).toContain('No findings in this round');
    expect(clearCopy.findAll('strong, span').map((node) => getComputedStyle(node.element).gridColumn))
      .toEqual(['2', '2']);
    expect(buttons.map((button) => button.text())).toEqual(['Finish review', 'Review again']);
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
    expect(actions.finishReview).toHaveBeenCalledWith('owner', 'review-1');
    expect(actions.reviewAgain).toHaveBeenCalledWith('owner', 'review-1');
  });

  it('submits selected findings through one remediation action without assignment', async () => {
    const selected = finding({ decision: { state: 'selected', decidedAt: 'now' } });
    const { wrapper, actions } = mountPanel(session([selected]));
    const action = wrapper.get('.code-review-panel__footer .app-button--primary');

    expect(wrapper.find('.review-finding__assignment').exists()).toBe(false);
    expect(action.text()).toBe('Remediate selected findings');
    await action.trigger('click');
    expect(actions.submitReviewRound).toHaveBeenCalledWith('owner', 'review-1');
  });

  it('surfaces start failures in the empty state', async () => {
    const { wrapper } = mountPanel();
    await wrapper.setProps({ startReview: vi.fn().mockRejectedValue(new Error('Reviewer unavailable.')) });

    await wrapper.findAll('button').find((button) => button.text().includes('Start review'))!.trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Reviewer unavailable.');
  });

  it('offers retry when a review round fails', async () => {
    const failed = session([], 'failed');
    failed.rounds[0]!.error = 'Reviewer stopped unexpectedly.';
    const { wrapper } = mountPanel(failed);
    const startReview = vi.fn(async (_agentId: string, input: unknown) => {
      structuredClone(input);
      return {} as AppSnapshot;
    });
    await wrapper.setProps({ startReview });

    expect(wrapper.get('[role="alert"]').text()).toBe('Reviewer stopped unexpectedly.');
    await wrapper.get('.code-review-panel__footer button').trigger('click');
    await flushPromises();

    expect(startReview).toHaveBeenCalledWith('owner', {
      scope: { type: 'uncommitted' },
      threadMode: 'independent',
    });
    expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toEqual([
      'Reviewer stopped unexpectedly.',
    ]);
  });
});

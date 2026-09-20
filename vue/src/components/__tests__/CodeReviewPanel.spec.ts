import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import type { Agent, AppSnapshot } from '@codex-claw/core/contracts';
import type { CodeReviewFinding, CodeReviewSession } from '@codex-claw/core/code-review';
import { i18n } from '../../i18n';
import CodeReviewPanel from '../CodeReviewPanel.vue';

function finding(overrides: Partial<CodeReviewFinding> = {}): CodeReviewFinding {
  return {
    id: 'finding-1',
    roundId: 'round-1',
    fingerprint: 'src/auth.ts:ownership',
    priority: 'p1',
    summary: 'Ownership is skipped',
    rationale: 'The public mutation writes before checking ownership.',
    suggestedResolution: 'Authorize before writing.',
    location: { file: 'src/auth.ts', line: 42 },
    decision: { state: 'undecided' },
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
    id: 'review-1', agentId: 'owner', status, activeRoundId: 'round-1',
    createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:05:00.000Z',
    rounds: [{
      id: 'round-1', number: 1, status: roundStatus,
      reviewerSession: { kind: 'codex', threadId: 'review-thread-1' },
      findings, startedAt: '2026-09-19T10:00:00.000Z',
    }],
  };
}

function mountPanel(review?: CodeReviewSession) {
  const actions = {
    startReview: vi.fn().mockResolvedValue({} as AppSnapshot),
    decideFinding: vi.fn().mockResolvedValue({} as AppSnapshot),
    discussFinding: vi.fn().mockResolvedValue({} as AppSnapshot),
    submitReviewRound: vi.fn().mockResolvedValue({} as AppSnapshot),
    finishReview: vi.fn().mockResolvedValue({} as AppSnapshot),
    reviewAgain: vi.fn().mockResolvedValue({} as AppSnapshot),
  };
  const owner: Agent = {
    id: 'owner', name: 'Owner', folder: '/repo', backend: 'codex', status: { type: 'idle' },
    createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z',
    ...(review ? { codeReview: review } : {}),
  };
  return {
    actions,
    wrapper: mount(CodeReviewPanel, {
      props: { agent: owner, ...actions },
      global: { plugins: [ElementPlus, i18n] },
    }),
  };
}

describe('CodeReviewPanel', () => {
  it('starts an independent review from an artifact-first empty state', async () => {
    const { wrapper, actions } = mountPanel();

    expect(wrapper.text()).toContain('Findings—not a transcript');
    await wrapper.get('button').trigger('click');
    expect(actions.startReview).toHaveBeenCalledWith('owner');
  });

  it('shows a compact priority-ordered triage list and expands only one finding body from its header', async () => {
    const low = finding({ id: 'finding-low', priority: 'p3', summary: 'Low priority issue', location: undefined });
    const critical = finding({ id: 'finding-critical', priority: 'p0', summary: 'Critical issue', location: { file: 'src/auth.ts', line: 42, endLine: 47 } });
    const { wrapper } = mountPanel(session([low, critical]));

    expect(wrapper.findAll('.review-finding').map((node) => node.text())).toEqual([
      expect.stringContaining('Critical issue'),
      expect.stringContaining('Low priority issue'),
    ]);
    expect(wrapper.find('.review-finding__body').exists()).toBe(false);
    expect(wrapper.findAll('.review-finding__quick-action').map((button) => button.text())).toEqual([
      'Select', 'Reject', 'Clarify', 'Select', 'Reject', 'Clarify',
    ]);

    const criticalCard = wrapper.findAll('.review-finding')[0]!;
    await criticalCard.findAll('.review-finding__quick-action')[0]!.trigger('click');
    expect(criticalCard.find('.review-finding__body').exists()).toBe(false);
    await criticalCard.get('.review-finding__toggle').trigger('click');
    expect(criticalCard.text()).toContain('The public mutation writes before checking ownership.');
    expect(criticalCard.text()).toContain('Authorize before writing.');
    expect(criticalCard.get('.review-finding__location').text()).toBe('src/auth.ts:42–47');

    const lowCard = wrapper.findAll('.review-finding')[1]!;
    await lowCard.get('.review-finding__toggle').trigger('click');
    expect(criticalCard.get('.review-finding__toggle').attributes('aria-expanded')).toBe('false');
    expect(wrapper.findAll('.review-finding__body')).toHaveLength(1);
    expect(lowCard.find('.review-finding__location').exists()).toBe(false);
  });

  it('treats selection and rejection as decisions without displaying finding status', async () => {
    const low = finding({ id: 'finding-low', priority: 'p3', summary: 'Low priority issue' });
    const critical = finding({ id: 'finding-critical', priority: 'p0', summary: 'Critical issue' });
    const { wrapper, actions } = mountPanel(session([low, critical]));

    expect(wrapper.find('.review-finding__state').exists()).toBe(false);
    const criticalCard = wrapper.findAll('.review-finding')[0]!;
    await criticalCard.findAll('.review-finding__quick-action')[0]!.trigger('click');
    await flushPromises();
    expect(actions.decideFinding).toHaveBeenCalledWith('owner', expect.objectContaining({ findingId: 'finding-critical', decision: 'select' }));

    const lowCard = wrapper.findAll('.review-finding')[1]!;
    await lowCard.findAll('.review-finding__quick-action')[1]!.trigger('click');
    await lowCard.get('textarea').setValue('The event stream invalidates this cache.');
    await lowCard.get('form').trigger('submit');
    await flushPromises();
    expect(actions.decideFinding).toHaveBeenCalledWith('owner', expect.objectContaining({
      findingId: 'finding-low', decision: 'reject', reason: 'The event stream invalidates this cache.',
    }));
  });

  it('prefills clarification with finding context and sends the user addition through the finding link', async () => {
    const selected = finding({ decision: { state: 'selected', decidedAt: 'now' } });
    const { wrapper, actions } = mountPanel(session([selected]));

    await wrapper.findAll('.review-finding__quick-action')[2]!.trigger('click');
    const textarea = wrapper.get('textarea');
    expect(textarea.element.value).toContain('Finding finding-1: Ownership is skipped');
    expect(textarea.element.value).toContain('Location: src/auth.ts:42');
    expect(textarea.element.value).toContain('The public mutation writes before checking ownership.');
    await textarea.setValue(`${textarea.element.value}Does this change the expected behavior?`);
    await wrapper.get('form').trigger('submit');

    expect(actions.discussFinding).toHaveBeenCalledWith('owner', expect.objectContaining({
      findingId: 'finding-1',
      question: expect.stringContaining('Question: Does this change the expected behavior?'),
    }));
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

    expect(buttons.map((button) => button.text())).toEqual(['Finish review', 'Review again']);
    await buttons[0]!.trigger('click');
    await buttons[1]!.trigger('click');
    expect(actions.finishReview).toHaveBeenCalledWith('owner', 'review-1');
    expect(actions.reviewAgain).toHaveBeenCalledWith('owner', 'review-1');
  });

  it('submits selected findings through one remediation action without assignment', async () => {
    const selected = finding({ decision: { state: 'selected', decidedAt: 'now' } });
    const { wrapper, actions } = mountPanel(session([selected]));
    const action = wrapper.get('.code-review-panel__footer .claw-button--primary');

    expect(wrapper.find('.review-finding__assignment').exists()).toBe(false);
    expect(action.text()).toBe('Remediate selected findings');
    await action.trigger('click');
    expect(actions.submitReviewRound).toHaveBeenCalledWith('owner', 'review-1');
  });

  it('surfaces start failures in the empty state', async () => {
    const { wrapper } = mountPanel();
    await wrapper.setProps({ startReview: vi.fn().mockRejectedValue(new Error('Reviewer unavailable.')) });

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('Reviewer unavailable.');
  });

  it('offers retry when a review round fails', async () => {
    const failed = session([], 'failed');
    failed.rounds[0]!.error = 'Reviewer stopped unexpectedly.';
    const { wrapper, actions } = mountPanel(failed);

    expect(wrapper.get('[role="alert"]').text()).toBe('Reviewer stopped unexpectedly.');
    await wrapper.get('.code-review-panel__footer button').trigger('click');
    expect(actions.startReview).toHaveBeenCalledWith('owner');
  });
});

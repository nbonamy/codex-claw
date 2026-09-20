import { describe, expect, it } from 'vitest';
import { codexSdkFixture, sdkAgent, sdkSnapshot } from './sdk-surface-fixture';

describe('Codex code review boundary', () => {
  it('uses the agent conversation for current-thread review turns and restores its normal tools afterward', async () => {
    const { driver, conversation, surface } = codexSdkFixture();
    const agent = sdkAgent();
    const current = conversation('conversation-a');
    current.setSnapshot({ turnIds: [], messages: [] });
    current.handle.sendMessage.mockResolvedValue(sdkSnapshot('conversation-a', {
      turnIds: ['turn-review'],
      turns: [{ id: 'turn-review', status: 'completed' } as never],
    }));

    await driver.runCodeReview(agent, {
      cwd: '/repo',
      prompt: 'Review in this conversation.',
      reviewMcpServerUrl: 'http://127.0.0.1:4321/mcp?reviewContextId=current',
      reviewerSession: agent.backendSession,
    });

    expect(current.handle.load.mock.calls).toStrictEqual([
      [{ extensionContext: { agent, reviewMcpServerUrl: 'http://127.0.0.1:4321/mcp?reviewContextId=current' } }],
      [{ cwd: '/repo', extensionContext: agent }],
    ]);
    expect(current.handle.sendMessage).toHaveBeenCalledWith('Review in this conversation.');
    expect(surface.archiveConversation).not.toHaveBeenCalled();
    expect(surface.forgetConversation).not.toHaveBeenCalled();
  });

  it('creates a fresh reviewer conversation and keeps it available for later round turns', async () => {
    const { driver, surface, conversation } = codexSdkFixture();
    const review = conversation('review-fresh');
    surface.createConversation.mockResolvedValue(sdkSnapshot('review-fresh'));
    review.setSnapshot({
      turnIds: [],
      messages: [{
        id: 'review-answer', role: 'assistant', status: 'complete', turnId: 'turn-review',
        parts: [{ type: 'text', text: 'The finding is reachable.' }],
        createdAt: '2026-09-19T10:00:00.000Z',
      }],
    });
    review.handle.startReview.mockResolvedValue(sdkSnapshot('review-fresh', {
      turnIds: ['turn-review'],
      turns: [{ id: 'turn-review', status: 'completed' } as never],
    }));

    const result = await driver.runCodeReview(sdkAgent(), {
      cwd: '/repo',
      prompt: 'Review independently and report findings.',
      reviewMcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-a&reviewContextId=review-1',
    });

    expect(surface.createConversation).toHaveBeenCalledWith({ cwd: '/repo', threadSource: 'user' }, {
      extensionContext: {
        agent: sdkAgent(),
        reviewMcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-a&reviewContextId=review-1',
      },
    });
    expect(review.handle.startReview).toHaveBeenCalledWith({
      target: { type: 'custom', instructions: 'Review independently and report findings.' },
    });
    expect(result).toEqual({
      text: 'The finding is reachable.',
      reviewerSession: { kind: 'codex', threadId: 'review-fresh' },
    });
    expect(surface.archiveConversation).not.toHaveBeenCalled();
    expect(surface.forgetConversation).not.toHaveBeenCalled();

    review.setSnapshot({ turnIds: ['turn-review'], messages: [] });
    review.handle.sendMessage.mockResolvedValue(sdkSnapshot('review-fresh', {
      turnIds: ['turn-review', 'turn-follow-up'],
      turns: [{ id: 'turn-follow-up', status: 'completed' } as never],
    }));
    await driver.runCodeReview(sdkAgent(), {
      cwd: '/repo',
      prompt: 'Clarify the finding.',
      reviewMcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-a&reviewContextId=review-2',
      reviewerSession: result.reviewerSession,
    });

    expect(review.handle.load).toHaveBeenCalledWith({
      extensionContext: {
        agent: sdkAgent(),
        reviewMcpServerUrl: 'http://127.0.0.1:4321/mcp?agentId=agent-a&reviewContextId=review-2',
      },
    });
    expect(review.handle.sendMessage).toHaveBeenCalledWith('Clarify the finding.');

    await driver.disposeCodeReview(sdkAgent(), result.reviewerSession);
    expect(surface.archiveConversation).toHaveBeenCalledExactlyOnceWith('review-fresh');
    expect(surface.forgetConversation).toHaveBeenCalledExactlyOnceWith('review-fresh');
  });
});

import { describe, expect, it } from 'vitest';
import { codexSdkFixture, sdkAgent, sdkSnapshot } from './sdk-surface-fixture';

describe('Codex code review boundary', () => {
  it('uses a fresh conversation with the round-scoped MCP context and archives it afterward', async () => {
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
    expect(result).toEqual({ text: 'The finding is reachable.' });
    expect(surface.archiveConversation).toHaveBeenCalledWith('review-fresh');
    expect(surface.forgetConversation).toHaveBeenCalledWith('review-fresh');
  });
});

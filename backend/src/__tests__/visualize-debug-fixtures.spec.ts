import { describe, expect, it } from 'vitest';
import type { Agent } from '@workspace/core/contracts';
import { createVisualizeDebugFixture } from '../visualize-debug-fixtures';

describe('Visualize debug fixture', () => {
  it('provides suggestions, generated visualizations, selection, and conversation ownership', () => {
    const agent: Agent = {
      id: 'agent-visualize',
      teamId: 'team-visualize',
      name: 'Designer',
      folder: '/repo',
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-visualize' },
      status: { type: 'idle' },
      createdAt: '2026-09-21T12:00:00.000Z',
      updatedAt: '2026-09-21T12:00:00.000Z',
    };

    const visualize = createVisualizeDebugFixture(agent, '2026-09-21T13:00:00.000Z');

    expect(visualize.conversationRef).toStrictEqual({ backend: 'codex', threadId: 'thread-visualize' });
    expect(visualize.isOpen).toBe(true);
    expect(visualize.suggestions).toHaveLength(4);
    expect(visualize.suggestions.filter(suggestion => suggestion.visualizationId)).toHaveLength(2);
    expect(visualize.visualizations.map(visualization => visualization.content.kind)).toStrictEqual(['mermaid', 'svg']);
    expect(visualize.selectedVisualizationId).toBe(visualize.visualizations[0]?.id);

    const suggestions = createVisualizeDebugFixture(agent, '2026-09-21T13:00:00.000Z', 'suggestions');
    expect(suggestions.suggestions).toHaveLength(4);
    expect(suggestions.suggestions.every(suggestion => !suggestion.visualizationId)).toBe(true);
    expect(suggestions.visualizations).toStrictEqual([]);
    expect(suggestions.selectedVisualizationId).toBeNull();
  });
});

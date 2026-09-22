import { describe, expect, it } from 'vitest';
import type { Agent } from '@codex-claw/core/contracts';
import { createDesignDebugFixture } from '../design-debug-fixtures';

describe('Design debug fixture', () => {
  it('provides suggestions, generated diagrams, selection, and conversation ownership', () => {
    const agent: Agent = {
      id: 'agent-design',
      teamId: 'team-design',
      name: 'Designer',
      folder: '/repo',
      backend: 'codex',
      backendSession: { kind: 'codex', threadId: 'thread-design' },
      status: { type: 'idle' },
      createdAt: '2026-09-21T12:00:00.000Z',
      updatedAt: '2026-09-21T12:00:00.000Z',
    };

    const design = createDesignDebugFixture(agent, '2026-09-21T13:00:00.000Z');

    expect(design.conversationRef).toStrictEqual({ backend: 'codex', threadId: 'thread-design' });
    expect(design.suggestions).toHaveLength(4);
    expect(design.suggestions.filter(suggestion => suggestion.diagramId)).toHaveLength(2);
    expect(design.diagrams.map(diagram => diagram.content.kind)).toStrictEqual(['mermaid', 'svg']);
    expect(design.selectedDiagramId).toBe(design.diagrams[0]?.id);

    const suggestions = createDesignDebugFixture(agent, '2026-09-21T13:00:00.000Z', 'suggestions');
    expect(suggestions.suggestions).toHaveLength(4);
    expect(suggestions.suggestions.every(suggestion => !suggestion.diagramId)).toBe(true);
    expect(suggestions.diagrams).toStrictEqual([]);
    expect(suggestions.selectedDiagramId).toBeNull();
  });
});

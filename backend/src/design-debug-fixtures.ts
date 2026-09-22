import { conversationRefFromAgent } from '@codex-claw/core/conversation-ref';
import type { Agent } from '@codex-claw/core/contracts';
import type { DesignDebugScenario, DesignSession } from '@codex-claw/core/design';

export function createDesignDebugFixture(
  agent: Agent,
  now = new Date().toISOString(),
  scenario: DesignDebugScenario = 'complete',
): DesignSession {
  const fixture: DesignSession = {
    id: 'debug-design-session',
    conversationRef: conversationRefFromAgent(agent),
    suggestions: [
      {
        id: 'debug-suggestion-system',
        title: 'Design workflow',
        description: 'Show how suggestions become generated diagrams and later revisions.',
        diagramId: 'debug-diagram-workflow',
      },
      {
        id: 'debug-suggestion-architecture',
        title: 'Provider-independent architecture',
        description: 'Map the renderer, app-owned backend seam, provider driver, and Design MCP tools.',
        diagramId: 'debug-diagram-architecture',
      },
      {
        id: 'debug-suggestion-state',
        title: 'Persistence lifecycle',
        description: 'Trace how Design state is scoped to an agent conversation and restored after reload.',
      },
      {
        id: 'debug-suggestion-edit',
        title: 'Diagram edit loop',
        description: 'Illustrate select, inspect, request an edit, and replace with revision checking.',
      },
    ],
    diagrams: [
      {
        id: 'debug-diagram-workflow',
        title: 'Design workflow',
        content: {
          kind: 'mermaid',
          source: [
            'flowchart LR',
            '  A[Suggestions] --> B[Generate]',
            '  B --> C[Inspect]',
            '  C --> D[Edit or add]',
            '  D --> C',
          ].join('\n'),
        },
        revision: 2,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'debug-diagram-architecture',
        title: 'Provider-independent architecture',
        content: {
          kind: 'svg',
          source: [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 260" role="img" aria-label="Design architecture">',
            '<rect width="760" height="260" rx="24" fill="#f5f7fb"/>',
            '<g font-family="system-ui, sans-serif" text-anchor="middle">',
            '<rect x="36" y="86" width="164" height="88" rx="16" fill="#dbeafe" stroke="#2563eb"/>',
            '<text x="118" y="124" font-size="18" fill="#172554">Design pane</text>',
            '<text x="118" y="150" font-size="13" fill="#1e3a8a">Vue workspace</text>',
            '<rect x="298" y="86" width="164" height="88" rx="16" fill="#dcfce7" stroke="#16a34a"/>',
            '<text x="380" y="124" font-size="18" fill="#14532d">Design service</text>',
            '<text x="380" y="150" font-size="13" fill="#166534">App-owned state</text>',
            '<rect x="560" y="86" width="164" height="88" rx="16" fill="#fef3c7" stroke="#d97706"/>',
            '<text x="642" y="124" font-size="18" fill="#78350f">MCP tools</text>',
            '<text x="642" y="150" font-size="13" fill="#92400e">Provider seam</text>',
            '<path d="M200 130h90m172 0h90" stroke="#64748b" stroke-width="4" marker-end="url(#arrow)"/>',
            '</g>',
            '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0l10 5-10 5z" fill="#64748b"/></marker></defs>',
            '</svg>',
          ].join(''),
        },
        revision: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    selectedDiagramId: 'debug-diagram-workflow',
    createdAt: now,
    updatedAt: now,
  };
  if (scenario === 'suggestions') {
    fixture.suggestions = fixture.suggestions.map(suggestion => ({
      id: suggestion.id,
      title: suggestion.title,
      description: suggestion.description,
    }));
    fixture.diagrams = [];
    fixture.selectedDiagramId = null;
  }
  return fixture;
}

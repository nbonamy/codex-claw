import { describe, expect, it, vi } from 'vitest';
import type { DesignService } from '../../design-service';
import { createDesignToolModuleProvider } from '../design-tools';

describe('Design MCP tool module', () => {
  it('registers only for the owning Design conversation and delegates domain inputs', async () => {
    const service = {
      contextForAgent: vi.fn((agentId: string) => agentId === 'agent-design' ? { id: 'design-1' } : undefined),
      suggest: vi.fn().mockResolvedValue({ success: true, suggestions: [] }),
      add: vi.fn().mockResolvedValue({ success: true, diagramId: 'diagram-1', revision: 1, title: 'System' }),
      get: vi.fn().mockReturnValue({ success: true, diagram: { id: 'diagram-1' } }),
      replace: vi.fn().mockResolvedValue({ success: true, diagramId: 'diagram-1', revision: 2, title: 'System' }),
    } as unknown as DesignService;
    const provider = createDesignToolModuleProvider(service);

    expect(provider.resolve({ agentId: 'agent-other', url: new URL('http://localhost/mcp') })).toBeUndefined();
    const module = provider.resolve({ agentId: 'agent-design', url: new URL('http://localhost/mcp') });
    const handlers = new Map<string, (input: never) => Promise<{ structuredContent?: unknown }>>();
    module?.register({
      registerTool: (name: string, _definition: unknown, handler: (input: never) => Promise<{ structuredContent?: unknown }>) => {
        handlers.set(name, handler);
      },
    } as never, { proposedActions: true });

    expect([...handlers.keys()]).toStrictEqual([
      'suggest-design-diagrams',
      'add-design-diagram',
      'get-design-diagram',
      'replace-design-diagram',
    ]);
    await handlers.get('suggest-design-diagrams')!({ suggestions: [{ title: 'System', description: 'Architecture' }] } as never);
    await handlers.get('add-design-diagram')!({
      title: 'System',
      suggestionId: 'suggestion-1',
      content: { kind: 'mermaid', source: 'flowchart LR\n A --> B' },
    } as never);
    await handlers.get('get-design-diagram')!({ diagramId: 'diagram-1' } as never);
    await handlers.get('replace-design-diagram')!({
      diagramId: 'diagram-1', expectedRevision: 1, title: 'System', content: { kind: 'svg', source: '<svg />' },
    } as never);

    expect(service.suggest).toHaveBeenCalledWith('agent-design', [{ title: 'System', description: 'Architecture' }]);
    expect(service.add).toHaveBeenCalledWith('agent-design', expect.objectContaining({ suggestionId: 'suggestion-1' }));
    expect(service.get).toHaveBeenCalledWith('agent-design', 'diagram-1');
    expect(service.replace).toHaveBeenCalledWith('agent-design', expect.objectContaining({ expectedRevision: 1 }));
  });
});

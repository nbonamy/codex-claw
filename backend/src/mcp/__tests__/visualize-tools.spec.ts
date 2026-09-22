import { describe, expect, it, vi } from 'vitest';
import type { VisualizeService } from '../../visualize-service';
import { createVisualizeToolModuleProvider } from '../visualize-tools';

describe('Visualize MCP tool module', () => {
  it('registers only while the owning Visualize pane is open and delegates domain inputs', async () => {
    const service = {
      contextForAgent: vi.fn((agentId: string) => agentId === 'agent-visualize' ? { id: 'visualize-1' } : undefined),
      suggest: vi.fn().mockResolvedValue({ success: true, suggestions: [] }),
      add: vi.fn().mockResolvedValue({ success: true, visualizationId: 'visualization-1', revision: 1, title: 'System' }),
      get: vi.fn().mockReturnValue({ success: true, visualization: { id: 'visualization-1' } }),
      list: vi.fn().mockReturnValue({ success: true, visualizations: [] }),
      delete: vi.fn().mockResolvedValue({ success: true, visualizationId: 'visualization-1', selectedVisualizationId: null }),
      replace: vi.fn().mockResolvedValue({ success: true, visualizationId: 'visualization-1', revision: 2, title: 'System' }),
    } as unknown as VisualizeService;
    const provider = createVisualizeToolModuleProvider(service);

    expect(provider.resolve({ agentId: 'agent-other', url: new URL('http://localhost/mcp') })).toBeUndefined();
    const module = provider.resolve({ agentId: 'agent-visualize', url: new URL('http://localhost/mcp') });
    const handlers = new Map<string, (input: never) => Promise<{ structuredContent?: unknown }>>();
    module?.register({
      registerTool: (name: string, _definition: unknown, handler: (input: never) => Promise<{ structuredContent?: unknown }>) => {
        handlers.set(name, handler);
      },
    } as never, { proposedActions: true });

    expect([...handlers.keys()]).toStrictEqual([
      'suggest-visualizations',
      'add-visualization',
      'get-visualization',
      'list-visualizations',
      'delete-visualization',
      'replace-visualization',
    ]);
    await handlers.get('suggest-visualizations')!({ suggestions: [{ title: 'System', description: 'Architecture' }] } as never);
    await handlers.get('add-visualization')!({
      title: 'System',
      suggestionId: 'suggestion-1',
      content: { kind: 'mermaid', source: 'flowchart LR\n A --> B' },
    } as never);
    await handlers.get('get-visualization')!({ visualizationId: 'visualization-1' } as never);
    await handlers.get('list-visualizations')!({} as never);
    await handlers.get('delete-visualization')!({ visualizationId: 'visualization-1' } as never);
    await handlers.get('replace-visualization')!({
      visualizationId: 'visualization-1', expectedRevision: 1, title: 'System', content: { kind: 'svg', source: '<svg />' },
    } as never);

    expect(service.suggest).toHaveBeenCalledWith('agent-visualize', [{ title: 'System', description: 'Architecture' }]);
    expect(service.add).toHaveBeenCalledWith('agent-visualize', expect.objectContaining({ suggestionId: 'suggestion-1' }));
    expect(service.get).toHaveBeenCalledWith('agent-visualize', 'visualization-1');
    expect(service.list).toHaveBeenCalledWith('agent-visualize');
    expect(service.delete).toHaveBeenCalledWith('agent-visualize', 'visualization-1');
    expect(service.replace).toHaveBeenCalledWith('agent-visualize', expect.objectContaining({ expectedRevision: 1 }));
  });
});

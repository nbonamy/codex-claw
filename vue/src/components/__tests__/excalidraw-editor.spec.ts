import { describe, expect, it, vi } from 'vitest';
import type { Visualization } from '@codex-claw/core/visualize';
const convert = vi.hoisted(() => vi.fn());
vi.mock('@excalidraw/excalidraw', () => ({ Excalidraw: {}, MainMenu: {}, CaptureUpdateAction: {}, convertToExcalidrawElements: vi.fn(), exportToCanvas: vi.fn(), restoreElements: vi.fn() }));
vi.mock('@excalidraw/mermaid-to-excalidraw', () => ({ parseMermaidToExcalidraw: convert }));
import { importVisualization } from '../excalidraw-editor';
const base: Visualization = { id: 'v', title: 'Diagram', content: { kind: 'mermaid', source: '' }, createdAt: '', updatedAt: '' };
describe('canvas imports', () => {
  it.each(['flowchart LR; A@{img: "https://example.com/a.png"}', 'flowchart LR; click A "https://example.com"', '%%{init: {securityLevel: "loose"}}%%\nflowchart LR; A-->B'])('rejects active content before Mermaid creates DOM: %s', async source => {
    await expect(importVisualization({ ...base, content: { kind: 'mermaid', source } }, '')).rejects.toThrow('does not allow');
    expect(convert).not.toHaveBeenCalled();
  });
  it('restores an authoritative canvas without reparsing its original source', async () => {
    const canvas = { revision: 3, elements: [{ id: 'user', type: 'rectangle', x: 77, y: 31, width: 20, height: 20 }], files: {}, selectedElementIds: [], preview: '' };
    expect(await importVisualization({ ...base, canvas }, '')).toEqual(canvas);
    expect(convert).not.toHaveBeenCalled();
  });
});

import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasDocument, SaveCanvasInput } from '@codex-claw/core/visualize-canvas';
import type { Visualization } from '@codex-claw/core/visualize';
import type { CanvasScene } from '../excalidraw-editor';
import ExcalidrawCanvas from '../ExcalidrawCanvas.vue';
const editor = vi.hoisted(() => ({ setEditing: vi.fn(), update: vi.fn(), fit: vi.fn(), dispose: vi.fn(), preview: vi.fn().mockResolvedValue('data:image/png;base64,YQ=='), change: (_scene: CanvasScene) => {} }));
vi.mock('../excalidraw-editor', () => ({
  importVisualization: async (visualization: Visualization) => structuredClone(visualization.canvas),
  mountCanvas: (_host: HTMLElement, _scene: CanvasScene, change: typeof editor.change) => { editor.change = change; return editor; },
}));
const canvas: CanvasDocument = {
  revision: 1, elements: [{ id: 'a', type: 'text', text: 'User label', x: 20, y: 30, width: 100, height: 24 }, { id: 'b', type: 'rectangle', x: 200, y: 30, width: 100, height: 90 }],
  selectedElementIds: ['a'], files: {}, preview: '',
};
const visualization: Visualization = { id: 'v', title: 'Map', content: { kind: 'mermaid', source: 'flowchart LR; A --> B' }, canvas, createdAt: '', updatedAt: '' };
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
describe('ExcalidrawCanvas', () => {
  it('autosaves edits and selection for the original agent without a second composer', async () => {
    const save = vi.fn(async (input: SaveCanvasInput) => ({ ...input.document, revision: input.expectedRevision + 1 }));
    const wrapper = mount(ExcalidrawCanvas, { props: { visualization, save, sessionId: 'session' } });
    await flushPromises();
    const edited = structuredClone(canvas);
    edited.elements[0].x = 70;
    editor.change(edited);
    await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(save).toHaveBeenCalledWith({ sessionId: 'session', expectedSource: JSON.stringify(visualization.content), visualizationId: 'v', expectedRevision: 1, document: { ...edited, preview: 'data:image/png;base64,YQ==' } });

  });
  it('starts read-only with quiet save status and toggles editing without remounting', async () => {
    const wrapper = mount(ExcalidrawCanvas, { props: { visualization, save: vi.fn(), sessionId: 'session' } });
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    const toggle = wrapper.get('button[aria-label="Edit"]');
    expect(toggle.text()).toBe('');
    await wrapper.get('button[aria-label="Fit canvas"]').trigger('click');
    expect(editor.fit).toHaveBeenCalledOnce();
    expect(toggle.attributes('aria-pressed')).toBe('false');
    await toggle.trigger('click');
    expect(editor.setEditing).toHaveBeenLastCalledWith(true);
    expect(toggle.attributes('aria-label')).toBe('Done');
    await toggle.trigger('click');
    expect(editor.setEditing).toHaveBeenLastCalledWith(false);
    expect(editor.dispose).not.toHaveBeenCalled();
  });
  it('refreshes the persisted thumbnail after an agent batch even without further user edits', async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (input: SaveCanvasInput) => ({ ...input.document, revision: input.expectedRevision + 1 }));
    const wrapper = mount(ExcalidrawCanvas, { props: { visualization, save, sessionId: 'session' } });
    await flushPromises();
    const agentEdit = { ...structuredClone(canvas), revision: 2 };
    agentEdit.elements[0].text = 'Agent label';
    await wrapper.setProps({ visualization: { ...visualization, canvas: agentEdit } });
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toMatchObject({ expectedRevision: 2, document: { preview: 'data:image/png;base64,YQ==' } });
    wrapper.unmount();
    vi.useRealTimers();
  });
  it('applies an agent batch as one undoable editor update and does not overwrite unsaved local work', async () => {
    const save = vi.fn();
    const wrapper = mount(ExcalidrawCanvas, { props: { visualization, save, sessionId: 'session' } });
    await flushPromises();
    const agentEdit = { ...structuredClone(canvas), revision: 2 };
    agentEdit.elements[0].text = 'Agent label';
    await wrapper.setProps({ visualization: { ...visualization, canvas: agentEdit } });
    expect(editor.update).toHaveBeenCalledWith(agentEdit, true);
    const local = structuredClone(agentEdit);
    local.elements[0].x = 90;
    editor.change(local);
    const newer = { ...structuredClone(agentEdit), revision: 3 };
    newer.elements[0].text = 'Concurrent';
    await wrapper.setProps({ visualization: { ...visualization, canvas: newer } });
    expect(wrapper.get('[role="status"]').text()).toContain('local edits are preserved');
    expect(editor.update).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });
  it('shows a failed save, retries retained edits and cleans up the editor', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Disk full')).mockImplementation(async (input: SaveCanvasInput) => ({ ...input.document, revision: 2 }));
    const wrapper = mount(ExcalidrawCanvas, { props: { visualization, save, sessionId: 'session' } });
    await flushPromises();
    const moved = structuredClone(canvas);
    moved.elements[0].x = 80;
    editor.change(moved);
    await vi.advanceTimersByTimeAsync(200);
    expect(wrapper.text()).toContain('Disk full');
    await wrapper.findAll('button[type="button"]').find(button => button.text() === 'Retry save')!.trigger('click');
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].document.elements[0].x).toBe(80);
    wrapper.unmount();
    expect(editor.dispose).toHaveBeenCalledOnce();
  });
});

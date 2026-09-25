import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Visualization } from '@codex-claw/core/visualize';
const root = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn() }));
vi.mock('react-dom/client', () => ({ createRoot: () => root }));
const convert = vi.hoisted(() => vi.fn());
vi.mock('@excalidraw/excalidraw', () => ({ Excalidraw: {}, MainMenu: {}, CaptureUpdateAction: {}, convertToExcalidrawElements: vi.fn(), exportToCanvas: vi.fn(), restoreElements: vi.fn(elements => structuredClone(elements)), bumpVersion: vi.fn(element => ({ ...element, version: element.version + 1 })) }));
vi.mock('@excalidraw/mermaid-to-excalidraw', () => ({ parseMermaidToExcalidraw: convert }));
import { restoreElements } from '@excalidraw/excalidraw';
import { importVisualization, mountCanvas } from '../excalidraw-editor';
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

const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
afterEach(() => { vi.unstubAllGlobals(); if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts); else Reflect.deleteProperty(document, 'fonts'); });
describe('canvas font loading', () => {
  it('remeasures the current scene after fonts load, enables binding repair and cleans up its listener', async () => {
    const fonts = new EventTarget();
    Object.assign(fonts, { ready: Promise.resolve(fonts) });
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const host = document.createElement('div');
    const initial = { elements: [], files: {}, selectedElementIds: [], preview: '' };
    const editor = mountCanvas(host, initial, vi.fn(), vi.fn());
    const current = [{ id: 'box', type: 'rectangle', x: 20, y: 30, width: 260, height: 90, version: 2 }, { id: 'user-label', type: 'text', containerId: 'box', text: 'User edited label', originalText: 'User edited label', textAlign: 'center', verticalAlign: 'middle', x: 70, y: 90, width: 100, height: 25, version: 4 }];
    const api = { getSceneElements: () => current, updateScene: vi.fn(), scrollToContent: vi.fn() };
    root.render.mock.calls.at(-1)![0].props.children.props.excalidrawAPI(api);
    await Promise.resolve();
    frames.splice(0).forEach(callback => callback(0));
    vi.mocked(restoreElements).mockClear();
    vi.mocked(restoreElements).mockImplementationOnce(elements => (elements ?? []).map(element => element.type === 'text' ? { ...element, width: 160, height: 50 } : element) as ReturnType<typeof restoreElements>);
    fonts.dispatchEvent(new Event('loadingdone'));
    frames.splice(0).forEach(callback => callback(0));
    expect(restoreElements).toHaveBeenCalledWith(current, null, { repairBindings: true, refreshDimensions: true });
    expect(api.updateScene.mock.calls.at(-1)![0].elements[1]).toMatchObject({ id: 'user-label', text: 'User edited label', x: 70, y: 50, width: 160, height: 50, version: 5 });
    expect(api.updateScene.mock.calls.at(-1)![0].elements[0]).toEqual(current[0]);
    editor.dispose();
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(frames).toHaveLength(0);
  });

  it('fits once when a newly mounted canvas first receives usable dimensions', async () => {
    const fonts = new EventTarget();
    Object.assign(fonts, { ready: Promise.resolve(fonts) });
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    let resized!: () => void;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback; }
      observe() {}
      disconnect() {}
    });
    const host = document.createElement('div');
    Object.defineProperties(host, {
      clientWidth: { configurable: true, value: 0 },
      clientHeight: { configurable: true, value: 0 },
    });
    const editor = mountCanvas(host, { elements: [], files: {}, selectedElementIds: [], preview: '' }, vi.fn(), vi.fn());
    const api = { getSceneElements: () => [], updateScene: vi.fn(), scrollToContent: vi.fn(), refresh: vi.fn() };
    root.render.mock.calls.at(-1)![0].props.children.props.excalidrawAPI(api);
    await Promise.resolve();
    frames.splice(0).forEach(callback => callback(0));
    expect(api.scrollToContent).not.toHaveBeenCalled();

    Object.defineProperties(host, {
      clientWidth: { configurable: true, value: 420 },
      clientHeight: { configurable: true, value: 280 },
    });
    resized();
    frames.splice(0).forEach(callback => callback(0));
    expect(api.scrollToContent).toHaveBeenCalledOnce();
    expect(api.scrollToContent).toHaveBeenCalledWith(undefined, { fitToContent: true });

    resized();
    frames.splice(0).forEach(callback => callback(0));
    expect(api.scrollToContent).toHaveBeenCalledOnce();
    editor.dispose();
  });
});

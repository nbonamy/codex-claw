import { Component, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu, CaptureUpdateAction, convertToExcalidrawElements, exportToCanvas, restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI, BinaryFiles, AppState, ExcalidrawProps } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement, FileId } from '@excalidraw/excalidraw/element/types';
import type { CanvasDocument, CanvasElement } from '@codex-claw/core/visualize-canvas';
import type { Visualization } from '@codex-claw/core/visualize';
import { sanitizeSvg } from './visualization-svg';
import '@excalidraw/excalidraw/index.css';

Object.assign(window, { EXCALIDRAW_ASSET_PATH: new URL('./excalidraw/', document.baseURI).href });

export type CanvasScene = Omit<CanvasDocument, 'revision'>;
export async function importVisualization(visualization: Visualization, imageSource: string): Promise<CanvasScene> {
  if (visualization.canvas) return structuredClone(visualization.canvas);
  if (visualization.content.kind === 'mermaid') {
    if (/%%\s*\{|\bclick\s+|\b(?:img|icon)\s*:|<(?:img|iframe|script|object|embed|link|style)\b/iu.test(visualization.content.source)) {
      throw new Error('Canvas import does not allow Mermaid directives, links, or external assets.');
    }
    const { parseMermaidToExcalidraw } = await import('@excalidraw/mermaid-to-excalidraw');
    const result = await parseMermaidToExcalidraw(visualization.content.source);
    const files: BinaryFiles = {};
    for (const [id, file] of Object.entries(result.files ?? {})) {
      files[id] = file.mimeType === 'image/svg+xml'
        ? { ...file, mimeType: 'image/png', dataURL: (await rasterize(file.dataURL)).dataURL as typeof file.dataURL }
        : file;
    }
    return { elements: convertToExcalidrawElements(result.elements, { regenerateIds: false }) as unknown as CanvasElement[], files, selectedElementIds: [], preview: '' };
  }
  const source = visualization.content.kind === 'svg'
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizeSvg(visualization.content.source))}`
    : imageSource;
  const image = await rasterize(source);
  const id = `image-${visualization.id}`;
  const elements = convertToExcalidrawElements([{ type: 'image', x: 0, y: 0, width: image.width, height: image.height, fileId: id as FileId }]);
  return {
    elements: elements as unknown as CanvasElement[],
    files: { [id]: { id, mimeType: 'image/png', dataURL: image.dataURL, created: Date.now() } },
    selectedElementIds: [], preview: '',
  };
}
async function rasterize(source: string): Promise<{ dataURL: string; width: number; height: number }> {
  if (!source.startsWith('data:image/')) throw new Error('Image is not available.');
  // SVG is always decoded, sanitized and re-encoded before the browser sees it.
  if (source.startsWith('data:image/svg+xml')) {
    const comma = source.indexOf(',');
    const svg = source.slice(0, comma).includes(';base64') ? atob(source.slice(comma + 1)) : decodeURIComponent(source.slice(comma + 1));
    source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitizeSvg(svg))}`;
  }
  const image = new Image();
  image.src = source;
  await image.decode();
  const ratio = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataURL: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
class CanvasErrorBoundary extends Component<{ onError: (error: Error) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { this.props.onError(error); }
  render() { return this.state.failed ? null : this.props.children; }
}
export function mountCanvas(host: HTMLElement, scene: CanvasScene, onChange: (scene: CanvasScene) => void, onError: (error: Error) => void) {
  const root = createRoot(host);
  const theme = () => document.documentElement.classList.contains('dark') ? 'dark' as const : 'light' as const;
  const syncControlStyle = () => requestAnimationFrame(() => {
    if (disposed) return;
    const container = host.querySelector('.excalidraw');
    if (!container) return;
    const style = getComputedStyle(container);
    for (const [target, source] of Object.entries({ background: '--color-surface-low', foreground: '--text-primary-color', size: '--lg-button-size', radius: '--border-radius-lg' })) {
      host.parentElement?.style.setProperty(`--visualize-control-${target}`, style.getPropertyValue(source));
    }
  });
  const themeObserver = new MutationObserver(() => {
    api?.updateScene({ appState: { theme: theme() }, captureUpdate: CaptureUpdateAction.NEVER });
    syncControlStyle();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  const resizeObserver = new ResizeObserver(() => api?.refresh());
  resizeObserver.observe(host);
  let api: ExcalidrawImperativeAPI | undefined;
  let current = scene;
  let disposed = false;
  const elements = (value: CanvasScene) => restoreElements(value.elements as unknown as ExcalidrawElement[], null, { refreshDimensions: true });
  const selected = (value: CanvasScene) => Object.fromEntries(value.selectedElementIds.map(id => [id, true as const]));
  const update = (value: CanvasScene, undoable: boolean) => {
    current = value;
    api?.addFiles(Object.values(value.files) as unknown as Parameters<ExcalidrawImperativeAPI['addFiles']>[0]);
    api?.updateScene({ elements: elements(value), appState: { selectedElementIds: selected(value) }, captureUpdate: undoable ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER });
  };
  root.render(createElement(CanvasErrorBoundary, { onError, children: createElement(Excalidraw, {
    initialData: { elements: elements(scene), files: scene.files as BinaryFiles, appState: { selectedElementIds: selected(scene), theme: theme(), viewModeEnabled: true, activeTool: { type: 'hand', customType: null, locked: false, lastActiveTool: null } }, scrollToContent: true },
    excalidrawAPI: (value: ExcalidrawImperativeAPI) => { api = value; syncControlStyle(); requestAnimationFrame(() => { if (!disposed) value.scrollToContent(undefined, { fitToContent: true }); }); },
    onChange: (items: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) => {
      if (disposed) return;
      current = { elements: items.map(element => ({ ...element, link: null })) as unknown as CanvasElement[], files, selectedElementIds: Object.keys(state.selectedElementIds).filter(id => state.selectedElementIds[id]), preview: '' };
      onChange(current);
    },
    onLinkOpen: ((_element, event) => event.preventDefault()) as ExcalidrawProps['onLinkOpen'],
    validateEmbeddable: false,
    aiEnabled: false,
    UIOptions: { canvasActions: { clearCanvas: false, loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } },
  }, createElement(MainMenu)) }));
  return {
    update,
    setEditing(editing: boolean) {
      api?.updateScene({ appState: { viewModeEnabled: !editing }, captureUpdate: CaptureUpdateAction.NEVER });
      api?.setActiveTool({ type: 'hand' });
    },
    fit() { api?.scrollToContent(undefined, { fitToContent: true }); },
    async preview(value = current): Promise<string> {
      const canvas = await exportToCanvas({ elements: elements(value), files: value.files as BinaryFiles, appState: { exportBackground: false }, maxWidthOrHeight: 1000 });
      return canvas.toDataURL('image/png');
    },
    dispose() { themeObserver.disconnect(); resizeObserver.disconnect(); disposed = true; root.unmount(); api = undefined; },
  };
}

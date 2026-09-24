import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const electronMocks = vi.hoisted(() => {
  class BrowserWindowMock {
    static instances: BrowserWindowMock[] = [];
    readonly close = vi.fn(() => {
      this.destroyed = true;
      this.listeners.get('closed')?.();
    });
    readonly focus = vi.fn();
    readonly hide = vi.fn();
    readonly loadFile = vi.fn(async (_file: string, _options?: { query: Record<string, string> }) => { this.listeners.get('ready-to-show')?.(); });
    readonly loadURL = vi.fn(async (_url: string) => { this.listeners.get('ready-to-show')?.(); });
    readonly options: Record<string, unknown>;
    readonly setBounds = vi.fn();
    readonly show = vi.fn();
    private destroyed = false;
    private readonly listeners = new Map<string, () => void>();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      BrowserWindowMock.instances.push(this);
    }

    isDestroyed = vi.fn(() => this.destroyed);
    once = vi.fn((event: string, listener: () => void) => { this.listeners.set(event, listener); });
  }

  class WebContentsMock {
    close = vi.fn(() => { this.destroyed = true; });
    executeJavaScript = vi.fn().mockResolvedValue(undefined);
    focus = vi.fn();
    getTitle = vi.fn(() => this.url ? `Title for ${this.url}` : '');
    getURL = vi.fn(() => this.url);
    isDestroyed = vi.fn(() => this.destroyed);
    loadURL = vi.fn(async (url: string) => { this.url = url; });
    on = vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      this.listeners.set(event, listener);
    });
    setWindowOpenHandler = vi.fn();
    canGoBack = vi.fn(() => false);
    canGoForward = vi.fn(() => false);
    private destroyed = false;
    private readonly listeners = new Map<string, (...args: unknown[]) => void>();
    private url = '';

    emitNavigation(event: 'will-navigate' | 'will-redirect', url: string) {
      const navigationEvent = { preventDefault: vi.fn() };
      this.listeners.get(event)?.(navigationEvent, url);
      return navigationEvent;
    }
  }

  class WebContentsViewMock {
    static instances: WebContentsViewMock[] = [];
    readonly webContents = new WebContentsMock();
    readonly setBounds = vi.fn();
    readonly setVisible = vi.fn();

    constructor() {
      WebContentsViewMock.instances.push(this);
    }
  }

  return { BrowserWindowMock, WebContentsViewMock };
});

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.BrowserWindowMock,
  WebContentsView: electronMocks.WebContentsViewMock,
}));

import { BrowserPane, browserPaneKey, normalizeBrowserUrl, readVisualizationDocument, safePartitionName } from '../browser-pane';

beforeEach(() => {
  vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5174');
  electronMocks.BrowserWindowMock.instances.length = 0;
  electronMocks.WebContentsViewMock.instances.length = 0;
});

describe('browser pane helpers', () => {
  it('normalizes a bare host into an https URL', () => {
    expect(normalizeBrowserUrl('example.com/docs')).toBe('https://example.com/docs');
    expect(normalizeBrowserUrl('http://localhost:3000')).toBe('http://localhost:3000/');
  });

  it('rejects unsafe protocols and empty addresses', () => {
    expect(() => normalizeBrowserUrl('')).toThrow('Enter a URL');
    expect(() => normalizeBrowserUrl('javascript:alert(1)')).toThrow('Only http, https, and workspace file URLs');
    expect(() => normalizeBrowserUrl('file:///Users/nicolas/.ssh/id_rsa')).toThrow('require an agent workspace');
  });

  it('opens existing workspace files while rejecting escapes and symlinks outside the workspace', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-browser-workspace-'));
    const outside = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-browser-outside-'));
    const localFile = path.join(workspace, 'preview.html');
    const outsideFile = path.join(outside, 'secret.html');
    const linkedFile = path.join(workspace, 'linked-secret.html');
    await writeFile(localFile, '<h1>Local preview</h1>');
    await writeFile(outsideFile, '<h1>Secret</h1>');
    await symlink(outsideFile, linkedFile);

    try {
      const browserWindow = {
        contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
        isDestroyed: vi.fn(() => false),
      };
      const pane = new BrowserPane({ onAnnotation: vi.fn() });
      const localUrl = pathToFileURL(localFile).toString();

      await expect(pane.open(browserWindow as never, 'agent-one', 'primary', localUrl, workspace)).resolves.toMatchObject({
        url: localUrl,
        title: `Title for ${localUrl}`,
      });
      const guest = electronMocks.WebContentsViewMock.instances[0];
      expect(guest?.webContents.loadURL).toHaveBeenCalledWith(localUrl);
      expect(() => normalizeBrowserUrl(pathToFileURL(outsideFile).toString(), workspace)).toThrow('stay inside the agent workspace');
      expect(() => normalizeBrowserUrl(pathToFileURL(linkedFile).toString(), workspace)).toThrow('stay inside the agent workspace');

      const navigation = guest?.webContents.emitNavigation('will-navigate', pathToFileURL(outsideFile).toString());
      expect(navigation?.preventDefault).toHaveBeenCalledOnce();
    } finally {
      await Promise.all([
        rm(workspace, { recursive: true, force: true }),
        rm(outside, { recursive: true, force: true }),
      ]);
    }
  });

  it('opens a bounded external visualization as a sandboxed data document without weakening file navigation', async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-visualization-'));
    const visualizationPath = path.join(scratch, 'chart.html');
    const outsideFile = path.join(scratch, 'secret.txt');
    await writeFile(visualizationPath, '<section id="chart">Chart</section><script>document.body.dataset.ready = "yes"</script>');
    await writeFile(outsideFile, 'secret');

    try {
      const browserWindow = {
        contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
        isDestroyed: vi.fn(() => false),
      };
      const pane = new BrowserPane({ onAnnotation: vi.fn() });

      await expect(pane.openVisualization(
        browserWindow as never,
        'agent-one',
        'primary',
        visualizationPath,
        'Interactive chart',
      )).resolves.toStrictEqual({
        url: '',
        title: 'Interactive chart',
        canGoBack: false,
        canGoForward: false,
      });

      const guest = electronMocks.WebContentsViewMock.instances[0];
      const loadedUrl = guest?.webContents.loadURL.mock.calls[0]?.[0] as string;
      expect(loadedUrl).toMatch(/^data:text\/html;base64,/u);
      const document = Buffer.from(loadedUrl.slice(loadedUrl.indexOf(',') + 1), 'base64').toString('utf8');
      expect(document).toContain('Content-Security-Policy');
      expect(document).toContain("connect-src 'none'");
      expect(document).toContain('<section id="chart">Chart</section>');
      expect(guest?.webContents.emitNavigation('will-navigate', pathToFileURL(outsideFile).toString()).preventDefault).toHaveBeenCalledOnce();
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it('rejects non-HTML, symlinked, and oversized visualization files', async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-visualization-invalid-'));
    const textPath = path.join(scratch, 'notes.txt');
    const htmlPath = path.join(scratch, 'large.html');
    const linkedPath = path.join(scratch, 'linked.html');
    await writeFile(textPath, 'not html');
    await writeFile(htmlPath, 'x'.repeat(1_048_577));
    await symlink(htmlPath, linkedPath);

    try {
      await expect(readVisualizationDocument(textPath, 'Notes')).rejects.toThrow('must be HTML');
      await expect(readVisualizationDocument(linkedPath, 'Linked')).rejects.toThrow('unavailable');
      await expect(readVisualizationDocument(htmlPath, 'Large')).rejects.toThrow('1 MB');
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });

  it('uses a safe, stable profile partition name for each agent', () => {
    expect(safePartitionName('agent:/one')).toBe('agent--one');
    expect(safePartitionName('')).toBe('default');
  });

  it('keeps independent browser views for each agent and browser id', async () => {
    const browserWindow = {
      contentView: {
        addChildView: vi.fn(),
        removeChildView: vi.fn(),
      },
      isDestroyed: vi.fn(() => false),
    };
    const pane = new BrowserPane({ onAnnotation: vi.fn() });

    await pane.open(browserWindow as never, 'agent-one', 'primary', 'https://one.example', '/tmp/project');
    await pane.open(browserWindow as never, 'agent-one', 'secondary', 'https://two.example', '/tmp/project');

    const [primary, secondary] = electronMocks.WebContentsViewMock.instances;
    expect(browserWindow.contentView.addChildView).toHaveBeenCalledTimes(2);
    expect(primary?.webContents.close).not.toHaveBeenCalled();
    pane.setVisible('agent-one', 'primary', true);
    pane.setVisible('agent-one', 'secondary', false);
    expect(primary?.setVisible).toHaveBeenLastCalledWith(true);
    expect(secondary?.setVisible).toHaveBeenLastCalledWith(false);

    await pane.close('agent-one', 'primary');

    expect(primary?.webContents.close).toHaveBeenCalledOnce();
    expect(secondary?.webContents.close).not.toHaveBeenCalled();
    await expect(pane.execute('agent-one', 'secondary', 'console', {})).resolves.toStrictEqual({ messages: [] });
  });

  it('does not uncover a hidden browser view during a later bounds update', async () => {
    const browserWindow = {
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
      isDestroyed: vi.fn(() => false),
    };
    const pane = new BrowserPane({ onAnnotation: vi.fn() });
    await pane.open(browserWindow as never, 'agent-one', 'primary', 'https://example.com', '/tmp/project');
    pane.setBounds('agent-one', 'primary', { x: 100, y: 50, width: 600, height: 500 });
    pane.setVisible('agent-one', 'primary', false);
    pane.setBounds('agent-one', 'primary', { x: 120, y: 60, width: 580, height: 480 });

    const guest = electronMocks.WebContentsViewMock.instances[0];
    expect(guest?.setBounds).toHaveBeenLastCalledWith({ x: 120, y: 60, width: 580, height: 480 });
    expect(guest?.setVisible).toHaveBeenLastCalledWith(false);
  });

  it('uses collision-safe keys for future multiple browser tabs', () => {
    expect(browserPaneKey('agent:a', 'browser')).not.toBe(browserPaneKey('agent', 'a:browser'));
  });

  it('hosts the extracted annotation popup over the full browser view', async () => {
    const onAnnotation = vi.fn();
    const browserWindow = {
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
      getContentBounds: vi.fn(() => ({ x: 10, y: 20, width: 1200, height: 800 })),
      isDestroyed: vi.fn(() => false),
    };
    const pane = new BrowserPane({ onAnnotation });
    await pane.open(browserWindow as never, 'agent-one', 'primary', 'https://one.example', '/tmp/project');
    pane.setBounds('agent-one', 'primary', { x: 100, y: 50, width: 600, height: 500 });
    const guest = electronMocks.WebContentsViewMock.instances[0];
    guest?.webContents.executeJavaScript.mockResolvedValueOnce({
      id: 'annotation-one',
      kind: 'element',
      selector: '#save',
      label: 'Save',
      rect: { x: 30, y: 40, width: 100, height: 30 },
    });

    await pane.setAnnotationMode('agent-one', 'primary', true);
    await vi.waitFor(() => expect(electronMocks.BrowserWindowMock.instances).toHaveLength(1));
    const overlay = electronMocks.BrowserWindowMock.instances[0];
    await vi.waitFor(() => expect((overlay?.loadFile.mock.calls.length ?? 0) + (overlay?.loadURL.mock.calls.length ?? 0)).toBe(1));
    expect(overlay?.options).toMatchObject({ x: 110, y: 70, width: 600, height: 500, transparent: true, frame: false });
    expect(guest?.setBounds).toHaveBeenLastCalledWith({ x: 100, y: 50, width: 600, height: 500 });
    const script = guest?.webContents.executeJavaScript.mock.calls[0]?.[0] as string;
    expect(script).not.toContain("document.createElement('form')");
    const query = new URL(overlay?.loadURL.mock.calls[0]?.[0] ?? 'http://localhost').searchParams;
    expect(JSON.parse(query.get('anchor') ?? '')).toStrictEqual({ x: 30, y: 40, width: 100, height: 30 });
    const token = query.get('token');
    expect(token).toBeTruthy();

    pane.resolveAnnotation(token!, 'Keep this compact.');
    await vi.waitFor(() => expect(onAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      id: 'annotation-one',
      agentId: 'agent-one',
      browserId: 'primary',
      comment: 'Keep this compact.',
    })));
  });

  it('restores browser capture after the annotation popup is cancelled', async () => {
    const onAnnotation = vi.fn();
    const browserWindow = {
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
      getContentBounds: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
      isDestroyed: vi.fn(() => false),
    };
    const pane = new BrowserPane({ onAnnotation });
    await pane.open(browserWindow as never, 'agent-one', 'primary', 'https://one.example', '/tmp/project');
    pane.setBounds('agent-one', 'primary', { x: 0, y: 0, width: 800, height: 600 });
    const guest = electronMocks.WebContentsViewMock.instances[0];
    guest?.webContents.executeJavaScript.mockResolvedValueOnce({
      id: 'annotation-one',
      kind: 'element',
      selector: '#save',
      label: 'Save',
      rect: { x: 30, y: 40, width: 100, height: 30 },
    });

    await pane.setAnnotationMode('agent-one', 'primary', true);
    await vi.waitFor(() => expect(electronMocks.BrowserWindowMock.instances).toHaveLength(1));
    const overlay = electronMocks.BrowserWindowMock.instances[0];
    await vi.waitFor(() => expect((overlay?.loadFile.mock.calls.length ?? 0) + (overlay?.loadURL.mock.calls.length ?? 0)).toBe(1));
    const query = new URL(overlay?.loadURL.mock.calls[0]?.[0] ?? 'http://localhost').searchParams;

    pane.resolveAnnotation(query.get('token')!, null);

    await vi.waitFor(() => expect(guest?.webContents.executeJavaScript).toHaveBeenCalledTimes(2));
    expect(guest?.webContents.focus).toHaveBeenCalledTimes(2);
    expect(onAnnotation).not.toHaveBeenCalled();
  });
});

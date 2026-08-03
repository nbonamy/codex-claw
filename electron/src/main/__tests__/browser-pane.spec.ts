import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    on = vi.fn();
    setWindowOpenHandler = vi.fn();
    canGoBack = vi.fn(() => false);
    canGoForward = vi.fn(() => false);
    private destroyed = false;
    private url = '';
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

import { BrowserPane, browserPaneKey, normalizeBrowserUrl, safePartitionName } from '../browser-pane';

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
    expect(() => normalizeBrowserUrl('file:///Users/nicolas/.ssh/id_rsa')).toThrow('Only http and https');
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

    await pane.open(browserWindow as never, 'agent-one', 'primary', 'https://one.example');
    await pane.open(browserWindow as never, 'agent-one', 'secondary', 'https://two.example');

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
    await pane.open(browserWindow as never, 'agent-one', 'primary', 'https://one.example');
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
    await pane.open(browserWindow as never, 'agent-one', 'primary', 'https://one.example');
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

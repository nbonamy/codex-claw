import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => {
  class WebContentsMock {
    close = vi.fn(() => { this.destroyed = true; });
    executeJavaScript = vi.fn().mockResolvedValue(undefined);
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

  return { WebContentsViewMock };
});

vi.mock('electron', () => ({ WebContentsView: electronMocks.WebContentsViewMock }));

import { BrowserPane, browserPaneKey, normalizeBrowserUrl, safePartitionName } from '../browser-pane';

beforeEach(() => {
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
});

import { BrowserWindow, WebContentsView } from 'electron';
import path from 'node:path';
import type { BrowserAnnotation, BrowserBounds, BrowserState } from '@codex-claw/core/contracts';

type BrowserPaneOptions = {
  onAnnotation(annotation: BrowserAnnotation): void;
};

type HostedBrowserPane = {
  agentId: string;
  annotationEnabled: boolean;
  annotationOverlay: BrowserWindow | null;
  annotationRequest: Promise<void> | null;
  annotationResolve: ((comment: string | null) => void) | null;
  annotationToken: string | null;
  bounds: BrowserBounds;
  browserId: string;
  browserWindow: BrowserWindow;
  consoleMessages: Array<{ level: string; message: string; timestamp: string }>;
  view: WebContentsView;
};

/**
 * Hosts untrusted web content in a native child view. The renderer only gets a
 * narrow navigation and annotation API; it never receives the guest WebContents.
 */
export class BrowserPane {
  private readonly panes = new Map<string, HostedBrowserPane>();

  constructor(private readonly options: BrowserPaneOptions) {}

  async open(browserWindow: BrowserWindow, agentId: string, browserId: string, url: string): Promise<BrowserState> {
    await this.close(agentId, browserId);
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: `persist:codex-claw-browser-${safePartitionName(agentId)}`,
      },
    });
    const pane: HostedBrowserPane = {
      agentId,
      annotationEnabled: false,
      annotationOverlay: null,
      annotationRequest: null,
      annotationResolve: null,
      annotationToken: null,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      browserId,
      browserWindow,
      consoleMessages: [],
      view,
    };
    this.panes.set(browserPaneKey(agentId, browserId), pane);
    browserWindow.contentView.addChildView(view);
    view.setVisible(false);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.on('console-message', (_event, level, message) => {
      pane.consoleMessages.push({ level: String(level), message, timestamp: new Date().toISOString() });
      if (pane.consoleMessages.length > 100) pane.consoleMessages.shift();
    });
    if (url.trim()) return this.navigate(agentId, browserId, url);
    await view.webContents.loadURL('about:blank');
    return { ...this.state(pane), url: '', title: '' };
  }

  async navigate(agentId: string, browserId: string, url: string): Promise<BrowserState> {
    const target = normalizeBrowserUrl(url);
    const pane = this.requirePane(agentId, browserId);
    await pane.view.webContents.loadURL(target);
    return this.state(pane);
  }

  async goBack(agentId: string, browserId: string): Promise<BrowserState> {
    const pane = this.requirePane(agentId, browserId);
    const webContents = pane.view.webContents;
    if (webContents.canGoBack()) webContents.goBack();
    return this.waitForNavigation(pane);
  }

  async goForward(agentId: string, browserId: string): Promise<BrowserState> {
    const pane = this.requirePane(agentId, browserId);
    const webContents = pane.view.webContents;
    if (webContents.canGoForward()) webContents.goForward();
    return this.waitForNavigation(pane);
  }

  async reload(agentId: string, browserId: string): Promise<BrowserState> {
    const pane = this.requirePane(agentId, browserId);
    const webContents = pane.view.webContents;
    webContents.reload();
    return this.waitForNavigation(pane);
  }

  setBounds(agentId: string, browserId: string, bounds: BrowserBounds): void {
    const pane = this.requirePane(agentId, browserId);
    pane.bounds = {
      x: Math.max(0, Math.round(bounds.x)),
      y: Math.max(0, Math.round(bounds.y)),
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    };
    pane.view.setBounds(pane.bounds);
    pane.view.setVisible(true);
    this.syncAnnotationOverlayBounds(pane);
  }

  setVisible(agentId: string, browserId: string, visible: boolean): void {
    const pane = this.requirePane(agentId, browserId);
    pane.view.setVisible(visible);
    if (pane.annotationOverlay && !pane.annotationOverlay.isDestroyed()) {
      if (visible) pane.annotationOverlay.show();
      else pane.annotationOverlay.hide();
    }
  }

  async setAnnotationMode(agentId: string, browserId: string, enabled: boolean): Promise<void> {
    const pane = this.requirePane(agentId, browserId);
    pane.annotationEnabled = enabled;
    if (!enabled) {
      await this.cancelAnnotationMode(pane);
      return;
    }

    this.startAnnotationCapture(pane);
  }

  private startAnnotationCapture(pane: HostedBrowserPane): void {
    if (!pane.annotationEnabled || pane.annotationRequest || pane.annotationOverlay) return;

    const webContents = pane.view.webContents;
    if (webContents.isDestroyed()) return;
    webContents.focus();
    let resumeAfterPopup = false;
    const request = webContents.executeJavaScript(annotationCaptureScript(), true)
      .then(async (value: unknown) => {
        const annotation = parseAnnotation(value, webContents.getURL());
        if (!annotation) return;
        resumeAfterPopup = true;
        const comment = await this.openAnnotationOverlay(pane, annotation);
        if (!comment) return;
        this.options.onAnnotation({
          ...annotation,
          comment,
          agentId: pane.agentId,
          browserId: pane.browserId,
        });
      })
      .catch(() => {
        resumeAfterPopup = false;
        this.finishAnnotationOverlay(pane, null);
      })
      .finally(() => {
        if (pane.annotationRequest === request) pane.annotationRequest = null;
        if (resumeAfterPopup && pane.annotationEnabled) this.startAnnotationCapture(pane);
      });
    pane.annotationRequest = request;
  }

  resolveAnnotation(token: string, comment: string | null): void {
    const pane = [...this.panes.values()].find((candidate) => candidate.annotationToken === token);
    if (!pane) return;
    this.finishAnnotationOverlay(pane, typeof comment === 'string' ? comment.trim() || null : null);
  }

  async clearAnnotations(agentId: string, browserId: string): Promise<void> {
    this.requirePane(agentId, browserId);
  }

  async close(agentId: string, browserId: string): Promise<void> {
    const key = browserPaneKey(agentId, browserId);
    const pane = this.panes.get(key);
    if (!pane) return;
    await this.cancelAnnotationMode(pane);
    if (!pane.browserWindow.isDestroyed()) {
      pane.browserWindow.contentView.removeChildView(pane.view);
    }
    if (!pane.view.webContents.isDestroyed()) {
      pane.view.webContents.close();
    }
    this.panes.delete(key);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.panes.values()].map((pane) => this.close(pane.agentId, pane.browserId)));
  }

  async execute(agentId: string, browserId: string, command: string, arguments_: Record<string, unknown>): Promise<unknown> {
    const pane = this.requirePane(agentId, browserId);
    const webContents = pane.view.webContents;
    if (command === 'screenshot') {
      const image = await webContents.capturePage();
      return { mimeType: 'image/png', data: image.toPNG().toString('base64') };
    }
    if (command === 'console') return { messages: pane.consoleMessages.slice(-(typeof arguments_.limit === 'number' ? arguments_.limit : 50)) };
    const selector = typeof arguments_.selector === 'string' ? arguments_.selector : undefined;
    const payload = JSON.stringify({ command, selector, text: typeof arguments_.text === 'string' ? arguments_.text : '', clear: arguments_.clear !== false, deltaY: typeof arguments_.deltaY === 'number' ? arguments_.deltaY : 500 });
    return webContents.executeJavaScript(`(() => {
      const input = ${payload}; const root = input.selector ? document.querySelector(input.selector) : document.body;
      if (!root) throw new Error('No element matches selector: ' + input.selector);
      const describe = (element) => { const rect = element.getBoundingClientRect(); return { tag: element.tagName.toLowerCase(), text: (element.innerText || element.getAttribute('aria-label') || element.textContent || '').trim().slice(0, 4000), html: element.outerHTML.slice(0, 12000), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }; };
      if (input.command === 'dom') return { url: location.href, title: document.title, selector: input.selector || 'body', element: describe(root) };
      if (input.command === 'click') { root.focus?.(); root.click?.(); return { clicked: input.selector }; }
      if (input.command === 'type') { if (!('value' in root)) throw new Error('Selected element is not editable.'); root.focus(); if (input.clear) root.value = ''; root.value += input.text; root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: input.text })); root.dispatchEvent(new Event('change', { bubbles: true })); return { typed: input.text.length, selector: input.selector }; }
      if (input.command === 'scroll') { (input.selector ? root : window).scrollBy({ top: input.deltaY, behavior: 'instant' }); return { scrolled: input.deltaY, selector: input.selector || 'window' }; }
      throw new Error('Unsupported browser command.');
    })()`, true);
  }

  private async cancelAnnotationMode(pane: HostedBrowserPane): Promise<void> {
    pane.annotationEnabled = false;
    this.finishAnnotationOverlay(pane, null);
    if (pane.view.webContents.isDestroyed()) return;
    await pane.view.webContents.executeJavaScript('window.__codexClawCancelAnnotation?.()', true).catch(() => undefined);
  }

  private async openAnnotationOverlay(
    pane: HostedBrowserPane,
    annotation: Omit<BrowserAnnotation, 'agentId' | 'browserId'>,
  ): Promise<string | null> {
    this.finishAnnotationOverlay(pane, null);
    const token = crypto.randomUUID();
    const overlay = new BrowserWindow({
      parent: pane.browserWindow,
      ...this.annotationOverlayBounds(pane),
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    pane.annotationOverlay = overlay;
    pane.annotationToken = token;
    const completion = new Promise<string | null>((resolve) => {
      pane.annotationResolve = resolve;
    });

    overlay.once('ready-to-show', () => {
      if (overlay.isDestroyed()) return;
      overlay.show();
      overlay.focus();
    });
    overlay.once('closed', () => {
      if (pane.annotationOverlay === overlay) this.finishAnnotationOverlay(pane, null, false);
    });

    const query = {
      surface: 'annotation-overlay',
      token,
      anchor: JSON.stringify(annotation.rect),
      description: annotation.label ?? annotation.selector ?? 'Selected page area',
    };
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const target = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
      await overlay.loadURL(target.toString());
    } else {
      await overlay.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { query });
    }
    return completion;
  }

  private finishAnnotationOverlay(pane: HostedBrowserPane, comment: string | null, closeWindow = true): void {
    const resolve = pane.annotationResolve;
    const overlay = pane.annotationOverlay;
    pane.annotationResolve = null;
    pane.annotationOverlay = null;
    pane.annotationToken = null;
    if (closeWindow && overlay && !overlay.isDestroyed()) overlay.close();
    resolve?.(comment);
  }

  private syncAnnotationOverlayBounds(pane: HostedBrowserPane): void {
    const overlay = pane.annotationOverlay;
    if (!overlay || overlay.isDestroyed()) return;
    overlay.setBounds(this.annotationOverlayBounds(pane));
  }

  private annotationOverlayBounds(pane: HostedBrowserPane): BrowserBounds {
    const contentBounds = pane.browserWindow.getContentBounds();
    return {
      x: contentBounds.x + pane.bounds.x,
      y: contentBounds.y + pane.bounds.y,
      width: pane.bounds.width,
      height: pane.bounds.height,
    };
  }

  private async waitForNavigation(pane: HostedBrowserPane): Promise<BrowserState> {
    const webContents = pane.view.webContents;
    if (webContents.isLoading()) {
      await new Promise<void>((resolve) => webContents.once('did-finish-load', () => resolve()));
    }
    return this.state(pane);
  }

  private state(pane: HostedBrowserPane): BrowserState {
    const webContents = pane.view.webContents;
    return {
      url: webContents.getURL(),
      title: webContents.getTitle(),
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
    };
  }

  private requirePane(agentId: string, browserId: string): HostedBrowserPane {
    const pane = this.panes.get(browserPaneKey(agentId, browserId));
    if (!pane || pane.view.webContents.isDestroyed()) throw new Error('Browser is not open.');
    return pane;
  }
}

export function browserPaneKey(agentId: string, browserId: string): string {
  return JSON.stringify([agentId, browserId]);
}

export function normalizeBrowserUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter a URL to open.');
  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs can be opened in the browser.');
  }
  return parsed.toString();
}

export function safePartitionName(agentId: string): string {
  return agentId.replace(/[^a-zA-Z\d_-]/g, '-').slice(0, 80) || 'default';
}

function parseAnnotation(value: unknown, url: string): Omit<BrowserAnnotation, 'agentId' | 'browserId'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const rect = record.rect;
  if ((record.kind !== 'element' && record.kind !== 'area') || !rect || typeof rect !== 'object' || Array.isArray(rect)) return null;
  const bounds = rect as Record<string, unknown>;
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every((entry) => typeof entry === 'number' && Number.isFinite(entry))) return null;
  return {
    id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
    url,
    kind: record.kind,
    ...(typeof record.selector === 'string' ? { selector: record.selector } : {}),
    ...(typeof record.label === 'string' ? { label: record.label } : {}),
    ...(typeof record.comment === 'string' ? { comment: record.comment } : {}),
    rect: { x: bounds.x as number, y: bounds.y as number, width: bounds.width as number, height: bounds.height as number },
  };
}

function annotationCaptureScript(): string {
  return `(() => new Promise((resolve) => {
    window.__codexClawCancelAnnotation?.();
    const style = document.createElement('style');
    style.textContent = '* { cursor: crosshair !important; }';
    document.documentElement.append(style);
    const highlight = document.createElement('div');
    highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:3px solid #0a84ff;background:rgba(10,132,255,.18);box-sizing:border-box;display:none;';
    document.documentElement.append(highlight);
    let start = null;
    let hovered = null;
    const selectorFor = (element) => {
      if (element.id) return '#' + CSS.escape(element.id);
      const parts = [];
      let node = element;
      while (node && node.nodeType === 1 && parts.length < 5) {
        let part = node.tagName.toLowerCase();
        if (node.classList.length) part += '.' + [...node.classList].slice(0, 2).map(CSS.escape).join('.');
        const siblings = node.parentElement ? [...node.parentElement.children].filter((child) => child.tagName === node.tagName) : [];
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };
    const cleanup = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mouseup', onUp, true);
      style.remove();
      highlight.remove();
      delete window.__codexClawCancelAnnotation;
    };
    const finish = (value) => { cleanup(); resolve(value); };
    const showHighlight = (rect) => {
      highlight.style.display = 'block';
      highlight.style.left = rect.x + 'px'; highlight.style.top = rect.y + 'px';
      highlight.style.width = rect.width + 'px'; highlight.style.height = rect.height + 'px';
    };
    const onMove = (event) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element) return;
      hovered = element;
      showHighlight(element.getBoundingClientRect());
    };
    const onDown = (event) => { event.preventDefault(); event.stopPropagation(); start = { x: event.clientX, y: event.clientY }; };
    const onUp = (event) => {
      event.preventDefault(); event.stopPropagation();
      const origin = start || { x: event.clientX, y: event.clientY };
      const dx = Math.abs(event.clientX - origin.x); const dy = Math.abs(event.clientY - origin.y);
      if (dx > 6 || dy > 6) {
        finish({ kind: 'area', rect: { x: Math.min(origin.x, event.clientX), y: Math.min(origin.y, event.clientY), width: dx, height: dy } });
        return;
      }
      const element = hovered || document.elementFromPoint(event.clientX, event.clientY);
      if (!element) return finish(null);
      const rect = element.getBoundingClientRect();
      finish({ kind: 'element', selector: selectorFor(element), label: (element.getAttribute('aria-label') || element.innerText || element.textContent || element.tagName).trim().slice(0, 160), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
    };
    window.__codexClawCancelAnnotation = () => finish(null);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('mouseup', onUp, true);
  }))()`;
}

import { describe, expect, it, vi } from 'vitest';
import { AppController, requiresSingleInstanceLock, shouldBlockDisplaySleep } from '../app-controller';
import { createInitialSnapshot, snapshotMetadata } from '@codex-claw/core/snapshot';
import type { AddSshConnectionInput, AgentFilePreviewResult, AgentFileSearchItem, AppSnapshot, BackendConversationRef, BrowserAnnotation, BrowserState, ClientRequestResponse, CloneSourceRepositoryInput, CodexAuthentication, CodexChatGptLogin, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, ClientState, DevicePairingSession, DevicePairingStatus, DuplicateAgentOptions, Automation, AutomationLocation, MainToRendererEvent, MoveAgentToTeamInput, PairedDevice, RendererMessage, RendererSendPromptOptions, RendererSnapshotState, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, SetCodexResourceSharingInput, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, SystemPermissionsStatus, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderConnectResult, WorkProviderKind } from '@codex-claw/core/contracts';
import type { ClawBackendEvent } from '@codex-claw/core/backend-protocol/rpc';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { ipcChannels } from '@codex-claw/core/ipc';
import type { OpenInProvider } from '../open-in';
import { setMainWindowSend, createBackendClient } from './app-controller-test-harness';

describe('AppController', () => {

  it('routes the Debug message fixture to the active agent through clawd', async () => {
    const request = vi.fn().mockResolvedValue({ recipientId: 'agent-dina' });
    const controller = new AppController(createInitialSnapshot(), createBackendClient({ request }));
    const options = (controller as unknown as {
      debugMenuOptions(): { sendDebugAgentMessage(): void };
    }).debugMenuOptions();

    options.sendDebugAgentMessage();

    await vi.waitFor(() => expect(request).toHaveBeenCalledWith(
      backendMethods.debugAgentMessageSend,
      { agentId: 'agent-dina' },
    ));
  });

  it('queues valid deep links until the renderer is ready, then focuses and dispatches them', () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const send = vi.fn();
    const show = vi.fn();
    const focus = vi.fn();
    setDeepLinkWindow(controller, { send, show, focus });

    expect(controller.openDeepLink('codex-claw://new?prompt=Measure%20this')).toBe(true);
    expect(controller.openDeepLink('https://example.com')).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();

    (controller as unknown as { rendererReady: boolean }).rendererReady = true;
    (controller as unknown as { flushPendingDeepLinkCommands(): void }).flushPendingDeepLinkCommands();

    expect(send).toHaveBeenCalledWith('app:command', {
      type: 'open-agent-composer',
      prompt: 'Measure this',
      submit: true,
    });
  });

  it('waits for the renderer browser pane to load a model-requested URL', async () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const send = vi.fn();
    setMainWindowSend(controller, send);
    const state = {
      url: 'https://example.com/',
      title: 'Example',
      canGoBack: false,
      canGoForward: false,
    };

    const opened = requestBrowserOpen(controller, 'agent-dina', 'primary', 'https://example.com');

    expect(send).toHaveBeenCalledWith('app:command', {
      type: 'open-browser',
      agentId: 'agent-dina',
      browserId: 'primary',
      url: 'https://example.com',
    });
    resolvePendingBrowserOpen(controller, 'agent-dina', 'primary', state);
    await expect(opened).resolves.toStrictEqual(state);
  });

  it('scopes in-app browser files to the owning agent folder', async () => {
    const controller = new AppController(createInitialSnapshot(), null);
    setMainWindowSend(controller, vi.fn());
    const state: BrowserState = {
      url: 'file:///Users/nbonamy/src/codex-claw/README.md',
      title: 'README.md',
      canGoBack: false,
      canGoForward: false,
    };
    const browserPane = (controller as unknown as {
      browserPane: { open: ReturnType<typeof vi.fn> };
    }).browserPane;
    const open = vi.spyOn(browserPane, 'open').mockResolvedValue(state);

    await expect(openBrowser(controller, 'agent-dina', 'primary', state.url)).resolves.toStrictEqual(state);
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      'agent-dina',
      'primary',
      state.url,
      '~/src/codex-claw',
    );
  });

  it('opens visualization documents through the dedicated browser boundary', async () => {
    const controller = new AppController(createInitialSnapshot(), null);
    setMainWindowSend(controller, vi.fn());
    const state: BrowserState = {
      url: '',
      title: 'Backlog icon candidates',
      canGoBack: false,
      canGoForward: false,
    };
    const browserPane = (controller as unknown as {
      browserPane: { openVisualization: ReturnType<typeof vi.fn> };
    }).browserPane;
    const openVisualization = vi.spyOn(browserPane, 'openVisualization').mockResolvedValue(state);

    await expect(openBrowserVisualization(
      controller,
      'agent-dina',
      'primary',
      '/tmp/backlog-icon-candidates.html',
      'Backlog icon candidates',
    )).resolves.toStrictEqual(state);
    expect(openVisualization).toHaveBeenCalledWith(
      expect.anything(),
      'agent-dina',
      'primary',
      '/tmp/backlog-icon-candidates.html',
      'Backlog icon candidates',
    );
  });

  it('emits native browser annotations as client-scoped renderer events', () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const send = vi.fn();
    const annotation: BrowserAnnotation = {
      id: 'annotation-one',
      agentId: 'agent-dina',
      browserId: 'primary',
      url: 'https://example.com/',
      kind: 'element',
      selector: '#save',
      comment: 'Keep this compact.',
      rect: { x: 30, y: 40, width: 100, height: 30 },
    };
    setMainWindowSend(controller, send);

    (controller as unknown as {
      emitBrowserAnnotation(annotation: BrowserAnnotation): void;
    }).emitBrowserAnnotation(annotation);

    expect(send).toHaveBeenCalledWith(ipcChannels.event, {
      seq: 1,
      source: 'client',
      type: 'browser.annotationCreated',
      payload: annotation,
      occurredAt: expect.any(String),
    });
  });

  it('tracks concurrent browser opens independently by agent and browser id', async () => {
    const controller = new AppController(createInitialSnapshot(), null);
    const send = vi.fn();
    setMainWindowSend(controller, send);
    const firstState = { url: 'https://one.example/', title: 'One', canGoBack: false, canGoForward: false };
    const secondState = { url: 'https://two.example/', title: 'Two', canGoBack: false, canGoForward: false };

    const first = requestBrowserOpen(controller, 'agent-dina', 'primary', 'https://one.example');
    const second = requestBrowserOpen(controller, 'agent-jesse', 'primary', 'https://two.example');
    resolvePendingBrowserOpen(controller, 'agent-jesse', 'primary', secondState);
    resolvePendingBrowserOpen(controller, 'agent-dina', 'primary', firstState);

    await expect(first).resolves.toStrictEqual(firstState);
    await expect(second).resolves.toStrictEqual(secondState);
    expect(send).toHaveBeenCalledTimes(2);
  });
});

function setDeepLinkWindow(
  controller: AppController,
  callbacks: { send(...args: unknown[]): void; show(): void; focus(): void },
): void {
  (controller as unknown as {
    mainWindow: {
      isDestroyed(): boolean;
      isMinimized(): boolean;
      restore(): void;
      show(): void;
      focus(): void;
      webContents: { send(...args: unknown[]): void };
    };
  }).mainWindow = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: vi.fn(),
    show: callbacks.show,
    focus: callbacks.focus,
    webContents: { send: callbacks.send },
  };
}

function requestBrowserOpen(controller: AppController, agentId: string, browserId: string, url: string) {
  return (controller as unknown as {
    requestBrowserOpen(agentId: string, browserId: string, url: string): Promise<unknown>;
  }).requestBrowserOpen(agentId, browserId, url);
}

function openBrowser(controller: AppController, agentId: string, browserId: string, url: string): Promise<BrowserState> {
  return (controller as unknown as {
    browserOpen(agentId: string, browserId: string, url: string): Promise<BrowserState>;
  }).browserOpen(agentId, browserId, url);
}

function openBrowserVisualization(
  controller: AppController,
  agentId: string,
  browserId: string,
  filePath: string,
  title: string,
): Promise<BrowserState> {
  return (controller as unknown as {
    browserOpenVisualization(
      agentId: string,
      browserId: string,
      filePath: string,
      title: string,
    ): Promise<BrowserState>;
  }).browserOpenVisualization(agentId, browserId, filePath, title);
}

function resolvePendingBrowserOpen(controller: AppController, agentId: string, browserId: string, state: BrowserState): void {
  (controller as unknown as {
    resolvePendingBrowserOpen(agentId: string, browserId: string, state: BrowserState): void;
  }).resolvePendingBrowserOpen(agentId, browserId, state);
}

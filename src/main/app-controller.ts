import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { sendAgentPrompt } from './agent-chat-service';
import { CodexAgentSessionManager } from './codex/agent-session';
import { CodexProcessTransport } from './codex/process-transport';
import { CodexRpcClient } from './codex/rpc-client';
import { warnMain } from './log';
import { createMainWindow } from './main-window';
import { ClawMcpAgentCoordinator } from './mcp/agent-coordinator';
import { CHECK_INBOX_PROMPT } from './mcp/agent-prompts';
import { buildCodexClawMcpConfigOverrides } from './mcp/codex-config';
import { ClawMcpHttpServer } from './mcp/http-server';
import {
  applyMainEventToSnapshot,
  createAgentInSnapshot,
  createInitialSnapshot,
  selectAgent,
  updateAgentFromInput,
  updateAgentFolder,
} from './snapshot-service';
import { AppStatePersistence } from './state-persistence';
import type { AppSnapshot, ClientRequestResponse, CreateAgentInput, MainToRendererEvent, SendPromptOptions, UpdateAgentInput } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private snapshot = createInitialSnapshot();
  private readonly persistence: AppStatePersistence;
  private readonly notifiedInboxMessageIds = new Map<string, string>();
  private readonly mcpCoordinator = new ClawMcpAgentCoordinator({
    getAgents: () => this.snapshot.agents,
    onAgentUpdated: (agent) => {
      this.emitAndApply({
        agentId: agent.id,
        type: 'agent.updated',
        payload: agent,
      });
    },
    onInboxMessage: (agentId, messageId) => {
      this.promptAgentToCheckInbox(agentId, messageId);
    },
  });
  private mcpServer: ClawMcpHttpServer | null = null;
  private mcpServerUrl: string | null = null;
  private mcpServerStartPromise: Promise<string> | null = null;
  private codexSessionManager: CodexAgentSessionManager | null = null;
  private seq = 0;

  constructor(persistence = new AppStatePersistence(path.join(app.getPath('userData'), 'state.json'))) {
    this.persistence = persistence;
  }

  async initialize(): Promise<void> {
    this.snapshot = await this.persistence.load();
  }

  registerIpcHandlers(): void {
    ipcMain.handle(ipcChannels.getSnapshot, () => this.snapshot);

    ipcMain.handle(ipcChannels.listCodexModels, async () => {
      return (await this.getCodexSessionManager()).listModels();
    });

    ipcMain.handle(ipcChannels.chooseAgentFolder, async () => {
      return this.chooseAgentFolder();
    });

    ipcMain.handle(ipcChannels.createAgent, async (_event, input: CreateAgentInput) => {
      await this.validateAgentInput(input);
      createAgentInSnapshot(this.snapshot, input);
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.updateAgent, async (_event, input: UpdateAgentInput) => {
      await this.validateAgentInput(input);
      const agent = updateAgentFromInput(this.snapshot, input);
      if (!agent) {
        throw new Error(`Agent not found: ${input.id}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.selectAgent, async (_event, agentId: string) => {
      const snapshot = selectAgent(this.snapshot, agentId);
      await this.persistSnapshot();
      return snapshot;
    });

    ipcMain.handle(ipcChannels.selectAgentFolder, async (_event, agentId: string) => {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select agent folder',
      });

      if (result.canceled || !result.filePaths[0]) {
        return null;
      }

      updateAgentFolder(this.snapshot, agentId, result.filePaths[0]);
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.sendPrompt, (_event, agentId: string, prompt: string, options?: SendPromptOptions) => {
      return this.sendPrompt(agentId, prompt, options);
    });

    ipcMain.handle(ipcChannels.respondToClientRequest, async (_event, response: ClientRequestResponse) => {
      if (!this.codexSessionManager) {
        throw new Error('No active Codex session can receive this client response.');
      }

      await this.codexSessionManager.respondToClientRequest(response);
      return this.snapshot;
    });
  }

  createWindow(): void {
    this.mainWindow = createMainWindow();
  }

  async shutdown(): Promise<void> {
    await this.codexSessionManager?.close();
    await this.mcpServer?.stop();
  }

  private async sendPrompt(agentId: string, prompt: string, options?: SendPromptOptions): Promise<AppSnapshot> {
    return sendAgentPrompt(this.snapshot, await this.getCodexSessionManager(), agentId, prompt, options, (event) => {
      this.emitAndApply(event);
    });
  }

  private async chooseAgentFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select agent folder',
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  private async validateAgentInput(input: Pick<CreateAgentInput, 'name' | 'folder'>): Promise<void> {
    if (!input.name.trim()) {
      throw new Error('Agent name is required.');
    }

    const folder = input.folder.trim();
    if (!folder) {
      throw new Error('Agent folder is required.');
    }

    const folderStat = await stat(folder);
    if (!folderStat.isDirectory()) {
      throw new Error('Agent folder must be a directory.');
    }
  }

  private async getCodexSessionManager(): Promise<CodexAgentSessionManager> {
    if (this.codexSessionManager) {
      return this.codexSessionManager;
    }

    const mcpServerUrl = await this.ensureMcpServer();
    const transport = new CodexProcessTransport({
      codexHome: process.env.CODEX_CLAW_CODEX_HOME,
      configOverrides: buildCodexClawMcpConfigOverrides(mcpServerUrl),
    });
    this.codexSessionManager = new CodexAgentSessionManager(new CodexRpcClient(transport), {
      clawMcpEnabled: true,
    });
    this.codexSessionManager.onEvent((event) => {
      this.emitAndApply(event);
    });

    return this.codexSessionManager;
  }

  private async ensureMcpServer(): Promise<string> {
    if (this.mcpServerUrl) {
      return this.mcpServerUrl;
    }

    if (!this.mcpServerStartPromise) {
      this.mcpServer = new ClawMcpHttpServer({
        coordinator: this.mcpCoordinator,
      });
      this.mcpServerStartPromise = this.mcpServer.start().then((url) => {
        this.mcpServerUrl = url;
        return url;
      });
    }

    return this.mcpServerStartPromise;
  }

  private emitAndApply(
    event: Omit<MainToRendererEvent, 'seq' | 'occurredAt'> & Partial<Pick<MainToRendererEvent, 'seq' | 'occurredAt'>>,
  ): void {
    const fullEvent: MainToRendererEvent = {
      ...event,
      seq: event.seq ?? ++this.seq,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
    };

    applyMainEventToSnapshot(this.snapshot, fullEvent);
    this.mainWindow?.webContents.send(ipcChannels.event, fullEvent);
    if (fullEvent.type === 'thread.started') {
      void this.persistSnapshot().catch((error: unknown) => {
        warnMain('state', 'failed to persist thread mapping', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (fullEvent.type === 'turn.completed' && fullEvent.agentId) {
      this.promptLatestUnreadMessage(fullEvent.agentId);
    }
  }

  private promptLatestUnreadMessage(agentId: string): void {
    const messageId = this.mcpCoordinator.latestUnreadMessageId(agentId);
    if (messageId) {
      this.promptAgentToCheckInbox(agentId, messageId);
    }
  }

  private promptAgentToCheckInbox(agentId: string, messageId: string): void {
    if (this.notifiedInboxMessageIds.get(agentId) === messageId) {
      return;
    }

    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent || agent.status.type !== 'idle') {
      return;
    }

    this.notifiedInboxMessageIds.set(agentId, messageId);
    void this.sendPrompt(agentId, CHECK_INBOX_PROMPT);
  }

  private async persistSnapshot(): Promise<void> {
    await this.persistence.save(this.snapshot);
  }
}

export function startMainApp(): void {
  const controller = new AppController();
  controller.registerIpcHandlers();

  void app.whenReady().then(async () => {
    await controller.initialize();
    controller.createWindow();
  });

  app.on('before-quit', () => {
    void controller.shutdown();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      controller.createWindow();
    }
  });
}

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { sendAgentPrompt } from './agent-chat-service';
import { CodexAgentSessionManager } from './codex/agent-session';
import { CodexProcessTransport } from './codex/process-transport';
import { CodexRpcClient } from './codex/rpc-client';
import { createMainWindow } from './main-window';
import { ClawMcpAgentCoordinator } from './mcp/agent-coordinator';
import { CHECK_INBOX_PROMPT } from './mcp/agent-prompts';
import { buildCodexClawMcpConfigOverrides } from './mcp/codex-config';
import { ClawMcpHttpServer } from './mcp/http-server';
import {
  applyMainEventToSnapshot,
  createAgentFromInput,
  createInitialSnapshot,
  selectAgent,
  updateAgentFolder,
} from './snapshot-service';
import type { AppSnapshot, ClientRequestResponse, CreateAgentInput, MainToRendererEvent } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private readonly snapshot = createInitialSnapshot();
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

  registerIpcHandlers(): void {
    ipcMain.handle(ipcChannels.getSnapshot, () => this.snapshot);

    ipcMain.handle(ipcChannels.createAgent, (_event, input: CreateAgentInput) => {
      const agent = createAgentFromInput(input);
      this.snapshot.agents.push(agent);
      this.snapshot.activeAgentId = agent.id;
      return agent;
    });

    ipcMain.handle(ipcChannels.selectAgent, (_event, agentId: string) => {
      return selectAgent(this.snapshot, agentId);
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
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.sendPrompt, (_event, agentId: string, prompt: string) => {
      return this.sendPrompt(agentId, prompt);
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

  private async sendPrompt(agentId: string, prompt: string): Promise<AppSnapshot> {
    return sendAgentPrompt(this.snapshot, await this.getCodexSessionManager(), agentId, prompt, (event) => {
      this.emitAndApply(event);
    });
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
}

export function startMainApp(): void {
  const controller = new AppController();
  controller.registerIpcHandlers();

  void app.whenReady().then(() => {
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

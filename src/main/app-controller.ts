import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { CodexAgentSessionManager } from './codex/agent-session';
import { CodexProcessTransport } from './codex/process-transport';
import { CodexRpcClient } from './codex/rpc-client';
import { createMainWindow } from './main-window';
import {
  appendSystemMessage,
  appendUserPrompt,
  applyMainEventToSnapshot,
  createAgentFromInput,
  createInitialSnapshot,
  updateAgentFolder,
} from './snapshot-service';
import type { AppSnapshot, CreateAgentInput, MainToRendererEvent } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private readonly snapshot = createInitialSnapshot();
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
  }

  createWindow(): void {
    this.mainWindow = createMainWindow();
  }

  async shutdown(): Promise<void> {
    await this.codexSessionManager?.close();
  }

  private async sendPrompt(agentId: string, prompt: string): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    const trimmedPrompt = prompt.trim();
    if (!agent || !trimmedPrompt) {
      return this.snapshot;
    }

    appendUserPrompt(this.snapshot, agentId, trimmedPrompt);
    agent.status = { type: 'starting' };
    this.emitAndApply({
      type: 'appServer.statusChanged',
      payload: {
        status: 'starting',
        detail: 'Starting Codex app-server...',
      },
    });

    try {
      await this.getCodexSessionManager().sendPrompt(agent, trimmedPrompt);
      this.emitAndApply({
        type: 'appServer.statusChanged',
        payload: {
          status: 'running',
          detail: 'Codex app-server connected.',
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      agent.status = { type: 'error', message };
      this.snapshot.appServer = {
        status: 'error',
        detail: message,
      };
      appendSystemMessage(this.snapshot, agentId, message);
    }

    return this.snapshot;
  }

  private getCodexSessionManager(): CodexAgentSessionManager {
    if (this.codexSessionManager) {
      return this.codexSessionManager;
    }

    const transport = new CodexProcessTransport({
      codexHome: path.join(app.getPath('userData'), 'codex-home'),
    });
    this.codexSessionManager = new CodexAgentSessionManager(new CodexRpcClient(transport));
    this.codexSessionManager.onEvent((event) => {
      this.emitAndApply(event);
    });

    return this.codexSessionManager;
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

import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { listAgentFolderFiles } from './agent-files';
import { sendAgentPrompt } from './agent-chat-service';
import { CodexAgentSessionManager } from './codex/agent-session';
import { CodexProcessTransport } from './codex/process-transport';
import { CodexRpcClient } from './codex/rpc-client';
import { logMain, warnMain } from './log';
import { createMainWindow } from './main-window';
import { ClawMcpAgentCoordinator } from './mcp/agent-coordinator';
import { CHECK_INBOX_PROMPT } from './mcp/agent-prompts';
import { buildCodexClawMcpConfigOverrides } from './mcp/codex-config';
import { ClawMcpHttpServer } from './mcp/http-server';
import { transcribeWithAppleSpeechAnalyzer } from './transcription/apple-speech';
import {
  closeAgentInSnapshot,
  deployBenchTemplateInSnapshot,
  duplicateAgentInSnapshot,
  moveAgentToTeamInSnapshot,
  removeBenchTemplateFromSnapshot,
  restartAgentConversation,
  saveAgentToBench,
} from '../shared/agent-manager';
import { closeTeamInSnapshot, createTeamInSnapshot, selectTeam, updateTeamInSnapshot } from '../shared/team-manager';
import { updateSettingsInSnapshot } from '../shared/settings';
import {
  applyMainEventToSnapshot,
  createAgentInSnapshot,
  createEmptySnapshot,
  selectAgent,
  updateAgentFromInput,
  updateAgentFolder,
} from './snapshot-service';
import { AppStatePersistence } from './state-persistence';
import type { Agent, AgentFileSearchItem, AppleSpeechTranscriptionOptions, AppSnapshot, ClientRequestResponse, CodexSkillSummary, CreateAgentInput, CreateTeamInput, MainToRendererEvent, MoveAgentToTeamInput, RendererMessage, SendPromptOptions, UpdateAgentInput, UpdateSettingsInput, UpdateTeamInput } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc';
import { teamColors } from '../shared/team-colors';

export class AppController {
  private mainWindow: BrowserWindow | null = null;
  private snapshot = createEmptySnapshot();
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

    ipcMain.handle(ipcChannels.listCodexSkills, async (_event, agentId: string) => {
      return this.listCodexSkills(agentId);
    });

    ipcMain.handle(ipcChannels.listAgentFiles, async (_event, agentId: string) => {
      return this.listAgentFiles(agentId);
    });

    ipcMain.handle(ipcChannels.chooseAgentFolder, async () => {
      return this.chooseAgentFolder();
    });

    ipcMain.handle(ipcChannels.createTeam, async (_event, input: CreateTeamInput) => {
      this.validateTeamInput(input);
      createTeamInSnapshot(this.snapshot, input);
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.updateTeam, async (_event, input: UpdateTeamInput) => {
      this.validateTeamInput(input);
      const team = updateTeamInSnapshot(this.snapshot, input);
      if (!team) {
        throw new Error(`Team not found: ${input.id}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.closeTeam, async (_event, teamId: string) => {
      const team = closeTeamInSnapshot(this.snapshot, teamId);
      if (!team) {
        throw new Error(`Team not found: ${teamId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.selectTeam, async (_event, teamId: string) => {
      selectTeam(this.snapshot, teamId);
      await this.persistSnapshot();
      return this.snapshot;
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

    ipcMain.handle(ipcChannels.duplicateAgent, async (_event, agentId: string) => {
      const agent = duplicateAgentInSnapshot(this.snapshot, agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.moveAgentToTeam, async (_event, input: MoveAgentToTeamInput) => {
      const agent = moveAgentToTeamInSnapshot(this.snapshot, input.agentId, input.teamId);
      if (!agent) {
        throw new Error(`Agent or team not found: ${input.agentId} -> ${input.teamId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.saveAgentToBench, async (_event, agentId: string) => {
      const template = saveAgentToBench(this.snapshot, agentId);
      if (!template) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.deployBenchTemplate, async (_event, templateId: string, teamId?: string) => {
      const template = this.snapshot.bench.find((candidate) => candidate.id === templateId);
      if (!template) {
        throw new Error(`Bench template not found: ${templateId}`);
      }
      await this.validateAgentInput(template);
      const agent = deployBenchTemplateInSnapshot(this.snapshot, templateId, teamId);
      if (!agent) {
        throw new Error(`Bench template or team not found: ${templateId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.removeBenchTemplate, async (_event, templateId: string) => {
      const template = removeBenchTemplateFromSnapshot(this.snapshot, templateId);
      if (!template) {
        throw new Error(`Bench template not found: ${templateId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.restartAgent, async (_event, agentId: string) => {
      const agent = restartAgentConversation(this.snapshot, agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.closeAgent, async (_event, agentId: string) => {
      const agent = closeAgentInSnapshot(this.snapshot, agentId);
      if (!agent) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.selectAgent, async (_event, agentId: string) => {
      const snapshot = selectAgent(this.snapshot, agentId);
      await this.persistSnapshot();
      await this.hydrateAgentHistory(agentId);
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

    ipcMain.handle(ipcChannels.updateSettings, async (_event, input: UpdateSettingsInput) => {
      updateSettingsInSnapshot(this.snapshot, input);
      await this.persistSnapshot();
      return this.snapshot;
    });

    ipcMain.handle(ipcChannels.transcribeAppleSpeech, async (_event, audioData: ArrayBuffer, options?: AppleSpeechTranscriptionOptions) => {
      return transcribeWithAppleSpeechAnalyzer(Buffer.from(audioData), options, {
        assetsPath: app.isPackaged ? process.resourcesPath : path.resolve(process.cwd(), 'assets'),
      });
    });

    ipcMain.handle(ipcChannels.quit, () => {
      app.quit();
    });

    ipcMain.handle(ipcChannels.sendPrompt, (_event, agentId: string, prompt: string, options?: SendPromptOptions) => {
      return this.sendPrompt(agentId, prompt, options);
    });

    ipcMain.handle(ipcChannels.steerPrompt, (_event, agentId: string, prompt: string) => {
      return this.steerPrompt(agentId, prompt);
    });

    ipcMain.handle(ipcChannels.interruptAgent, (_event, agentId: string) => {
      return this.interruptAgent(agentId);
    });

    ipcMain.handle(ipcChannels.deleteMessage, (_event, agentId: string, messageId: string) => {
      return this.deleteMessage(agentId, messageId);
    });

    ipcMain.handle(ipcChannels.editMessage, (_event, agentId: string, messageId: string, prompt: string) => {
      return this.editMessage(agentId, messageId, prompt);
    });

    ipcMain.handle(ipcChannels.retryMessage, (_event, agentId: string, messageId: string) => {
      return this.retryMessage(agentId, messageId);
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

  private async listCodexSkills(agentId: string): Promise<CodexSkillSummary[]> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return (await this.getCodexSessionManager()).listSkills(agent);
  }

  private async listAgentFiles(agentId: string): Promise<AgentFileSearchItem[]> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return listAgentFolderFiles(agent.folder);
  }

  private async steerPrompt(agentId: string, prompt: string): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    const trimmedPrompt = prompt.trim();
    if (!agent || !trimmedPrompt) {
      return this.snapshot;
    }

    const result = await (await this.getCodexSessionManager()).steerPrompt(agent, trimmedPrompt);
    this.emitAndApply({
      agentId,
      threadId: result.threadId,
      turnId: result.turnId,
      type: 'message.steer',
      payload: {
        prompt: trimmedPrompt,
      },
    });
    return this.snapshot;
  }

  private async interruptAgent(agentId: string): Promise<AppSnapshot> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return this.snapshot;
    }

    logMain('agent-interrupt', 'requested', {
      agentId,
      status: agent.status.type,
    });

    try {
      await (await this.getCodexSessionManager()).interruptTurn(agent);
      logMain('agent-interrupt', 'acknowledged', { agentId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnMain('agent-interrupt', 'failed', {
        agentId,
        error: message,
      });
      this.emitAndApply({
        agentId,
        type: 'error',
        payload: { message: `Failed to interrupt Codex: ${message}` },
      });
    }

    return this.snapshot;
  }

  private async deleteMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    const action = this.resolveMessageAction(agentId, messageId);
    if (!action) {
      return this.snapshot;
    }

    await this.rollbackAgentToTurn(action.agent, action.turnId);
    await this.persistSnapshot();
    return this.snapshot;
  }

  private async editMessage(agentId: string, messageId: string, prompt: string): Promise<AppSnapshot> {
    const trimmedPrompt = prompt.trim();
    const action = this.resolveMessageAction(agentId, messageId);
    if (!action || !trimmedPrompt) {
      return this.snapshot;
    }

    await this.rollbackAgentToTurn(action.agent, action.turnId);
    await this.persistSnapshot();
    return this.sendPrompt(agentId, trimmedPrompt);
  }

  private async retryMessage(agentId: string, messageId: string): Promise<AppSnapshot> {
    const action = this.resolveMessageAction(agentId, messageId);
    if (!action?.prompt) {
      return this.snapshot;
    }

    await this.rollbackAgentToTurn(action.agent, action.turnId);
    await this.persistSnapshot();
    return this.sendPrompt(agentId, action.prompt);
  }

  private async rollbackAgentToTurn(agent: Agent, turnId: string): Promise<void> {
    const result = await (await this.getCodexSessionManager()).rollbackToTurn(agent, turnId);
    this.emitAndApply({
      agentId: agent.id,
      threadId: result.threadId,
      type: 'thread.historyLoaded',
      payload: {
        messages: result.messages,
        replace: true,
      },
    });
    this.emitAndApply({
      agentId: agent.id,
      threadId: result.threadId,
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    });
  }

  private resolveMessageAction(agentId: string, messageId: string): { agent: Agent; message: RendererMessage; prompt: string | null; turnId: string } | null {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent) {
      return null;
    }

    const messages = this.snapshot.messages.filter((message) => message.agentId === agentId);
    const index = messages.findIndex((message) => message.id === messageId);
    const message = messages[index];
    if (index === -1 || !message) {
      return null;
    }

    const turnId = this.resolveMessageTurnId(messages, index);
    if (!turnId) {
      return null;
    }

    return {
      agent,
      message,
      prompt: this.promptForMessageRetry(messages, index, turnId),
      turnId,
    };
  }

  private resolveMessageTurnId(messages: RendererMessage[], index: number): string | null {
    const message = messages[index];
    if (!message) {
      return null;
    }

    if (message.turnId) {
      return message.turnId;
    }

    const idTurnId = turnIdFromRendererMessageId(message.id);
    if (idTurnId) {
      return idTurnId;
    }

    if (message.role === 'user') {
      for (let offset = index + 1; offset < messages.length; offset += 1) {
        const candidate = messages[offset];
        if (candidate?.role === 'user') {
          break;
        }
        const candidateTurnId = candidate ? candidate.turnId ?? turnIdFromRendererMessageId(candidate.id) : null;
        if (candidateTurnId) {
          return candidateTurnId;
        }
      }
    }

    return null;
  }

  private promptForMessageRetry(messages: RendererMessage[], index: number, turnId: string): string | null {
    const message = messages[index];
    if (!message) {
      return null;
    }

    if (message.role === 'user') {
      return rendererMessageText(message);
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
      const candidate = messages[offset];
      if (!candidate || candidate.role !== 'user') {
        continue;
      }
      const candidateTurnId = candidate.turnId ?? this.resolveMessageTurnId(messages, offset);
      if (candidateTurnId === turnId) {
        return rendererMessageText(candidate);
      }
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
      const candidate = messages[offset];
      if (candidate?.role === 'user') {
        return rendererMessageText(candidate);
      }
    }

    return null;
  }

  private async hydrateAgentHistory(agentId: string): Promise<void> {
    const agent = this.snapshot.agents.find((candidate) => candidate.id === agentId);
    if (!agent?.codexThreadId) {
      return;
    }

    try {
      await (await this.getCodexSessionManager()).hydrateAgent(agent);
    } catch (error) {
      warnMain('codex-history', 'failed to hydrate persisted thread', {
        agentId,
        threadId: agent.codexThreadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

  private validateTeamInput(input: CreateTeamInput): void {
    if (!input.name.trim()) {
      throw new Error('Team name is required.');
    }

    if (!teamColors.some((color) => color === input.color.trim().toUpperCase())) {
      throw new Error('Team color is invalid.');
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
    if (
      fullEvent.type === 'agent.updated' ||
      fullEvent.type === 'account.rateLimitsUpdated' ||
      fullEvent.type === 'thread.started' ||
      fullEvent.type === 'thread.settingsUpdated' ||
      fullEvent.type === 'thread.tokenUsageUpdated'
    ) {
      void this.persistSnapshot().catch((error: unknown) => {
        warnMain('state', 'failed to persist snapshot event', {
          error: error instanceof Error ? error.message : String(error),
          eventType: fullEvent.type,
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

function rendererMessageText(message: RendererMessage): string {
  return message.parts
    .map((part) => part.type === 'text' || part.type === 'status' ? part.text : '')
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function turnIdFromRendererMessageId(messageId: string): string | null {
  if (messageId.startsWith('assistant-')) {
    return messageId.slice('assistant-'.length).split('-segment-')[0] || null;
  }

  if (messageId.startsWith('compaction-')) {
    return messageId.slice('compaction-'.length) || null;
  }

  return null;
}

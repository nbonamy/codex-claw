import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';
import type { AgentBackendDriver, BackendEvent, BackendSendResult } from '@codex-claw/shared/backend-driver';
import { unsupportedBackendFeature } from '@codex-claw/shared/backend-driver';
import type { Agent, AgentBackend, AppGeneralSettings, CreateSourceWorktreeInput, SendPromptOptions } from '@codex-claw/shared/contracts';
import { stat } from 'node:fs/promises';
import { listAgentFolderFiles, previewAgentFolderFile } from './agent-files';
import { ClaudeBackendDriver } from './claude/claude-driver';
import { CodexBackendDriver } from './codex/codex-driver';
import { CodexSurfaceAgentAdapter } from './codex/codex-surface-adapter';
import { resolveCodexCommand } from './codex/codex-command';
import { createCodexSurface } from 'codex-app-sdk/node';
import { createSourceWorktree, listSourceWorktrees, suggestedSourceWorktreePath } from './git-worktrees';
import { buildCodexClawMcpConfigOverrides, buildCodexClawThreadConfig } from './mcp/codex-config';
import { backendCodexHomeDir } from './state';
import { listSourceFolders } from './source-folders';
import { detectSourceFolder, scanSourceRepositories } from './source-repositories';

export type BackendDriverRegistryOptions = {
  clawMcpServerUrl?: string | null;
  generalSettings?: AppGeneralSettings;
};

export function createDefaultBackendDrivers(options: BackendDriverRegistryOptions = {}): Map<AgentBackend, AgentBackendDriver> {
  const codexSurface = createCodexSurface(codexClawSurfaceOptions(options));
  const codexSessionManager = new CodexSurfaceAgentAdapter(codexSurface);

  return new Map<AgentBackend, AgentBackendDriver>([
    ['codex', new CodexBackendDriver(codexSessionManager)],
    ['claude', new ClaudeBackendDriver(undefined, undefined, {
      clawMcpServerUrl: options.clawMcpServerUrl ?? null,
    })],
  ]);
}

export function codexClawSurfaceOptions(options: BackendDriverRegistryOptions = {}): Parameters<typeof createCodexSurface>[0] {
  return {
    autoSelectFirstConversation: false,
    clientInfo: { name: 'codex_claw', title: 'Codex Claw', version: '0.2.0' },
    codexHome: backendCodexHomeDir(),
    transport: {
      command: resolveCodexCommand(options.generalSettings?.codexBinaryPath),
      configOverrides: buildCodexClawMcpConfigOverrides(),
    },
    extensions: [{
      configureConversation: ({ extensionContext }) => (
        isAgent(extensionContext)
          ? buildCodexClawThreadConfig(extensionContext, options.clawMcpServerUrl ?? null)
          : {}
      ),
    }],
  };
}

function isAgent(value: unknown): value is Agent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.backend === 'codex' && typeof record.id === 'string' && typeof record.folder === 'string';
}

export class BackendDriverRpc {
  private readonly listeners = new Set<(event: BackendEvent) => void>();
  private readonly unsubscribeDriverEvents: (() => void)[];

  constructor(private readonly drivers: Map<AgentBackend, AgentBackendDriver>) {
    this.unsubscribeDriverEvents = [...drivers.values()].map((driver) => driver.onEvent((event) => this.emit(event)));
  }

  async handle(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case backendMethods.driverFilesList: {
        const record = requireRecord(params);
        return listAgentFolderFiles(requireString(record.folder, 'folder'));
      }
      case backendMethods.driverCodexAuthenticationGet:
        return this.requireCodexDriver().getAuthentication();
      case backendMethods.driverCodexChatGptLoginCancel:
        return this.requireCodexDriver().cancelChatGptLogin();
      case backendMethods.driverCodexChatGptLoginStart:
        return this.requireCodexDriver().startChatGptLogin();
      case backendMethods.driverCodexLogout:
        return this.requireCodexDriver().logout();
      case backendMethods.driverFilePreview: {
        const record = requireRecord(params);
        return previewAgentFolderFile(
          requireString(record.folder, 'folder'),
          requireString(record.filePath, 'filePath'),
        );
      }
      case backendMethods.agentFolderValidate: {
        const record = requireRecord(params);
        const folderStat = await stat(requireString(record.folder, 'folder').trim());
        if (!folderStat.isDirectory()) {
          throw new Error('Agent folder must be a directory.');
        }
        return null;
      }
      case backendMethods.driverGitStatusGet: {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.getGitStatus ? driver.getGitStatus(agent) : null;
      }
      case backendMethods.driverGitDiffGet: {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.getGitDiff ? driver.getGitDiff(agent) : null;
      }
      case backendMethods.driverPromptCommandHandle: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        return this.tryHandlePromptCommand(agent, requireString(record.prompt, 'prompt'));
      }
      case backendMethods.driverPromptSend: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const prompt = requireString(record.prompt, 'prompt');
        const driver = this.requireDriver(agent.backend);
        return driver.sendPrompt(agent, prompt, record.options as SendPromptOptions | undefined);
      }
      case backendMethods.driverConversationTitleUpdate: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.setConversationTitle) {
          throw unsupportedBackendFeature(agent, 'conversation titles');
        }
        await driver.setConversationTitle(agent, requireString(record.title, 'title'));
        return null;
      }
      case backendMethods.driverGoalUpdate: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.setGoal) {
          throw unsupportedBackendFeature(agent, 'goals');
        }
        return driver.setGoal(agent, requireString(record.objective, 'objective'));
      }
      case backendMethods.driverGoalClear: {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.clearGoal) {
          throw unsupportedBackendFeature(agent, 'goals');
        }
        return driver.clearGoal(agent);
      }
      case backendMethods.driverApprovalPresetUpdate: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.setApprovalPreset) {
          throw unsupportedBackendFeature(agent, 'approval presets');
        }
        return driver.setApprovalPreset(agent, record.preset as never);
      }
      case backendMethods.driverSessionForget: {
        const { backend, agentId } = requireBackendAgentIdParams(params);
        this.requireDriver(backend).forgetAgentSession?.(agentId);
        return null;
      }
      case backendMethods.driverInterrupt: {
        const { agent } = requireAgentParams(params);
        return this.requireDriver(agent.backend).interrupt(agent);
      }
      case backendMethods.driverClientRequestRespond: {
        const record = requireRecord(params);
        const backend = requireBackend(record.backend);
        await this.requireDriver(backend).respondToRequest(record.response as never);
        return null;
      }
      case backendMethods.driverHistoryHydrate: {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.hydrateAgent ? driver.hydrateAgent(agent) : null;
      }
      case backendMethods.driverConversationsList: {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.listConversations ? driver.listConversations(agent) : [];
      }
      case backendMethods.driverConversationResume: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.resumeConversation) {
          throw unsupportedBackendFeature(agent, 'conversation resume');
        }
        return driver.resumeConversation(agent, record.ref as never);
      }
      case backendMethods.driverConversationMessagesGet: {
        const record = requireRecord(params);
        const ref = requireRecord(record.ref);
        const backend = requireBackend(ref.backend);
        const driver = this.requireDriver(backend);
        if (!driver.readConversationMessages) {
          throw new Error(`${backend} does not support reading conversation messages.`);
        }
        return driver.readConversationMessages(record.ref as never, requireString(record.agentId, 'agentId'));
      }
      case backendMethods.driverPromptSteer: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.steerPrompt) {
          throw unsupportedBackendFeature(agent, 'prompt steering');
        }
        return driver.steerPrompt(agent, requireString(record.prompt, 'prompt'));
      }
      case backendMethods.driverTurnRollback: {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.rollbackToTurn) {
          throw unsupportedBackendFeature(agent, 'rollback');
        }
        return driver.rollbackToTurn(agent, requireString(record.turnId, 'turnId'));
      }
      case backendMethods.driverModelsList: {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.listModels ? driver.listModels(agent) : [];
      }
      case backendMethods.driverSkillsList: {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.listSkills ? driver.listSkills(agent) : [];
      }
      case backendMethods.sourceFolderDetect:
        return detectSourceFolder();
      case backendMethods.sourceRepositoriesList: {
        const record = requireRecord(params);
        const sourceFolderPath = requireString(record.sourceFolderPath, 'sourceFolderPath').trim();
        return sourceFolderPath ? scanSourceRepositories(sourceFolderPath) : [];
      }
      case backendMethods.sourceFoldersList: {
        const record = params === undefined ? {} : requireRecord(params);
        return listSourceFolders(typeof record.path === 'string' ? record.path : undefined);
      }
      case backendMethods.sourceWorktreePathSuggest: {
        const record = requireRecord(params);
        const input = requireRecord(record.input) as Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>;
        return suggestedSourceWorktreePath(input.repoPath, input.branchName);
      }
      case backendMethods.sourceWorktreesList: {
        const record = requireRecord(params);
        return listSourceWorktrees(requireString(record.repoPath, 'repoPath'));
      }
      case backendMethods.sourceWorktreeCreate: {
        const record = requireRecord(params);
        return createSourceWorktree(record.input as CreateSourceWorktreeInput);
      }
      default:
        return undefined;
    }
  }

  private requireCodexDriver(): CodexBackendDriver {
    const driver = this.requireDriver('codex');
    if (!(driver instanceof CodexBackendDriver)) {
      throw new Error('Codex driver is not configured.');
    }
    return driver;
  }

  async close(): Promise<void> {
    for (const unsubscribe of this.unsubscribeDriverEvents) {
      unsubscribe();
    }
    await Promise.all([...this.drivers.values()].map((driver) => driver.close()));
  }

  tryHandlePromptCommand(agent: Agent, prompt: string): Promise<BackendSendResult> | null {
    return this.requireDriver(agent.backend).tryHandlePromptCommand?.(agent, prompt) ?? null;
  }

  onEvent(listener: (event: BackendEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private requireDriver(backend: AgentBackend): AgentBackendDriver {
    const driver = this.drivers.get(backend);
    if (!driver) {
      throw new Error(`Backend driver is not configured: ${backend}`);
    }
    return driver;
  }

  private emit(event: BackendEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function requireAgentParams(params: unknown): { agent: Agent } {
  const record = requireRecord(params);
  const agent = requireRecord(record.agent) as Agent;
  requireBackend(agent.backend);
  requireString(agent.id, 'agent.id');
  return { agent };
}

function requireBackendAgentIdParams(params: unknown): { backend: AgentBackend; agentId: string } {
  const record = requireRecord(params);
  return {
    backend: requireBackend(record.backend),
    agentId: requireString(record.agentId, 'agentId'),
  };
}

function requireBackend(value: unknown): AgentBackend {
  if (value !== 'codex' && value !== 'claude') {
    throw new Error('Invalid backend.');
  }
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid request params.');
  }
  return value as Record<string, unknown>;
}

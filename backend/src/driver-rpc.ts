import type { AgentBackendDriver, BackendEvent } from '@codex-claw/shared/backend-driver';
import { unsupportedBackendFeature } from '@codex-claw/shared/backend-driver';
import type { Agent, AgentBackend, AppleSpeechTranscriptionOptions, CreateSourceWorktreeInput, SendPromptOptions } from '@codex-claw/shared/contracts';
import { stat } from 'node:fs/promises';
import { listAgentFolderFiles, readAgentFolderFile } from './agent-files';
import { ClaudeBackendDriver } from './claude/claude-driver';
import { CodexAgentSessionManager } from './codex/agent-session';
import { CodexBackendDriver } from './codex/codex-driver';
import { CodexProcessTransport } from './codex/process-transport';
import { CodexRpcClient } from './codex/rpc-client';
import { createSourceWorktree } from './git-worktrees';
import { buildCodexClawMcpConfigOverrides } from './mcp/codex-config';
import { detectSourceFolder, scanSourceRepositories } from './source-repositories';
import { transcribeWithAppleSpeechAnalyzer } from './transcription/apple-speech';

export type BackendDriverRegistryOptions = {
  clawMcpServerUrl?: string | null;
};

export function createDefaultBackendDrivers(options: BackendDriverRegistryOptions = {}): Map<AgentBackend, AgentBackendDriver> {
  const codexSessionManager = new CodexAgentSessionManager(
    new CodexRpcClient(new CodexProcessTransport({
      configOverrides: buildCodexClawMcpConfigOverrides(),
    })),
    { clawMcpServerUrl: options.clawMcpServerUrl ?? null },
  );

  return new Map<AgentBackend, AgentBackendDriver>([
    ['codex', new CodexBackendDriver(codexSessionManager)],
    ['claude', new ClaudeBackendDriver(undefined, undefined, {
      clawMcpServerUrl: options.clawMcpServerUrl ?? null,
    })],
  ]);
}

export class BackendDriverRpc {
  private readonly listeners = new Set<(event: BackendEvent) => void>();
  private readonly unsubscribeDriverEvents: (() => void)[];

  constructor(private readonly drivers: Map<AgentBackend, AgentBackendDriver>) {
    this.unsubscribeDriverEvents = [...drivers.values()].map((driver) => driver.onEvent((event) => this.emit(event)));
  }

  async handle(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'agent/listFiles': {
        const record = requireRecord(params);
        return listAgentFolderFiles(requireString(record.folder, 'folder'));
      }
      case 'agent/readFile': {
        const record = requireRecord(params);
        return readAgentFolderFile(
          requireString(record.folder, 'folder'),
          requireString(record.filePath, 'filePath'),
        );
      }
      case 'agent/validateFolder': {
        const record = requireRecord(params);
        const folderStat = await stat(requireString(record.folder, 'folder').trim());
        if (!folderStat.isDirectory()) {
          throw new Error('Agent folder must be a directory.');
        }
        return null;
      }
      case 'agent/getGitStatus': {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.getGitStatus ? driver.getGitStatus(agent) : null;
      }
      case 'agent/getGitDiff': {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.getGitDiff ? driver.getGitDiff(agent) : null;
      }
      case 'agent/sendPrompt': {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const prompt = requireString(record.prompt, 'prompt');
        const driver = this.requireDriver(agent.backend);
        const commandResult = driver.tryHandlePromptCommand?.(agent, prompt) ?? null;
        return commandResult ?? driver.sendPrompt(agent, prompt, record.options as SendPromptOptions | undefined);
      }
      case 'agent/setConversationTitle': {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.setConversationTitle) {
          throw unsupportedBackendFeature(agent, 'conversation titles');
        }
        await driver.setConversationTitle(agent, requireString(record.title, 'title'));
        return null;
      }
      case 'agent/setGoal': {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.setGoal) {
          throw unsupportedBackendFeature(agent, 'goals');
        }
        return driver.setGoal(agent, requireString(record.objective, 'objective'));
      }
      case 'agent/clearGoal': {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.clearGoal) {
          throw unsupportedBackendFeature(agent, 'goals');
        }
        return driver.clearGoal(agent);
      }
      case 'agent/setApprovalPreset': {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.setApprovalPreset) {
          throw unsupportedBackendFeature(agent, 'approval presets');
        }
        return driver.setApprovalPreset(agent, record.preset as never);
      }
      case 'agent/forgetSession': {
        const { backend, agentId } = requireBackendAgentIdParams(params);
        this.requireDriver(backend).forgetAgentSession?.(agentId);
        return null;
      }
      case 'agent/interrupt': {
        const { agent } = requireAgentParams(params);
        return this.requireDriver(agent.backend).interrupt(agent);
      }
      case 'agent/respondToClientRequest': {
        const record = requireRecord(params);
        const backend = requireBackend(record.backend);
        await this.requireDriver(backend).respondToRequest(record.response as never);
        return null;
      }
      case 'agent/hydrate': {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.hydrateAgent ? driver.hydrateAgent(agent) : null;
      }
      case 'agent/listConversations': {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.listConversations ? driver.listConversations(agent) : [];
      }
      case 'agent/resumeConversation': {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.resumeConversation) {
          throw unsupportedBackendFeature(agent, 'conversation resume');
        }
        return driver.resumeConversation(agent, record.ref as never);
      }
      case 'agent/readConversationMessages': {
        const record = requireRecord(params);
        const ref = requireRecord(record.ref);
        const backend = requireBackend(ref.backend);
        const driver = this.requireDriver(backend);
        if (!driver.readConversationMessages) {
          throw new Error(`${backend} does not support reading conversation messages.`);
        }
        return driver.readConversationMessages(record.ref as never, requireString(record.agentId, 'agentId'));
      }
      case 'agent/steer': {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.steerPrompt) {
          throw unsupportedBackendFeature(agent, 'prompt steering');
        }
        return driver.steerPrompt(agent, requireString(record.prompt, 'prompt'));
      }
      case 'agent/rollbackToTurn': {
        const { agent } = requireAgentParams(params);
        const record = requireRecord(params);
        const driver = this.requireDriver(agent.backend);
        if (!driver.rollbackToTurn) {
          throw unsupportedBackendFeature(agent, 'rollback');
        }
        return driver.rollbackToTurn(agent, requireString(record.turnId, 'turnId'));
      }
      case 'agent/listModels': {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.listModels ? driver.listModels(agent) : [];
      }
      case 'agent/listSkills': {
        const { agent } = requireAgentParams(params);
        const driver = this.requireDriver(agent.backend);
        return driver.listSkills ? driver.listSkills(agent) : [];
      }
      case 'source/detectFolder':
        return detectSourceFolder();
      case 'source/listRepositories': {
        const record = requireRecord(params);
        const sourceFolderPath = requireString(record.sourceFolderPath, 'sourceFolderPath').trim();
        return sourceFolderPath ? scanSourceRepositories(sourceFolderPath) : [];
      }
      case 'source/createWorktree': {
        const record = requireRecord(params);
        return createSourceWorktree(record.input as CreateSourceWorktreeInput);
      }
      case 'transcription/appleSpeech': {
        const record = requireRecord(params);
        const audioBase64 = requireString(record.audioBase64, 'audioBase64');
        const assetsPath = typeof record.assetsPath === 'string' && record.assetsPath.trim()
          ? record.assetsPath.trim()
          : undefined;
        return transcribeWithAppleSpeechAnalyzer(
          Buffer.from(audioBase64, 'base64'),
          transcriptionOptions(record.options),
          assetsPath ? { assetsPath } : {},
        );
      }
      default:
        return undefined;
    }
  }

  async close(): Promise<void> {
    for (const unsubscribe of this.unsubscribeDriverEvents) {
      unsubscribe();
    }
    await Promise.all([...this.drivers.values()].map((driver) => driver.close()));
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

function transcriptionOptions(value: unknown): AppleSpeechTranscriptionOptions | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireRecord(value) as AppleSpeechTranscriptionOptions;
}

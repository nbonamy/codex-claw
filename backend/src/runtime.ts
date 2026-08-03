import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';
import { sendAgentPrompt } from '@codex-claw/shared/agent-chat-service';
import type { Agent, BackendConversationRef, SystemPermissionsStatus } from '@codex-claw/shared/contracts';
import { formatConversationTitle } from '@codex-claw/shared/conversation-title';
import { updateLoopExecutionAgentConversationInSnapshot } from '@codex-claw/shared/loop-manager';
import type { AgentBackendDriver, BackendSendResult } from '@codex-claw/shared/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { BackendDriverRpc, createDefaultBackendDrivers } from './driver-rpc';
import { RemoteClawdClientManager } from './connections/remote-clawd-client';
import { SshConnectionService } from './connections/ssh-connections';
import { LoopRunner } from './loops/runner';
import { LoopScheduler } from './loops/scheduler';
import { ClawMcpService } from './mcp/service';
import { runtimeGitHubOAuthClientId } from './runtime-config';
import { ClawBackendServer } from './server';
import { backendProviderTokensFilePath, ensureBackendCodexHome, loadBackendSnapshot, saveBackendSnapshot } from './state';
import { FileWorkIntegrationTokenStore } from './work-integrations/file-token-store';
import { GitHubWorkProviderDriver } from './work-integrations/github-driver';
import { WorkIntegrationManager } from './work-integrations/manager';
import { warnMain } from './log';

export type ClawdClientRequest = <Result>(method: string, params?: unknown) => Promise<Result>;

export type ClawdRuntimeOptions = {
  emitEvent(event: ClawBackendEvent): void;
  requestClient: ClawdClientRequest;
  version: string;
};

export type ClawdRuntime = {
  server: ClawBackendServer;
  stop(): Promise<void>;
};

export async function createClawdRuntime(options: ClawdRuntimeOptions): Promise<ClawdRuntime> {
  const snapshot = await loadBackendSnapshot();
  await ensureBackendCodexHome();
  const mcpService = new ClawMcpService({
    snapshot,
    computerUse: {
      execute: (input) => options.requestClient(backendMethods.clientComputerUseExecute, input),
      requestAccessibility: () => options.requestClient(backendMethods.clientComputerUseRequestAccessibility),
      status: () => options.requestClient(backendMethods.clientComputerUseStatusGet),
      stop: () => options.requestClient(backendMethods.clientComputerUseStop),
    },
    computerUseEnabled: () => snapshot.general.plugins?.computerUseEnabled === true,
    browser: {
      open: (input) => options.requestClient(backendMethods.clientBrowserOpen, input),
      execute: (input) => options.requestClient(backendMethods.clientBrowserExecute, input),
    },
  });
  const mcpServerUrl = await mcpService.start();
  const backendDrivers = createDefaultBackendDrivers({
    clawMcpServerUrl: mcpServerUrl,
    generalSettings: snapshot.general,
    pluginSettings: () => snapshot.general.plugins ?? { computerUseEnabled: false, chromeEnabled: false },
  });
  const driverRpc = new BackendDriverRpc(backendDrivers);
  let server: ClawBackendServer;
  const workIntegrations = new WorkIntegrationManager({
    drivers: [new GitHubWorkProviderDriver(() => runtimeGitHubOAuthClientId(snapshot.workBacklog.providerSettings.github))],
    getSnapshot: () => snapshot,
    openExternal: (url) => options.requestClient(backendMethods.clientExternalOpen, { url }),
    saveSnapshot: () => saveBackendSnapshot(snapshot),
    tokenStore: new FileWorkIntegrationTokenStore(backendProviderTokensFilePath()),
  });
  await workIntegrations.hydrateConnections();
  const loopRunner = new LoopRunner({
    getSnapshot: () => snapshot,
    listWorkItems: workIntegrations,
    notifySnapshotUpdated: () => server.emitEvent({
      type: 'snapshot.updated',
      payload: snapshot,
    }),
    saveSnapshot: () => saveBackendSnapshot(snapshot),
    sendPrompt: (agentId, prompt, context) => {
      const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
      if (!agent) {
        return Promise.resolve(snapshot);
      }
      const driver = requireBackendDriver(backendDrivers, agent);
      sendAgentPrompt(snapshot, driver, agentId, prompt, undefined, (event) => server.emitEvent(event), {
        onBackendSessionUpdated: (result, wasNewSession) => setNewConversationTitle(agent, driver, wasNewSession),
        onPromptStarted: async (result) => {
          const loop = updateLoopExecutionAgentConversationInSnapshot(snapshot, context.loopId, context.executionId, agentId, {
            conversationRef: conversationRefFromSendResult(agent, result),
            updatedAt: new Date().toISOString(),
          });
          if (loop) {
            await saveBackendSnapshot(snapshot);
            server.emitEvent({
              type: 'snapshot.updated',
              payload: snapshot,
            });
          }
        },
      });
      return Promise.resolve(snapshot);
    },
  });
  const loopScheduler = new LoopScheduler({
    runLoops: () => loopRunner.runAll(),
    onError: (error) => {
      warnMain('loop-scheduler', 'check failed', { message: error instanceof Error ? error.message : String(error) });
    },
  });
  server = new ClawBackendServer({
    version: options.version,
    snapshot,
    driverRpc,
    onEvent: options.emitEvent,
    onBackendEventApplied: (event) => mcpService.handleBackendEvent(event),
    saveSnapshot: (nextSnapshot) => saveBackendSnapshot(nextSnapshot),
    workIntegrations,
    loopRunner,
    remoteClients: new RemoteClawdClientManager({
      requestHandlers: {
        [backendMethods.clientExternalOpen]: (params) => options.requestClient(backendMethods.clientExternalOpen, params),
        [backendMethods.clientBrowserOpen]: (params) => options.requestClient(backendMethods.clientBrowserOpen, params),
        [backendMethods.clientBrowserExecute]: (params) => options.requestClient(backendMethods.clientBrowserExecute, params),
        [backendMethods.clientComputerUseExecute]: (params) => options.requestClient(backendMethods.clientComputerUseExecute, params),
        [backendMethods.clientComputerUseStop]: (params) => options.requestClient(backendMethods.clientComputerUseStop, params),
        [backendMethods.clientComputerUseRequestAccessibility]: (params) => options.requestClient(backendMethods.clientComputerUseRequestAccessibility, params),
        [backendMethods.clientComputerUseStatusGet]: (params) => options.requestClient(backendMethods.clientComputerUseStatusGet, params),
        [backendMethods.clientSystemPermissionsGet]: (params) => options.requestClient(backendMethods.clientSystemPermissionsGet, params),
        [backendMethods.clientSystemPermissionsAccessibilityOpen]: (params) => options.requestClient(backendMethods.clientSystemPermissionsAccessibilityOpen, params),
      },
    }),
    sshConnections: new SshConnectionService(),
    systemPermissions: {
      getStatus: () => options.requestClient<SystemPermissionsStatus>(backendMethods.clientSystemPermissionsGet),
      openAccessibilitySettings: () => options.requestClient<SystemPermissionsStatus>(backendMethods.clientSystemPermissionsAccessibilityOpen),
    },
  });
  mcpService.setDriverRpc(driverRpc);
  mcpService.setEventSink((event) => server.emitEvent(event));
  loopScheduler.start();

  return {
    server,
    async stop() {
      loopScheduler.stop();
      await server.close();
      await mcpService.stop();
    },
  };
}

function requireBackendDriver(drivers: Map<Agent['backend'], AgentBackendDriver>, agent: Agent): AgentBackendDriver {
  const driver = drivers.get(agent.backend);
  if (!driver) {
    throw new Error(`Backend driver is not configured: ${agent.backend}`);
  }
  return driver;
}

async function setNewConversationTitle(agent: Agent, driver: AgentBackendDriver, wasNewSession: boolean): Promise<void> {
  if (!wasNewSession || !driver.setConversationTitle) {
    return;
  }

  try {
    await driver.setConversationTitle(agent, formatConversationTitle(agent));
  } catch (error) {
    warnMain('conversation-title', 'failed', {
      agentId: agent.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function conversationRefFromSendResult(agent: Agent, result: BackendSendResult): BackendConversationRef {
  return result.backendSession.kind === 'codex'
    ? { backend: 'codex', threadId: result.backendSession.threadId }
    : { backend: 'claude', folder: agent.folder, sessionId: result.backendSession.transcriptSessionId ?? result.backendSession.sessionId };
}

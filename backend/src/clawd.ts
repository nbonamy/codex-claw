import { pathToFileURL } from 'node:url';
import { sendAgentPrompt } from '@codex-claw/shared/agent-chat-service';
import { createClawRpcNotification } from '@codex-claw/shared/backend-protocol/rpc';
import type { Agent, BackendConversationRef } from '@codex-claw/shared/contracts';
import { formatConversationTitle } from '@codex-claw/shared/conversation-title';
import { updateLoopExecutionAgentConversationInSnapshot } from '@codex-claw/shared/loop-manager';
import type { AgentBackendDriver, BackendSendResult } from '@codex-claw/shared/backend-driver';
import { BackendDriverRpc, createDefaultBackendDrivers } from './driver-rpc';
import { DesktopWorkIntegrationTokenStore } from './desktop-work-integration-token-store';
import { LoopRunner } from './loops/runner';
import { LoopScheduler } from './loops/scheduler';
import { ClawMcpService } from './mcp/service';
import { ClawBackendServer } from './server';
import { loadBackendSnapshot, saveBackendSnapshot } from './state';
import { StdioRpcPeer } from './stdio';
import { GitHubWorkProviderDriver } from './work-integrations/github-driver';
import { WorkIntegrationManager } from './work-integrations/manager';

export const CLAWD_VERSION = '0.1.0';

export async function main(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes('--version')) {
    process.stdout.write(`clawd ${CLAWD_VERSION}\n`);
    return;
  }

  if (argv.includes('--stdio')) {
    const stateDir = readArgValue(argv, '--state-dir');
    const snapshot = await loadBackendSnapshot(stateDir);
    const mcpService = new ClawMcpService({ snapshot });
    const mcpServerUrl = await mcpService.start();
    const backendDrivers = createDefaultBackendDrivers({
      clawMcpServerUrl: mcpServerUrl,
    });
    const driverRpc = new BackendDriverRpc(backendDrivers);
    let server: ClawBackendServer;
    const stdio = new StdioRpcPeer({
      input: process.stdin,
      output: process.stdout,
      onMessage: (message) => server.handleMessage(message),
    });
    const workIntegrations = new WorkIntegrationManager({
      drivers: [new GitHubWorkProviderDriver(() => githubOAuthClientId(snapshot))],
      getSnapshot: () => snapshot,
      openExternal: (url) => stdio.request('desktop/openExternal', { url }),
      saveSnapshot: () => saveBackendSnapshot(stateDir, snapshot),
      tokenStore: new DesktopWorkIntegrationTokenStore(stdio),
    });
    const loopRunner = new LoopRunner({
      getSnapshot: () => snapshot,
      listWorkItems: workIntegrations,
      notifySnapshotUpdated: () => server.emitEvent({
        type: 'snapshot.updated',
        payload: snapshot,
      }),
      saveSnapshot: () => saveBackendSnapshot(stateDir, snapshot),
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
              await saveBackendSnapshot(stateDir, snapshot);
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
        process.stderr.write(`[loops] scheduler check failed: ${error instanceof Error ? error.message : String(error)}\n`);
      },
    });
    server = new ClawBackendServer({
      version: CLAWD_VERSION,
      snapshot,
      driverRpc,
      onEvent: (event) => {
        process.stdout.write(`${JSON.stringify(createClawRpcNotification('backend/event', event))}\n`);
      },
      saveSnapshot: (nextSnapshot) => saveBackendSnapshot(stateDir, nextSnapshot),
      workIntegrations,
      loopRunner,
    });
    mcpService.setDriverRpc(driverRpc);
    mcpService.setEventSink((event) => server.emitEvent(event));
    loopScheduler.start();
    let stopping = false;
    const stop = async () => {
      if (stopping) {
        return;
      }
      stopping = true;
      loopScheduler.stop();
      stdio.stop();
      await server.close();
      await mcpService.stop();
    };
    process.once('SIGTERM', () => {
      void stop().finally(() => process.exit(0));
    });
    process.once('SIGINT', () => {
      void stop().finally(() => process.exit(0));
    });
    process.stdin.once('end', () => {
      void stop().finally(() => process.exit(0));
    });
    stdio.start();
    process.stdin.resume();
    return;
  }

  process.stderr.write('Usage: clawd --stdio [--state-dir <path>] | --version\n');
  process.exitCode = 1;
}

function readArgValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function githubOAuthClientId(snapshot: { workBacklog: { providerSettings: { github?: { oauthClientId?: string } } } }): string {
  return snapshot.workBacklog.providerSettings.github?.oauthClientId ?? process.env.CODEX_CLAW_GITHUB_CLIENT_ID ?? '';
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
    process.stderr.write(`[conversation-title] failed for ${agent.id}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function conversationRefFromSendResult(agent: Agent, result: BackendSendResult): BackendConversationRef {
  return result.backendSession.kind === 'codex'
    ? { backend: 'codex', threadId: result.backendSession.threadId }
    : { backend: 'claude', folder: agent.folder, sessionId: result.backendSession.transcriptSessionId ?? result.backendSession.sessionId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}

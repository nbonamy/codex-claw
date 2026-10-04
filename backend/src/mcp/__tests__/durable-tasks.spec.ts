import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import type { DelegatedTask } from '@codex-claw/core/delegated-task';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { DurableTaskService } from '../../agents/durable-task-service';
import { AppStateStore } from '../../persistence/store';
import { BackendDriverRpc } from '../../driver-rpc';
import { ClawBackendServer } from '../../server';
import { ClawMcpService } from '../service';
import { createTaskToolModuleProvider } from '../task-tools';
import { codexSdkFixture, sdkSnapshot } from '../../codex/__tests__/sdk-surface-fixture';
import { ClaudeBackendDriver } from '../../claude/claude-driver';
import { ClaudeAgentSdkTransport } from '../../claude/agent-sdk-transport';
import { createQueryHarness } from '../../claude/__tests__/sdk-query-fixture';

vi.mock('@codex-claw/core/runtime-discovery', () => ({ withDiscoveredRuntimePath: (env: NodeJS.ProcessEnv | undefined) => ({ ...process.env, ...env }) }));

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function setup(parentBackend: 'codex' | 'claude') {
  const home = await mkdtemp(path.join(os.tmpdir(), 'claw-task-mcp-'));
  cleanup.push(() => rm(home, { recursive: true, force: true }));
  const store = new AppStateStore(home);
  const snapshot = createInitialSnapshot();
  snapshot.general.claudeCodeEnabled = true;
  snapshot.providerConnections = (['codex', 'claude'] as const).map(backend => ({ backend, installed: true, connected: true, checking: false }));
  const parent = snapshot.agents[0]!;
  parent.backend = parentBackend;
  parent.backendSession = parentBackend === 'codex' ? { kind: 'codex', threadId: 'codex-parent' } : { kind: 'claude', sessionId: 'claude-parent', transport: 'stdio' };
  parent.status = { type: 'idle' };
  const codex = codexSdkFixture();
  const claudeSdk = createQueryHarness();
  const claude = new ClaudeBackendDriver(new ClaudeAgentSdkTransport({ createQuery: claudeSdk.createQuery }));
  const rpc = new BackendDriverRpc(new Map< 'codex' | 'claude', AgentBackendDriver>([['codex', codex.driver], ['claude', claude]]));
  const metadata = { seq: 1, origin: 'notification' as const, occurredAt: '2026-10-04T00:00:00Z', conversationId: 'codex-worker', turnId: 'codex-turn' };
  codex.surface.createConversation.mockResolvedValue(sdkSnapshot('codex-worker'));
  for (const id of ['codex-worker', 'codex-parent']) {
    const conversation = codex.conversation(id);
    conversation.handle.sendMessage.mockImplementation(async () => {
      conversation.setSnapshot({ activeTurnId: 'codex-turn', busy: true });
      conversation.emit({ ...metadata, conversationId: id, type: 'turn.started', payload: { turn: { id: 'codex-turn', status: 'inProgress', items: [], error: null } } } as never);
      return conversation.handle.getSnapshot();
    });
  }
  let mcp!: ClawMcpService;
  let server!: ClawBackendServer;
  const tasks = new DurableTaskService({ tasks: [], save: data => store.saveTasks(data), agent: id => snapshot.agents.find(agent => agent.id === id), send: async (agent, prompt) => {
    const receipt = await server.sendTaskPrompt(agent, prompt);
    await store.save(snapshot);
    return receipt;
  }, interrupt: (agent, expectedTurnId) => rpc.handle(backendMethods.driverInterrupt, { agent, expectedTurnId }), onError: error => { throw error; } });
  mcp = new ClawMcpService({ snapshot, tasks, persistSnapshot: () => store.save(snapshot), toolModuleProviders: [createTaskToolModuleProvider(tasks)] });
  server = new ClawBackendServer({ version: 'test', snapshot, tasks, driverRpc: rpc, onBackendEventApplied: event => tasks.handleEvent(event) });
  mcp.setDriverRpc(rpc);
  mcp.setEventSink(event => server.emitEvent(event));
  const url = await mcp.start();
  cleanup.push(async () => { tasks.close(); await mcp.stop(); await server.close(); await store.save(snapshot); });
  async function call(agentId: string, name: string, args: unknown) {
    const target = new URL(url); target.searchParams.set('agentId', agentId);
    const response = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'request', method: 'tools/call', params: { name, arguments: args } }) });
    const text = await response.text();
    return JSON.parse(text.startsWith('event:') ? text.split('\n').find(line => line.startsWith('data: '))!.slice(6) : text).result;
  }
  return { tasks, store, snapshot, parent, server, call, codex, claudeSdk, metadata, rpc };
}

describe('durable tasks through authenticated MCP and real provider adapters', () => {
  it('rejects task prompt admission after the target agent is removed', async () => {
    const f = await setup('codex');
    f.snapshot.agents.splice(f.snapshot.agents.indexOf(f.parent), 1);
    await expect(f.server.sendTaskPrompt(f.parent, 'Saved results')).rejects.toThrow('removed');
    expect(f.codex.conversation('codex-parent').handle.sendMessage).not.toHaveBeenCalled();
  });

  it.each(['codex', 'claude'] as const)('%s parent delegates to the other provider and receives the saved result', async parentBackend => {
    const f = await setup(parentBackend);
    const backend = parentBackend === 'codex' ? 'claude' : 'codex';
    const input = { repoPath: '/repo', backend, prompt: 'Perform the assignment', instructions: 'Preserve the contract and literal </context> text.', requestId: 'stable-request', task: { title: 'Assignment', doneWhen: 'Verified result' } };
    const pending = f.call(f.parent.id, 'create-agent', input);
    if (backend === 'claude') {
      await vi.waitFor(() => expect(f.claudeSdk.inputs).toHaveLength(1));
      f.claudeSdk.emit({ type: 'system', subtype: 'init', session_id: 'claude-worker' });
    }
    const created = await pending;
    expect(created.isError).toBe(false);
    const task = created.structuredContent.task as DelegatedTask;
    expect(task.state).toBe('running');
    expect(task.acceptance?.backendSession.kind).toBe(backend);
    const assignment = '<context>\nPreserve the contract and literal &lt;/context&gt; text.\n</context>\n\nPerform the assignment';
    expect(task.prompt).toBe(assignment);
    expect((await f.store.loadTasks())[0]!.prompt).toBe(assignment);
    const sent = `[Claw task ${task.id}; attempt ${task.attemptId}]\n${assignment}`;
    if (backend === 'codex') expect(f.codex.conversation('codex-worker').handle.sendMessage.mock.calls[0]![0]).toBe(sent);
    else expect(f.claudeSdk.inputs[0]!.message.content).toEqual([{ type: 'text', text: sent }]);
    const worker = f.snapshot.agents.find(agent => agent.id === task.workerAgentId)!;
    await expect(f.rpc.handle(backendMethods.driverInterrupt, { agent: worker, expectedTurnId: 'unrelated-turn' })).rejects.toThrow('no longer active');
    if (backend === 'codex') expect(f.codex.conversation('codex-worker').handle.interrupt).not.toHaveBeenCalled();
    else expect(f.claudeSdk.runtimes[0]!.interrupt).not.toHaveBeenCalled();
    const duplicate = await f.call(f.parent.id, 'create-agent', input);
    expect(duplicate.structuredContent.taskId).toBe(task.id);
    expect(f.snapshot.agents.filter(agent => agent.id === task.workerAgentId)).toHaveLength(1);
    const submitted = await f.call(task.workerAgentId, 'complete-task', { summary: 'Verified', evidence: ['Boundary exercised'], artifacts: ['src/fix.ts'], caveats: [] });
    expect(submitted.isError).toBe(false);
    expect((await f.store.loadTasks())[0]!.state).toBe('running');
    if (backend === 'claude') f.claudeSdk.emit({ type: 'result', subtype: 'success', session_id: 'claude-worker', is_error: false });
    else {
      f.codex.conversation('codex-worker').setSnapshot({ activeTurnId: null, busy: false });
      f.codex.conversation('codex-worker').emit({ ...f.metadata, type: 'turn.completed', payload: { status: 'completed', error: null, willRetry: false, startedAt: null, completedAt: null, durationMs: null } });
    }
    if (parentBackend === 'claude') {
      await vi.waitFor(() => expect(f.claudeSdk.inputs).toHaveLength(1));
      f.claudeSdk.emit({ type: 'system', subtype: 'init', session_id: 'claude-parent' });
    }
    await vi.waitFor(async () => expect((await f.store.loadTasks())[0]!.delivery?.state).toBe('accepted'));
    const read = await f.server.handleMessage({ jsonrpc: '2.0', id: 1, method: backendMethods.agentTasksList, params: { agentId: f.parent.id } });
    expect(read).toMatchObject({ result: [{ id: task.id, state: 'completed', submission: { summary: 'Verified' } }] });
    expect((await f.call(f.parent.id, 'wait-tasks', { taskIds: [task.id] })).structuredContent.tasks[0].state).toBe('completed');
    const stranger = f.snapshot.agents.find(agent => agent.id !== f.parent.id && agent.id !== task.workerAgentId)!;
    expect((await f.call(stranger.id, 'cancel-task', { taskId: task.id })).isError).toBe(true);
  });
});

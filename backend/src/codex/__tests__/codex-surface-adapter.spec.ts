import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Agent, RendererMessage } from '@codex-claw/core/contracts';
import type { BackendEvent } from '@codex-claw/core/backend-driver';
import { CodexAppServerClient, type RpcMessage, type RpcTransport } from '@codex-app-sdk/backend/protocol';
import { CodexSurface } from '@codex-app-sdk/backend';
import { decodeClawBackendEvent } from '@codex-claw/core/backend-protocol/events';
import { CodexBackendDriver } from '../codex-driver';
import { CodexSurfaceAgentAdapter } from '../codex-surface-adapter';

class FakeTransport implements RpcTransport {
  readonly sent: RpcMessage[] = [];
  readonly close = vi.fn(async () => undefined);
  readonly start = vi.fn(async () => undefined);
  skillBrandColor: unknown;
  skillDefaultPrompt: unknown;
  skillVersion = 1;
  modelVersion = 1;
  completeTurnsImmediately = false;
  resumedServiceTier: string | null = 'fast';
  turnsListDelayMs = 0;
  readonly fullHistoryTurnsByThreadId = new Map<string, Record<string, unknown>[]>();
  readonly summaryTurnsByThreadId = new Map<string, Record<string, unknown>[]>();
  readonly threadMetadataByThreadId = new Map<string, Record<string, unknown>>();
  readonly staleActiveThreadIds = new Set<string>();
  readonly goalsByThreadId = new Map<string, Record<string, unknown>>();
  private readonly listeners = new Set<(message: unknown) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();

  send(message: RpcMessage): void {
    this.sent.push(message);
    if (!('id' in message) || !('method' in message)) return;
    const params = 'params' in message ? message.params : undefined;
    queueMicrotask(() => {
      void Promise.resolve(this.response(message.method, params)).then((result) => {
        this.emit({ id: message.id, result });
      });
    });
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  emit(message: unknown): void {
    for (const listener of this.listeners) listener(message);
  }

  private response(method: string, params: unknown): unknown {
    switch (method) {
      case 'initialize': return { userAgent: 'adapter-test' };
      case 'experimentalFeature/list': return { data: [], nextCursor: null };
      case 'model/list': return {
        data: [{
          id: `gpt-${this.modelVersion}`, model: `gpt-${this.modelVersion}`,
          displayName: `GPT-${this.modelVersion}`, description: 'Test', hidden: false,
          supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Balanced' }],
          defaultReasoningEffort: 'medium', isDefault: true, inputModalities: ['text'], supportsPersonality: true,
          additionalSpeedTiers: [], serviceTiers: [{ id: 'fast', name: 'Fast', description: 'Faster responses' }], defaultServiceTier: 'fast', upgrade: null,
          upgradeInfo: null, availabilityNux: null,
        }],
        nextCursor: null,
      };
      case 'skills/list': {
        const cwd = (params as { cwds?: string[] }).cwds?.[0] ?? '/global';
        return {
          data: [{
            cwd,
            skills: [{
              name: `skill-${this.skillVersion}-${cwd}`,
              description: `Skill ${this.skillVersion} for ${cwd}`,
              path: `${cwd}/skill-${this.skillVersion}/SKILL.md`,
              scope: 'repo', enabled: true,
              interface: this.skillBrandColor === undefined && this.skillDefaultPrompt === undefined
                ? null
                : {
                    brandColor: this.skillBrandColor,
                    defaultPrompt: this.skillDefaultPrompt,
                  },
            }],
            errors: [],
          }],
        };
      }
      case 'plugin/installed': return {
        marketplaces: [{
          name: 'curated',
          plugins: [{
            id: 'app-69b31dc2110c8191b8b47dc98fe5a052',
            name: 'dropbox',
            installed: true,
            enabled: true,
            interface: { displayName: 'Dropbox' },
          }],
        }],
        marketplaceLoadErrors: [],
      };
      case 'permissionProfile/list': {
        const cwd = (params as { cwd?: string } | undefined)?.cwd;
        return {
          data: [
            { id: ':workspace', description: null, allowed: true },
            ...(cwd === '/workspace/a' ? [] : [{ id: ':danger-full-access', description: null, allowed: true }]),
          ],
          nextCursor: null,
        };
      }
      case 'configRequirements/read': return { requirements: null };
      case 'remoteControl/status/read':
      case 'remoteControl/enable': return {
        status: 'connected', serverName: 'Claw', installationId: 'installation-1', environmentId: 'environment-1',
      };
      case 'remoteControl/disable': return {
        status: 'disabled', serverName: 'Claw', installationId: 'installation-1', environmentId: null,
      };
      case 'remoteControl/pairing/start': return {
        pairingCode: 'opaque-pairing-payload', manualPairingCode: 'ABCD-EFGH',
        environmentId: 'environment-1', expiresAt: 1_900_000_000_000n,
      };
      case 'remoteControl/pairing/status': return { claimed: true };
      case 'remoteControl/client/list': return {
        data: [{
          clientId: 'client-1', displayName: 'Nicolas’s iPhone', deviceType: 'phone', platform: 'iOS',
          osVersion: '26', deviceModel: 'iPhone', appVersion: '1.0.0', lastSeenAt: 1_800_000_000_000n,
        }],
        nextCursor: null,
      };
      case 'remoteControl/client/revoke': return {};
      case 'account/read': return {
        account: { type: 'chatgpt', email: 'nico@example.com', planType: 'pro' },
        requiresOpenaiAuth: true,
      };
      case 'account/login/start': return {
        type: 'chatgpt',
        loginId: 'login-1',
        authUrl: 'https://auth.openai.com/login',
      };
      case 'account/login/cancel': return { status: 'canceled' };
      case 'account/logout': return {};
      case 'account/rateLimits/read': return {};
      case 'thread/list': return {
        data: [thread('thread-a', '/workspace/a'), thread('thread-b', '/workspace/b')],
        nextCursor: null,
      };
      case 'thread/start': {
        const cwd = String((params as { cwd?: string }).cwd ?? '/workspace/new');
        return resumeResponse(thread('thread-new', cwd));
      }
      case 'thread/resume': {
        const threadId = String((params as { threadId: string }).threadId);
        const cwd = String((params as { cwd?: string }).cwd ?? `/workspace/${threadId.at(-1)}`);
        const initialPage = this.fullHistoryTurnsByThreadId.get(threadId)
          ?? this.summaryTurnsByThreadId.get(threadId)
          ?? (this.staleActiveThreadIds.has(threadId) ? [turn(`turn-${threadId}`, 'inProgress')] : []);
        return resumeResponse(
          thread(threadId, cwd),
          initialPage.slice(0, 5),
          initialPage.length > 5 ? 'cursor-5' : null,
          this.resumedServiceTier,
        );
      }
      case 'thread/fork': {
        const cwd = String((params as { cwd?: string }).cwd ?? '/workspace/a');
        return { thread: thread('thread-forked', cwd) };
      }
      case 'thread/read': {
        const threadId = String((params as { threadId: string }).threadId);
        return {
          thread: thread(
            threadId,
            `/workspace/${threadId.at(-1)}`,
            this.threadMetadataByThreadId.get(threadId),
          ),
        };
      }
      case 'thread/turns/list': {
        const threadId = String((params as { threadId: string }).threadId);
        const cursor = (params as { cursor?: string | null }).cursor;
        const offset = cursor?.startsWith('cursor-') ? Number(cursor.slice('cursor-'.length)) : 0;
        const turns = this.fullHistoryTurnsByThreadId.get(threadId) ?? [];
        const data = turns.slice(offset, offset + 5);
        const result = {
          data,
          nextCursor: offset + data.length < turns.length ? `cursor-${offset + data.length}` : null,
          backwardsCursor: null,
        };
        return this.turnsListDelayMs > 0
          ? new Promise((resolve) => setTimeout(() => resolve(result), this.turnsListDelayMs))
          : result;
      }
      case 'thread/goal/get': {
        const threadId = String((params as { threadId: string }).threadId);
        return { goal: this.goalsByThreadId.get(threadId) ?? null };
      }
      case 'thread/goal/set': {
        const input = params as { threadId: string; objective: string };
        return { goal: {
          threadId: input.threadId, objective: input.objective, status: 'active', tokenBudget: null,
          tokensUsed: 0, timeUsedSeconds: 0, createdAt: 1, updatedAt: 1,
        } };
      }
      case 'thread/goal/clear': return {};
      case 'turn/start': {
        const threadId = String((params as { threadId: string }).threadId);
        return { turn: turn(`turn-${threadId}`, this.completeTurnsImmediately ? 'completed' : 'inProgress') };
      }
      case 'turn/steer': return { turnId: String((params as { expectedTurnId: string }).expectedTurnId) };
      case 'review/start': {
        const threadId = String((params as { threadId: string }).threadId);
        return {
          reviewThreadId: threadId,
          turn: turn(`review-${threadId}`, 'inProgress', [{
            type: 'userMessage',
            id: 'review-prompt',
            clientId: null,
            content: [{ type: 'text', text: 'current changes', textElements: [] }],
          }]),
        };
      }
      case 'thread/rollback': {
        const threadId = String((params as { threadId: string }).threadId);
        return { thread: thread(threadId, `/workspace/${threadId.at(-1)}`) };
      }
      case 'thread/settings/update': return {};
      case 'turn/interrupt': {
        const input = params as { threadId: string; turnId: string };
        this.emit({
          method: 'turn/completed',
          params: { threadId: input.threadId, turn: turn(input.turnId, 'interrupted') },
        });
        return {};
      }
      default: return {};
    }
  }
}

describe('CodexSurfaceAgentAdapter', () => {
  it('runs ephemeral generation with the agent folder and Codex defaults', async () => {
    const generateText = vi.fn().mockResolvedValue({ text: '{"message":"feat: generated"}' });
    const surface = {
      generateText,
      onEvent: vi.fn(() => () => undefined),
    } as unknown as CodexSurface;
    const adapter = new CodexSurfaceAgentAdapter(surface, vi.fn());
    const generationAgent: Agent = {
      ...agentA,
      folder: '~/src/project',
      backendDefaults: {
        kind: 'codex',
        model: 'gpt-test',
        reasoningEffort: 'high',
        serviceTier: 'fast',
      },
    };

    await expect(adapter.generateText(generationAgent, {
      prompt: 'Describe the change',
      cwd: generationAgent.folder!,
      developerInstructions: 'Return JSON.',
      outputSchema: { type: 'object' },
    })).resolves.toStrictEqual({ text: '{"message":"feat: generated"}' });
    expect(generateText).toHaveBeenCalledWith('Describe the change', expect.objectContaining({
      cwd: path.join(os.homedir(), 'src/project'),
      model: 'gpt-test',
      reasoningEffort: 'high',
      serviceTier: 'fast',
      developerInstructions: 'Return JSON.',
      outputSchema: { type: 'object' },
    }));
  });

  it('delegates runtime ownership to the embedding backend host', async () => {
    const surface = new CodexSurface();
    const closeSurface = vi.fn().mockResolvedValue(undefined);
    const adapter = new CodexSurfaceAgentAdapter(surface, closeSurface);

    await adapter.close();
    await adapter.close();

    expect(closeSurface).toHaveBeenCalledOnce();
  });

  it('maps official remote-control pairing data into Claw contracts', async () => {
    const { adapter, transport } = createAdapter();

    await expect(adapter.getDevicePairingStatus()).resolves.toStrictEqual({
      status: 'connected',
      serverName: 'Claw',
      installationId: 'installation-1',
      environmentId: 'environment-1',
      allowRemoteControl: null,
    });
    await expect(adapter.startDevicePairing()).resolves.toStrictEqual({
      pairingCode: 'opaque-pairing-payload',
      manualPairingCode: 'ABCD-EFGH',
      environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    });
    await expect(adapter.checkDevicePairing({
      pairingCode: 'opaque-pairing-payload',
      manualPairingCode: 'ABCD-EFGH',
      environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    })).resolves.toBe(true);
    await expect(adapter.listPairedDevices('environment-1')).resolves.toStrictEqual([{
      clientId: 'client-1',
      displayName: 'Nicolas’s iPhone',
      deviceType: 'phone',
      platform: 'iOS',
      osVersion: '26',
      deviceModel: 'iPhone',
      appVersion: '1.0.0',
      lastSeenAt: '2027-01-15T08:00:00.000Z',
    }]);
    await expect(adapter.revokePairedDevice('environment-1', 'client-1')).resolves.toBeUndefined();

    expect(lastRequest(transport, 'remoteControl/pairing/start')).toMatchObject({ params: { manualCode: true } });
    const pairingStatusRequest = lastRequest(transport, 'remoteControl/pairing/status');
    expect(pairingStatusRequest && 'params' in pairingStatusRequest ? pairingStatusRequest.params : undefined)
      .toStrictEqual({ pairingCode: 'opaque-pairing-payload' });
    expect(lastRequest(transport, 'remoteControl/client/revoke')).toMatchObject({
      params: { environmentId: 'environment-1', clientId: 'client-1' },
    });
  });

  it('uses the SDK account lifecycle for isolated-home authentication', async () => {
    const { adapter, transport } = createAdapter();

    await expect(adapter.getAuthentication()).resolves.toStrictEqual({
      account: { type: 'chatgpt', email: 'nico@example.com', planType: 'pro' },
      requiresOpenaiAuth: true,
      login: { status: 'idle', error: null },
    });
    await expect(adapter.startChatGptLogin()).resolves.toStrictEqual({
      loginId: 'login-1',
      authUrl: 'https://auth.openai.com/login',
    });
    await expect(adapter.cancelChatGptLogin()).resolves.toMatchObject({
      account: { type: 'chatgpt', email: 'nico@example.com', planType: 'pro' },
      login: { status: 'cancelled', error: null },
    });
    await expect(adapter.logout()).resolves.toMatchObject({
      account: { type: 'chatgpt', email: 'nico@example.com', planType: 'pro' },
    });

    expect(lastRequest(transport, 'account/login/start')).toBeDefined();
    expect(lastRequest(transport, 'account/login/cancel')).toBeDefined();
    expect(lastRequest(transport, 'account/logout')).toBeDefined();
  });

  it('supports the full public conversation lifecycle', async () => {
    const { adapter, transport } = createAdapter();

    await adapter.start();
    await expect(adapter.enableDevicePairing()).resolves.toMatchObject({ status: 'connected', allowRemoteControl: null });
    await expect(adapter.disableDevicePairing()).resolves.toMatchObject({ status: 'disabled', allowRemoteControl: null });
    await expect(adapter.checkDevicePairing({
      pairingCode: '',
      manualPairingCode: 'ABCD-EFGH',
      environmentId: 'environment-1',
      expiresAt: '2030-03-17T17:46:40.000Z',
    })).resolves.toBe(true);
    expect(adapter.getRuntimeStatus()).toMatchObject({ backend: 'codex', status: 'running' });
    expect(adapter.getCapabilities().approvalPresets).toContain('ask-for-approval');
    await expect(adapter.listModels()).resolves.toMatchObject([{
      id: 'gpt-1',
      supportedReasoningEfforts: [{ reasoningEffort: 'medium' }],
      serviceTiers: [{ id: 'fast' }],
    }]);
    await expect(adapter.listSkills({ ...agentA, folder: '~' }, true)).resolves.toEqual([
      expect.objectContaining({ id: expect.stringContaining('/skill-1/SKILL.md') }),
    ]);
    await expect(adapter.listPlugins()).resolves.toStrictEqual([{
      id: 'app-69b31dc2110c8191b8b47dc98fe5a052',
      name: 'dropbox',
      displayName: 'Dropbox',
      enabled: true,
    }]);
    await expect(adapter.listConversations(agentA)).resolves.toHaveLength(2);
    await expect(adapter.readConversationMessages('thread-a', 'agent-a')).resolves.toStrictEqual([]);

    await adapter.setConversationTitle(agentA, 'Renamed');
    await expect(adapter.setThreadGoal(agentA, 'Ship it')).resolves.toMatchObject({
      threadId: 'thread-a',
      goal: { objective: 'Ship it' },
    });
    await expect(adapter.clearThreadGoal(agentA)).resolves.toStrictEqual({ threadId: 'thread-a', cleared: true });
    await expect(adapter.setApprovalPreset(agentA, 'ask-for-approval')).resolves.toStrictEqual({
      threadId: 'thread-a',
      approvalPreset: 'ask-for-approval',
    });
    await expect(adapter.reviewThread(agentA, { type: 'uncommittedChanges' })).resolves.toMatchObject({
      threadId: 'thread-a',
      turnId: 'review-thread-a',
    });

    const sent = await adapter.sendPrompt(agentA, 'Hello', {
      model: 'gpt-1',
      planMode: true,
      backendOptions: { kind: 'codex', reasoningEffort: 'medium', serviceTier: 'fast' },
    });
    expect(sent).toMatchObject({ threadId: 'thread-a', turnId: expect.any(String) });
    await expect(adapter.steerPrompt(agentA, 'One more thing')).resolves.toMatchObject({ threadId: 'thread-a' });
    await expect(adapter.interruptTurn(agentA)).resolves.toStrictEqual({ threadId: 'thread-a', turnId: sent.turnId });

    expect(lastRequest(transport, 'thread/name/set')).toBeDefined();
    adapter.forgetAgentSession('agent-missing');
    adapter.forgetAgentSession('agent-a');
  });

  it('creates new agent conversations as user threads in their assigned folder', async () => {
    const { adapter, transport } = createAdapter();
    const agent = createAgent('agent-new', 'thread-new', '/workspace/new');
    delete agent.backendSession;

    await adapter.sendPrompt(agent, 'Start work');

    expect(lastRequest(transport, 'thread/start')).toMatchObject({
      params: {
        cwd: '/workspace/new',
        threadSource: 'user',
      },
    });
    expect(lastRequest(transport, 'thread/name/set')).toMatchObject({
      params: {
        threadId: 'thread-new',
        name: 'agent-new',
      },
    });
    const requestMethods = transport.sent
      .filter((message): message is RpcMessage & { method: string } => 'method' in message)
      .map((message) => message.method);
    expect(requestMethods.indexOf('thread/name/set')).toBeLessThan(requestMethods.indexOf('turn/start'));

    await adapter.setConversationTitle({
      ...agent,
      backendSession: { kind: 'codex', threadId: 'thread-new' },
    }, 'agent-new');
    expect(transport.sent.filter((message) => (
      'method' in message && message.method === 'thread/name/set'
    ))).toHaveLength(1);
  });

  it('creates and restores workspace-free quick chats without sending a cwd', async () => {
    const { adapter, surface, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    const quickChat: Agent = {
      ...createAgent('agent-chat', 'thread-new', '/unused'),
      folder: null,
      name: null,
      sessionKind: 'quickChat',
    };
    delete quickChat.backendSession;

    await adapter.sendPrompt(quickChat, 'Hello');

    expect(lastRequest(transport, 'thread/start')).toMatchObject({
      params: { threadSource: 'user' },
    });
    expect(lastRequest(transport, 'thread/start')).not.toMatchObject({
      params: { cwd: expect.anything() },
    });
    expect(transport.sent).not.toContainEqual(expect.objectContaining({ method: 'thread/name/set' }));

    const emitSurfaceEvent = (surface as unknown as {
      emitEvent(origin: 'notification', event: unknown): void;
    }).emitEvent.bind(surface);
    emitSurfaceEvent('notification', {
      type: 'conversation.summaryUpserted',
      conversationId: 'thread-new',
      payload: {
        reason: 'updated',
        summary: {
          id: 'thread-new',
          title: 'Plan a summer trip',
          preview: 'Plan a summer trip',
          cwd: '',
          status: 'idle',
          turnCount: 1,
          createdAt: '2026-08-30T00:00:00.000Z',
          updatedAt: '2026-08-30T00:00:01.000Z',
        },
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-chat',
      type: 'agent.updated',
      payload: expect.objectContaining({ conversationTitle: 'Plan a summer trip' }),
    }));

    adapter.forgetAgentSession(quickChat.id);
    quickChat.backendSession = { kind: 'codex', threadId: 'thread-new' };
    await adapter.hydrateAgent(quickChat);

    expect(lastRequest(transport, 'thread/resume')).not.toMatchObject({
      params: { cwd: expect.anything() },
    });
  });

  it('refreshes an unnamed quick chat title after app-server generates it', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    const quickChat: Agent = {
      ...createAgent('agent-chat', 'thread-new', '/unused'),
      folder: null,
      name: null,
      conversationTitle: 'Untitled conversation',
      sessionKind: 'quickChat',
    };
    delete quickChat.backendSession;

    await adapter.sendPrompt(quickChat, 'Hello');
    events.length = 0;
    transport.sent.length = 0;
    transport.threadMetadataByThreadId.set('thread-new', {
      name: 'hello',
      preview: 'hello',
      updatedAt: 1_700_000_002,
    });

    transport.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-new', turn: turn('turn-thread-new', 'completed') },
    });

    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({
        agentId: 'agent-chat',
        type: 'agent.updated',
        payload: expect.objectContaining({ conversationTitle: 'hello' }),
      }));
    });
    expect(lastRequest(transport, 'thread/read')).toMatchObject({
      params: { threadId: 'thread-new', includeTurns: false },
    });
  });

  it('routes simultaneous semantic conversation events without transcript replacement or cross-routing', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await Promise.all([adapter.hydrateAgent(agentA), adapter.hydrateAgent(agentB)]);
    await Promise.all([adapter.sendPrompt(agentA, 'Run A'), adapter.sendPrompt(agentB, 'Run B')]);
    events.length = 0;

    const prefix = 'x'.repeat(12_000);
    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-a', turnId: 'turn-thread-a', startedAtMs: 1,
        item: {
          type: 'agentMessage', id: 'agent-a', text: '', phase: 'commentary',
          memoryCitation: null, delivery: null,
        },
      },
    });
    transport.emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-a', turnId: 'turn-thread-a', itemId: 'agent-a', delta: prefix },
    });
    expect(events.filter((event) => event.type === 'message.delta')).toStrictEqual([
      expect.objectContaining({
        agentId: 'agent-a', threadId: 'thread-a', turnId: 'turn-thread-a',
        payload: expect.objectContaining({ itemId: 'agent-a', delta: prefix, phase: 'commentary' }),
      }),
    ]);
    expect(events.some((event) => event.type === 'thread.historyLoaded')).toBe(false);

    events.length = 0;
    transport.emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-a', turnId: 'turn-thread-a', itemId: 'agent-a', delta: ' suffix' },
    });
    expect(events).toStrictEqual([
      expect.objectContaining({
        type: 'message.delta', agentId: 'agent-a', threadId: 'thread-a',
        payload: expect.objectContaining({ itemId: 'agent-a', delta: ' suffix', phase: 'commentary' }),
      }),
    ]);

    events.length = 0;
    transport.emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-b', turnId: 'turn-thread-b', itemId: 'agent-b', delta: 'Only B' },
    });
    expect(events).toStrictEqual([
      expect.objectContaining({ type: 'message.delta', agentId: 'agent-b', threadId: 'thread-b' }),
    ]);
  });

  it('projects completed reasoning summaries without raw reasoning content', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-a', turnId: 'turn-reasoning', completedAtMs: 2,
        item: {
          type: 'reasoning',
          id: 'reasoning-1',
          summary: ['Inspecting the renderer flow'],
          content: ['raw reasoning must stay private'],
        },
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'message.updated',
      payload: {
        message: expect.objectContaining({
          parts: [{
            type: 'reasoning',
            summary: 'Inspecting the renderer flow',
            itemId: 'reasoning-1',
            summaryIndex: 0,
          }],
        }),
      },
    }));
    expect(JSON.stringify(events)).not.toContain('raw reasoning must stay private');
  });

  it('adapts SDK subagent events into app-owned tree events', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;
    transport.threadMetadataByThreadId.set('thread-child', {
      parentThreadId: 'thread-a',
      agentNickname: 'Kuhn',
      agentRole: 'researcher',
    });

    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-a', turnId: 'turn-subagent', startedAtMs: 1,
        item: {
          type: 'collabAgentToolCall', id: 'spawn-1', tool: 'spawnAgent', status: 'inProgress',
          senderThreadId: 'thread-a', receiverThreadIds: ['thread-child'], prompt: 'Inspect tests',
          model: 'gpt-5', reasoningEffort: 'high',
          agentsStates: { 'thread-child': { status: 'running', message: null } },
        },
      },
    });
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-a', turnId: 'turn-subagent', completedAtMs: 2,
        item: {
          type: 'subAgentActivity', id: 'activity-1', kind: 'interacted',
          agentThreadId: 'thread-child', agentPath: '/root/scout',
        },
      },
    });

    expect(events.slice(0, 2)).toStrictEqual([
      expect.objectContaining({
        type: 'subagent.operationChanged', agentId: 'agent-a', threadId: 'thread-a', turnId: 'turn-subagent',
        payload: {
          rootConversationId: 'thread-a',
          operation: expect.objectContaining({
            id: 'spawn-1', kind: 'spawnAgent', receiverConversationIds: ['thread-child'], prompt: 'Inspect tests',
          }),
          agentStates: { 'thread-child': { status: 'running' } },
        },
      }),
      expect.objectContaining({
        type: 'subagent.activityChanged', agentId: 'agent-a', threadId: 'thread-a', turnId: 'turn-subagent',
        payload: {
          rootConversationId: 'thread-a',
          parentConversationId: 'thread-a',
          activity: expect.objectContaining({
            id: 'activity-1', kind: 'interacted', conversationId: 'thread-child', agentPath: '/root/scout',
          }),
        },
      }),
    ]);

    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({
        type: 'subagent.identityChanged', agentId: 'agent-a', threadId: 'thread-a',
        payload: {
          rootConversationId: 'thread-a',
          conversationId: 'thread-child',
          agentNickname: 'Kuhn',
          agentRole: 'researcher',
        },
      }));
    });

    events.length = 0;
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-child', turnId: 'turn-child', completedAtMs: 3,
        item: {
          type: 'subAgentActivity', id: 'activity-root', kind: 'interacted',
          agentThreadId: 'thread-a', agentPath: '/root',
        },
      },
    });
    expect(events.filter((event) => event.type === 'subagent.activityChanged')).toStrictEqual([]);

    events.length = 0;
    transport.emit({
      method: 'turn/started',
      params: { threadId: 'thread-child', turn: turn('turn-child', 'inProgress') },
    });
    transport.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-child', turn: turn('turn-child', 'completed') },
    });

    expect(events.filter((event) => event.type === 'subagent.statusChanged')).toStrictEqual([
      expect.objectContaining({
        type: 'subagent.statusChanged',
        agentId: 'agent-a',
        threadId: 'thread-a',
        payload: {
          rootConversationId: 'thread-a',
          conversationId: 'thread-child',
          status: 'running',
        },
      }),
      expect.objectContaining({
        type: 'subagent.statusChanged',
        agentId: 'agent-a',
        threadId: 'thread-a',
        payload: {
          rootConversationId: 'thread-a',
          conversationId: 'thread-child',
          status: 'completed',
        },
      }),
    ]);
  });

  it('reads every live child message without reloading inherited history', async () => {
    const { adapter, transport } = createAdapter();
    await adapter.hydrateAgent(agentA);
    transport.fullHistoryTurnsByThreadId.set('thread-child', [
      turn('turn-parent', 'completed', [agentMessage('parent-answer', 'Inherited parent answer')]),
    ]);

    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-a', turnId: 'turn-subagent', startedAtMs: 1,
        item: {
          type: 'collabAgentToolCall', id: 'spawn-1', tool: 'spawnAgent', status: 'inProgress',
          senderThreadId: 'thread-a', receiverThreadIds: ['thread-child'], prompt: 'Inspect tests',
          model: 'gpt-5', reasoningEffort: 'high',
          agentsStates: { 'thread-child': { status: 'running', message: null } },
        },
      },
    });
    transport.emit({ method: 'thread/started', params: { thread: thread('thread-child', '/workspace/a') } });
    transport.emit({
      method: 'turn/started',
      params: { threadId: 'thread-child', turn: turn('turn-child-1', 'inProgress') },
    });
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-child', turnId: 'turn-child-1', completedAtMs: 2,
        item: agentMessage('child-answer-1', 'First child answer'),
      },
    });
    transport.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-child', turn: turn('turn-child-1', 'completed') },
    });
    transport.emit({
      method: 'turn/started',
      params: { threadId: 'thread-child', turn: turn('turn-child-2', 'inProgress') },
    });
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-child', turnId: 'turn-child-2', completedAtMs: 3,
        item: agentMessage('child-answer-2', 'Second child answer'),
      },
    });
    transport.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-child', turn: turn('turn-child-2', 'completed') },
    });

    const historyRequestCount = transport.sent.filter((message) => (
      'method' in message && message.method === 'thread/turns/list'
    )).length;
    await expect(adapter.readConversationMessages('thread-child', agentA.id)).resolves.toEqual([
      expect.objectContaining({
        turnId: 'turn-child-1',
        parts: [expect.objectContaining({ type: 'text', text: 'First child answer' })],
      }),
      expect.objectContaining({
        turnId: 'turn-child-2',
        parts: [expect.objectContaining({ type: 'text', text: 'Second child answer' })],
      }),
    ]);
    expect(transport.sent.filter((message) => (
      'method' in message && message.method === 'thread/turns/list'
    ))).toHaveLength(historyRequestCount);
  });

  it('reconciles a completed child status when its history is read after reload', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    transport.fullHistoryTurnsByThreadId.set('thread-child', [
      turn('turn-parent', 'completed', [agentMessage('parent-answer', 'Inherited parent answer')]),
      turn('turn-child', 'completed', [agentMessage('child-answer', 'Finished the probe')]),
    ]);
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    await expect(adapter.readConversationMessages('thread-child', agentA.id)).resolves.toEqual([
      expect.objectContaining({ role: 'assistant', status: 'complete' }),
    ]);

    expect(events).toContainEqual(expect.objectContaining({
      type: 'subagent.statusChanged',
      agentId: agentA.id,
      threadId: 'thread-a',
      payload: {
        rootConversationId: 'thread-a',
        conversationId: 'thread-child',
        status: 'completed',
      },
    }));
  });

  it('maps tool and plan mutations once while retaining Claw plan events', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    await adapter.sendPrompt(agentA, 'Plan and run');
    events.length = 0;

    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-a', turnId: 'turn-thread-a', startedAtMs: 1,
        item: {
          type: 'mcpToolCall', id: 'tool-a', server: 'tools', tool: 'Run', status: 'inProgress',
          arguments: {}, appContext: null, pluginId: null, result: null, error: null, durationMs: null,
        },
      },
    });
    events.length = 0;
    transport.emit({
      method: 'item/mcpToolCall/progress',
      params: { threadId: 'thread-a', turnId: 'turn-thread-a', itemId: 'tool-a', message: 'Halfway' },
    });
    expect(events).toStrictEqual([
      expect.objectContaining({ type: 'item.updated', agentId: 'agent-a', threadId: 'thread-a' }),
    ]);

    events.length = 0;
    const markdown = '# Plan\n- [ ] Implement';
    transport.emit({
      method: 'item/plan/delta',
      params: { threadId: 'thread-a', turnId: 'turn-thread-a', itemId: 'plan-a', delta: markdown },
    });
    expect(events).toStrictEqual([
      expect.objectContaining({
        type: 'turn.proposedPlanDelta', agentId: 'agent-a', threadId: 'thread-a',
        payload: expect.objectContaining({ itemId: 'plan-a', delta: markdown }),
      }),
    ]);

    events.length = 0;
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-a', turnId: 'turn-thread-a', completedAtMs: 2,
        item: { type: 'plan', id: 'plan-a', text: markdown },
      },
    });
    expect(events).toStrictEqual([
      expect.objectContaining({
        type: 'turn.proposedPlanCompleted', agentId: 'agent-a', threadId: 'thread-a',
        payload: { itemId: 'plan-a', markdown },
      }),
    ]);
  });

  it('maps SDK file activity into the app-owned event stream', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    await adapter.sendPrompt(agentA, 'Inspect and update files');
    events.length = 0;

    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-a', turnId: 'turn-thread-a', startedAtMs: 1,
        item: {
          type: 'commandExecution', id: 'read-file', command: 'cat README.md', cwd: '/workspace/a',
          source: 'unifiedExec', status: 'inProgress', commandActions: [
            { type: 'read', name: 'README.md', path: 'README.md' },
          ],
        },
      },
    });
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-a', turnId: 'turn-thread-a', completedAtMs: 2,
        item: {
          type: 'fileChange', id: 'create-file', status: 'completed', changes: [
            { kind: 'add', path: 'src/new-file.ts' },
          ],
        },
      },
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'file.activity', agentId: 'agent-a', threadId: 'thread-a', turnId: 'turn-thread-a',
        payload: {
          messageId: 'assistant-turn-thread-a', itemId: 'read-file',
          path: '/workspace/a/README.md', action: 'read', status: 'running',
        },
      }),
      expect.objectContaining({
        type: 'file.activity', agentId: 'agent-a', threadId: 'thread-a', turnId: 'turn-thread-a',
        payload: {
          messageId: 'assistant-turn-thread-a', itemId: 'create-file',
          path: '/workspace/a/src/new-file.ts', action: 'create', status: 'completed',
        },
      }),
    ]));
  });

  it('routes background approvals and cwd-scoped skill changes to their owning agents', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await Promise.all([adapter.hydrateAgent(agentA), adapter.hydrateAgent(agentB)]);
    events.length = 0;

    transport.emit({
      id: 'approval-b',
      method: 'item/commandExecution/requestApproval',
      params: {
        threadId: 'thread-b', turnId: 'turn-b', itemId: 'command-b', command: 'npm test',
        cwd: '/workspace/b', reason: 'Verify B', environmentId: null, commandActions: [],
        networkApprovalContext: null, additionalPermissions: null,
        availableDecisions: ['accept', 'acceptForSession', 'decline'], proposedExecpolicyAmendment: null,
      },
    });
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: 'backendApproval.requested', agentId: 'agent-b', threadId: 'thread-b',
    })));
    expect(events).toContainEqual(expect.objectContaining({
      type: 'backendApproval.requested',
      payload: { approval: expect.objectContaining({
        id: 'approval-b', kind: 'command', conversationId: 'thread-b', turnId: 'turn-b',
        itemId: 'command-b', command: 'npm test', cwd: '/workspace/b',
        allowedScopes: ['once', 'session'], canDeny: true,
      }) },
    }));
    expect(events.some((event) => event.agentId === 'agent-a' && event.type === 'backendApproval.requested')).toBe(false);
    await adapter.respondToClientRequest({ id: 'approval-b', payload: { decision: 'allow_conversation' } });
    expect(lastResponse(transport, 'approval-b')).toMatchObject({ result: { decision: 'acceptForSession' } });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'backendApproval.resolved', agentId: 'agent-b', threadId: 'thread-b',
      payload: expect.objectContaining({ decision: 'approve', scope: 'session', reason: 'host' }),
    }));

    events.length = 0;
    transport.skillVersion = 2;
    transport.emit({ method: 'skills/changed', params: {} });
    await vi.waitFor(() => {
      expect(events).toContainEqual(expect.objectContaining({
        type: 'skills.changed', agentId: 'agent-a', threadId: 'thread-a',
      }));
      expect(events).toContainEqual(expect.objectContaining({
        type: 'skills.changed', agentId: 'agent-b', threadId: 'thread-b',
      }));
      expect(events).toContainEqual(expect.objectContaining({
        type: 'skills.changed', agentId: 'agent-a', threadId: 'thread-a',
        payload: {
          cwd: '/workspace/a', status: 'loaded', skills: [expect.objectContaining({
            id: '/workspace/a/skill-2/SKILL.md', name: 'skill-2-/workspace/a', enabled: true,
          })],
        },
      }));
    });
    await expect(adapter.listSkills(agentA)).resolves.toMatchObject([{
      name: 'skill-2-/workspace/a', path: '/workspace/a/skill-2/SKILL.md',
    }]);
    await expect(adapter.listSkills(agentB)).resolves.toMatchObject([{
      name: 'skill-2-/workspace/b', path: '/workspace/b/skill-2/SKILL.md',
    }]);
  });

  it('emits a decodable skill update when the provider returns a null brand color', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    transport.skillBrandColor = null;
    transport.skillVersion = 2;
    transport.emit({ method: 'skills/changed', params: {} });

    await vi.waitFor(() => expect(events.some((event) => event.type === 'skills.changed')).toBe(true));
    const event = events.find((candidate): candidate is Extract<BackendEvent, { type: 'skills.changed' }> => (
      candidate.type === 'skills.changed'
    ))!;
    const notification = {
      ...event,
      seq: 1,
      occurredAt: event.occurredAt ?? '2026-09-05T00:00:00.000Z',
    };
    expect(decodeClawBackendEvent(notification)).toBe(notification);
    expect(event.payload.skills[0]).not.toHaveProperty('brandColor');

    transport.skillBrandColor = '#123abc';
    await expect(adapter.listSkills(agentA, true)).resolves.toEqual([
      expect.objectContaining({ brandColor: '#123abc' }),
    ]);
  });

  it('emits and lists decodable skills when the provider returns a null default prompt', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    transport.skillDefaultPrompt = null;
    transport.skillVersion = 2;
    transport.emit({ method: 'skills/changed', params: {} });

    await vi.waitFor(() => expect(events.some((event) => event.type === 'skills.changed')).toBe(true));
    const event = events.find((candidate): candidate is Extract<BackendEvent, { type: 'skills.changed' }> => (
      candidate.type === 'skills.changed'
    ))!;
    const notification = {
      ...event,
      seq: 1,
      occurredAt: event.occurredAt ?? '2026-09-05T00:00:00.000Z',
    };
    expect(decodeClawBackendEvent(notification)).toBe(notification);
    expect(event.payload.skills[0]).not.toHaveProperty('defaultPrompt');
    await expect(adapter.listSkills(agentA, true)).resolves.toEqual([
      expect.not.objectContaining({ defaultPrompt: expect.anything() }),
    ]);

    transport.skillDefaultPrompt = 'Review this repository';
    await expect(adapter.listSkills(agentA, true)).resolves.toEqual([
      expect.objectContaining({ defaultPrompt: 'Review this repository' }),
    ]);

    events.length = 0;
    transport.skillVersion = 3;
    transport.emit({ method: 'skills/changed', params: {} });
    await vi.waitFor(() => expect(events).toContainEqual(expect.objectContaining({
      type: 'skills.changed',
      payload: expect.objectContaining({
        skills: [expect.objectContaining({ defaultPrompt: 'Review this repository' })],
      }),
    })));
  });

  it('preserves image and file attachments through send and steer SDK turn input', async () => {
    const { adapter, transport } = createAdapter();
    const driver = new CodexBackendDriver(adapter);
    const attachments = [
      { type: 'image' as const, path: '/tmp/screenshot.png', detail: 'high' as const },
      { type: 'file' as const, path: '/tmp/README.md', name: 'README' },
    ];
    const prepared = driver.preparePromptOptions(agentA, { attachments, serviceTier: 'fast' });

    await driver.sendPrompt(agentA, 'Inspect attachments', prepared);

    expect(lastRequest(transport, 'turn/start')).toMatchObject({
      params: {
        threadId: 'thread-a',
        serviceTier: 'fast',
        input: [
          { type: 'text', text: 'Inspect attachments' },
          { type: 'localImage', path: '/tmp/screenshot.png', detail: 'high' },
          { type: 'mention', path: '/tmp/README.md', name: 'README' },
        ],
      },
    });

    await driver.steerPrompt(agentA, 'Inspect these instead', prepared);

    expect(lastRequest(transport, 'turn/steer')).toMatchObject({
      params: {
        threadId: 'thread-a',
        input: [
          { type: 'text', text: 'Inspect these instead' },
          { type: 'localImage', path: '/tmp/screenshot.png', detail: 'high' },
          { type: 'mention', path: '/tmp/README.md', name: 'README' },
        ],
      },
    });
  });

  it('restores the persisted service tier after cold conversation hydration', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    const persistedAgent: Agent = {
      ...agentA,
      backendDefaults: {
        kind: 'codex',
        ...(agentA.backendDefaults?.kind === 'codex' ? agentA.backendDefaults : {}),
        serviceTier: 'fast',
      },
    };
    transport.resumedServiceTier = 'default';
    adapter.onEvent((event) => {
      events.push(event);
      if (event.type !== 'thread.settingsUpdated') return;
      const threadSettings = (event.payload as { threadSettings?: { serviceTier?: string | null } }).threadSettings;
      if (!threadSettings || threadSettings.serviceTier === undefined) return;
      persistedAgent.backendDefaults = {
        kind: 'codex',
        ...(persistedAgent.backendDefaults?.kind === 'codex' ? persistedAgent.backendDefaults : {}),
        serviceTier: threadSettings.serviceTier,
      };
    });

    await adapter.hydrateAgent(persistedAgent);

    expect(lastRequest(transport, 'thread/settings/update')).toMatchObject({
      params: { threadId: 'thread-a', serviceTier: 'fast' },
    });
    const settingsEvents = events.filter((event) => event.type === 'thread.settingsUpdated');
    expect(settingsEvents.at(-1)).toMatchObject({
      agentId: 'agent-a',
      threadId: 'thread-a',
      payload: {
        threadSettings: expect.objectContaining({ serviceTier: 'fast' }),
      },
    });
  });

  it('projects completed generated images into renderer media parts', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-a', turnId: 'turn-image', startedAtMs: 1,
        item: {
          type: 'imageGeneration', id: 'image-live', status: 'inProgress',
          revisedPrompt: null, result: '',
        },
      },
    });
    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-a', turnId: 'turn-image', completedAtMs: 2,
        item: {
          type: 'imageGeneration', id: 'image-live', status: 'completed',
          revisedPrompt: 'Draw the route map', result: generatedPngBase64,
          savedPath: '/tmp/generated route.png',
        },
      },
    });

    await vi.waitFor(() => {
      const update = [...events].reverse().find((event) => event.type === 'message.updated');
      expect(update).toMatchObject({
        agentId: 'agent-a',
        threadId: 'thread-a',
        payload: {
          message: expect.objectContaining({
            parts: [
              expect.objectContaining({
                type: 'tool', id: 'image-live', status: 'completed',
              }),
              {
                type: 'media',
                itemId: 'image-live',
                media: {
                  url: 'file:///tmp/generated%20route.png',
                  alt: 'Generated image',
                  mimeType: 'image/png',
                  prompt: 'Draw the route map',
                  title: 'Generated image',
                },
              },
            ],
          }),
        },
      });
    });
  });

  it('refreshes models and uses handle-scoped approval capabilities', async () => {
    const { adapter, transport } = createAdapter();
    const driver = new CodexBackendDriver(adapter);
    await Promise.all([adapter.hydrateAgent(agentA), adapter.hydrateAgent(agentB)]);

    expect(driver.getCapabilities(agentA).approvalPresets).not.toContain('full-access');
    expect(driver.getCapabilities(agentB).approvalPresets).toContain('full-access');

    await expect(adapter.listModels()).resolves.toMatchObject([{
      id: 'gpt-1',
      serviceTiers: [{ id: 'fast', name: 'Fast' }],
      defaultServiceTier: 'fast',
    }]);
    transport.modelVersion = 2;
    await expect(adapter.listModels()).resolves.toMatchObject([{ id: 'gpt-2' }]);
    expect(transport.sent.filter((message) => 'method' in message && message.method === 'model/list').length).toBe(3);
  });

  it('retains a completed-immediately turn id', async () => {
    const { adapter, transport } = createAdapter();
    transport.completeTurnsImmediately = true;
    await expect(adapter.sendPrompt(agentA, 'Finish synchronously')).resolves.toStrictEqual({
      threadId: 'thread-a',
      turnId: 'turn-thread-a',
    });
  });

  it('interrupts an orphaned active turn before hydrating a cold conversation', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    transport.staleActiveThreadIds.add('thread-a');
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);

    expect(lastRequest(transport, 'turn/interrupt')).toMatchObject({
      params: { threadId: 'thread-a', turnId: 'turn-thread-a' },
    });
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'turn.completed',
      turnId: 'turn-thread-a',
      payload: { status: 'interrupted' },
    }));
    expect(events.find((event) => event.type === 'thread.historyLoaded')).toMatchObject({
      payload: { messages: expect.not.arrayContaining([expect.objectContaining({ status: 'streaming' })]) },
    });
  });

  it('keeps a resumed active goal working during cold hydration', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    transport.staleActiveThreadIds.add('thread-a');
    transport.goalsByThreadId.set('thread-a', {
      threadId: 'thread-a', objective: 'Finish the campaign', status: 'active', tokenBudget: null,
      tokensUsed: 10, timeUsedSeconds: 5, createdAt: 1, updatedAt: 2,
    });
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);

    expect(lastRequest(transport, 'turn/interrupt')).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'thread.goalUpdated',
      payload: { goal: expect.objectContaining({ status: 'active' }) },
    }));
  });

  it('reports an active resumed goal as working before its next turn is observable', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    transport.goalsByThreadId.set('thread-a', {
      threadId: 'thread-a', objective: 'Finish the campaign', status: 'active', tokenBudget: null,
      tokensUsed: 10, timeUsedSeconds: 5, createdAt: 1, updatedAt: 2,
    });
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);

    expect(lastRequest(transport, 'turn/interrupt')).toBeUndefined();
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }));
  });

  it('forwards completed goal status from the SDK', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    transport.emit({
      method: 'thread/goal/updated',
      params: {
        threadId: 'thread-a', turnId: 'turn-thread-a',
        goal: {
          threadId: 'thread-a', objective: 'Finish the campaign', status: 'complete', tokenBudget: null,
          tokensUsed: 20, timeUsedSeconds: 10, createdAt: 1, updatedAt: 3,
        },
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'thread.goalUpdated',
      payload: { goal: expect.objectContaining({ status: 'complete' }) },
    }));
  });

  it('keeps cached active history authoritative and reconciles through live completion events', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);
    await adapter.sendPrompt(agentA, 'Start work');
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'agent.statusChanged',
      payload: { type: 'working' },
    }));
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toHaveLength(1);

    events.length = 0;
    await adapter.hydrateAgent(agentA);

    expect(transport.sent.filter((message) => (
      'method' in message && message.method === 'thread/resume'
    ))).toHaveLength(1);
    expect(lastRequest(transport, 'turn/interrupt')).toBeUndefined();
    expect(events).toStrictEqual([
      expect.objectContaining({
        type: 'thread.historyLoaded',
        payload: expect.objectContaining({ preserveKnownTurns: true, replace: false }),
      }),
    ]);

    transport.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-a', turn: turn('turn-thread-a', 'interrupted') },
    });

    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'agent.statusChanged',
      payload: { type: 'idle' },
    }));
    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'turn.completed',
      turnId: 'turn-thread-a',
      payload: expect.objectContaining({ status: 'interrupted' }),
    }));
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toHaveLength(1);
  });

  it('publishes full persisted turn items from the initial history page', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    const turnId = 'turn-thread-a';
    transport.fullHistoryTurnsByThreadId.set('thread-a', [
      turn(turnId, 'completed', [
        agentMessage('agent-start', 'I’ll switch macOS to Dark appearance now.'),
        {
          type: 'commandExecution', id: 'command-settings', command: 'computer-use click',
          cwd: '/workspace/a', processId: null, source: 'unifiedExec', status: 'completed',
          commandActions: [], aggregatedOutput: 'clicked', exitCode: 0, durationMs: 20,
        },
        agentMessage('agent-final', 'Done — your Mac is now in Dark Mode.'),
      ]),
    ]);
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);

    const historyEvents = events.filter((event) => event.type === 'thread.historyLoaded');
    expect(historyEvents).toHaveLength(1);
    const history = historyEvents[0];
    expect(history).toMatchObject({
      payload: {
        replace: true,
        messages: [
          {
            role: 'assistant',
            parts: [
              { type: 'text', text: 'I’ll switch macOS to Dark appearance now.' },
              { type: 'tool', id: 'command-settings', kind: 'command' },
              { type: 'text', text: 'Done — your Mac is now in Dark Mode.' },
            ],
          },
        ],
      },
    });
  });

  it('preserves SDK tool kinds without a closed allowlist', async () => {
    const { adapter, surface, transport } = createAdapter();
    const events: BackendEvent[] = [];
    transport.fullHistoryTurnsByThreadId.set('thread-a', [
      turn('turn-search', 'completed', [{
        type: 'webSearch', id: 'search-history', query: 'codex app server', action: null, results: null,
      }]),
    ]);
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);

    expect(events).toContainEqual(expect.objectContaining({
      type: 'thread.historyLoaded',
      payload: expect.objectContaining({
        messages: [expect.objectContaining({
          parts: [expect.objectContaining({ id: 'search-history', kind: 'webSearch', type: 'tool' })],
        })],
      }),
    }));

    events.length = 0;
    const emitSurfaceEvent = (surface as unknown as {
      emitEvent(origin: 'notification', event: unknown): void;
    }).emitEvent.bind(surface);
    emitSurfaceEvent('notification', {
      type: 'tool.completed',
      conversationId: 'thread-a',
      turnId: 'turn-future',
      payload: {
        messageId: 'message-future',
        toolPart: {
          type: 'tool', id: 'future-tool', kind: 'futureSdkTool', title: 'Future tool', status: 'completed',
          input: { path: '/tmp/input.txt' }, output: { result: 'done', agentName: 'feature/contracts', private: 'omit' }, metadata: { cwd: '/workspace' },
        },
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'item.completed',
      payload: expect.objectContaining({
        messageId: 'message-future',
        toolPart: expect.objectContaining({
          id: 'future-tool', kind: 'futureSdkTool',
          input: { path: '/tmp/input.txt' }, output: { result: 'done', agentName: 'feature/contracts' }, metadata: { cwd: '/workspace' },
        }),
      }),
    }));
  });

  it('preserves retry metadata when adapting SDK turn errors', async () => {
    const { adapter, surface } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);
    events.length = 0;

    const emitSurfaceEvent = (surface as unknown as {
      emitEvent(origin: 'notification', event: unknown): void;
    }).emitEvent.bind(surface);
    emitSurfaceEvent('notification', {
      type: 'turn.error',
      conversationId: 'thread-a',
      turnId: 'turn-thread-a',
      payload: {
        error: { message: 'Reconnecting… 3/5' },
        willRetry: true,
      },
    });

    expect(events).toContainEqual(expect.objectContaining({
      agentId: 'agent-a',
      type: 'error',
      turnId: 'turn-thread-a',
      payload: {
        error: { message: 'Reconnecting… 3/5' },
        message: 'Reconnecting… 3/5',
        willRetry: true,
      },
    }));
  });

  it('publishes the initial five full turns before prepending requested history incrementally', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    transport.turnsListDelayMs = 25;
    transport.fullHistoryTurnsByThreadId.set('thread-a', Array.from({ length: 6 }, (_, index) => (
      turn(`turn-${6 - index}`, 'completed', [
        agentMessage(`message-${6 - index}`, `Message ${6 - index}`),
      ])
    )));
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);

    const initialHistory = events.filter((event) => event.type === 'thread.historyLoaded');
    expect(initialHistory).toHaveLength(1);
    expect(initialHistory[0]).toMatchObject({
      payload: {
        replace: true,
        messages: expect.arrayContaining([
          expect.objectContaining({ parts: [{ type: 'text', text: 'Message 6', itemId: 'message-6' }] }),
        ]),
      },
    });
    expect((initialHistory[0]?.payload as { messages: unknown[] }).messages).toHaveLength(5);

    await expect(adapter.loadOlderHistory(agentA)).resolves.toStrictEqual({ hasOlder: false });

    const historyEvents = events.filter((event) => event.type === 'thread.historyLoaded');
    expect(historyEvents).toHaveLength(2);
    expect(historyEvents[1]).toMatchObject({
      payload: {
        preserveKnownMessages: true,
        replace: false,
        messages: [
          expect.objectContaining({ parts: [{ type: 'text', text: 'Message 1', itemId: 'message-1' }] }),
        ],
      },
    });
    expect((historyEvents[1]?.payload as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it('omits unused tool payloads from history', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    const oversizedOutput = 'x'.repeat(128 * 1024);
    transport.fullHistoryTurnsByThreadId.set('thread-a', [
      turn('turn-large-tool', 'completed', [{
        type: 'mcpToolCall',
        id: 'tool-large',
        server: 'tools',
        tool: 'inspect',
        status: 'completed',
        arguments: { kind: 'schoolPride', path: '/tmp/data', to: 'agent-target', prompt: oversizedOutput },
        appContext: null,
        pluginId: null,
        result: {
          structuredContent: { kind: 'schoolPride', recipientName: 'Target agent', content: oversizedOutput },
          content: [{ type: 'text', text: oversizedOutput }],
        },
        error: null,
        durationMs: 10,
      }, {
        type: 'imageGeneration', id: 'history-image', status: 'completed',
        revisedPrompt: 'Draw a historical route map', result: generatedPngBase64,
        savedPath: '/tmp/historical route.png',
      }]),
    ]);
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);

    const history = events.find((event) => event.type === 'thread.historyLoaded');
    const toolPart = ((history?.payload as { messages: RendererMessage[] }).messages[0]?.parts[0]);
    expect(toolPart).toMatchObject({
      type: 'tool',
      id: 'tool-large',
      kind: 'mcp',
    });
    expect(toolPart).not.toHaveProperty('body');
    expect(toolPart).not.toHaveProperty('input');
    expect(toolPart).not.toHaveProperty('output');
    expect(toolPart).not.toHaveProperty('metadata');
    expect((history?.payload as { messages: RendererMessage[] }).messages[0]?.parts).toContainEqual({
      type: 'media',
      itemId: 'history-image',
      media: {
        url: 'file:///tmp/historical%20route.png',
        alt: 'Generated image',
        mimeType: 'image/png',
        prompt: 'Draw a historical route map',
        title: 'Generated image',
      },
    });
    expect(Buffer.byteLength(JSON.stringify(history))).toBeLessThan(64 * 1024);
  });

  it('projects announcement lifecycle without retaining spoken text or messages', async () => {
    const { adapter, surface } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;
    const emitSurfaceEvent = (surface as unknown as {
      emitEvent(origin: 'notification', event: unknown): void;
    }).emitEvent.bind(surface);
    emitSurfaceEvent('notification', {
      type: 'tool.completed',
      conversationId: 'thread-a',
      turnId: 'turn-announcement',
      payload: {
        messageId: 'message-announcement',
        toolPart: {
          type: 'tool',
          id: 'tool-announcement',
          kind: 'mcp',
          title: 'announce',
          status: 'completed',
          input: { phase: 'finish', text: 'A phrase that must not reach renderer state.' },
          output: {
          structuredContent: {
            success: true,
            phase: 'finish',
            outcome: 'skipped',
          },
          content: [{ type: 'text', text: 'private tool transcript' }],
          },
          metadata: { server: 'codex_claw', tool: 'announce' },
        },
      },
    });

    const completed = events.find((event) => event.type === 'item.completed');
    const part = (completed?.payload as { toolPart: RendererMessage['parts'][number] }).toolPart;
    expect(part).toMatchObject({
      type: 'tool',
      input: { phase: 'finish' },
      output: { structuredContent: { success: true, phase: 'finish', outcome: 'skipped' } },
    });
    expect(JSON.stringify(part)).not.toContain('phrase that must not');
    expect(JSON.stringify(part)).not.toContain('private tool transcript');
    expect(JSON.stringify(part)).not.toContain('Announcement queued');
  });

  it('suppresses server-owned action echoes while keeping hydrate and explicit resume ownership exact', async () => {
    const { adapter, surface, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    await adapter.resumeConversation(agentA, 'thread-a');
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toHaveLength(0);
    const cachedHandle = surface.conversation('thread-a');
    adapter.forgetAgentSession(agentA.id);
    expect(surface.conversation('thread-a')).not.toBe(cachedHandle);
    events.length = 0;

    await adapter.hydrateAgent(agentA);
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'thread.settingsUpdated',
      payload: expect.objectContaining({
        threadSettings: expect.objectContaining({ model: 'gpt-1', reasoningEffort: 'medium', serviceTier: 'fast' }),
      }),
    }));
    events.length = 0;

    await adapter.hydrateAgent(agentA);
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toStrictEqual([
      expect.objectContaining({ payload: expect.objectContaining({ preserveKnownTurns: true, replace: false }) }),
    ]);
    events.length = 0;

    await adapter.setThreadGoal(agentA, 'Ship it');
    await adapter.clearThreadGoal(agentA);
    expect(events.some((event) => event.type === 'thread.goalUpdated' || event.type === 'thread.goalCleared')).toBe(false);

    await adapter.sendPrompt(agentA, 'Run once');
    await adapter.steerPrompt(agentA, 'Try smaller');
    expect(events.some((event) => event.type === 'message.steer')).toBe(false);
    expect(events.some((event) => event.type === 'thread.historyLoaded')).toBe(false);

    transport.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-a', turn: turn('turn-thread-a', 'completed') },
    });
    events.length = 0;
    await adapter.rollbackToTurn(agentA, 'turn-thread-a');
    expect(events.some((event) => event.type === 'thread.historyLoaded')).toBe(false);
  });

  it('forks through the SDK handle and maps the returned history', async () => {
    const { adapter, transport } = createAdapter();
    const targetAgent = createForkTarget();
    transport.fullHistoryTurnsByThreadId.set('thread-forked', [
      turn('turn-forked', 'completed', [agentMessage('message-forked', 'Forked answer')]),
    ]);

    await expect(adapter.forkConversation(agentA, targetAgent)).resolves.toMatchObject({
      threadId: 'thread-forked',
      messages: [expect.objectContaining({
        agentId: 'agent-forked',
        parts: [expect.objectContaining({ type: 'text', text: 'Forked answer' })],
      })],
    });
    expect(lastRequest(transport, 'thread/fork')).toMatchObject({
      params: { threadId: 'thread-a', cwd: '/workspace/a' },
    });
  });

  it('forwards an absolute host message index to the SDK fork operation', async () => {
    const { adapter, transport } = createAdapter();
    const targetAgent = createForkTarget();
    transport.fullHistoryTurnsByThreadId.set('thread-a', [
      turn('turn-source', 'completed', [agentMessage('message-source', 'Source answer')]),
    ]);
    transport.fullHistoryTurnsByThreadId.set('thread-forked', [
      turn('turn-source', 'completed', [agentMessage('message-source', 'Source answer')]),
    ]);
    await adapter.hydrateAgent(agentA);

    await expect(adapter.forkConversation(agentA, targetAgent, 0)).resolves.toMatchObject({
      threadId: 'thread-forked',
    });
    expect(lastRequest(transport, 'thread/fork')).toMatchObject({
      params: { threadId: 'thread-a', lastTurnId: 'turn-source' },
    });
  });

  it('materializes an SDK-marked slash review prompt without replacing history', async () => {
    const { adapter } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    await adapter.sendPrompt(agentA, '/review');

    expect(events.filter((event) => event.type === 'message.userSubmitted')).toStrictEqual([
      expect.objectContaining({
        agentId: agentA.id,
        threadId: 'thread-a',
        payload: {
          message: expect.objectContaining({
            role: 'user',
            parts: [{
              type: 'text',
              text: 'Review the current code changes (staged, unstaged, and untracked files) and provide prioritized findings.',
            }],
          }),
        },
      }),
    ]);
    expect(events.some((event) => event.type === 'thread.historyLoaded')).toBe(false);
  });

  it('forwards user messages submitted through remote control', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    transport.emit({
      method: 'turn/started',
      params: { threadId: 'thread-a', turn: turn('turn-remote', 'inProgress') },
    });
    transport.emit({
      method: 'item/started',
      params: {
        threadId: 'thread-a', turnId: 'turn-remote', startedAtMs: 1_700_000_000_000,
        item: {
          type: 'userMessage', id: 'remote-user-message', clientId: null,
          content: [{ type: 'text', text: 'Sent from my iPhone', textElements: [] }],
        },
      },
    });

    expect(events.filter((event) => event.type === 'message.userSubmitted')).toStrictEqual([
      expect.objectContaining({
        agentId: agentA.id,
        threadId: 'thread-a',
        turnId: 'turn-remote',
        payload: {
          message: expect.objectContaining({
            role: 'user',
            parts: [{ type: 'text', text: 'Sent from my iPhone' }],
          }),
        },
      }),
    ]);
    expect(events.some((event) => event.type === 'thread.historyLoaded')).toBe(false);
  });

  it('revalidates an idle cached transcript after its 15-minute freshness ttl', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
      const { adapter, transport } = createAdapter();
      const events: BackendEvent[] = [];
      adapter.onEvent((event) => events.push(event));

      await adapter.hydrateAgent(agentA);
      events.length = 0;
      vi.setSystemTime(new Date('2026-08-01T00:05:00.001Z'));

      await adapter.hydrateAgent(agentA);

      expect(transport.sent.filter((message) => (
        'method' in message && message.method === 'thread/resume'
      ))).toHaveLength(1);

      vi.setSystemTime(new Date('2026-08-01T00:15:00.001Z'));

      await adapter.hydrateAgent(agentA);

      expect(transport.sent.filter((message) => (
        'method' in message && message.method === 'thread/resume'
      ))).toHaveLength(2);
      expect(events.filter((event) => event.type === 'thread.historyLoaded')).toStrictEqual([
        expect.objectContaining({ payload: expect.objectContaining({ preserveKnownTurns: true, replace: false }) }),
        expect.objectContaining({ payload: expect.objectContaining({ preserveKnownTurns: true, replace: false }) }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('replays cached history when a fresh renderer hydrates the same agent', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    transport.fullHistoryTurnsByThreadId.set('thread-a', [
      turn('turn-cached', 'completed', [agentMessage('message-cached', 'Cached answer')]),
    ]);
    adapter.onEvent((event) => events.push(event));

    await adapter.hydrateAgent(agentA);
    events.length = 0;

    await adapter.hydrateAgent(agentA);

    expect(transport.sent.filter((message) => (
      'method' in message && message.method === 'thread/resume'
    ))).toHaveLength(1);
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toStrictEqual([
      expect.objectContaining({
        agentId: agentA.id,
        payload: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              parts: [expect.objectContaining({ type: 'text', text: 'Cached answer' })],
            }),
          ]),
          preserveKnownTurns: true,
          replace: false,
        }),
      }),
    ]);
  });

  it('maps notification-only compaction completion once and ignores speculative action starts', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await adapter.hydrateAgent(agentA);
    events.length = 0;

    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-a', turnId: 'turn-notification-only', completedAtMs: 2,
        item: { type: 'contextCompaction', id: 'compact-notification-only' },
      },
    });
    expect(events.filter((event) => event.type === 'context.compactionStarted')).toStrictEqual([
      expect.objectContaining({
        agentId: 'agent-a', threadId: 'thread-a', turnId: 'turn-notification-only',
        payload: { itemId: 'compact-notification-only' },
      }),
    ]);
    expect(events.filter((event) => event.type === 'context.compactionCompleted')).toHaveLength(1);

    await adapter.sendPrompt(agentA, 'Create a turn');
    transport.emit({
      method: 'turn/completed',
      params: { threadId: 'thread-a', turn: turn('turn-thread-a', 'completed') },
    });
    events.length = 0;
    await adapter.compactThread(agentA);
    expect(events.filter((event) => event.type === 'context.compactionStarted')).toHaveLength(0);

    transport.emit({
      method: 'item/completed',
      params: {
        threadId: 'thread-a', turnId: 'turn-compaction', completedAtMs: 3,
        item: { type: 'contextCompaction', id: 'compact-action' },
      },
    });
    expect(events.filter((event) => (
      event.type === 'context.compactionStarted' || event.type === 'context.compactionCompleted'
    )).map((event) => ({ type: event.type, turnId: event.turnId }))).toStrictEqual([
      { type: 'context.compactionStarted', turnId: 'turn-compaction' },
      { type: 'context.compactionCompleted', turnId: 'turn-compaction' },
    ]);
  });
});

const agentA = createAgent('agent-a', 'thread-a', '/workspace/a');
const agentB = createAgent('agent-b', 'thread-b', '/workspace/b');
const generatedPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function createAdapter(): { adapter: CodexSurfaceAgentAdapter; surface: CodexSurface; transport: FakeTransport } {
  const transport = new FakeTransport();
  const surface = new CodexSurface({
    autoSelectFirstConversation: false,
    client: new CodexAppServerClient(transport),
  });
  return { adapter: new CodexSurfaceAgentAdapter(surface), surface, transport };
}

function createAgent(id: string, threadId: string, folder: string): Agent {
  return {
    id,
    name: id,
    folder,
    backend: 'codex',
    backendSession: { kind: 'codex', threadId },
    backendDefaults: { kind: 'codex', approvalPreset: 'ask-for-approval' },
    status: { type: 'idle' },
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
}

function createForkTarget(): Agent {
  const target = createAgent('agent-forked', 'thread-forked', '/workspace/a');
  delete target.backendSession;
  return target;
}

function thread(id: string, cwd: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, preview: id, name: id, cwd, status: { type: 'idle' },
    createdAt: 1_700_000_000, updatedAt: 1_700_000_001, recencyAt: null, turns: [],
    ...overrides,
  };
}

function turn(
  id: string,
  status: string,
  items: Record<string, unknown>[] = [],
): Record<string, unknown> {
  return { id, status, items, itemsView: 'full', startedAt: 1_700_000_000, completedAt: null, error: null };
}

function agentMessage(id: string, text: string): Record<string, unknown> {
  return { type: 'agentMessage', id, text, phase: null, memoryCitation: null };
}

function resumeResponse(
  value: Record<string, unknown>,
  turns: Record<string, unknown>[] = [],
  nextCursor: string | null = null,
  serviceTier: string | null = 'fast',
): Record<string, unknown> {
  return {
    thread: value,
    model: 'gpt-5',
    cwd: value.cwd,
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    sandbox: {
      type: 'workspaceWrite', writableRoots: [value.cwd], networkAccess: false,
      excludeTmpdirEnvVar: false, excludeSlashTmp: false,
    },
    activePermissionProfile: { id: ':workspace', extends: null },
    reasoningEffort: 'medium',
    serviceTier,
    initialTurnsPage: { data: turns, nextCursor, backwardsCursor: null },
  };
}

function lastRequest(transport: FakeTransport, method: string): RpcMessage | undefined {
  return [...transport.sent].reverse().find((message) => 'method' in message && message.method === method);
}

function lastResponse(transport: FakeTransport, id: string): RpcMessage | undefined {
  return [...transport.sent].reverse().find((message) => (
    'id' in message && message.id === id && !('method' in message)
  ));
}

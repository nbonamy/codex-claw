import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@codex-claw/shared/contracts';
import type { BackendEvent } from '@codex-claw/shared/backend-driver';
import { CodexAppServerClient, type RpcMessage, type RpcTransport } from 'codex-app-sdk/codex';
import { CodexSurface } from 'codex-app-sdk/node';
import { CodexBackendDriver } from '../codex-driver';
import { CodexSurfaceAgentAdapter } from '../codex-surface-adapter';

class FakeTransport implements RpcTransport {
  readonly sent: RpcMessage[] = [];
  readonly close = vi.fn(async () => undefined);
  readonly start = vi.fn(async () => undefined);
  skillVersion = 1;
  modelVersion = 1;
  completeTurnsImmediately = false;
  turnsListDelayMs = 0;
  readonly fullHistoryTurnsByThreadId = new Map<string, Record<string, unknown>[]>();
  readonly summaryTurnsByThreadId = new Map<string, Record<string, unknown>[]>();
  readonly staleActiveThreadIds = new Set<string>();
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
              scope: 'repo', enabled: true, interface: null,
            }],
            errors: [],
          }],
        };
      }
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
        );
      }
      case 'thread/read': {
        const threadId = String((params as { threadId: string }).threadId);
        return { thread: thread(threadId, `/workspace/${threadId.at(-1)}`) };
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
      case 'thread/goal/get': return { goal: null };
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
  it('routes simultaneous semantic conversation events without transcript replacement or cross-routing', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));
    await Promise.all([adapter.hydrateAgent(agentA), adapter.hydrateAgent(agentB)]);
    await Promise.all([adapter.sendPrompt(agentA, 'Run A'), adapter.sendPrompt(agentB, 'Run B')]);
    events.length = 0;

    const prefix = 'x'.repeat(12_000);
    transport.emit({
      method: 'item/agentMessage/delta',
      params: { threadId: 'thread-a', turnId: 'turn-thread-a', itemId: 'agent-a', delta: prefix },
    });
    expect(events.filter((event) => event.type === 'message.delta')).toStrictEqual([
      expect.objectContaining({
        agentId: 'agent-a', threadId: 'thread-a', turnId: 'turn-thread-a',
        payload: expect.objectContaining({ itemId: 'agent-a', delta: prefix }),
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
        payload: expect.objectContaining({ itemId: 'agent-a', delta: ' suffix' }),
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
      const history = [...events].reverse().find((event) => event.type === 'thread.historyLoaded');
      expect(history).toMatchObject({
        agentId: 'agent-a',
        threadId: 'thread-a',
        payload: {
          messages: [expect.objectContaining({
            parts: [
              expect.objectContaining({
                type: 'tool', id: 'image-live', status: 'completed',
              }),
              {
                type: 'media',
                itemId: 'image-live',
                media: {
                  url: `data:image/png;base64,${generatedPngBase64}`,
                  alt: 'Generated image',
                  mimeType: 'image/png',
                  prompt: 'Draw the route map',
                  title: 'Generated image',
                },
              },
            ],
          })],
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
    expect(events).toHaveLength(0);

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
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toHaveLength(0);
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

  it('publishes the initial five full turns before merging unknown background history', async () => {
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

    await vi.waitFor(() => {
      const historyEvents = events.filter((event) => event.type === 'thread.historyLoaded');
      expect(historyEvents).toHaveLength(2);
      expect(historyEvents[1]).toMatchObject({
        payload: { preserveKnownTurns: true, replace: false },
      });
      expect((historyEvents[1]?.payload as { messages: unknown[] }).messages).toHaveLength(6);
    });
  });

  it('suppresses server-owned action echoes while keeping hydrate and explicit resume ownership exact', async () => {
    const { adapter, transport } = createAdapter();
    const events: BackendEvent[] = [];
    adapter.onEvent((event) => events.push(event));

    await adapter.resumeConversation(agentA, 'thread-a');
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toHaveLength(0);
    adapter.forgetAgentSession(agentA.id);
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
    expect(events.filter((event) => event.type === 'thread.historyLoaded')).toHaveLength(0);

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

  it('revalidates an idle cached transcript after its freshness ttl', async () => {
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
      ))).toHaveLength(2);
      expect(events.filter((event) => event.type === 'thread.historyLoaded')).toStrictEqual([
        expect.objectContaining({ payload: expect.objectContaining({ preserveKnownTurns: true, replace: false }) }),
      ]);
    } finally {
      vi.useRealTimers();
    }
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

function createAdapter(): { adapter: CodexSurfaceAgentAdapter; transport: FakeTransport } {
  const transport = new FakeTransport();
  const surface = new CodexSurface({
    autoSelectFirstConversation: false,
    client: new CodexAppServerClient(transport),
  });
  return { adapter: new CodexSurfaceAgentAdapter(surface), transport };
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

function thread(id: string, cwd: string): Record<string, unknown> {
  return {
    id, preview: id, name: id, cwd, status: { type: 'idle' },
    createdAt: 1_700_000_000, updatedAt: 1_700_000_001, recencyAt: null, turns: [],
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
    serviceTier: 'fast',
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

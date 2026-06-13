import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';
import type { AppSnapshot, CreateLoopInput, UpdateLoopInput } from '@codex-claw/shared/contracts';
import type { WorkBacklogConfigurationInput, WorkProviderKind } from '@codex-claw/shared/contracts';
import type { BackendEvent } from '@codex-claw/shared/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { clearLoopExecutionHistoryInSnapshot, createLoopInSnapshot, deleteLoopExecutionFromSnapshot, deleteLoopFromSnapshot, updateLoopInSnapshot } from '@codex-claw/shared/loop-manager';
import { BackendDriverRpc } from './driver-rpc';
import type { LoopRunner } from './loops/runner';
import type { WorkIntegrationManager } from './work-integrations/manager';

export type ClawBackendServerOptions = {
  version: string;
  pid?: number;
  snapshot?: AppSnapshot;
  driverRpc?: BackendDriverRpc;
  onEvent?: (event: ClawBackendEvent) => void;
  saveSnapshot?: (snapshot: AppSnapshot) => Promise<void>;
  workIntegrations?: WorkIntegrationManager;
  loopRunner?: Pick<LoopRunner, 'runAll' | 'runLoop'>;
};

export class ClawBackendServer {
  private readonly version: string;
  private readonly pid: number;
  private readonly snapshot: AppSnapshot;
  private readonly driverRpc?: BackendDriverRpc;
  private readonly onEvent?: (event: ClawBackendEvent) => void;
  private readonly saveSnapshot?: (snapshot: AppSnapshot) => Promise<void>;
  private readonly workIntegrations?: WorkIntegrationManager;
  private readonly loopRunner?: Pick<LoopRunner, 'runAll' | 'runLoop'>;
  private unsubscribeDriverEvents?: () => void;
  private lastEventSeq = 0;

  constructor(options: ClawBackendServerOptions) {
    this.version = options.version;
    this.pid = options.pid ?? process.pid;
    this.snapshot = options.snapshot ?? createEmptySnapshot();
    this.driverRpc = options.driverRpc;
    this.onEvent = options.onEvent;
    this.saveSnapshot = options.saveSnapshot;
    this.workIntegrations = options.workIntegrations;
    this.loopRunner = options.loopRunner;
    this.unsubscribeDriverEvents = this.driverRpc?.onEvent((event) => this.handleBackendEvent(event));
  }

  async handleMessage(message: ClawRpcMessage): Promise<ClawRpcResponse | undefined> {
    if (isClawRpcNotification(message)) {
      return undefined;
    }

    if (!isClawRpcRequest(message)) {
      return createClawRpcError(null, clawRpcErrorCodes.invalidRequest, 'Backend received a JSON-RPC response where a request was expected.');
    }

    switch (message.method) {
      case 'backend/health':
        return createClawRpcResult(message.id, {
          ok: true,
          name: 'clawd',
          version: this.version,
          pid: this.pid,
        });
      case 'snapshot/get':
        return createClawRpcResult(message.id, {
          snapshot: this.snapshot,
          lastEventSeq: this.lastEventSeq,
        });
      case 'workProvider/connect':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().connect(requireWorkProvider(message.params)));
      case 'workProvider/openAuthorization':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().openAuthorization(requireWorkProvider(message.params)));
      case 'workProvider/completeConnection':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().completeConnection(requireWorkProvider(message.params)));
      case 'workProvider/disconnect':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().disconnect(requireWorkProvider(message.params)));
      case 'workProvider/listRepositories':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().listRepositories(requireWorkProvider(message.params)));
      case 'workProvider/configureBacklog':
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().configureBacklog(requireBacklogConfiguration(message.params)));
      case 'workProvider/listItems': {
        const params = requireRecord(message.params);
        return createClawRpcResult(message.id, await this.requireWorkIntegrations().listItems(requireWorkProvider(params), requireString(params.repositoryId, 'repositoryId')));
      }
      case 'loop/create': {
        const loop = createLoopInSnapshot(this.snapshot, requireLoopCreateInput(message.params));
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, 'Invalid loop configuration.');
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/update': {
        const input = requireLoopUpdateInput(message.params);
        const loop = updateLoopInSnapshot(this.snapshot, input);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found or invalid: ${input.id}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/run': {
        const loopId = requireLoopId(message.params);
        if (!this.snapshot.loops.some((loop) => loop.id === loopId)) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found: ${loopId}`);
        }
        await this.requireLoopRunner().runLoop(loopId);
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'loop/runDue': {
        await this.requireLoopRunner().runAll();
        return createClawRpcResult(message.id, this.snapshot);
      }
      case 'loop/history/clear': {
        const loopId = requireLoopId(message.params);
        const loop = clearLoopExecutionHistoryInSnapshot(this.snapshot, loopId);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found: ${loopId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/execution/delete': {
        const params = requireRecord(message.params);
        const loopId = requireString(params.loopId, 'loopId');
        const executionId = requireString(params.executionId, 'executionId');
        const loop = deleteLoopExecutionFromSnapshot(this.snapshot, loopId, executionId);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop execution not found: ${loopId}/${executionId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      case 'loop/delete': {
        const loopId = requireLoopId(message.params);
        const loop = deleteLoopFromSnapshot(this.snapshot, loopId);
        if (!loop) {
          return createClawRpcError(message.id, clawRpcErrorCodes.internalError, `Loop not found: ${loopId}`);
        }
        return createClawRpcResult(message.id, await this.persistAndEmitSnapshot());
      }
      default:
        if (this.driverRpc) {
          try {
            const result = await this.driverRpc.handle(message.method, message.params);
            if (result !== undefined) {
              return createClawRpcResult(message.id, result);
            }
          } catch (error) {
            return createClawRpcError(message.id, clawRpcErrorCodes.internalError, error instanceof Error ? error.message : String(error));
          }
        }
        return createClawRpcError(message.id, clawRpcErrorCodes.methodNotFound, `Unknown backend method: ${message.method}`);
    }
  }

  async close(): Promise<void> {
    this.unsubscribeDriverEvents?.();
    await this.driverRpc?.close();
  }

  emitEvent(event: BackendEvent): void {
    this.handleBackendEvent(event);
  }

  private requireWorkIntegrations(): WorkIntegrationManager {
    if (!this.workIntegrations) {
      throw new Error('Work integrations are not configured.');
    }
    return this.workIntegrations;
  }

  private requireLoopRunner(): Pick<LoopRunner, 'runAll' | 'runLoop'> {
    if (!this.loopRunner) {
      throw new Error('Loop runner is not configured.');
    }
    return this.loopRunner;
  }

  private async persistAndEmitSnapshot(): Promise<AppSnapshot> {
    await this.saveSnapshot?.(this.snapshot);
    this.handleBackendEvent({
      type: 'snapshot.updated',
      payload: this.snapshot,
    }, { persist: false });
    return this.snapshot;
  }

  private handleBackendEvent(event: BackendEvent, options: { persist?: boolean } = {}): void {
    this.lastEventSeq += 1;
    this.onEvent?.({
      ...event,
      seq: this.lastEventSeq,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload,
    });
    if (options.persist !== false && shouldPersistSnapshotForEvent(event)) {
      void this.saveSnapshot?.(this.snapshot);
    }
  }
}

function requireBacklogConfiguration(params: unknown): WorkBacklogConfigurationInput {
  const record = requireRecord(params);
  const input = record.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Invalid work backlog configuration input.');
  }
  return input as WorkBacklogConfigurationInput;
}

function requireWorkProvider(params: unknown): WorkProviderKind {
  const record = requireRecord(params);
  const provider = requireString(record.provider, 'provider');
  if (provider !== 'github') {
    throw new Error(`Unsupported work provider: ${provider}`);
  }
  return provider;
}

function requireLoopCreateInput(params: unknown): CreateLoopInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as CreateLoopInput;
}

function requireLoopUpdateInput(params: unknown): UpdateLoopInput {
  const record = requireRecord(params);
  return requireRecord(record.input) as UpdateLoopInput;
}

function requireLoopId(params: unknown): string {
  const record = requireRecord(params);
  return requireString(record.loopId, 'loopId');
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid work integration request params.');
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function shouldPersistSnapshotForEvent(event: BackendEvent): boolean {
  return event.type === 'agent.updated' ||
    event.type === 'snapshot.updated' ||
    event.type === 'workBacklog.assignmentUpdated' ||
    event.type === 'thread.started' ||
    event.type === 'thread.settingsUpdated' ||
    event.type === 'thread.tokenUsageUpdated' ||
    event.type === 'turn.planUpdated' ||
    event.type === 'turn.proposedPlanCompleted';
}

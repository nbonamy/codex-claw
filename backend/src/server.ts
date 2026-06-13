import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';
import type { AppSnapshot } from '@codex-claw/shared/contracts';
import type { BackendEvent } from '@codex-claw/shared/backend-driver';
import type { ClawBackendEvent } from '@codex-claw/shared/backend-protocol/rpc';
import { BackendDriverRpc } from './driver-rpc';

export type ClawBackendServerOptions = {
  version: string;
  pid?: number;
  snapshot?: AppSnapshot;
  driverRpc?: BackendDriverRpc;
  onEvent?: (event: ClawBackendEvent) => void;
};

export class ClawBackendServer {
  private readonly version: string;
  private readonly pid: number;
  private readonly snapshot: AppSnapshot;
  private readonly driverRpc?: BackendDriverRpc;
  private readonly onEvent?: (event: ClawBackendEvent) => void;
  private unsubscribeDriverEvents?: () => void;
  private lastEventSeq = 0;

  constructor(options: ClawBackendServerOptions) {
    this.version = options.version;
    this.pid = options.pid ?? process.pid;
    this.snapshot = options.snapshot ?? createEmptySnapshot();
    this.driverRpc = options.driverRpc;
    this.onEvent = options.onEvent;
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

  private handleBackendEvent(event: BackendEvent): void {
    this.lastEventSeq += 1;
    this.onEvent?.({
      ...event,
      seq: this.lastEventSeq,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      payload: event.payload,
    });
  }
}

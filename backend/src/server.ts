import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';
import type { AppSnapshot } from '@codex-claw/shared/contracts';
import { BackendDriverRpc } from './driver-rpc';

export type ClawBackendServerOptions = {
  version: string;
  pid?: number;
  snapshot?: AppSnapshot;
  driverRpc?: BackendDriverRpc;
};

export class ClawBackendServer {
  private readonly version: string;
  private readonly pid: number;
  private readonly snapshot: AppSnapshot;
  private readonly driverRpc?: BackendDriverRpc;
  private lastEventSeq = 0;

  constructor(options: ClawBackendServerOptions) {
    this.version = options.version;
    this.pid = options.pid ?? process.pid;
    this.snapshot = options.snapshot ?? createEmptySnapshot();
    this.driverRpc = options.driverRpc;
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
    await this.driverRpc?.close();
  }
}

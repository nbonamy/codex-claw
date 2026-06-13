import { createClawRpcError, createClawRpcResult, clawRpcErrorCodes, isClawRpcNotification, isClawRpcRequest, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';

export type ClawBackendServerOptions = {
  version: string;
  pid?: number;
};

export class ClawBackendServer {
  private readonly version: string;
  private readonly pid: number;
  private lastEventSeq = 0;

  constructor(options: ClawBackendServerOptions) {
    this.version = options.version;
    this.pid = options.pid ?? process.pid;
  }

  handleMessage(message: ClawRpcMessage): ClawRpcResponse | undefined {
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
          snapshot: createEmptySnapshot(),
          lastEventSeq: this.lastEventSeq,
        });
      default:
        return createClawRpcError(message.id, clawRpcErrorCodes.methodNotFound, `Unknown backend method: ${message.method}`);
    }
  }
}

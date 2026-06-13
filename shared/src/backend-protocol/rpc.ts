import type { AppSnapshot, MainToRendererEvent } from '../contracts';

export type ClawRpcId = string | number;

export type ClawRpcRequest = {
  jsonrpc: '2.0';
  id: ClawRpcId;
  method: string;
  params?: unknown;
};

export type ClawRpcNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
};

export type ClawRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type ClawRpcResponse =
  | { jsonrpc: '2.0'; id: ClawRpcId | null; result: unknown }
  | { jsonrpc: '2.0'; id: ClawRpcId | null; error: ClawRpcError };

export type ClawRpcMessage = ClawRpcRequest | ClawRpcNotification | ClawRpcResponse;

export const clawRpcErrorCodes = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  backendUnavailable: -32000,
  timeout: -32001,
} as const;

export type ClawBackendHealth = {
  ok: true;
  name: 'clawd';
  version: string;
  pid: number;
};

export type ClawSnapshotGetResult = {
  snapshot: AppSnapshot;
  lastEventSeq: number;
};

export type ClawBackendEvent = {
  seq: number;
  type: MainToRendererEvent['type'];
  agentId?: string;
  backend?: MainToRendererEvent extends { backend?: infer Backend } ? Backend : never;
  backendSessionId?: string;
  threadId?: string;
  turnId?: string;
  payload: unknown;
  occurredAt: string;
};

export type ClawBackendRequestMap = {
  'backend/health': {
    params: undefined;
    result: ClawBackendHealth;
  };
  'snapshot/get': {
    params: undefined;
    result: ClawSnapshotGetResult;
  };
};

export function isClawRpcRequest(message: ClawRpcMessage): message is ClawRpcRequest {
  return 'id' in message && 'method' in message;
}

export function isClawRpcNotification(message: ClawRpcMessage): message is ClawRpcNotification {
  return !('id' in message) && 'method' in message;
}

export function isClawRpcResponse(message: ClawRpcMessage): message is ClawRpcResponse {
  return 'id' in message && ('result' in message || 'error' in message);
}

export function createClawRpcResult(id: ClawRpcId | null, result: unknown): ClawRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function createClawRpcError(id: ClawRpcId | null, code: number, message: string, data?: unknown): ClawRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

export function parseClawRpcMessage(input: unknown): ClawRpcMessage {
  if (!isRecord(input) || input.jsonrpc !== '2.0') {
    throw new ClawRpcValidationError('Invalid JSON-RPC message.');
  }

  if ('method' in input) {
    if (typeof input.method !== 'string' || input.method.length === 0) {
      throw new ClawRpcValidationError('JSON-RPC method must be a non-empty string.');
    }

    if ('id' in input) {
      if (!isClawRpcId(input.id)) {
        throw new ClawRpcValidationError('JSON-RPC request id must be a string or number.');
      }

      return {
        jsonrpc: '2.0',
        id: input.id,
        method: input.method,
        ...('params' in input ? { params: input.params } : {}),
      };
    }

    return {
      jsonrpc: '2.0',
      method: input.method,
      ...('params' in input ? { params: input.params } : {}),
    };
  }

  if ('id' in input && ('result' in input || 'error' in input)) {
    if (input.id !== null && !isClawRpcId(input.id)) {
      throw new ClawRpcValidationError('JSON-RPC response id must be a string, number, or null.');
    }

    if ('error' in input) {
      if (!isRecord(input.error) || typeof input.error.code !== 'number' || typeof input.error.message !== 'string') {
        throw new ClawRpcValidationError('JSON-RPC error response is malformed.');
      }

      return {
        jsonrpc: '2.0',
        id: input.id,
        error: {
          code: input.error.code,
          message: input.error.message,
          ...('data' in input.error ? { data: input.error.data } : {}),
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id: input.id,
      result: input.result,
    };
  }

  throw new ClawRpcValidationError('JSON-RPC message must be a request, notification, or response.');
}

export class ClawRpcValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClawRpcValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClawRpcId(value: unknown): value is ClawRpcId {
  return typeof value === 'string' || typeof value === 'number';
}

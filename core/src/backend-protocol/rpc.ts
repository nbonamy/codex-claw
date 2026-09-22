import { backendMethods } from './methods';
import type {
  AgentGitBranchInput,
  AgentGitCommitInput,
  AgentGitMergeInput,
  AgentGitMessageGenerationInput,
  AgentGitMessageGenerationResult,
  AgentGitPullRequestInput,
  AgentGitPushInput,
  AgentGitStageInput,
  AgentGitUpdateFromBaseInput,
  AgentGitUpdateFromBaseResult,
  AgentGitDiffTarget,
  AgentGitWorkflow,
  AppSnapshot,
  ClientState,
} from '../contracts';
import { isAppSnapshot, isClientState } from '../snapshot-guards';

export type { ClawBackendEvent } from './events';

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
  clientState: ClientState;
};

export type ClawBackendRequestMap = {
  [backendMethods.agentDesignStart]: {
    params: { agentId: string; input?: import('../design').StartDesignInput };
    result: AppSnapshot;
  };
  [backendMethods.agentDesignSuggestionGenerate]: {
    params: { agentId: string; input: import('../design').GenerateDesignSuggestionInput };
    result: AppSnapshot;
  };
  [backendMethods.agentDesignDiagramSelect]: {
    params: { agentId: string; input: import('../design').SelectDesignDiagramInput };
    result: AppSnapshot;
  };
  [backendMethods.agentDesignAssetGet]: {
    params: { agentId: string; diagramId: string };
    result: import('../design').DesignDiagramAsset;
  };
  [backendMethods.agentThreadFlagRespond]: {
    params: { agentId: string; response: import('../thread-flags').ThreadFlagResponse };
    result: AppSnapshot;
  };
  [backendMethods.agentPlanReviewRespond]: {
    params: { agentId: string; response: import('../plan-review').PlanReviewResponse };
    result: AppSnapshot;
  };
  [backendMethods.agentRequestRespond]: {
    params: { response: import('../agent-request').AgentRequestResponse };
    result: AppSnapshot;
  };
  [backendMethods.driverConversationArchive]: {
    params: { agent: import('../contracts').Agent };
    result: { supported: boolean };
  };
  [backendMethods.backendHealthGet]: {
    params: undefined;
    result: ClawBackendHealth;
  };
  [backendMethods.snapshotGet]: {
    params: undefined;
    result: ClawSnapshotGetResult;
  };
  [backendMethods.clientStateGet]: {
    params: undefined;
    result: ClientState;
  };
  [backendMethods.agentGitDiffGet]: {
    params: { agentId: string; target?: AgentGitDiffTarget };
    result: import('../contracts').AgentGitDiff;
  };
  [backendMethods.agentGitWorkflowGet]: {
    params: { agentId: string };
    result: AgentGitWorkflow;
  };
  [backendMethods.agentGitMessageGenerate]: {
    params: { agentId: string; input: AgentGitMessageGenerationInput };
    result: AgentGitMessageGenerationResult;
  };
  [backendMethods.agentGitStage]: {
    params: { agentId: string; input: AgentGitStageInput };
    result: AgentGitWorkflow;
  };
  [backendMethods.agentGitCommit]: {
    params: { agentId: string; input: AgentGitCommitInput };
    result: AgentGitWorkflow;
  };
  [backendMethods.agentGitPush]: {
    params: { agentId: string; input: AgentGitPushInput };
    result: AgentGitWorkflow;
  };
  [backendMethods.agentGitBranchCreate]: {
    params: { agentId: string; input: AgentGitBranchInput };
    result: AgentGitWorkflow;
  };
  [backendMethods.agentGitPullRequestCreate]: {
    params: { agentId: string; input: AgentGitPullRequestInput };
    result: AgentGitWorkflow;
  };
  [backendMethods.agentGitMerge]: {
    params: { agentId: string; input: AgentGitMergeInput };
    result: AgentGitWorkflow;
  };
  [backendMethods.agentGitUpdateFromBase]: {
    params: { agentId: string; input: AgentGitUpdateFromBaseInput };
    result: AgentGitUpdateFromBaseResult;
  };
};

export type ClawBackendRequestMethod = keyof ClawBackendRequestMap;
export type ClawBackendRequestParams<Method extends ClawBackendRequestMethod> = ClawBackendRequestMap[Method]['params'];
export type ClawBackendRequestResult<Method extends ClawBackendRequestMethod> = ClawBackendRequestMap[Method]['result'];

export type ClawBackendRequestPort = {
  request<Result>(method: string, params?: unknown): Promise<Result>;
};

export function requestClawBackend<Method extends ClawBackendRequestMethod>(
  client: ClawBackendRequestPort,
  method: Method,
  ...args: ClawBackendRequestParams<Method> extends undefined
    ? [params?: undefined]
    : [params: ClawBackendRequestParams<Method>]
): Promise<ClawBackendRequestResult<Method>> {
  return client.request<ClawBackendRequestResult<Method>>(method, args[0]);
}

export function isClawSnapshotGetResult(value: unknown): value is ClawSnapshotGetResult {
  return isRecord(value) &&
    isAppSnapshot(value.snapshot) &&
    typeof value.lastEventSeq === 'number' &&
    isClientState(value.clientState);
}

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

export function createClawRpcRequest(id: ClawRpcId, method: string, params?: unknown): ClawRpcRequest {
  return params === undefined
    ? { jsonrpc: '2.0', id, method }
    : { jsonrpc: '2.0', id, method, params };
}

export function createClawRpcNotification(method: string, params?: unknown): ClawRpcNotification {
  return params === undefined
    ? { jsonrpc: '2.0', method }
    : { jsonrpc: '2.0', method, params };
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

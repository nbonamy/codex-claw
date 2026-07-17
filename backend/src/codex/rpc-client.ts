import {
  CodexAppServerClient,
  type CodexAppServerClientOptions,
  type InitializeResponse,
  type RpcTransport,
  type ServerRequest,
  type UntypedCodexServerRequestResponder,
} from 'codex-app-sdk/codex';
import { warnMain } from '../log';

export type CodexTransport = RpcTransport;
export type CodexServerRequest = ServerRequest;
export type CodexServerRequestResponder = UntypedCodexServerRequestResponder;
export type CodexRpcClientOptions = Pick<CodexAppServerClientOptions, 'requestTimeoutMs'>;

export class CodexRpcClient extends CodexAppServerClient {
  constructor(transport: CodexTransport, options: CodexRpcClientOptions = {}) {
    super(transport, {
      ...options,
      unhandledServerRequestError: (request) => {
        warnMain('codex-request', 'not implemented', {
          id: request.id,
          method: request.method,
          ...summarizeCodexParams(request.params),
        });
        return {
          code: -32000,
          message: `Codex Claw does not implement app-server request '${request.method}' yet.`,
        };
      },
    });
  }

  initialize(): Promise<InitializeResponse> {
    return super.initialize({
      clientInfo: {
        name: 'codex_claw',
        title: 'Codex Claw',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    });
  }
}

function summarizeCodexParams(params: unknown): Record<string, unknown> {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return { paramType: typeof params };
  }

  const record = params as Record<string, unknown>;
  return {
    paramKeys: Object.keys(record),
    threadId: stringValue(record.threadId),
    turnId: stringValue(record.turnId),
    itemId: stringValue(record.itemId),
    requestId: stringValue(record.requestId),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

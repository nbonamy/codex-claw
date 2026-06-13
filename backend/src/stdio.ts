import { createClawRpcError, clawRpcErrorCodes, parseClawRpcMessage, type ClawRpcMessage, type ClawRpcResponse } from '@codex-claw/shared/backend-protocol/rpc';
import type { Readable, Writable } from 'node:stream';

export type StdioRpcServerOptions = {
  input: Readable;
  output: Writable;
  onMessage(message: ClawRpcMessage): ClawRpcResponse | undefined;
};

export function startStdioRpcServer(options: StdioRpcServerOptions): () => void {
  let buffer = '';

  const onData = (chunk: Buffer | string) => {
    buffer += chunk.toString();

    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex < 0) {
        break;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length === 0) {
        continue;
      }

      handleLine(line, options);
    }
  };

  options.input.on('data', onData);

  return () => {
    options.input.off('data', onData);
  };
}

function handleLine(line: string, options: StdioRpcServerOptions): void {
  try {
    const parsed = JSON.parse(line) as unknown;
    const message = parseClawRpcMessage(parsed);
    const response = options.onMessage(message);
    if (response) {
      writeResponse(options.output, response);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON-RPC message.';
    const response = createClawRpcError(null, lineLooksLikeJson(line) ? clawRpcErrorCodes.invalidRequest : clawRpcErrorCodes.parseError, message);
    writeResponse(options.output, response);
  }
}

function writeResponse(output: Writable, response: ClawRpcResponse): void {
  output.write(`${JSON.stringify(response)}\n`);
}

function lineLooksLikeJson(line: string): boolean {
  return line.startsWith('{') || line.startsWith('[');
}

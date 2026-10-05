import { product } from '@workspace/core/product';
import { decodeAppBackendEvent } from '@workspace/core/backend-protocol/events';
import type { MainToRendererEvent } from '@workspace/core/contracts';

export const appWebProtocolVersion = 1 as const;

type AppWebRequest = {
  version: typeof appWebProtocolVersion;
  type: 'request';
  id: string;
  operation: string;
  args: unknown[];
};

type AppWebReady = {
  version: typeof appWebProtocolVersion;
  type: 'ready';
  userId: string;
};

type AppWebEvent = {
  version: typeof appWebProtocolVersion;
  type: 'event';
  event: MainToRendererEvent;
};

type AppWebResponse = {
  version: typeof appWebProtocolVersion;
  type: 'response';
  id: string;
  ok: true;
  result?: unknown;
} | {
  version: typeof appWebProtocolVersion;
  type: 'response';
  id: string;
  ok: false;
  error: string;
};

export type AppWebClientMessage = AppWebRequest;
export type AppWebServerMessage = AppWebReady | AppWebEvent | AppWebResponse;

export class AppWebEventDecodeError extends TypeError {}

export function encodeAppWebMessage(message: AppWebClientMessage | AppWebServerMessage): string {
  return JSON.stringify(message);
}

export function parseAppWebClientMessage(value: unknown): AppWebClientMessage {
  if (!isRecord(value) || value.version !== appWebProtocolVersion || value.type !== 'request') {
    throw new TypeError(`Invalid ${product.name} web request.`);
  }
  if (typeof value.id !== 'string' || typeof value.operation !== 'string' || !Array.isArray(value.args)) {
    throw new TypeError(`Malformed ${product.name} web request.`);
  }
  return value as AppWebRequest;
}

export function parseAppWebServerMessage(value: unknown): AppWebServerMessage {
  if (!isRecord(value) || value.version !== appWebProtocolVersion) {
    throw new TypeError(`Invalid ${product.name} web response.`);
  }
  if (value.type === 'ready' && typeof value.userId === 'string') return value as AppWebReady;
  if (value.type === 'event') {
    try {
      decodeAppBackendEvent(value.event);
      return value as AppWebEvent;
    } catch (error) {
      throw new AppWebEventDecodeError(
        `Malformed ${product.name} web event: ${error instanceof Error ? error.message : 'Invalid backend event.'}`,
      );
    }
  }
  if (value.type === 'response' && typeof value.id === 'string' && typeof value.ok === 'boolean') {
    if (value.ok === true) return value as AppWebResponse;
    if (value.ok === false && typeof value.error === 'string') return value as AppWebResponse;
  }
  throw new TypeError(`Malformed ${product.name} web response.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import type { MainToRendererEvent } from '@codex-claw/core/contracts';

export const clawWebProtocolVersion = 1 as const;

type ClawWebRequest = {
  version: typeof clawWebProtocolVersion;
  type: 'request';
  id: string;
  operation: string;
  args: unknown[];
};

type ClawWebReady = {
  version: typeof clawWebProtocolVersion;
  type: 'ready';
  userId: string;
};

type ClawWebEvent = {
  version: typeof clawWebProtocolVersion;
  type: 'event';
  event: MainToRendererEvent;
};

type ClawWebResponse = {
  version: typeof clawWebProtocolVersion;
  type: 'response';
  id: string;
  ok: true;
  result?: unknown;
} | {
  version: typeof clawWebProtocolVersion;
  type: 'response';
  id: string;
  ok: false;
  error: string;
};

export type ClawWebClientMessage = ClawWebRequest;
export type ClawWebServerMessage = ClawWebReady | ClawWebEvent | ClawWebResponse;

export function encodeClawWebMessage(message: ClawWebClientMessage | ClawWebServerMessage): string {
  return JSON.stringify(message);
}

export function parseClawWebClientMessage(value: unknown): ClawWebClientMessage {
  if (!isRecord(value) || value.version !== clawWebProtocolVersion || value.type !== 'request') {
    throw new TypeError('Invalid Claw web request.');
  }
  if (typeof value.id !== 'string' || typeof value.operation !== 'string' || !Array.isArray(value.args)) {
    throw new TypeError('Malformed Claw web request.');
  }
  return value as ClawWebRequest;
}

export function parseClawWebServerMessage(value: unknown): ClawWebServerMessage {
  if (!isRecord(value) || value.version !== clawWebProtocolVersion) {
    throw new TypeError('Invalid Claw web response.');
  }
  if (value.type === 'ready' && typeof value.userId === 'string') return value as ClawWebReady;
  if (value.type === 'event' && isRecord(value.event)) return value as ClawWebEvent;
  if (value.type === 'response' && typeof value.id === 'string' && typeof value.ok === 'boolean') {
    if (value.ok === true) return value as ClawWebResponse;
    if (value.ok === false && typeof value.error === 'string') return value as ClawWebResponse;
  }
  throw new TypeError('Malformed Claw web response.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

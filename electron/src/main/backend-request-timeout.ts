import { backendRequestTimeoutMs as operationTimeoutMs } from '@codex-claw/core/backend-protocol/request-timeout';

// Allow the remote hop to return its own timeout before the desktop gives up.
export function backendRequestTimeoutMs(method: string): number {
  return operationTimeoutMs(method) + 5_000;
}

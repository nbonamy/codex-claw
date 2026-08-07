import {
  webClawHostCapabilities,
  type ClawClient,
  type ClawHostCapabilities,
} from '@codex-claw/core/client';
import type { CodexClawApi } from '@codex-claw/core/contracts';

export let codexClawApi: CodexClawApi | undefined;
export let clawHostCapabilities: Readonly<ClawHostCapabilities> = webClawHostCapabilities;
export let clawClientPlatform: ClawClient['platform'] = 'web';

export function configureClawClient(client?: ClawClient): void {
  codexClawApi = client?.api;
  clawHostCapabilities = client?.capabilities ?? webClawHostCapabilities;
  clawClientPlatform = client?.platform ?? 'web';
}

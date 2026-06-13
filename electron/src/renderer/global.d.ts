import type { CodexClawApi } from '@codex-claw/shared/contracts';

declare global {
  interface Window {
    codexClaw?: CodexClawApi;
  }
}

export {};

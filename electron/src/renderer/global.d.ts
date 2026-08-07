import type { CodexClawApi } from '@codex-claw/core/contracts';

declare global {
  interface Window {
    codexClaw?: CodexClawApi;
  }
}

export {};

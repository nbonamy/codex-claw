import type { CodexClawApi } from '../shared/contracts';

declare global {
  interface Window {
    codexClaw?: CodexClawApi;
  }
}

export {};

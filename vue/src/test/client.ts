import { vi } from 'vitest';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import { configureClawClient } from '../platform-api';

export function configureElectronTestClient(api?: Partial<CodexClawApi>): void {
  configureClawClient({
    api: api as CodexClawApi,
    platform: 'desktop',
  });
}

export function installElectronTestClientAccessor(): void {
  let api = window.codexClaw;
  Object.defineProperty(window, 'codexClaw', {
    configurable: true,
    get: () => api,
    set: (value: CodexClawApi | undefined) => {
      api = value;
      configureElectronTestClient(value);
    },
  });
  configureElectronTestClient(api);
}

export function setElectronTestClient(api?: Partial<CodexClawApi>): void {
  window.codexClaw = api as CodexClawApi | undefined;
  configureElectronTestClient(api);
}

export function stubElectronTestWindow(value: { codexClaw?: Partial<CodexClawApi> }): void {
  vi.stubGlobal('window', value);
  configureElectronTestClient(value.codexClaw);
}

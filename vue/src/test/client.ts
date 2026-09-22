import type { CodexClawApi } from '@codex-claw/core/contracts';
import { configureClawClient } from '../platform-api';
import { createClientApiMock } from './client-api-mock';

let disposeClient = () => {};
let assignClient: ((api?: Partial<CodexClawApi>) => void) | undefined;

export function configureElectronTestClient(overrides?: Partial<CodexClawApi>): CodexClawApi | undefined {
  disposeClient();
  disposeClient = () => {};
  if (!overrides) {
    configureClawClient(undefined);
    return undefined;
  }
  const mock = createClientApiMock();
  const api = Object.assign(mock.api, overrides);
  disposeClient = mock.dispose;
  configureClawClient({ api, platform: 'desktop' });
  return api;
}

export function installElectronTestClientAccessor(): void {
  const existing = window.codexClaw;
  let api: CodexClawApi | undefined;
  let initialized = false;
  const initialize = () => {
    if (!initialized) {
      api = configureElectronTestClient(existing ?? {});
      initialized = true;
    }
    return api;
  };
  assignClient = (value) => {
    api = configureElectronTestClient(value);
    initialized = true;
  };
  Object.defineProperty(window, 'codexClaw', {
    configurable: true,
    get: initialize,
    set: assignClient,
  });
}

export function setElectronTestClient(api?: Partial<CodexClawApi>): void {
  if (!assignClient) installElectronTestClientAccessor();
  assignClient!(api);
}

export function stubElectronTestWindow(value: { codexClaw?: Partial<CodexClawApi> }): void {
  setElectronTestClient(value.codexClaw);
}

/** Only for legacy/missing-method compatibility tests, never normal UI integration. */
export function stubLegacyElectronTestWindow(value: { codexClaw: Partial<CodexClawApi> }): void {
  setElectronTestClient(value.codexClaw);
  for (const key of Object.keys(window.codexClaw!)) {
    if (!(key in value.codexClaw)) Reflect.deleteProperty(window.codexClaw!, key);
  }
}

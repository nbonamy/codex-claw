import { config, enableAutoUnmount } from '@vue/test-utils';
import { afterEach, beforeEach, vi } from 'vitest';
import { i18n } from '../i18n';
import { configureClawClient } from '../platform-api';
import { installElectronTestClientAccessor, setElectronTestClient } from './client';

beforeEach(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => null,
  });
  installElectronTestClientAccessor();
});

config.global.renderStubDefaultSlot = true;
config.global.plugins = [i18n];
enableAutoUnmount(afterEach);

afterEach(() => {
  setElectronTestClient();
  delete window.codexClaw;
  configureClawClient(undefined);
  vi.unstubAllGlobals();
});

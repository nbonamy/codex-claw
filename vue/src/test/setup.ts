import { config } from '@vue/test-utils';
import { afterEach, beforeEach, vi } from 'vitest';
import { i18n } from '../i18n';
import { configureClawClient } from '../platform-api';
import { installElectronTestClientAccessor } from './client';

beforeEach(() => {
  installElectronTestClientAccessor();
});

config.global.renderStubDefaultSlot = true;
config.global.plugins = [i18n];

afterEach(() => {
  delete window.codexClaw;
  configureClawClient(undefined);
  vi.unstubAllGlobals();
});

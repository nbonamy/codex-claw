import { config } from '@vue/test-utils';
import { afterEach, vi } from 'vitest';
import { i18n } from '../renderer/i18n';

config.global.renderStubDefaultSlot = true;
config.global.plugins = [i18n];

afterEach(() => {
  vi.unstubAllGlobals();
});

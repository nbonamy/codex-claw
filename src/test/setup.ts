import { config } from '@vue/test-utils';
import { afterEach, vi } from 'vitest';

config.global.renderStubDefaultSlot = true;

afterEach(() => {
  vi.unstubAllGlobals();
});

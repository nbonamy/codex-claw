import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import { createInitialSnapshot } from '../../shared/snapshot';
import type { CodexClawApi } from '../../shared/contracts';

describe('App', () => {
  it('loads the main-process snapshot on mount', async () => {
    const snapshot = createInitialSnapshot();
    snapshot.appServer = {
      status: 'running',
      detail: 'ready',
    };

    const getSnapshot = vi.fn().mockResolvedValue(snapshot);
    vi.stubGlobal('window', {
      codexClaw: {
        getSnapshot,
        onEvent: vi.fn(),
      } satisfies Partial<CodexClawApi>,
    });

    const wrapper = mount(App, {
      global: {
        plugins: [ElementPlus],
      },
    });

    await flushPromises();

    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Connected');
    expect(wrapper.text()).toContain('Chat with Dina');
  });
});

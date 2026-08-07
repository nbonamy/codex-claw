import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import CodexResourceSharingMigrationDialog from '../CodexResourceSharingMigrationDialog.vue';

describe('CodexResourceSharingMigrationDialog', () => {
  it('offers migration or the existing isolated setup', async () => {
    const wrapper = mountDialog();
    await flushPromises();

    expect(document.body.textContent).toContain('Share skills and plugins with ChatGPT?');
    const buttons = [...document.body.querySelectorAll('button')];
    buttons.find((button) => button.textContent?.includes('Keep isolated'))?.click();
    buttons.find((button) => button.textContent?.includes('Migrate'))?.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('decline')).toHaveLength(1);
    expect(wrapper.emitted('migrate')).toHaveLength(1);
  });

  it('blocks migration while chats are active but still allows declining', async () => {
    mountDialog({ blocked: true });
    await flushPromises();

    expect(document.body.textContent).toContain('Migration cannot run while chats are active.');
    const buttons = [...document.body.querySelectorAll('button')];
    expect(buttons.find((button) => button.textContent?.includes('Migrate'))?.disabled).toBe(true);
    expect(buttons.find((button) => button.textContent?.includes('Keep isolated'))?.disabled).toBe(false);
  });
});

function mountDialog(overrides: Partial<{ blocked: boolean; pending: boolean; visible: boolean }> = {}) {
  document.body.innerHTML = '';
  return mount(CodexResourceSharingMigrationDialog, {
    props: {
      blocked: false,
      pending: false,
      visible: true,
      ...overrides,
    },
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
}

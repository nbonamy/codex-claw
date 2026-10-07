import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createI18n } from 'vue-i18n';
import { CodexToolCall } from '@codex-app-sdk/vue';
import { expect, it } from 'vitest';
import { messages } from '../i18n/messages';
import { provideAppToolPresentation } from '../tool-presentation';

it('renders a loaded bundled skill through the real conversation tool row', () => {
  const i18n = createI18n({ legacy: false, locale: 'en', messages });
  const wrapper = mount(defineComponent({
    setup() {
      provideAppToolPresentation((key, params) => i18n.global.t(key, params ?? {}));
      return () => h(CodexToolCall, { toolCall: {
        id: 'skill-call', function: 'mcp__korus__read_skill', kind: 'mcp',
        metadata: { server: 'korus', tool: 'read-skill' }, args: { name: 'korus-inline-html' },
        state: 'completed', done: true, result: { name: 'korus-inline-html', loaded: true },
      } });
    },
  }), { global: { plugins: [i18n] } });
  try {
    expect(wrapper.text()).toContain('Loaded skill korus-inline-html');
    expect(wrapper.find('svg').exists()).toBe(true);
  } finally { wrapper.unmount(); }
});

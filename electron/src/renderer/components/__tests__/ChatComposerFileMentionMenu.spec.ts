import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ChatComposerFileMentionMenu from '../ChatComposerFileMentionMenu.vue';
import { i18n } from '../../i18n';
import type { AgentFileSearchItem } from '@codex-claw/shared/contracts';

const files = [
  { name: 'README.md', path: 'README.md' },
  { name: 'research.md', path: 'docs/research.md' },
];

describe('ChatComposerFileMentionMenu', () => {
  it('renders files and emits the selected file', async () => {
    const wrapper = mountMenu();

    expect(wrapper.text()).toContain('Files');
    expect(wrapper.text()).toContain('README.md');
    expect(wrapper.text()).toContain('docs/research.md');

    await wrapper.findAll('.chat-composer-file-menu__item')[1]?.trigger('mousedown');

    expect(wrapper.emitted('select')).toStrictEqual([[files[1]]]);
  });

  it('scrolls the active file into view when navigating by keyboard', async () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const wrapper = mountMenu({ activeIndex: 0 });
      await (wrapper.setProps as (props: Record<string, unknown>) => Promise<void>)({ activeIndex: 1 });
      await nextTick();

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('renders a hint before the user starts typing a query', () => {
    const wrapper = mountMenu({ showHint: true, visibleFiles: [] });

    expect(wrapper.text()).toContain('Start typing to search files');
  });
});

function mountMenu(props: Partial<{
  activeIndex: number;
  showHint: boolean;
  visibleFiles: AgentFileSearchItem[];
}> = {}) {
  return mount(ChatComposerFileMentionMenu, {
    props: {
      activeIndex: 0,
      visibleFiles: files,
      ...props,
    },
    global: {
      plugins: [i18n],
    },
  });
}

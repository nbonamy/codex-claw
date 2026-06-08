import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MarkdownPanel from '../MarkdownPanel.vue';

describe('MarkdownPanel', () => {
  it('renders markdown using the shared markdown surface', () => {
    const wrapper = mount(MarkdownPanel, {
      props: {
        content: '# Notes\n\n[Read docs](docs/architecture.md)\n\n```ts\nconst ok = true\n```',
      },
    });

    expect(wrapper.get('.markdown-panel__content').classes()).toContain('claw-markdown');
    expect(wrapper.get('h1').text()).toBe('Notes');
    expect(wrapper.get('a').attributes('href')).toBe('docs/architecture.md');
    expect(wrapper.text()).toContain('const ok = true');
  });

  it('shows loading and error states', async () => {
    const loadingWrapper = mount(MarkdownPanel, {
      props: {
        content: '',
        state: 'loading',
      },
    });

    expect(loadingWrapper.text()).toContain('Loading markdown...');

    const errorWrapper = mount(MarkdownPanel, {
      props: {
        content: '',
        state: 'error',
        error: 'Could not read README.md',
      },
    });

    expect(errorWrapper.text()).toContain('Could not read README.md');
  });

  it('shows default error and empty states', () => {
    const errorWrapper = mount(MarkdownPanel, {
      props: {
        content: '',
        state: 'error',
      },
    });

    expect(errorWrapper.text()).toContain('Unable to load markdown.');

    const emptyWrapper = mount(MarkdownPanel, {
      props: {
        content: '   ',
      },
    });

    expect(emptyWrapper.text()).toContain('No markdown content.');
  });
});

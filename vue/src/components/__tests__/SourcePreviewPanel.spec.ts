import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import SourcePreviewPanel from '../SourcePreviewPanel.vue';

const componentSource = readFileSync(resolve(process.cwd(), 'src/components/SourcePreviewPanel.vue'), 'utf8');

describe('SourcePreviewPanel', () => {
  it('renders read-only highlighted source content', () => {
    const wrapper = mount(SourcePreviewPanel, {
      props: {
        content: 'const value: number = 42;\n',
        language: 'typescript',
      },
    });

    expect(wrapper.find('.source-preview-panel').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(false);
    expect(wrapper.html()).toContain('shiki');
    expect(wrapper.findAll('.line')).toHaveLength(2);
    expect(wrapper.text()).toContain('value');
  });

  it('can hide line numbers and enable line wrap', () => {
    const wrapper = mount(SourcePreviewPanel, {
      props: {
        content: 'const veryLongValueName = "this is intentionally long";\n',
        language: 'typescript',
        showLineNumbers: false,
        wordWrap: true,
      },
    });

    expect(wrapper.get('.source-preview-panel').classes()).toContain('source-preview-panel--hide-line-numbers');
    expect(wrapper.get('.source-preview-panel').classes()).toContain('source-preview-panel--wrap');
  });

  it('keeps long unwrapped lines horizontally scrollable', () => {
    expect(componentSource).toMatch(
      /\.source-preview-panel \{[^}]*min-width: 0;[^}]*overflow-x: auto;[^}]*overflow-y: auto;/,
    );
    expect(componentSource).toMatch(/\.source-preview-panel__content \{[^}]*min-width: max-content;/);
    expect(componentSource).toMatch(
      /\.source-preview-panel--wrap \.source-preview-panel__content \{[^}]*min-width: 0;/,
    );
  });

  it('renders loading, empty, and error states', () => {
    expect(mount(SourcePreviewPanel, {
      props: { content: '', state: 'loading' },
    }).text()).toContain('Loading source...');

    expect(mount(SourcePreviewPanel, {
      props: { content: '' },
    }).text()).toContain('No source content.');

    expect(mount(SourcePreviewPanel, {
      props: { content: '', state: 'error', error: 'Cannot read file.' },
    }).text()).toContain('Cannot read file.');
  });
});

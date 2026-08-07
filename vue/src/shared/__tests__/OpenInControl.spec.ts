import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import OpenInControl from '../OpenInControl.vue';

const catalog = {
  defaultApplication: 'vscode' as const,
  applications: [
    { id: 'vscode' as const, label: 'VS Code', iconDataUrl: 'data:image/png;base64,vscode' },
    { id: 'finder' as const, label: 'Finder', iconDataUrl: 'data:image/png;base64,finder' },
    { id: 'xcode' as const, label: 'Xcode', iconDataUrl: 'data:image/png;base64,xcode' },
  ],
};

describe('OpenInControl', () => {
  it('opens in the remembered application from the primary button', async () => {
    const wrapper = mount(OpenInControl, {
      props: { application: 'xcode', catalog },
    });

    expect(wrapper.get('[aria-label="Open in Xcode"] img').attributes('src')).toBe('data:image/png;base64,xcode');
    await wrapper.get('[aria-label="Open in Xcode"]').trigger('click');

    expect(wrapper.emitted('open')).toStrictEqual([['xcode']]);
  });

  it('renders the tighter borderless file-preview variant with its split divider', () => {
    const wrapper = mount(OpenInControl, {
      props: { application: 'vscode', catalog, variant: 'compact' },
    });

    expect(wrapper.classes()).toContain('open-in-control--compact');
    expect(wrapper.find('.open-in-control__menu-trigger').exists()).toBe(true);
  });

  it('shows installed applications and opens the selected choice', async () => {
    const wrapper = mount(OpenInControl, {
      props: { application: 'vscode', catalog },
      attachTo: document.body,
    });

    await wrapper.get('[aria-label="Choose Open In application"]').trigger('click');
    expect(wrapper.findAll('[role="menuitem"]').map((item) => item.text())).toStrictEqual(['VS Code', 'Finder', 'Xcode']);
    await wrapper.findAll('[role="menuitem"]')[2]?.trigger('click');

    expect(wrapper.emitted('open')).toStrictEqual([['xcode']]);
    expect(wrapper.find('[role="menu"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

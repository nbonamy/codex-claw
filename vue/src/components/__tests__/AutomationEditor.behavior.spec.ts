import { describe, expect, it, vi } from 'vitest';

import { mountEditor } from './automation-editor-test-harness';

describe('AutomationEditor behavior', () => {
  it('can pick a custom folder for new agents', async () => {
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/id8');
    const wrapper = mountEditor({ chooseAgentFolder });

    await wrapper.findAllComponents({ name: 'ElSelect' })[7]?.vm.$emit('update:modelValue', '__pick-folder__');
    await wrapper.find('form').trigger('submit');

    expect(chooseAgentFolder).toHaveBeenCalledOnce();
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/id8',
      },
    });
  });

  it('keeps the previous repository if folder picking is cancelled', async () => {
    const chooseAgentFolder = vi.fn().mockResolvedValue(null);
    const wrapper = mountEditor({ chooseAgentFolder });

    await wrapper.findAllComponents({ name: 'ElSelect' })[7]?.vm.$emit('update:modelValue', '__pick-folder__');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        type: 'create-agent',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
      },
    });
  });

  it('supports dedicated teams per ticket', async () => {
    const wrapper = mountEditor();

    await wrapper.findAllComponents({ name: 'ElSelect' })[5]?.vm.$emit('update:modelValue', 'dedicated');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        teamTarget: {
          mode: 'dedicated',
        },
        cleanup: {
          deleteTeam: true,
        },
      },
    });
  });

  it('allows disabling cleanup for existing-team automations', async () => {
    const wrapper = mountEditor();

    await wrapper.findComponent({ name: 'ElCheckbox' }).vm.$emit('update:modelValue', false);
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({
      action: {
        cleanup: {
          deleteAgent: false,
        },
      },
    });
  });
});

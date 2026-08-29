import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import type { WorkRoutingRequest } from '@codex-claw/core/contracts';
import WorkRoutingDialog from '../WorkRoutingDialog.vue';

describe('WorkRoutingDialog', () => {
  it('defaults substantial work to an isolated delegated conversation', async () => {
    const wrapper = mountDialog();

    expect(wrapper.text()).toContain('How should this work continue?');
    expect(wrapper.text()).toContain('Implement the routed feature.');
    expect(wrapper.findAll('.work-routing-dialog__choice')).toHaveLength(3);
    expect(wrapper.get('[data-mode="delegate"]').classes()).toContain('is-selected');
    expect((wrapper.get('.work-routing-dialog__branch').element as HTMLInputElement).value).toBe('feat/routed-work');

    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('respond')).toStrictEqual([['delegate', 'feat/routed-work']]);
  });

  it('continues in the current checkout without requiring a branch', async () => {
    const wrapper = mountDialog();

    await wrapper.get('[data-mode="current"]').trigger('click');
    expect(wrapper.find('.work-routing-dialog__branch').exists()).toBe(false);
    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('respond')).toStrictEqual([['current', undefined]]);
  });

  it('submits an edited branch for the current conversation', async () => {
    const wrapper = mountDialog();

    await wrapper.get('[data-mode="branch"]').trigger('click');
    await wrapper.get('.work-routing-dialog__branch').setValue('feat/edited');
    await wrapper.get('.claw-button--primary').trigger('click');

    expect(wrapper.emitted('respond')).toStrictEqual([['branch', 'feat/edited']]);
  });

  it('disables switching a checkout shared with another agent', () => {
    const wrapper = mountDialog({
      request: routingRequest(['Paul']),
    });

    expect(wrapper.get('[data-mode="branch"]').attributes()).toHaveProperty('disabled');
    expect(wrapper.text()).toContain('This folder is also used by Paul');
  });

  it('can cancel the blocking tool request', async () => {
    const wrapper = mountDialog();

    await wrapper.get('.claw-button--tertiary').trigger('click');

    expect(wrapper.emitted('cancel')).toStrictEqual([[]]);
  });
});

function mountDialog(overrides: Partial<InstanceType<typeof WorkRoutingDialog>['$props']> = {}) {
  return mount(WorkRoutingDialog, {
    props: {
      visible: true,
      request: routingRequest(),
      ...overrides,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: `
            <section v-if="modelValue">
              <slot name="header" />
              <slot />
              <slot name="footer" />
            </section>
          `,
        },
      },
    },
  });
}

function routingRequest(sharedFolderAgentNames: string[] = []): WorkRoutingRequest {
  return {
    id: 'work-routing-1',
    kind: 'work_routing',
    payload: {
      request: {
        agentId: 'agent-dina',
        task: 'Implement the routed feature.',
        suggestedBranchName: 'feat/routed-work',
        sharedFolderAgentNames,
      },
    },
  };
}

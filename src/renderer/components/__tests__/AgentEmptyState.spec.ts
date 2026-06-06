import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentEmptyState from '../AgentEmptyState.vue';
import type { BenchTemplate } from '../../../shared/contracts';

const bench: BenchTemplate[] = [
  {
    id: 'bench-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '~/src/id8',
    backend: 'codex',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AgentEmptyState', () => {
  it('shows the first-run empty state and emits new-agent from the shared CTA', async () => {
    const wrapper = mount(AgentEmptyState, {
      global: {
        plugins: [ElementPlus],
      },
    });

    expect(wrapper.text()).toContain('Welcome to Codex Claw!');
    expect(wrapper.text()).toContain('Add an agent to your team');
    expect(wrapper.get('.agent-empty-state__mark img').attributes('alt')).toBe('Codex Claw');

    await wrapper.get('.agent-sidebar__new').trigger('click');

    expect(wrapper.emitted('new-agent')).toStrictEqual([[]]);
  });

  it('uses the shared Bench menu from the empty team screen', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const wrapper = mount(AgentEmptyState, {
      props: {
        bench,
      },
      global: {
        plugins: [ElementPlus],
      },
    });

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Dina'))?.trigger('click');
    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Remove Dina from Bench"]').trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalled();
    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([['bench-dina']]);
    expect(wrapper.emitted('remove-bench-template')).toStrictEqual([['bench-dina']]);
  });
});

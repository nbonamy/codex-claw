import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NewAgentButton from '../NewAgentButton.vue';
import type { BenchTemplate } from '../../../shared/contracts';

const bench: BenchTemplate[] = [
  {
    id: 'bench-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '/Users/nbonamy/src/id8',
    backend: 'codex',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
  {
    id: 'bench-jesse',
    name: 'Jesse',
    folder: '/Users/nbonamy/src/multi-llm-ts',
    backend: 'codex',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  },
];

type NewAgentButtonMountProps = {
  label?: string;
  presentation?: 'default' | 'tile';
  showBenchMenu?: boolean;
  size?: 'regular' | 'small';
  tone?: 'primary' | 'muted' | 'ghost';
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NewAgentButton', () => {
  it('renders a segmented new agent button and opens Bench templates from the chevron segment', async () => {
    const wrapper = mountButton();

    expect(wrapper.get('.agent-sidebar__new').text()).toContain('New Agent');
    expect(wrapper.find('[aria-label="Open Bench"]').exists()).toBe(true);

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('.new-agent-menu__create').text()).toContain('Create New Agent');
    expect(wrapper.text()).toContain('Bench');
    expect(wrapper.text()).toContain('Dina');
    expect(wrapper.text()).toContain('id8');
    expect(wrapper.text()).toContain('Jesse');
    expect(wrapper.text()).toContain('multi-llm-ts');
  });

  it('keeps the Bench section and shows the empty Bench message without templates', async () => {
    const wrapper = mountButton([]);

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Bench');
    expect(wrapper.text()).toContain('Right-click an agent → Save to Bench');
    expect(wrapper.find('.new-agent-menu__template').exists()).toBe(false);
  });

  it('emits new agent requests from both the primary segment and menu row', async () => {
    const wrapper = mountButton();

    await wrapper.get('.agent-sidebar__new').trigger('click');
    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.get('.new-agent-menu__create').trigger('click');

    expect(wrapper.emitted('new-agent')).toStrictEqual([[], []]);
    expect(popoverVisible(wrapper)).toBe(false);
  });

  it('renders a muted tile variant without the Bench menu', async () => {
    const wrapper = mountButton([], {
      label: 'Add Agent',
      presentation: 'tile',
      showBenchMenu: false,
      tone: 'muted',
    });

    expect(wrapper.classes()).toContain('new-agent-button--muted');
    expect(wrapper.classes()).toContain('new-agent-button--tile');
    expect(wrapper.get('.agent-sidebar__new').text()).toContain('Add Agent');
    expect(wrapper.find('[aria-label="Open Bench"]').exists()).toBe(false);

    await wrapper.get('.agent-sidebar__new').trigger('click');

    expect(wrapper.emitted('new-agent')).toStrictEqual([[]]);
  });

  it('renders a small ghost variant for compact headers', () => {
    const wrapper = mountButton([], {
      label: 'Add Agent',
      showBenchMenu: false,
      size: 'small',
      tone: 'ghost',
    });

    expect(wrapper.classes()).toContain('new-agent-button--ghost');
    expect(wrapper.classes()).toContain('new-agent-button--small');
    expect(wrapper.find('[aria-label="Open Bench"]').exists()).toBe(false);
  });

  it('deploys a Bench template and hides the menu', async () => {
    const wrapper = mountButton();

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.findAll('.new-agent-menu__template').find((row) => row.text().includes('Dina'))?.trigger('click');

    expect(wrapper.emitted('deploy-bench-template')).toStrictEqual([['bench-dina']]);
    expect(popoverVisible(wrapper)).toBe(false);
  });

  it('closes the menu before confirming Bench template removal', async () => {
    const wrapper = mountButton();
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockImplementation(async () => {
      expect(popoverVisible(wrapper)).toBe(false);
      return 'confirm' as never;
    });

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Remove Dina from Bench"]').trigger('click');
    await flushPromises();

    expect(confirm).toHaveBeenCalledWith(
      'Dina will be removed from Bench. Existing agents stay unchanged.',
      'Remove Dina from Bench?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Remove',
        type: 'warning',
      },
    );
    expect(wrapper.emitted('remove-bench-template')).toStrictEqual([['bench-dina']]);
  });

  it('keeps a Bench template when removal confirmation is canceled', async () => {
    const wrapper = mountButton();
    vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('cancel'));

    await wrapper.get('[aria-label="Open Bench"]').trigger('click');
    await flushPromises();
    await wrapper.get('[aria-label="Remove Dina from Bench"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('remove-bench-template')).toBeUndefined();
  });
});

function mountButton(templates = bench, props: NewAgentButtonMountProps = {}) {
  return mount(NewAgentButton, {
    props: {
      bench: templates,
      ...props,
    },
    global: {
      plugins: [ElementPlus],
    },
  });
}

function popoverVisible(wrapper: ReturnType<typeof mountButton>): boolean {
  return wrapper.findComponent({ name: 'ElPopover' }).props('visible') === true;
}

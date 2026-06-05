import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it, vi } from 'vitest';
import AgentDialog from '../AgentDialog.vue';
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../../../shared/contracts';

const idleAgent: Agent = {
  id: 'agent-dina',
  name: 'Dina',
  avatar: 'DI',
  folder: '/Users/nbonamy/src/codex-claw',
  status: { type: 'idle' },
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

describe('AgentDialog', () => {
  it('renders the Skwad-style create layout and disables save until name and folder are set', () => {
    const wrapper = mountDialog();

    expect(wrapper.get('.claw-dialog__header--centered').text()).toContain('New Agent');
    expect(wrapper.get('.claw-dialog__title').text()).toBe('New Agent');
    expect(wrapper.get('.claw-dialog__subtitle').text()).toBe('Add a Codex agent to Skwad');
    expect(wrapper.text()).toContain('Add a Codex agent to Skwad');
    expect(wrapper.findAll('.agent-dialog__section')).toHaveLength(2);
    expect(wrapper.text()).toContain('Name');
    expect(wrapper.text()).toContain('Avatar');
    expect(wrapper.text()).not.toContain('Coding Agent');
    expect(wrapper.text()).not.toContain('Persona');
    expect(wrapper.text()).toContain('Folder');
    expect(saveButton(wrapper).attributes()).toHaveProperty('disabled');
  });

  it('auto-fills the name from the chosen folder and creates an agent', async () => {
    const chooseAgentFolder = vi.fn().mockResolvedValue('/Users/nbonamy/src/new-agent');
    const createAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({ chooseAgentFolder, createAgent });

    await wrapper.get('.agent-dialog__row--button').trigger('click');
    await wrapper.get('.agent-avatar-picker__trigger').trigger('click');
    await wrapper.findAll('.agent-avatar-picker__preset').find((button) => button.text() === '🤖')?.trigger('click');
    await saveButton(wrapper).trigger('click');

    expect(createAgent).toHaveBeenCalledWith({
      name: 'new-agent',
      avatar: '🤖',
      folder: '/Users/nbonamy/src/new-agent',
    });
    expect(wrapper.emitted('close')).toStrictEqual([[]]);
  });

  it('prefills edit mode and updates an idle agent', async () => {
    const updateAgent = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountDialog({
      agent: idleAgent,
      mode: 'edit',
      updateAgent,
    });

    expect(wrapper.get('.claw-dialog__header--centered').text()).toContain('Edit Agent');
    expect((wrapper.get('.agent-dialog__text-input').element as HTMLInputElement).value).toBe('Dina');
    await wrapper.get('.agent-dialog__text-input').setValue('Dina Prime');
    await saveButton(wrapper).trigger('click');

    expect(updateAgent).toHaveBeenCalledWith({
      id: 'agent-dina',
      name: 'Dina Prime',
      avatar: 'DI',
      folder: '/Users/nbonamy/src/codex-claw',
    });
  });

  it('disables editing for non-idle agents', () => {
    const wrapper = mountDialog({
      agent: {
        ...idleAgent,
        status: { type: 'working', detail: 'Running tests' },
      },
      mode: 'edit',
    });

    expect(wrapper.text()).toContain('Agent must be idle before editing.');
    expect(wrapper.get('.agent-dialog__text-input').attributes()).toHaveProperty('disabled');
    expect(saveButton(wrapper).attributes()).toHaveProperty('disabled');
  });

  it('keeps dialog open and shows errors from create/update failures', async () => {
    const createAgent = vi.fn().mockRejectedValue(new Error('Agent folder must be a directory.'));
    const wrapper = mountDialog({
      chooseAgentFolder: vi.fn().mockResolvedValue('/tmp/not-a-folder'),
      createAgent,
    });

    await wrapper.get('.agent-dialog__row--button').trigger('click');
    await wrapper.get('.agent-dialog__text-input').setValue('Broken');
    await saveButton(wrapper).trigger('click');

    expect(wrapper.text()).toContain('Agent folder must be a directory.');
    expect(wrapper.emitted('close')).toBeUndefined();
  });
});

function mountDialog(overrides: Partial<{
  agent: Agent | null;
  chooseAgentFolder: () => Promise<string | null>;
  createAgent: (input: CreateAgentInput) => Promise<void>;
  mode: 'create' | 'edit';
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
}> = {}) {
  return mount(AgentDialog, {
    props: {
      agent: null,
      chooseAgentFolder: vi.fn().mockResolvedValue(null),
      createAgent: vi.fn().mockResolvedValue(undefined),
      mode: 'create',
      updateAgent: vi.fn().mockResolvedValue(undefined),
      visible: true,
      ...overrides,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElDialog: {
          props: ['modelValue'],
          template: `
            <section v-if="modelValue" class="agent-dialog-test-shell">
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

function saveButton(wrapper: ReturnType<typeof mountDialog>) {
  const button = wrapper.findAll('button').find((candidate) => ['Add Agent', 'Save'].includes(candidate.text()));
  if (!button) {
    throw new Error('Save button not found');
  }

  return button;
}

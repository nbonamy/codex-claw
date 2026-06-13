import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import SettingsMenu from '../SettingsMenu.vue';
import type { AccountRateLimits } from '@codex-claw/shared/contracts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SettingsMenu', () => {
  it('renders primary and weekly rate-limit rows', async () => {
    const wrapper = mountMenu({
      limitId: 'codex',
      limitName: null,
      primary: {
        usedPercent: 62,
        windowDurationMins: 300,
        resetsAt: 1_780_756_682,
      },
      secondary: {
        usedPercent: 50,
        windowDurationMins: 10_080,
        resetsAt: 1_781_140_878,
      },
      credits: null,
      individualLimit: null,
      planType: 'pro',
      rateLimitReachedType: null,
    });

    await openMenu(wrapper);

    const rows = wrapper.findAll('.settings-menu__rate-limit');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.text()).toContain('5h');
    expect(rows[0]?.text()).toContain('38%');
    expect(rows[0]?.text()).toContain('9:38 AM');
    expect(rows[1]?.text()).toContain('Weekly');
    expect(rows[1]?.text()).toContain('50%');
    expect(rows[1]?.text()).toContain('Jun 10');
  });

  it('emits menu actions', async () => {
    const wrapper = mountMenu();

    await openMenu(wrapper);
    await wrapper.findAll('button').find((button) => button.text() === 'Settings')?.trigger('click');
    await openMenu(wrapper);
    await wrapper.findAll('button').find((button) => button.text() === 'Quit')?.trigger('click');

    expect(wrapper.emitted('open-settings')).toStrictEqual([[]]);
    expect(wrapper.emitted('quit')).toStrictEqual([[]]);
  });

  it('marks the trigger active when settings is selected', () => {
    const wrapper = mountMenu(undefined, { active: true });

    expect(wrapper.get('[aria-label="Settings menu"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[aria-label="Settings menu"]').classes()).toContain('settings-menu__trigger--active');
  });

  it('closes the popover when selecting a menu action', async () => {
    const wrapper = mountMenu();

    await openMenu(wrapper);
    expect(wrapper.find('[data-test="settings-popover-content"]').exists()).toBe(true);

    await wrapper.findAll('button').find((button) => button.text() === 'Settings')?.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="settings-popover-content"]').exists()).toBe(false);
  });
});

function mountMenu(rateLimits?: AccountRateLimits, props: { active?: boolean } = {}) {
  return mount(SettingsMenu, {
    attachTo: document.body,
    props: {
      ...props,
      rateLimits,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElPopover: {
          props: ['visible'],
          emits: ['update:visible'],
          template: `
            <div>
              <span @click="$emit('update:visible', !visible)">
                <slot name="reference" />
              </span>
              <section v-if="visible" data-test="settings-popover-content">
                <slot />
              </section>
            </div>
          `,
        },
      },
    },
  });
}

async function openMenu(wrapper: ReturnType<typeof mountMenu>): Promise<void> {
  await wrapper.get('[aria-label="Settings menu"]').trigger('click');
  await nextTick();
}

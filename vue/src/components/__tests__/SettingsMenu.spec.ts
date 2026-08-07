import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import SettingsMenu from '../SettingsMenu.vue';
import type { AccountRateLimits, CodexAccount } from '@codex-claw/core/contracts';

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
    expect(rows[0]?.text()).toContain(new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(1_780_756_682 * 1000)));
    expect(rows[1]?.text()).toContain('Weekly');
    expect(rows[1]?.text()).toContain('50%');
    expect(rows[1]?.text()).toContain(new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
    }).format(new Date(1_781_140_878 * 1000)));
    expect(wrapper.get('[aria-label="Usage actions divider"]').attributes('role')).toBe('separator');
  });

  it('always exposes logout in the lower-left menu and emits menu actions', async () => {
    const wrapper = mountMenu();

    await openMenu(wrapper);
    const actions = wrapper.findAll('.app-menu__item');
    expect(actions.map((button) => button.get('.app-menu__label').text())).toStrictEqual(['Settings', 'What’s New', 'Log out', 'Quit']);
    expect(actions[0]?.get('.app-menu__value').text()).toBe('⌘,');
    expect(actions[2]?.classes()).not.toContain('app-menu__item--danger');
    await actions[2]?.trigger('click');
    await openMenu(wrapper);
    await wrapper.findAll('button').find((button) => button.text() === 'What’s New')?.trigger('click');
    await openMenu(wrapper);
    await wrapper.findAll('button').find((button) => {
      const label = button.find('.app-menu__label');
      return label.exists() && label.text() === 'Settings';
    })?.trigger('click');
    await openMenu(wrapper);
    await wrapper.findAll('button').find((button) => button.text() === 'Quit')?.trigger('click');

    expect(wrapper.emitted('logout')).toStrictEqual([[]]);
    expect(wrapper.emitted('open-whats-new')).toStrictEqual([[]]);
    expect(wrapper.emitted('open-settings')).toStrictEqual([[]]);
    expect(wrapper.emitted('quit')).toStrictEqual([[]]);
  });

  it('shows the ChatGPT account and emits logout', async () => {
    const wrapper = mountMenu(undefined, {
      account: { type: 'chatgpt', email: 'nico@example.com', planType: 'pro' },
    });

    await openMenu(wrapper);
    expect(wrapper.text()).toContain('nico@example.com');
    expect(wrapper.text()).toContain('pro');
    expect(wrapper.get('[aria-label="Account menu"]').element).toBeInstanceOf(HTMLElement);
    await wrapper.findAll('button').find((button) => button.text() === 'Log out')?.trigger('click');

    expect(wrapper.emitted('logout')).toStrictEqual([[]]);
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

    await wrapper.findAll('button').find((button) => {
      const label = button.find('.app-menu__label');
      return label.exists() && label.text() === 'Settings';
    })?.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="settings-popover-content"]').exists()).toBe(false);
  });
});

function mountMenu(rateLimits?: AccountRateLimits, props: { active?: boolean; account?: CodexAccount } = {}) {
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
  await wrapper.get('[aria-label$="menu"]').trigger('click');
  await nextTick();
}

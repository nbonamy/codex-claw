import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, describe, expect, it } from 'vitest';
import SettingsMenu from '../SettingsMenu.vue';
import type { AccountRateLimits } from '../../../shared/contracts';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('SettingsMenu', () => {
  it('renders primary and weekly rate-limit rows', () => {
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

    await wrapper.findAll('button').find((button) => button.text() === 'Settings')?.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Quit')?.trigger('click');

    expect(wrapper.emitted('open-settings')).toStrictEqual([[]]);
    expect(wrapper.emitted('quit')).toStrictEqual([[]]);
  });
});

function mountMenu(rateLimits?: AccountRateLimits) {
  return mount(SettingsMenu, {
    attachTo: document.body,
    props: {
      rateLimits,
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        ElPopover: {
          template: '<div><slot name="reference" /><slot /></div>',
        },
      },
    },
  });
}

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SettingsRow from '../SettingsRow.vue';
import SettingsSection from '../SettingsSection.vue';

describe('SettingsSection and SettingsRow', () => {
  it('renders a labelled settings section with grouped rows', () => {
    const wrapper = mount({
      components: { SettingsRow, SettingsSection },
      template: `
        <SettingsSection title="Behavior" title-id="settings-behavior-title">
          <SettingsRow title="Prevent sleep" description="Keep this computer awake" />
          <SettingsRow title="Another option" error="Needs attention" />
        </SettingsSection>
      `,
    });

    expect(wrapper.attributes('aria-labelledby')).toBe('settings-behavior-title');
    expect(wrapper.get('#settings-behavior-title').text()).toBe('Behavior');
    expect(wrapper.text()).toContain('Prevent sleep');
    expect(wrapper.text()).toContain('Keep this computer awake');
    expect(wrapper.text()).toContain('Needs attention');
    expect(wrapper.findAll('.settings-row')).toHaveLength(2);
  });

  it('uses article rows by default and supports label rows with controls', () => {
    const wrapper = mount({
      components: { SettingsRow },
      template: `
        <div>
          <SettingsRow title="Plain row" />
          <SettingsRow as="label" title="Switch row">
            <template #control>
              <input type="checkbox" aria-label="Switch row" />
            </template>
          </SettingsRow>
        </div>
      `,
    });

    const rows = wrapper.findAll('.settings-row');

    expect(rows[0].element.tagName).toBe('ARTICLE');
    expect(rows[1].element.tagName).toBe('LABEL');
    expect(rows[1].get('input').attributes('aria-label')).toBe('Switch row');
  });
});

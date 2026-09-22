import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defaultGeneralSettings } from '@codex-claw/core/settings';
import SettingsClaudeCodePanel from '../SettingsClaudeCodePanel.vue';

describe('SettingsClaudeCodePanel', () => {
  it('shows only the experimental enable flag and updates it', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const wrapper = mount(SettingsClaudeCodePanel, {
      props: {
        settings: defaultGeneralSettings,
        updateSettings,
      },
    });

    expect(wrapper.text()).toContain('Enable Claude Code (experimental)');
    expect(wrapper.text()).not.toContain('ChatGPT');
    expect(wrapper.text()).not.toContain('Codex executable');

    const enableSwitch = wrapper.get<HTMLInputElement>('input[aria-label="Enable Claude Code (experimental)"]');
    expect(enableSwitch.element.checked).toBe(false);
    await enableSwitch.setValue(true);

    expect(updateSettings).toHaveBeenCalledWith({
      general: { claudeCodeEnabled: true },
    });
  });
});

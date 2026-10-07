import { product } from '@workspace/core/product';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultGeneralSettings } from '@workspace/core/settings';
import { setElectronTestClient } from '../../test/client';
import SettingsVoicePanel from '../SettingsVoicePanel.vue';

describe('SettingsVoicePanel', () => {
  beforeEach(() => { setElectronTestClient({}); });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('configures neural speech enablement, scope, voice, and preview', async () => {
    const updateSettings = vi.fn().mockResolvedValue(undefined);
    const previewSpokenAnnouncementVoice = vi.fn().mockResolvedValue({ queued: true });
    setElectronTestClient({ previewSpokenAnnouncementVoice });
    const wrapper = mountPanel({ updateSettings });
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Voice');
    expect(wrapper.text()).toContain('Let agents talk to you');
    const toggleRow = wrapper.findAllComponents({ name: 'FormRow' })
      .find((candidate) => candidate.text().includes('Spoken acknowledgments'));
    expect(toggleRow).toBeDefined();
    expect(toggleRow!.text()).toContain('on-device neural voice');
    expect(wrapper.text()).not.toContain('Choose which agents may speak');

    await toggleRow!.findComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', true);
    expect(updateSettings).toHaveBeenCalledWith({
      general: { spokenAnnouncementsEnabled: true },
    });

    await wrapper.setProps({
      settings: { ...defaultGeneralSettings, spokenAnnouncementsEnabled: true },
    });
    const voiceSection = wrapper.findAllComponents({ name: 'FormSection' })
      .find((section) => section.text().includes('Spoken acknowledgments'))!;
    expect(voiceSection.text().indexOf('Choose an on-device neural voice'))
      .toBeLessThan(voiceSection.text().indexOf('Playback rules'));
    const playbackRules = wrapper.get('details.settings-voice-panel__voice-rules');
    expect((playbackRules.element as HTMLDetailsElement).open).toBe(false);
    expect(playbackRules.get('summary').text())
      .toContain('Selected agent only · Dictated prompts · While focused');
    await playbackRules.get('summary').trigger('click');
    expect((playbackRules.element as HTMLDetailsElement).open).toBe(true);

    const rows = wrapper.findAllComponents({ name: 'FormRow' });
    const scopeRow = rows.find((candidate) => candidate.text().includes('Choose which agents may speak'))!;
    const scopeSelect = scopeRow.findComponent({ name: 'ElSelect' });
    expect(scopeSelect.classes()).toContain('settings-voice-panel__speech-scope-select');
    expect(scopeSelect.props('modelValue')).toBe('selected');
    await scopeSelect.vm.$emit('update:modelValue', 'all');
    expect(updateSettings).toHaveBeenLastCalledWith({
      general: { spokenAnnouncementScope: 'all' },
    });

    const dictatedOnlyRow = rows.find((candidate) => candidate.text().includes('Dictated prompts only'))!;
    expect(dictatedOnlyRow.text()).toContain('tasks started with voice dictation');
    expect(dictatedOnlyRow.findComponent({ name: 'ElSwitch' }).props('modelValue')).toBe(true);
    await dictatedOnlyRow.findComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', false);
    expect(updateSettings).toHaveBeenLastCalledWith({
      general: { spokenAnnouncementsOnlyForDictatedPrompts: false },
    });

    const focusedOnlyRow = rows.find((candidate) => candidate.text().includes(`Only speak while ${product.name} is focused`))!;
    expect(focusedOnlyRow.text()).toContain('Silence acknowledgments');
    expect(focusedOnlyRow.findComponent({ name: 'ElSwitch' }).props('modelValue')).toBe(true);
    await focusedOnlyRow.findComponent({ name: 'ElSwitch' }).vm.$emit('update:modelValue', false);
    expect(updateSettings).toHaveBeenLastCalledWith({
      general: { spokenAnnouncementsOnlyWhenFocused: false },
    });

    const voiceRow = rows.find((candidate) => candidate.text().includes('additional voices download'))!;
    const voiceSelect = voiceRow.findComponent({ name: 'ElSelect' });
    expect(voiceSelect.props('modelValue')).toBe('af_heart');
    expect(voiceSelect.findAllComponents({ name: 'ElOption' }).map((option) => option.props('label')))
      .toStrictEqual([
        'Heart · American',
        'Bella · American',
        'Nicole · American',
        'Sarah · American',
        'Adam · American',
        'Michael · American',
        'Emma · British',
        'George · British',
      ]);
    await voiceSelect.vm.$emit('update:modelValue', 'bf_emma');
    expect(updateSettings).toHaveBeenLastCalledWith({
      general: { spokenAnnouncementVoice: 'bf_emma' },
    });
    await wrapper.setProps({
      settings: {
        ...defaultGeneralSettings,
        spokenAnnouncementsEnabled: true,
        spokenAnnouncementVoice: 'bf_emma',
      },
    });
    await voiceRow.findAll('button').find((button) => button.text() === 'Preview')?.trigger('click');
    await flushPromises();
    expect(previewSpokenAnnouncementVoice).toHaveBeenCalledWith('bf_emma');
  });

  it('shows when native voice preview is unavailable', async () => {
    setElectronTestClient({
      previewSpokenAnnouncementVoice: vi.fn().mockResolvedValue({
        queued: false,
        reason: 'unsupported',
      }),
    });
    const wrapper = mountPanel({
      settings: { ...defaultGeneralSettings, spokenAnnouncementsEnabled: true },
    });
    await flushPromises();

    await wrapper.findAll('button').find((button) => button.text() === 'Preview')?.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Voice preview could not be queued on this device.');
  });

  it('disables voice preview until the native operation finishes', async () => {
    let finishPreview: (result: { queued: boolean }) => void = () => {};
    const previewSpokenAnnouncementVoice = vi.fn().mockImplementation(() => (
      new Promise<{ queued: boolean }>((resolve) => {
        finishPreview = resolve;
      })
    ));
    setElectronTestClient({ previewSpokenAnnouncementVoice });
    const wrapper = mountPanel({
      settings: { ...defaultGeneralSettings, spokenAnnouncementsEnabled: true },
    });
    await flushPromises();
    const preview = wrapper.findAllComponents({ name: 'ElButton' })
      .find((button) => button.text() === 'Preview')!;

    await preview.trigger('click');
    expect(preview.props('disabled')).toBe(true);

    finishPreview({ queued: true });
    await flushPromises();
    expect(preview.props('disabled')).toBe(false);
  });
});

function mountPanel(props: Record<string, unknown>) {
  return mount(SettingsVoicePanel, {
    props: {
      settings: defaultGeneralSettings,
      ...props,
    },
  });
}

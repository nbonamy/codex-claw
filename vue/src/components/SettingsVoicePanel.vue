<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsVoicePanel.voice')"
    title-id="settings-voice-title"
  >
    <template #banner>
      <SettingsIntro
        kind="voice"
        :title="$t('surface.settingsVoicePanel.introTitle')"
        :description="$t('surface.settingsVoicePanel.introDescription')"
      />
    </template>

    <FormSection>
      <FormRow
        as="label"
        :title="$t('surface.settingsVoicePanel.spokenAcknowledgments')"
        :description="$t('surface.settingsVoicePanel.letAgentsSpeakBriefTaskStartAndFinishPhrases')"
      >
        <template #control>
          <el-switch
            :model-value="settings.spokenAnnouncementsEnabled"
            :aria-label="$t('surface.settingsVoicePanel.spokenAcknowledgments')"
            @update:model-value="updateSpokenAnnouncementsEnabled"
          />
        </template>
      </FormRow>
      <FormRow
        v-if="settings.spokenAnnouncementsEnabled"
        :title="$t('surface.settingsVoicePanel.voice')"
        :description="$t('surface.settingsVoicePanel.chooseAnOnDeviceNeuralVoice')"
        :error="voicePreviewError"
      >
        <template #control>
          <span class="settings-voice-panel__actions">
            <el-select
              class="settings-voice-panel__voice-select"
              :model-value="settings.spokenAnnouncementVoice"
              :aria-label="$t('surface.settingsVoicePanel.voice')"
              @update:model-value="updateSpokenAnnouncementVoice"
            >
              <el-option
                v-for="option in voiceOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <el-button
              size="small"
              :loading="previewingVoice"
              :disabled="previewingVoice"
              :aria-label="$t('surface.settingsVoicePanel.previewVoice')"
              @click="previewVoice"
            >
              {{ $t('surface.settingsVoicePanel.preview') }}
            </el-button>
          </span>
        </template>
      </FormRow>
      <details
        v-if="settings.spokenAnnouncementsEnabled"
        class="settings-voice-panel__voice-rules"
      >
        <summary class="settings-voice-panel__voice-rules-summary">
          <span class="settings-voice-panel__voice-rules-copy">
            <strong>{{ $t('surface.settingsVoicePanel.playbackRules') }}</strong>
            <span>{{ voiceRulesSummary }}</span>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div class="settings-voice-panel__voice-rules-content">
          <FormRow
            :title="$t('surface.settingsVoicePanel.scope')"
            :description="$t('surface.settingsVoicePanel.chooseWhichAgentsMaySpeak')"
          >
            <template #control>
              <el-select
                class="settings-voice-panel__speech-scope-select"
                :model-value="settings.spokenAnnouncementScope"
                :aria-label="$t('surface.settingsVoicePanel.spokenAcknowledgmentScope')"
                @update:model-value="updateSpokenAnnouncementScope"
              >
                <el-option
                  :label="$t('surface.settingsVoicePanel.selectedAgentOnly')"
                  value="selected"
                />
                <el-option
                  :label="$t('surface.settingsVoicePanel.allAgents')"
                  value="all"
                />
              </el-select>
            </template>
          </FormRow>
          <FormRow
            as="label"
            :title="$t('surface.settingsVoicePanel.dictatedPromptsOnly')"
            :description="$t('surface.settingsVoicePanel.speakOnlyForTasksStartedWithVoiceDictation')"
          >
            <template #control>
              <el-switch
                :model-value="settings.spokenAnnouncementsOnlyForDictatedPrompts"
                :aria-label="$t('surface.settingsVoicePanel.dictatedPromptsOnly')"
                @update:model-value="updateSpokenAnnouncementsOnlyForDictatedPrompts"
              />
            </template>
          </FormRow>
          <FormRow
            as="label"
            :title="$t('surface.settingsVoicePanel.onlySpeakWhileFocused')"
            :description="$t('surface.settingsVoicePanel.silenceAcknowledgmentsWhileAppIsInTheBackground')"
          >
            <template #control>
              <el-switch
                :model-value="settings.spokenAnnouncementsOnlyWhenFocused"
                :aria-label="$t('surface.settingsVoicePanel.onlySpeakWhileFocused')"
                @update:model-value="updateSpokenAnnouncementsOnlyWhenFocused"
              />
            </template>
          </FormRow>
        </div>
      </details>
    </FormSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AppGeneralSettings, SpokenAnnouncementScope, SpokenAnnouncementVoice, UpdateSettingsInput } from '@workspace/core/contracts';
import { translate } from '../i18n';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsIntro from './SettingsIntro.vue';
import FormRow from '../shared/form/FormRow.vue';
import FormSection from '../shared/form/FormSection.vue';
import { ChevronDown } from '../shared/icons/app-icons';
import { appApi } from '../platform-api';

const props = defineProps<{
  settings: AppGeneralSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const previewingVoice = ref(false);
const voicePreviewError = ref<string | null>(null);
const voiceOptions: Array<{ label: string; value: SpokenAnnouncementVoice }> = [
  { label: translate('surface.settingsVoicePanel.voiceHeart'), value: 'af_heart' },
  { label: translate('surface.settingsVoicePanel.voiceBella'), value: 'af_bella' },
  { label: translate('surface.settingsVoicePanel.voiceNicole'), value: 'af_nicole' },
  { label: translate('surface.settingsVoicePanel.voiceSarah'), value: 'af_sarah' },
  { label: translate('surface.settingsVoicePanel.voiceAdam'), value: 'am_adam' },
  { label: translate('surface.settingsVoicePanel.voiceMichael'), value: 'am_michael' },
  { label: translate('surface.settingsVoicePanel.voiceEmma'), value: 'bf_emma' },
  { label: translate('surface.settingsVoicePanel.voiceGeorge'), value: 'bm_george' },
];
const voiceRulesSummary = computed(() => [
  translate(props.settings.spokenAnnouncementScope === 'all'
    ? 'surface.settingsVoicePanel.allAgents'
    : 'surface.settingsVoicePanel.selectedAgentOnly'),
  translate(props.settings.spokenAnnouncementsOnlyForDictatedPrompts
    ? 'surface.settingsVoicePanel.dictatedPrompts'
    : 'surface.settingsVoicePanel.allPrompts'),
  translate(props.settings.spokenAnnouncementsOnlyWhenFocused
    ? 'surface.settingsVoicePanel.whileFocused'
    : 'surface.settingsVoicePanel.inTheBackgroundToo'),
].join(' · '));

function updateSpokenAnnouncementsEnabled(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: {
      spokenAnnouncementsEnabled: value === true,
    },
  });
}

function updateSpokenAnnouncementScope(value: SpokenAnnouncementScope): void {
  void props.updateSettings?.({
    general: { spokenAnnouncementScope: value },
  });
}

function updateSpokenAnnouncementsOnlyForDictatedPrompts(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: { spokenAnnouncementsOnlyForDictatedPrompts: value === true },
  });
}

function updateSpokenAnnouncementsOnlyWhenFocused(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: { spokenAnnouncementsOnlyWhenFocused: value === true },
  });
}

function updateSpokenAnnouncementVoice(value: SpokenAnnouncementVoice): void {
  voicePreviewError.value = null;
  void props.updateSettings?.({
    general: { spokenAnnouncementVoice: value },
  });
}

async function previewVoice(): Promise<void> {
  voicePreviewError.value = null;
  previewingVoice.value = true;
  try {
    const result = await appApi?.previewSpokenAnnouncementVoice?.(
      props.settings.spokenAnnouncementVoice,
    );
    if (!result?.queued) {
      voicePreviewError.value = translate('surface.settingsVoicePanel.voicePreviewUnavailable');
    }
  } catch {
    voicePreviewError.value = translate('surface.settingsVoicePanel.voicePreviewUnavailable');
  } finally {
    previewingVoice.value = false;
  }
}
</script>

<style scoped>
.settings-voice-panel__speech-scope-select {
  width: 220px;
  max-width: 100%;
}

.settings-voice-panel__voice-select {
  width: 190px;
}

.settings-voice-panel__voice-rules {
  border-top: 1px solid var(--color-border);
}

.settings-voice-panel__voice-rules-summary {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  padding: var(--space-8);
  cursor: pointer;
  list-style: none;
}

.settings-voice-panel__voice-rules-summary::-webkit-details-marker {
  display: none;
}

.settings-voice-panel__voice-rules-summary svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
  transition: transform 120ms ease;
}

.settings-voice-panel__voice-rules[open] .settings-voice-panel__voice-rules-summary svg {
  transform: rotate(180deg);
}

.settings-voice-panel__voice-rules-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-voice-panel__voice-rules-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
}

.settings-voice-panel__voice-rules-copy span {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-voice-panel__voice-rules-content {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.settings-voice-panel__voice-rules-content :deep(.form-row + .form-row) {
  border-top: 1px solid var(--color-border);
}

.settings-voice-panel__actions {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  gap: var(--space-8);
}
</style>

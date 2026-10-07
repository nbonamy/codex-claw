<template>
  <form class="automation-editor" @submit.prevent="submit">
    <header class="automation-editor__header">
      <h3>{{ $t(mode === 'edit' ? 'surface.automationEditor.editAutomation' : 'surface.automationEditor.createAutomation') }}</h3>
      <el-switch v-model="form.enabled" :aria-label="$t('surface.automationEditor.automationEnabled')" />
    </header>
    <div class="automation-editor__body">
      <SettingsSection density="compact">
        <SettingsRow :title="$t('promptAutomation.name')">
          <template #control>
            <el-input id="automation-name" v-model="form.name" :aria-label="$t('promptAutomation.name')" />
          </template>
        </SettingsRow>
        <SettingsRow class="automation-editor__prompt" :title="$t('promptAutomation.prompt')">
          <template #control>
            <VoiceTextarea id="automation-prompt" v-model="form.prompt" :label="$t('promptAutomation.prompt')" :rows="3"
              :placeholder="$t('promptAutomation.promptPlaceholder')" @busy-change="promptBusy = $event" />
          </template>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection density="compact" :title="$t('promptAutomation.target')" title-id="automation-run-in">
        <SettingsRow :title="$t('promptAutomation.team')">
          <template #control>
            <el-select id="automation-team" v-model="form.teamId" :aria-label="$t('surface.automationEditor.automationTargetTeam')">
              <el-option v-for="team in teams" :key="team.id" :value="team.id" :label="team.name" />
            </el-select>
          </template>
        </SettingsRow>
        <SettingsRow :title="$t('promptAutomation.conversation')">
          <template #control>
            <el-select id="automation-target" v-model="form.kind" :aria-label="$t('promptAutomation.target')">
              <el-option value="newQuickChat" :label="$t('promptAutomation.newQuickChat')" />
              <el-option value="quickChat" :label="$t('promptAutomation.quickChat')" />
              <el-option value="agent" :label="$t('promptAutomation.agent')" />
            </el-select>
          </template>
        </SettingsRow>
        <SettingsRow v-if="form.kind !== 'newQuickChat'" :title="$t(form.kind === 'agent' ? 'promptAutomation.agent' : 'promptAutomation.quickChat')"
          :description="$t('promptAutomation.inheritsSettings')">
          <template #control>
            <el-select id="automation-agent" v-model="form.agentId" filterable fit-input-width :aria-label="$t('promptAutomation.conversation')"
              :placeholder="$t(form.kind === 'agent' ? 'promptAutomation.agent' : 'promptAutomation.quickChat')">
              <el-option v-for="agent in targetAgents" :key="agent.id" :value="agent.id" :label="conversationLabel(agent)" :title="conversationLabel(agent)" />
            </el-select>
          </template>
        </SettingsRow>
      </SettingsSection>
      <AutomationScheduleEditor v-model="schedule" :automation="automation" />
      <SettingsSection v-if="form.kind === 'newQuickChat'" density="compact" :title="$t('promptAutomation.model')" title-id="automation-model">
        <SettingsRow :title="$t('handoff.engine')">
          <template #control>
            <BackendSelector v-model="form.backend" class="automation-editor__backend" :team-id="form.teamId"
              :preserve-selection="Boolean(automation)" show-single-choice />
          </template>
        </SettingsRow>
        <SettingsRow :title="$t('promptAutomation.model')" :description="modelsError ? $t('promptAutomation.modelsUnavailable') : undefined">
          <template #control>
            <el-select v-model="form.model" filterable allow-create clearable :loading="modelsLoading"
              :aria-label="$t('promptAutomation.model')" :placeholder="$t('promptAutomation.defaultModel')">
              <el-option v-for="model in models" :key="model.model" :value="model.model" :label="model.displayName" />
            </el-select>
          </template>
        </SettingsRow>
        <SettingsRow :title="$t('promptAutomation.effort')">
          <template #control>
            <el-select v-model="form.reasoningEffort" filterable allow-create clearable :aria-label="$t('promptAutomation.effort')"
              :placeholder="$t('promptAutomation.defaultEffort')">
              <el-option v-for="effort in efforts" :key="effort.reasoningEffort" :value="effort.reasoningEffort" :label="effort.reasoningEffort" />
            </el-select>
          </template>
        </SettingsRow>
      </SettingsSection>
      <p v-if="targetRemoved" class="automation-editor__notice" role="alert">{{ $t('promptAutomation.invalidTarget') }}</p>
      <p v-if="error" class="automation-editor__notice" role="alert">{{ error }}</p>
    </div>
    <footer class="automation-editor__footer">
      <el-button @click="emit('cancel')">{{ $t('surface.automationEditor.cancel') }}</el-button>
      <el-button type="primary" native-type="submit" :disabled="!canSubmit" :loading="saving">{{ $t('surface.automationEditor.saveAutomation') }}</el-button>
    </footer>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { Agent, AgentBackend, Automation, AutomationSchedule, AutomationTarget, BackendModelOption, CreateAutomationInput, Team } from '@workspace/core/contracts';
import { agentDisplayName } from '@workspace/core/agent-display';
import { normalizeAutomationSchedule } from '@workspace/core/automation-schedule';
import AutomationScheduleEditor from './AutomationScheduleEditor.vue';
import VoiceTextarea from '../shared/VoiceTextarea.vue';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import BackendSelector from './BackendSelector.vue';
import { useBackendChoices } from './backend-selection';

const props = withDefaults(defineProps<{
  automation?: Automation | null; mode: 'create' | 'edit'; agents: Agent[]; teams: Team[];
  error?: string | null; saving?: boolean;
  listModels?: (agentId: string, backend: AgentBackend) => Promise<BackendModelOption[]>;
}>(), { automation: null, error: null, saving: false, listModels: async () => [] });
const emit = defineEmits<{ cancel: []; submit: [input: CreateAutomationInput] }>();
const target = props.automation?.target;
const form = reactive({
  name: props.automation?.name ?? '', prompt: props.automation?.prompt ?? '', enabled: props.automation?.enabled ?? true,
  kind: target?.kind ?? 'newQuickChat' as AutomationTarget['kind'],
  teamId: target?.kind === 'newQuickChat' ? target.teamId
    : props.agents.find(agent => target && agent.id === target.agentId)?.teamId ?? props.teams[0]?.id ?? '',
  agentId: target && target.kind !== 'newQuickChat' && props.agents.some(agent => agent.id === target.agentId) ? target.agentId : '',
  backend: (target?.kind === 'newQuickChat' ? target.backend : undefined) as AgentBackend | undefined,
  model: target?.kind === 'newQuickChat' ? target.model ?? '' : '',
  reasoningEffort: target?.kind === 'newQuickChat' ? target.reasoningEffort ?? '' : '',
});
const schedule = ref<AutomationSchedule>(props.automation?.schedule ?? { rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
// The saved conversation was removed; keep saving blocked until the user picks another.
const targetRemoved = computed(() => Boolean(target && target.kind !== 'newQuickChat' && form.kind === target.kind && !form.agentId
  && !props.agents.some(agent => agent.id === target.agentId)));
const promptBusy = ref(false);
const models = ref<BackendModelOption[]>([]);
const modelsLoading = ref(false);
const modelsError = ref(false);
const engineChoices = useBackendChoices(() => form.teamId);
const targetAgents = computed(() => props.agents.filter(agent => agent.teamId === form.teamId && (form.kind === 'quickChat') === (agent.sessionKind === 'quickChat')));
function conversationLabel(agent: Agent): string {
  const name = agentDisplayName(agent);
  if (agent.sessionKind === 'quickChat') return name;
  const repository = agent.workspace?.kind === 'git' ? agent.workspace.repositoryName
    : agent.folder?.split(/[\\/]/).filter(Boolean).at(-1);
  return repository ? `${name} @ ${repository}` : name;
}
const efforts = computed(() => models.value.find(model => model.model === form.model)?.supportedReasoningEfforts ?? []);
const canSubmit = computed(() => !props.saving && !promptBusy.value && Boolean(form.prompt.trim()) && normalizeAutomationSchedule(schedule.value) !== null &&
  (form.kind === 'newQuickChat'
    ? props.teams.some(team => team.id === form.teamId) && Boolean(form.backend && engineChoices.value.includes(form.backend))
    : targetAgents.value.some(agent => agent.id === form.agentId)));
watch([() => form.kind, () => form.teamId], () => { form.agentId = ''; });
watch(() => form.backend, (_backend, previous) => { if (previous) { form.model = ''; form.reasoningEffort = ''; } });
watch(() => form.model, (_model, previous) => { if (previous) form.reasoningEffort = ''; });
watch([() => form.backend, () => props.agents[0]?.id, () => form.kind], async ([backend, agentId, kind], _previous, cleanup) => {
  let current = true;
  cleanup(() => { current = false; });
  models.value = [];
  modelsError.value = false;
  modelsLoading.value = false;
  if (!backend || !agentId || kind !== 'newQuickChat') return;
  modelsLoading.value = true;
  try { const result = await props.listModels(agentId, backend); if (current) models.value = result.filter(model => !model.hidden); }
  catch { if (current) modelsError.value = true; }
  finally { if (current) modelsLoading.value = false; }
}, { immediate: true });
function submit() {
  if (!canSubmit.value) return;
  const target: AutomationTarget = form.kind === 'newQuickChat'
    ? { kind: 'newQuickChat', teamId: form.teamId, backend: form.backend!,
      ...(form.model.trim() ? { model: form.model.trim() } : {}),
      ...(form.reasoningEffort.trim() ? { reasoningEffort: form.reasoningEffort.trim() } : {}) }
    : { kind: form.kind, agentId: form.agentId };
  emit('submit', { name: form.name.trim(), enabled: form.enabled, prompt: form.prompt.trim(), target, schedule: schedule.value });
}
</script>
<style scoped>
.automation-editor {
  max-height: calc(100vh - var(--workbench-appbar-height) - var(--space-32));
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.automation-editor__header {
  position: sticky;
  top: 0;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-16);
  padding-bottom: var(--space-6);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-shell-main);
}

.automation-editor__header h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-18);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.automation-editor__body {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-8) var(--space-6) var(--space-8) 0;
  scrollbar-width: thin;
}

.automation-editor__body > * + * {
  margin-top: var(--space-12);
}

.automation-editor .el-input,
.automation-editor .el-select,
.automation-editor__backend {
  width: 220px;
}

.automation-editor__prompt {
  grid-template-columns: minmax(0, 1fr);
}

.automation-editor__prompt :deep(.settings-row__control) {
  justify-self: stretch;
}

.automation-editor__prompt .voice-textarea {
  width: 100%;
}

.automation-editor__notice {
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  padding: var(--space-10) var(--space-12);
  border: 1px solid var(--color-warning-container);
  border-radius: var(--radius-md);
  color: var(--color-on-warning-container);
  background: var(--color-warning-container);
}

.automation-editor__footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-shell-main);
}
</style>

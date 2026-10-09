<template>
  <FormSection class="settings-git-workflow" :title="$t('gitWorkflow.title')">
    <FormRow v-if="!agentId" :title="$t('gitWorkflow.scope')">
      <template #control>
        <el-select :model-value="selected || 'app-defaults'" :aria-label="$t('gitWorkflow.scope')" :disabled="saving" @update:model-value="selected = $event === 'app-defaults' ? '' : $event">
          <el-option value="app-defaults" :label="$t('gitWorkflow.appDefaults')" />
          <el-option v-for="agent in repositories" :key="agent.id" :value="agent.id" :label="agent.folder ?? agent.name" />
        </el-select>
      </template>
    </FormRow>
    <template v-if="!loading && (!selected || workflow)">
      <FormRow v-for="kind in kinds" :key="kind" :title="$t(`gitWorkflow.${kind}`)">
        <template #control>
          <GitStrategySelect :model-value="draft[kind]" :kind="kind" :label="$t(`gitWorkflow.${kind}`)" :inherit="selected ? defaults[kind] : undefined" @update:model-value="draft[kind] = $event" />
        </template>
      </FormRow>
      <FormRow v-if="selected" :title="$t('gitWorkflow.base')">
        <template #control><el-input v-model="draft.baseBranch" :aria-label="$t('gitWorkflow.base')" :placeholder="$t('gitWorkflow.automatic')" /></template>
      </FormRow>
      <div class="settings-git-workflow__actions"><button class="app-button app-button--secondary" type="button" :disabled="saving" @click="save">{{ $t('gitWorkflow.save') }}</button></div>
    </template>
    <p v-if="loading" role="status">{{ $t('gitWorkflow.loading') }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="saved" role="status">{{ $t('gitWorkflow.saved') }}</p>
  </FormSection>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type { Agent, AgentGitWorkflow, AppGeneralSettings, UpdateSettingsInput } from '@workspace/core/contracts';
import { normalizeGitRepositoryPreferences, normalizeGitSettings } from '@workspace/core/git-preferences';
import { appApi } from '../platform-api';
import FormSection from '../shared/form/FormSection.vue';
import FormRow from '../shared/form/FormRow.vue';
import GitStrategySelect from './GitStrategySelect.vue';
const props = defineProps<{ settings?: AppGeneralSettings; agents?: Agent[]; agentId?: string; updateSettings?: (input: UpdateSettingsInput) => Promise<void> }>();
const selected = ref(props.agentId ?? '');
const workflow = ref<AgentGitWorkflow>();
const loading = ref(false), saving = ref(false), saved = ref(false), error = ref('');
const kinds = ['pull', 'update', 'integration'] as const;
const draft = reactive({ pull: '', update: '', integration: '', baseBranch: '' });
const defaults = computed(() => workflow.value?.preferences?.defaults ?? normalizeGitSettings(props.settings?.git).defaults);
const repositories = computed(() => {
  const seen = new Set<string>();
  return (props.agents ?? []).filter(agent => {
    if (!agent.folder || agent.workspace?.kind !== 'git') return false;
    const key = `${agent.teamId}:${agent.workspace.primaryWorktreeRoot}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
});
let request = 0;
watch(() => [selected.value, props.agentId], async () => {
  if (props.agentId) selected.value = props.agentId;
  const token = ++request;
  workflow.value = undefined; error.value = ''; saved.value = false; loading.value = !!selected.value;
  try {
    const result = selected.value ? await appApi!.getAgentGitWorkflow(selected.value) : undefined;
    if (token !== request) return;
    workflow.value = result;
    const value = selected.value ? result?.preferences?.overrides ?? {} : normalizeGitSettings(props.settings?.git).defaults;
    Object.assign(draft, { pull: '', update: '', integration: '', baseBranch: '' }, value);
  } catch (cause) { if (token === request) error.value = String(cause); }
  finally { if (token === request) loading.value = false; }
}, { immediate: true });
async function save(): Promise<void> {
  saving.value = true; error.value = ''; saved.value = false;
  const token = request;
  try {
    const preferences = normalizeGitRepositoryPreferences(draft);
    if (selected.value) {
      const result = await appApi!.updateAgentGitPreferences(selected.value, preferences);
      if (token === request) workflow.value = result;
    } else {
      if (!props.updateSettings) throw new Error('Settings unavailable.');
      const git = normalizeGitSettings(props.settings?.git);
      await props.updateSettings({ general: { git: { defaults: { ...git.defaults, ...preferences } } } });
    }
    if (token === request) saved.value = true;
  } catch (cause) { if (token === request) error.value = String(cause); }
  finally { saving.value = false; }
}
</script>
<style scoped>
.settings-git-workflow :deep(.el-select),
.settings-git-workflow :deep(.el-input) {
  width: 280px;
  max-width: 100%;
}
.settings-git-workflow__actions { padding: var(--space-16); }
</style>

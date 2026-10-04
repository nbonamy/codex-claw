<template>
  <FormDialog class="agent-handoff-dialog" width="480px" :model-value="true" :title="t('handoff.submit')" @update:model-value="close">
    <form id="agent-handoff-form" class="claw-form-dialog agent-handoff-form" @submit.prevent="submitHandoff">
      <div class="agent-handoff-form__destination">
        <FormDialogField :label="t('handoff.engine')">
          <BackendSelector v-model="backend" :team-id="agent.teamId" :disabled="busy" />
          <span v-if="choices.length === 1">{{ backendDisplayName(choices[0]!) }}</span>
        </FormDialogField>
        <FormDialogField :label="t('handoff.model')" label-for="handoff-model">
          <el-select id="handoff-model" v-model="model" :disabled="busy || loadingModels" :aria-label="t('handoff.model')">
            <el-option :value="defaultModel" :label="t('handoff.defaultModel')" />
            <el-option v-for="choice in models" :key="choice.id" :value="choice.model" :label="choice.displayName" />
          </el-select>
        </FormDialogField>
      </div>
      <FormDialogField :label="t('handoff.instructions')" label-for="handoff-instructions">
        <el-input id="handoff-instructions" v-model="instructions" type="textarea" :rows="3" :maxlength="4000" :disabled="busy" :placeholder="t('handoff.optional')" />
      </FormDialogField>
      <p class="claw-form-dialog__help agent-handoff-form__workspace" :title="agent.folder ?? undefined">{{ agent.folder }}</p>
      <p class="claw-form-dialog__help">{{ t('handoff.permissions') }}</p>
      <el-alert v-if="blocker || error" :title="error || blocker || ''" type="error" :closable="false" />
      <p v-if="busy" role="status">{{ t('handoff.preparing') }}</p>
      <details v-if="agent.handoff?.note">
        <summary>{{ t('handoff.savedNote') }}</summary>
        <p v-if="agent.handoff.error">{{ agent.handoff.error }}</p>
        <pre class="handoff-note">{{ agent.handoff.note }}</pre>
        <button class="claw-button claw-button--tertiary" type="button" @click="openSource">{{ t('handoff.source') }}</button>
      </details>
    </form>
    <template #footer>
      <button class="claw-button claw-button--tertiary" type="button" @click="close">{{ busy ? t('handoff.hide') : t('handoff.cancel') }}</button>
      <button class="claw-button claw-button--primary" type="submit" form="agent-handoff-form" :disabled="busy || !!blocker || !backend || loadingModels">{{ t('handoff.submit') }}</button>
    </template>
  </FormDialog>
  <AutomationExecutionConversationOverlay v-if="sourceVisible" :agent-name="agent.handoff?.sourceTitle ?? ''" :ticket="t('handoff.source')" :messages="sourceMessages" :loading="sourceLoading" :error="sourceError" @close="sourceVisible = false" />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Agent, AgentBackend, BackendConversationRef, BackendModelOption, RendererMessage } from '@codex-claw/core/contracts';
import type { AgentHandoffInput } from '@codex-claw/core/agent-handoff';
import { backendDisplayName } from '@codex-claw/core/backend-driver';
import FormDialog from '../shared/dialog/FormDialog.vue';
import FormDialogField from '../shared/dialog/FormDialogField.vue';
import BackendSelector from './BackendSelector.vue';
import { useBackendChoices } from './backend-selection';
import AutomationExecutionConversationOverlay from './AutomationExecutionConversationOverlay.vue';

const props = defineProps<{
  agent: Agent;
  blocker?: string | null;
  submit: (agentId: string, input: AgentHandoffInput) => Promise<void>;
  listModels: (agentId: string, backend: AgentBackend) => Promise<BackendModelOption[]>;
  readMessages?: (ref: BackendConversationRef, agentId: string) => Promise<RendererMessage[]>;
}>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const choices = useBackendChoices(() => props.agent.teamId);
const backend = ref<AgentBackend | undefined>(choices.value.find(choice => choice !== props.agent.backend) ?? choices.value[0]);
const defaultModel = '__provider_default__';
const model = ref(defaultModel);
const models = ref<BackendModelOption[]>([]);
const instructions = ref('');
const busy = ref(false);
const error = ref('');
const loadingModels = ref(false);
const operationId = crypto.randomUUID();
const sourceVisible = ref(false);
const sourceLoading = ref(false);
const sourceError = ref('');
const sourceMessages = ref<RendererMessage[]>([]);
watch(backend, async (value, _, cleanup) => {
  let current = true;
  cleanup(() => { current = false; });
  models.value = [];
  model.value = defaultModel;
  if (!value) return;
  loadingModels.value = true;
  try { const result = await props.listModels(props.agent.id, value); if (current) models.value = result.filter(item => !item.hidden); }
  catch { /* The provider default remains a valid choice when the catalog is unavailable. */ }
  finally { if (current) loadingModels.value = false; }
}, { immediate: true });
async function submitHandoff() {
  if (busy.value || props.blocker || !backend.value || loadingModels.value) return;
  busy.value = true;
  error.value = '';
  try {
    await props.submit(props.agent.id, { operationId, backend: backend.value, ...(model.value !== defaultModel ? { model: model.value } : {}), ...(instructions.value.trim() ? { instructions: instructions.value.trim() } : {}) });
    emit('close');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
function close() { emit('close'); }
async function openSource() {
  const handoff = props.agent.handoff;
  if (!handoff || !props.readMessages) return;
  sourceVisible.value = true;
  sourceLoading.value = true;
  sourceError.value = '';
  try { sourceMessages.value = await props.readMessages(handoff.sourceRef, props.agent.id); }
  catch (cause) { sourceError.value = cause instanceof Error ? cause.message : String(cause); }
  finally { sourceLoading.value = false; }
}
</script>

<style>
.agent-handoff-dialog.el-dialog {
  padding: 0;
}

.agent-handoff-dialog .el-dialog__header {
  padding: var(--space-8) var(--space-10) var(--space-6);
}

.agent-handoff-dialog .claw-form-dialog__header {
  margin: 0;
}

.agent-handoff-dialog .claw-dialog__title {
  font-size: var(--font-size-16);
  line-height: var(--line-height-22);
}

.agent-handoff-dialog .el-dialog__body {
  padding: 0 var(--space-10) var(--space-8);
}

.agent-handoff-dialog .el-dialog__footer {
  padding: var(--space-6) var(--space-10);
}
</style>

<style scoped>
.agent-handoff-form {
  gap: var(--space-6);
}

.agent-handoff-form__destination {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-6);
}

.agent-handoff-form__destination :deep(.backend-selector) {
  width: 100%;
}

.agent-handoff-form__workspace {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.handoff-note {
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>

<template>
  <el-dialog
    class="claw-dialog agent-dialog"
    :model-value="visible"
    :teleported="false"
    width="620px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-form-dialog__header agent-dialog__header">
        <h2 class="claw-dialog__title">{{ title }}</h2>
        <p class="claw-dialog__subtitle">{{ subtitle }}</p>
      </div>
    </template>

    <el-form
      class="claw-form-dialog agent-dialog__form"
      @submit.prevent="submit"
    >
      <section class="claw-form-dialog__field agent-dialog__field">
        <div class="claw-form-dialog__field-heading agent-dialog__field-heading">
          <span class="claw-form-dialog__label agent-dialog__label">Identity</span>
          <span class="claw-form-dialog__heading-separator agent-dialog__heading-separator">•</span>
          <p class="claw-form-dialog__help agent-dialog__help">Set the avatar and sidebar name.</p>
        </div>
        <div style="display:flex; align-items: center; gap: var(--space-4);">
            <AgentAvatarPicker
              v-model="avatar"
              :name="name || folderName || 'Agent'"
              class="agent-dialog__identity-avatar"
            />
          <div class="claw-form-dialog__control agent-dialog__identity-control">
            <input
              id="agent-dialog-name"
              v-model="name"
              class="claw-form-dialog__text-input agent-dialog__text-input"
              type="text"
              aria-label="Agent name"
              placeholder="Enter agent name"
              :disabled="!canEdit"
            />
          </div>
        </div>
      </section>

      <section class="claw-form-dialog__field agent-dialog__field">
        <div class="claw-form-dialog__field-heading agent-dialog__field-heading">
          <label
            class="claw-form-dialog__label agent-dialog__label"
            for="agent-dialog-backend"
          >
            Backend
          </label>
          <span class="claw-form-dialog__heading-separator agent-dialog__heading-separator">•</span>
          <p class="claw-form-dialog__help agent-dialog__help">Choose the coding backend this agent will use.</p>
        </div>
        <div class="claw-form-dialog__control agent-dialog__input-shell agent-dialog__input-shell--select">
          <el-select
            id="agent-dialog-backend"
            v-model="backend"
            class="agent-dialog__backend-select"
            :disabled="!canEdit"
            :teleported="false"
            popper-class="agent-dialog__backend-popper"
          >
            <template #prefix>
              <component
                :is="selectedBackendOption.icon"
                class="agent-dialog__backend-selected-icon"
                :class="selectedBackendOption.iconClass"
                aria-hidden="true"
              />
            </template>

            <el-option
              v-for="option in backendOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            >
              <span class="agent-dialog__backend-option">
                <span
                  class="agent-dialog__backend-icon-frame"
                  :class="option.iconClass"
                >
                  <component
                    :is="option.icon"
                    class="agent-dialog__backend-option-icon"
                    aria-hidden="true"
                  />
                </span>
                <span class="agent-dialog__backend-copy">
                  <span class="agent-dialog__backend-name">{{ option.label }}</span>
                  <!-- <span class="agent-dialog__backend-provider">{{ option.provider }}</span> -->
                </span>
              </span>
            </el-option>
          </el-select>
        </div>
      </section>

      <section class="claw-form-dialog__field agent-dialog__field">
        <div class="claw-form-dialog__field-heading agent-dialog__field-heading">
          <span class="claw-form-dialog__label agent-dialog__label">Workspace folder</span>
          <span class="claw-form-dialog__heading-separator agent-dialog__heading-separator">•</span>
          <p class="claw-form-dialog__help agent-dialog__help">Select the repository or project directory.</p>
        </div>
        <button
          class="claw-form-dialog__control claw-form-dialog__button-control agent-dialog__folder-control"
          type="button"
          :disabled="!canEdit || choosingFolder"
          @click="chooseFolder"
        >
          <span
            class="agent-dialog__repository-value"
            :class="{ 'agent-dialog__repository-value--empty': !folder }"
          >
            <span>{{ folderLabel }}</span>
            <ChevronDown aria-hidden="true" />
          </span>
        </button>
      </section>

      <el-alert
        v-if="!canEdit"
        title="Agent must be idle before editing."
        type="warning"
        :closable="false"
        show-icon
      />

      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
      />
    </el-form>

    <template #footer>
      <div class="claw-dialog__footer">
        <el-button @click="close">Cancel</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!canSave"
          @click="submit"
        >
          {{ submitLabel }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Component } from 'vue';
import type { Agent, AgentBackend, CreateAgentInput, UpdateAgentInput } from '../../shared/contracts';
import { ClaudeCodeBackendIcon, CodexBackendIcon } from '../shared/icons/backend-icons';
import { ChevronDown } from '../shared/icons/app-icons';
import AgentAvatarPicker from './AgentAvatarPicker.vue';

const props = defineProps<{
  agent: Agent | null;
  chooseAgentFolder: () => Promise<string | null>;
  createAgent: (input: CreateAgentInput) => Promise<void>;
  mode: 'create' | 'edit';
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const name = ref('');
const folder = ref('');
const avatar = ref<string | undefined>(undefined);
const backend = ref<AgentBackend>('codex');
const errorMessage = ref<string | null>(null);
const choosingFolder = ref(false);
const submitting = ref(false);

type BackendOption = {
  icon: Component;
  iconClass: string;
  label: string;
  provider: string;
  value: AgentBackend;
};

const backendOptions: BackendOption[] = [
  {
    icon: CodexBackendIcon,
    iconClass: 'agent-dialog__backend-icon--codex',
    label: 'Codex',
    provider: 'OpenAI',
    value: 'codex',
  },
  {
    icon: ClaudeCodeBackendIcon,
    iconClass: 'agent-dialog__backend-icon--claude',
    label: 'Claude Code',
    provider: 'Anthropic',
    value: 'claude',
  },
];

const isEditing = computed(() => props.mode === 'edit');
const canEdit = computed(() => !isEditing.value || props.agent?.status.type === 'idle');
const folderName = computed(() => folder.value.split(/[\\/]/).filter(Boolean).at(-1) ?? '');
const title = computed(() => isEditing.value ? 'Edit Agent' : 'Create Agent');
const subtitle = computed(() => isEditing.value ? 'Update agent settings' : 'Add a teammate to your Codex Claw team');
const submitLabel = computed(() => isEditing.value ? 'Save' : 'Add Agent');
const folderLabel = computed(() => folder.value ? shortenFolder(folder.value) : 'Select folder');
const selectedBackendOption = computed(() => (
  backendOptions.find((option) => option.value === backend.value) ?? backendOptions[0]
));
const canSave = computed(() => (
  canEdit.value &&
  !submitting.value &&
  name.value.trim().length > 0 &&
  folder.value.trim().length > 0
));

watch(() => [props.visible, props.mode, props.agent?.id] as const, () => {
  if (props.visible) {
    resetForm();
  }
}, { immediate: true });

async function chooseFolder(): Promise<void> {
  errorMessage.value = null;
  choosingFolder.value = true;
  try {
    const selectedFolder = await props.chooseAgentFolder();
    if (!selectedFolder) {
      return;
    }

    folder.value = selectedFolder;
    if (!name.value.trim()) {
      name.value = selectedFolder.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    choosingFolder.value = false;
  }
}

async function submit(): Promise<void> {
  if (!canSave.value) {
    return;
  }

  submitting.value = true;
  errorMessage.value = null;
  try {
    if (isEditing.value) {
      if (!props.agent) {
        throw new Error('No agent selected for editing.');
      }

      await props.updateAgent({
        id: props.agent.id,
        name: name.value,
        folder: folder.value,
        avatar: avatar.value,
        backend: backend.value,
      });
    } else {
      await props.createAgent({
        name: name.value,
        folder: folder.value,
        avatar: avatar.value,
        backend: backend.value,
      });
    }
    close();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    submitting.value = false;
  }
}

function onVisibilityChanged(nextVisible: boolean): void {
  if (!nextVisible) {
    close();
  }
}

function close(): void {
  errorMessage.value = null;
  emit('close');
}

function resetForm(): void {
  errorMessage.value = null;
  submitting.value = false;
  choosingFolder.value = false;
  if (isEditing.value && props.agent) {
    name.value = props.agent.name;
    folder.value = props.agent.folder;
    avatar.value = props.agent.avatar;
    backend.value = props.agent.backend;
    return;
  }

  name.value = '';
  folder.value = '';
  avatar.value = '🤖';
  backend.value = 'codex';
}

function shortenFolder(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return value;
  }

  return `…/${parts.slice(-2).join('/')}`;
}
</script>

<style scoped>
.agent-dialog__repository-value--empty {
  color: var(--color-text-muted);
}

.agent-dialog__identity-control {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-6);
}

.agent-dialog__identity-control:focus-within {
  /* border-color: var(--color-primary); */
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker) {
  justify-self: start;
  justify-content: flex-start;
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker__trigger) {
  width: var(--space-20);
  height: var(--space-20);
  border-radius: 0;
  background: transparent;
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker__trigger .agent-avatar-picker__preview) {
  --agent-avatar-size: var(--space-20);
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker__hint) {
  display: none;
}

.agent-dialog__backend-select {
  width: 100%;
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
}

.agent-dialog__input-shell--select {
  display: block;
}

.agent-dialog__backend-select :deep(.el-select__wrapper) {
  min-height: 42px;
  padding: 0 var(--space-6);
  border-radius: calc(var(--radius-lg) - 1px);
  background: transparent;
  box-shadow: none;
}

.agent-dialog__backend-select :deep(.el-select__wrapper:hover),
.agent-dialog__backend-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: none;
}

.agent-dialog__backend-select :deep(.el-select__placeholder),
.agent-dialog__backend-select :deep(.el-select__selected-item) {
  color: var(--color-text);
}

.agent-dialog__backend-selected-icon {
  width: var(--icon-md);
  height: var(--icon-md);
}

.agent-dialog__backend-option {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-width: 0;
}

.agent-dialog__backend-icon-frame {
  width: var(--space-12);
  height: var(--space-12);
}

.agent-dialog__backend-option-icon {
  width: var(--icon-md);
  height: var(--icon-md);
}

.agent-dialog__backend-icon--codex {
  color: var(--color-text);
}

.agent-dialog__backend-icon--claude {
  color: #d97757;
}

.agent-dialog__backend-copy {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.agent-dialog__backend-name,
.agent-dialog__backend-provider {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-dialog__backend-provider {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-16);
}

.agent-dialog :deep(.agent-dialog__backend-popper .el-select-dropdown__item) {
  height: auto;
  padding: var(--space-4) var(--space-6);
  line-height: var(--line-height-20);
}

.agent-dialog :deep(.agent-dialog__backend-popper),
.agent-dialog :deep(.agent-dialog__backend-popper .el-select-dropdown) {
  background: var(--color-surface-lowest);
}

.agent-dialog :deep(.agent-dialog__backend-popper .el-popper__arrow::before) {
  background: var(--color-surface-lowest);
}

.agent-dialog :deep(.agent-dialog__backend-popper .el-select-dropdown__item.is-selected .agent-dialog__backend-icon-frame) {
  border-color: var(--color-primary);
  background: var(--color-surface);
}

.agent-dialog__repository-value {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  width: 100%;
  color: var(--color-text);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.agent-dialog__repository-value span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-dialog__repository-value svg {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
}

</style>

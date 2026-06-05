<template>
  <el-dialog
    class="claw-dialog agent-dialog"
    :model-value="visible"
    :teleported="false"
    width="480px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-dialog__header--centered">
        <h2 class="claw-dialog__title">{{ title }}</h2>
        <p class="claw-dialog__subtitle">{{ subtitle }}</p>
      </div>
    </template>

    <form
      class="agent-dialog__form"
      @submit.prevent="submit"
    >
      <section class="agent-dialog__section">
        <label class="agent-dialog__row">
          <span class="agent-dialog__label">Name</span>
          <input
            v-model="name"
            class="agent-dialog__text-input"
            type="text"
            placeholder="Agent name"
            :disabled="!canEdit"
          />
        </label>

        <div class="agent-dialog__divider" />

        <div class="agent-dialog__row">
          <span class="agent-dialog__label">Avatar</span>
          <AgentAvatarPicker
            v-model="avatar"
            :name="name || folderName || 'Agent'"
          />
        </div>
      </section>

      <section class="agent-dialog__section">
        <button
          class="agent-dialog__row agent-dialog__row--button"
          type="button"
          :disabled="!canEdit || choosingFolder"
          @click="chooseFolder"
        >
          <span class="agent-dialog__label">Folder</span>
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
    </form>

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
import type { Agent, CreateAgentInput, UpdateAgentInput } from '../../shared/contracts';
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
const errorMessage = ref<string | null>(null);
const choosingFolder = ref(false);
const submitting = ref(false);

const isEditing = computed(() => props.mode === 'edit');
const canEdit = computed(() => !isEditing.value || props.agent?.status.type === 'idle');
const folderName = computed(() => folder.value.split(/[\\/]/).filter(Boolean).at(-1) ?? '');
const title = computed(() => isEditing.value ? 'Edit Agent' : 'New Agent');
const subtitle = computed(() => isEditing.value ? 'Update Codex agent settings' : 'Add a Codex agent to Skwad');
const submitLabel = computed(() => isEditing.value ? 'Save' : 'Add Agent');
const folderLabel = computed(() => folder.value ? shortenFolder(folder.value) : 'Select folder');
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
      });
    } else {
      await props.createAgent({
        name: name.value,
        folder: folder.value,
        avatar: avatar.value,
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
    return;
  }

  name.value = '';
  folder.value = '';
  avatar.value = undefined;
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
.agent-dialog__form {
  display: grid;
  gap: var(--space-8);
}

.agent-dialog__section {
  display: grid;
  padding: 0 var(--space-6);
  border-radius: var(--radius-xl);
  background: var(--color-surface-low);
}

.agent-dialog__row {
  min-height: 56px;
  display: grid;
  grid-template-columns: 128px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-8);
  width: 100%;
  padding: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.agent-dialog__row--button {
  cursor: pointer;
}

.agent-dialog__row--button:disabled {
  cursor: default;
}

.agent-dialog__label {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.agent-dialog__divider {
  height: 1px;
  background: var(--color-border);
}

.agent-dialog__text-input {
  min-width: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
  text-align: right;
  outline: none;
}

.agent-dialog__text-input::placeholder,
.agent-dialog__repository-value--empty {
  color: var(--color-text-muted);
}

.agent-dialog__repository-value {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
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

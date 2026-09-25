<template>
  <FormDialog
    class="new-project-dialog"
    :model-value="visible"
    :title="t('newProjectDialog.title')"
    @update:model-value="onVisibilityChanged"
  >
    <form class="claw-form-dialog" @submit.prevent="submit">
      <p class="new-project-dialog__description">{{ t('newProjectDialog.description') }}</p>
      <FormDialogField :label="t('newProjectDialog.name')" label-for="new-project-name">
        <div class="claw-form-dialog__control claw-form-dialog__input-control">
          <input
            id="new-project-name"
            ref="nameInput"
            v-model="name"
            class="claw-form-dialog__text-input"
            type="text"
            :placeholder="t('newProjectDialog.namePlaceholder')"
            autocomplete="off"
          >
        </div>
      </FormDialogField>
      <el-alert
        v-if="validationError || error"
        :title="validationError ?? error ?? ''"
        type="error"
        :closable="false"
        show-icon
      />
    </form>

    <template #footer-left>
      <BackendSelector v-model="backend" :disabled="busy" />
    </template>
    <template #footer>
      <button class="claw-button claw-button--tertiary" type="button" :disabled="busy" @click="close">
        {{ t('newProjectDialog.cancel') }}
      </button>
      <button
        class="claw-button claw-button--primary"
        type="button"
        :aria-busy="busy"
        :disabled="busy || !name.trim()"
        @click="submit"
      >
        {{ t('newProjectDialog.create') }}
      </button>
    </template>
  </FormDialog>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FormDialog from '../shared/dialog/FormDialog.vue';
import FormDialogField from '../shared/dialog/FormDialogField.vue';
import BackendSelector from './BackendSelector.vue';
import type { AgentBackend } from '@codex-claw/core/contracts';

const props = withDefaults(defineProps<{
  busy?: boolean;
  error?: string | null;
  visible: boolean;
}>(), {
  busy: false,
  error: null,
});

const emit = defineEmits<{
  close: [];
  create: [name: string, backend: AgentBackend];
}>();

const { t } = useI18n();
const name = ref('');
const backend = ref<AgentBackend>('codex');
const nameInput = ref<HTMLInputElement | null>(null);
const validationError = ref<string | null>(null);

watch(() => props.visible, async (visible) => {
  if (!visible) return;
  name.value = '';
  validationError.value = null;
  await nextTick();
  nameInput.value?.focus();
});

function close(): void {
  if (!props.busy) emit('close');
}

function onVisibilityChanged(visible: boolean): void {
  if (!visible) close();
}

function submit(): void {
  const projectName = name.value.trim();
  if (!projectName) return;
  if (projectName === '.' || projectName === '..' || /[/\\]/u.test(projectName)) {
    validationError.value = t('newProjectDialog.invalidName');
    return;
  }
  validationError.value = null;
  emit('create', projectName, backend.value);
}
</script>

<style scoped>
.new-project-dialog__description {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: 1.5;
}
</style>

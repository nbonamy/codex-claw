<template>
  <el-dialog
    class="claw-dialog work-routing-dialog"
    :model-value="visible"
    :teleported="false"
    width="660px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-dialog__header">
        <div class="claw-form-dialog__header">
          <h2 class="claw-dialog__title">How should this work continue?</h2>
          <p class="claw-dialog__subtitle">Choose where this conversation should do the implementation.</p>
        </div>
        <button class="claw-dialog__icon-button" type="button" aria-label="Cancel" :disabled="busy" @click="emit('cancel')">
          <IconX aria-hidden="true" />
        </button>
      </div>
    </template>

    <p class="work-routing-dialog__task">{{ request?.payload.request.task }}</p>

    <div class="work-routing-dialog__choices">
      <button
        type="button"
        class="work-routing-dialog__choice"
        data-mode="current"
        :class="{ 'is-selected': mode === 'current' }"
        :disabled="busy"
        @click="mode = 'current'"
      >
        <IconPlayerPlay aria-hidden="true" />
        <span><strong>Continue here</strong><small>Keep this checkout and branch</small></span>
      </button>
      <button
        type="button"
        class="work-routing-dialog__choice"
        data-mode="branch"
        :class="{ 'is-selected': mode === 'branch' }"
        :disabled="busy || branchUnavailable"
        @click="mode = 'branch'"
      >
        <IconGitBranch aria-hidden="true" />
        <span><strong>Continue on a branch</strong><small>Switch this checkout and continue here</small></span>
      </button>
      <button
        type="button"
        class="work-routing-dialog__choice"
        data-mode="delegate"
        :class="{ 'is-selected': mode === 'delegate' }"
        :disabled="busy"
        @click="mode = 'delegate'"
      >
        <IconCopy aria-hidden="true" />
        <span><strong>Delegate in a worktree</strong><small>Create an isolated conversation and folder</small></span>
      </button>
    </div>

    <p v-if="branchUnavailable" class="work-routing-dialog__warning">
      This folder is also used by {{ sharedAgentNames }}. Delegate to a worktree to avoid moving their checkout.
    </p>

    <label v-if="mode !== 'current'" class="work-routing-dialog__branch-field">
      <span>Branch</span>
      <span class="work-routing-dialog__branch-control">
        <IconGitBranch aria-hidden="true" />
        <input
          v-model="branchName"
          class="work-routing-dialog__branch"
          :disabled="busy"
          autocomplete="off"
          spellcheck="false"
        >
      </span>
    </label>

    <p v-if="error" class="work-routing-dialog__error" role="alert">{{ error }}</p>

    <template #footer>
      <div class="claw-dialog__footer">
        <button class="claw-button claw-button--tertiary" type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button class="claw-button claw-button--primary" type="button" :disabled="busy || !canSubmit" :aria-busy="busy" @click="submit">
          Continue
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IconCopy, IconGitBranch, IconPlayerPlay, IconX } from '@tabler/icons-vue';
import type { WorkRoutingMode, WorkRoutingRequest } from '@codex-claw/core/contracts';

const props = withDefaults(defineProps<{
  busy?: boolean;
  error?: string | null;
  request?: WorkRoutingRequest | null;
  visible: boolean;
}>(), {
  busy: false,
  error: null,
  request: null,
});

const emit = defineEmits<{
  cancel: [];
  respond: [mode: WorkRoutingMode, branchName?: string];
}>();

const mode = ref<WorkRoutingMode>('delegate');
const branchName = ref('');
const branchUnavailable = computed(() => (props.request?.payload.request.sharedFolderAgentNames.length ?? 0) > 0);
const sharedAgentNames = computed(() => props.request?.payload.request.sharedFolderAgentNames.join(', ') ?? 'another agent');
const canSubmit = computed(() => mode.value === 'current' || branchName.value.trim().length > 0);

watch(() => props.request?.id, () => {
  mode.value = 'delegate';
  branchName.value = props.request?.payload.request.suggestedBranchName ?? '';
}, { immediate: true });

function submit(): void {
  if (!canSubmit.value) return;
  emit('respond', mode.value, mode.value === 'current' ? undefined : branchName.value.trim());
}

function onVisibilityChanged(visible: boolean): void {
  if (!visible && !props.busy) emit('cancel');
}
</script>

<style scoped>
.work-routing-dialog__task {
  margin: 0 0 var(--space-6);
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  line-height: var(--line-height-22);
}

.work-routing-dialog__choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.work-routing-dialog__choice {
  display: grid;
  gap: var(--space-3);
  justify-items: start;
  min-width: 0;
  min-height: 126px;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: var(--color-surface);
  text-align: left;
  cursor: pointer;
}

.work-routing-dialog__choice:hover:not(:disabled) {
  border-color: var(--color-border-strong);
  background: var(--color-surface-low);
}

.work-routing-dialog__choice.is-selected {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.work-routing-dialog__choice:disabled {
  opacity: 0.45;
  cursor: default;
}

.work-routing-dialog__choice > svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.work-routing-dialog__choice span {
  display: grid;
  gap: var(--space-2);
}

.work-routing-dialog__choice strong {
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.work-routing-dialog__choice small {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.work-routing-dialog__warning,
.work-routing-dialog__error {
  margin: var(--space-4) 0 0;
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.work-routing-dialog__warning {
  color: var(--color-warning);
}

.work-routing-dialog__error {
  color: var(--color-error);
}

.work-routing-dialog__branch-field {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
}

.work-routing-dialog__branch-control {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--space-16);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
}

.work-routing-dialog__branch-control svg {
  width: var(--icon-md);
  height: var(--icon-md);
  flex: 0 0 auto;
}

.work-routing-dialog__branch {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-family: var(--font-family-mono);
  font-weight: var(--font-weight-regular);
}
</style>

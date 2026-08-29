<template>
  <el-dialog
    class="claw-dialog agent-close-dialog"
    :model-value="visible"
    :teleported="false"
    width="520px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-form-dialog__header agent-close-dialog__header">
        <h2 class="claw-dialog__title">{{ $t('surface.agentCloseDialog.close') }} {{ agent?.name }}?</h2>
      </div>
    </template>

    <div class="agent-close-dialog__body">
      <p> {{ $t('surface.agentCloseDialog.thisAgentIsUsingTheLinkedWorktree') }} <strong>{{ workflow?.branch }}</strong>.
      </p>
      <p> {{ $t('surface.agentCloseDialog.deletingTheWorktreeAlsoDeletesItsLocalBranchKeepingItLea') }} </p>
      <label v-if="workflow?.upstream" class="agent-close-dialog__remote">
        <el-switch v-model="deleteRemoteBranch" size="small" :disabled="busy" />
        <span>{{ $t('surface.agentCloseDialog.alsoDelete') }} {{ workflow.upstream }}</span>
      </label>
      <p v-if="error" class="agent-close-dialog__error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <div class="claw-dialog__footer">
        <button class="claw-button claw-button--tertiary" type="button" :disabled="busy" @click="emit('close')"> {{ $t('surface.agentCloseDialog.cancel') }} </button>
        <button class="claw-button claw-button--secondary" type="button" :disabled="busy" @click="emit('keep-worktree')"> {{ $t('surface.agentCloseDialog.keepWorktree') }} </button>
        <button class="claw-button claw-button--primary" type="button" :aria-busy="busy" :disabled="busy" @click="deleteWorktree"> {{ $t('surface.agentCloseDialog.deleteWorktree') }} </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Agent, AgentGitWorkflow } from '@codex-claw/core/contracts';

const props = withDefaults(defineProps<{
  agent?: Agent | null;
  busy?: boolean;
  error?: string | null;
  visible: boolean;
  workflow?: AgentGitWorkflow | null;
}>(), {
  agent: null,
  busy: false,
  error: null,
  workflow: null,
});

const emit = defineEmits<{
  close: [];
  'delete-worktree': [deleteRemoteBranch: boolean];
  'keep-worktree': [];
}>();

const deleteRemoteBranch = ref(false);

watch(() => props.visible, (visible) => {
  if (visible) deleteRemoteBranch.value = false;
});

function deleteWorktree(): void {
  emit('delete-worktree', deleteRemoteBranch.value);
}

function onVisibilityChanged(visible: boolean): void {
  if (!visible && !props.busy) emit('close');
}
</script>

<style scoped>
.agent-close-dialog__body {
  display: grid;
  gap: var(--space-6);
  padding-bottom: var(--space-4);
}

.agent-close-dialog__body p {
  margin: 0;
  color: var(--color-text-muted);
}

.agent-close-dialog__body strong {
  color: var(--color-text);
}

.agent-close-dialog__remote {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 34px;
  color: var(--color-text);
}

.agent-close-dialog__error {
  color: var(--color-error) !important;
}
</style>

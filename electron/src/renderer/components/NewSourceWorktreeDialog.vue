<template>
  <el-dialog
    class="claw-dialog new-source-worktree-dialog"
    :model-value="visible"
    :teleported="false"
    width="520px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-form-dialog__header">
        <h2 class="claw-dialog__title">New Worktree</h2>
      </div>
    </template>

    <form
      class="claw-form-dialog new-source-worktree-dialog__form"
      @submit.prevent="create"
    >
      <section class="claw-form-dialog__field">
        <div class="claw-form-dialog__field-heading">
          <label
            class="claw-form-dialog__label"
            for="new-source-worktree-branch"
          >
            Branch
          </label>
        </div>
        <div class="claw-form-dialog__control claw-form-dialog__input-control">
          <input
            id="new-source-worktree-branch"
            v-model="branchName"
            class="claw-form-dialog__text-input new-source-worktree-dialog__branch-input"
            type="text"
            placeholder="feature/source-folder"
          />
        </div>
      </section>

      <section class="claw-form-dialog__field">
        <div class="claw-form-dialog__field-heading">
          <label
            class="claw-form-dialog__label"
            for="new-source-worktree-folder"
          >
            Folder
          </label>
        </div>
        <div class="claw-form-dialog__control claw-form-dialog__input-control new-source-worktree-dialog__folder-control">
          <input
            id="new-source-worktree-folder"
            class="claw-form-dialog__text-input new-source-worktree-dialog__folder-input"
            type="text"
            readonly
            :value="destinationPath"
            placeholder="Enter a branch name"
          />
          <button
            class="new-source-worktree-dialog__folder-picker"
            type="button"
            aria-label="Choose worktree folder"
            title="Choose worktree folder"
            :disabled="!repo"
            @click="chooseDestination"
          >
            <FolderIcon aria-hidden="true" />
          </button>
        </div>
      </section>

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
          :loading="creating"
          :disabled="!canCreate"
          @click="create"
        >
          Create
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CreateSourceWorktreeInput, SourceRepository, SourceWorktree } from '@codex-claw/core/contracts';
import { FolderIcon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  chooseDestination: (defaultPath: string) => Promise<string | null>;
  createWorktree: (input: CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  repo: SourceRepository | null;
  suggestDestination: (input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>) => Promise<string>;
  visible: boolean;
}>(), {
  repo: null,
});

const emit = defineEmits<{
  close: [];
  created: [worktree: SourceWorktree];
}>();

const branchName = ref('');
const customDestinationPath = ref('');
const suggestedDestinationPath = ref('');
const creating = ref(false);
const errorMessage = ref<string | null>(null);
let suggestionRequestId = 0;

const canCreate = computed(() => Boolean(props.repo && branchName.value.trim() && !creating.value));
const destinationPath = computed(() => customDestinationPath.value || suggestedDestinationPath.value);

watch(() => props.visible, (visible) => {
  if (visible) {
    branchName.value = '';
    customDestinationPath.value = '';
    suggestedDestinationPath.value = '';
    errorMessage.value = null;
    creating.value = false;
  }
});

watch([
  () => props.repo?.path ?? '',
  branchName,
], () => {
  void refreshSuggestedDestinationPath();
}, { immediate: true });

async function chooseDestination(): Promise<void> {
  if (!props.repo) {
    return;
  }

  const defaultPath = destinationPath.value || await props.suggestDestination({
    repoPath: props.repo.path,
    branchName: branchName.value,
  });
  const selected = await props.chooseDestination(defaultPath);
  if (selected) {
    customDestinationPath.value = selected;
  }
}

async function create(): Promise<void> {
  if (!props.repo || !canCreate.value) {
    return;
  }

  creating.value = true;
  errorMessage.value = null;
  try {
    const worktree = await props.createWorktree({
      repoPath: props.repo.path,
      branchName: branchName.value,
      ...(customDestinationPath.value ? { destinationPath: customDestinationPath.value } : {}),
    });
    emit('created', worktree);
    close();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    creating.value = false;
  }
}

function onVisibilityChanged(visible: boolean): void {
  if (!visible) {
    close();
  }
}

function close(): void {
  emit('close');
}

async function refreshSuggestedDestinationPath(): Promise<void> {
  const repo = props.repo;
  const requestId = ++suggestionRequestId;
  if (!repo || !branchName.value.trim()) {
    suggestedDestinationPath.value = '';
    return;
  }

  try {
    const suggestedPath = await props.suggestDestination({
      repoPath: repo.path,
      branchName: branchName.value,
    });
    if (requestId === suggestionRequestId) {
      suggestedDestinationPath.value = suggestedPath;
    }
  } catch {
    if (requestId === suggestionRequestId) {
      suggestedDestinationPath.value = '';
    }
  }
}
</script>

<style scoped>
.new-source-worktree-dialog__form {
  gap: var(--space-16);
}

.new-source-worktree-dialog__folder-control {
  display: flex;
  align-items: center;
  padding-right: var(--space-2);
}

.new-source-worktree-dialog__folder-input {
  min-width: 0;
  color: var(--color-text-muted);
}

.new-source-worktree-dialog__folder-picker {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-16);
  height: var(--space-16);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.new-source-worktree-dialog__folder-picker:hover:not(:disabled),
.new-source-worktree-dialog__folder-picker:focus-visible {
  color: var(--color-text);
  background: var(--color-surface);
}

.new-source-worktree-dialog__folder-picker:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.new-source-worktree-dialog__folder-picker svg {
  width: var(--icon-md);
  height: var(--icon-md);
}
</style>

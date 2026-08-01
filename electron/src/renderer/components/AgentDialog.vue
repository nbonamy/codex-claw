<template>
  <el-dialog
    class="claw-dialog agent-dialog"
    :model-value="visible"
    :teleported="false"
    width="560px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-form-dialog__header agent-dialog__header">
        <h2 class="claw-dialog__title">{{ title }}</h2>
      </div>
    </template>

    <el-form
      class="claw-form-dialog agent-dialog__form"
      @submit.prevent="submit"
    >
      <section
        v-if="isEditing"
        class="claw-form-dialog__field agent-dialog__field"
      >
        <div class="agent-dialog__section-heading">
          <span class="claw-form-dialog__label agent-dialog__label">Workspace folder</span>
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

      <section
        v-else
        class="agent-dialog__workspace-group"
      >
        <div class="agent-dialog__workspace-rows">
          <div class="agent-dialog__workspace-row">
            <div class="agent-dialog__row-copy">
              <label
                class="agent-dialog__row-label"
                for="agent-dialog-repository"
              >Repository</label>
            </div>
            <div class="agent-dialog__row-control">
              <el-select
                id="agent-dialog-repository"
                v-model="repositoryControlValue"
                class="agent-dialog__workspace-select"
                @update:model-value="selectRepositoryControl"
              >
                <el-option
                  class="agent-dialog__source-custom-option"
                  :label="customFolderOptionLabel"
                  :value="customFolderOptionValue"
                />
                <el-option
                  v-for="repository in sourceRepositories"
                  :key="repository.path"
                  :label="repository.name"
                  :value="repository.path"
                />
              </el-select>
            </div>
          </div>

          <div
            v-if="showSourceWorktreeControl"
            class="agent-dialog__workspace-row"
          >
            <div class="agent-dialog__row-copy">
              <label
                class="agent-dialog__row-label"
                for="agent-dialog-worktree"
              >Work in...</label>
            </div>
            <div class="agent-dialog__row-control">
              <el-select
                id="agent-dialog-worktree"
                v-model="selectedSourceWorktreePath"
                class="agent-dialog__workspace-select"
                @update:model-value="selectWorktreeControl"
              >
                <el-option
                  v-for="worktree in selectedSourceWorktrees"
                  :key="worktree.path"
                  :label="worktree.name"
                  :value="worktree.path"
                />
                <el-option
                  class="agent-dialog__source-custom-option"
                  label="New Worktree..."
                  :value="newWorktreeOptionValue"
                />
              </el-select>
            </div>
          </div>

          <div
            v-if="showTeamSelector"
            class="agent-dialog__workspace-row"
          >
            <div class="agent-dialog__row-copy">
              <label
                class="agent-dialog__row-label"
                for="agent-dialog-team"
              >Team</label>
            </div>
            <div class="agent-dialog__row-control agent-dialog__row-control--stacked">
              <el-select
                id="agent-dialog-team"
                v-model="teamSelection"
                class="agent-dialog__workspace-select"
              >
                <el-option
                  v-for="team in teams"
                  :key="team.id"
                  :label="team.name"
                  :value="team.id"
                />
                <el-option
                  label="New team"
                  :value="newTeamOptionId"
                />
              </el-select>
              <input
                v-if="teamSelection === newTeamOptionId"
                id="agent-dialog-new-team"
                v-model="newTeamName"
                class="claw-form-dialog__text-input agent-dialog__new-team-input"
                type="text"
                aria-label="New team name"
                placeholder="Enter team name"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="agent-dialog__identity-group">
        <div class="agent-dialog__identity-rows">
          <div class="agent-dialog__workspace-row agent-dialog__identity-row">
            <div class="agent-dialog__row-copy">
              <label
                class="agent-dialog__row-label"
                for="agent-dialog-name"
              >Name</label>
            </div>
            <div class="agent-dialog__row-control agent-dialog__identity-control">
              <AgentAvatarPicker
                v-model="avatar"
                :name="name || folderName || 'Agent'"
                class="agent-dialog__identity-avatar"
              />
              <div class="agent-dialog__identity-input">
                <input
                  id="agent-dialog-name"
                  v-model="name"
                  class="claw-form-dialog__text-input agent-dialog__text-input"
                  type="text"
                  aria-label="Agent name"
                  placeholder="Name this agent"
                  :disabled="!canEdit"
                />
              </div>
            </div>
          </div>
        </div>
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

    <NewSourceWorktreeDialog
      :choose-destination="chooseSourceWorktreeDestination"
      :create-worktree="createSourceWorktree"
      :repo="selectedSourceRepository"
      :suggest-destination="suggestSourceWorktreePath"
      :visible="newSourceWorktreeDialogVisible"
      @close="newSourceWorktreeDialogVisible = false"
      @created="selectCreatedSourceWorktree"
    />

    <RemoteFolderPickerDialog
      :initial-path="folder"
      :list-source-folders="listRemoteFolders"
      :remote-connection-id="selectedRemoteConnectionId"
      :visible="remoteFolderDialogVisible"
      @close="remoteFolderDialogVisible = false"
      @select="selectRemoteFolder"
    />

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
import type { Agent, AgentBackend, CreateAgentInput, CreateSourceWorktreeInput, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, Team, UpdateAgentInput } from '@codex-claw/shared/contracts';
import { ChevronDown } from '../shared/icons/app-icons';
import AgentAvatarPicker from './AgentAvatarPicker.vue';
import NewSourceWorktreeDialog from './NewSourceWorktreeDialog.vue';
import RemoteFolderPickerDialog from './RemoteFolderPickerDialog.vue';

export type AgentDialogCreateInput = CreateAgentInput & {
  newTeamName?: string;
  teamId?: string;
};

const props = withDefaults(defineProps<{
  agent: Agent | null;
  chooseAgentFolder: () => Promise<string | null>;
  listSourceFolders?: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSourceRepositories?: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  listSourceWorktrees?: (repoPath: string, remoteConnectionId?: string) => Promise<SourceWorktree[]>;
  suggestSourceWorktreePath?: (input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>) => Promise<string>;
  chooseSourceWorktreeDestination?: (defaultPath: string) => Promise<string | null>;
  createAgent: (input: AgentDialogCreateInput) => Promise<Agent | null | void>;
  createSourceWorktree?: (input: CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  initialNewTeamName?: string;
  initialTeamId?: string | null;
  mode: 'create' | 'edit';
  remoteConnectionId?: string;
  showTeamField?: boolean;
  sourceFolderPath?: string;
  sourceRecentRepoNames?: string[];
  sourceRepositories?: SourceRepository[];
  teams?: Team[];
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
  visible: boolean;
}>(), {
  initialNewTeamName: '',
  initialTeamId: null,
  remoteConnectionId: '',
  showTeamField: false,
  sourceFolderPath: '',
  sourceRecentRepoNames: () => [],
  sourceRepositories: () => [],
  teams: () => [],
});

const emit = defineEmits<{
  close: [];
}>();

const name = ref('');
const folder = ref('');
const avatar = ref<string | undefined>(undefined);
const backend = ref<AgentBackend>('codex');
const teamSelection = ref('');
const newTeamName = ref('');
const errorMessage = ref<string | null>(null);
const choosingFolder = ref(false);
const submitting = ref(false);
const newTeamOptionId = '__new_team__';
const customFolderOptionValue = '__custom_folder__';
const newWorktreeOptionValue = '__new_worktree__';
const selectedSourceRepositoryPath = ref('');
const selectedSourceWorktreePath = ref('');
const repositoryControlValue = ref(customFolderOptionValue);
const createdSourceWorktree = ref<SourceWorktree | null>(null);
const listedSourceWorktrees = ref<SourceWorktree[]>([]);
const listedSourceWorktreesRepoPath = ref('');
const newSourceWorktreeDialogVisible = ref(false);
const remoteSourceRepositories = ref<SourceRepository[]>([]);
const remoteSourceRepositoriesConnectionId = ref('');
const loadingRemoteSourceRepositories = ref(false);
const remoteFolderDialogVisible = ref(false);

const isEditing = computed(() => props.mode === 'edit');
const canEdit = computed(() => !isEditing.value || props.agent?.status.type === 'idle');
const folderName = computed(() => folder.value.split(/[\\/]/).filter(Boolean).at(-1) ?? '');
const title = computed(() => isEditing.value ? 'Edit agent' : 'New agent');
const submitLabel = computed(() => isEditing.value ? 'Save' : 'Create agent');
const folderLabel = computed(() => folder.value ? shortenFolder(folder.value) : 'Select folder');
const teams = computed(() => props.teams);
const showTeamSelector = computed(() => props.showTeamField && !isEditing.value);
const selectedTeam = computed(() => teams.value.find((team) => team.id === teamSelection.value) ?? null);
const selectedRemoteConnectionId = computed(() => {
  if (showTeamSelector.value) {
    return teamSelection.value === newTeamOptionId
      ? ''
      : selectedTeam.value?.remoteConnectionId ?? '';
  }
  return props.remoteConnectionId?.trim() ?? '';
});
const sourceRepositories = computed(() => {
  if (!selectedRemoteConnectionId.value) {
    return props.sourceRepositories ?? [];
  }
  return remoteSourceRepositoriesConnectionId.value === selectedRemoteConnectionId.value
    ? remoteSourceRepositories.value
    : [];
});
const selectedSourceRepository = computed(() => sourceRepositories.value.find((repository) => repository.path === selectedSourceRepositoryPath.value) ?? null);
const selectedSourceWorktrees = computed(() => {
  const worktrees = listedSourceWorktreesRepoPath.value === selectedSourceRepositoryPath.value
    ? listedSourceWorktrees.value
    : selectedSourceRepository.value?.worktrees ?? [];
  const created = createdSourceWorktree.value;
  if (!created || worktrees.some((worktree) => worktree.path === created.path)) {
    return worktrees;
  }
  return [...worktrees, created];
});
const showSourceWorktreeControl = computed(() => !isEditing.value && selectedSourceRepository.value !== null);
const customFolderOptionLabel = computed(() => folder.value && !selectedSourceRepository.value ? 'Custom folder' : 'Choose folder...');
const teamCanSave = computed(() => (
  !showTeamSelector.value ||
  (teamSelection.value === newTeamOptionId ? newTeamName.value.trim().length > 0 : teamSelection.value.trim().length > 0)
));
const canSave = computed(() => (
  canEdit.value &&
  !submitting.value &&
  name.value.trim().length > 0 &&
  folder.value.trim().length > 0 &&
  teamCanSave.value
));

watch(() => [props.visible, props.mode, props.agent?.id, props.initialNewTeamName, props.initialTeamId, props.teams.length] as const, () => {
  if (props.visible) {
    resetForm();
  }
}, { immediate: true });

watch(selectedRemoteConnectionId, async (connectionId, previousConnectionId) => {
  if (!props.visible || isEditing.value || connectionId === previousConnectionId) {
    return;
  }
  await resetSourceSelectionForConnection();
});

async function chooseFolder(): Promise<void> {
  if (selectedRemoteConnectionId.value) {
    await openRemoteFolderDialog();
    return;
  }

  errorMessage.value = null;
  choosingFolder.value = true;
  try {
    const selectedFolder = await props.chooseAgentFolder();
    if (!selectedFolder) {
      syncRepositoryControlValue();
      return;
    }

    selectedSourceRepositoryPath.value = '';
    selectedSourceWorktreePath.value = '';
    repositoryControlValue.value = customFolderOptionValue;
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

async function openRemoteFolderDialog(): Promise<void> {
  remoteFolderDialogVisible.value = true;
}

function listRemoteFolders(input?: SourceFolderListInput): Promise<SourceFolderListing> {
  return props.listSourceFolders?.(input) ?? Promise.resolve({ path: '', parentPath: null, entries: [] });
}

function selectRemoteFolder(path: string): void {
  const selectedFolder = path.trim();
  if (!selectedFolder) {
    return;
  }

  selectedSourceRepositoryPath.value = '';
  selectedSourceWorktreePath.value = '';
  repositoryControlValue.value = customFolderOptionValue;
  folder.value = selectedFolder;
  if (!name.value.trim()) {
    name.value = selectedFolder.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
  }
}

async function selectRepositoryControl(value: string): Promise<void> {
  if (value === customFolderOptionValue) {
    await chooseFolder();
    return;
  }

  await selectSourceRepository(value);
}

async function resetSourceSelectionForConnection(): Promise<void> {
  selectedSourceRepositoryPath.value = '';
  selectedSourceWorktreePath.value = '';
  repositoryControlValue.value = customFolderOptionValue;
  folder.value = '';
  createdSourceWorktree.value = null;
  listedSourceWorktrees.value = [];
  listedSourceWorktreesRepoPath.value = '';

  if (selectedRemoteConnectionId.value) {
    await loadRemoteSourceRepositories(selectedRemoteConnectionId.value);
  }

  const preferredRepositoryPath = preferredSourceRepositoryPath();
  if (preferredRepositoryPath) {
    await selectSourceRepository(preferredRepositoryPath);
  }
}

async function loadRemoteSourceRepositories(connectionId: string): Promise<void> {
  if (!props.listSourceRepositories) {
    remoteSourceRepositories.value = [];
    remoteSourceRepositoriesConnectionId.value = connectionId;
    return;
  }

  loadingRemoteSourceRepositories.value = true;
  errorMessage.value = null;
  try {
    remoteSourceRepositories.value = await props.listSourceRepositories(connectionId);
    remoteSourceRepositoriesConnectionId.value = connectionId;
  } catch (error) {
    remoteSourceRepositories.value = [];
    remoteSourceRepositoriesConnectionId.value = connectionId;
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loadingRemoteSourceRepositories.value = false;
  }
}

async function selectSourceRepository(repoPath: string): Promise<void> {
  selectedSourceRepositoryPath.value = repoPath;
  repositoryControlValue.value = repoPath;
  createdSourceWorktree.value = null;
  listedSourceWorktrees.value = [];
  listedSourceWorktreesRepoPath.value = '';
  const worktree = selectedSourceRepository.value?.worktrees[0];
  if (worktree) {
    selectSourceWorktree(worktree.path);
  } else {
    selectedSourceWorktreePath.value = '';
    folder.value = '';
  }
  await loadSelectedSourceWorktrees(repoPath);
}

async function loadSelectedSourceWorktrees(repoPath: string): Promise<void> {
  if (!props.listSourceWorktrees) {
    return;
  }

  try {
    const worktrees = selectedRemoteConnectionId.value
      ? await props.listSourceWorktrees(repoPath, selectedRemoteConnectionId.value)
      : await props.listSourceWorktrees(repoPath);
    if (selectedSourceRepositoryPath.value !== repoPath) {
      return;
    }
    listedSourceWorktrees.value = worktrees;
    listedSourceWorktreesRepoPath.value = repoPath;
    if (!worktrees.some((worktree) => worktree.path === selectedSourceWorktreePath.value)) {
      const firstWorktree = worktrees[0];
      if (firstWorktree) {
        selectSourceWorktree(firstWorktree.path);
      } else {
        selectedSourceWorktreePath.value = '';
        folder.value = '';
      }
    }
  } catch {
    listedSourceWorktrees.value = [];
    listedSourceWorktreesRepoPath.value = '';
  }
}

function selectWorktreeControl(value: string): void {
  if (value === newWorktreeOptionValue) {
    selectedSourceWorktreePath.value = selectedSourceWorktrees.value.find((worktree) => worktree.path === folder.value)?.path ?? '';
    openNewSourceWorktreeDialog();
    return;
  }

  selectSourceWorktree(value);
}

function selectSourceWorktree(worktreePath: string): void {
  selectedSourceWorktreePath.value = worktreePath;
  folder.value = worktreePath;
  name.value = worktreePath.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}

function openNewSourceWorktreeDialog(): void {
  newSourceWorktreeDialogVisible.value = true;
}

function suggestSourceWorktreePath(input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath'>): Promise<string> {
  return props.suggestSourceWorktreePath?.({
    ...input,
    ...(selectedRemoteConnectionId.value ? { remoteConnectionId: selectedRemoteConnectionId.value } : {}),
  }) ?? Promise.resolve('');
}

function chooseSourceWorktreeDestination(defaultPath: string): Promise<string | null> {
  return props.chooseSourceWorktreeDestination?.(defaultPath) ?? Promise.resolve(null);
}

async function createSourceWorktree(input: CreateSourceWorktreeInput): Promise<SourceWorktree> {
  if (!props.createSourceWorktree) {
    throw new Error('Source worktree creation is not available.');
  }

  return props.createSourceWorktree({
    repoPath: input.repoPath,
    branchName: input.branchName,
    destinationPath: input.destinationPath,
    ...(selectedRemoteConnectionId.value ? { remoteConnectionId: selectedRemoteConnectionId.value } : {}),
  });
}

function selectCreatedSourceWorktree(worktree: SourceWorktree): void {
  createdSourceWorktree.value = worktree;
  selectedSourceWorktreePath.value = worktree.path;
  selectSourceWorktree(worktree.path);
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
      const createInput: AgentDialogCreateInput = {
        name: name.value,
        folder: folder.value,
        avatar: avatar.value,
        backend: backend.value,
      };
      if (showTeamSelector.value) {
        if (teamSelection.value === newTeamOptionId) {
          createInput.newTeamName = newTeamName.value;
        } else {
          createInput.teamId = teamSelection.value;
        }
      }
      const repository = selectedSourceRepository.value;
      if (repository && selectedSourceWorktreePath.value) {
        createInput.sourceRepositoryName = repository.name;
      }

      await props.createAgent(createInput);
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
  teamSelection.value = initialTeamSelection();
  newTeamName.value = props.initialNewTeamName;
  selectedSourceRepositoryPath.value = '';
  selectedSourceWorktreePath.value = '';
  repositoryControlValue.value = customFolderOptionValue;
  createdSourceWorktree.value = null;
  listedSourceWorktrees.value = [];
  listedSourceWorktreesRepoPath.value = '';
  remoteSourceRepositories.value = [];
  remoteSourceRepositoriesConnectionId.value = '';
  loadingRemoteSourceRepositories.value = false;
  remoteFolderDialogVisible.value = false;
  newSourceWorktreeDialogVisible.value = false;
  void resetSourceSelectionForConnection();
}

function preferredSourceRepositoryPath(): string {
  const recent = props.sourceRecentRepoNames ?? [];
  const recentRepository = sourceRepositories.value.find((repository) => recent.includes(repository.name));
  return recentRepository?.path ?? sourceRepositories.value[0]?.path ?? '';
}

function initialTeamSelection(): string {
  if (!showTeamSelector.value) {
    return '';
  }

  if (props.initialTeamId && teams.value.some((team) => team.id === props.initialTeamId)) {
    return props.initialTeamId;
  }

  return teams.value[0]?.id ?? newTeamOptionId;
}

function shortenFolder(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return value;
  }

  return `…/${parts.slice(-2).join('/')}`;
}

function syncRepositoryControlValue(): void {
  repositoryControlValue.value = selectedSourceRepositoryPath.value || customFolderOptionValue;
}
</script>

<style scoped>
.agent-dialog__header {
  margin-left: calc(-1 * var(--space-4));
}

.agent-dialog__form {
  gap: var(--space-10);
  padding: var(--space-12) var(--space-4) 0;
}

.agent-dialog__section-heading {
  display: grid;
  gap: var(--space-1);
}

.agent-dialog__repository-value--empty {
  color: var(--color-text-muted);
}

.agent-dialog__workspace-group,
.agent-dialog__identity-group {
  display: block;
}

.agent-dialog__workspace-rows,
.agent-dialog__identity-rows {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
}

.agent-dialog__row-label {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.agent-dialog__workspace-row {
  display: grid;
  grid-template-columns: minmax(104px, 0.72fr) minmax(200px, 1.28fr);
  align-items: center;
  gap: var(--space-8);
  min-height: calc(var(--space-20) + var(--space-8));
  padding: 0 var(--space-8);
}

.agent-dialog__workspace-row + .agent-dialog__workspace-row {
  border-top: 1px solid var(--color-border);
}

.agent-dialog__row-copy {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.agent-dialog__row-control {
  min-width: 0;
}

.agent-dialog__row-control--stacked {
  display: grid;
  gap: var(--space-3);
}

.agent-dialog__workspace-select {
  width: 100%;
}

.agent-dialog__workspace-select :deep(.el-select__wrapper) {
  min-height: var(--space-20);
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  background: transparent;
  box-shadow: none;
}

.agent-dialog__workspace-select :deep(.el-select__wrapper:hover),
.agent-dialog__workspace-select :deep(.el-select__wrapper.is-focused) {
  background: var(--color-surface-low);
  box-shadow: none;
}

.agent-dialog__workspace-select :deep(.el-select__selected-item),
.agent-dialog__workspace-select :deep(.el-select__placeholder) {
  color: var(--color-text);
  font-size: var(--font-size-15);
}

.agent-dialog__new-team-input {
  min-height: var(--space-16);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-lowest);
}

.agent-dialog__identity-control {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
}

.agent-dialog__identity-input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--space-16);
  display: flex;
  align-items: center;
  border-radius: var(--radius-md);
  background: transparent;
}

.agent-dialog__identity-input:focus-within {
  background: var(--color-surface-low);
}

.agent-dialog__text-input {
  height: var(--space-16);
  padding: 0 var(--space-4);
  line-height: var(--line-height-20);
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker) {
  justify-self: start;
  justify-content: flex-start;
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker__trigger) {
  width: var(--space-16);
  height: var(--space-16);
  border-radius: var(--radius-md);
  background: var(--color-surface-low);
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker__trigger .agent-avatar-picker__preview) {
  --agent-avatar-size: var(--space-16);
}

.agent-dialog__identity-avatar :deep(.agent-avatar-picker__hint) {
  display: none;
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

.agent-dialog__source-custom-option {
  color: var(--color-text);
}

</style>

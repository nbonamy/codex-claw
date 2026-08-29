<template>
  <form class="loop-editor" @submit.prevent="submit">
    <header class="loop-editor__header">
      <div>
        <h3>{{ mode === 'edit' ? $t('surface.loopEditor.editLoop') : $t('surface.loopEditor.createLoop') }}</h3>
        <p>{{ $t('surface.loopEditor.watchWorkCreateTheRightAgentAndSendTheAssignmentAutomati') }}</p>
      </div>
      <el-switch
        v-model="form.enabled"
        :aria-label="$t('surface.loopEditor.loopEnabled')"
        active-text="On"
        inactive-text="Off"
      />
    </header>

    <div class="loop-editor__body">
      <div
        v-if="!githubConnected"
        class="loop-editor__notice"
      > {{ $t('surface.loopEditor.connectGitHubInSettingsBeforeSavingALoop') }} </div>

      <section class="loop-editor__section">
        <label for="loop-editor-name">{{ $t('surface.loopEditor.name') }}</label>
        <el-input
          id="loop-editor-name"
          v-model="form.name"
          :placeholder="$t('surface.loopEditor.loopName')"
        />
      </section>

      <section
        class="loop-editor__source-group"
        :aria-label="$t('surface.loopEditor.loopSourceFilters')"
      >
        <div class="loop-editor__source-row">
          <div class="loop-editor__section">
            <label for="loop-editor-provider">{{ $t('surface.loopEditor.provider') }}</label>
            <el-select
              id="loop-editor-provider"
              v-model="form.provider"
              disabled
              :aria-label="$t('surface.loopEditor.loopProvider')"
            >
              <el-option :label="$t('surface.loopEditor.gitHub')" value="github" />
            </el-select>
          </div>

          <div class="loop-editor__section">
            <label for="loop-editor-repository">{{ $t('surface.loopEditor.repo') }}</label>
            <el-select
              id="loop-editor-repository"
              v-model="form.repositoryId"
              filterable
              :placeholder="$t('surface.loopEditor.selectRepo')"
              :aria-label="$t('surface.loopEditor.loopRepository')"
              :disabled="!githubConnected || sortedRepositories.length === 0"
              @change="repositoryChanged"
            >
              <el-option
                v-for="repository in sortedRepositories"
                :key="repository.id"
                :label="repository.fullName"
                :value="repository.id"
              />
            </el-select>
          </div>
        </div>

        <div class="loop-editor__source-row">
          <div class="loop-editor__section">
            <label for="loop-editor-assignee">{{ $t('surface.loopEditor.assignedTo') }}</label>
            <el-select
              id="loop-editor-assignee"
              v-model="form.assigneeLogin"
              clearable
              filterable
              :placeholder="$t('surface.loopEditor.anyone')"
              :aria-label="$t('surface.loopEditor.loopAssignee')"
              :disabled="!form.repositoryId || assigneeOptions.length === 0"
            >
              <el-option
                v-for="assignee in assigneeOptions"
                :key="assignee.value"
                :label="assignee.label"
                :value="assignee.value"
              />
            </el-select>
          </div>

          <div class="loop-editor__section">
            <label for="loop-editor-tag">{{ $t('surface.loopEditor.tag') }}</label>
            <el-select
              id="loop-editor-tag"
              v-model="form.tagName"
              clearable
              filterable
              :placeholder="$t('surface.loopEditor.anyTag')"
              :aria-label="$t('surface.loopEditor.loopTag')"
              :disabled="!form.repositoryId || tagOptions.length === 0"
            >
              <el-option
                v-for="tag in tagOptions"
                :key="tag"
                :label="tag"
                :value="tag"
              />
            </el-select>
          </div>
        </div>
      </section>

      <section class="loop-editor__section">
        <label for="loop-editor-assignment-instructions">{{ $t('surface.loopEditor.assignmentInstructions') }}</label>
        <el-input
          id="loop-editor-assignment-instructions"
          v-model="form.assignmentInstructions"
          type="textarea"
          :rows="3"
          :placeholder="$t('surface.loopEditor.optionalInstructionsToIncludeWhenTheTicketIsAssigned')"
        />
      </section>

      <section class="loop-editor__section">
        <label for="loop-editor-completion-instructions">{{ $t('surface.loopEditor.beforeCompletion') }}</label>
        <el-input
          id="loop-editor-completion-instructions"
          v-model="form.beforeCompletionInstructions"
          type="textarea"
          :rows="3"
          :placeholder="$t('surface.loopEditor.optionalInstructionsToShowWhenTheAgentMarksTheTicketComp')"
        />
      </section>

      <section
        class="loop-editor__source-group"
        :aria-label="$t('surface.loopEditor.loopAgentTarget')"
      >
        <div class="loop-editor__source-row">
          <div class="loop-editor__section">
            <label for="loop-editor-agent">{{ $t('surface.loopEditor.agent') }}</label>
            <el-select
              id="loop-editor-agent"
              v-model="form.actionMode"
              filterable
              :placeholder="$t('surface.loopEditor.selectAgent')"
              :aria-label="$t('surface.loopEditor.loopAgent')"
            >
              <el-option
                :label="$t('surface.loopEditor.newAgent')"
                value="new-agent"
              />
              <el-option-group
                v-if="benchTemplates.length > 0"
                :label="$t('surface.loopEditor.bench')"
              >
                <el-option
                  v-for="template in benchTemplates"
                  :key="template.id"
                  :label="template.name"
                  :value="`bench:${template.id}`"
                >
                  <span class="loop-editor__bench-option">
                    <span>
                      <strong>{{ template.name }}</strong>
                      <small>{{ template.folder }}</small>
                    </span>
                  </span>
                </el-option>
              </el-option-group>
            </el-select>
          </div>

          <div class="loop-editor__section">
            <label for="loop-editor-team-mode">{{ $t('surface.loopEditor.team') }}</label>
            <el-select
              id="loop-editor-team-mode"
              v-model="form.teamMode"
              :aria-label="$t('surface.loopEditor.loopTeamMode')"
            >
              <el-option :label="$t('surface.loopEditor.existingTeam')" value="existing" />
              <el-option :label="$t('surface.loopEditor.dedicatedTeamPerTicket')" value="dedicated" />
            </el-select>
          </div>
        </div>

        <div
          v-if="form.teamMode === 'existing'"
          class="loop-editor__section"
        >
          <label for="loop-editor-team">{{ $t('surface.loopEditor.targetTeam') }}</label>
          <el-select
            id="loop-editor-team"
            v-model="form.teamId"
            filterable
            :placeholder="$t('surface.loopEditor.selectTeam')"
            :aria-label="$t('surface.loopEditor.loopTargetTeam')"
          >
            <el-option
              v-for="team in teams"
              :key="team.id"
              :label="team.name"
              :value="team.id"
            />
          </el-select>
        </div>

        <div
          v-if="form.actionMode === 'new-agent'"
          class="loop-editor__section"
        >
          <label for="loop-editor-source-repository">{{ $t('surface.loopEditor.repository') }}</label>
          <el-select
            id="loop-editor-source-repository"
            :model-value="form.sourceRepositoryPath"
            filterable
            :placeholder="$t('surface.loopEditor.selectRepository')"
            :aria-label="$t('surface.loopEditor.loopSourceRepository')"
            @update:model-value="selectSourceRepository"
          >
            <el-option
              v-if="selectedCustomFolderPath"
              :label="selectedCustomFolderLabel"
              :value="selectedCustomFolderPath"
            />
            <el-option
              v-for="repository in sourceRepositories"
              :key="repository.path"
              :label="repository.name"
              :value="repository.path"
            >
              <span class="loop-editor__repository-option">
                <strong>{{ repository.name }}</strong>
                <small>{{ repository.path }}</small>
              </span>
            </el-option>
            <el-option
              v-if="sourceRepositories.length > 0"
              disabled
              label=""
              :value="sourceDividerOptionValue"
            />
            <el-option
              :label="$t('surface.loopEditor.pickFolder')"
              :value="pickFolderOptionValue"
            />
          </el-select>
        </div>

        <div
          v-if="form.actionMode === 'new-agent'"
          class="loop-editor__source-row"
          :aria-label="$t('surface.loopEditor.loopAgentBackendDefaults')"
        >
          <div class="loop-editor__section">
            <label for="loop-editor-backend">{{ $t('surface.loopEditor.backend') }}</label>
            <el-select
              id="loop-editor-backend"
              v-model="form.backend"
              :aria-label="$t('surface.loopEditor.loopBackend')"
            >
              <el-option :label="$t('surface.loopEditor.codex')" value="codex" />
            </el-select>
          </div>

          <div class="loop-editor__section">
            <label for="loop-editor-model">{{ $t('surface.loopEditor.model') }}</label>
            <el-select
              v-if="backendModels.length > 0"
              id="loop-editor-model"
              v-model="form.model"
              clearable
              filterable
              :placeholder="$t('surface.loopEditor.defaultModel')"
              :aria-label="$t('surface.loopEditor.loopModel')"
            >
              <el-option
                v-for="model in backendModels"
                :key="model.id"
                :label="model.displayName"
                :value="model.model"
              />
            </el-select>
            <el-input
              v-else
              id="loop-editor-model"
              v-model="form.model"
              :placeholder="$t('surface.loopEditor.defaultModel')"
              :aria-label="$t('surface.loopEditor.loopModel')"
            />
          </div>
        </div>

        <div
          v-if="form.actionMode === 'new-agent'"
          class="loop-editor__source-row"
          :aria-label="$t('surface.loopEditor.loopThinkingDefaults')"
        >
          <div class="loop-editor__section">
            <label for="loop-editor-thinking">{{ $t('surface.loopEditor.thinking') }}</label>
            <el-select
              id="loop-editor-thinking"
              v-model="form.reasoningEffort"
              clearable
              filterable
              :placeholder="$t('surface.loopEditor.default')"
              :aria-label="$t('surface.loopEditor.loopThinking')"
              :disabled="reasoningOptions.length === 0"
            >
              <el-option
                v-for="effort in reasoningOptions"
                :key="effort.reasoningEffort"
                :label="effortLabel(effort.reasoningEffort)"
                :value="effort.reasoningEffort"
              />
            </el-select>
          </div>

        </div>
      </section>

      <section class="loop-editor__section loop-editor__section--compact">
        <el-checkbox
          v-if="form.teamMode === 'existing'"
          v-model="form.cleanupDeleteAgent"
        > {{ $t('surface.loopEditor.deleteAgentWhenWorkItemCompletes') }} </el-checkbox>
        <el-checkbox
          v-else
          v-model="form.cleanupDeleteTeam"
        > {{ $t('surface.loopEditor.deleteTeamWhenWorkItemCompletes') }} </el-checkbox>
      </section>
    </div>

    <footer class="loop-editor__footer">
      <el-button @click="emit('cancel')">{{ $t('surface.loopEditor.cancel') }}</el-button>
      <el-button
        type="primary"
        native-type="submit"
        :disabled="!canSubmit"
      > {{ $t('surface.loopEditor.saveLoop') }} </el-button>
    </footer>
  </form>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed, onMounted, reactive, watch } from 'vue';
import type { BackendDefaults, BackendModelOption, BenchTemplate, CreateLoopInput, Loop, ReasoningEffort, SourceRepository, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '@codex-claw/core/contracts';

type TeamMode = 'existing' | 'dedicated';
type ActionMode = 'new-agent' | `bench:${string}`;

const props = withDefaults(defineProps<{
  backendModels?: BackendModelOption[];
  benchTemplates: BenchTemplate[];
  chooseAgentFolder?: () => Promise<string | null>;
  connection?: WorkIntegrationConnection | null;
  itemsByRepository?: Record<string, WorkItem[]>;
  loop?: Loop | null;
  mode: 'create' | 'edit';
  repositories: WorkRepository[];
  sourceRepositories?: SourceRepository[];
  teams: Team[];
}>(), {
  backendModels: () => [],
  chooseAgentFolder: async () => null,
  connection: null,
  itemsByRepository: () => ({}),
  loop: null,
  sourceRepositories: () => [],
});

const emit = defineEmits<{
  cancel: [];
  'load-items': [repositoryId: string];
  'load-repositories': [];
  submit: [input: CreateLoopInput];
}>();

const pickFolderOptionValue = '__pick-folder__';
const sourceDividerOptionValue = '__source-divider__';

const form = reactive({
  name: props.loop?.name ?? '',
  enabled: props.loop?.enabled ?? true,
  provider: 'github' as const,
  repositoryId: props.loop?.source.repositoryId ?? props.repositories[0]?.id ?? '',
  assigneeLogin: props.loop?.source.assigneeLogin ?? '',
  tagName: props.loop?.source.tagName ?? '',
  assignmentInstructions: props.loop?.instructions.assignment ?? '',
  beforeCompletionInstructions: props.loop?.instructions.beforeCompletion ?? '',
  actionMode: initialActionMode(props.loop),
  backend: 'codex' as const,
  model: initialModel(props.loop),
  reasoningEffort: initialReasoningEffort(props.loop),
  sourceRepositoryPath: props.loop?.action.type === 'create-agent'
    ? props.loop.action.sourceRepositoryPath
    : props.sourceRepositories[0]?.path ?? '',
  teamMode: (props.loop?.action.teamTarget.mode ?? 'existing') as TeamMode,
  teamId: props.loop?.action.teamTarget.mode === 'existing'
    ? props.loop.action.teamTarget.teamId
    : props.teams[0]?.id ?? '',
  cleanupDeleteAgent: props.loop?.action.teamTarget.mode === 'existing'
    ? props.loop.action.cleanup?.deleteAgent !== false
    : true,
  cleanupDeleteTeam: props.loop?.action.teamTarget.mode === 'dedicated'
    ? props.loop.action.cleanup?.deleteTeam !== false
    : true,
});

const githubConnected = computed(() => props.connection?.provider === 'github' && props.connection.status === 'connected');
const sortedRepositories = computed(() => [...props.repositories].sort((left, right) => (
  left.fullName.localeCompare(right.fullName) || left.id.localeCompare(right.id)
)));
const sourceRepositories = computed(() => [...props.sourceRepositories].sort((left, right) => (
  left.name.localeCompare(right.name) || left.path.localeCompare(right.path)
)));
const currentItems = computed(() => form.repositoryId ? props.itemsByRepository[workItemsKey(form.provider, form.repositoryId)] ?? [] : []);
const selectedBenchTemplateId = computed(() => (
  form.actionMode.startsWith('bench:') ? form.actionMode.slice('bench:'.length) : ''
));
const selectedModel = computed(() => (
  props.backendModels.find((model) => model.model === form.model) ??
  props.backendModels.find((model) => model.id === form.model) ??
  props.backendModels.find((model) => model.isDefault) ??
  props.backendModels[0] ??
  null
));
const reasoningOptions = computed(() => selectedModel.value?.supportedReasoningEfforts ?? []);
const selectedCustomFolderPath = computed(() => {
  if (!form.sourceRepositoryPath || sourceRepositories.value.some((repository) => repository.path === form.sourceRepositoryPath)) {
    return '';
  }
  return form.sourceRepositoryPath;
});
const selectedCustomFolderLabel = computed(() => basename(selectedCustomFolderPath.value) || selectedCustomFolderPath.value);
const assigneeOptions = computed(() => {
  const assignees = new Set<string>();
  if (form.assigneeLogin) {
    assignees.add(form.assigneeLogin);
  }
  for (const item of currentItems.value) {
    for (const assignee of item.assignees ?? []) {
      if (assignee) {
        assignees.add(assignee);
      }
    }
  }

  const accountLabel = props.connection?.accountLabel?.trim();
  return [...assignees]
    .sort((left, right) => left.localeCompare(right))
    .map((assignee) => ({
      label: accountLabel && assignee === accountLabel ? translate('surface.loopEditor.me') : assignee,
      value: assignee,
    }));
});
const tagOptions = computed(() => {
  const tags = new Set<string>();
  if (form.tagName) {
    tags.add(form.tagName);
  }
  for (const item of currentItems.value) {
    for (const label of item.labels) {
      if (label.name) {
        tags.add(label.name);
      }
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
});
const suggestedBeforeCompletionInstructions = computed(() => (
  form.tagName ? `Before marking this work item complete, remove the "${form.tagName}" tag from the GitHub issue.` : ''
));
const canSubmit = computed(() => (
  githubConnected.value &&
  Boolean(form.repositoryId) &&
  (form.actionMode === 'new-agent' ? Boolean(form.sourceRepositoryPath) : Boolean(selectedBenchTemplateId.value)) &&
  (form.teamMode === 'dedicated' || Boolean(form.teamId))
));

if (!form.beforeCompletionInstructions.trim() && suggestedBeforeCompletionInstructions.value) {
  form.beforeCompletionInstructions = suggestedBeforeCompletionInstructions.value;
}

onMounted(() => {
  if (githubConnected.value && props.repositories.length === 0) {
    emit('load-repositories');
  }
  if (form.repositoryId) {
    emit('load-items', form.repositoryId);
  }
});

watch(() => props.repositories, (repositories) => {
  if (!form.repositoryId && repositories[0]) {
    form.repositoryId = repositories[0].id;
    emit('load-items', form.repositoryId);
  }
});

let lastSuggestedBeforeCompletionInstructions = suggestedBeforeCompletionInstructions.value;

watch(() => props.sourceRepositories, (repositories) => {
  if (!form.sourceRepositoryPath && repositories[0]) {
    form.sourceRepositoryPath = repositories[0].path;
  }
});

watch(() => props.benchTemplates, (templates) => {
  if (form.actionMode !== 'new-agent' && !selectedBenchTemplateId.value && templates[0]) {
    form.actionMode = `bench:${templates[0].id}`;
  }
});

watch(() => props.teams, (teams) => {
  if (!form.teamId && teams[0]) {
    form.teamId = teams[0].id;
  }
});

watch(() => form.model, () => {
  const model = selectedModel.value;
  if (!model?.supportedReasoningEfforts?.some((effort) => effort.reasoningEffort === form.reasoningEffort)) {
    form.reasoningEffort = model?.defaultReasoningEffort || model?.supportedReasoningEfforts?.[0]?.reasoningEffort || '';
  }
});

watch(suggestedBeforeCompletionInstructions, (suggestion, previousSuggestion) => {
  const currentValue = form.beforeCompletionInstructions.trim();
  const canApplySuggestion = !currentValue || currentValue === previousSuggestion || currentValue === lastSuggestedBeforeCompletionInstructions;
  lastSuggestedBeforeCompletionInstructions = suggestion;
  if (suggestion && canApplySuggestion) {
    form.beforeCompletionInstructions = suggestion;
  }
});

function repositoryChanged(): void {
  form.assigneeLogin = '';
  form.tagName = '';
  if (form.repositoryId) {
    emit('load-items', form.repositoryId);
  }
}

async function selectSourceRepository(value: string): Promise<void> {
  if (value !== pickFolderOptionValue) {
    form.sourceRepositoryPath = value;
    return;
  }

  const previousPath = form.sourceRepositoryPath;
  const selectedFolder = await props.chooseAgentFolder();
  form.sourceRepositoryPath = selectedFolder?.trim() || previousPath;
}

function submit(): void {
  if (!canSubmit.value) {
    return;
  }

  const teamTarget = form.teamMode === 'dedicated'
    ? { mode: 'dedicated' as const }
    : { mode: 'existing' as const, teamId: form.teamId };
  const cleanup = form.teamMode === 'dedicated'
    ? { deleteTeam: form.cleanupDeleteTeam }
    : { deleteAgent: form.cleanupDeleteAgent };

  emit('submit', {
    name: form.name,
    enabled: form.enabled,
    source: {
      provider: 'github',
      repositoryId: form.repositoryId,
      ...(form.assigneeLogin ? { assigneeLogin: form.assigneeLogin } : {}),
      ...(form.tagName ? { tagName: form.tagName } : {}),
    },
    instructions: {
      assignment: form.assignmentInstructions,
      beforeCompletion: form.beforeCompletionInstructions,
    },
    action: form.actionMode === 'new-agent'
      ? {
        type: 'create-agent',
        sourceRepositoryPath: form.sourceRepositoryPath,
        backend: form.backend,
        backendDefaults: loopBackendDefaults(),
        teamTarget,
        cleanup,
      }
      : {
        type: 'create-agent-from-bench',
        benchTemplateId: selectedBenchTemplateId.value,
        teamTarget,
        cleanup,
      },
  });
}

function loopBackendDefaults(): BackendDefaults {
  return {
    kind: 'codex',
    ...(form.model.trim() ? { model: form.model.trim() } : {}),
    ...(form.reasoningEffort.trim() ? { reasoningEffort: form.reasoningEffort.trim() } : {}),
  };
}

function initialActionMode(loop: Loop | null | undefined): ActionMode {
  if (loop?.action.type === 'create-agent-from-bench') {
    return `bench:${loop.action.benchTemplateId}`;
  }
  return 'new-agent';
}

function initialModel(loop: Loop | null | undefined): string {
  return loop?.action.type === 'create-agent' && loop.action.backendDefaults?.kind === 'codex'
    ? loop.action.backendDefaults.model ?? ''
    : '';
}

function initialReasoningEffort(loop: Loop | null | undefined): ReasoningEffort | '' {
  return loop?.action.type === 'create-agent' && loop.action.backendDefaults?.kind === 'codex'
    ? loop.action.backendDefaults.reasoningEffort ?? ''
    : '';
}

function effortLabel(effort: ReasoningEffort): string {
  if (effort.trim().toLowerCase() === 'xhigh') {
    return translate('surface.loopEditor.extraHigh');
  }

  return effort
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function workItemsKey(provider: 'github', repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}

function basename(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? '';
}
</script>

<style scoped>
.loop-editor {
  max-height: calc(100vh - var(--workbench-appbar-height) - var(--space-32));
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.loop-editor__header {
  position: sticky;
  top: 0;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-16);
  padding-bottom: var(--space-12);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-shell-main);
}

.loop-editor__body {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-16);
  overflow-y: auto;
  padding: var(--space-16) var(--space-12) var(--space-16) 0;
  scrollbar-width: thin;
}

.loop-editor__header h3,
.loop-editor__header p {
  margin: 0;
}

.loop-editor__header h3 {
  color: var(--color-text);
  font-size: var(--font-size-18);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.loop-editor__header p,
.loop-editor__notice {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.loop-editor__notice {
  padding: var(--space-10) var(--space-12);
  border: 1px solid var(--color-warning-container);
  border-radius: var(--radius-md);
  color: var(--color-on-warning-container);
  background: var(--color-warning-container);
}

.loop-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-12);
}

.loop-editor__source-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.loop-editor__source-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-12);
}

.loop-editor__section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.loop-editor__section--compact {
  gap: 0;
}

.loop-editor__section label {
  color: var(--color-text);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.loop-editor__bench-option,
.loop-editor__repository-option {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
}

.loop-editor__bench-option span {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  line-height: var(--line-height-18);
}

.loop-editor__repository-option {
  width: 100%;
  justify-content: space-between;
  gap: var(--space-12);
}

.loop-editor__repository-option strong,
.loop-editor__repository-option small,
.loop-editor__bench-option strong,
.loop-editor__bench-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loop-editor__repository-option strong,
.loop-editor__bench-option strong {
  color: var(--color-text);
  font-weight: var(--font-weight-regular);
}

.loop-editor__repository-option small,
.loop-editor__bench-option small {
  color: var(--color-text-muted);
}

.loop-editor__footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-12);
  border-top: 1px solid var(--color-border);
  background: var(--color-shell-main);
}
</style>

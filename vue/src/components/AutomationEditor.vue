<template>
  <form class="automation-editor" @submit.prevent="submit">
    <header class="automation-editor__header">
      <div>
        <h3>{{ mode === 'edit' ? $t('surface.automationEditor.editAutomation') : $t('surface.automationEditor.createAutomation') }}</h3>
        <p>{{ $t('surface.automationEditor.watchWorkCreateTheRightAgentAndSendTheAssignmentAutomati') }}</p>
      </div>
      <el-switch
        v-model="form.enabled"
        :aria-label="$t('surface.automationEditor.automationEnabled')"
        active-text="On"
        inactive-text="Off"
      />
    </header>

    <div class="automation-editor__body">
      <div
        v-if="!githubConnected"
        class="automation-editor__notice"
      > {{ $t('surface.automationEditor.connectGitHubInSettingsBeforeSavingAnAutomation') }} </div>

      <section class="automation-editor__section">
        <label for="automation-editor-name">{{ $t('surface.automationEditor.name') }}</label>
        <el-input
          id="automation-editor-name"
          v-model="form.name"
          :placeholder="$t('surface.automationEditor.automationName')"
        />
      </section>

      <section
        class="automation-editor__source-group"
        :aria-label="$t('surface.automationEditor.automationSourceFilters')"
      >
        <div class="automation-editor__source-row">
          <div class="automation-editor__section">
            <label for="automation-editor-provider">{{ $t('surface.automationEditor.provider') }}</label>
            <el-select
              id="automation-editor-provider"
              v-model="form.provider"
              disabled
              :aria-label="$t('surface.automationEditor.automationProvider')"
            >
              <el-option :label="$t('surface.automationEditor.gitHub')" value="github" />
            </el-select>
          </div>

          <div class="automation-editor__section">
            <label for="automation-editor-repository">{{ $t('surface.automationEditor.repo') }}</label>
            <el-select
              id="automation-editor-repository"
              v-model="form.repositoryId"
              filterable
              :placeholder="$t('surface.automationEditor.selectRepo')"
              :aria-label="$t('surface.automationEditor.automationRepository')"
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

        <div class="automation-editor__source-row">
          <div class="automation-editor__section">
            <label for="automation-editor-assignee">{{ $t('surface.automationEditor.assignedTo') }}</label>
            <el-select
              id="automation-editor-assignee"
              v-model="form.assigneeLogin"
              clearable
              filterable
              :placeholder="$t('surface.automationEditor.anyone')"
              :aria-label="$t('surface.automationEditor.automationAssignee')"
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

          <div class="automation-editor__section">
            <label for="automation-editor-tag">{{ $t('surface.automationEditor.tag') }}</label>
            <el-select
              id="automation-editor-tag"
              v-model="form.tagName"
              clearable
              filterable
              :placeholder="$t('surface.automationEditor.anyTag')"
              :aria-label="$t('surface.automationEditor.automationTag')"
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

      <section class="automation-editor__section">
        <label for="automation-editor-assignment-instructions">{{ $t('surface.automationEditor.assignmentInstructions') }}</label>
        <el-input
          id="automation-editor-assignment-instructions"
          v-model="form.assignmentInstructions"
          type="textarea"
          :rows="3"
          :placeholder="$t('surface.automationEditor.optionalInstructionsToIncludeWhenTheTicketIsAssigned')"
        />
      </section>

      <section class="automation-editor__section">
        <label for="automation-editor-completion-instructions">{{ $t('surface.automationEditor.beforeCompletion') }}</label>
        <el-input
          id="automation-editor-completion-instructions"
          v-model="form.beforeCompletionInstructions"
          type="textarea"
          :rows="3"
          :placeholder="$t('surface.automationEditor.optionalInstructionsToShowWhenTheAgentMarksTheTicketComp')"
        />
      </section>

      <section
        class="automation-editor__source-group"
        :aria-label="$t('surface.automationEditor.automationAgentTarget')"
      >
        <div class="automation-editor__source-row">
          <div class="automation-editor__section">
            <label for="automation-editor-agent">{{ $t('surface.automationEditor.agent') }}</label>
            <el-select
              id="automation-editor-agent"
              v-model="form.actionMode"
              filterable
              :placeholder="$t('surface.automationEditor.selectAgent')"
              :aria-label="$t('surface.automationEditor.automationAgent')"
            >
              <el-option
                :label="$t('surface.automationEditor.newAgent')"
                value="new-agent"
              />
              <el-option-group
                v-if="benchTemplates.length > 0"
                :label="$t('surface.automationEditor.bench')"
              >
                <el-option
                  v-for="template in benchTemplates"
                  :key="template.id"
                  :label="template.name"
                  :value="`bench:${template.id}`"
                >
                  <span class="automation-editor__bench-option">
                    <span>
                      <strong>{{ template.name }}</strong>
                      <small>{{ template.folder }}</small>
                    </span>
                  </span>
                </el-option>
              </el-option-group>
            </el-select>
          </div>

          <div class="automation-editor__section">
            <label for="automation-editor-team-mode">{{ $t('surface.automationEditor.team') }}</label>
            <el-select
              id="automation-editor-team-mode"
              v-model="form.teamMode"
              :aria-label="$t('surface.automationEditor.automationTeamMode')"
            >
              <el-option :label="$t('surface.automationEditor.existingTeam')" value="existing" />
              <el-option :label="$t('surface.automationEditor.dedicatedTeamPerTicket')" value="dedicated" />
            </el-select>
          </div>
        </div>

        <div
          v-if="form.teamMode === 'existing'"
          class="automation-editor__section"
        >
          <label for="automation-editor-team">{{ $t('surface.automationEditor.targetTeam') }}</label>
          <el-select
            id="automation-editor-team"
            v-model="form.teamId"
            filterable
            :placeholder="$t('surface.automationEditor.selectTeam')"
            :aria-label="$t('surface.automationEditor.automationTargetTeam')"
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
          class="automation-editor__section"
        >
          <label for="automation-editor-source-repository">{{ $t('surface.automationEditor.repository') }}</label>
          <el-select
            id="automation-editor-source-repository"
            :model-value="form.sourceRepositoryPath"
            filterable
            :placeholder="$t('surface.automationEditor.selectRepository')"
            :aria-label="$t('surface.automationEditor.automationSourceRepository')"
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
              <span class="automation-editor__repository-option">
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
              :label="$t('surface.automationEditor.pickFolder')"
              :value="pickFolderOptionValue"
            />
          </el-select>
        </div>

        <div
          v-if="form.actionMode === 'new-agent'"
          class="automation-editor__source-row"
          :aria-label="$t('surface.automationEditor.automationAgentBackendDefaults')"
        >
          <div class="automation-editor__section">
            <label for="automation-editor-backend">{{ $t('surface.automationEditor.backend') }}</label>
            <el-select
              id="automation-editor-backend"
              v-model="form.backend"
              :aria-label="$t('surface.automationEditor.automationBackend')"
            >
              <el-option :label="$t('surface.automationEditor.codex')" value="codex" />
            </el-select>
          </div>

          <div class="automation-editor__section">
            <label for="automation-editor-model">{{ $t('surface.automationEditor.model') }}</label>
            <el-select
              v-if="backendModels.length > 0"
              id="automation-editor-model"
              v-model="form.model"
              clearable
              filterable
              :placeholder="$t('surface.automationEditor.defaultModel')"
              :aria-label="$t('surface.automationEditor.automationModel')"
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
              id="automation-editor-model"
              v-model="form.model"
              :placeholder="$t('surface.automationEditor.defaultModel')"
              :aria-label="$t('surface.automationEditor.automationModel')"
            />
          </div>
        </div>

        <div
          v-if="form.actionMode === 'new-agent'"
          class="automation-editor__source-row"
          :aria-label="$t('surface.automationEditor.automationThinkingDefaults')"
        >
          <div class="automation-editor__section">
            <label for="automation-editor-thinking">{{ $t('surface.automationEditor.thinking') }}</label>
            <el-select
              id="automation-editor-thinking"
              v-model="form.reasoningEffort"
              clearable
              filterable
              :placeholder="$t('surface.automationEditor.default')"
              :aria-label="$t('surface.automationEditor.automationThinking')"
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

      <section class="automation-editor__section automation-editor__section--compact">
        <el-checkbox
          v-if="form.teamMode === 'existing'"
          v-model="form.cleanupDeleteAgent"
        > {{ $t('surface.automationEditor.deleteAgentWhenWorkItemCompletes') }} </el-checkbox>
        <el-checkbox
          v-else
          v-model="form.cleanupDeleteTeam"
        > {{ $t('surface.automationEditor.deleteTeamWhenWorkItemCompletes') }} </el-checkbox>
      </section>
    </div>

    <footer class="automation-editor__footer">
      <el-button @click="emit('cancel')">{{ $t('surface.automationEditor.cancel') }}</el-button>
      <el-button
        type="primary"
        native-type="submit"
        :disabled="!canSubmit"
      > {{ $t('surface.automationEditor.saveAutomation') }} </el-button>
    </footer>
  </form>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed, onMounted, reactive, watch } from 'vue';
import type { BackendDefaults, BackendModelOption, BenchTemplate, CreateAutomationInput, Automation, ReasoningEffort, SourceRepository, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '@codex-claw/core/contracts';

type TeamMode = 'existing' | 'dedicated';
type ActionMode = 'new-agent' | `bench:${string}`;

const props = withDefaults(defineProps<{
  backendModels?: BackendModelOption[];
  benchTemplates: BenchTemplate[];
  chooseAgentFolder?: () => Promise<string | null>;
  connection?: WorkIntegrationConnection | null;
  itemsByRepository?: Record<string, WorkItem[]>;
  automation?: Automation | null;
  mode: 'create' | 'edit';
  repositories: WorkRepository[];
  sourceRepositories?: SourceRepository[];
  teams: Team[];
}>(), {
  backendModels: () => [],
  chooseAgentFolder: async () => null,
  connection: null,
  itemsByRepository: () => ({}),
  automation: null,
  sourceRepositories: () => [],
});

const emit = defineEmits<{
  cancel: [];
  'load-items': [repositoryId: string];
  'load-repositories': [];
  submit: [input: CreateAutomationInput];
}>();

const pickFolderOptionValue = '__pick-folder__';
const sourceDividerOptionValue = '__source-divider__';

const form = reactive({
  name: props.automation?.name ?? '',
  enabled: props.automation?.enabled ?? true,
  provider: 'github' as const,
  repositoryId: props.automation?.source.repositoryId ?? props.repositories[0]?.id ?? '',
  assigneeLogin: props.automation?.source.assigneeLogin ?? '',
  tagName: props.automation?.source.tagName ?? '',
  assignmentInstructions: props.automation?.instructions.assignment ?? '',
  beforeCompletionInstructions: props.automation?.instructions.beforeCompletion ?? '',
  actionMode: initialActionMode(props.automation),
  backend: 'codex' as const,
  model: initialModel(props.automation),
  reasoningEffort: initialReasoningEffort(props.automation),
  sourceRepositoryPath: props.automation?.action.type === 'create-agent'
    ? props.automation.action.sourceRepositoryPath
    : props.sourceRepositories[0]?.path ?? '',
  teamMode: (props.automation?.action.teamTarget.mode ?? 'existing') as TeamMode,
  teamId: props.automation?.action.teamTarget.mode === 'existing'
    ? props.automation.action.teamTarget.teamId
    : props.teams[0]?.id ?? '',
  cleanupDeleteAgent: props.automation?.action.teamTarget.mode === 'existing'
    ? props.automation.action.cleanup?.deleteAgent !== false
    : true,
  cleanupDeleteTeam: props.automation?.action.teamTarget.mode === 'dedicated'
    ? props.automation.action.cleanup?.deleteTeam !== false
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
      label: accountLabel && assignee === accountLabel ? translate('surface.automationEditor.me') : assignee,
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
        backendDefaults: automationBackendDefaults(),
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

function automationBackendDefaults(): BackendDefaults {
  return {
    kind: 'codex',
    ...(form.model.trim() ? { model: form.model.trim() } : {}),
    ...(form.reasoningEffort.trim() ? { reasoningEffort: form.reasoningEffort.trim() } : {}),
  };
}

function initialActionMode(automation: Automation | null | undefined): ActionMode {
  if (automation?.action.type === 'create-agent-from-bench') {
    return `bench:${automation.action.benchTemplateId}`;
  }
  return 'new-agent';
}

function initialModel(automation: Automation | null | undefined): string {
  return automation?.action.type === 'create-agent' && automation.action.backendDefaults?.kind === 'codex'
    ? automation.action.backendDefaults.model ?? ''
    : '';
}

function initialReasoningEffort(automation: Automation | null | undefined): ReasoningEffort | '' {
  return automation?.action.type === 'create-agent' && automation.action.backendDefaults?.kind === 'codex'
    ? automation.action.backendDefaults.reasoningEffort ?? ''
    : '';
}

function effortLabel(effort: ReasoningEffort): string {
  if (effort.trim().toLowerCase() === 'xhigh') {
    return translate('surface.automationEditor.extraHigh');
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
.automation-editor {
  max-height: calc(100vh - var(--workbench-appbar-height) - var(--space-32));
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.automation-editor__header {
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

.automation-editor__body {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-16);
  overflow-y: auto;
  padding: var(--space-16) var(--space-12) var(--space-16) 0;
  scrollbar-width: thin;
}

.automation-editor__header h3,
.automation-editor__header p {
  margin: 0;
}

.automation-editor__header h3 {
  color: var(--color-text);
  font-size: var(--font-size-18);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.automation-editor__header p,
.automation-editor__notice {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.automation-editor__notice {
  padding: var(--space-10) var(--space-12);
  border: 1px solid var(--color-warning-container);
  border-radius: var(--radius-md);
  color: var(--color-on-warning-container);
  background: var(--color-warning-container);
}

.automation-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-12);
}

.automation-editor__source-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.automation-editor__source-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-12);
}

.automation-editor__section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.automation-editor__section--compact {
  gap: 0;
}

.automation-editor__section label {
  color: var(--color-text);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.automation-editor__bench-option,
.automation-editor__repository-option {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
}

.automation-editor__bench-option span {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  line-height: var(--line-height-18);
}

.automation-editor__repository-option {
  width: 100%;
  justify-content: space-between;
  gap: var(--space-12);
}

.automation-editor__repository-option strong,
.automation-editor__repository-option small,
.automation-editor__bench-option strong,
.automation-editor__bench-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.automation-editor__repository-option strong,
.automation-editor__bench-option strong {
  color: var(--color-text);
  font-weight: var(--font-weight-regular);
}

.automation-editor__repository-option small,
.automation-editor__bench-option small {
  color: var(--color-text-muted);
}

.automation-editor__footer {
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

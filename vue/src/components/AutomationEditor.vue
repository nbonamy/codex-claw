<template>
  <form class="automation-editor" @submit.prevent="submit">
    <header class="automation-editor__header">
      <div>
        <h3>
          {{ mode === 'edit' ? $t('surface.automationEditor.editAutomation') : $t('surface.automationEditor.createAutomation') }}
        </h3>
        <p>{{ $t('surface.automationEditor.runPromptAcrossRepositories') }}</p>
      </div>
      <el-switch
        v-model="form.enabled"
        :aria-label="$t('surface.automationEditor.automationEnabled')"
        :active-text="$t('surface.automationEditor.on')"
        :inactive-text="$t('surface.automationEditor.off')"
      />
    </header>

    <div class="automation-editor__body">
      <BacklogSourceSelector :provider="provider" :providers="workProviderKinds" :show-source="false" @select-provider="selectProvider" />
      <div v-if="!providerConnected" class="automation-editor__notice">
        {{ $t('automationSources.connect', { provider: providerLabel }) }}
      </div>
      <div v-if="error" class="automation-editor__notice">{{ error }}</div>

      <section class="automation-editor__section">
        <div class="automation-editor__source-heading">
          <label for="automation-editor-repositories">{{ sourceLabel }}</label>
          <el-button v-if="providerConnected" text size="small" :disabled="loading" @click="emit('load-repositories', provider)">{{ $t(error ? 'backlogSource.retry' : 'automationSources.refresh') }}</el-button>
        </div>
        <el-select
          id="automation-editor-repositories"
          v-model="form.repositoryIds"
          filterable
          multiple
          collapse-tags
          collapse-tags-tooltip
          :max-collapse-tags="3"
          :placeholder="sourceLabel"
          :aria-label="!workProviderDefinition(provider).repositoryBacked ? sourceLabel : $t('surface.automationEditor.automationRepositories')"
          :loading="loading"
          :disabled="!providerConnected || loading || repositoryOptions.length === 0"
        >
          <el-option v-for="repository in repositoryOptions" :key="repository.value" :label="repository.label" :value="repository.value" />
        </el-select>
        <p v-if="providerConnected && !loading && repositoryOptions.length === 0" class="automation-editor__help">
          {{ $t(!workProviderDefinition(provider).repositoryBacked ? 'automationSources.noSources' : 'surface.automationEditor.noConfiguredGitHubRepositories') }}
        </p>
      </section>

      <section v-for="source in selectedWorkSources" :key="source.value" class="automation-editor__section">
        <label :for="`automation-code-${source.value}`">{{ $t('automationSources.codeRepositoryFor', { source: source.label }) }}</label>
        <el-select :id="`automation-code-${source.value}`" v-model="executionPaths[source.value]" filterable
          :aria-label="$t('automationSources.codeRepositoryFor', { source: source.label })" :placeholder="$t('backlogSource.chooseCodeRepository')">
          <el-option v-for="repository in sourceRepositories" :key="repository.path" :value="repository.path" :label="repository.name" />
        </el-select>
      </section>

      <div class="automation-editor__grid">
        <section class="automation-editor__section">
          <label for="automation-editor-team">{{ $t('surface.automationEditor.team') }}</label>
          <el-select
            id="automation-editor-team"
            v-model="form.teamId"
            filterable
            :placeholder="$t('surface.automationEditor.selectTeam')"
            :aria-label="$t('surface.automationEditor.automationTargetTeam')"
          >
            <el-option v-for="team in teams" :key="team.id" :label="team.name" :value="team.id" />
          </el-select>
        </section>

        <section class="automation-editor__section">
          <label for="automation-editor-schedule">{{ $t('surface.automationEditor.run') }}</label>
          <el-select
            id="automation-editor-schedule"
            v-model="form.intervalMinutes"
            :aria-label="$t('surface.automationEditor.automationSchedule')"
          >
            <el-option v-for="option in scheduleOptions" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </section>
      </div>

      <section class="automation-editor__section automation-editor__prompt-section">
        <label for="automation-editor-selection-prompt">{{ $t('surface.automationEditor.selectionPrompt') }}</label>
        <p class="automation-editor__help">
          {{ $t('surface.automationEditor.selectionPromptHelp') }}
        </p>
        <VoiceTextarea
          id="automation-editor-selection-prompt"
          v-model="form.selectionPrompt"
          :label="$t('surface.automationEditor.selectionPrompt')"
          :rows="5"
          :placeholder="$t('surface.automationEditor.selectionPromptPlaceholder')"
          @busy-change="selectionPromptBusy = $event"
        />
      </section>

      <section class="automation-editor__section automation-editor__prompt-section">
        <label for="automation-editor-assignment-prompt">{{ $t('surface.automationEditor.assignmentPrompt') }}</label>
        <p class="automation-editor__help">
          {{ $t('surface.automationEditor.assignmentPromptHelp') }}
        </p>
        <VoiceTextarea
          id="automation-editor-assignment-prompt"
          v-model="form.assignmentPrompt"
          :label="$t('surface.automationEditor.assignmentPrompt')"
          :rows="5"
          :placeholder="$t('surface.automationEditor.assignmentPromptPlaceholder')"
          @busy-change="assignmentPromptBusy = $event"
        />
      </section>
    </div>

    <footer class="automation-editor__footer">
      <BackendSelector v-model="form.backend" :team-id="form.teamId" :preserve-selection="Boolean(automation)" />
      <el-button @click="emit('cancel')">{{ $t('surface.automationEditor.cancel') }}</el-button>
      <el-button type="primary" native-type="submit" :disabled="!canSubmit">
        {{ $t('surface.automationEditor.saveAutomation') }}
      </el-button>
    </footer>
  </form>
</template>

<script setup lang="ts">
import { workProviderDefinition, workProviderKinds } from '@codex-claw/core/work-providers';
import type {
  Automation,
  AutomationWorkSourceTarget,
  CreateAutomationInput,
  SourceRepository,
  Team,
  WorkIntegrationConnection,
  WorkSource,
  WorkProviderKind,
} from '@codex-claw/core/contracts';
import { canonicalGitRemoteIdentity } from '@codex-claw/core/git-remote';
import { computed, reactive, ref, watch } from 'vue';
import { translate } from '../i18n';
import VoiceTextarea from '../shared/VoiceTextarea.vue';
import BackendSelector from './BackendSelector.vue';
import BacklogSourceSelector from './BacklogSourceSelector.vue';
import { workProviderLabel } from '@codex-claw/core/work-item-prompts';
import { useBackendChoices } from './backend-selection';

const props = withDefaults(
  defineProps<{
    connections?: WorkIntegrationConnection[];
    loading?: boolean;
    error?: string | null;
    automation?: Automation | null;
    mode: 'create' | 'edit';
    repositories: WorkSource[];
    sourceRepositories?: SourceRepository[];
    currentRepositoryPath?: string;
    teams: Team[];
  }>(),
  {
    connections: () => [],
    loading: false,
    error: null,
    automation: null,
    sourceRepositories: () => [],
    currentRepositoryPath: '',
  },
);

const emit = defineEmits<{
  cancel: [];
  'load-repositories': [provider: WorkProviderKind];
  submit: [input: CreateAutomationInput];
}>();

const scheduleOptions = [
  { value: 5, label: translate('surface.automationEditor.every5Minutes') },
  { value: 15, label: translate('surface.automationEditor.every15Minutes') },
  { value: 30, label: translate('surface.automationEditor.every30Minutes') },
  { value: 60, label: translate('surface.automationEditor.everyHour') },
  { value: 360, label: translate('surface.automationEditor.every6Hours') },
  { value: 720, label: translate('surface.automationEditor.every12Hours') },
  { value: 1_440, label: translate('surface.automationEditor.everyDay') },
];

const form = reactive({
  backend: props.automation ? props.automation.backend ?? 'codex' : undefined as import('@codex-claw/core/contracts').AgentBackend | undefined,
  enabled: props.automation?.enabled ?? true,
  repositoryIds: props.automation?.repositories.map(repositoryValue) ?? [],
  teamId: props.automation?.teamId ?? props.teams[0]?.id ?? '',
  selectionPrompt: props.automation?.selectionPrompt ?? '',
  assignmentPrompt: props.automation?.assignmentPrompt ?? '',
  intervalMinutes: props.automation?.schedule.intervalMinutes ?? 60,
});
const selectionPromptBusy = ref(false);
const engineChoices = useBackendChoices(() => form.teamId);
const assignmentPromptBusy = ref(false);
const provider = ref<WorkProviderKind>(props.automation?.repositories[0]?.provider ?? props.connections.find(connection => connection.status === 'connected')?.provider ?? workProviderKinds[0]!);
const providerLabel = computed(() => workProviderLabel(provider.value));
const sourceLabel = computed(() => translate(workProviderDefinition(provider.value).sourceLabel.key));
const executionPaths = reactive<Record<string, string>>(Object.fromEntries(
  (props.automation?.repositories ?? []).map(target => [repositoryValue(target), target.executionRepositoryPath]),
));

const providerConnected = computed(() => props.connections.find(connection => connection.provider === provider.value)?.status === 'connected');
const repositoryOptions = computed(() => {
  const sourceRepositoryByIdentity = new Map(
    props.sourceRepositories.flatMap((repository) => (repository.remoteIdentity ? [[repository.remoteIdentity, repository] as const] : [])),
  );
  const options = props.repositories.flatMap((repository) => {
    if (repository.provider !== provider.value) return [];
    if (!workProviderDefinition(repository.provider).repositoryBacked) {
      const target: AutomationWorkSourceTarget = { provider: repository.provider, sourceId: repository.id, executionRepositoryPath: executionPaths[repositoryValue({ provider: repository.provider, sourceId: repository.id })] ?? '' };
      return [{ value: repositoryValue(target), label: repository.fullName, target }];
    }
    const identity = canonicalGitRemoteIdentity(repository.url);
    const sourceRepository = identity ? sourceRepositoryByIdentity.get(identity) : undefined;
    if (!sourceRepository || !workProviderDefinition(repository.provider).repositoryBacked) return [];
    const target: AutomationWorkSourceTarget = {
      provider: repository.provider,
      sourceId: repository.id,
      executionRepositoryPath: sourceRepository.path,
    };
    return [{ value: repositoryValue(target), label: repository.fullName, target }];
  });

  for (const repository of props.automation?.repositories ?? []) {
    if (repository.provider !== provider.value || !workProviderDefinition(repository.provider).repositoryBacked) continue;
    const value = repositoryValue(repository);
    if (!options.some((option) => option.value === value)) {
      options.push({
        value,
        label: repository.sourceId,
        target: repository,
      });
    }
  }
  return options.sort((left, right) => left.label.localeCompare(right.label));
});
const selectedWorkSources = computed(() => !workProviderDefinition(provider.value).repositoryBacked
  ? repositoryOptions.value.filter(option => form.repositoryIds.includes(option.value)) : []);
const canSubmit = computed(
  () =>
    providerConnected.value && !props.loading && !props.error &&
    form.repositoryIds.length > 0 &&
    form.repositoryIds.every(value => repositoryOptions.value.some(option => option.value === value
      && (workProviderDefinition(provider.value).repositoryBacked || props.sourceRepositories.some(repository => repository.path === option.target.executionRepositoryPath)))) &&
    Boolean(form.teamId) &&
    Boolean(form.backend && (engineChoices.value.includes(form.backend) || form.backend === props.automation?.backend || (props.automation && !props.automation.backend && form.backend === 'codex'))) &&
    Number.isFinite(form.intervalMinutes) &&
    form.intervalMinutes >= 1 &&
    !selectionPromptBusy.value &&
    !assignmentPromptBusy.value,
);

watch([provider, providerConnected], (_, previous) => {
  if (providerConnected.value && (previous[0] !== undefined || !props.repositories.some(repository => repository.provider === provider.value))) emit('load-repositories', provider.value);
}, { immediate: true });

watch(() => form.repositoryIds, values => {
  if (workProviderDefinition(provider.value).repositoryBacked || !props.sourceRepositories.some(repository => repository.path === props.currentRepositoryPath)) return;
  for (const value of values) executionPaths[value] ??= props.currentRepositoryPath;
}, { deep: true });

function selectProvider(value: WorkProviderKind): void {
  if (provider.value === value) return;
  form.repositoryIds = [];
  for (const key of Object.keys(executionPaths)) delete executionPaths[key];
  provider.value = value;
}

watch(
  () => props.teams,
  (teams) => {
    if (!form.teamId && teams[0]) form.teamId = teams[0].id;
  },
);

function submit(): void {
  if (!canSubmit.value) return;
  const selectedValues = new Set(form.repositoryIds);
  emit('submit', {
    ...(props.automation?.name ? { name: props.automation.name } : !workProviderDefinition(provider.value).repositoryBacked ? { name: selectedWorkSources.value.map(source => source.label).join(', ') } : {}),
    enabled: form.enabled,
    backend: form.backend,
    repositories: repositoryOptions.value.filter((option) => selectedValues.has(option.value)).map((option) => option.target),
    teamId: form.teamId,
    ...(form.selectionPrompt.trim() ? { selectionPrompt: form.selectionPrompt.trim() } : {}),
    ...(form.assignmentPrompt.trim() ? { assignmentPrompt: form.assignmentPrompt.trim() } : {}),
    schedule: { intervalMinutes: form.intervalMinutes },
  });
}

function repositoryValue(repository: Pick<AutomationWorkSourceTarget, 'provider' | 'sourceId'>): string {
  return `${repository.provider}:${repository.sourceId}`;
}
</script>

<style scoped>
.automation-editor__source-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
}

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

.automation-editor__header h3,
.automation-editor__header p,
.automation-editor__help {
  margin: 0;
}

.automation-editor__header h3 {
  color: var(--color-text);
  font-size: var(--font-size-18);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.automation-editor__header p,
.automation-editor__help,
.automation-editor__notice {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.automation-editor__body {
  min-height: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-20);
  overflow-y: auto;
  padding: var(--space-20) var(--space-12) var(--space-20) 0;
  scrollbar-width: thin;
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
  gap: var(--space-16);
}

.automation-editor__section {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.automation-editor__section label {
  color: var(--color-text);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.automation-editor__prompt-section {
  gap: var(--space-4);
}

.automation-editor__prompt-section + .automation-editor__prompt-section {
  padding-top: var(--space-4);
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

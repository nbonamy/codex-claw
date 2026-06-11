<template>
  <form class="loop-editor" @submit.prevent="submit">
    <header class="loop-editor__header">
      <div>
        <h3>{{ mode === 'edit' ? 'Edit Loop' : 'Create Loop' }}</h3>
        <p>Watch work, create the right Bench agent, and send the assignment automatically.</p>
      </div>
      <el-switch
        v-model="form.enabled"
        aria-label="Loop enabled"
        active-text="On"
        inactive-text="Off"
      />
    </header>

    <div class="loop-editor__body">
      <div
        v-if="!githubConnected"
        class="loop-editor__notice"
      >
        Connect GitHub in Settings before saving a loop.
      </div>

      <section class="loop-editor__section">
        <label for="loop-editor-name">Name</label>
        <el-input
          id="loop-editor-name"
          v-model="form.name"
          placeholder="Loop name"
        />
      </section>

      <section
        class="loop-editor__source-group"
        aria-label="Loop source filters"
      >
        <div class="loop-editor__source-row">
          <div class="loop-editor__section">
            <label for="loop-editor-provider">Provider</label>
            <el-select
              id="loop-editor-provider"
              v-model="form.provider"
              disabled
              aria-label="Loop provider"
            >
              <el-option label="GitHub" value="github" />
            </el-select>
          </div>

          <div class="loop-editor__section">
            <label for="loop-editor-repository">Repo</label>
            <el-select
              id="loop-editor-repository"
              v-model="form.repositoryId"
              filterable
              placeholder="Select repo"
              aria-label="Loop repository"
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
            <label for="loop-editor-assignee">Assigned to</label>
            <el-select
              id="loop-editor-assignee"
              v-model="form.assigneeLogin"
              clearable
              filterable
              placeholder="Anyone"
              aria-label="Loop assignee"
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
            <label for="loop-editor-tag">Tag</label>
            <el-select
              id="loop-editor-tag"
              v-model="form.tagName"
              clearable
              filterable
              placeholder="Any tag"
              aria-label="Loop tag"
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
        <label for="loop-editor-assignment-instructions">Assignment instructions</label>
        <el-input
          id="loop-editor-assignment-instructions"
          v-model="form.assignmentInstructions"
          type="textarea"
          :rows="3"
          placeholder="Optional instructions to include when the ticket is assigned"
        />
      </section>

      <section class="loop-editor__section">
        <label for="loop-editor-completion-instructions">Before completion</label>
        <el-input
          id="loop-editor-completion-instructions"
          v-model="form.beforeCompletionInstructions"
          type="textarea"
          :rows="3"
          placeholder="Optional instructions to show when the agent marks the ticket complete"
        />
      </section>

      <section class="loop-editor__grid">
        <div class="loop-editor__section">
          <label for="loop-editor-bench">Bench Agent</label>
          <el-select
            id="loop-editor-bench"
            v-model="form.benchTemplateId"
            filterable
            placeholder="Select Bench agent"
            aria-label="Loop Bench agent"
            :disabled="benchTemplates.length === 0"
          >
            <el-option
              v-for="template in benchTemplates"
              :key="template.id"
              :label="template.name"
              :value="template.id"
            >
              <span class="loop-editor__bench-option">
                <AgentAvatar
                  :avatar="template.avatar"
                  :name="template.name"
                  size="sm"
                />
                <span>
                  <strong>{{ template.name }}</strong>
                  <small>{{ template.folder }}</small>
                </span>
              </span>
            </el-option>
          </el-select>
        </div>

        <div class="loop-editor__section">
          <label for="loop-editor-team-mode">Team</label>
          <el-select
            id="loop-editor-team-mode"
            v-model="form.teamMode"
            aria-label="Loop team mode"
          >
            <el-option label="Existing team" value="existing" />
            <el-option label="Dedicated team per ticket" value="dedicated" />
          </el-select>
        </div>
      </section>

      <section
        v-if="form.teamMode === 'existing'"
        class="loop-editor__section"
      >
        <label for="loop-editor-team">Target Team</label>
        <el-select
          id="loop-editor-team"
          v-model="form.teamId"
          filterable
          placeholder="Select team"
          aria-label="Loop target team"
        >
          <el-option
            v-for="team in teams"
            :key="team.id"
            :label="team.name"
            :value="team.id"
          />
        </el-select>
      </section>

      <section class="loop-editor__section loop-editor__section--compact">
        <el-checkbox
          v-if="form.teamMode === 'existing'"
          v-model="form.cleanupDeleteAgent"
        >
          Delete agent when work item completes
        </el-checkbox>
        <el-checkbox
          v-else
          v-model="form.cleanupDeleteTeam"
        >
          Delete team when work item completes
        </el-checkbox>
      </section>
    </div>

    <footer class="loop-editor__footer">
      <el-button @click="emit('cancel')">Cancel</el-button>
      <el-button
        type="primary"
        native-type="submit"
        :disabled="!canSubmit"
      >
        Save Loop
      </el-button>
    </footer>
  </form>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue';
import type { BenchTemplate, CreateLoopInput, Loop, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '../../shared/contracts';
import AgentAvatar from './AgentAvatar.vue';

type TeamMode = 'existing' | 'dedicated';

const props = withDefaults(defineProps<{
  benchTemplates: BenchTemplate[];
  connection?: WorkIntegrationConnection | null;
  itemsByRepository?: Record<string, WorkItem[]>;
  loop?: Loop | null;
  mode: 'create' | 'edit';
  repositories: WorkRepository[];
  teams: Team[];
}>(), {
  connection: null,
  itemsByRepository: () => ({}),
  loop: null,
});

const emit = defineEmits<{
  cancel: [];
  'load-items': [repositoryId: string];
  'load-repositories': [];
  submit: [input: CreateLoopInput];
}>();

const form = reactive({
  name: props.loop?.name ?? '',
  enabled: props.loop?.enabled ?? true,
  provider: 'github' as const,
  repositoryId: props.loop?.source.repositoryId ?? props.repositories[0]?.id ?? '',
  assigneeLogin: props.loop?.source.assigneeLogin ?? '',
  tagName: props.loop?.source.tagName ?? '',
  assignmentInstructions: props.loop?.instructions.assignment ?? '',
  beforeCompletionInstructions: props.loop?.instructions.beforeCompletion ?? '',
  benchTemplateId: props.loop?.action.benchTemplateId ?? props.benchTemplates[0]?.id ?? '',
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
const currentItems = computed(() => form.repositoryId ? props.itemsByRepository[workItemsKey(form.provider, form.repositoryId)] ?? [] : []);
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
      label: accountLabel && assignee === accountLabel ? 'Me' : assignee,
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
  Boolean(form.benchTemplateId) &&
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

watch(() => props.benchTemplates, (templates) => {
  if (!form.benchTemplateId && templates[0]) {
    form.benchTemplateId = templates[0].id;
  }
});

watch(() => props.teams, (teams) => {
  if (!form.teamId && teams[0]) {
    form.teamId = teams[0].id;
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

function submit(): void {
  if (!canSubmit.value) {
    return;
  }

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
    action: {
      type: 'create-agent-from-bench',
      benchTemplateId: form.benchTemplateId,
      teamTarget: form.teamMode === 'dedicated'
        ? { mode: 'dedicated' }
        : { mode: 'existing', teamId: form.teamId },
      cleanup: form.teamMode === 'dedicated'
        ? { deleteTeam: form.cleanupDeleteTeam }
        : { deleteAgent: form.cleanupDeleteAgent },
    },
  });
}

function workItemsKey(provider: 'github', repositoryId: string): string {
  return `${provider}:${repositoryId}`;
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

.loop-editor__bench-option {
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

.loop-editor__bench-option strong,
.loop-editor__bench-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loop-editor__bench-option strong {
  color: var(--color-text);
  font-weight: var(--font-weight-regular);
}

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

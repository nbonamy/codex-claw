<template>
  <section class="work-item-assignment-picker">
    <div class="work-item-assignment-picker__target-options">
      <button
        type="button"
        :class="{ 'is-selected': destination === 'existing' }"
        :disabled="busy || sessions.length === 0"
        @click="destination = 'existing'"
      >
        <IconRobotFace aria-hidden="true" />
        <strong>{{ t('repositoryBacklog.useExistingSession') }}</strong>
        <span v-if="sessions.length === 0">{{ t('repositoryBacklog.noExistingSessions') }}</span>
        <span v-else>{{ t('repositoryBacklog.useExistingSessionDetail') }}</span>
      </button>
      <button
        type="button"
        :class="{ 'is-selected': destination === 'new' }"
        :disabled="busy"
        @click="destination = 'new'"
      >
        <IconCopy aria-hidden="true" />
        <strong>{{ t('repositoryBacklog.newIsolatedSession') }}</strong>
        <span>{{ t('repositoryBacklog.newIsolatedSessionDetail') }}</span>
      </button>
    </div>

    <div class="work-item-assignment-picker__workspace">
      <span>{{ destination === 'existing' ? t('repositoryBacklog.session') : t('repositoryBacklog.workspace') }}</span>
      <label v-if="destination === 'existing'">
        <IconRobotFace aria-hidden="true" />
        <el-select
          v-model="selectedAgentId"
          :disabled="busy"
          :aria-label="t('repositoryBacklog.existingSession')"
          :placeholder="t('repositoryBacklog.chooseSession')"
        >
          <el-option
            v-for="session in sessions"
            :key="session.agentId"
            :label="session.label"
            :value="session.agentId"
          />
        </el-select>
      </label>
      <div v-else class="work-item-assignment-picker__workspace-row">
        <IconGitBranch aria-hidden="true" />
        <strong>{{ t('repositoryBacklog.newWorktree') }}</strong>
      </div>
      <div class="work-item-assignment-picker__branch">
        <IconGitPullRequest v-if="item.kind === 'pullRequest'" aria-hidden="true" />
        <IconGitBranch v-else aria-hidden="true" />
        {{ branchName }}
      </div>
      <p v-if="destination === 'existing'" class="work-item-assignment-picker__branch-warning">
        <IconAlertTriangle aria-hidden="true" />
        {{ t('repositoryBacklog.existingSessionBranchWarning') }}
      </p>
    </div>

    <p v-if="error" class="work-item-assignment-picker__error" role="alert">{{ error }}</p>

    <footer>
      <button class="claw-button claw-button--tertiary" type="button" :disabled="!canSubmit" @click="emitCustom">
        {{ t('repositoryBacklog.custom') }}
      </button>
      <button class="claw-button claw-button--secondary" type="button" :disabled="!canSubmit" @click="emitSubmit(secondaryAction)">
        {{ item.kind === 'pullRequest' ? t('repositoryBacklog.addressFeedback') : t('repositoryBacklog.investigate') }}
      </button>
      <button class="claw-button claw-button--primary" type="button" :disabled="!canSubmit" @click="emitSubmit(primaryAction)">
        {{ item.kind === 'pullRequest' ? t('repositoryBacklog.review') : t('repositoryBacklog.fix') }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconAlertTriangle, IconCopy, IconGitBranch, IconGitPullRequest, IconRobotFace } from '@tabler/icons-vue';
import type { WorkItem } from '@codex-claw/core/contracts';
import type { WorkItemAssignmentAction } from '@codex-claw/core/work-item-prompts';

export type WorkItemAssignmentDestination = 'existing' | 'new';

export type WorkItemAssignmentSession = {
  agentId: string;
  label: string;
};

export type WorkItemAssignmentSelection = {
  action: WorkItemAssignmentAction;
  agentId?: string;
  destination: WorkItemAssignmentDestination;
  item: WorkItem;
};

const props = withDefaults(defineProps<{
  branchName: string;
  busy?: boolean;
  error?: string | null;
  item: WorkItem;
  sessions?: WorkItemAssignmentSession[];
}>(), {
  busy: false,
  error: null,
  sessions: () => [],
});

const emit = defineEmits<{
  custom: [selection: Omit<WorkItemAssignmentSelection, 'action'>];
  submit: [selection: WorkItemAssignmentSelection];
}>();

const { t } = useI18n();
const destination = ref<WorkItemAssignmentDestination>('new');
const selectedAgentId = ref('');
const secondaryAction = computed<WorkItemAssignmentAction>(() => props.item.kind === 'pullRequest' ? 'addressFeedback' : 'investigate');
const primaryAction = computed<WorkItemAssignmentAction>(() => props.item.kind === 'pullRequest' ? 'review' : 'fix');
const canSubmit = computed(() => !props.busy
  && props.branchName.trim().length > 0
  && (destination.value === 'new' || Boolean(selectedAgentId.value)));

watch(() => [props.item.id, props.sessions.map((session) => session.agentId).join('|')] as const, () => {
  destination.value = 'new';
  selectedAgentId.value = props.sessions[0]?.agentId ?? '';
}, { immediate: true });

function emitCustom(): void {
  if (!canSubmit.value) return;
  emit('custom', selection());
}

function emitSubmit(action: WorkItemAssignmentAction): void {
  if (!canSubmit.value) return;
  emit('submit', { ...selection(), action });
}

function selection(): Omit<WorkItemAssignmentSelection, 'action'> {
  return {
    destination: destination.value,
    ...(destination.value === 'existing' ? { agentId: selectedAgentId.value } : {}),
    item: props.item,
  };
}
</script>

<style scoped>
.work-item-assignment-picker {
  display: grid;
  gap: var(--space-4);
}

.work-item-assignment-picker__target-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 240px));
  justify-content: center;
  gap: var(--space-3);
}

.work-item-assignment-picker__target-options > button {
  min-height: 86px;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 3px;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  text-align: center;
  cursor: pointer;
}

.work-item-assignment-picker__target-options > button:hover:not(:disabled) {
  border-color: var(--color-outline);
  background: var(--color-surface-low);
}

.work-item-assignment-picker__target-options > button.is-selected {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.work-item-assignment-picker__target-options > button:disabled {
  opacity: 0.45;
  cursor: default;
}

.work-item-assignment-picker__target-options strong {
  font-size: var(--font-size-12);
}

.work-item-assignment-picker__target-options svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.work-item-assignment-picker__target-options span {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  line-height: 1.25;
}

.work-item-assignment-picker__workspace {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.work-item-assignment-picker__workspace > span {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.work-item-assignment-picker__workspace label,
.work-item-assignment-picker__workspace-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-12);
}

.work-item-assignment-picker__workspace label :deep(.el-select) {
  min-width: 0;
  flex: 1 1 auto;
}

.work-item-assignment-picker__workspace label > svg,
.work-item-assignment-picker__workspace-row svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.work-item-assignment-picker__branch {
  height: 28px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-left: 27px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-11);
}

.work-item-assignment-picker__branch svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--color-text-muted);
}

.work-item-assignment-picker__branch-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin: 0 0 0 27px;
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  line-height: 1.3;
}

.work-item-assignment-picker__branch-warning svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-warning);
}

.work-item-assignment-picker__error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-12);
}

.work-item-assignment-picker footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>

<template>
  <AppDataList
    class="loop-execution-log"
    :title="loop.name"
    :subtitle="executionCountLabel"
    aria-label="Loop execution log"
    :columns="executionColumns"
    empty-text="No executions yet."
    :rows="executionRows"
  >
    <template #headerActions>
      <div class="loop-execution-log__header-actions">
        <el-button
          type="danger"
          :disabled="loop.executionLog.length === 0"
          @click="emit('clear-history', loop.id)"
        >
          Clear
        </el-button>
        <el-button
          @click="emit('close')"
        >
          Back
        </el-button>
      </div>
    </template>

    <template #cell-ticket="{ row }">
      <div class="loop-execution-log__ticket-cell">
        <a
          v-if="triggerUrlForRow(row)"
          :href="triggerUrlForRow(row)"
          target="_blank"
          rel="noreferrer"
        >
          {{ row.ticket }}
        </a>
        <span
          v-else
          class="loop-execution-log__muted"
        >
          -
        </span>
        <p
          v-if="row.error"
          class="loop-execution-log__error"
        >
          {{ row.error }}
        </p>
      </div>
    </template>

    <template #cell-startedAt="{ row }">
      <time :datetime="startedAtForRow(row)">{{ row.time }}</time>
    </template>

    <template #cell-duration="{ row }">
      <span class="loop-execution-log__muted">{{ row.duration }}</span>
    </template>

    <template #cell-status="{ row }">
      <span
        class="loop-execution-log__status"
        :data-status="row.status"
      >
        {{ row.statusLabel }}
      </span>
    </template>
  </AppDataList>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Loop, LoopExecutionStatus } from '../../shared/contracts';
import AppDataList from './AppDataList.vue';
import type { AppDataListColumn, AppDataListRow } from './app-data-list';

const props = defineProps<{
  loop: Loop;
}>();

const emit = defineEmits<{
  'clear-history': [loopId: string];
  close: [];
}>();

const entries = computed(() => [...props.loop.executionLog].sort((left, right) => (
  Date.parse(right.startedAt) - Date.parse(left.startedAt)
)));

const executionCountLabel = computed(() => (
  `${entries.value.length} ${entries.value.length === 1 ? 'execution' : 'executions'}`
));

const executionColumns: AppDataListColumn[] = [{
  id: 'ticket',
  label: 'Ticket',
  width: 'minmax(0, 1fr)',
}, {
  id: 'startedAt',
  label: 'Start Time',
  width: 'max-content',
  align: 'end',
}, {
  id: 'duration',
  label: 'Execution Time',
  width: 'max-content',
  align: 'end',
}, {
  id: 'status',
  label: 'Status',
  width: 'max-content',
  align: 'end',
}];

const executionRows = computed<AppDataListRow[]>(() => entries.value.map((entry) => ({
  id: entry.id,
  duration: formatDuration(entry.startedAt, entry.completedAt),
  error: entry.error ?? '',
  startedAt: entry.startedAt,
  status: entry.status,
  statusLabel: statusLabel(entry.status),
  ticket: entry.createdAgents[0]?.workItemId ?? '',
  time: formatDate(entry.startedAt),
  triggerUrl: entry.createdAgents[0]?.workItemUrl ?? '',
})));

function statusLabel(status: LoopExecutionStatus): string {
  return status === 'completed' ? 'Completed' : 'Failed';
}

function startedAtForRow(row: AppDataListRow): string {
  return typeof row.startedAt === 'string' ? row.startedAt : '';
}

function triggerUrlForRow(row: AppDataListRow): string {
  return typeof row.triggerUrl === 'string' ? row.triggerUrl : '';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDuration(startedAt: string, completedAt: string): string {
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
    return 'Unknown';
  }

  const seconds = Math.round((completed - started) / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

</script>

<style scoped>

.loop-execution-log__status,
.loop-execution-log__muted {
  display: block;
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  white-space: nowrap;
}

.loop-execution-log__status {
  color: var(--color-success);
  font-weight: var(--font-weight-semibold);
}

.loop-execution-log__status[data-status="failed"] {
  color: var(--color-error);
}

.loop-execution-log__muted {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
  text-align: right;
}

.loop-execution-log__ticket-cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.loop-execution-log__ticket-cell a {
  display: block;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  text-decoration: none;
  white-space: nowrap;
}

.loop-execution-log__ticket-cell a:hover,
.loop-execution-log__ticket-cell a:focus-visible {
  color: var(--color-primary);
}

.loop-execution-log__ticket-cell p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.loop-execution-log__error {
  color: var(--color-error);
}

.loop-execution-log time {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  text-align: right;
  white-space: nowrap;
}
</style>

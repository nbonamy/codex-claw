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
      <LoopExecutionStatusActions
        :status="statusForRow(row)"
        :status-label="statusLabelForRow(row)"
        :ticket="ticketForRow(row)"
        @delete-execution="deleteExecution(row)"
        @view-conversation="openConversation(row)"
      />
    </template>
  </AppDataList>

  <LoopExecutionConversationOverlay
    v-if="selectedConversation"
    :agent-name="selectedConversation.agentName"
    :error="selectedConversation.error"
    :loading="selectedConversation.loading"
    :messages="selectedConversationMessages"
    :ticket="selectedConversation.ticket"
    @close="closeConversation"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BackendConversationRef, Loop, LoopExecutionStatus, RendererMessage } from '../../shared/contracts';
import AppDataList from './AppDataList.vue';
import type { AppDataListColumn, AppDataListRow } from './app-data-list';
import LoopExecutionConversationOverlay from './LoopExecutionConversationOverlay.vue';
import LoopExecutionStatusActions from './LoopExecutionStatusActions.vue';

const props = defineProps<{
  loop: Loop;
  messages: RendererMessage[];
  readConversationMessages: (ref: BackendConversationRef, agentId: string) => Promise<RendererMessage[]>;
}>();

const emit = defineEmits<{
  'clear-history': [loopId: string];
  'delete-execution': [payload: { executionId: string; loopId: string }];
  close: [];
}>();

type SelectedConversation = {
  agentId: string;
  agentName: string;
  error: string | null;
  loading: boolean;
  messages: RendererMessage[];
  ticket: string;
};

const selectedConversation = ref<SelectedConversation | null>(null);

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
  agentId: entry.createdAgents[0]?.agentId ?? '',
  agentName: entry.createdAgents[0]?.agentName ?? 'Agent',
  conversationRef: entry.createdAgents[0]?.conversationRef ?? null,
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

const selectedConversationMessages = computed<RendererMessage[]>(() => selectedConversation.value?.messages ?? []);

function statusLabel(status: LoopExecutionStatus): string {
  if (status === 'completed') {
    return 'Completed';
  }
  return status === 'failed' ? 'Failed' : 'Working';
}

function startedAtForRow(row: AppDataListRow): string {
  return typeof row.startedAt === 'string' ? row.startedAt : '';
}

function triggerUrlForRow(row: AppDataListRow): string {
  return typeof row.triggerUrl === 'string' ? row.triggerUrl : '';
}

function statusForRow(row: AppDataListRow): LoopExecutionStatus {
  return row.status === 'completed' || row.status === 'failed' || row.status === 'working'
    ? row.status
    : 'working';
}

function statusLabelForRow(row: AppDataListRow): string {
  return typeof row.statusLabel === 'string' && row.statusLabel.trim()
    ? row.statusLabel
    : statusLabel(statusForRow(row));
}

function ticketForRow(row: AppDataListRow): string {
  return typeof row.ticket === 'string' && row.ticket.trim() ? row.ticket : 'execution';
}

function conversationRefForRow(row: AppDataListRow): BackendConversationRef | null {
  if (!isBackendConversationRef(row.conversationRef)) {
    return null;
  }

  return row.conversationRef.backend === 'codex'
    ? { backend: 'codex', threadId: row.conversationRef.threadId }
    : {
        backend: 'claude',
        folder: row.conversationRef.folder,
        sessionId: row.conversationRef.sessionId,
      };
}

function agentIdForRow(row: AppDataListRow): string {
  return typeof row.agentId === 'string' ? row.agentId : '';
}

function agentNameForRow(row: AppDataListRow): string {
  return typeof row.agentName === 'string' && row.agentName.trim() ? row.agentName : 'Agent';
}

function executionIdForRow(row: AppDataListRow): string {
  return typeof row.id === 'string' ? row.id : '';
}

async function openConversation(row: AppDataListRow): Promise<void> {
  const agentId = agentIdForRow(row);
  if (!agentId) {
    return;
  }

  const conversationRef = conversationRefForRow(row);
  selectedConversation.value = {
    agentId,
    agentName: agentNameForRow(row),
    error: null,
    loading: Boolean(conversationRef),
    messages: conversationRef ? [] : liveMessagesForAgent(agentId),
    ticket: ticketForRow(row),
  };

  if (!conversationRef) {
    return;
  }

  try {
    const messages = await props.readConversationMessages(conversationRef, agentId);
    if (selectedConversation.value?.agentId === agentId && selectedConversation.value.ticket === ticketForRow(row)) {
      selectedConversation.value = {
        ...selectedConversation.value,
        loading: false,
        messages,
      };
    }
  } catch (error) {
    if (selectedConversation.value?.agentId === agentId && selectedConversation.value.ticket === ticketForRow(row)) {
      selectedConversation.value = {
        ...selectedConversation.value,
        error: error instanceof Error ? error.message : String(error),
        loading: false,
        messages: [],
      };
    }
  }
}

function deleteExecution(row: AppDataListRow): void {
  const executionId = executionIdForRow(row);
  if (executionId) {
    emit('delete-execution', {
      executionId,
      loopId: props.loop.id,
    });
  }
}

function closeConversation(): void {
  selectedConversation.value = null;
}

function liveMessagesForAgent(agentId: string): RendererMessage[] {
  return props.messages.filter((message) => message.agentId === agentId);
}

function isBackendConversationRef(value: unknown): value is BackendConversationRef {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BackendConversationRef>;
  if (candidate.backend === 'codex') {
    return typeof candidate.threadId === 'string' && candidate.threadId.trim().length > 0;
  }

  return candidate.backend === 'claude' &&
    typeof candidate.sessionId === 'string' &&
    candidate.sessionId.trim().length > 0 &&
    typeof candidate.folder === 'string' &&
    candidate.folder.trim().length > 0;
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

function formatDuration(startedAt: string, completedAt?: string): string {
  if (!completedAt) {
    return '-';
  }

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
.loop-execution-log__muted {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
  text-align: right;
  white-space: nowrap;
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

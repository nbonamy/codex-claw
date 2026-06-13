<template>
  <aside
    class="work-backlog-panel"
    aria-label="Work backlog"
  >
    <header class="work-backlog-panel__header">
      <div class="work-backlog-panel__title">
        <GitHubIcon aria-hidden="true" />
        <div>
          <strong>Backlog</strong>
          <!-- <span>{{ connection.accountLabel ?? 'GitHub' }}</span> -->
        </div>
      </div>
      <button
        class="work-backlog-panel__refresh"
        type="button"
        aria-label="Refresh backlog"
        :disabled="status === 'loading'"
        @click="emit('refresh', selectedRepositoryId)"
      >
        <RefreshIcon aria-hidden="true" />
      </button>
    </header>

    <div class="work-backlog-panel__filters">
      <el-select
        class="work-backlog-panel__select"
        :model-value="selectedRepositoryId"
        placeholder="Select repo"
        :disabled="repositories.length === 0"
        filterable
        aria-label="Backlog repository"
        @update:model-value="selectRepository"
      >
        <el-option
          v-for="repository in sortedRepositories"
          :key="repository.id"
          :label="repository.fullName"
          :value="repository.id"
        />
      </el-select>

      <el-select
        class="work-backlog-panel__select"
        :model-value="selectedAssigneeLogin"
        placeholder="Assigned to"
        :disabled="!selectedRepositoryId || assigneeOptions.length === 0"
        clearable
        filterable
        aria-label="Backlog assignee"
        @update:model-value="selectAssignee"
      >
        <el-option
          v-for="assignee in assigneeOptions"
          :key="assignee.value"
          :label="assignee.label"
          :value="assignee.value"
        />
      </el-select>

      <el-select
        class="work-backlog-panel__select"
        :model-value="selectedTagName"
        placeholder="All tags"
        :disabled="!selectedRepositoryId || tagOptions.length === 0"
        clearable
        filterable
        aria-label="Backlog tag"
        @update:model-value="selectTag"
      >
        <el-option
          v-for="tag in tagOptions"
          :key="tag"
          :label="tag"
          :value="tag"
        />
      </el-select>
    </div>

    <div
      v-if="status === 'loading'"
      class="work-backlog-panel__state"
    >
      Loading issues...
    </div>
    <div
      v-else-if="error"
      class="work-backlog-panel__state work-backlog-panel__state--error"
    >
      {{ error }}
    </div>
    <div
      v-else-if="!selectedRepositoryId"
      class="work-backlog-panel__state"
    >
      Select a repository
    </div>
    <div
      v-else-if="items.length === 0"
      class="work-backlog-panel__state"
    >
      No open issues
    </div>
    <div
      v-else-if="itemRows.length === 0"
      class="work-backlog-panel__state"
    >
      No issues with these filters
    </div>

    <div
      v-else
      class="work-backlog-panel__items"
    >
      <article
        v-for="row in itemRows"
        :key="row.item.id"
        class="work-backlog-panel__item"
        :class="{
          'work-backlog-panel__item--assigned': hasAssignmentContext(row),
          'work-backlog-panel__item--completed': workItemAssignmentStatus(row) === 'completed',
        }"
        draggable="true"
        @click="selectAssignedAgent(row.assignedAgent)"
        @contextmenu.prevent.stop="openItemMenu(row.item.id)"
        @dragstart="startDrag($event, row.item)"
        @dragend="endDrag"
      >
        <el-popover
          :visible="openMenuItemId === row.item.id"
          placement="bottom-end"
          trigger="manual"
          width="220"
          :teleported="true"
          popper-class="claw-popover work-backlog-panel__menu-popover"
          @update:visible="setMenuVisible(row.item.id, $event)"
        >
          <template #reference>
            <button
              class="work-backlog-panel__item-menu"
              type="button"
              :aria-label="`Issue #${row.item.number} actions`"
              draggable="false"
              @click.stop="setMenuVisible(row.item.id, openMenuItemId !== row.item.id)"
              @dragstart.stop
            >
              <DotsVerticalIcon aria-hidden="true" />
            </button>
          </template>
          <AppMenu
            class="app-menu--embedded"
            ariaLabel="Issue actions"
            :items="menuItemsForRow(row)"
            @click.stop
            @select="selectMenuItem(row.item, $event)"
          />
        </el-popover>
        <div class="work-backlog-panel__item-title">
          <span>#{{ row.item.number }}</span>
          <strong>{{ row.item.title }}</strong>
        </div>
        <div
          v-if="hasAssignmentContext(row)"
          class="work-backlog-panel__item-assignee"
        >
          <AgentAvatar
            v-if="row.assignedAgent"
            :avatar="row.assignedAgent.avatar"
            :name="row.assignedAgent.name"
            size="sm"
          />
          <span
            v-else
            aria-hidden="true"
            class="work-backlog-panel__missing-agent-icon"
          />
          <span>{{ row.assignedAgent?.name ?? 'Agent unavailable' }}</span>
          <span
            class="work-backlog-panel__assignee-status"
            :data-status="workItemAssignmentStatus(row)"
          >
            {{ workItemAssignmentStatusLabel(row) }}
          </span>
        </div>
        <div
          v-else-if="row.item.labels.length > 0"
          class="work-backlog-panel__item-meta"
        >
          <span>{{ row.item.labels[0]?.name }}</span>
        </div>
      </article>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Agent, WorkBacklogAssignment, WorkIntegrationConnection, WorkItem, WorkRepository } from '@codex-claw/shared/contracts';
import { workItemAssignmentKey } from '@codex-claw/shared/work-assignments';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { CircleXIcon, DotsVerticalIcon, ExternalLinkIcon, GitHubIcon, PlusCircleIcon, RefreshIcon, SaveToBenchIcon } from '../shared/icons/app-icons';
import AgentAvatar from './AgentAvatar.vue';

type WorkBacklogItemRow = {
  assignedAgent: Agent | null;
  assignment: WorkBacklogAssignment | null;
  item: WorkItem;
};

const props = withDefaults(defineProps<{
  assignedAgentsByWorkItemKey?: Record<string, Agent>;
  assignments?: Record<string, WorkBacklogAssignment>;
  canAssignToBench?: boolean;
  connection: WorkIntegrationConnection;
  error: string | null;
  items: WorkItem[];
  repositories: WorkRepository[];
  selectedAssigneeLogin?: string | null;
  selectedRepositoryId: string | null;
  selectedTagName?: string | null;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
}>(), {
  assignedAgentsByWorkItemKey: () => ({}),
  assignments: () => ({}),
  canAssignToBench: true,
  selectedAssigneeLogin: null,
  selectedTagName: null,
});

const emit = defineEmits<{
  'assign-to-bench-agent': [item: WorkItem];
  'assign-to-new-agent': [item: WorkItem];
  refresh: [repositoryId: string | null];
  'remove-assignment': [item: WorkItem];
  'select-assigned-agent': [agentId: string];
  'select-assignee': [assigneeLogin: string | null];
  'select-repository': [repositoryId: string | null];
  'select-tag': [tagName: string | null];
  'work-item-drag-end': [];
  'work-item-drag-start': [item: WorkItem];
}>();

const openMenuItemId = ref<string | null>(null);
const integrationLabel = computed(() => workProviderLabel(props.connection.provider));
const sortedRepositories = computed<WorkRepository[]>(() => [...props.repositories].sort((left, right) => (
  left.fullName.localeCompare(right.fullName) || left.id.localeCompare(right.id)
)));
const tagOptions = computed<string[]>(() => {
  const tags = new Set<string>();
  for (const item of props.items) {
    for (const label of item.labels) {
      if (label.name) {
        tags.add(label.name);
      }
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
});
const assigneeOptions = computed(() => {
  const assignees = new Set<string>();
  if (props.selectedAssigneeLogin) {
    assignees.add(props.selectedAssigneeLogin);
  }
  for (const item of props.items) {
    for (const assignee of item.assignees ?? []) {
      if (assignee) {
        assignees.add(assignee);
      }
    }
  }

  const accountLabel = props.connection.accountLabel?.trim();
  return [...assignees]
    .sort((left, right) => left.localeCompare(right))
    .map((assignee) => ({
      label: accountLabel && assignee === accountLabel ? 'Me' : assignee,
      value: assignee,
    }));
});
const filteredItems = computed<WorkItem[]>(() => {
  const selectedAssigneeLogin = props.selectedAssigneeLogin;
  const selectedTagName = props.selectedTagName;
  return props.items.filter((item) => {
    if (selectedAssigneeLogin && !(item.assignees ?? []).includes(selectedAssigneeLogin)) {
      return false;
    }
    if (selectedTagName && !item.labels.some((label) => label.name === selectedTagName)) {
      return false;
    }
    return true;
  });
});
const itemRows = computed<WorkBacklogItemRow[]>(() => filteredItems.value.map((item) => {
  const assignmentKey = workItemAssignmentKey(item);
  const assignedAgent = props.assignedAgentsByWorkItemKey[assignmentKey] ?? null;
  return {
    assignedAgent,
    assignment: props.assignments[assignmentKey] ?? null,
    item,
  };
}));

function workItemAssignmentStatus(row: WorkBacklogItemRow): WorkBacklogAssignment['status'] {
  return row.assignment?.status ?? 'working';
}

function workItemAssignmentStatusLabel(row: WorkBacklogItemRow): string {
  return workItemAssignmentStatus(row) === 'completed' ? 'Completed' : 'Working';
}

function hasAssignmentContext(row: WorkBacklogItemRow): boolean {
  return Boolean(row.assignment || row.assignedAgent);
}

function menuItemsForRow(row: WorkBacklogItemRow): AppMenuItem[] {
  return [
    {
      id: 'assign-to-new-agent',
      type: 'action',
      label: 'Assign to New Agent',
      icon: PlusCircleIcon,
    },
    {
      id: 'assign-to-bench',
      type: 'action',
      label: 'Assign to Bench Agent',
      icon: SaveToBenchIcon,
      disabled: !props.canAssignToBench,
    },
    { id: 'group-view', type: 'separator' },
    {
      id: 'open',
      type: 'action',
      label: `View on ${integrationLabel.value}`,
      icon: ExternalLinkIcon,
    },
    ...(hasAssignmentContext(row) ? [
      { id: 'group-reset', type: 'separator' } satisfies AppMenuItem,
      {
        id: 'reset-assignment',
        type: 'action',
        label: 'Reset',
        icon: CircleXIcon,
        danger: true,
      } satisfies AppMenuItem,
    ] : []),
  ];
}

function selectRepository(value: string | number | boolean | Record<string, unknown> | null | undefined): void {
  emit('select-repository', typeof value === 'string' ? value : null);
}

function selectAssignee(value: string | number | boolean | Record<string, unknown> | null | undefined): void {
  emit('select-assignee', typeof value === 'string' ? value : null);
}

function selectTag(value: string | number | boolean | Record<string, unknown> | null | undefined): void {
  emit('select-tag', typeof value === 'string' ? value : null);
}

function setMenuVisible(itemId: string, visible: boolean): void {
  openMenuItemId.value = visible ? itemId : null;
}

function openItemMenu(itemId: string): void {
  openMenuItemId.value = itemId;
}

function selectMenuItem(item: WorkItem, itemId: string): void {
  openMenuItemId.value = null;
  if (itemId === 'assign-to-new-agent') {
    emit('assign-to-new-agent', item);
  } else if (itemId === 'assign-to-bench' && props.canAssignToBench) {
    emit('assign-to-bench-agent', item);
  } else if (itemId === 'reset-assignment') {
    emit('remove-assignment', item);
  } else if (itemId === 'open') {
    window.open(item.url, '_blank', 'noreferrer');
  }
}

function selectAssignedAgent(agent: Agent | null): void {
  if (agent) {
    emit('select-assigned-agent', agent.id);
  }
}

function startDrag(event: DragEvent, item: WorkItem): void {
  event.dataTransfer?.setData('text/plain', item.url);
  event.dataTransfer?.setData('application/x-codex-claw-work-item', item.id);
  event.dataTransfer?.setDragImage?.(event.currentTarget as Element, 12, 12);
  emit('work-item-drag-start', item);
}

function endDrag(): void {
  emit('work-item-drag-end');
}

function workProviderLabel(provider: WorkIntegrationConnection['provider']): string {
  if (provider === 'github') {
    return 'GitHub';
  }
  provider satisfies never;
  return 'Integration';
}
</script>

<style scoped>
.work-backlog-panel {
  width: 288px;
  min-width: 288px;
  max-width: 288px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-10);
  border-right: 1px solid var(--color-border);
  padding: var(--space-12);
  background: var(--color-shell-sidebar);
}

.work-backlog-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
}

.work-backlog-panel__title {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.work-backlog-panel__title > svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text);
}

.work-backlog-panel__title strong,
.work-backlog-panel__title span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-backlog-panel__title strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.work-backlog-panel__title span,
.work-backlog-panel__item-assignee,
.work-backlog-panel__item-meta,
.work-backlog-panel__state {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.work-backlog-panel__refresh {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.work-backlog-panel__refresh:hover {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.work-backlog-panel__refresh:disabled {
  cursor: default;
  opacity: 0.5;
}

.work-backlog-panel__refresh svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.work-backlog-panel__filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.work-backlog-panel__select {
  width: 100%;
}

.work-backlog-panel__items {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: var(--space-8);
}

.work-backlog-panel__item {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-8) 34px var(--space-8) var(--space-8);
  background: var(--color-surface-lowest);
  cursor: grab;
}

.work-backlog-panel__item:hover {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface-lowest));
}

.work-backlog-panel__item:active {
  cursor: grabbing;
}

.work-backlog-panel__item--assigned {
  cursor: pointer;
}

.work-backlog-panel__item--completed {
  border-color: color-mix(in srgb, var(--color-success) 32%, var(--color-border));
  background: color-mix(in srgb, var(--color-success) 6%, var(--color-surface-lowest));
}

.work-backlog-panel__item--assigned:active {
  cursor: grabbing;
}

.work-backlog-panel__item-menu {
  position: absolute;
  top: var(--space-6);
  right: var(--space-6);
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.work-backlog-panel__item-menu:hover,
.work-backlog-panel__item-menu:focus-visible {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.work-backlog-panel__item-menu svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.work-backlog-panel__item-title {
  min-width: 0;
  display: grid;
  gap: var(--space-2);
}

.work-backlog-panel__item-title span {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
}

.work-backlog-panel__item-title strong {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-18);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.work-backlog-panel__item-meta {
  display: flex;
  gap: var(--space-6);
  margin-top: var(--space-6);
}

.work-backlog-panel__item-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-backlog-panel__item-assignee {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-6);
  margin-top: var(--space-6);
}

.work-backlog-panel__item-assignee span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-backlog-panel__missing-agent-icon {
  width: 18px;
  height: 18px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 50%;
  background: var(--color-surface-low);
}

.work-backlog-panel__assignee-status {
  color: var(--color-success);
  font-weight: var(--font-weight-semibold);
}

.work-backlog-panel__assignee-status[data-status='working'],
.work-backlog-panel__assignee-status[data-status='starting'],
.work-backlog-panel__assignee-status[data-status='awaitingInput'] {
  color: var(--color-warning);
}

.work-backlog-panel__assignee-status[data-status='error'] {
  color: var(--color-error);
}

.work-backlog-panel__state {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-12);
  text-align: center;
}

.work-backlog-panel__state--error {
  color: var(--color-error);
  border-color: color-mix(in srgb, var(--color-error) 35%, var(--color-border));
}
</style>

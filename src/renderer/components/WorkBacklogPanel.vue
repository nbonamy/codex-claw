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
          <span>{{ connection.accountLabel ?? 'GitHub' }}</span>
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

    <el-select
      class="work-backlog-panel__repo-select"
      :model-value="selectedRepositoryId"
      placeholder="Select repo"
      :disabled="repositories.length === 0"
      aria-label="Backlog repository"
      @update:model-value="selectRepository"
    >
      <el-option
        v-for="repository in repositories"
        :key="repository.id"
        :label="repository.fullName"
        :value="repository.id"
      />
    </el-select>

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
      v-else
      class="work-backlog-panel__items"
    >
      <article
        v-for="item in items"
        :key="item.id"
        class="work-backlog-panel__item"
        draggable="true"
        @dragstart="startDrag($event, item)"
        @dragend="emit('work-item-drag-end')"
      >
        <el-popover
          :visible="openMenuItemId === item.id"
          placement="bottom-end"
          trigger="manual"
          width="220"
          :teleported="false"
          popper-class="work-backlog-panel__menu-popover"
          @update:visible="setMenuVisible(item.id, $event)"
        >
          <template #reference>
            <button
              class="work-backlog-panel__item-menu"
              type="button"
              :aria-label="`Issue #${item.number} actions`"
              draggable="false"
              @click.stop="setMenuVisible(item.id, openMenuItemId !== item.id)"
              @dragstart.stop
            >
              <DotsVerticalIcon aria-hidden="true" />
            </button>
          </template>
          <AppMenu
            class="app-menu--embedded"
            ariaLabel="Issue actions"
            :items="menuItems"
            @select="selectMenuItem(item, $event)"
          />
        </el-popover>
        <div class="work-backlog-panel__item-title">
          <span>#{{ item.number }}</span>
          <strong>{{ item.title }}</strong>
        </div>
        <div
          v-if="item.labels.length > 0"
          class="work-backlog-panel__item-meta"
        >
          <span>{{ item.labels[0]?.name }}</span>
        </div>
      </article>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { WorkIntegrationConnection, WorkItem, WorkRepository } from '../../shared/contracts';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { DotsVerticalIcon, ExternalLinkIcon, GitHubIcon, PlusCircleIcon, RefreshIcon, SaveToBenchIcon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  canAssignToBench?: boolean;
  connection: WorkIntegrationConnection;
  error: string | null;
  items: WorkItem[];
  repositories: WorkRepository[];
  selectedRepositoryId: string | null;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
}>(), {
  canAssignToBench: true,
});

const emit = defineEmits<{
  'assign-to-bench-agent': [item: WorkItem];
  'assign-to-new-agent': [item: WorkItem];
  refresh: [repositoryId: string | null];
  'select-repository': [repositoryId: string | null];
  'work-item-drag-end': [];
  'work-item-drag-start': [item: WorkItem];
}>();

const openMenuItemId = ref<string | null>(null);

const menuItems = computed<AppMenuItem[]>(() => [
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
  { id: 'group-open', type: 'separator' },
  {
    id: 'open',
    type: 'action',
    label: 'Open',
    icon: ExternalLinkIcon,
  },
]);

function selectRepository(value: string | number | boolean | Record<string, unknown> | null | undefined): void {
  emit('select-repository', typeof value === 'string' ? value : null);
}

function setMenuVisible(itemId: string, visible: boolean): void {
  openMenuItemId.value = visible ? itemId : null;
}

function selectMenuItem(item: WorkItem, itemId: string): void {
  openMenuItemId.value = null;
  if (itemId === 'assign-to-new-agent') {
    emit('assign-to-new-agent', item);
  } else if (itemId === 'assign-to-bench' && props.canAssignToBench) {
    emit('assign-to-bench-agent', item);
  } else if (itemId === 'open') {
    window.open(item.url, '_blank', 'noreferrer');
  }
}

function startDrag(event: DragEvent, item: WorkItem): void {
  event.dataTransfer?.setData('text/plain', item.url);
  event.dataTransfer?.setData('application/x-codex-claw-work-item', item.id);
  event.dataTransfer?.setDragImage?.(event.currentTarget as Element, 12, 12);
  emit('work-item-drag-start', item);
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
  background: var(--color-surface-base);
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

.work-backlog-panel__repo-select {
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
  border-radius: var(--radius-lg);
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

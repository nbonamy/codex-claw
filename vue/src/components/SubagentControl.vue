<template>
  <div ref="root" class="subagent-control">
    <button
      class="subagent-control__trigger"
      type="button"
      :aria-label="triggerLabel"
      :title="triggerLabel"
      :aria-expanded="menuOpen"
      @click.stop="menuOpen = !menuOpen"
    >
      <IconLego aria-hidden="true" />
      <span v-if="activeCount > 0" class="subagent-control__count" aria-hidden="true">{{ activeCount }}</span>
    </button>

    <section
      v-if="menuOpen"
      class="subagent-control__menu"
      role="menu"
      :aria-label="t('chat.subagents.label')"
    >
      <header class="subagent-control__menu-header">
        <strong>{{ t('chat.subagents.label') }}</strong>
        <span>{{ statusSummary }}</span>
      </header>
      <button
        v-for="entry in flattenedNodes"
        :key="entry.node.conversationId"
        class="subagent-control__row"
        :class="{ 'subagent-control__row--selected': entry.node.conversationId === selectedConversationId }"
        :style="{ '--subagent-depth': String(entry.depth) }"
        type="button"
        role="menuitem"
        @click="selectSubagent(entry.node.conversationId)"
      >
        <span
          class="subagent-control__status"
          :data-status="entry.node.status"
          aria-hidden="true"
        />
        <strong class="subagent-control__name">{{ nodeLabel(entry.node) }}</strong>
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconLego } from '@tabler/icons-vue';
import { useI18n } from 'vue-i18n';
import type { AgentSubagentTree, SubagentNode } from '@codex-claw/core/contracts';

const props = defineProps<{
  tree: AgentSubagentTree;
  selectedConversationId?: string | null;
}>();

const emit = defineEmits<{
  select: [conversationId: string];
}>();

const { t } = useI18n();

const root = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const nodes = computed(() => Object.values(props.tree.nodes).filter((node) => (
  node.conversationId !== props.tree.rootConversationId
)));
const activeCount = computed(() => nodes.value.filter((node) => node.status === 'running' || node.status === 'pendingInit').length);
const triggerLabel = computed(() => activeCount.value > 0
  ? t('chat.subagents.triggerActive', { count: activeCount.value })
  : t('chat.subagents.label'));
const statusSummary = computed(() => activeCount.value > 0
  ? t('chat.subagents.activeCount', { count: activeCount.value })
  : t('chat.subagents.totalCount', { count: nodes.value.length }));
const flattenedNodes = computed(() => flattenNodes(props.tree));

onMounted(() => document.addEventListener('click', closeMenuOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeMenuOnOutsideClick));

function selectSubagent(conversationId: string): void {
  menuOpen.value = false;
  emit('select', conversationId);
}

function closeMenuOnOutsideClick(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) menuOpen.value = false;
}

function nodeLabel(node: SubagentNode): string {
  const pathLabel = node.agentPath?.split('/').filter(Boolean).at(-1)?.trim();
  return pathLabel || t('chat.subagents.unnamed');
}

function flattenNodes(tree: AgentSubagentTree): Array<{ node: SubagentNode; depth: number }> {
  const nodesByParent = new Map<string, SubagentNode[]>();
  for (const node of Object.values(tree.nodes)) {
    if (node.conversationId === tree.rootConversationId) continue;
    const children = nodesByParent.get(node.parentConversationId) ?? [];
    children.push(node);
    nodesByParent.set(node.parentConversationId, children);
  }
  for (const children of nodesByParent.values()) {
    children.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  const result: Array<{ node: SubagentNode; depth: number }> = [];
  const visited = new Set<string>();
  const visit = (parentConversationId: string, depth: number) => {
    for (const node of nodesByParent.get(parentConversationId) ?? []) {
      if (visited.has(node.conversationId)) continue;
      visited.add(node.conversationId);
      result.push({ node, depth: Math.min(depth, 3) });
      visit(node.conversationId, depth + 1);
    }
  };
  visit(tree.rootConversationId, 0);
  for (const node of Object.values(tree.nodes)) {
    if (node.conversationId === tree.rootConversationId) continue;
    if (visited.has(node.conversationId)) continue;
    visited.add(node.conversationId);
    result.push({ node, depth: 0 });
    visit(node.conversationId, 1);
  }
  return result;
}
</script>

<style scoped>
.subagent-control {
  position: relative;
  -webkit-app-region: no-drag;
}

.subagent-control__trigger {
  position: relative;
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  place-items: center;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.subagent-control__trigger:hover,
.subagent-control__trigger[aria-expanded='true'] {
  color: var(--color-text);
  background: var(--color-surface-high);
}

.subagent-control__trigger svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.subagent-control__count {
  position: absolute;
  top: -2px;
  right: -3px;
  min-width: 16px;
  height: 16px;
  padding: 0 var(--space-1);
  border: 2px solid var(--color-shell-main);
  border-radius: var(--radius-full);
  color: var(--color-on-primary);
  background: var(--color-primary);
  font-size: var(--font-size-10);
  font-weight: var(--font-weight-bold);
  line-height: 12px;
}

.subagent-control__menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + var(--space-2));
  right: 0;
  display: flex;
  width: 300px;
  max-height: min(420px, calc(100vh - var(--workbench-appbar-height) - var(--space-8)));
  padding: var(--space-2);
  flex-direction: column;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-menu);
}

.subagent-control__menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.subagent-control__menu-header strong {
  color: var(--color-text);
  font-size: var(--font-size-13);
}

.subagent-control__row {
  --subagent-depth: 0;

  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  padding-left: calc(var(--space-4) + var(--subagent-depth) * var(--space-8));
  border: 0;
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.subagent-control__row:hover,
.subagent-control__row--selected {
  background: var(--color-surface-low);
}

.subagent-control__status {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-outline);
}

.subagent-control__status[data-status='running'],
.subagent-control__status[data-status='pendingInit'] {
  background: var(--color-warning);
}

.subagent-control__status[data-status='completed'] {
  background: var(--color-success);
}

.subagent-control__status[data-status='errored'],
.subagent-control__status[data-status='notFound'] {
  background: var(--color-error);
}

.subagent-control__name {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

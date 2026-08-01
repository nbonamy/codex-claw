<template>
  <section class="git-review-panel" aria-label="GitHub review">
    <header class="git-review-panel__toolbar">
      <div class="git-review-panel__summary">
        <div class="git-review-panel__repository">
          <GitHubIcon aria-hidden="true" />
          <strong>{{ repositoryName }}</strong>
        </div>
        <div class="git-review-panel__branch">
          <span>{{ gitStatus?.branch ?? 'Working tree' }}</span>
          <span v-if="gitStatus?.upstream" aria-hidden="true">→</span>
          <span v-if="gitStatus?.upstream" class="git-review-panel__upstream">{{ gitStatus.upstream }}</span>
        </div>
      </div>

      <div class="git-review-panel__stats" aria-label="Diff statistics">
        <span class="git-review-panel__added">+{{ gitStatus?.addedLines ?? 0 }}</span>
        <span class="git-review-panel__removed">-{{ gitStatus?.removedLines ?? 0 }}</span>
      </div>

      <div ref="actionsRoot" class="git-review-panel__actions">
        <button type="button" aria-label="Refresh repository diff" title="Refresh" @click="emit('refresh')">
          <RefreshIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Review options"
          title="Review options"
          :aria-expanded="menuOpen"
          @click.stop="menuOpen = !menuOpen"
        >
          <DotsVerticalIcon aria-hidden="true" />
        </button>
        <AppMenu
          v-if="menuOpen"
          class="git-review-panel__menu"
          ariaLabel="Review options"
          :items="menuItems"
          @select="selectMenuItem"
        />
      </div>
    </header>

    <GitDiffPreviewPanel
      :collapse-all-signal="collapseAllSignal"
      :diff="panel.diff"
      :error="panel.error"
      :expand-all-signal="expandAllSignal"
      :state="panel.state"
      :word-wrap="wordWrap"
      @all-expanded-change="allExpanded = $event"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Agent, AgentGitStatus } from '@codex-claw/shared/contracts';
import { DotsVerticalIcon, GitHubIcon, ListDetailsIcon, RefreshIcon, TextWrapDisabledIcon, TextWrapIcon } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
import type { SidePanelGitDiffState } from './side-panel';

const props = defineProps<{
  agent: Agent;
  gitStatus?: AgentGitStatus | null;
  panel: SidePanelGitDiffState;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const actionsRoot = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const wordWrap = ref(false);
const allExpanded = ref(true);
const expandAllSignal = ref(0);
const collapseAllSignal = ref(0);
const repositoryName = computed(() => fileBasename(props.gitStatus?.folder ?? props.agent.folder));
const menuItems = computed<AppMenuItem[]>(() => [
  {
    id: 'word-wrap',
    type: 'checkbox',
    label: 'Word wrap',
    icon: wordWrap.value ? TextWrapIcon : TextWrapDisabledIcon,
    checked: wordWrap.value,
  },
  {
    id: allExpanded.value ? 'collapse-all' : 'expand-all',
    type: 'action',
    label: allExpanded.value ? 'Collapse all' : 'Expand all',
    icon: ListDetailsIcon,
  },
]);

onMounted(() => document.addEventListener('click', closeMenuOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeMenuOnOutsideClick));

function selectMenuItem(itemId: string): void {
  menuOpen.value = false;
  if (itemId === 'word-wrap') {
    wordWrap.value = !wordWrap.value;
  } else if (itemId === 'expand-all') {
    expandAllSignal.value += 1;
  } else if (itemId === 'collapse-all') {
    collapseAllSignal.value += 1;
  }
}

function closeMenuOnOutsideClick(event: MouseEvent): void {
  if (!actionsRoot.value?.contains(event.target as Node)) {
    menuOpen.value = false;
  }
}

function fileBasename(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.at(-1) ?? path;
}
</script>

<style scoped>
.git-review-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-surface-lowest);
}

.git-review-panel__toolbar {
  min-height: 56px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-8);
  border-bottom: 1px solid var(--color-border);
}

.git-review-panel__summary {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.git-review-panel__repository,
.git-review-panel__branch,
.git-review-panel__stats,
.git-review-panel__actions {
  display: flex;
  align-items: center;
}

.git-review-panel__repository {
  gap: var(--space-3);
  min-width: 0;
}

.git-review-panel__repository svg {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
}

.git-review-panel__repository strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
}

.git-review-panel__branch {
  gap: var(--space-2);
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
  white-space: nowrap;
}

.git-review-panel__upstream {
  overflow: hidden;
  text-overflow: ellipsis;
}

.git-review-panel__stats {
  gap: var(--space-2);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
}

.git-review-panel__added { color: var(--color-success); }
.git-review-panel__removed { color: var(--color-error); }

.git-review-panel__actions {
  position: relative;
  gap: var(--space-1);
}

.git-review-panel__actions > button {
  display: grid;
  place-items: center;
  width: var(--space-12);
  height: var(--space-12);
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.git-review-panel__actions > button:hover,
.git-review-panel__actions > button[aria-expanded='true'] {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.git-review-panel__actions svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.git-review-panel__menu {
  position: absolute;
  z-index: 10;
  top: calc(100% + var(--space-2));
  right: 0;
}
</style>

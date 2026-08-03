<template>
  <aside class="right-workspace-panel" aria-label="Right workspace">
    <header class="right-workspace-panel__tabs">
      <div class="right-workspace-panel__tab-list" role="tablist" aria-label="Right workspace tabs">
        <div
          v-for="tab in tabs"
          :key="tab"
          class="right-workspace-panel__tab"
          :class="{ 'right-workspace-panel__tab--active': activeTab === tab }"
        >
          <button
            class="right-workspace-panel__tab-select"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab"
            @click="emit('selectTab', tab)"
          >
            <GitHubIcon v-if="tab === 'review'" aria-hidden="true" />
            <IconWorld v-else-if="tab === 'browser'" aria-hidden="true" />
            <FileDiffIcon v-else-if="diffPanel(tab)" aria-hidden="true" />
            <FileTextIcon v-else-if="filePanel(tab)?.kind === 'markdown'" aria-hidden="true" />
            <CodeIcon v-else aria-hidden="true" />
            <span>{{ tabLabel(tab) }}</span>
          </button>
          <button
            class="right-workspace-panel__tab-close"
            type="button"
            :aria-label="`Close ${tabLabel(tab)} tab`"
            @click="emit('closeTab', tab)"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref="addMenuRoot" class="right-workspace-panel__add">
        <button
          type="button"
          aria-label="Open right workspace tab"
          title="New tab"
          :aria-expanded="addMenuOpen"
          @click.stop="addMenuOpen = !addMenuOpen"
        >
          <PlusIcon aria-hidden="true" />
        </button>
        <AppMenu
          v-if="addMenuOpen"
          class="right-workspace-panel__add-menu"
          ariaLabel="Open right workspace tab"
          :items="addMenuItems"
          @select="openTabFromMenu"
        />
      </div>
    </header>

    <nav
      v-if="tabs.length === 0"
      class="right-workspace-panel__launcher"
      aria-label="Open a workspace tab"
    >
      <button type="button" @click="emit('openTab', 'review')">
        <GitHubIcon aria-hidden="true" />
        <span>Review</span>
        <kbd>⌘G</kbd>
      </button>
      <button type="button" @click="emit('openTab', 'browser')">
        <IconWorld aria-hidden="true" />
        <span>Browser</span>
        <kbd>⌘B</kbd>
      </button>
    </nav>

    <GitReviewPanel
      v-if="tabs.includes('review')"
      v-show="activeTab === 'review'"
      :agent="agent"
      :git-status="gitStatus"
      :panel="gitPanel"
      @refresh="emit('refreshGitDiff')"
    />

    <BrowserPanel
      v-if="tabs.includes('browser')"
      v-show="activeTab === 'browser'"
      :agent-id="agent.id"
      :browser-id="browserId"
      :initial-url="browserInitialUrl"
      :open-request-id="browserOpenRequestId"
      :visible="visible && activeTab === 'browser'"
      @close="emit('closeTab', 'browser')"
      @send-prompt="emit('sendPrompt', $event)"
    />

    <div
      v-for="tab in fileTabs"
      :key="tab"
      v-show="activeTab === tab"
      class="right-workspace-panel__file-preview"
    >
      <MarkdownPanel
        v-if="markdownFilePanel(tab)"
        :content="markdownFilePanel(tab)?.content ?? ''"
        :error="markdownFilePanel(tab)?.error"
        :state="markdownFilePanel(tab)?.state"
      />
      <SourcePreviewPanel
        v-else-if="sourceFilePanel(tab)"
        :content="sourceFilePanel(tab)?.content ?? ''"
        :error="sourceFilePanel(tab)?.error"
        :language="sourceFilePanel(tab)?.language"
        :state="sourceFilePanel(tab)?.state"
      />
    </div>

    <div
      v-for="tab in diffTabs"
      :key="tab"
      v-show="activeTab === tab"
      class="right-workspace-panel__file-preview"
    >
      <GitDiffPreviewPanel
        :diff="diffPanel(tab)?.diff ?? ''"
        :error="diffPanel(tab)?.error"
        :state="diffPanel(tab)?.state"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconWorld } from '@tabler/icons-vue';
import type { Agent, AgentGitStatus } from '@codex-claw/shared/contracts';
import { CodeIcon, FileDiffIcon, FileTextIcon, GitHubIcon, PlusIcon, X } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import BrowserPanel from './BrowserPanel.vue';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
import GitReviewPanel from './GitReviewPanel.vue';
import MarkdownPanel from './MarkdownPanel.vue';
import SourcePreviewPanel from './SourcePreviewPanel.vue';
import type { SidePanelGitDiffState, SidePanelMarkdownState, SidePanelSourceState } from './side-panel';
import {
  isRightWorkspaceDiffTab,
  isRightWorkspaceFileTab,
  type RightWorkspaceDiffPanel,
  type RightWorkspaceDiffTab,
  type RightWorkspaceFilePanel,
  type RightWorkspaceFileTab,
  type RightWorkspaceTab,
} from './right-workspace';

const props = defineProps<{
  activeTab: RightWorkspaceTab | null;
  agent: Agent;
  gitPanel: SidePanelGitDiffState;
  gitStatus?: AgentGitStatus | null;
  diffPanels?: Partial<Record<RightWorkspaceDiffTab, RightWorkspaceDiffPanel>>;
  filePanels?: Partial<Record<RightWorkspaceFileTab, RightWorkspaceFilePanel>>;
  tabs: RightWorkspaceTab[];
  visible?: boolean;
  browserId?: string;
  browserInitialUrl?: string;
  browserOpenRequestId?: number;
}>();

const emit = defineEmits<{
  closeTab: [tab: RightWorkspaceTab];
  openTab: [tab: RightWorkspaceTab];
  refreshGitDiff: [];
  selectTab: [tab: RightWorkspaceTab];
  sendPrompt: [prompt: string];
}>();

const addMenuRoot = ref<HTMLElement | null>(null);
const addMenuOpen = ref(false);
const fileTabs = computed(() => props.tabs.filter(isRightWorkspaceFileTab));
const diffTabs = computed(() => props.tabs.filter(isRightWorkspaceDiffTab));
const addMenuItems = computed<AppMenuItem[]>(() => [
  { id: 'review', type: 'action', label: 'GitHub Review', icon: GitHubIcon },
  { id: 'browser', type: 'action', label: 'Browser', icon: IconWorld },
]);

onMounted(() => document.addEventListener('click', closeAddMenuOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeAddMenuOnOutsideClick));

function tabLabel(tab: RightWorkspaceTab): string {
  if (tab === 'review') return 'Review';
  if (tab === 'browser') return 'Browser';
  if (diffPanel(tab)) return diffPanel(tab)?.title ?? 'Diff';
  return filePanel(tab)?.title ?? 'File';
}

function diffPanel(tab: RightWorkspaceTab): RightWorkspaceDiffPanel | undefined {
  return isRightWorkspaceDiffTab(tab) ? props.diffPanels?.[tab] : undefined;
}

function filePanel(tab: RightWorkspaceTab): RightWorkspaceFilePanel | undefined {
  return isRightWorkspaceFileTab(tab) ? props.filePanels?.[tab] : undefined;
}

function markdownFilePanel(tab: RightWorkspaceFileTab): SidePanelMarkdownState | null {
  const panel = filePanel(tab);
  return panel?.kind === 'markdown' ? panel : null;
}

function sourceFilePanel(tab: RightWorkspaceFileTab): SidePanelSourceState | null {
  const panel = filePanel(tab);
  return panel?.kind === 'source' ? panel : null;
}

function openTabFromMenu(tab: string): void {
  addMenuOpen.value = false;
  if (tab === 'review' || tab === 'browser') {
    emit('openTab', tab);
  }
}

function closeAddMenuOnOutsideClick(event: MouseEvent): void {
  if (!addMenuRoot.value?.contains(event.target as Node)) {
    addMenuOpen.value = false;
  }
}
</script>

<style scoped>
.right-workspace-panel {
  flex: 0 0 420px;
  order: 2;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-shell-main);
}

.right-workspace-panel__tabs {
  flex: 0 0 40px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-shell-main);
}

.right-workspace-panel__tab-list {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
}

.right-workspace-panel__tab {
  min-width: 0;
  max-width: 176px;
  display: flex;
  align-items: center;
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  background: transparent;
}

.right-workspace-panel__tab--active {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.right-workspace-panel__tab-select,
.right-workspace-panel__tab-close,
.right-workspace-panel__add > button {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.right-workspace-panel__tab-select {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  font-size: var(--font-size-13);
}

.right-workspace-panel__tab-select span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right-workspace-panel__tab-select svg,
.right-workspace-panel__tab-close svg,
.right-workspace-panel__add svg {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
}

.right-workspace-panel__tab-close {
  display: grid;
  place-items: center;
  width: var(--space-12);
  height: var(--space-12);
  margin-right: var(--space-2);
  padding: 0;
  border-radius: var(--radius-full);
}

.right-workspace-panel__tab-close:hover,
.right-workspace-panel__add > button:hover,
.right-workspace-panel__add > button[aria-expanded='true'] {
  color: var(--color-text);
  background: var(--color-surface-high);
}

.right-workspace-panel__add {
  position: relative;
  flex: 0 0 auto;
}

.right-workspace-panel__add > button {
  display: grid;
  place-items: center;
  width: var(--space-16);
  height: var(--space-16);
  padding: 0;
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
}

.right-workspace-panel__add-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + var(--space-3));
  right: 0;
}

.right-workspace-panel__launcher {
  width: min(100%, 360px);
  display: grid;
  gap: var(--space-6);
  margin: auto;
  padding: var(--space-12);
}

.right-workspace-panel__launcher > button {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--icon-lg) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border: 0;
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.right-workspace-panel__launcher > button:hover,
.right-workspace-panel__launcher > button:focus-visible {
  background: var(--color-surface-low);
}

.right-workspace-panel__launcher svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
  color: var(--color-text-muted);
}

.right-workspace-panel__launcher span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-16);
}

.right-workspace-panel__launcher kbd {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  font-family: var(--font-family-base);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
}

.right-workspace-panel__file-preview {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
</style>

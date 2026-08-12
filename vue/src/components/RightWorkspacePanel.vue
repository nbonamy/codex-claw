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
            <IconListDetails v-if="tab === 'backlog'" aria-hidden="true" />
            <GitHubIcon v-else-if="tab === 'review'" aria-hidden="true" />
            <IconWorld v-else-if="tab === 'browser'" aria-hidden="true" />
            <FoldersIcon v-else-if="tab === 'files'" aria-hidden="true" />
            <FileTextIcon v-else-if="tab === 'plan'" aria-hidden="true" />
            <IconLego v-else-if="isRightWorkspaceSubagentTab(tab)" aria-hidden="true" />
            <FileDiffIcon v-else-if="diffPanel(tab)" aria-hidden="true" />
            <PhotoIcon v-else-if="imagePanel(tab)" aria-hidden="true" />
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

      <OpenInControl
        v-if="activeProjectFilePath && openInAvailable && openInCatalog && openInCatalog.applications.length > 0"
        :application="effectiveOpenInApplication(agent, openInCatalog)"
        :catalog="openInCatalog"
        variant="compact"
        @open="emit('openIn', { application: $event, filePath: activeProjectFilePath })"
      />

      <button
        v-if="fileExplorerToggleVisible"
        class="right-workspace-panel__files-toggle"
        type="button"
        :aria-label="filesPaneOpen ? 'Collapse file explorer' : 'Show file explorer'"
        :aria-pressed="filesPaneOpen"
        @click="emit('toggleFilesPane')"
      >
        <IconLayoutSidebarRightCollapse v-if="filesPaneOpen" aria-hidden="true" />
        <IconLayoutSidebarRightExpand v-else aria-hidden="true" />
      </button>

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

    <div ref="bodyRoot" class="right-workspace-panel__body">
      <div class="right-workspace-panel__content">

        <nav
      v-if="tabs.length === 0"
      class="right-workspace-panel__launcher"
      aria-label="Open a workspace tab"
    >
      <button v-if="githubRepository" type="button" @click="emit('openTab', 'backlog')">
        <IconListDetails aria-hidden="true" />
        <span>Backlog</span>
      </button>
      <button type="button" @click="emit('openTab', 'review')">
        <GitHubIcon aria-hidden="true" />
        <span>Review</span>
        <kbd>⌘G</kbd>
      </button>
      <button v-if="browserAvailable" type="button" @click="emit('openTab', 'browser')">
        <IconWorld aria-hidden="true" />
        <span>Browser</span>
        <kbd>⌘B</kbd>
      </button>
      <button type="button" @click="emit('openTab', 'files')">
        <FoldersIcon aria-hidden="true" />
        <span>Files</span>
        <kbd>⌘P</kbd>
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

    <RepositoryBacklogPanel
      v-if="tabs.includes('backlog') && githubRepository && prefillRepositoryWork && startRepositoryWork"
      v-show="activeTab === 'backlog'"
      :agent="agent"
      :assignments="workAssignments"
      :branch="gitStatus?.branch"
      :connection="githubConnection"
      :error="backlogError"
      :items="backlogItems"
      :repository-id="githubRepository"
      :prefill-action="prefillRepositoryWork"
      :status="backlogStatus"
      :start-work-action="startRepositoryWork"
      :visible="visible && activeTab === 'backlog'"
      @refresh="emit('refreshBacklog')"
    />

    <BrowserPanel
      v-if="browserAvailable && tabs.includes('browser')"
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
          v-if="tabs.includes('files')"
          v-show="activeTab === 'files'"
          class="right-workspace-panel__open-file"
        >
          <span>Select a file from the explorer.</span>
        </div>

    <PlanReviewPanel
      v-if="tabs.includes('plan') && planPanel"
      v-show="activeTab === 'plan'"
      :panel="planPanel"
      :plan-updating="planUpdating"
      @cancel-plan="emit('cancelPlan')"
      @comment-plan="emit('commentPlan', $event)"
      @confirm-plan="emit('confirmPlan')"
    />

    <template v-if="subagentTree && loadSubagentMessages">
      <SubagentPanel
        v-for="tab in subagentTabs"
        :key="tab"
        v-show="activeTab === tab"
        :agents="agents"
        :tree="subagentTree"
        :conversation-id="rightWorkspaceSubagentConversationId(tab)"
        :visible="visible && activeTab === tab"
        :load-messages="loadSubagentMessages"
        @open-link="emit('openLink', $event)"
      />
    </template>

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

        <div
      v-for="tab in imageTabs"
      :key="tab"
      v-show="activeTab === tab"
      class="right-workspace-panel__file-preview"
    >
      <ImagePreviewPanel :panel="imagePanel(tab)!" />
        </div>
      </div>

      <Transition name="right-workspace-files">
        <div
          v-if="fileExplorerVisible"
          class="right-workspace-panel__files-shell"
          :style="{
            flexBasis: `${visualFilesPaneWidth}px`,
            width: `${visualFilesPaneWidth}px`,
          }"
        >
          <div
            class="right-workspace-panel__files-resizer"
            role="separator"
            aria-label="Resize file explorer"
            aria-orientation="vertical"
            tabindex="0"
            @pointerdown="startFilesPaneResize"
            @keydown.left.prevent="resizeFilesPane(visualFilesPaneWidth + 16)"
            @keydown.right.prevent="resizeFilesPane(visualFilesPaneWidth - 16)"
          />
          <FileExplorerPanel
            class="right-workspace-panel__files-pane"
            :files="files ?? []"
            :loading="filesLoading"
            :error="filesError"
            @preview="emit('previewFile', $event)"
          />
        </div>
      </Transition>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand, IconLego, IconListDetails, IconWorld } from '@tabler/icons-vue';
import type { Agent, AgentFileSearchItem, AgentGitStatus, AgentSubagentTree, OpenInApplication, OpenInApplicationCatalog, RendererMessage, WorkBacklogAssignment, WorkIntegrationConnection, WorkItem } from '@codex-claw/core/contracts';
import type { CodexConversationLink } from '@codex-app-sdk/vue';
import { CodeIcon, FileDiffIcon, FileTextIcon, FoldersIcon, GitHubIcon, PhotoIcon, PlusIcon, X } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import OpenInControl from '../shared/OpenInControl.vue';
import { effectiveOpenInApplication } from '../shared/open-in';
import BrowserPanel from './BrowserPanel.vue';
import FileExplorerPanel from './FileExplorerPanel.vue';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
import GitReviewPanel from './GitReviewPanel.vue';
import ImagePreviewPanel from './ImagePreviewPanel.vue';
import MarkdownPanel from './MarkdownPanel.vue';
import PlanReviewPanel from './PlanReviewPanel.vue';
import RepositoryBacklogPanel from './RepositoryBacklogPanel.vue';
import SourcePreviewPanel from './SourcePreviewPanel.vue';
import SubagentPanel from './SubagentPanel.vue';
import type { PlanReviewComment, SidePanelGitDiffState, SidePanelMarkdownState, SidePanelSourceState } from './side-panel';
import {
  isRightWorkspaceDiffTab,
  isRightWorkspaceFileTab,
  isRightWorkspaceImageTab,
  isRightWorkspaceSubagentTab,
  rightWorkspaceSubagentConversationId,
  type RightWorkspaceDiffPanel,
  type RightWorkspaceDiffTab,
  type RightWorkspaceFilePanel,
  type RightWorkspaceFileTab,
  type RightWorkspaceImagePanel,
  type RightWorkspaceImageTab,
  type RightWorkspaceSubagentTab,
  type RightWorkspaceTab,
} from './right-workspace';

const props = withDefaults(defineProps<{
  activeTab: RightWorkspaceTab | null;
  agent: Agent;
  agents?: readonly Agent[];
  files?: AgentFileSearchItem[];
  filesLoading?: boolean;
  filesError?: string | null;
  filesPaneOpen?: boolean;
  filesPaneWidth?: number;
  gitPanel: SidePanelGitDiffState;
  gitStatus?: AgentGitStatus | null;
  planPanel?: SidePanelMarkdownState | null;
  planUpdating?: boolean;
  diffPanels?: Partial<Record<RightWorkspaceDiffTab, RightWorkspaceDiffPanel>>;
  filePanels?: Partial<Record<RightWorkspaceFileTab, RightWorkspaceFilePanel>>;
  imagePanels?: Partial<Record<RightWorkspaceImageTab, RightWorkspaceImagePanel>>;
  tabs: RightWorkspaceTab[];
  visible?: boolean;
  browserId?: string;
  browserInitialUrl?: string;
  browserOpenRequestId?: number;
  browserAvailable?: boolean;
  openInAvailable?: boolean;
  openInCatalog?: OpenInApplicationCatalog;
  subagentTree?: AgentSubagentTree | null;
  loadSubagentMessages?: (conversationId: string) => Promise<RendererMessage[]>;
  backlogItems?: WorkItem[];
  backlogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  backlogError?: string | null;
  githubRepository?: string | null;
  githubConnection?: WorkIntegrationConnection | null;
  workAssignments?: Record<string, WorkBacklogAssignment>;
  prefillRepositoryWork?: (item: WorkItem) => void;
  startRepositoryWork?: (input: import('./right-workspace').RepositoryWorkStartInput) => Promise<void>;
}>(), {
  filesPaneWidth: 280,
  backlogItems: () => [],
  backlogStatus: 'notLoaded',
  backlogError: null,
  githubRepository: null,
  githubConnection: null,
  workAssignments: () => ({}),
});

const emit = defineEmits<{
  closeTab: [tab: RightWorkspaceTab];
  cancelPlan: [];
  commentPlan: [comments: PlanReviewComment[]];
  confirmPlan: [];
  openTab: [tab: RightWorkspaceTab];
  openIn: [payload: { application: OpenInApplication; filePath: string }];
  openLink: [link: CodexConversationLink];
  refreshGitDiff: [];
  refreshBacklog: [];
  selectTab: [tab: RightWorkspaceTab];
  sendPrompt: [prompt: string];
  previewFile: [path: string];
  toggleFilesPane: [];
  resizeFilesPane: [width: number];
}>();

const addMenuRoot = ref<HTMLElement | null>(null);
const bodyRoot = ref<HTMLElement | null>(null);
const addMenuOpen = ref(false);
const visualFilesPaneWidth = ref(props.filesPaneWidth);
const fileTabs = computed(() => props.tabs.filter(isRightWorkspaceFileTab));
const diffTabs = computed(() => props.tabs.filter(isRightWorkspaceDiffTab));
const imageTabs = computed(() => props.tabs.filter(isRightWorkspaceImageTab));
const subagentTabs = computed<RightWorkspaceSubagentTab[]>(() => props.tabs.filter(isRightWorkspaceSubagentTab));
const fileExplorerToggleVisible = computed(() => (
  props.activeTab === 'files'
  || (props.activeTab !== null && isRightWorkspaceFileTab(props.activeTab))
));
const fileExplorerVisible = computed(() => props.filesPaneOpen && fileExplorerToggleVisible.value);
const activeProjectFilePath = computed(() => {
  if (!props.activeTab) return null;
  const filePath = (isRightWorkspaceFileTab(props.activeTab)
    ? filePanel(props.activeTab)?.subtitle
    : isRightWorkspaceImageTab(props.activeTab)
      ? imagePanel(props.activeTab)?.path
      : isRightWorkspaceDiffTab(props.activeTab)
        ? diffPanel(props.activeTab)?.subtitle
        : null)?.trim();
  if (!filePath || isAbsoluteFilePath(filePath)) return null;
  return filePath;
});
const addMenuItems = computed<AppMenuItem[]>(() => [
  ...(props.githubRepository ? [{ id: 'backlog', type: 'action', label: 'Backlog', icon: IconListDetails } satisfies AppMenuItem] : []),
  { id: 'review', type: 'action', label: 'GitHub Review', icon: GitHubIcon },
  ...(props.browserAvailable ? [{ id: 'browser', type: 'action', label: 'Browser', icon: IconWorld } satisfies AppMenuItem] : []),
  { id: 'files', type: 'action', label: 'Files', icon: FoldersIcon },
]);

watch(() => props.filesPaneWidth, (width) => {
  visualFilesPaneWidth.value = width;
});

onMounted(() => document.addEventListener('click', closeAddMenuOnOutsideClick));
onBeforeUnmount(() => {
  document.removeEventListener('click', closeAddMenuOnOutsideClick);
  stopFilesPaneResize();
});

function startFilesPaneResize(event: PointerEvent): void {
  event.preventDefault();
  document.addEventListener('pointermove', handleFilesPaneResize);
  document.addEventListener('pointerup', stopFilesPaneResize, { once: true });
}

function handleFilesPaneResize(event: PointerEvent): void {
  const body = bodyRoot.value;
  if (!body) return;
  resizeFilesPane(body.getBoundingClientRect().right - event.clientX);
}

function resizeFilesPane(width: number): void {
  const bodyWidth = bodyRoot.value?.getBoundingClientRect().width ?? 420;
  const nextWidth = Math.round(Math.min(Math.max(width, 180), Math.max(180, bodyWidth - 160)));
  visualFilesPaneWidth.value = nextWidth;
  emit('resizeFilesPane', nextWidth);
}

function stopFilesPaneResize(): void {
  document.removeEventListener('pointermove', handleFilesPaneResize);
}

function tabLabel(tab: RightWorkspaceTab): string {
  if (tab === 'backlog') return 'Backlog';
  if (tab === 'review') return 'Review';
  if (tab === 'browser') return 'Browser';
  if (tab === 'files') return 'Open file';
  if (tab === 'plan') return props.planPanel?.title ?? 'Plan';
  if (isRightWorkspaceSubagentTab(tab)) {
    const node = props.subagentTree?.nodes[rightWorkspaceSubagentConversationId(tab)];
    return node?.agentNickname?.trim()
      || node?.agentPath?.split('/').filter(Boolean).at(-1)?.trim()
      || 'Subagent';
  }
  if (diffPanel(tab)) return diffPanel(tab)?.title ?? 'Diff';
  if (imagePanel(tab)) return imagePanel(tab)?.title ?? 'Image';
  return filePanel(tab)?.title ?? 'File';
}

function diffPanel(tab: RightWorkspaceTab): RightWorkspaceDiffPanel | undefined {
  return isRightWorkspaceDiffTab(tab) ? props.diffPanels?.[tab] : undefined;
}

function filePanel(tab: RightWorkspaceTab): RightWorkspaceFilePanel | undefined {
  return isRightWorkspaceFileTab(tab) ? props.filePanels?.[tab] : undefined;
}

function imagePanel(tab: RightWorkspaceTab): RightWorkspaceImagePanel | undefined {
  return isRightWorkspaceImageTab(tab) ? props.imagePanels?.[tab] : undefined;
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
  if ((tab === 'backlog' && props.githubRepository) || tab === 'review' || tab === 'files' || (tab === 'browser' && props.browserAvailable)) {
    emit('openTab', tab);
  }
}

function closeAddMenuOnOutsideClick(event: MouseEvent): void {
  if (!addMenuRoot.value?.contains(event.target as Node)) {
    addMenuOpen.value = false;
  }
}

function isAbsoluteFilePath(filePath: string): boolean {
  return filePath.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(filePath);
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
.right-workspace-panel__files-toggle,
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
.right-workspace-panel__files-toggle svg,
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
.right-workspace-panel__files-toggle:hover,
.right-workspace-panel__add > button:hover,
.right-workspace-panel__add > button[aria-expanded="true"] {
  color: var(--color-text);
  background: var(--color-surface-high);
}

.right-workspace-panel__files-toggle {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: var(--space-16);
  height: var(--space-16);
  padding: 0;
  border: 0;
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.right-workspace-panel__files-toggle[aria-pressed="true"] {
  color: var(--color-text);
  background: var(--color-surface-low);
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

.right-workspace-panel__body {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
}

.right-workspace-panel__content {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.right-workspace-panel__files-shell {
  min-width: 0;
  max-width: calc(100% - 160px);
  flex: 0 0 auto;
  display: flex;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.right-workspace-panel__files-pane {
  min-width: 0;
  flex: 1 1 auto;
}

.right-workspace-files-enter-active,
.right-workspace-files-leave-active {
  transition:
    flex-basis 180ms ease,
    width 180ms ease,
    max-width 180ms ease,
    opacity 140ms ease,
    transform 180ms ease;
}

.right-workspace-files-enter-from,
.right-workspace-files-leave-to {
  flex-basis: 0 !important;
  width: 0 !important;
  min-width: 0;
  max-width: 0;
  opacity: 0;
  transform: translateX(8px);
}

@media (prefers-reduced-motion: reduce) {
  .right-workspace-files-enter-active,
  .right-workspace-files-leave-active {
    transition-duration: 1ms;
  }
}

.right-workspace-panel__files-resizer {
  position: relative;
  z-index: 1;
  flex: 0 0 5px;
  margin-left: 0px;
  border-left: 0.75px solid var(--color-border);
  cursor: col-resize;
}

.right-workspace-panel__files-resizer:hover,
.right-workspace-panel__files-resizer:focus-visible {
  border-left-color: var(--color-primary);
  outline: 0;
}

.right-workspace-panel__open-file {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
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
  min-width: 0;
  min-height: 0;
  display: flex;
}
</style>

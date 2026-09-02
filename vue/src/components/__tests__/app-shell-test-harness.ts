import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import type {
  CodexConversationPaneActions,
  CodexConversationPaneController,
  CodexConversationPaneState,
  CodexNativeAttachment,
} from '@codex-app-sdk/vue';
import { defineComponent, nextTick } from 'vue';
import { expect, vi } from 'vitest';
import AppShell from '../AppShell.vue';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { Agent, AgentFilePreviewResult, AgentFileSearchItem, AppSnapshot, BackendConversationRef, BenchLocation, BenchTemplate, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateTeamInput, DeployBenchTemplateInput, AutomationLocation, RendererMessage, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, Team, UpdateAgentInput, UpdateAutomationInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';

const ConversationPaneStub = defineComponent({
  name: 'ConversationPane',
  props: ['agent', 'agents', 'attachmentAnnotationCounts', 'controller', 'plan', 'planVisible'],
  emits: ['annotate-attachment', 'close-plan'],
  setup(_props, { expose }) {
    expose({ focusComposer: vi.fn() });
  },
  template: '<section class="conversation-pane" />',
});

const AgentSidebarStub = defineComponent({
  name: 'AgentSidebar',
  props: [
    'activeAgentId',
    'agents',
    'collapsedRepositoryKeys',
    'compact',
    'forkableAgentIds',
    'pendingHandoffAgentId',
    'maxWidth',
    'minWidth',
    'openInCatalog',
    'quickSwitchShortcutsVisible',
    'repositoryIcons',
    'teamId',
    'teamName',
    'teams',
    'unreadAgentIds',
    'width',
  ],
  emits: [
    'collapse-sidebar',
    'close-agent',
    'create-agent-from-repository',
    'create-agent-on-branch',
    'create-agent-worktree-in-repository',
    'create-quick-chat',
    'duplicate-agent',
    'edit-agent',
    'fork-agent',
    'move-agent-to-team',
    'open-in',
    'reorder-agents',
    'resize-sidebar',
    'restart-agent',
    'resume-session',
    'save-agent-to-bench',
    'select-agent',
    'start-work',
    'update-collapsed-repositories',
    'update-repository-icon',
  ],
  setup(_props, { expose }) {
    expose({
      agentLabelRect: () => ({ height: 18, left: 112, top: 186, width: 82 }),
    });
  },
  template: '<aside class="agent-sidebar" />',
});

export function pointerEvent(type: string, clientX: number): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event as PointerEvent;
}

export async function clickPortaledMenuItem(label: string): Promise<void> {
  const item = Array.from(document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(item).toBeDefined();
  item!.click();
  await nextTick();
}

export function mountShell(overrides: Partial<{
  snapshot: AppSnapshot;
  agentFiles: AgentFileSearchItem[];
  previewAgentFile: (agentId: string, path: string) => Promise<AgentFilePreviewResult>;
  unreadAgentIds: string[];
  composerAttachments: readonly CodexNativeAttachment[];
  composerState: { text: string; selectionStart: number; selectionEnd: number };
  chooseAgentFolder: () => Promise<string | null>;
  cloneSourceRepository: (input: import('@codex-claw/core/contracts').CloneSourceRepositoryInput) => Promise<SourceRepository>;
  createAgent: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createQuickChat: (input: import('@codex-claw/core/contracts').CreateQuickChatInput) => Promise<Agent | null | void>;
  createSourceWorktree: (input: import('@codex-claw/core/contracts').CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  createTeam: (input: CreateTeamInput) => Promise<Team | null | void>;
  listSourceFolders: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSourceRepositories: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  listSourceBranches: (repoPath: string, remoteConnectionId?: string) => Promise<import('@codex-claw/core/contracts').SourceBranch[]>;
  sourceRepositories: SourceRepository[];
  listSourceWorktrees: (repoPath: string, remoteConnectionId?: string) => Promise<SourceWorktree[]>;
  deployBenchTemplateAction: (input: string | DeployBenchTemplateInput) => Promise<Agent | null | void>;
  updateTeam: (input: UpdateTeamInput) => Promise<void>;
  updateAgent: (input: UpdateAgentInput) => Promise<void>;
  updateSettings: (input: UpdateSettingsInput) => Promise<void>;
  createAutomation: (input: CreateAutomationInput) => Promise<void>;
  updateAutomation: (input: UpdateAutomationInput) => Promise<void>;
  clearAutomationHistory: (automationId: string) => Promise<void>;
  deleteAutomationExecution: (automationId: string, executionId: string) => Promise<void>;
  deleteAutomation: (automationId: string) => Promise<void>;
  listAgentConversations: (agentId: string) => Promise<ConversationSummary[]>;
  resumeAgentConversation: (agentId: string, ref: BackendConversationRef) => Promise<void>;
  readConversationMessages: (ref: BackendConversationRef, agentId: string) => Promise<RendererMessage[]>;
  openAgentGitDiff: (agentId: string) => Promise<void>;
  configureWorkBacklog: (input: WorkBacklogConfigurationInput) => Promise<void>;
  loadWorkRepositories: (provider: WorkProviderKind) => Promise<WorkRepository[] | void>;
  loadAssignedWorkItems: (provider: WorkProviderKind, location?: AutomationLocation) => Promise<WorkItem[] | void>;
  loadGlobalWorkItems: (provider: WorkProviderKind, location?: AutomationLocation, query?: import('@codex-claw/core/contracts').GlobalWorkItemQuery) => Promise<import('@codex-claw/core/contracts').WorkItemPage>;
  loadWorkItems: (provider: WorkProviderKind, repositoryId: string, location?: AutomationLocation, query?: import('@codex-claw/core/contracts').WorkItemQuery) => Promise<WorkItem[] | void>;
  createWorkItem: (input: import('@codex-claw/core/contracts').CreateWorkItemInput) => Promise<WorkItem>;
  createAgentGitBranch: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitBranchInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  duplicateAgentAction: (agentId: string, options?: { name?: string; select?: boolean }) => Promise<Agent | null>;
  assignWorkItemAction: (payload: { agentId: string; item: WorkItem; prompt?: string }) => Promise<void>;
  loadBench: (location?: BenchLocation) => Promise<void>;
  getAutomationSnapshot: (location?: AutomationLocation) => Promise<AppSnapshot>;
  remoteBenchByConnectionId: Record<string, BenchTemplate[]>;
  remoteBenchStatusByConnectionId: Record<string, 'notLoaded' | 'loading' | 'loaded' | 'error'>;
  quit: () => Promise<void>;
  workRepositoriesByProvider: Partial<Record<WorkProviderKind, WorkRepository[]>>;
  workItemsByRepository: Record<string, WorkItem[]>;
  realConversationPane: boolean;
  realAgentSidebar: boolean;
}> = {}) {
  const snapshot = overrides.snapshot ?? createInitialSnapshot();
  return mount(AppShell, {
    props: {
      snapshot,
      activeAgent: snapshot.agents.find((agent) => agent.id === snapshot.activeAgentId) ?? null,
      unreadAgentIds: overrides.unreadAgentIds ?? [],
      agentFiles: overrides.agentFiles ?? [],
      messages: snapshot.messages,
      isLoading: false,
      isSending: false,
      composerAttachments: overrides.composerAttachments ?? [],
      composerState: overrides.composerState ?? { text: '', selectionStart: 0, selectionEnd: 0 },
      chooseAgentFolder: overrides.chooseAgentFolder ?? vi.fn().mockResolvedValue(null),
      cloneSourceRepository: overrides.cloneSourceRepository ?? vi.fn().mockRejectedValue(new Error('Unavailable')),
      createSourceWorktree: overrides.createSourceWorktree ?? vi.fn().mockResolvedValue({ name: '', path: '' }),
      listSourceFolders: overrides.listSourceFolders ?? vi.fn().mockResolvedValue({ path: '', parentPath: null, entries: [] }),
      listSourceRepositories: overrides.listSourceRepositories ?? vi.fn().mockResolvedValue([]),
      listSourceBranches: overrides.listSourceBranches ?? vi.fn().mockResolvedValue([]),
      sourceRepositories: overrides.sourceRepositories ?? [],
      listSourceWorktrees: overrides.listSourceWorktrees ?? vi.fn().mockResolvedValue([]),
      createAgent: overrides.createAgent ?? vi.fn().mockResolvedValue(undefined),
      createQuickChat: overrides.createQuickChat ?? vi.fn().mockResolvedValue(undefined),
      createTeam: overrides.createTeam ?? vi.fn().mockResolvedValue(undefined),
      deployBenchTemplateAction: overrides.deployBenchTemplateAction ?? vi.fn().mockResolvedValue(undefined),
      updateTeam: overrides.updateTeam ?? vi.fn().mockResolvedValue(undefined),
      updateAgent: overrides.updateAgent ?? vi.fn().mockResolvedValue(undefined),
      updateSettings: overrides.updateSettings ?? vi.fn().mockResolvedValue(undefined),
      createAutomation: overrides.createAutomation ?? vi.fn().mockResolvedValue(undefined),
      updateAutomation: overrides.updateAutomation ?? vi.fn().mockResolvedValue(undefined),
      clearAutomationHistory: overrides.clearAutomationHistory ?? vi.fn().mockResolvedValue(undefined),
      deleteAutomationExecution: overrides.deleteAutomationExecution ?? vi.fn().mockResolvedValue(undefined),
      deleteAutomation: overrides.deleteAutomation ?? vi.fn().mockResolvedValue(undefined),
      listAgentConversations: overrides.listAgentConversations ?? vi.fn().mockResolvedValue([]),
      resumeAgentConversation: overrides.resumeAgentConversation ?? vi.fn().mockResolvedValue(undefined),
      readConversationMessages: overrides.readConversationMessages ?? vi.fn().mockResolvedValue([]),
      openAgentGitDiff: overrides.openAgentGitDiff ?? vi.fn().mockResolvedValue(undefined),
      previewAgentFile: overrides.previewAgentFile ?? vi.fn().mockRejectedValue(new Error('Unavailable')),
      configureWorkBacklog: overrides.configureWorkBacklog ?? vi.fn().mockResolvedValue(undefined),
      loadWorkRepositories: overrides.loadWorkRepositories ?? vi.fn().mockResolvedValue(undefined),
      loadAssignedWorkItems: overrides.loadAssignedWorkItems ?? vi.fn().mockResolvedValue(undefined),
      loadGlobalWorkItems: overrides.loadGlobalWorkItems ?? vi.fn().mockResolvedValue({ items: [], page: 1, pageSize: 25, totalItems: 0 }),
      loadWorkItems: overrides.loadWorkItems ?? vi.fn().mockResolvedValue(undefined),
      createWorkItem: overrides.createWorkItem ?? vi.fn().mockRejectedValue(new Error('Unavailable')),
      createAgentGitBranch: overrides.createAgentGitBranch ?? vi.fn().mockResolvedValue({}),
      duplicateAgentAction: overrides.duplicateAgentAction ?? vi.fn().mockResolvedValue(null),
      assignWorkItemAction: overrides.assignWorkItemAction ?? vi.fn().mockResolvedValue(undefined),
      loadBench: overrides.loadBench ?? vi.fn().mockResolvedValue(undefined),
      getAutomationSnapshot: overrides.getAutomationSnapshot ?? vi.fn().mockResolvedValue(createEmptySnapshot()),
      remoteBenchByConnectionId: overrides.remoteBenchByConnectionId ?? {},
      remoteBenchStatusByConnectionId: overrides.remoteBenchStatusByConnectionId ?? {},
      workRepositoriesByProvider: overrides.workRepositoriesByProvider ?? {},
      workItemsByRepository: overrides.workItemsByRepository ?? {},
      quit: overrides.quit ?? vi.fn().mockResolvedValue(undefined),
    },
    global: {
      plugins: [ElementPlus],
      stubs: {
        AgentSidebar: overrides.realAgentSidebar ? false : AgentSidebarStub,
        ConversationPane: overrides.realConversationPane ? false : ConversationPaneStub,
        ElDialog: {
          props: ['modelValue'],
          template: `
            <section v-if="modelValue" class="agent-dialog-test-shell">
              <slot name="header" />
              <slot />
              <slot name="footer" />
            </section>
          `,
        },
        ElPopover: {
          template: '<div><slot name="reference" /><slot /></div>',
        },
      },
    },
  });
}

export function conversationController(wrapper: VueWrapper): CodexConversationPaneController {
  return wrapper.getComponent({ name: 'ConversationPane' }).props('controller') as CodexConversationPaneController;
}

export function conversationControllerState(wrapper: VueWrapper): CodexConversationPaneState {
  return resolveConversationControllerValue(conversationController(wrapper).state);
}

export function conversationControllerActions(wrapper: VueWrapper): CodexConversationPaneActions {
  return resolveConversationControllerValue(conversationController(wrapper).actions);
}

export function resolveConversationControllerValue<T>(source: T | { readonly value: T } | (() => T)): T {
  if (typeof source === 'function') return (source as () => T)();
  if (source && typeof source === 'object' && 'value' in source) return source.value;
  return source as T;
}

export async function chooseCustomAgentFolder(wrapper: ReturnType<typeof mountShell>, repositorySelectIndex = 0) {
  wrapper.findComponent({ name: 'AgentDialog' }).findAllComponents({ name: 'ElSelect' })[repositorySelectIndex]?.vm.$emit('update:modelValue', '__custom_folder__');
  await flushPromises();
}

export function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit drag target',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    authorName: 'nbonamy',
    body: 'Make issue assignment feel obvious.',
    labels: [],
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
    ...overrides,
  };
}

export function workItemAssignment(item: WorkItem, agentId: string) {
  return {
    provider: item.provider,
    itemId: item.id,
    agentId,
    assignedAt: '2026-06-09T13:00:00.000Z',
    policy: 'review' as const,
    status: 'inProgress' as const,
  };
}

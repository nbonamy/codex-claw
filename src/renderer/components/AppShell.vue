<template>
  <main
    class="app-shell"
  >
    <TeamRail
      :teams="snapshot.teams"
      :active-team-id="cockpitVisible || loopsVisible || settingsVisible ? null : activeTeam?.id ?? null"
      :cockpit-active="cockpitVisible"
      :loops-active="loopsVisible"
      :settings-active="settingsVisible"
      :rate-limits="snapshot.accountRateLimits"
      class="app-shell__team-rail"
      @close-team="$emit('close-team', $event)"
      @edit-team="openEditTeam"
      @new-team="openNewTeam"
      @open-settings="openSettings"
      @quit="quit"
      @reorder-teams="$emit('reorder-teams', $event)"
      @select-cockpit="openCockpit"
      @select-loops="openLoops"
      @select-team="selectTeamFromRail"
    />
    <Transition name="agent-sidebar">
      <AgentSidebar
        v-if="showAgentSidebar"
        :agents="activeTeamAgents"
        :active-agent-id="currentAgent?.id ?? null"
        :bench="snapshot.bench"
        :teams="snapshot.teams"
        :team-id="activeTeam?.id ?? null"
        :team-name="activeTeamName"
        :width="agentSidebarWidth"
        :min-width="agentSidebarMinWidth"
        :max-width="agentSidebarMaxWidth"
        :list-conversations="listAgentConversations"
        :resume-conversation="resumeAgentConversation"
        @collapse-sidebar="agentSidebarCollapsed = true"
        @close-agent="$emit('close-agent', $event)"
        @deploy-bench-template="$emit('deploy-bench-template', $event)"
        @duplicate-agent="$emit('duplicate-agent', $event)"
        @edit-agent="openEditAgent"
        @move-agent-to-team="$emit('move-agent-to-team', $event)"
        @new-agent="openNewAgent"
        @reorder-agents="$emit('reorder-agents', $event)"
        @restart-agent="$emit('restart-agent', $event)"
        @resize-sidebar="setAgentSidebarWidth"
        @remove-bench-template="$emit('remove-bench-template', $event)"
        @save-agent-to-bench="$emit('save-agent-to-bench', $event)"
        @select-agent="selectAgentFromShell"
      />
    </Transition>
    <section class="app-shell__content">
      <SettingsView
        v-if="settingsVisible"
        :active-tab="settingsActiveTab"
        :general-settings="snapshot.general"
        :settings="snapshot.theme"
        :source-folder="snapshot.sourceFolder"
        :work-backlog-connections="snapshot.workBacklog.connections"
        :work-backlog-error="workBacklogError"
        :work-backlog-status="workBacklogStatus"
        :work-provider-settings="snapshot.workBacklog.providerSettings"
        :work-provider-authorization="workProviderAuthorization"
        :choose-source-folder="chooseSourceFolder"
        :connect-work-provider="connectWorkProvider"
        :open-work-provider-authorization="openWorkProviderAuthorization"
        :complete-work-provider-connection="completeWorkProviderConnection"
        :disconnect-work-provider="disconnectWorkProvider"
        :update-settings="updateSettings"
        @select-tab="settingsActiveTab = $event"
      />
      <LoopsView
        v-else-if="loopsVisible"
        :backend-models="backendModels"
        :bench="snapshot.bench"
        :choose-agent-folder="chooseAgentFolder"
        :clear-loop-history="clearLoopHistory"
        :create-loop="createLoop"
        :delete-loop-execution="deleteLoopExecution"
        :delete-loop="deleteLoop"
        :load-work-items="loadWorkItems"
        :load-work-repositories="loadWorkRepositories"
        :loops="snapshot.loops"
        :messages="snapshot.messages"
        :read-conversation-messages="readConversationMessages"
        :run-loop="runLoop"
        :source-repositories="sourceRepositories"
        :teams="snapshot.teams"
        :update-loop="updateLoop"
        :work-backlog="snapshot.workBacklog"
        :work-backlog-error="workBacklogError"
        :work-backlog-status="workBacklogStatus"
        :work-items-by-repository="workItemsByRepository"
        :work-repositories-by-provider="workRepositoriesByProvider"
      />
      <CockpitView
        v-else-if="cockpitVisible"
        :agents="snapshot.agents"
        :bench="snapshot.bench"
        :teams="snapshot.teams"
        :work-backlog="cockpitWorkBacklog"
        @add-agent="openNewAgent"
        @assign-work-item-to-bench-agent="openBenchAgentAssignmentDialog"
        @assign-work-item-to-new-agent="openNewAgentForWorkItem"
        @assign-work-item="assignExistingAgentWorkItem"
        @close-agent="$emit('close-agent', $event)"
        @deploy-bench-template="$emit('deploy-bench-template', $event)"
        @duplicate-agent="$emit('duplicate-agent', $event)"
        @edit-agent="openEditAgent"
        @move-agent-to-team="$emit('move-agent-to-team', $event)"
        @prompt-agent="$emit('send-agent-prompt', $event)"
        @remove-bench-template="$emit('remove-bench-template', $event)"
        @remove-work-item-assignment="$emit('remove-work-item-assignment', $event)"
        @refresh-work-items="refreshWorkItems"
        @restart-agent="$emit('restart-agent', $event)"
        @save-agent-to-bench="$emit('save-agent-to-bench', $event)"
        @select-work-tag="selectWorkTagForCockpit"
        @select-work-assignee="selectWorkAssigneeForCockpit"
        @select-work-repository="selectWorkRepositoryForCockpit"
        @select-agent="selectAgentFromCockpit"
        @select-team="selectTeamFromRail"
      />
      <template v-else>
        <AgentHeader
          v-if="!isAgentEmpty && currentAgent"
          :agent="currentAgent"
          :git-status="currentAgentGitStatus"
          :backend-runtime="currentBackendRuntime"
          :is-loading="isLoading"
          :sidebar-collapsed="agentSidebarCollapsed"
          @expand-sidebar="agentSidebarCollapsed = false"
          @open-git-diff="openAgentGitDiffPreview"
        />
        <div class="app-shell__body">
          <AgentEmptyState
            v-if="isAgentEmpty"
            :bench="snapshot.bench"
            @deploy-bench-template="$emit('deploy-bench-template', $event)"
            @new-agent="openNewAgent"
            @remove-bench-template="$emit('remove-bench-template', $event)"
          />
          <ConversationPane
            v-else
            :messages="messages"
            :agent="currentAgent"
            :agent-files="agentFiles"
            :is-loading="isLoading"
            :is-sending="isSending"
            :answered-client-request-ids="answeredClientRequestIds"
            :backend-models="backendModels"
            :backend-commands="backendCommands"
            :backend-skills="backendSkills"
            :backend-capabilities="backendCapabilities"
            :model-catalog-status="modelCatalogStatus"
            :skill-catalog-status="skillCatalogStatus"
            :goal="goal"
            :turn-git-diff="currentTurnGitDiff"
            :codex-approval-preset="codexApprovalPreset"
            :plan-mode="planMode"
            :selected-model-id="selectedModelId"
            :selected-reasoning-effort="selectedReasoningEffort"
            :queued-prompts="queuedPrompts"
            @attach="$emit('attach')"
            @client-response="$emit('client-response', $event)"
            @copy-message="$emit('copy-message', $event)"
            @delete-message="$emit('delete-message', $event)"
            @delete-queued-prompt="$emit('delete-queued-prompt', $event)"
            @edit-message="$emit('edit-message', $event)"
            @interrupt-agent="$emit('interrupt-agent')"
            @open-file="openFilePreview"
            @quote-message="$emit('quote-message', $event)"
            @retry-message="$emit('retry-message', $event)"
            @select-model="$emit('select-model', $event)"
            @select-reasoning-effort="$emit('select-reasoning-effort', $event)"
            @select-codex-approval-preset="$emit('select-codex-approval-preset', $event)"
            @clear-goal="$emit('clear-goal')"
            @send-prompt="$emit('sendPrompt', $event)"
            @steer-prompt="$emit('steerPrompt', $event)"
            @steer-queued-prompt="$emit('steer-queued-prompt', $event)"
            @update:plan-mode="$emit('update:planMode', $event)"
          />
          <SidePanel
            v-if="sidePanel"
            :panel="sidePanel"
            :plan-updating="isPlanPreviewUpdating"
            @cancel-plan="cancelPlanReview"
            @close="closeSidePanel"
            @comment-plan="commentOnPlan"
            @confirm-plan="confirmPlan"
            @refresh-git-diff="openAgentGitDiffPreview"
          />
        </div>
      </template>
    </section>
    <AgentDialog
      :visible="agentDialogVisible"
      :mode="agentDialogMode"
      :agent="editingAgent"
      :add-recent-source-repository="addRecentSourceRepository"
      :choose-agent-folder="chooseAgentFolder"
      :choose-source-worktree-destination="chooseSourceWorktreeDestination"
      :create-agent="createAgentFromDialog"
      :create-source-worktree="createSourceWorktree"
      :initial-new-team-name="pendingNewAgentTeamName"
      :initial-team-id="agentDialogTeamId"
      :source-folder-path="snapshot.sourceFolder.path"
      :source-recent-repo-names="snapshot.sourceFolder.recentRepoNames"
      :source-repositories="sourceRepositories"
      :update-agent="updateAgent"
      :teams="snapshot.teams"
      :show-team-field="showAgentDialogTeamSelector"
      @close="closeAgentDialog"
    />
    <BenchAgentAssignmentDialog
      :visible="benchAssignmentDialogVisible"
      title="Assign to Bench Agent"
      subtitle="Choose a Bench agent and target team."
      confirm-label="Assign"
      :bench-templates="snapshot.bench"
      :initial-new-team-name="pendingBenchAgentTeamName"
      :initial-team-id="pendingBenchAgentTeamId ?? activeTeam?.id ?? snapshot.activeTeamId"
      :teams="snapshot.teams"
      @close="closeBenchAssignmentDialog"
      @submit="assignWorkItemToBenchAgent"
    />
    <TeamDialog
      :visible="teamDialogVisible"
      :mode="teamDialogMode"
      :team="editingTeam"
      :create-team="createTeam"
      :update-team="updateTeam"
      @close="teamDialogVisible = false"
    />
  </main>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Agent, AgentFileReadResult, AgentFileSearchItem, AgentGitStatus, AppCommand, AppSnapshot, BackendCapabilities, BackendCommandSummary, BackendConversationRef, BackendModelOption, BackendRuntimeStatus, BackendSkillSummary, ClientRequestResponse, CodexApprovalPreset, ConversationSummary, CreateAgentInput, CreateLoopInput, CreateSourceWorktreeInput, CreateTeamInput, DeployBenchTemplateInput, MoveAgentToTeamInput, ReasoningEffort, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SidePanelMarkdownRequest, SidePanelRequest, SourceRepository, SourceWorktree, Team, ThreadGoal, TurnGitDiff, UpdateAgentInput, UpdateLoopInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkItem, WorkProviderAuthorization, WorkProviderKind, WorkRepository } from '../../shared/contracts';
import { defaultBackendCapabilities } from '../../shared/backend-capabilities';
import { defaultTeamColor } from '../../shared/team-colors';
import { findAssignedAgentForWorkItem } from '../../shared/work-assignments';
import AgentDialog from './AgentDialog.vue';
import AgentEmptyState from './AgentEmptyState.vue';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import CockpitView from './CockpitView.vue';
import ConversationPane from './ConversationPane.vue';
import LoopsView from './LoopsView.vue';
import SidePanel from './SidePanel.vue';
import TeamDialog from './TeamDialog.vue';
import TeamRail from './TeamRail.vue';
import BenchAgentAssignmentDialog from './BenchAgentAssignmentDialog.vue';
import SettingsView from './SettingsView.vue';
import type { SettingsTab } from './settings-tabs';
import { confirmCloseTeam } from './team-close-confirmation';
import type { QueuedChatPrompt } from '../shared/chat/queued-prompts';
import { languageForFilePath } from '../shared/chat/syntax-highlighting';
import type { PlanReviewComment, SidePanelState } from './side-panel';

const props = withDefaults(defineProps<{
  snapshot: AppSnapshot;
  activeAgent: Agent | null;
  agentFiles?: AgentFileSearchItem[];
  messages: RendererMessage[];
  isLoading: boolean;
  isSending: boolean;
  goal?: ThreadGoal | null;
  codexApprovalPreset?: CodexApprovalPreset | null;
  answeredClientRequestIds?: Set<string>;
  backendModels?: BackendModelOption[];
  backendCommands?: BackendCommandSummary[];
  backendSkills?: BackendSkillSummary[];
  backendCapabilities?: BackendCapabilities;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  skillCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
  planMode?: boolean;
  queuedPrompts?: QueuedChatPrompt[];
  sidePanelRequest?: SidePanelRequest | null;
  workProviderAuthorization?: WorkProviderAuthorization | null;
  workRepositoriesByProvider?: Partial<Record<WorkProviderKind, WorkRepository[]>>;
  workItemsByRepository?: Record<string, WorkItem[]>;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workBacklogError?: string | null;
  chooseAgentFolder?: () => Promise<string | null>;
  chooseSourceFolder?: () => Promise<string | null>;
  sourceRepositories?: SourceRepository[];
  chooseSourceWorktreeDestination?: (repoPath: string, suggestedName: string) => Promise<string | null>;
  createSourceWorktree?: (input: CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  addRecentSourceRepository?: (repoName: string) => void;
  readAgentFile?: (agentId: string, filePath: string) => Promise<AgentFileReadResult>;
  openAgentGitDiff?: (agentId: string) => Promise<void>;
  createAgent?: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createTeam?: (input: CreateTeamInput) => Promise<Team | null | void>;
  deployBenchTemplateAction?: (input: string | DeployBenchTemplateInput) => Promise<Agent | null | void>;
  updateTeam?: (input: UpdateTeamInput) => Promise<void>;
  updateAgent?: (input: UpdateAgentInput) => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  createLoop?: (input: CreateLoopInput) => Promise<void>;
  updateLoop?: (input: UpdateLoopInput) => Promise<void>;
  runLoop?: (loopId: string) => Promise<void>;
  clearLoopHistory?: (loopId: string) => Promise<void>;
  deleteLoopExecution?: (loopId: string, executionId: string) => Promise<void>;
  deleteLoop?: (loopId: string) => Promise<void>;
  listAgentConversations?: (agentId: string) => Promise<ConversationSummary[]>;
  resumeAgentConversation?: (agentId: string, ref: BackendConversationRef) => Promise<void>;
  readConversationMessages?: (ref: BackendConversationRef, agentId: string) => Promise<RendererMessage[]>;
  connectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  openWorkProviderAuthorization?: (provider: WorkProviderKind) => Promise<void>;
  completeWorkProviderConnection?: (provider: WorkProviderKind) => Promise<void>;
  disconnectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  configureWorkBacklog?: (input: WorkBacklogConfigurationInput) => Promise<void>;
  loadWorkRepositories?: (provider: WorkProviderKind) => Promise<void>;
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string) => Promise<void>;
  quit?: () => Promise<void>;
}>(), {
  answeredClientRequestIds: () => new Set<string>(),
  agentFiles: () => [],
  backendModels: () => [],
  backendCommands: () => [],
  backendSkills: () => [],
  backendCapabilities: () => defaultBackendCapabilities('codex'),
  modelCatalogStatus: 'notLoaded',
  skillCatalogStatus: 'notLoaded',
  selectedModelId: null,
  selectedReasoningEffort: null,
  codexApprovalPreset: null,
  queuedPrompts: () => [],
  sidePanelRequest: null,
  workProviderAuthorization: null,
  workRepositoriesByProvider: () => ({}),
  workItemsByRepository: () => ({}),
  workBacklogStatus: 'notLoaded',
  workBacklogError: null,
  chooseAgentFolder: async () => null,
  chooseSourceFolder: async () => null,
  sourceRepositories: () => [],
  chooseSourceWorktreeDestination: async () => null,
  createSourceWorktree: async () => ({ name: '', path: '' }),
  addRecentSourceRepository: () => undefined,
  readAgentFile: async () => {
    throw new Error('File preview is not available.');
  },
  openAgentGitDiff: async () => {
    throw new Error('Git diff preview is not available.');
  },
  createAgent: async () => undefined,
  createTeam: async () => undefined,
  deployBenchTemplateAction: async () => undefined,
  updateTeam: async () => undefined,
  updateAgent: async () => undefined,
  updateSettings: async () => undefined,
  createLoop: async () => undefined,
  updateLoop: async () => undefined,
  runLoop: async () => undefined,
  clearLoopHistory: async () => undefined,
  deleteLoopExecution: async () => undefined,
  deleteLoop: async () => undefined,
  listAgentConversations: async () => [],
  resumeAgentConversation: async () => undefined,
  readConversationMessages: async () => [],
  connectWorkProvider: async () => undefined,
  openWorkProviderAuthorization: async () => undefined,
  completeWorkProviderConnection: async () => undefined,
  disconnectWorkProvider: async () => undefined,
  configureWorkBacklog: async () => undefined,
  loadWorkRepositories: async () => undefined,
  loadWorkItems: async () => undefined,
  quit: async () => undefined,
});

const emit = defineEmits<{
  'close-team': [teamId: string];
  'close-agent': [agentId: string];
  attach: [];
  'clear-goal': [];
  'client-response': [response: ClientRequestResponse];
  'copy-message': [index: number];
  'delete-message': [index: number];
  'delete-queued-prompt': [promptId: string];
  'deploy-bench-template': [input: string | DeployBenchTemplateInput];
  'duplicate-agent': [agentId: string];
  'edit-message': [payload: { content: string; index: number }];
  'interrupt-agent': [];
  'move-agent-to-team': [input: MoveAgentToTeamInput];
  'quote-message': [index: number];
  'reorder-agents': [input: ReorderAgentsInput];
  'reorder-teams': [input: ReorderTeamsInput];
  'assign-work-item': [payload: { agentId: string; item: WorkItem }];
  'remove-work-item-assignment': [item: WorkItem];
  'restart-agent': [agentId: string];
  'remove-bench-template': [templateId: string];
  'retry-message': [index: number];
  'save-agent-to-bench': [agentId: string];
  'send-agent-prompt': [payload: { agentId: string; prompt: string }];
  'select-agent': [agentId: string];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  'select-codex-approval-preset': [preset: CodexApprovalPreset];
  'select-team': [teamId: string];
  'steer-queued-prompt': [promptId: string];
  'update:planMode': [enabled: boolean];
  sendPrompt: [prompt: string];
  steerPrompt: [prompt: string];
}>();

type WorkItemAssignmentIntent = {
  item: WorkItem;
  teamId?: string;
};

type AppSurface = 'agent' | 'cockpit' | 'loops' | 'settings';

const agentSidebarCollapsed = ref(false);
const agentSidebarMinWidth = 80;
const agentSidebarMaxWidth = 420;
const agentSidebarWidth = ref(260);
const activeSurface = ref<AppSurface>('agent');
const settingsActiveTab = ref<SettingsTab>('general');
const agentDialogVisible = ref(false);
const agentDialogMode = ref<'create' | 'edit'>('create');
const editingAgentId = ref<string | null>(null);
const agentDialogTeamId = ref<string | null>(null);
const pendingNewAgentWorkItem = ref<WorkItem | null>(null);
const pendingBenchAgentWorkItem = ref<WorkItem | null>(null);
const pendingBenchAgentTeamId = ref<string | null>(null);
const benchAssignmentDialogVisible = ref(false);
const teamDialogVisible = ref(false);
const teamDialogMode = ref<'create' | 'edit'>('create');
const editingTeamId = ref<string | null>(null);
const sidePanel = ref<SidePanelState | null>(null);
let sidePanelRequestId = 0;
let unsubscribeAppCommand: (() => void) | null = null;
const activeTeamAgents = computed(() => {
  const team = activeTeam.value;
  if (!team) {
    return [];
  }

  return team.agentIds
    .map((agentId) => props.snapshot.agents.find((agent) => agent.id === agentId))
    .filter((agent): agent is Agent => Boolean(agent));
});
const currentAgent = computed(() => {
  const team = activeTeam.value;
  if (!team) {
    return null;
  }

  if (props.activeAgent && team.agentIds.includes(props.activeAgent.id)) {
    return props.activeAgent;
  }

  return activeTeamAgents.value.find((agent) => agent.id === team.activeAgentId) ?? activeTeamAgents.value[0] ?? null;
});
const currentBackendRuntime = computed<BackendRuntimeStatus>(() => {
  const backend = currentAgent.value?.backend ?? 'codex';
  return props.snapshot.backendRuntimes.find((runtime) => runtime.backend === backend) ?? {
    backend,
    status: 'notConfigured',
  };
});
const currentAgentGitStatus = computed<AgentGitStatus | null>(() => {
  const agentId = currentAgent.value?.id;
  return agentId ? props.snapshot.agentGitStatuses[agentId] ?? null : null;
});
const currentTurnGitDiff = computed<TurnGitDiff | null>(() => {
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const turnId = props.messages[index]?.turnId;
    const diff = turnId ? props.snapshot.turnGitDiffs[turnId] : null;
    if (diff) {
      return diff;
    }
  }

  return null;
});
const cockpitWorkBacklog = computed(() => {
  const connection = props.snapshot.workBacklog.connections.find((candidate) => candidate.provider === 'github');
  if (!connection || connection.status !== 'connected') {
    return null;
  }

  const provider = connection.provider;
  const repositories = props.workRepositoriesByProvider[provider] ?? [];
  const configuration = props.snapshot.workBacklog.providerConfigurations[provider] ?? {};
  const selectedRepositoryId = configuration.repositoryId ?? repositories[0]?.id ?? null;

  return {
    assignments: props.snapshot.workBacklog.assignments,
    connection,
    repositories,
    selectedAssigneeLogin: configuration.assigneeLogin ?? null,
    selectedRepositoryId,
    selectedTagName: configuration.tagName ?? null,
    items: selectedRepositoryId ? props.workItemsByRepository[workItemsKey(provider, selectedRepositoryId)] ?? [] : [],
    status: props.workBacklogStatus,
    error: props.workBacklogError,
  };
});
const showAgentDialogTeamSelector = computed(() => agentDialogMode.value === 'create' && pendingNewAgentWorkItem.value !== null);
const pendingNewAgentTeamName = computed(() => pendingNewAgentWorkItem.value ? workItemTeamName(pendingNewAgentWorkItem.value) : '');
const pendingBenchAgentTeamName = computed(() => pendingBenchAgentWorkItem.value ? workItemTeamName(pendingBenchAgentWorkItem.value) : '');
const isAgentEmpty = computed(() => activeTeamAgents.value.length === 0);
const cockpitVisible = computed(() => activeSurface.value === 'cockpit');
const loopsVisible = computed(() => activeSurface.value === 'loops');
const settingsVisible = computed(() => activeSurface.value === 'settings');
const isAgentWorkspaceVisible = computed(() => activeSurface.value === 'agent');
const isModalDialogVisible = computed(() => agentDialogVisible.value || benchAssignmentDialogVisible.value || teamDialogVisible.value);
const showAgentSidebar = computed(() => isAgentWorkspaceVisible.value && !agentSidebarCollapsed.value && !isAgentEmpty.value);
const editingAgent = computed(() => (
  editingAgentId.value ? props.snapshot.agents.find((agent) => agent.id === editingAgentId.value) ?? null : null
));
const editingTeam = computed(() => (
  editingTeamId.value ? props.snapshot.teams.find((team) => team.id === editingTeamId.value) ?? null : null
));
const isPlanPreviewUpdating = computed(() => {
  if (sidePanel.value?.kind !== 'markdown' || sidePanel.value.purpose !== 'plan') {
    return false;
  }

  const agentId = currentAgent.value?.id;
  if (!agentId) {
    return false;
  }

  return props.messages.some((message) => (
    message.agentId === agentId &&
    message.parts.some((part) => (
      part.type === 'tool' &&
      part.status === 'running' &&
      part.metadata?.planProgress === true
    ))
  ));
});

onMounted(() => {
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', handleShellShortcut);
  }
  unsubscribeAppCommand = window.codexClaw?.onAppCommand?.(handleAppCommand) ?? null;
});

onBeforeUnmount(() => {
  if (typeof window.removeEventListener === 'function') {
    window.removeEventListener('keydown', handleShellShortcut);
  }
  unsubscribeAppCommand?.();
  unsubscribeAppCommand = null;
});

function setAgentSidebarWidth(width: number): void {
  agentSidebarWidth.value = Math.min(Math.max(width, agentSidebarMinWidth), agentSidebarMaxWidth);
}

function openNewAgent(teamId?: string): void {
  agentDialogMode.value = 'create';
  editingAgentId.value = null;
  agentDialogTeamId.value = teamId ?? activeTeam.value?.id ?? null;
  agentDialogVisible.value = true;
}

async function openNewAgentForWorkItem(intent: WorkItemAssignmentIntent): Promise<void> {
  if (!await confirmAssignedWorkItemOverride(intent.item, 'a new agent')) {
    return;
  }

  pendingNewAgentWorkItem.value = intent.item;
  openNewAgent(intent.teamId ?? activeTeam.value?.id ?? props.snapshot.activeTeamId ?? undefined);
}

async function openBenchAgentAssignmentDialog(intent: WorkItemAssignmentIntent): Promise<void> {
  if (!await confirmAssignedWorkItemOverride(intent.item, 'a Bench agent')) {
    return;
  }

  pendingBenchAgentWorkItem.value = intent.item;
  pendingBenchAgentTeamId.value = intent.teamId ?? null;
  benchAssignmentDialogVisible.value = true;
}

function workItemTeamName(item: WorkItem): string {
  return `${workProviderTitle(item.provider)} #${item.number}`;
}

function workProviderTitle(provider: WorkItem['provider']): string {
  return provider === 'github' ? 'GitHub' : provider;
}

async function assignExistingAgentWorkItem(payload: { agentId: string; item: WorkItem }): Promise<void> {
  const targetAgent = props.snapshot.agents.find((agent) => agent.id === payload.agentId);
  if (!await confirmAssignedWorkItemOverride(payload.item, targetAgent?.name ?? 'this agent', payload.agentId)) {
    return;
  }

  emit('assign-work-item', payload);
}

async function confirmAssignedWorkItemOverride(item: WorkItem, targetLabel: string, targetAgentId?: string): Promise<boolean> {
  const assignedAgent = assignedAgentForWorkItem(item);
  if (!assignedAgent || assignedAgent.id === targetAgentId) {
    return true;
  }

  try {
    await ElMessageBox.confirm(
      `${workProviderTitle(item.provider)} #${item.number} is already assigned to ${assignedAgent.name}. We don't know if ${assignedAgent.name} is still working on it. Assign it to ${targetLabel} anyway?`,
      'Assign anyway?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Assign Anyway',
        type: 'warning',
      },
    );
    return true;
  } catch {
    return false;
  }
}

function assignedAgentForWorkItem(item: WorkItem): Agent | null {
  return findAssignedAgentForWorkItem(props.snapshot.agents, props.snapshot.workBacklog.assignments, item);
}

function openNewTeam(): void {
  teamDialogMode.value = 'create';
  editingTeamId.value = null;
  teamDialogVisible.value = true;
}

function openEditTeam(teamId: string): void {
  teamDialogMode.value = 'edit';
  editingTeamId.value = teamId;
  teamDialogVisible.value = true;
}

function openEditAgent(agentId: string): void {
  agentDialogMode.value = 'edit';
  editingAgentId.value = agentId;
  agentDialogTeamId.value = null;
  agentDialogVisible.value = true;
}

function closeAgentDialog(): void {
  agentDialogVisible.value = false;
  editingAgentId.value = null;
  agentDialogTeamId.value = null;
  pendingNewAgentWorkItem.value = null;
}

async function createAgentFromDialog(input: CreateAgentInput & { newTeamName?: string; teamId?: string }): Promise<void> {
  const { newTeamName, ...agentInput } = input;
  const targetTeamId = agentDialogMode.value === 'create'
    ? await resolveSelectedTeam(input.teamId ?? agentDialogTeamId.value, newTeamName)
    : null;
  const agent = await props.createAgent(targetTeamId ? { ...agentInput, teamId: targetTeamId } : agentInput);
  if (agent && pendingNewAgentWorkItem.value) {
    emit('assign-work-item', {
      agentId: agent.id,
      item: pendingNewAgentWorkItem.value,
    });
  }
  pendingNewAgentWorkItem.value = null;
}

function closeBenchAssignmentDialog(): void {
  benchAssignmentDialogVisible.value = false;
  pendingBenchAgentWorkItem.value = null;
  pendingBenchAgentTeamId.value = null;
}

async function assignWorkItemToBenchAgent(input: { benchTemplateId?: string; newTeamName?: string; teamId?: string }): Promise<void> {
  const item = pendingBenchAgentWorkItem.value;
  if (!item || !input.benchTemplateId) {
    return;
  }

  const targetTeamId = await resolveSelectedTeam(input.teamId ?? null, input.newTeamName);
  const agent = await props.deployBenchTemplateAction({
    templateId: input.benchTemplateId,
    ...(targetTeamId ? { teamId: targetTeamId } : {}),
  });
  if (agent) {
    emit('assign-work-item', {
      agentId: agent.id,
      item,
    });
  }
  closeBenchAssignmentDialog();
}

async function resolveSelectedTeam(teamId: string | null | undefined, newTeamName?: string): Promise<string | null> {
  const trimmedNewTeamName = newTeamName?.trim() ?? '';
  if (trimmedNewTeamName) {
    const team = await props.createTeam({
      name: trimmedNewTeamName,
      color: defaultTeamColor,
    });
    return team?.id ?? props.snapshot.activeTeamId ?? null;
  }

  return teamId?.trim() || props.snapshot.activeTeamId;
}

function openCockpit(): void {
  closeSidePanel();
  activeSurface.value = 'cockpit';
}

function openLoops(): void {
  closeSidePanel();
  activeSurface.value = 'loops';
}

function openSettings(): void {
  closeSidePanel();
  activeSurface.value = 'settings';
}

async function createLoop(input: CreateLoopInput): Promise<void> {
  await props.createLoop(input);
}

async function updateLoop(input: UpdateLoopInput): Promise<void> {
  await props.updateLoop(input);
}

async function runLoop(loopId: string): Promise<void> {
  await props.runLoop(loopId);
}

async function clearLoopHistory(loopId: string): Promise<void> {
  await props.clearLoopHistory(loopId);
}

async function deleteLoopExecution(loopId: string, executionId: string): Promise<void> {
  await props.deleteLoopExecution(loopId, executionId);
}

async function deleteLoop(loopId: string): Promise<void> {
  await props.deleteLoop(loopId);
}

async function readConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
  return props.readConversationMessages(ref, agentId);
}

async function listAgentConversations(agentId: string): Promise<ConversationSummary[]> {
  return props.listAgentConversations(agentId);
}

async function resumeAgentConversation(agentId: string, ref: BackendConversationRef): Promise<void> {
  await props.resumeAgentConversation(agentId, ref);
}

function selectTeamFromRail(teamId: string): void {
  activeSurface.value = 'agent';
  emit('select-team', teamId);
}

function selectAgentFromShell(agentId: string): void {
  activeSurface.value = 'agent';
  emit('select-agent', agentId);
}

function selectAgentFromCockpit(payload: { agentId: string; teamId: string }): void {
  activeSurface.value = 'agent';
  emit('select-team', payload.teamId);
  emit('select-agent', payload.agentId);
}

function closeSidePanel(): void {
  sidePanelRequestId += 1;
  sidePanel.value = null;
}

function confirmPlan(): void {
  emit('update:planMode', false);
  emit('sendPrompt', 'implement the plan');
}

function cancelPlanReview(): void {
  emit('update:planMode', false);
  closeSidePanel();
}

function commentOnPlan(comments: PlanReviewComment[]): void {
  if (comments.length === 0) {
    return;
  }

  emit('sendPrompt', formatPlanCommentPrompt(comments));
}

async function openFilePreview(filePath: string): Promise<void> {
  const agent = currentAgent.value;
  const trimmedPath = normalizePreviewFilePath(filePath);
  if (!agent || !trimmedPath) {
    return;
  }

  const requestId = sidePanelRequestId + 1;
  sidePanelRequestId = requestId;
  const initialKind = isMarkdownPath(trimmedPath) ? 'markdown' : 'source';
  sidePanel.value = {
    kind: initialKind,
    title: fileBasename(trimmedPath),
    subtitle: trimmedPath,
    content: '',
    ...(initialKind === 'source' ? { language: languageForFilePath(trimmedPath) ?? null } : {}),
    state: 'loading',
    error: null,
  } as SidePanelState;

  try {
    const result = await props.readAgentFile(agent.id, trimmedPath);
    if (requestId !== sidePanelRequestId) {
      return;
    }
    const resultKind = isMarkdownPath(result.path) ? 'markdown' : 'source';
    sidePanel.value = {
      kind: resultKind,
      title: fileBasename(result.path),
      subtitle: result.path,
      content: result.content,
      ...(resultKind === 'source' ? { language: languageForFilePath(result.path) ?? null } : {}),
      state: 'idle',
      error: null,
    } as SidePanelState;
  } catch (error) {
    if (requestId !== sidePanelRequestId) {
      return;
    }
    sidePanel.value = {
      kind: initialKind,
      title: fileBasename(trimmedPath),
      subtitle: trimmedPath,
      content: '',
      ...(initialKind === 'source' ? { language: languageForFilePath(trimmedPath) ?? null } : {}),
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    } as SidePanelState;
  }
}

async function openAgentGitDiffPreview(): Promise<void> {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  await props.openAgentGitDiff(agent.id);
}

function handleShellShortcut(event: KeyboardEvent): void {
  if (isModalDialogVisible.value || !isAgentWorkspaceVisible.value) {
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'd') {
    duplicateActiveAgent(event);
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'w') {
    closeActiveAgent(event);
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && (event.key === '`' || event.code === 'Backquote')) {
    if (cycleTeams()) {
      event.preventDefault();
    }
    return;
  }

  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
    cycleAgents(event.shiftKey ? -1 : 1, event);
  }
}

function handleAppCommand(command: AppCommand): void {
  if (isModalDialogVisible.value) {
    return;
  }

  if (command.type === 'quit') {
    void quit();
    return;
  }

  if (command.type === 'cycle-teams') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    cycleTeams();
    return;
  }

  if (command.type === 'new-team') {
    openNewTeam();
    return;
  }

  if (command.type === 'new-agent') {
    openNewAgent();
    return;
  }

  if (command.type === 'close-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    closeActiveAgent();
    return;
  }

  if (command.type === 'close-active-team') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    void closeActiveTeam();
    return;
  }

  if (command.type === 'cycle-agents') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    cycleAgents(command.direction);
    return;
  }

  if (command.type === 'edit-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    editActiveAgent();
    return;
  }

  if (command.type === 'duplicate-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    duplicateActiveAgent();
    return;
  }

  if (command.type === 'restart-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    restartActiveAgent();
  }
}

async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  await props.updateSettings(input);
}

async function connectWorkProvider(provider: WorkProviderKind): Promise<void> {
  await props.connectWorkProvider(provider);
}

async function completeWorkProviderConnection(provider: WorkProviderKind): Promise<void> {
  await props.completeWorkProviderConnection(provider);
}

async function disconnectWorkProvider(provider: WorkProviderKind): Promise<void> {
  await props.disconnectWorkProvider(provider);
}

async function selectWorkRepositoryForCockpit(repositoryId: string | null): Promise<void> {
  await props.configureWorkBacklog({
    provider: 'github',
    configuration: {
      repositoryId,
      assigneeLogin: null,
      tagName: null,
    },
  });
  if (repositoryId) {
    await props.loadWorkItems('github', repositoryId);
  }
}

async function selectWorkAssigneeForCockpit(assigneeLogin: string | null): Promise<void> {
  const repositoryId = cockpitWorkBacklog.value?.selectedRepositoryId ?? null;
  await props.configureWorkBacklog({
    provider: 'github',
    configuration: {
      repositoryId,
      assigneeLogin,
      tagName: cockpitWorkBacklog.value?.selectedTagName ?? null,
    },
  });
}

async function selectWorkTagForCockpit(tagName: string | null): Promise<void> {
  const repositoryId = cockpitWorkBacklog.value?.selectedRepositoryId ?? null;
  await props.configureWorkBacklog({
    provider: 'github',
    configuration: {
      repositoryId,
      assigneeLogin: cockpitWorkBacklog.value?.selectedAssigneeLogin ?? null,
      tagName,
    },
  });
}

async function refreshWorkItems(repositoryId: string | null): Promise<void> {
  if (repositoryId) {
    await props.loadWorkItems('github', repositoryId);
  } else {
    await props.loadWorkRepositories('github');
  }
}

async function quit(): Promise<void> {
  await props.quit();
}

function duplicateActiveAgent(event?: KeyboardEvent): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  event?.preventDefault();
  emit('duplicate-agent', agent.id);
}

function closeActiveAgent(event?: KeyboardEvent): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  event?.preventDefault();
  emit('close-agent', agent.id);
}

async function closeActiveTeam(): Promise<void> {
  const team = activeTeam.value;
  if (!team || props.snapshot.teams.length <= 1) {
    return;
  }

  if (await confirmCloseTeam(team)) {
    emit('close-team', team.id);
  }
}

function restartActiveAgent(): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  emit('restart-agent', agent.id);
}

function editActiveAgent(): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  openEditAgent(agent.id);
}

function fileBasename(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}

function isMarkdownPath(filePath: string): boolean {
  const normalizedPath = filePath.split('#')[0]?.split('?')[0]?.toLowerCase() ?? '';
  return /\.(md|markdown|mdown|mkdn)$/u.test(normalizedPath);
}

function normalizePreviewFilePath(filePath: string): string {
  const trimmedPath = filePath.trim();
  if (!trimmedPath.startsWith('file://')) {
    return stripPreviewLineSuffix(trimmedPath);
  }

  try {
    return stripPreviewLineSuffix(decodeURIComponent(new URL(trimmedPath).pathname));
  } catch {
    return stripPreviewLineSuffix(trimmedPath);
  }
}

function stripPreviewLineSuffix(filePath: string): string {
  return filePath.replace(/:(?:\d+)(?::\d+)?$/u, '');
}

function workItemsKey(provider: WorkProviderKind, repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}

function cycleTeams(): boolean {
  const teams = props.snapshot.teams;
  if (teams.length < 2) {
    return false;
  }

  const activeIndex = Math.max(teams.findIndex((team) => team.id === activeTeam.value?.id), 0);
  const nextTeam = teams[(activeIndex + 1) % teams.length];
  if (!nextTeam) {
    return false;
  }

  selectTeamFromRail(nextTeam.id);
  return true;
}

function cycleAgents(direction: 1 | -1, event?: KeyboardEvent): void {
  const agents = activeTeamAgents.value;
  if (agents.length < 2) {
    return;
  }

  const activeIndex = Math.max(agents.findIndex((agent) => agent.id === currentAgent.value?.id), 0);
  const nextAgent = agents[(activeIndex + direction + agents.length) % agents.length];
  if (!nextAgent) {
    return;
  }

  event?.preventDefault();
  selectAgentFromShell(nextAgent.id);
}

const activeTeam = computed<Team | null>(() => {
  const selectedTeam = props.snapshot.activeTeamId
    ? props.snapshot.teams.find((team) => team.id === props.snapshot.activeTeamId) ?? null
    : null;
  if (selectedTeam) {
    return selectedTeam;
  }

  if (props.activeAgent?.teamId) {
    return props.snapshot.teams.find((team) => team.id === props.activeAgent?.teamId) ?? props.snapshot.teams[0] ?? null;
  }

  if (props.activeAgent) {
    return props.snapshot.teams.find((team) => team.agentIds.includes(props.activeAgent?.id ?? '')) ?? props.snapshot.teams[0] ?? null;
  }

  return props.snapshot.teams[0] ?? null;
});
const activeTeamName = computed(() => activeTeam.value?.name ?? 'Codex Claw');

watch(() => currentAgent.value?.id ?? null, () => {
  closeSidePanel();
});

watch(() => props.sidePanelRequest, (request) => {
  if (!request) {
    return;
  }

  openSidePanelRequest(request);
}, { immediate: true });

function openSidePanelRequest(request: SidePanelRequest): void {
  if (request.kind === 'markdown') {
    openMarkdownRequest(request);
    return;
  }

  // Temporarily keep turn diff side-panel requests from auto-opening.
  // openGitDiffRequest(request);
}

function openMarkdownRequest(request: SidePanelMarkdownRequest): void {
  sidePanelRequestId += 1;
  const subtitle = request.path;
  sidePanel.value = {
    kind: 'markdown',
    ...(request.purpose ? { purpose: request.purpose } : {}),
    title: request.title ?? (subtitle ? fileBasename(subtitle) : 'Markdown'),
    ...(subtitle ? { subtitle } : {}),
    content: request.content,
    state: 'idle',
    error: null,
  };
}

function openGitDiffRequest(request: Extract<SidePanelRequest, { kind: 'gitDiff' }>): void {
  sidePanelRequestId += 1;
  sidePanel.value = {
    kind: 'gitDiff',
    title: request.title ?? 'Git Diff',
    ...(request.subtitle ? { subtitle: request.subtitle } : {}),
    diff: request.diff,
    state: request.state ?? 'idle',
    error: request.error ?? null,
  };
}

function formatPlanCommentPrompt(comments: PlanReviewComment[]): string {
  const formattedComments = comments.map((comment, index) => [
    `${index + 1}. On: "${comment.quote}"`,
    `   Comment: ${comment.body}`,
  ].join('\n')).join('\n\n');

  return [
    'Refine the plan using these comments:',
    '',
    formattedComments,
  ].join('\n');
}
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-shell-main);
}

.app-shell__team-rail {
  padding-top: var(--space-20);
}

.app-shell > .agent-sidebar-enter-active,
.app-shell > .agent-sidebar-leave-active {
  overflow: hidden;
  transition:
    flex-basis 180ms ease,
    width 180ms ease,
    min-width 180ms ease,
    max-width 180ms ease,
    opacity 140ms ease,
    transform 180ms ease,
    border-color 180ms ease;
}

.app-shell > .agent-sidebar-enter-from,
.app-shell > .agent-sidebar-leave-to {
  flex-basis: 0;
  width: 0;
  min-width: 0;
  max-width: 0;
  opacity: 0;
  transform: translateX(-8px);
  border-right-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .app-shell > .agent-sidebar-enter-active,
  .app-shell > .agent-sidebar-leave-active {
    transition-duration: 1ms;
  }
}

.app-shell__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-shell-main);
}

.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
}
</style>

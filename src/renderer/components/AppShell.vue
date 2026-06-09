<template>
  <main
    class="app-shell"
  >
    <TeamRail
      :teams="snapshot.teams"
      :active-team-id="activeTeam?.id ?? null"
      :cockpit-active="cockpitVisible"
      :rate-limits="snapshot.accountRateLimits"
      class="app-shell__team-rail"
      @close-team="$emit('close-team', $event)"
      @edit-team="openEditTeam"
      @new-team="openNewTeam"
      @open-settings="settingsDialogVisible = true"
      @quit="quit"
      @reorder-teams="$emit('reorder-teams', $event)"
      @select-cockpit="openCockpit"
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
    <section class="app-shell__agent">
      <CockpitView
        v-if="cockpitVisible"
        :agents="snapshot.agents"
        :bench="snapshot.bench"
        :teams="snapshot.teams"
        @add-agent="openNewAgent"
        @deploy-bench-template="$emit('deploy-bench-template', $event)"
        @prompt-agent="$emit('send-agent-prompt', $event)"
        @remove-bench-template="$emit('remove-bench-template', $event)"
        @select-agent="selectAgentFromCockpit"
        @select-team="selectTeamFromRail"
      />
      <template v-else>
        <AgentHeader
          v-if="!isAgentEmpty && currentAgent"
          :agent="currentAgent"
          :backend-runtime="currentBackendRuntime"
          :is-loading="isLoading"
          :sidebar-collapsed="agentSidebarCollapsed"
          @expand-sidebar="agentSidebarCollapsed = false"
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
            @open-markdown-file="openMarkdownFile"
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
          />
        </div>
      </template>
    </section>
    <AgentDialog
      :visible="agentDialogVisible"
      :mode="agentDialogMode"
      :agent="editingAgent"
      :choose-agent-folder="chooseAgentFolder"
      :create-agent="createAgentFromDialog"
      :update-agent="updateAgent"
      @close="closeAgentDialog"
    />
    <TeamDialog
      :visible="teamDialogVisible"
      :mode="teamDialogMode"
      :team="editingTeam"
      :create-team="createTeam"
      :update-team="updateTeam"
      @close="teamDialogVisible = false"
    />
    <SettingsDialog
      v-model:visible="settingsDialogVisible"
      :settings="snapshot.theme"
      :update-settings="updateSettings"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Agent, AgentFileReadResult, AgentFileSearchItem, AppCommand, AppSnapshot, BackendCapabilities, BackendCommandSummary, BackendModelOption, BackendRuntimeStatus, BackendSkillSummary, ClientRequestResponse, CodexApprovalPreset, CreateAgentInput, CreateTeamInput, DeployBenchTemplateInput, MoveAgentToTeamInput, ReasoningEffort, RendererMessage, ReorderAgentsInput, ReorderTeamsInput, SidePanelMarkdownRequest, Team, ThreadGoal, UpdateAgentInput, UpdateSettingsInput, UpdateTeamInput } from '../../shared/contracts';
import { defaultBackendCapabilities } from '../../shared/backend-capabilities';
import AgentDialog from './AgentDialog.vue';
import AgentEmptyState from './AgentEmptyState.vue';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import CockpitView from './CockpitView.vue';
import ConversationPane from './ConversationPane.vue';
import SidePanel from './SidePanel.vue';
import TeamDialog from './TeamDialog.vue';
import TeamRail from './TeamRail.vue';
import SettingsDialog from './SettingsDialog.vue';
import { confirmCloseTeam } from './team-close-confirmation';
import type { QueuedChatPrompt } from '../shared/chat/queued-prompts';
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
  sidePanelMarkdownRequest?: SidePanelMarkdownRequest | null;
  chooseAgentFolder?: () => Promise<string | null>;
  readAgentFile?: (agentId: string, filePath: string) => Promise<AgentFileReadResult>;
  createAgent?: (input: CreateAgentInput) => Promise<void>;
  createTeam?: (input: CreateTeamInput) => Promise<void>;
  updateTeam?: (input: UpdateTeamInput) => Promise<void>;
  updateAgent?: (input: UpdateAgentInput) => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
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
  sidePanelMarkdownRequest: null,
  chooseAgentFolder: async () => null,
  readAgentFile: async () => {
    throw new Error('File preview is not available.');
  },
  createAgent: async () => undefined,
  createTeam: async () => undefined,
  updateTeam: async () => undefined,
  updateAgent: async () => undefined,
  updateSettings: async () => undefined,
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

const agentSidebarCollapsed = ref(false);
const agentSidebarMinWidth = 80;
const agentSidebarMaxWidth = 420;
const agentSidebarWidth = ref(260);
const cockpitVisible = ref(false);
const agentDialogVisible = ref(false);
const agentDialogMode = ref<'create' | 'edit'>('create');
const editingAgentId = ref<string | null>(null);
const agentDialogTeamId = ref<string | null>(null);
const teamDialogVisible = ref(false);
const teamDialogMode = ref<'create' | 'edit'>('create');
const editingTeamId = ref<string | null>(null);
const settingsDialogVisible = ref(false);
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
const isAgentEmpty = computed(() => activeTeamAgents.value.length === 0);
const showAgentSidebar = computed(() => !cockpitVisible.value && !agentSidebarCollapsed.value && !isAgentEmpty.value);
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
}

async function createAgentFromDialog(input: CreateAgentInput): Promise<void> {
  const teamId = agentDialogMode.value === 'create' ? agentDialogTeamId.value : null;
  await props.createAgent(teamId ? { ...input, teamId } : input);
}

function openCockpit(): void {
  closeSidePanel();
  cockpitVisible.value = true;
}

function selectTeamFromRail(teamId: string): void {
  cockpitVisible.value = false;
  emit('select-team', teamId);
}

function selectAgentFromShell(agentId: string): void {
  cockpitVisible.value = false;
  emit('select-agent', agentId);
}

function selectAgentFromCockpit(payload: { agentId: string; teamId: string }): void {
  cockpitVisible.value = false;
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

async function openMarkdownFile(filePath: string): Promise<void> {
  const agent = currentAgent.value;
  const trimmedPath = filePath.trim();
  if (!agent || !trimmedPath) {
    return;
  }

  const requestId = sidePanelRequestId + 1;
  sidePanelRequestId = requestId;
  sidePanel.value = {
    kind: 'markdown',
    title: fileBasename(trimmedPath),
    subtitle: trimmedPath,
    content: '',
    state: 'loading',
    error: null,
  };

  try {
    const result = await props.readAgentFile(agent.id, trimmedPath);
    if (requestId !== sidePanelRequestId) {
      return;
    }
    sidePanel.value = {
      kind: 'markdown',
      title: fileBasename(result.path),
      subtitle: result.path,
      content: result.content,
      state: 'idle',
      error: null,
    };
  } catch (error) {
    if (requestId !== sidePanelRequestId) {
      return;
    }
    sidePanel.value = {
      kind: 'markdown',
      title: fileBasename(trimmedPath),
      subtitle: trimmedPath,
      content: '',
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleShellShortcut(event: KeyboardEvent): void {
  if (agentDialogVisible.value || teamDialogVisible.value || settingsDialogVisible.value) {
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
  if (agentDialogVisible.value || teamDialogVisible.value || settingsDialogVisible.value) {
    return;
  }

  if (command.type === 'cycle-teams') {
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
    closeActiveAgent();
    return;
  }

  if (command.type === 'close-active-team') {
    void closeActiveTeam();
    return;
  }

  if (command.type === 'quit') {
    void quit();
    return;
  }

  if (command.type === 'cycle-agents') {
    cycleAgents(command.direction);
    return;
  }

  if (command.type === 'edit-active-agent') {
    editActiveAgent();
    return;
  }

  if (command.type === 'duplicate-active-agent') {
    duplicateActiveAgent();
    return;
  }

  if (command.type === 'restart-active-agent') {
    restartActiveAgent();
  }
}

async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  await props.updateSettings(input);
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

watch(() => props.sidePanelMarkdownRequest, (request) => {
  if (!request) {
    return;
  }

  openMarkdownRequest(request);
}, { immediate: true });

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

.app-shell__agent {
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

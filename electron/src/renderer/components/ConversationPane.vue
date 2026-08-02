<template>
  <div class="conversation-pane">
    <CodexConversationPane
      v-model="composerDraft"
      class="conversation-pane__surface"
      :answered-client-request-ids="answeredClientRequestIds"
      :approvals="approvals"
      :approval-preset="approvalPreset"
      :attach-enabled="backendCapabilities.attachments"
      :busy="isSending"
      :can-delete-message="backendCapabilities.rollback"
      :can-edit-message="backendCapabilities.editMessage"
      :can-retry-message="backendCapabilities.retryMessage"
      :capabilities="conversationCapabilities"
      :commands="backendCommands"
      :context-usage="agent?.contextUsage ?? null"
      :conversation-key="conversationKey"
      :disabled="!agent"
      :empty-description="heroSubhead"
      :empty-title="heroHeadline"
      :files="agentFiles"
      :goal="goal ?? null"
      :history-loading="isHydratingHistory"
      :messages="chatMessages"
      :model-catalog-status="modelCatalogStatus"
      :models="backendModels"
      :placeholder="composerPlaceholder"
      :plan-mode="planMode"
      :queued-prompts="queuedPrompts"
      :selected-model-id="selectedModelId"
      :selected-reasoning-effort="selectedReasoningEffort"
      :skill-catalog-status="skillCatalogStatus"
      :skills="backendSkills"
      @clear-goal="$emit('clear-goal')"
      @client-response="$emit('client-response', $event)"
      @delete-message="$emit('delete-message', $event)"
      @delete-queued-prompt="$emit('delete-queued-prompt', $event)"
      @edit-message="$emit('edit-message', $event)"
      @interrupt="$emit('interrupt-agent')"
      @open-link="openLink"
      @retry-message="$emit('retry-message', $event)"
      @resolve-approval="resolveApproval"
      @select-approval-preset="$emit('select-approval-preset', $event)"
      @steer="$emit('steerPrompt', $event)"
      @steer-queued-prompt="$emit('steer-queued-prompt', $event)"
      @submit="submitPrompt"
      @update:model-id="$emit('select-model', $event)"
      @update:plan-mode="$emit('update:planMode', $event)"
      @update:reasoning-effort="$emit('select-reasoning-effort', $event)"
    />
    <ConversationPlanPanel v-if="plan" :plan="plan" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CodexConversationPane,
  provideCodexChatTranslate,
  toCodexChatMessages,
  type CodexCapabilities,
  type CodexConversationLink,
  type CodexQueuedPromptData as QueuedChatPrompt,
  type SendCodexMessageOptions,
} from 'codex-app-sdk/vue';
import type {
  Agent,
  AgentFileSearchItem,
  ApprovalPreset,
  BackendApprovalDecision,
  BackendApprovalRequest,
  BackendApprovalScope,
  BackendCapabilities,
  BackendCommandSummary,
  BackendModelOption,
  BackendSkillSummary,
  ClientRequestResponse,
  PromptAttachment,
  ReasoningEffort,
  RendererMessage,
  SendPromptOptions,
  ThreadPlan,
} from '@codex-claw/shared/contracts';
import { defaultBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import ConversationPlanPanel from './ConversationPlanPanel.vue';

const { t } = useI18n();
provideCodexChatTranslate((key, params) => t(key, params ?? {}));

const props = withDefaults(defineProps<{
  messages: RendererMessage[];
  agent: Agent | null;
  agentFiles?: AgentFileSearchItem[];
  approvals?: BackendApprovalRequest[];
  goal?: Agent['goal'] | null;
  plan?: ThreadPlan | null;
  isLoading: boolean;
  isSending: boolean;
  answeredClientRequestIds?: Set<string>;
  backendModels?: BackendModelOption[];
  backendCommands?: BackendCommandSummary[];
  backendSkills?: BackendSkillSummary[];
  backendCapabilities?: BackendCapabilities;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  skillCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
  approvalPreset?: ApprovalPreset | null;
  queuedPrompts?: QueuedChatPrompt[];
  planMode?: boolean;
}>(), {
  queuedPrompts: () => [],
  agentFiles: () => [],
  approvals: () => [],
  backendModels: () => [],
  backendCommands: () => [],
  backendSkills: () => [],
  backendCapabilities: () => defaultBackendCapabilities('codex'),
  skillCatalogStatus: 'notLoaded',
  approvalPreset: null,
});

const emit = defineEmits<{
  'clear-goal': [];
  'client-response': [response: ClientRequestResponse];
  'delete-message': [index: number];
  'delete-queued-prompt': [promptId: string];
  'edit-message': [payload: { content: string; index: number }];
  'interrupt-agent': [];
  'open-file': [filePath: string];
  'resolve-approval': [approvalId: string, decision: BackendApprovalDecision, scope: BackendApprovalScope];
  'retry-message': [index: number];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  'select-approval-preset': [preset: ApprovalPreset];
  'steer-queued-prompt': [promptId: string];
  'update:planMode': [enabled: boolean];
  sendPrompt: [prompt: string, options?: SendPromptOptions];
  steerPrompt: [prompt: string];
}>();

const composerDraft = ref('');
const chatMessages = computed(() => toCodexChatMessages(props.messages));
const conversationKey = computed(() => {
  const session = props.agent?.backendSession;
  if (session?.kind === 'codex') return `codex:${session.threadId}`;
  if (session?.kind === 'claude') return `claude:${session.sessionId}`;
  return props.agent ? `agent:${props.agent.id}` : 'no-agent';
});
const conversationCapabilities = computed<CodexCapabilities>(() => ({
  models: props.backendCapabilities.models,
  skills: props.backendCapabilities.skills,
  reasoningEffort: props.backendCapabilities.reasoningEffort,
  planMode: props.backendCapabilities.planMode !== 'unsupported',
  goals: props.backendCapabilities.goals,
  steerPrompt: props.backendCapabilities.steerPrompt,
  interrupt: props.backendCapabilities.interrupt,
  history: props.backendCapabilities.history,
  rollback: props.backendCapabilities.rollback,
  editMessage: props.backendCapabilities.editMessage,
  retryMessage: props.backendCapabilities.retryMessage,
  approvals: props.backendCapabilities.approvals,
  approvalPresets: props.backendCapabilities.approvalPresets ?? [],
}));
const composerPlaceholder = computed(() => {
  if (!props.agent) return 'Select an agent';
  return props.isSending ? `${backendLabel.value} is working...` : 'Ask for follow-up changes';
});
const backendLabel = computed(() => (props.agent?.backend === 'claude' ? 'Claude' : 'Codex'));
const isHydratingHistory = computed(() => (
  Boolean(props.agent?.backendSession)
  && props.messages.length === 0
  && props.isLoading
));
const heroHeadline = computed(() => (props.agent ? `Chat with ${props.agent.name}` : 'Select an agent'));
const heroSubhead = computed(() => {
  if (!props.agent) return 'Choose an agent from the left to start a native backend session.';
  return props.agent.folder;
});

watch(conversationKey, () => {
  composerDraft.value = '';
});

function openLink(link: CodexConversationLink): void {
  if (link.kind === 'file') emit('open-file', link.path);
}

function resolveApproval(
  approvalId: string,
  decision: BackendApprovalDecision,
  scope: BackendApprovalScope,
): void {
  emit('resolve-approval', approvalId, decision, scope);
}

function submitPrompt(prompt: string, options?: SendCodexMessageOptions): void {
  const attachments = options?.attachments?.map<PromptAttachment>((attachment) => ({
    ...attachment,
  }));
  if (attachments?.length) {
    emit('sendPrompt', prompt, { attachments });
  } else {
    emit('sendPrompt', prompt);
  }
}
</script>

<style scoped>
.conversation-pane {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--color-shell-main);
}

.conversation-pane__surface {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}
</style>

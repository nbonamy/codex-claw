<template>
  <div class="conversation-pane">
    <CodexConversationPane
      ref="surface"
      :composer-state="composerState"
      :attachments="attachments"
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
      :messages="presentedChatMessages"
      :model-catalog-status="modelCatalogStatus"
      :models="backendModels"
      :placeholder="composerPlaceholder"
      :plan-mode="planMode"
      :queued-prompts="queuedPrompts"
      :selected-model-id="selectedModelId"
      :selected-reasoning-effort="selectedReasoningEffort"
      :selected-service-tier="selectedServiceTier"
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
      @steer="steerPrompt"
      @steer-queued-prompt="$emit('steer-queued-prompt', $event)"
      @submit="submitPrompt"
      @update:model-id="$emit('select-model', $event)"
      @update:composer-state="updateComposerState"
      @attachments-change="updateComposerAttachments"
      @update:plan-mode="$emit('update:planMode', $event)"
      @update:reasoning-effort="$emit('select-reasoning-effort', $event)"
      @update:service-tier="$emit('select-service-tier', $event)"
    >
      <template #message-header="{ message }">
        <span
          v-if="collaborationMessageLabel(message.id)"
          class="conversation-pane__message-header"
        >{{ collaborationMessageLabel(message.id) }}</span>
      </template>
    </CodexConversationPane>
    <ConversationPlanPanel
      v-if="plan && planVisible"
      :plan="plan"
      @close="emit('close-plan')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  CodexConversationPane,
  provideCodexChatTranslate,
  type CodexCapabilities,
  type CodexComposerState,
  type CodexConversationLink,
  type CodexNativeAttachment,
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
  ConversationFileLink,
  PromptAttachment,
  ReasoningEffort,
  RendererMessage,
  SendPromptOptions,
  ThreadPlan,
} from '@codex-claw/shared/contracts';
import { defaultBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import ConversationPlanPanel from './ConversationPlanPanel.vue';
import { presentRendererCollaborationMessage } from '../shared/collaboration-message';
import { provideClawToolPresentation } from '../tool-presentation';

const { t } = useI18n();
const surface = ref<{ focusComposer(): void } | null>(null);
provideCodexChatTranslate((key, params) => t(key, params ?? {}));

const props = withDefaults(defineProps<{
  messages: RendererMessage[];
  agent: Agent | null;
  agents?: readonly Agent[];
  agentFiles?: AgentFileSearchItem[];
  approvals?: BackendApprovalRequest[];
  goal?: Agent['goal'] | null;
  plan?: ThreadPlan | null;
  planVisible?: boolean;
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
  selectedServiceTier?: string | null;
  approvalPreset?: ApprovalPreset | null;
  queuedPrompts?: QueuedChatPrompt[];
  planMode?: boolean;
  composerState?: CodexComposerState;
  attachments?: readonly CodexNativeAttachment[];
}>(), {
  agents: () => [],
  queuedPrompts: () => [],
  agentFiles: () => [],
  approvals: () => [],
  backendModels: () => [],
  backendCommands: () => [],
  backendSkills: () => [],
  backendCapabilities: () => defaultBackendCapabilities('codex'),
  skillCatalogStatus: 'notLoaded',
  approvalPreset: null,
  composerState: () => ({ text: '', selectionStart: 0, selectionEnd: 0 }),
  attachments: () => [],
  planVisible: true,
});
provideClawToolPresentation(
  (key, params) => t(key, params ?? {}),
  (identifier) => props.agents.find((agent) => agent.id === identifier)?.name,
);

const emit = defineEmits<{
  'clear-goal': [];
  'close-plan': [];
  'client-response': [response: ClientRequestResponse];
  'delete-message': [index: number];
  'delete-queued-prompt': [promptId: string];
  'edit-message': [payload: { content: string; index: number }];
  'interrupt-agent': [];
  'open-file': [link: ConversationFileLink];
  'resolve-approval': [approvalId: string, decision: BackendApprovalDecision, scope: BackendApprovalScope];
  'retry-message': [index: number];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  'select-service-tier': [serviceTier: string | null];
  'select-approval-preset': [preset: ApprovalPreset];
  'steer-queued-prompt': [promptId: string];
  'update:planMode': [enabled: boolean];
  'update:composerState': [payload: { agentId: string; state: CodexComposerState }];
  'update:composerAttachments': [payload: { agentId: string; attachments: readonly CodexNativeAttachment[] }];
  sendPrompt: [prompt: string, options?: SendPromptOptions];
  steerPrompt: [prompt: string, options?: SendPromptOptions];
}>();

const presentedMessages = computed(() => props.messages.map((message) => (
  presentRendererCollaborationMessage(message)
)));
const presentedChatMessages = computed(() => presentedMessages.value.map(({ message }) => message));
const collaborationMessageLabels = computed(() => new Map(
  presentedMessages.value.flatMap(({ message, presentation }) => {
    if (!message.id || !presentation) return [];
    const names = presentation.senderNames.join(', ');
    const label = presentation.messageCount === 1
      ? t('chat.collaboration.messageFrom', { name: names })
      : t('chat.collaboration.messagesFrom', { names });
    return [[message.id, label] as const];
  }),
));
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
  ...(props.backendCapabilities.serviceTier === undefined
    ? {}
    : { serviceTier: props.backendCapabilities.serviceTier }),
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

function openLink(link: CodexConversationLink): void {
  if (link.kind !== 'file') return;
  const context = link as CodexConversationLink & Partial<Pick<ConversationFileLink, 'turnId' | 'messageId' | 'itemId'>>;
  emit('open-file', {
    kind: 'file',
    href: link.href,
    path: link.path,
    ...(link.filepath ? { filepath: link.filepath } : {}),
    ...(link.action ? { action: link.action } : {}),
    ...(link.line === undefined ? {} : { line: link.line }),
    ...(link.column === undefined ? {} : { column: link.column }),
    ...(context.turnId ? { turnId: context.turnId } : {}),
    ...(context.messageId ? { messageId: context.messageId } : {}),
    ...(context.itemId ? { itemId: context.itemId } : {}),
  });
}

function resolveApproval(
  approvalId: string,
  decision: BackendApprovalDecision,
  scope: BackendApprovalScope,
): void {
  emit('resolve-approval', approvalId, decision, scope);
}

function submitPrompt(prompt: string, options?: SendCodexMessageOptions): void {
  const attachments = promptAttachments(options);
  if (attachments?.length) {
    emit('sendPrompt', prompt, { attachments });
  } else {
    emit('sendPrompt', prompt);
  }
}

function steerPrompt(prompt: string, options?: SendCodexMessageOptions): void {
  const attachments = promptAttachments(options);
  if (attachments?.length) {
    emit('steerPrompt', prompt, { attachments });
  } else {
    emit('steerPrompt', prompt);
  }
}

function promptAttachments(options?: SendCodexMessageOptions): PromptAttachment[] | undefined {
  return options?.attachments?.map<PromptAttachment>((attachment) => ({ ...attachment }));
}

function collaborationMessageLabel(messageId: string | undefined): string | null {
  return messageId ? collaborationMessageLabels.value.get(messageId) ?? null : null;
}

function updateComposerState(state: CodexComposerState): void {
  if (!props.agent) return;
  emit('update:composerState', { agentId: props.agent.id, state });
}

function updateComposerAttachments(attachments: readonly CodexNativeAttachment[]): void {
  if (!props.agent) return;
  emit('update:composerAttachments', { agentId: props.agent.id, attachments });
}

function focusComposer(): void {
  surface.value?.focusComposer?.();
}

defineExpose({ focusComposer });
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

.conversation-pane__message-header {
  color: inherit;
  font: inherit;
}

:deep(.chat-tool-call__title-target[href]:hover) {
  text-decoration: underline;
}
</style>

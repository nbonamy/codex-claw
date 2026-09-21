<template>
  <section class="mission-workspace" :aria-label="t('missions.workspace')">
    <header class="mission-workspace__header">
      <button v-if="sidebarCollapsed" type="button" class="mission-workspace__navigation-button" @click="emit('expand-sidebar')">
        {{ t('missions.showNavigation') }}
      </button>
      <div class="mission-workspace__identity">
        <span>{{ t('missions.workflow') }}</span>
        <h1>{{ mission.outcome }}</h1>
      </div>
      <span class="mission-workspace__mission-status" :data-status="mission.status">{{ t(`missions.${mission.status}`) }}</span>
    </header>

    <div class="mission-workspace__body">
      <aside class="mission-workspace__process" :aria-label="t('missions.progress')">
        <div class="mission-workspace__process-heading">
          <TargetArrowIcon aria-hidden="true" />
          <div><strong>{{ t('missions.process') }}</strong></div>
        </div>
        <ol class="mission-workspace__stages">
          <li v-for="(stage, index) in featureStages" :key="stage">
            <button
              type="button"
              :class="{ 'mission-workspace__stage--viewed': viewedStage === stage }"
              :disabled="index > currentIndex"
              :aria-current="stage === mission.stage ? 'step' : undefined"
              @click="viewedStage = stage"
            >
              <span class="mission-workspace__stage-marker" :data-state="stageState(stage)">
                <CheckIcon v-if="stageState(stage) === 'complete'" aria-hidden="true" />
                <span v-else>{{ index + 1 }}</span>
              </span>
              <span class="mission-workspace__stage-copy">
                <strong>{{ t(`missions.${stage}`) }}</strong>
                <small>{{ stageStatus(stage) }}</small>
              </span>
            </button>
          </li>
        </ol>
        <div class="mission-workspace__progress-summary">
          <span>{{ t('missions.stageCount', { current: completedStageCount, total: featureStages.length }) }}</span>
          <strong>{{ progressPercent }}%</strong>
          <div role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: `${progressPercent}%` }" />
          </div>
        </div>
      </aside>

      <main class="mission-workspace__workbench">
        <header class="mission-workspace__stage-header">
          <div class="mission-workspace__stage-heading">
            <h2>{{ stageHeadingTitle }}</h2>
            <span v-if="stageHeadingMeta">{{ stageHeadingMeta }}</span>
          </div>
          <div class="mission-workspace__stage-actions">
            <div v-if="activeStageRun" class="mission-workspace__run-status" role="status" aria-live="polite">
              <span class="mission-workspace__activity-dot" aria-hidden="true" />
              <span>{{ activeStageStatus }}</span>
              <button type="button" :disabled="busy" @click="stopRun(activeStageRun.id)">{{ t('missions.stopRun') }}</button>
            </div>
            <button
              v-else-if="viewedStage === mission.stage && mission.stage !== 'implementation' && activeRun?.proposal && !debugFixture"
              class="claw-button claw-button--primary"
              type="button"
              :disabled="busy"
              @click="approveProposal"
            >
              {{ t('missions.approveAndContinue') }}
              <ArrowRightIcon aria-hidden="true" />
            </button>
            <span v-else-if="viewedStage === mission.stage && activeRun?.proposal && debugFixture" class="mission-workspace__review-status">{{ t('missions.readyForReview') }}</span>
            <span v-else-if="showAcceptedArtifactStatus" class="mission-workspace__accepted-status"><CheckIcon aria-hidden="true" />{{ t('missions.accepted') }}</span>
          </div>
        </header>

        <p v-if="error || artifactError" class="mission-workspace__error" role="alert">{{ error || artifactError }}</p>

        <MissionImplementationBoard
          v-if="viewedStage === 'implementation' && mission.artifacts.tickets.length"
          :agents="agents"
          :mission="mission"
          :busy="busy"
          :read-only="debugFixture"
          @approve="approveImplementationRun"
          @open-conversation="selectConversation"
          @retry="retryImplementationTicket"
          @stop="stopRun"
        />

        <slot v-else-if="viewedStage === 'ship'" name="ship" :open-conversation="selectConversation" />

        <section v-if="viewedStage === 'tickets' && activeRun?.draftTickets?.length && !activeRun.proposal" class="mission-workspace__artifact" :aria-label="t('missions.draftTickets')" aria-live="polite">
          <MissionTicketBoard
            :tickets="visibleTickets"
            annotatable
            :disabled="feedbackBusy || debugFixture"
            :reset-key="feedbackReset"
            @send-comments="sendTicketComments"
          />
        </section>

        <section v-else-if="!['implementation', 'ship'].includes(viewedStage) && viewedStage === mission.stage && activeRun?.proposal" class="mission-workspace__artifact" :aria-label="t('missions.proposal')">
          <MissionTicketBoard
            v-if="viewedStage === 'tickets' && visibleTickets.length"
            :tickets="visibleTickets"
            annotatable
            :disabled="feedbackBusy || debugFixture"
            :reset-key="feedbackReset"
            @send-comments="sendTicketComments"
          />
          <MissionRequirementReview
            v-else-if="viewedStage === 'requirements'"
            :content="artifactMarkdown"
            :disabled="feedbackBusy || debugFixture"
            :reset-key="feedbackReset"
            @send-comments="sendRequirementComments"
          />
          <MarkdownPanel v-else :content="artifactMarkdown" />
          <footer v-if="viewedStage !== 'requirements'" class="mission-workspace__review-hint">
            <MessageCircleIcon aria-hidden="true" />
            <span>{{ t('missions.reviewInConversation') }}</span>
          </footer>
        </section>

        <section v-else-if="!['implementation', 'ship'].includes(viewedStage) && artifactMarkdown" class="mission-workspace__artifact" :aria-label="t('missions.acceptedArtifact')">
          <MissionTicketBoard v-if="viewedStage === 'tickets' && visibleTickets.length" :tickets="visibleTickets" />
          <MarkdownPanel v-else :content="artifactMarkdown" />
        </section>

        <section v-else-if="!['implementation', 'ship'].includes(viewedStage) && !activeStageRun" class="mission-workspace__empty-artifact">
          <span class="mission-workspace__callout-icon"><FileTextIcon aria-hidden="true" /></span>
          <h3>{{ t('missions.noArtifactYet') }}</h3>
          <p>{{ t(conversationAgentId ? 'missions.keepWorkingInConversation' : 'missions.orchestratorStarting') }}</p>
          <button
            v-if="mission.execution && !activeRun && mission.status !== 'completed'"
            class="claw-button claw-button--primary"
            type="button"
            :disabled="busy || !executeMission"
            @click="continueMission"
          >
            <PlayerPlayIcon aria-hidden="true" />{{ t('missions.continueMission') }}
          </button>
        </section>

        <slot v-if="codeAgentId && ['implementation', 'review'].includes(viewedStage) && !debugFixture" name="code-review" :agent-id="codeAgentId" />
      </main>

      <aside class="mission-workspace__conversation" :aria-label="t('missions.support')">
        <header>
          <div><h2>{{ conversationHeaderTitle }}</h2><p>{{ conversationHeaderHint }}</p></div>
          <MessageCircleIcon aria-hidden="true" />
        </header>
        <div
          v-if="missionConversations.length > 1"
          class="mission-workspace__conversation-switcher"
          role="tablist"
          :aria-label="t('missions.conversations')"
        >
          <button
            v-for="conversation in missionConversations"
            :key="conversation.agentId"
            type="button"
            role="tab"
            :aria-selected="conversation.agentId === conversationAgentId"
            @click="selectedConversationAgentId = conversation.agentId"
          >
            {{ conversationLabel(conversation) }}
          </button>
        </div>
        <slot v-if="conversationAgentId" name="conversation" :agent-id="conversationAgentId" />
        <div v-else class="mission-workspace__conversation-empty">
          <SparklesIcon aria-hidden="true" />
          <p>{{ t(mission.stage === 'ship' ? 'missions.shipConversationHint' : 'missions.orchestratorStarting') }}</p>
        </div>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import type { Agent } from '@codex-claw/core/contracts';
import { featureStages, type Mission, type MissionArtifacts, type MissionStage } from '@codex-claw/core/missions';
import { pendingMissionRun, type MissionArtifactReadResult, type MissionExecutionInput } from '@codex-claw/core/mission-execution';
import { ArrowRightIcon, CheckIcon, FileTextIcon, MessageCircleIcon, PlayerPlayIcon, SparklesIcon, TargetArrowIcon } from '../shared/icons/app-icons';
import MarkdownPanel from './MarkdownPanel.vue';
import MissionImplementationBoard from './MissionImplementationBoard.vue';
import MissionRequirementReview, { type MissionRequirementComment } from './MissionRequirementReview.vue';
import MissionTicketBoard, { type MissionTicketComment } from './MissionTicketBoard.vue';

const props = withDefaults(defineProps<{
  agents?: Agent[];
  sidebarCollapsed?: boolean;
  executeMission?: (input: MissionExecutionInput) => Promise<void>;
  mission: Mission;
  readMissionArtifact?: (missionId: string, stage: MissionStage) => Promise<MissionArtifactReadResult>;
  sendMissionPrompt?: (prompt: string) => Promise<void> | void;
}>(), { agents: () => [] });
const emit = defineEmits<{ 'open-conversation': [agentId: string]; 'expand-sidebar': [] }>();
const { t } = useI18n();
const busy = ref(false);
const error = ref('');
const artifactError = ref('');
const feedbackBusy = ref(false);
const feedbackReset = ref(0);
const viewedStage = ref<MissionStage>(props.mission.stage);
const canonicalArtifact = ref('');
let artifactRead = 0;
const activeRun = computed(() => pendingMissionRun(props.mission));
const activeStageRun = computed(() => (
  viewedStage.value === props.mission.stage
  && !['implementation', 'ship'].includes(viewedStage.value)
  && activeRun.value
  && !activeRun.value.proposal
    ? activeRun.value
    : undefined
));
const activeStageStatus = computed(() => {
  const run = activeStageRun.value;
  if (!run) return '';
  return run.status === 'running'
    ? t(`missions.stageActivity.${run.stage}`)
    : t(`missions.runStatus.${run.status}`);
});
const debugFixture = computed(() => props.mission.execution?.debugFixture === true);
const stageHeadingTitle = computed(() => (
  viewedStage.value === 'implementation'
    ? t('missions.implementation')
    : t(`missions.artifactTitle.${viewedStage.value}`)
));
const currentIndex = computed(() => featureStages.indexOf(props.mission.stage));
const completedStageCount = computed(() => props.mission.status === 'completed' ? featureStages.length : currentIndex.value);
const progressPercent = computed(() => Math.round((completedStageCount.value / featureStages.length) * 100));
const codeAgentId = computed(() => props.mission.execution?.runs.slice().reverse().find(run => run.workerId)?.workerId);
const preferredConversationAgentId = computed(() => activeRun.value?.workerId
  ?? props.mission.execution?.runs.slice().reverse().find(run => run.stage === props.mission.stage && run.workerId)?.workerId
  ?? props.mission.stageAgentIds[props.mission.stage]
  ?? '');
const missionConversations = computed(() => {
  const conversations = new Map<string, { agentId: string; run: NonNullable<Mission['execution']>['runs'][number] }>();
  for (const run of props.mission.execution?.runs ?? []) {
    if (run.workerId) conversations.set(run.workerId, { agentId: run.workerId, run });
  }
  return [...conversations.values()];
});
const selectedConversationAgentId = ref('');
const conversationAgentId = computed(() => (
  missionConversations.value.some(conversation => conversation.agentId === selectedConversationAgentId.value)
    ? selectedConversationAgentId.value
    : preferredConversationAgentId.value
));
const selectedConversation = computed(() => missionConversations.value.find(conversation => conversation.agentId === conversationAgentId.value));
const conversationHeaderTitle = computed(() => {
  const conversation = selectedConversation.value;
  if (conversation?.run.stage !== 'implementation') return t('missions.orchestrator');
  const agent = props.agents.find(agent => agent.id === conversation.agentId)
    ?? props.agents.find(agent => agent.id === conversation.run.memberId);
  return agent ? agentDisplayName(agent) : t('missions.implementationAgent');
});
const conversationHeaderHint = computed(() => {
  const run = selectedConversation.value?.run;
  if (run?.stage === 'implementation' && run.ticketIndex !== undefined) {
    return props.mission.artifacts.tickets[run.ticketIndex]?.title ?? t('missions.implementationAgentHint');
  }
  return t('missions.orchestratorHint');
});

watch(preferredConversationAgentId, (id, previous) => {
  if (!selectedConversationAgentId.value || selectedConversationAgentId.value === previous) selectedConversationAgentId.value = id;
}, { immediate: true });
watch(() => props.mission.stage, stage => {
  viewedStage.value = stage;
  selectedConversationAgentId.value = preferredConversationAgentId.value;
});
watch(conversationAgentId, id => { if (id) emit('open-conversation', id); }, { immediate: true });
watch(
  () => [props.mission.id, viewedStage.value, props.mission.artifactFiles?.[viewedStage.value]?.revision] as const,
  async ([missionId, stage, revision]) => {
    const request = ++artifactRead;
    canonicalArtifact.value = '';
    artifactError.value = '';
    if (!revision || !props.readMissionArtifact) return;
    try {
      const artifact = await props.readMissionArtifact(missionId, stage);
      if (request === artifactRead) canonicalArtifact.value = artifact.content;
    } catch (cause) {
      if (request === artifactRead) artifactError.value = cause instanceof Error ? cause.message : String(cause);
    }
  },
  { immediate: true },
);

function conversationLabel(conversation: (typeof missionConversations.value)[number]): string {
  const member = props.agents.find(agent => agent.id === conversation.run.memberId);
  const owner = member ? agentDisplayName(member) : t('missions.orchestrator');
  const ticket = conversation.run.stage === 'implementation' && conversation.run.ticketIndex !== undefined
    ? ` ${conversation.run.ticketIndex + 1}`
    : '';
  return `${owner} · ${t(`missions.${conversation.run.stage}`)}${ticket}`;
}
function selectConversation(agentId: string): void { selectedConversationAgentId.value = agentId; }

function stageState(stage: MissionStage): 'complete' | 'current' | 'upcoming' {
  const index = featureStages.indexOf(stage);
  if (index < currentIndex.value || props.mission.status === 'completed') return 'complete';
  return stage === props.mission.stage ? 'current' : 'upcoming';
}
function stageStatus(stage: MissionStage): string {
  const state = stageState(stage);
  if (state === 'complete') return t('missions.stageComplete');
  if (state === 'upcoming') return t('missions.notStarted');
  if (activeRun.value?.proposal) return t('missions.readyForReview');
  if (activeRun.value) return t(`missions.runStatus.${activeRun.value.status}`);
  if (stage === 'ship') {
    const deliveries = props.mission.execution?.deliveries ?? [];
    return t('missions.shipRepositoryCount', { complete: deliveries.filter(delivery => delivery.status !== 'pending').length, total: deliveries.length });
  }
  return t('missions.readyToStart');
}
const artifactMarkdown = computed(() => canonicalArtifact.value || stageMarkdown(
  viewedStage.value,
  viewedStage.value === props.mission.stage && activeRun.value?.proposal
    ? activeRun.value.proposal
    : props.mission.artifacts,
));
const showAcceptedArtifactStatus = computed(() => (
  stageState(viewedStage.value) === 'complete'
  && !['implementation', 'ship'].includes(viewedStage.value)
  && Boolean(artifactMarkdown.value)
));
const visibleTickets = computed(() => {
  if (viewedStage.value !== 'tickets') return [];
  if (viewedStage.value === props.mission.stage && activeRun.value?.proposal) return activeRun.value.proposal.tickets;
  if (viewedStage.value === props.mission.stage && activeRun.value?.draftTickets?.length) return activeRun.value.draftTickets;
  return props.mission.artifacts.tickets;
});
const stageHeadingMeta = computed(() => {
  if (viewedStage.value !== 'tickets') return '';
  if (viewedStage.value === props.mission.stage && activeRun.value?.draftTickets?.length && !activeRun.value.proposal) {
    return t('missions.draftTicketsHint', { count: activeRun.value.draftTickets.length });
  }
  return visibleTickets.value.length ? t('missions.ticketCount', { count: visibleTickets.value.length }) : '';
});
function stageMarkdown(stage: MissionStage, artifacts: MissionArtifacts): string {
  switch (stage) {
    case 'requirements': return artifacts.requirements.problem.trim() ? `## ${t('missions.problem')}\n\n${artifacts.requirements.problem}\n\n## ${t('missions.acceptance')}\n\n${artifacts.requirements.acceptance}` : '';
    case 'tickets': return artifacts.tickets.map((ticket, index) => [
      `## ${index + 1}. ${ticket.title}`,
      ticket.body?.trim() ?? '',
      ticket.reference ? `[${t('missions.canonicalReference')}](${ticket.reference})` : '',
      ticket.dependsOn?.length ? `${t('missions.blockedBy')}: ${ticket.dependsOn.map(blocker => blocker + 1).join(', ')}` : '',
    ].filter(Boolean).join('\n\n')).join('\n\n');
    case 'implementation': return artifacts.implementation.changes.trim() ? `## ${t('missions.changes')}\n\n${artifacts.implementation.changes}\n\n## ${t('missions.tests')}\n\n${artifacts.implementation.tests}` : '';
    case 'review': return artifacts.review.summary.trim() ? `## ${t('missions.reviewSummary')}\n\n${artifacts.review.summary}${artifacts.review.pullRequestUrl ? `\n\n[${t('missions.pullRequest')}](${artifacts.review.pullRequestUrl})` : ''}` : '';
    case 'ship': return '';
  }
}
async function approveProposal(): Promise<void> {
  const run = activeRun.value;
  if (!run?.proposal || !props.executeMission) return;
  busy.value = true; error.value = '';
  try {
    await props.executeMission({ id: props.mission.id, revision: props.mission.revision, action: 'accept', runId: run.id });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
async function approveImplementationRun(runId: string): Promise<void> {
  if (!props.executeMission) return;
  busy.value = true; error.value = '';
  try {
    await props.executeMission({ id: props.mission.id, revision: props.mission.revision, action: 'accept', runId });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
async function retryImplementationTicket(ticketIndex: number): Promise<void> {
  if (!props.executeMission) return;
  busy.value = true; error.value = '';
  try {
    await props.executeMission({ id: props.mission.id, revision: props.mission.revision, action: 'run', ticketIndex });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
async function continueMission(): Promise<void> {
  if (!props.executeMission) return;
  busy.value = true; error.value = '';
  try { await props.executeMission({ id: props.mission.id, revision: props.mission.revision, action: 'run' }); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
async function stopRun(runId: string): Promise<void> {
  if (!props.executeMission) return;
  busy.value = true; error.value = '';
  try { await props.executeMission({ id: props.mission.id, revision: props.mission.revision, action: 'cancel', runId }); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}
async function sendRequirementComments(comments: MissionRequirementComment[]): Promise<void> {
  if (!props.sendMissionPrompt || comments.length === 0) return;
  feedbackBusy.value = true; error.value = '';
  const details = comments.map((comment, index) => `${index + 1}. On: "${comment.quote}"\n   Comment: ${comment.body}`).join('\n\n');
  try {
    await props.sendMissionPrompt(`${t('missions.requirementFeedbackPrompt')}\n\n${details}`);
    feedbackReset.value += 1;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { feedbackBusy.value = false; }
}
async function sendTicketComments(comments: MissionTicketComment[]): Promise<void> {
  if (!props.sendMissionPrompt || comments.length === 0) return;
  feedbackBusy.value = true; error.value = '';
  const details = comments.map((comment, index) => [
    `${index + 1}. ${t('missions.ticketCommentTarget', { number: comment.ticketNumber, title: comment.ticketTitle })}`,
    `   ${t('missions.commentQuote')}: "${comment.quote}"`,
    `   ${t('missions.commentBody')}: ${comment.body}`,
  ].join('\n')).join('\n\n');
  try {
    await props.sendMissionPrompt(`${t('missions.ticketFeedbackPrompt')}\n\n${details}`);
    feedbackReset.value += 1;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { feedbackBusy.value = false; }
}
</script>

<style scoped>
.mission-workspace { container-type: inline-size; display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; overflow: hidden; background: var(--color-surface-lowest); }
.mission-workspace__header { display: flex; min-height: 64px; align-items: center; gap: var(--space-8); padding: 0 var(--space-10); border-bottom: 1px solid var(--color-border); }
.mission-workspace__navigation-button { border: 0; color: var(--color-primary); background: transparent; cursor: pointer; }
.mission-workspace__identity { min-width: 0; flex: 1; }
.mission-workspace__identity > span, .mission-workspace__stage-header small { color: var(--color-text-muted); font-size: var(--font-size-12); }
.mission-workspace h1, .mission-workspace h2, .mission-workspace h3, .mission-workspace p { margin: 0; }
.mission-workspace h1 { overflow: hidden; margin-top: var(--space-1); font-size: var(--font-size-18); font-weight: var(--font-weight-semibold); text-overflow: ellipsis; white-space: nowrap; }
.mission-workspace__mission-status, .mission-workspace__review-status, .mission-workspace__accepted-status { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-6); border-radius: var(--radius-full); color: var(--color-on-primary-container); background: var(--color-primary-container); font-size: var(--font-size-12); white-space: nowrap; }
.mission-workspace__mission-status[data-status='completed'], .mission-workspace__accepted-status { color: var(--color-on-success-container); background: var(--color-success-container); }
.mission-workspace__accepted-status svg { width: var(--icon-sm); height: var(--icon-sm); }
.mission-workspace__body { display: grid; grid-template-columns: minmax(210px, 238px) minmax(360px, 1fr) minmax(300px, 36%); flex: 1; min-height: 0; }
.mission-workspace__process { display: flex; min-height: 0; flex-direction: column; padding: var(--space-10) var(--space-8); border-right: 1px solid var(--color-border); background: var(--color-surface-low); }
.mission-workspace__process-heading { display: flex; align-items: center; gap: var(--space-6); padding: 0 var(--space-4) var(--space-10); }
.mission-workspace__process-heading > svg { width: var(--icon-lg); height: var(--icon-lg); color: var(--color-primary); }
.mission-workspace__process-heading div, .mission-workspace__stage-copy { display: grid; min-width: 0; gap: var(--space-1); }
.mission-workspace__process-heading span, .mission-workspace__stage-copy small { overflow: hidden; color: var(--color-text-muted); font-size: var(--font-size-12); text-overflow: ellipsis; white-space: nowrap; }
.mission-workspace__stages { display: grid; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
.mission-workspace__stages button { display: flex; width: 100%; align-items: center; gap: var(--space-6); padding: var(--space-6); border: 0; border-radius: var(--radius-lg); color: var(--color-text); background: transparent; text-align: left; cursor: pointer; }
.mission-workspace__stages button:disabled { color: var(--color-text-muted); cursor: default; }
.mission-workspace__stages .mission-workspace__stage--viewed { background: var(--color-primary-container); }
.mission-workspace__stage-marker { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border: 2px solid var(--color-border-strong); border-radius: var(--radius-full); background: var(--color-surface-lowest); font-size: var(--font-size-12); }
.mission-workspace__stage-marker[data-state='current'] { border-color: var(--color-primary); color: var(--color-primary); }
.mission-workspace__stage-marker[data-state='complete'] { border-color: var(--color-success); color: var(--color-on-success); background: var(--color-success); }
.mission-workspace__stage-marker svg { width: var(--icon-sm); height: var(--icon-sm); }
.mission-workspace__progress-summary { display: grid; grid-template-columns: 1fr auto; gap: var(--space-4); margin-top: auto; padding: var(--space-8) var(--space-4) 0; border-top: 1px solid var(--color-border); font-size: var(--font-size-12); }
.mission-workspace__progress-summary [role='progressbar'] { height: 6px; grid-column: 1 / -1; overflow: hidden; border-radius: var(--radius-full); background: var(--color-surface-high); }
.mission-workspace__progress-summary [role='progressbar'] span { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); }
.mission-workspace__workbench { min-width: 0; padding: var(--space-12); overflow: auto; }
.mission-workspace__stage-header { position: sticky; top: 0; z-index: 3; display: flex; min-height: 38px; align-items: center; justify-content: space-between; gap: var(--space-10); margin-top: calc(-1 * var(--space-12)); padding-top: var(--space-12); padding-bottom: var(--space-8); border-bottom: 1px solid var(--color-border); background: var(--color-surface-lowest); }
.mission-workspace__stage-heading { display: flex; min-width: 0; align-items: baseline; gap: var(--space-4); }
.mission-workspace__stage-heading > span { color: var(--color-text-muted); font-size: var(--font-size-12); white-space: nowrap; }
.mission-workspace__stage-header h2 { overflow: hidden; font-size: var(--font-size-24); font-weight: var(--font-weight-semibold); text-overflow: ellipsis; white-space: nowrap; }
.mission-workspace__empty-artifact p { color: var(--color-text-muted); line-height: var(--line-height-20); }
.mission-workspace__stage-header button, .mission-workspace__empty-artifact button { display: inline-flex; align-items: center; gap: var(--space-3); white-space: nowrap; }
.mission-workspace__stage-header button svg, .mission-workspace__empty-artifact button svg { width: var(--icon-sm); height: var(--icon-sm); }
.mission-workspace__stage-actions { display: flex; min-height: 34px; align-items: center; }
.mission-workspace__run-status { display: flex; align-items: center; gap: var(--space-3); color: var(--color-text-muted); font-size: var(--font-size-13); white-space: nowrap; }
.mission-workspace__activity-dot { width: var(--space-4); height: var(--space-4); border-radius: var(--radius-full); background: var(--color-primary); animation: mission-workspace-activity-pulse 1.4s ease-in-out infinite; }
.mission-workspace__run-status button { padding: var(--space-2) var(--space-3); border: 0; color: var(--color-text-muted); background: transparent; font: inherit; cursor: pointer; }
.mission-workspace__run-status button:hover:not(:disabled), .mission-workspace__run-status button:focus-visible { color: var(--color-text); }
.mission-workspace__run-status button:disabled { cursor: default; opacity: 0.5; }
.mission-workspace__error { margin-top: var(--space-8) !important; padding: var(--space-6); border-radius: var(--radius-md); color: var(--color-on-error-container); background: var(--color-error-container); }
.mission-workspace__empty-artifact { display: flex; max-width: 700px; align-items: center; flex-direction: column; gap: var(--space-8); margin: var(--space-16) auto; padding: var(--space-10); border: 1px solid var(--color-border); border-radius: var(--radius-xl); background: var(--color-surface-low); text-align: center; }
.mission-workspace__callout-icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: var(--radius-lg); color: var(--color-primary); background: var(--color-primary-container); }
.mission-workspace__callout-icon svg { width: var(--icon-lg); height: var(--icon-lg); }
.mission-workspace__artifact { max-width: 800px; margin: var(--space-8) auto 0; }
.mission-workspace__review-hint { display: flex; align-items: center; gap: var(--space-4); margin-top: var(--space-10); padding: var(--space-6); border-top: 1px solid var(--color-border); color: var(--color-text-muted); font-size: var(--font-size-13); }
.mission-workspace__review-hint svg { width: var(--icon-md); height: var(--icon-md); }
.mission-workspace__conversation { display: flex; min-width: 0; min-height: 0; flex-direction: column; border-left: 1px solid var(--color-border); background: var(--color-surface-lowest); }
.mission-workspace__conversation > header { display: flex; align-items: flex-start; gap: var(--space-6); padding: var(--space-10); border-bottom: 1px solid var(--color-border); }
.mission-workspace__conversation > header > div { display: grid; flex: 1; gap: var(--space-2); }
.mission-workspace__conversation > header h2 { font-size: var(--font-size-16); }
.mission-workspace__conversation > header p { color: var(--color-text-muted); font-size: var(--font-size-12); line-height: var(--line-height-18); }
.mission-workspace__conversation > header svg { width: var(--icon-md); height: var(--icon-md); color: var(--color-text-muted); }
.mission-workspace__conversation-switcher { display: flex; gap: var(--space-2); padding: var(--space-4) var(--space-6); overflow-x: auto; border-bottom: 1px solid var(--color-border); }
.mission-workspace__conversation-switcher button { flex: 0 0 auto; padding: var(--space-3) var(--space-4); border: 0; border-radius: var(--radius-full); color: var(--color-text-muted); background: transparent; font: inherit; font-size: var(--font-size-12); cursor: pointer; }
.mission-workspace__conversation-switcher button:hover, .mission-workspace__conversation-switcher button:focus-visible { color: var(--color-text); background: var(--color-surface-high); }
.mission-workspace__conversation-switcher button[aria-selected='true'] { color: var(--color-on-primary-container); background: var(--color-primary-container); }
.mission-workspace__conversation :deep(.conversation-pane) { flex: 1; min-height: 0; }
.mission-workspace__conversation-empty { display: grid; flex: 1; place-items: center; align-content: center; gap: var(--space-4); padding: var(--space-10); color: var(--color-text-muted); text-align: center; }
.mission-workspace__conversation-empty svg { width: var(--icon-xl); height: var(--icon-xl); color: var(--color-primary); }
@keyframes mission-workspace-activity-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .mission-workspace__activity-dot { animation: none; } }
@container (max-width: 980px) { .mission-workspace__body { grid-template-columns: 200px minmax(360px, 1fr); } .mission-workspace__conversation { display: none; } }
@container (max-width: 680px) { .mission-workspace__body { display: flex; overflow: auto; flex-direction: column; } .mission-workspace__process { min-height: auto; border-right: 0; border-bottom: 1px solid var(--color-border); } .mission-workspace__stages { grid-template-columns: repeat(4, minmax(120px, 1fr)); overflow-x: auto; } .mission-workspace__progress-summary { margin-top: var(--space-8); } .mission-workspace__workbench { overflow: visible; } .mission-workspace__stage-header { align-items: flex-start; flex-direction: column; } .mission-workspace__stage-heading { flex-wrap: wrap; } }
</style>

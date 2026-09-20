<template>
  <section class="mission-ship" :aria-label="t('missions.shipBoard')">
    <header class="mission-ship__summary">
      <div>
        <h3>{{ t('missions.shipBoard') }}</h3>
        <p>{{ t('missions.shipRepositoryCount', { complete: completedCount, total: deliveries.length }) }}</p>
      </div>
      <div role="progressbar" :aria-valuenow="completedCount" aria-valuemin="0" :aria-valuemax="deliveries.length">
        <span :style="{ width: `${progressPercent}%` }" />
      </div>
    </header>

    <div class="mission-ship__grid">
      <article v-for="delivery in deliveries" :key="delivery.repositoryPath" class="mission-ship__card" :data-status="delivery.status">
        <button class="mission-ship__repository" type="button" :aria-label="t('missions.shipOpenConversation', { repository: repositoryName(delivery.repositoryPath) })" @click="emit('open-conversation', delivery.agentId)">
          <GitForkIcon aria-hidden="true" />
          <span><strong>{{ repositoryName(delivery.repositoryPath) }}</strong><small>{{ workspaceBranch(delivery.repositoryPath) }}</small></span>
          <ArrowRightIcon aria-hidden="true" />
        </button>
        <div class="mission-ship__status" :data-status="delivery.status">
          <CheckIcon v-if="delivery.status !== 'pending'" aria-hidden="true" />
          {{ statusLabel(delivery.status) }}
        </div>
        <template v-if="delivery.status === 'pending'">
          <p>{{ t('missions.shipActionsHint') }}</p>
          <GitWorkflowControl
            v-if="agent(delivery.agentId)"
            :agent="agent(delivery.agentId)!"
            :git-status="gitStatuses[delivery.agentId]"
            :get-workflow="getWorkflow"
            :generate-message="generateMessage"
            :commit-changes="commitChanges"
            :push-branch="pushBranch"
            :create-pull-request="createPullRequest"
            :merge-branch="mergeBranch"
            @delivery-complete="recordDelivery(delivery.repositoryPath, $event)"
          />
          <p v-else class="mission-ship__error" role="alert">{{ t('missions.shipAgentUnavailable') }}</p>
          <p v-if="errors[delivery.repositoryPath]" class="mission-ship__error" role="alert">{{ errors[delivery.repositoryPath] }}</p>
        </template>
        <a v-else-if="delivery.pullRequest" class="mission-ship__pull-request" :href="delivery.pullRequest.url" target="_blank" rel="noreferrer">
          {{ t('missions.shipPullRequest', { number: delivery.pullRequest.number }) }} <ArrowRightIcon aria-hidden="true" />
        </a>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Agent, AgentGitCommitInput, AgentGitMergeInput, AgentGitMessageGenerationInput, AgentGitMessageGenerationResult, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStatus, AgentGitWorkflow } from '@codex-claw/core/contracts';
import type { Mission } from '@codex-claw/core/missions';
import type { MissionDelivery, MissionExecutionInput } from '@codex-claw/core/mission-execution';
import { ArrowRightIcon, CheckIcon, GitForkIcon } from '../shared/icons/app-icons';
import GitWorkflowControl from './GitWorkflowControl.vue';

const props = defineProps<{
  agents: Agent[];
  executeMission?: (input: MissionExecutionInput) => Promise<void>;
  gitStatuses: Record<string, AgentGitStatus | null | undefined>;
  mission: Mission;
  getWorkflow?: (agentId: string) => Promise<AgentGitWorkflow>;
  generateMessage?: (agentId: string, input: AgentGitMessageGenerationInput) => Promise<AgentGitMessageGenerationResult>;
  commitChanges?: (agentId: string, input: AgentGitCommitInput) => Promise<AgentGitWorkflow>;
  pushBranch?: (agentId: string, input: AgentGitPushInput) => Promise<AgentGitWorkflow>;
  createPullRequest?: (agentId: string, input: AgentGitPullRequestInput) => Promise<AgentGitWorkflow>;
  mergeBranch?: (agentId: string, input: AgentGitMergeInput) => Promise<AgentGitWorkflow>;
}>();
const emit = defineEmits<{ 'open-conversation': [agentId: string] }>();
const { t } = useI18n();
const errors = reactive<Record<string, string>>({});
const deliveries = computed(() => props.mission.execution?.deliveries ?? []);
const completedCount = computed(() => deliveries.value.filter(delivery => delivery.status !== 'pending').length);
const progressPercent = computed(() => deliveries.value.length ? Math.round(completedCount.value / deliveries.value.length * 100) : 0);

function agent(agentId: string): Agent | undefined { return props.agents.find(candidate => candidate.id === agentId); }
function repositoryName(path: string): string { return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path; }
function workspaceBranch(repositoryPath: string): string { return props.mission.execution?.workspaces?.find(workspace => workspace.repositoryPath === repositoryPath)?.branch ?? repositoryPath; }
function statusLabel(status: MissionDelivery['status']): string {
  if (status === 'pullRequestCreated') return t('missions.shipPullRequestCreated');
  if (status === 'merged') return t('missions.shipMerged');
  return t('missions.shipPending');
}
async function recordDelivery(repositoryPath: string, result: { kind: 'pullRequest'; number: number; url: string } | { kind: 'merge' }): Promise<void> {
  errors[repositoryPath] = '';
  try {
    if (!props.executeMission) throw new Error('Mission delivery is unavailable.');
    await props.executeMission({ id: props.mission.id, revision: props.mission.revision, action: 'recordDelivery', repositoryPath, result });
  } catch (cause) {
    errors[repositoryPath] = cause instanceof Error ? cause.message : String(cause);
  }
}
</script>

<style scoped>
.mission-ship {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.mission-ship__summary {
  display: grid;
  grid-template-columns: 1fr minmax(120px, 220px);
  align-items: center;
  gap: var(--space-8);
}

.mission-ship__summary h3,
.mission-ship__summary p,
.mission-ship__card p {
  margin: 0;
}

.mission-ship__summary p,
.mission-ship__repository small,
.mission-ship__card > p {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.mission-ship__summary [role="progressbar"] {
  height: 4px;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-surface-high);
}

.mission-ship__summary [role="progressbar"] span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width 180ms ease;
}

.mission-ship__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-6);
}

.mission-ship__card {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  min-height: 190px;
  gap: var(--space-6);
  padding: var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
}

.mission-ship__card[data-status="pullRequestCreated"],
.mission-ship__card[data-status="merged"] {
  border-color: var(--color-success);
}

.mission-ship__repository {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.mission-ship__repository > svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.mission-ship__repository span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-1);
}

.mission-ship__repository strong,
.mission-ship__repository small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mission-ship__status {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
  font-size: var(--font-size-12);
}

.mission-ship__status[data-status="pullRequestCreated"],
.mission-ship__status[data-status="merged"] {
  color: var(--color-on-success-container);
  background: var(--color-success-container);
}

.mission-ship__status svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-ship__pull-request {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
  text-decoration: none;
}

.mission-ship__pull-request svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.mission-ship__error {
  color: var(--color-error) !important;
}
</style>

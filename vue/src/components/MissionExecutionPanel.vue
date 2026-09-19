<template>
  <section class="mission-execution" :aria-label="t('missions.execution')">
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="!mission.execution">
      <h2>{{ t('missions.execution') }}</h2>
      <FormDialogField :label="t('missions.team')">
        <el-select v-model="teamId" :aria-label="t('missions.team')" :disabled="busy" @change="memberIds = []">
          <el-option v-for="team in localTeams" :key="team.id" :value="team.id" :label="team.name" />
        </el-select>
      </FormDialogField>
      <FormDialogField :label="t('missions.members')">
        <el-select v-model="memberIds" multiple :aria-label="t('missions.members')" :disabled="busy">
          <el-option v-for="agent in teamAgents" :key="agent.id" :value="agent.id" :label="agent.name" />
        </el-select>
      </FormDialogField>
      <FormDialogField :label="t('missions.repository')" label-for="mission-repository">
        <el-input id="mission-repository" v-model="repoPath" :disabled="busy" />
        <button v-if="chooseRepository" class="claw-button" type="button" :disabled="busy" @click="browse">{{ t('missions.browse') }}</button>
      </FormDialogField>
      <p>{{ t('missions.isolationHint') }}</p>
      <button class="claw-button claw-button--primary" type="button" :disabled="busy || !teamId || !memberIds.length || !repoPath.trim()" @click="configure">{{ t('missions.configure') }}</button>
    </template>
    <template v-else>
      <p v-if="mission.execution.workspace" class="mission-execution__workspace">{{ mission.execution.workspace.branch }} · {{ mission.execution.workspace.path }}</p>
      <p v-else>{{ t('missions.worktreePending') }}</p>
      <div v-if="activeRun" role="status">
        <strong>{{ t(`missions.runStatus.${activeRun.status}`) }}</strong> · {{ memberName(activeRun.memberId) }}
        <p v-if="activeRun.skills.length">{{ activeRun.skills.map(skill => skill.name).join(' → ') }}</p>
        <button v-if="activeRun.workerId" class="claw-button" type="button" @click="emit('open-conversation', activeRun.workerId)">{{ t('missions.openConversation') }}</button>
        <button class="claw-button" type="button" :disabled="busy" @click="act({ action: 'cancel', runId: activeRun.id })">{{ t(activeRun.status === 'awaitingReview' ? 'missions.discardProposal' : 'missions.stopRun') }}</button>
      </div>
      <section v-if="activeRun?.proposal" class="mission-execution__proposal" :aria-label="t('missions.proposal')">
        <h2>{{ t('missions.proposal') }}</h2>
        <p>{{ activeRun.summary }}</p>
        <MarkdownPanel :content="proposalMarkdown" />
        <button class="claw-button claw-button--primary" type="button" :disabled="busy" @click="act({ action: 'accept', runId: activeRun.id })">{{ t('missions.acceptProposal') }}</button>
      </section>
      <template v-if="!activeRun && mission.status !== 'completed'">
        <FormDialogField :label="t('missions.assign')">
          <el-select v-model="memberId" clearable :aria-label="t('missions.assign')" :placeholder="t('missions.automaticAssignment')" :disabled="busy || blocked">
            <el-option v-for="agent in availableMembers" :key="agent.id" :value="agent.id" :label="agent.name" />
          </el-select>
        </FormDialogField>
        <FormDialogField :label="t('missions.feedback')" label-for="mission-feedback">
          <el-input id="mission-feedback" v-model="feedback" type="textarea" :rows="2" :disabled="busy || blocked" />
        </FormDialogField>
        <button class="claw-button claw-button--primary" type="button" :disabled="busy || blocked || allTicketsDone" @click="act({ action: 'run', ...(memberId ? { memberId } : {}), feedback })">{{ t('missions.runStage') }}</button>
        <p v-if="blocked">{{ t('missions.saveBeforeRun') }}</p>
      </template>
      <details v-if="mission.execution.runs.length">
        <summary>{{ t('missions.runHistory') }}</summary>
        <ol>
          <li v-for="run in mission.execution.runs" :key="run.id">
            {{ t(`missions.${run.stage}`) }} · {{ memberName(run.memberId) }} · {{ t(`missions.runStatus.${run.status}`) }}
            <p v-if="run.error" role="alert">{{ run.error }}</p>
            <p v-if="run.summary">{{ run.summary }}</p>
            <button v-if="run.workerId" class="claw-button" type="button" @click="emit('open-conversation', run.workerId)">{{ t('missions.openConversation') }}</button>
          </li>
        </ol>
      </details>
      <details v-if="!activeRun">
        <summary>{{ t('missions.revisit') }}</summary>
        <button v-for="stage in reachedStages" :key="stage" class="claw-button" type="button" :disabled="busy || blocked" @click="act({ action: 'reopen', stage })">{{ t(`missions.${stage}`) }}</button>
      </details>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Agent, Team } from '@codex-claw/core/contracts';
import { featureStages, type Mission } from '@codex-claw/core/missions';
import { pendingMissionRun, type MissionExecutionInput } from '@codex-claw/core/mission-execution';
import FormDialogField from '../shared/dialog/FormDialogField.vue';
import MarkdownPanel from './MarkdownPanel.vue';
const props = defineProps<{
  mission: Mission; agents: Agent[]; teams: Team[]; blocked: boolean;
  executeMission: (input: MissionExecutionInput) => Promise<void>;
  chooseRepository?: () => Promise<string | null>;
}>();
const emit = defineEmits<{ 'open-conversation': [agentId: string] }>();
const { t } = useI18n();
const teamId = ref(props.teams.find(team => !team.remoteConnectionId)?.id ?? '');
const memberIds = ref<string[]>([]);
const repoPath = ref('');
const memberId = ref('');
const feedback = ref('');
const busy = ref(false);
const error = ref('');
const localTeams = computed(() => props.teams.filter(team => !team.remoteConnectionId));
const teamAgents = computed(() => props.agents.filter(agent => agent.teamId === teamId.value));
const availableMembers = computed(() => props.agents.filter(agent => props.mission.execution?.memberIds.includes(agent.id)));
const activeRun = computed(() => pendingMissionRun(props.mission));
const allTicketsDone = computed(() => props.mission.stage === 'implementation' && props.mission.artifacts.tickets.every(ticket => ticket.done));
const reachedStages = computed(() => featureStages.slice(0, featureStages.indexOf(props.mission.stage) + 1));
const proposalMarkdown = computed(() => {
  const artifact = activeRun.value?.proposal;
  if (!artifact) return '';
  switch (props.mission.stage) {
    case 'requirements': return `${artifact.requirements.problem}\n\n## ${t('missions.acceptance')}\n\n${artifact.requirements.acceptance}`;
    case 'tickets': return artifact.tickets.map((ticket, index) => `### ${index + 1}. ${ticket.title}\n\n${ticket.reference ?? ''}${ticket.dependsOn?.length ? `\n\n${t('missions.blockedBy')}: ${ticket.dependsOn.map(index => index + 1).join(', ')}` : ''}`).join('\n\n');
    case 'implementation': return `${artifact.implementation.changes}\n\n## ${t('missions.tests')}\n\n${artifact.implementation.tests}`;
    case 'review': return `${artifact.review.summary}\n\n${artifact.review.pullRequestUrl}`;
  }
});
function memberName(id: string): string { return props.agents.find(agent => agent.id === id)?.name ?? id; }
type Command = MissionExecutionInput extends infer Input ? Input extends MissionExecutionInput ? Omit<Input, 'id' | 'revision'> : never : never;
async function act(command: Command) {
  busy.value = true; error.value = '';
  try { await props.executeMission({ ...command, id: props.mission.id, revision: props.mission.revision }); }
  catch (e) { error.value = e instanceof Error ? e.message : String(e); }
  finally { busy.value = false; }
}
async function configure() { await act({ action: 'configure', teamId: teamId.value, memberIds: memberIds.value, repoPath: repoPath.value }); }
async function browse() {
  try { const folder = await props.chooseRepository?.(); if (folder) repoPath.value = folder; }
  catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
</script>
<style scoped>
.mission-execution { display: flex; flex-direction: column; gap: 12px; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 1px solid var(--color-border); }
.mission-execution__workspace { color: var(--color-text-muted); overflow-wrap: anywhere; }
.mission-execution__proposal { display: flex; flex-direction: column; gap: 12px; }
p { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>

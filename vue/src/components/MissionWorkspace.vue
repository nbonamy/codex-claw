<template>
  <section class="mission-workspace" :aria-label="t('missions.workspace')">
    <header class="mission-workspace__header">
      <button v-if="sidebarCollapsed" type="button" class="claw-button" @click="emit('expand-sidebar')">{{ t('missions.showNavigation') }}</button>
      <div>
        <small>{{ t('missions.workflow') }}</small>
        <h1>{{ mission.outcome }}</h1>
      </div>
      <span>{{ t(`missions.${mission.status}`) }}</span>
    </header>
    <ol class="mission-workspace__stages" :aria-label="t('missions.progress')">
      <li
        v-for="(stage, index) in featureStages"
        :key="stage"
        :aria-current="stage === mission.stage ? 'step' : undefined"
      >
        <span>{{
          index < currentIndex || mission.status === 'completed'
            ? '✓'
            : index + 1
        }}</span>
        {{ t(`missions.${stage}`) }}
      </li>
    </ol>
    <div class="mission-workspace__body">
      <form class="mission-workspace__artifacts" @submit.prevent="save('save')">
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="conflicted" role="alert">
          {{ t('missions.conflict') }}
          <button type="button" class="claw-button" @click="reload">
            {{ t('missions.reload') }}
          </button>
        </p>
        <fieldset
          :disabled="busy || mission.status === 'completed' || conflicted"
        >
          <template v-if="mission.stage === 'requirements'">
            <h2>{{ t('missions.requirements') }}</h2>
            <FormDialogField
              :label="t('missions.problem')"
              label-for="mission-problem"
              ><el-input
                id="mission-problem"
                v-model="draft.requirements.problem"
                type="textarea"
                :rows="5"
            /></FormDialogField>
            <FormDialogField
              :label="t('missions.acceptance')"
              label-for="mission-acceptance"
              ><el-input
                id="mission-acceptance"
                v-model="draft.requirements.acceptance"
                type="textarea"
                :rows="5"
            /></FormDialogField>
          </template>
          <template v-else-if="mission.stage === 'tickets'">
            <h2>{{ t('missions.tickets') }}</h2>
            <p>{{ draft.requirements.problem }}</p>
            <p>{{ draft.requirements.acceptance }}</p>
            <div
              v-for="(ticket, index) in draft.tickets"
              :key="index"
              class="mission-workspace__ticket"
            >
              <el-input
                v-model="ticket.title"
                :aria-label="t('missions.ticket', { number: index + 1 })"
              />
              <button
                type="button"
                class="claw-button"
                :aria-label="t('missions.removeTicket', { number: index + 1 })"
                @click="draft.tickets.splice(index, 1)"
              >
                ×
              </button>
            </div>
            <button
              type="button"
              class="claw-button"
              :disabled="draft.tickets.length >= 200"
              @click="draft.tickets.push({ title: '', done: false })"
            >
              {{ t('missions.addTicket') }}
            </button>
          </template>
          <template v-else-if="mission.stage === 'implementation'">
            <h2>{{ t('missions.implementation') }}</h2>
            <el-checkbox
              v-for="(ticket, index) in draft.tickets"
              :key="index"
              v-model="ticket.done"
              >{{ ticket.title }}</el-checkbox
            >
            <FormDialogField
              :label="t('missions.changes')"
              label-for="mission-changes"
              ><el-input
                id="mission-changes"
                v-model="draft.implementation.changes"
                type="textarea"
                :rows="5"
            /></FormDialogField>
            <FormDialogField
              :label="t('missions.tests')"
              label-for="mission-tests"
              ><el-input
                id="mission-tests"
                v-model="draft.implementation.tests"
                type="textarea"
                :rows="4"
            /></FormDialogField>
          </template>
          <template v-else>
            <h2>{{ t('missions.review') }}</h2>
            <p>{{ draft.implementation.changes }}</p>
            <p>{{ draft.implementation.tests }}</p>
            <FormDialogField
              :label="t('missions.reviewSummary')"
              label-for="mission-review"
              ><el-input
                id="mission-review"
                v-model="draft.review.summary"
                type="textarea"
                :rows="5"
            /></FormDialogField>
            <FormDialogField
              :label="t('missions.pullRequest')"
              label-for="mission-pr"
              ><el-input id="mission-pr" v-model="draft.review.pullRequestUrl"
            /></FormDialogField>
          </template>
          <footer v-if="mission.status !== 'completed'">
            <button class="claw-button claw-button--secondary" type="submit">
              {{ t('missions.save') }}
            </button>
            <button
              class="claw-button claw-button--primary"
              type="button"
              :disabled="!ready"
              @click="save('advance')"
            >
              {{
                t(
                  mission.stage === 'review'
                    ? 'missions.complete'
                    : 'missions.advance',
                )
              }}
            </button>
          </footer>
        </fieldset>
        <p role="status">
          {{
            busy
              ? t('missions.saving')
              : dirty
                ? t('missions.unsaved')
                : t('missions.saved')
          }}
        </p>
        <details>
          <summary>{{ t('missions.artifacts') }}</summary>
          <pre>{{ artifactSummary }}</pre>
        </details>
      </form>
      <aside
        class="mission-workspace__support"
        :aria-label="t('missions.support')"
      >
        <h2>{{ t('missions.support') }}</h2>
        <p>{{ t(agents.length ? 'missions.supportHint' : 'missions.noAgents') }}</p>
        <el-select
          v-model="supportAgent"
          :aria-label="t('missions.support')"
          clearable
          :disabled="busy || conflicted || mission.status === 'completed'"
        >
          <el-option
            v-for="agent in agents"
            :key="agent.id"
            :value="agent.id"
            :label="agent.name || agent.conversationTitle || agent.id"
          />
        </el-select>
        <button
          v-if="supportAgent"
          class="claw-button"
          type="button"
          :disabled="busy || conflicted"
          @click="openSupport"
        >
          {{ t('missions.openConversation') }}
        </button>
        <slot
          v-if="conversationVisible"
          name="conversation"
          :agent-id="supportAgent"
        />
      </aside>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Agent } from '@codex-claw/core/contracts';
import {
  featureStages,
  missionStageReady,
  type Mission,
  type UpdateMissionInput,
} from '@codex-claw/core/missions';
import FormDialogField from '../shared/dialog/FormDialogField.vue';
const props = defineProps<{
  sidebarCollapsed?: boolean;
  mission: Mission;
  agents: Agent[];
  updateMission: (input: UpdateMissionInput) => Promise<void>;
}>();
const emit = defineEmits<{ 'open-conversation': [agentId: string]; 'expand-sidebar': [] }>();
const { t } = useI18n();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const draft = ref(clone(props.mission.artifacts));
const stageAgents = ref({ ...props.mission.stageAgentIds });
const revision = ref(props.mission.revision);
const busy = ref(false);
const error = ref('');
const conversationVisible = ref(false);
const supportAgent = computed({
  get: () => stageAgents.value[props.mission.stage] ?? '',
  set: (id: string) => {
    conversationVisible.value = false;
    if (id) stageAgents.value[props.mission.stage] = id;
    else delete stageAgents.value[props.mission.stage];
  },
});
const currentIndex = computed(() => featureStages.indexOf(props.mission.stage));
const ready = computed(() =>
  missionStageReady(props.mission.stage, draft.value),
);
const dirty = computed(
  () =>
    JSON.stringify(draft.value) !== JSON.stringify(props.mission.artifacts) ||
    JSON.stringify(stageAgents.value) !==
      JSON.stringify(props.mission.stageAgentIds),
);
const conflicted = computed(() => revision.value !== props.mission.revision);
const artifactSummary = computed(() =>
  [
    draft.value.requirements.problem,
    draft.value.requirements.acceptance,
    ...draft.value.tickets.map((t) => `${t.done ? '✓' : '○'} ${t.title}`),
    draft.value.implementation.changes,
    draft.value.implementation.tests,
    draft.value.review.summary,
    draft.value.review.pullRequestUrl,
  ]
    .filter(Boolean)
    .join('\n\n'),
);
function reload() {
  draft.value = clone(props.mission.artifacts);
  stageAgents.value = { ...props.mission.stageAgentIds };
  revision.value = props.mission.revision;
  error.value = '';
  conversationVisible.value = false;
}
watch(
  () => props.mission.stage,
  () => {
    conversationVisible.value = false;
  },
);
async function save(action: UpdateMissionInput['action']): Promise<boolean> {
  busy.value = true;
  error.value = '';
  try {
    await props.updateMission({
      id: props.mission.id,
      revision: revision.value,
      artifacts: clone(draft.value),
      stageAgentIds: Object.fromEntries(
        Object.entries(stageAgents.value).filter(([, id]) =>
          props.agents.some((a) => a.id === id),
        ),
      ),
      action,
    });
    await nextTick();
    reload();
    return true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    return false;
  } finally {
    busy.value = false;
  }
}
async function openSupport() {
  const id = supportAgent.value;
  if (props.mission.status !== 'completed' && !(await save('save'))) return;
  emit('open-conversation', id);
  conversationVisible.value = true;
}
</script>
<style scoped>
.mission-workspace {
  container-type: inline-size;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.mission-workspace__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}
h1 {
  font-size: 20px;
  margin: 4px 0;
  overflow-wrap: anywhere;
}
h2 {
  font-size: 16px;
}
small {
  color: var(--color-text-muted);
}
.mission-workspace__stages {
  display: flex;
  gap: 24px;
  list-style: none;
  margin: 0;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.mission-workspace__stages li {
  color: var(--color-text-muted);
}
.mission-workspace__stages [aria-current] {
  color: var(--color-text);
  font-weight: 600;
}
.mission-workspace__body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.mission-workspace__artifacts {
  flex: 1;
  min-width: 0;
  padding: 24px;
  overflow: auto;
}
fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
footer,
.mission-workspace__ticket {
  display: flex;
  gap: 8px;
}
.mission-workspace__support {
  display: flex;
  flex-direction: column;
  width: 34%;
  min-width: 240px;
  padding: 16px;
  border-left: 1px solid var(--color-border);
  overflow: auto;
  gap: 12px;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
p {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
@container (max-width: 720px) {
  .mission-workspace__body { flex-direction: column; overflow: auto; }
  .mission-workspace__artifacts { flex: none; overflow: visible; }
  .mission-workspace__support { width: auto; min-width: 0; border-left: 0; border-top: 1px solid var(--color-border); overflow: visible; }
  footer { flex-wrap: wrap; }
}
</style>

<template>
  <el-dialog
    class="claw-dialog bench-agent-assignment-dialog"
    :model-value="visible"
    :teleported="false"
    width="520px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-form-dialog__header bench-agent-assignment-dialog__header">
        <h2 class="claw-dialog__title">{{ title }}</h2>
        <p class="claw-dialog__subtitle">{{ subtitle }}</p>
      </div>
    </template>

    <form
      class="claw-form-dialog bench-agent-assignment-dialog__form"
      @submit.prevent="submit"
    >
      <section
        v-if="benchTemplates.length > 0"
        class="claw-form-dialog__field bench-agent-assignment-dialog__field"
      >
        <div class="claw-form-dialog__field-heading bench-agent-assignment-dialog__field-heading">
          <label
            class="claw-form-dialog__label bench-agent-assignment-dialog__label"
            for="bench-agent-assignment-dialog-bench"
          >
            Bench
          </label>
          <span class="claw-form-dialog__heading-separator bench-agent-assignment-dialog__heading-separator">•</span>
          <p class="claw-form-dialog__help bench-agent-assignment-dialog__help">Choose the saved agent to deploy.</p>
        </div>
        <div class="claw-form-dialog__control bench-agent-assignment-dialog__input-shell bench-agent-assignment-dialog__input-shell--select">
          <el-select
            id="bench-agent-assignment-dialog-bench"
            v-model="benchTemplateId"
            class="bench-agent-assignment-dialog__select"
            :teleported="false"
          >
            <template
              v-if="selectedBenchTemplate"
              #prefix
            >
              <AgentAvatar
                :avatar="selectedBenchTemplate.avatar"
                :name="selectedBenchTemplate.name"
                size="sm"
              />
            </template>
            <el-option
              v-for="template in benchTemplates"
              :key="template.id"
              :label="benchTemplateLabel(template)"
              :value="template.id"
            >
              <span class="bench-agent-assignment-dialog__bench-option">
                <AgentAvatar
                  :avatar="template.avatar"
                  :name="template.name"
                  size="sm"
                />
                <span class="bench-agent-assignment-dialog__bench-copy">
                  <span>{{ template.name }}</span>
                  <span>{{ folderBasename(template.folder) }}</span>
                </span>
              </span>
            </el-option>
          </el-select>
        </div>
      </section>

      <section class="claw-form-dialog__field bench-agent-assignment-dialog__field">
        <div class="claw-form-dialog__field-heading bench-agent-assignment-dialog__field-heading">
          <label
            class="claw-form-dialog__label bench-agent-assignment-dialog__label"
            for="bench-agent-assignment-dialog-team"
          >
            Team
          </label>
          <span class="claw-form-dialog__heading-separator bench-agent-assignment-dialog__heading-separator">•</span>
          <p class="claw-form-dialog__help bench-agent-assignment-dialog__help">Choose where the agent should be created.</p>
        </div>
        <div class="claw-form-dialog__control bench-agent-assignment-dialog__input-shell bench-agent-assignment-dialog__input-shell--select">
          <el-select
            id="bench-agent-assignment-dialog-team"
            v-model="teamSelection"
            class="bench-agent-assignment-dialog__select"
            :teleported="false"
          >
            <el-option
              v-for="team in teams"
              :key="team.id"
              :label="team.name"
              :value="team.id"
            />
            <el-option
              label="New team"
              :value="newTeamOptionId"
            />
          </el-select>
        </div>
        <div
          v-if="teamSelection === newTeamOptionId"
          class="claw-form-dialog__control claw-form-dialog__input-control bench-agent-assignment-dialog__new-team-control"
        >
          <input
            v-model="newTeamName"
            class="claw-form-dialog__text-input"
            type="text"
            aria-label="New team name"
            placeholder="Enter team name"
          />
        </div>
      </section>
    </form>

    <template #footer>
      <div class="claw-dialog__footer">
        <el-button @click="close">Cancel</el-button>
        <el-button
          type="primary"
          :disabled="!canSave"
          @click="submit"
        >
          {{ confirmLabel }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BenchTemplate, Team } from '@codex-claw/shared/contracts';
import { folderBasename } from '../shared/agent-display';
import AgentAvatar from './AgentAvatar.vue';

export type BenchAgentAssignmentDialogSubmit = {
  benchTemplateId?: string;
  newTeamName?: string;
  teamId?: string;
};

const props = withDefaults(defineProps<{
  benchTemplates?: BenchTemplate[];
  benchTemplatesByTeamId?: Record<string, BenchTemplate[]>;
  confirmLabel?: string;
  initialNewTeamName?: string;
  initialTeamId?: string | null;
  subtitle?: string;
  teams: Team[];
  title?: string;
  visible: boolean;
}>(), {
  benchTemplates: () => [],
  benchTemplatesByTeamId: () => ({}),
  confirmLabel: 'Continue',
  initialNewTeamName: '',
  initialTeamId: null,
  subtitle: 'Choose a Bench agent and target team.',
  title: 'Assign to Bench Agent',
});

const emit = defineEmits<{
  close: [];
  submit: [input: BenchAgentAssignmentDialogSubmit];
}>();

const newTeamOptionId = '__new_team__';
const benchTemplateId = ref('');
const teamSelection = ref('');
const newTeamName = ref('');

const benchTemplates = computed(() => {
  if (teamSelection.value && teamSelection.value !== newTeamOptionId) {
    return props.benchTemplatesByTeamId[teamSelection.value] ?? props.benchTemplates;
  }
  return props.benchTemplates;
});
const teams = computed(() => props.teams);
const selectedBenchTemplate = computed(() => benchTemplates.value.find((template) => template.id === benchTemplateId.value) ?? null);
const canSave = computed(() => (
  benchTemplateId.value.trim().length > 0 &&
  (teamSelection.value === newTeamOptionId ? newTeamName.value.trim().length > 0 : teamSelection.value.trim().length > 0)
));

watch(() => [props.visible, props.initialNewTeamName, props.initialTeamId, props.teams.length, props.benchTemplates.length] as const, () => {
  if (props.visible) {
    resetForm();
  }
}, { immediate: true });

watch(benchTemplates, (templates) => {
  if (!templates.some((template) => template.id === benchTemplateId.value)) {
    benchTemplateId.value = templates[0]?.id ?? '';
  }
});

function submit(): void {
  if (!canSave.value) {
    return;
  }

  emit('submit', {
    ...(benchTemplateId.value ? { benchTemplateId: benchTemplateId.value } : {}),
    ...(teamSelection.value === newTeamOptionId ? { newTeamName: newTeamName.value } : { teamId: teamSelection.value }),
  });
  close();
}

function onVisibilityChanged(nextVisible: boolean): void {
  if (!nextVisible) {
    close();
  }
}

function close(): void {
  emit('close');
}

function resetForm(): void {
  benchTemplateId.value = benchTemplates.value[0]?.id ?? '';
  teamSelection.value = initialTeamSelection();
  newTeamName.value = props.initialNewTeamName;
}

function benchTemplateLabel(template: BenchTemplate): string {
  return `${template.name} · ${folderBasename(template.folder)}`;
}

function initialTeamSelection(): string {
  if (props.initialTeamId && teams.value.some((team) => team.id === props.initialTeamId)) {
    return props.initialTeamId;
  }

  return teams.value[0]?.id ?? newTeamOptionId;
}
</script>

<style scoped>
.bench-agent-assignment-dialog__bench-option {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.bench-agent-assignment-dialog__bench-copy {
  min-width: 0;
  display: flex;
  gap: var(--space-4);
  line-height: var(--line-height-18);
}

.bench-agent-assignment-dialog__bench-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bench-agent-assignment-dialog__bench-copy span:first-child {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

.bench-agent-assignment-dialog__bench-copy span:last-child {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.bench-agent-assignment-dialog__new-team-control {
  margin-top: var(--space-8);
}
</style>

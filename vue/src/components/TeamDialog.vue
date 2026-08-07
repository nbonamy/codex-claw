<template>
  <el-dialog
    class="claw-dialog team-dialog"
    :model-value="visible"
    :teleported="false"
    width="520px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-form-dialog__header team-dialog__header">
        <h2 class="claw-dialog__title">{{ dialogTitle }}</h2>
      </div>
    </template>

    <form
      class="claw-form-dialog team-dialog__form"
      @submit.prevent="submit"
    >
      <div class="team-dialog__group">
        <section class="team-dialog__row team-dialog__field">
          <label
            class="team-dialog__row-label"
            for="team-dialog-connection"
          >Connection</label>
          <div class="team-dialog__row-control">
            <el-select
              id="team-dialog-connection"
              v-model="connectionSelection"
              class="team-dialog__select"
              :disabled="connectionLocked"
            >
              <el-option
                label="Local"
                :value="localConnectionValue"
              />
              <el-option
                v-for="connection in readyRemoteConnections"
                :key="connection.id"
                :label="connection.name"
                :value="connection.id"
              />
            </el-select>
          </div>
        </section>

        <section
          v-if="showRemoteTeamSelection"
          class="team-dialog__row team-dialog__field"
        >
          <label
            class="team-dialog__row-label"
            for="team-dialog-remote-team"
          >Remote team</label>
          <div class="team-dialog__row-control">
            <el-select
              id="team-dialog-remote-team"
              v-model="remoteTeamSelection"
              class="team-dialog__select"
              :loading="remoteTeamsLoading"
            >
              <el-option
                label="Create new remote team"
                :value="newRemoteTeamValue"
              />
              <el-option
                v-for="teamOption in remoteTeamOptions"
                :key="teamOption.id"
                :label="teamOption.name"
                :value="teamOption.id"
              />
            </el-select>
          </div>
        </section>
      </div>

      <div class="team-dialog__group">
        <section
          v-if="showTeamNameInput"
          class="team-dialog__row team-dialog__field"
        >
          <label
            class="team-dialog__row-label"
            for="team-dialog-name"
          >Name</label>
          <div class="team-dialog__row-control team-dialog__name-control">
            <input
              id="team-dialog-name"
              v-model="name"
              class="claw-form-dialog__text-input team-dialog__text-input"
              type="text"
              placeholder="Enter team name"
              autofocus
            />
          </div>
        </section>

        <section class="team-dialog__row team-dialog__field team-dialog__color-row">
          <span class="team-dialog__row-label">Color</span>
          <div
            class="team-dialog__row-control team-dialog__colors"
            role="radiogroup"
            aria-label="Team color"
          >
            <button
              v-for="color in teamColors"
              :key="color"
              class="team-dialog__color"
              :class="{ 'team-dialog__color--selected': color === selectedColor }"
              :style="{ '--team-color': color }"
              type="button"
              role="radio"
              :aria-label="`Use color ${color}`"
              :aria-checked="color === selectedColor"
              @click="selectedColor = color"
            >
              <CheckIcon
                v-if="color === selectedColor"
                aria-hidden="true"
              />
            </button>
          </div>
        </section>
      </div>

      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
      />
    </form>

    <template #footer>
      <div class="claw-dialog__footer">
        <el-button @click="close">Cancel</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!canSave"
          @click="submit"
        >
          {{ submitLabel }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CreateTeamInput, RemoteConnection, Team, UpdateTeamInput } from '@codex-claw/core/contracts';
import { defaultTeamColor, teamColors } from '@codex-claw/core/team-colors';
import { CheckIcon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  createTeam: (input: CreateTeamInput) => Promise<Team | null | void>;
  loadRemoteTeams?: (connectionId: string) => Promise<Team[]>;
  mode?: 'create' | 'edit';
  remoteConnections?: RemoteConnection[];
  team?: Team | null;
  updateTeam?: (input: UpdateTeamInput) => Promise<void>;
  visible: boolean;
}>(), {
  mode: 'create',
  remoteConnections: () => [],
  team: null,
  updateTeam: async () => undefined,
});

const emit = defineEmits<{
  close: [];
}>();

const name = ref('');
const selectedColor = ref<string>(defaultTeamColor);
const localConnectionValue = '__local__';
const newRemoteTeamValue = '__new_remote_team__';
const connectionSelection = ref(localConnectionValue);
const remoteTeamSelection = ref(newRemoteTeamValue);
const remoteTeamOptions = ref<Team[]>([]);
const remoteTeamsLoading = ref(false);
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const selectedExistingRemoteTeam = computed(() => remoteTeamOptions.value.find((team) => team.id === remoteTeamSelection.value) ?? null);
const showRemoteTeamSelection = computed(() => shouldLoadRemoteTeamOptions(selectedRemoteConnectionId.value));
const showTeamNameInput = computed(() => props.mode === 'edit' || connectionSelection.value === localConnectionValue || remoteTeamSelection.value === newRemoteTeamValue);
const canSave = computed(() => (name.value.trim().length > 0 || Boolean(selectedExistingRemoteTeam.value)) && !submitting.value);
const readyRemoteConnections = computed(() => props.remoteConnections.filter((connection) => connection.status === 'ready'));
const selectedRemoteConnectionId = computed(() => (
  connectionLocked.value && props.team?.remoteConnectionId
    ? props.team.remoteConnectionId
    : connectionSelection.value === localConnectionValue ? '' : connectionSelection.value
));
const connectionLocked = computed(() => props.mode === 'edit' && (props.team?.agentIds.length ?? 0) > 0);
const dialogTitle = computed(() => props.mode === 'edit' ? 'Edit Team' : 'Create Team');
const submitLabel = computed(() => props.mode === 'edit' ? 'Save' : 'Create Team');

watch(() => props.visible, (visible) => {
  if (visible) {
    resetForm();
  }
}, { immediate: true });

watch(selectedRemoteConnectionId, (connectionId) => {
  void loadRemoteTeamOptions(connectionId);
});

watch(selectedExistingRemoteTeam, (team) => {
  if (!team) {
    return;
  }
  name.value = team.name;
  selectedColor.value = team.color ?? selectedColor.value;
});

async function submit(): Promise<void> {
  if (!canSave.value) {
    return;
  }

  submitting.value = true;
  errorMessage.value = null;
  try {
    if (props.mode === 'edit' && props.team) {
      const existingRemoteTeam = selectedExistingRemoteTeam.value;
      await props.updateTeam({
        id: props.team.id,
        name: existingRemoteTeam?.name ?? name.value,
        color: existingRemoteTeam?.color ?? selectedColor.value,
        ...(selectedRemoteConnectionId.value ? { remoteConnectionId: selectedRemoteConnectionId.value } : {}),
        ...(existingRemoteTeam ? { remoteTeamId: existingRemoteTeam.id } : {}),
      });
    } else {
      const existingRemoteTeam = selectedExistingRemoteTeam.value;
      await props.createTeam({
        name: existingRemoteTeam?.name ?? name.value,
        color: existingRemoteTeam?.color ?? selectedColor.value,
        ...(selectedRemoteConnectionId.value ? { remoteConnectionId: selectedRemoteConnectionId.value } : {}),
        ...(existingRemoteTeam ? { remoteTeamId: existingRemoteTeam.id } : {}),
      });
    }
    close();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    submitting.value = false;
  }
}

function onVisibilityChanged(nextVisible: boolean): void {
  if (!nextVisible) {
    close();
  }
}

function close(): void {
  errorMessage.value = null;
  emit('close');
}

function resetForm(): void {
  name.value = props.mode === 'edit' ? props.team?.name ?? '' : '';
  selectedColor.value = props.mode === 'edit' ? props.team?.color ?? defaultTeamColor : defaultTeamColor;
  connectionSelection.value = connectionValueForTeam();
  remoteTeamSelection.value = newRemoteTeamValue;
  remoteTeamOptions.value = [];
  errorMessage.value = null;
  submitting.value = false;
  void loadRemoteTeamOptions(selectedRemoteConnectionId.value);
}

function connectionValueForTeam(): string {
  if (props.mode !== 'edit') {
    return localConnectionValue;
  }
  const teamConnectionId = props.team?.remoteConnectionId;
  return teamConnectionId && readyRemoteConnections.value.some((connection) => connection.id === teamConnectionId)
    ? teamConnectionId
    : localConnectionValue;
}

async function loadRemoteTeamOptions(connectionId: string): Promise<void> {
  remoteTeamOptions.value = [];
  remoteTeamSelection.value = newRemoteTeamValue;
  if (!shouldLoadRemoteTeamOptions(connectionId) || !props.loadRemoteTeams) {
    return;
  }

  remoteTeamsLoading.value = true;
  try {
    remoteTeamOptions.value = await props.loadRemoteTeams(connectionId);
  } catch {
    remoteTeamOptions.value = [];
  } finally {
    remoteTeamsLoading.value = false;
  }
}

function shouldLoadRemoteTeamOptions(connectionId: string): boolean {
  if (!connectionId || connectionLocked.value) {
    return false;
  }
  if (props.mode === 'create') {
    return true;
  }
  return connectionId !== (props.team?.remoteConnectionId?.trim() ?? '');
}
</script>

<style scoped>
.team-dialog__form {
  gap: var(--space-10);
}

.team-dialog__group {
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
}

.team-dialog__row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-8);
  min-height: calc(var(--space-20) + var(--space-8));
  padding: 0 var(--space-8);
}

.team-dialog__row + .team-dialog__row {
  border-top: 1px solid var(--color-border);
}

.team-dialog__row-label {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.team-dialog__row-control {
  min-width: 0;
}

.team-dialog__select {
  width: 100%;
}

.team-dialog__select :deep(.el-select__wrapper) {
  min-height: var(--space-20);
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  background: transparent;
  box-shadow: none;
}

.team-dialog__select :deep(.el-select__wrapper:hover),
.team-dialog__select :deep(.el-select__wrapper.is-focused) {
  background: var(--color-surface-low);
  box-shadow: none;
}

.team-dialog__select :deep(.el-select__selected-item),
.team-dialog__select :deep(.el-select__placeholder) {
  color: var(--color-text);
  font-size: var(--font-size-15);
}

.team-dialog__name-control {
  min-height: var(--space-16);
  display: flex;
  align-items: center;
  border-radius: var(--radius-md);
}

.team-dialog__name-control:focus-within {
  background: var(--color-surface-low);
}

.team-dialog__text-input {
  height: var(--space-16);
  padding: 0 var(--space-4);
  line-height: var(--line-height-20);
}

.team-dialog__color-row {
  align-items: start;
  padding-top: var(--space-8);
  padding-bottom: var(--space-8);
}

.team-dialog__color-row .team-dialog__row-label {
  padding-top: var(--space-3);
}

.team-dialog__colors {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  justify-items: center;
  gap: var(--space-4);
}

.team-dialog__color {
  --team-color: var(--color-primary);
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-full);
  color: var(--color-on-primary);
  background: var(--team-color);
  cursor: pointer;
}

.team-dialog__color--selected {
  border-color: var(--color-surface-lowest);
  box-shadow: 0 0 0 2px var(--color-primary);
}

.team-dialog__color svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  stroke-width: 3px;
}
</style>

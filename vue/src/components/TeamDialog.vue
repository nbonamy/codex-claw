<template>
  <FormDialog
    class="team-dialog"
    :model-value="visible"
    :title="dialogTitle"
    @update:model-value="onVisibilityChanged"
  >
    <form class="app-form-dialog" @submit.prevent="submit">
      <FormField
        :label="$t('surface.teamDialog.connection')"
        label-for="team-dialog-connection"
      >
        <div class="app-form-dialog__control">
          <el-select
            id="team-dialog-connection"
            v-model="connectionSelection"
            :disabled="connectionLocked"
          >
            <el-option
              :label="$t('surface.teamDialog.local')"
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
      </FormField>

      <FormField
        v-if="showRemoteTeamSelection"
        :label="$t('surface.teamDialog.remoteTeam')"
        label-for="team-dialog-remote-team"
      >
        <div class="app-form-dialog__control">
          <el-select
            id="team-dialog-remote-team"
            v-model="remoteTeamSelection"
            :loading="remoteTeamsLoading"
          >
            <el-option
              :label="$t('surface.teamDialog.createNewRemoteTeam')"
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
      </FormField>

      <FormField
        v-if="showTeamNameInput"
        :label="$t('surface.teamDialog.name')"
        label-for="team-dialog-name"
      >
        <div class="app-form-dialog__control app-form-dialog__input-control">
          <input
            id="team-dialog-name"
            v-model="name"
            class="app-form-dialog__text-input"
            type="text"
            :placeholder="$t('surface.teamDialog.enterTeamName')"
            autofocus
          />
        </div>
      </FormField>

      <FormField :label="$t('surface.teamDialog.color')">
        <div
          class="team-dialog__colors"
          role="radiogroup"
          :aria-label="$t('surface.teamDialog.teamColor')"
        >
          <button
            v-for="color in teamColors"
            :key="color"
            class="team-dialog__color"
            :class="{ 'team-dialog__color--selected': color === selectedColor }"
            :style="{ '--team-color': color }"
            type="button"
            role="radio"
            :aria-label="$t('dynamic.teamColor', { color })"
            :aria-checked="color === selectedColor"
            @click="selectedColor = color"
          >
            <CheckIcon
              v-if="color === selectedColor"
              aria-hidden="true"
            />
          </button>
        </div>
      </FormField>

      <el-alert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
      />
    </form>

    <template #footer>
      <button class="app-button app-button--tertiary" type="button" @click="close">{{ $t('surface.teamDialog.cancel') }}</button>
      <button
        class="app-button app-button--primary"
        type="button"
        :aria-busy="submitting"
        :disabled="submitting || !canSave"
        @click="submit"
      >
        {{ submitLabel }}
      </button>
    </template>
  </FormDialog>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed, ref, watch } from 'vue';
import type { CreateTeamInput, RemoteConnection, Team, UpdateTeamInput } from '@workspace/core/contracts';
import { defaultTeamColor, teamColors } from '@workspace/core/team-colors';
import FormDialog from '../shared/dialog/FormDialog.vue';
import FormField from '../shared/form/FormField.vue';
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
const dialogTitle = computed(() => props.mode === 'edit' ? translate('surface.teamDialog.editTeam') : translate('surface.teamDialog.createTeam'));
const submitLabel = computed(() => props.mode === 'edit'
  ? translate('surface.teamDialog.save')
  : translate(selectedExistingRemoteTeam.value ? 'surface.teamDialog.connect' : 'surface.teamDialog.createTeam'));

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
.team-dialog__colors {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  justify-items: center;
  gap: var(--space-4);
  margin: var(--space-8) 0;
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

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
        <p class="claw-dialog__subtitle">{{ dialogSubtitle }}</p>
      </div>
    </template>

    <form
      class="claw-form-dialog team-dialog__form"
      @submit.prevent="submit"
    >
      <section class="claw-form-dialog__field team-dialog__field">
        <div class="claw-form-dialog__field-heading team-dialog__field-heading">
          <label
            class="claw-form-dialog__label team-dialog__label"
            for="team-dialog-name"
          >
            Name
          </label>
          <span class="claw-form-dialog__heading-separator team-dialog__heading-separator">•</span>
          <p class="claw-form-dialog__help team-dialog__help">Give this team a name for the sidebar.</p>
        </div>
        <div class="claw-form-dialog__control claw-form-dialog__input-control team-dialog__input-shell">
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

      <section class="claw-form-dialog__field team-dialog__field">
        <div class="claw-form-dialog__field-heading team-dialog__field-heading">
          <span class="claw-form-dialog__label team-dialog__label">Color</span>
          <span class="claw-form-dialog__heading-separator team-dialog__heading-separator">•</span>
          <p class="claw-form-dialog__help team-dialog__help">Choose the team rail color.</p>
        </div>
        <div
          class="claw-form-dialog__control team-dialog__colors"
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
import type { CreateTeamInput, Team, UpdateTeamInput } from '../../shared/contracts';
import { defaultTeamColor, teamColors } from '../../shared/team-colors';
import { CheckIcon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  createTeam: (input: CreateTeamInput) => Promise<Team | null | void>;
  mode?: 'create' | 'edit';
  team?: Team | null;
  updateTeam?: (input: UpdateTeamInput) => Promise<void>;
  visible: boolean;
}>(), {
  mode: 'create',
  team: null,
  updateTeam: async () => undefined,
});

const emit = defineEmits<{
  close: [];
}>();

const name = ref('');
const selectedColor = ref<string>(defaultTeamColor);
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const canSave = computed(() => name.value.trim().length > 0 && !submitting.value);
const dialogTitle = computed(() => props.mode === 'edit' ? 'Edit Team' : 'Create Team');
const dialogSubtitle = computed(() => props.mode === 'edit' ? 'Update team identity' : 'Add a team to Codex Claw');
const submitLabel = computed(() => props.mode === 'edit' ? 'Save' : 'Create Team');

watch(() => props.visible, (visible) => {
  if (visible) {
    resetForm();
  }
}, { immediate: true });

async function submit(): Promise<void> {
  if (!canSave.value) {
    return;
  }

  submitting.value = true;
  errorMessage.value = null;
  try {
    if (props.mode === 'edit' && props.team) {
      await props.updateTeam({
        id: props.team.id,
        name: name.value,
        color: selectedColor.value,
      });
    } else {
      await props.createTeam({
        name: name.value,
        color: selectedColor.value,
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
  errorMessage.value = null;
  submitting.value = false;
}
</script>

<style scoped>
.team-dialog__colors {
  display: grid;
  grid-template-columns: repeat(6, 32px);
  justify-content: center;
  gap: var(--space-8);
  padding: var(--space-16);
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

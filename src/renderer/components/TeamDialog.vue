<template>
  <el-dialog
    class="claw-dialog team-dialog"
    :model-value="visible"
    :teleported="false"
    width="440px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-dialog__header--centered">
        <h2 class="claw-dialog__title">New Team</h2>
        <p class="claw-dialog__subtitle">Add a team to Codex Claw</p>
      </div>
    </template>

    <form
      class="team-dialog__form"
      @submit.prevent="submit"
    >
      <section class="team-dialog__section">
        <label class="team-dialog__row">
          <span class="team-dialog__label">Name</span>
          <input
            v-model="name"
            class="team-dialog__text-input"
            type="text"
            placeholder="Team name"
            autofocus
          />
        </label>
      </section>

      <section class="team-dialog__section team-dialog__section--colors">
        <div
          class="team-dialog__colors"
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
          Create Team
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CreateTeamInput } from '../../shared/contracts';
import { defaultTeamColor, teamColors } from '../../shared/team-colors';
import { CheckIcon } from '../shared/icons/app-icons';

const props = defineProps<{
  createTeam: (input: CreateTeamInput) => Promise<void>;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const name = ref('');
const selectedColor = ref<string>(defaultTeamColor);
const errorMessage = ref<string | null>(null);
const submitting = ref(false);

const canSave = computed(() => name.value.trim().length > 0 && !submitting.value);

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
    await props.createTeam({
      name: name.value,
      color: selectedColor.value,
    });
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
  name.value = '';
  selectedColor.value = defaultTeamColor;
  errorMessage.value = null;
  submitting.value = false;
}
</script>

<style scoped>
.team-dialog__form {
  display: grid;
  gap: var(--space-8);
}

.team-dialog__section {
  display: grid;
  padding: 0 var(--space-6);
  border-radius: var(--radius-xl);
  background: var(--color-surface-low);
}

.team-dialog__section--colors {
  justify-items: center;
  gap: var(--space-8);
  padding-top: var(--space-8);
  padding-bottom: var(--space-8);
}

.team-dialog__row {
  min-height: 56px;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-8);
}

.team-dialog__label {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.team-dialog__text-input {
  min-width: 0;
  border: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
  text-align: right;
  outline: none;
}

.team-dialog__text-input::placeholder {
  color: var(--color-text-muted);
}

.team-dialog__colors {
  padding: var(--space-8) 0;
  display: grid;
  grid-template-columns: repeat(6, 32px);
  gap: var(--space-12);
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

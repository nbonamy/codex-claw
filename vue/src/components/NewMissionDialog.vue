<template>
  <FormDialog
    :model-value="modelValue"
    :title="t('missions.new')"
    :subtitle="t('missions.workflow')"
    @update:model-value="!busy && emit('update:modelValue', $event)"
  >
    <form class="claw-form-dialog__body" @submit.prevent="create">
      <FormDialogField
        :label="t('missions.outcome')"
        label-for="mission-outcome"
        ><el-input
          id="mission-outcome"
          v-model="outcome"
          :maxlength="200"
          :disabled="busy"
          autofocus
      /></FormDialogField>
      <p v-if="error" role="alert">{{ error }}</p>
    </form>
    <template #footer>
      <button
        class="claw-button"
        :disabled="busy"
        @click="emit('update:modelValue', false)"
      >
        {{ t('common.cancel') }}
      </button>
      <button
        class="claw-button claw-button--primary"
        :disabled="busy || !outcome.trim()"
        @click="create"
      >
        {{ t(busy ? 'missions.saving' : 'missions.create') }}
      </button>
    </template>
  </FormDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CreateMissionInput, Mission } from '@codex-claw/core/missions';
import FormDialog from '../shared/dialog/FormDialog.vue';
import FormDialogField from '../shared/dialog/FormDialogField.vue';
const props = defineProps<{
  modelValue: boolean;
  createMission: (input: CreateMissionInput) => Promise<Mission>;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  created: [id: string];
}>();
const { t } = useI18n();
const outcome = ref('');
const error = ref('');
const busy = ref(false);
watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      outcome.value = '';
      error.value = '';
    }
  },
);
async function create() {
  if (busy.value || !outcome.value.trim()) return;
  busy.value = true;
  error.value = '';
  try {
    const mission = await props.createMission({
      outcome: outcome.value.trim(),
      workflowType: 'shapeAndShipFeature',
    });
    emit('created', mission.id);
    emit('update:modelValue', false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

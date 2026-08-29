<template>
  <IdentityPicker
    class="repository-icon-picker"
    :aria-label="`Change icon for ${label}`"
    choose-image-aria-label="Choose repository image"
    choose-image-label="Pick image…"
    crop-title="Adjust repository icon"
    custom-apply-aria-label="Use custom repository icon"
    custom-character-aria-label="Custom repository icon"
    :dialog-label="`Choose icon for ${label}`"
    empty-label="Use default repository icon"
    :model-value="modelValue"
    :name="label"
    preset-noun="repository icon"
    :show-hint="false"
    title="Repository icon"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #fallback>
      <FolderOpenIcon v-if="expanded" aria-hidden="true" />
      <FolderRootIcon v-else aria-hidden="true" />
    </template>
  </IdentityPicker>
</template>

<script setup lang="ts">
import { FolderOpenIcon, FolderRootIcon } from '../shared/icons/app-icons';
import IdentityPicker from '../shared/identity/IdentityPicker.vue';

defineProps<{
  label: string;
  modelValue?: string;
  expanded?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [icon: string | undefined];
}>();
</script>

<style scoped>
.repository-icon-picker {
  justify-self: auto;
  justify-content: center;
  gap: 0;
}

.repository-icon-picker :deep(.identity-picker__trigger) {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
}

.repository-icon-picker :deep(.identity-picker__trigger:hover),
.repository-icon-picker :deep(.identity-picker__trigger[aria-expanded="true"]) {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.repository-icon-picker :deep(.identity-picker__trigger > svg) {
  width: 20px;
  height: 20px;
  stroke-width: 1.9;
}

.repository-icon-picker :deep(.identity-picker__preview) {
  --agent-avatar-size: 20px;

  border-radius: var(--radius-sm);
  font-size: var(--font-size-18);
}
</style>

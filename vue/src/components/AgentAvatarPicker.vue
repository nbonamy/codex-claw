<template>
  <IdentityPicker
    :aria-label="ariaLabel"
    :choose-image-aria-label="chooseImageAriaLabel"
    :choose-image-label="chooseImageLabel"
    crop-title="Adjust Avatar"
    custom-apply-aria-label="Use custom avatar"
    custom-character-aria-label="Custom avatar character"
    :dialog-label="dialogLabel"
    :empty-label="emptyLabel"
    :model-value="modelValue"
    :name="name"
    preset-noun="avatar"
    :show-hint="showHint"
    :title="title"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="$slots.fallback" #fallback>
      <slot name="fallback" />
    </template>
  </IdentityPicker>
</template>

<script setup lang="ts">
import IdentityPicker from '../shared/identity/IdentityPicker.vue';

withDefaults(defineProps<{
  ariaLabel?: string;
  chooseImageAriaLabel?: string;
  chooseImageLabel?: string;
  dialogLabel?: string;
  emptyLabel?: string;
  modelValue?: string;
  name: string;
  showHint?: boolean;
  title?: string;
}>(), {
  ariaLabel: 'Change avatar',
  chooseImageAriaLabel: 'Choose avatar image',
  chooseImageLabel: 'Pick image…',
  dialogLabel: 'Choose avatar',
  emptyLabel: 'Use initials',
  modelValue: undefined,
  showHint: true,
  title: '',
});

const emit = defineEmits<{
  'update:modelValue': [avatar: string | undefined];
}>();
</script>

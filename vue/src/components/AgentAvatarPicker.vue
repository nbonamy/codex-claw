<template>
  <IdentityPicker
    :aria-label="ariaLabel"
    :choose-image-aria-label="chooseImageAriaLabel"
    :choose-image-label="chooseImageLabel"
    :crop-title="t('agents.avatar.cropTitle')"
    :custom-apply-aria-label="t('agents.avatar.customApply')"
    :custom-character-aria-label="t('agents.avatar.customCharacter')"
    :dialog-label="dialogLabel"
    :empty-label="emptyLabel"
    :model-value="modelValue"
    :name="name"
    :preset-noun="t('agents.avatar.noun')"
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
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import IdentityPicker from '../shared/identity/IdentityPicker.vue';

const props = defineProps<{
  ariaLabel?: string;
  chooseImageAriaLabel?: string;
  chooseImageLabel?: string;
  dialogLabel?: string;
  emptyLabel?: string;
  modelValue?: string;
  name: string;
  showHint?: boolean;
  title?: string;
}>();

const { t } = useI18n();
const ariaLabel = computed(() => props.ariaLabel ?? t('agents.avatar.change'));
const chooseImageAriaLabel = computed(() => props.chooseImageAriaLabel ?? t('agents.avatar.chooseImage'));
const chooseImageLabel = computed(() => props.chooseImageLabel ?? t('agents.avatar.chooseImageAction'));
const dialogLabel = computed(() => props.dialogLabel ?? t('agents.avatar.choose'));
const emptyLabel = computed(() => props.emptyLabel ?? t('agents.avatar.empty'));
const modelValue = computed(() => props.modelValue);
const name = computed(() => props.name);
const showHint = computed(() => props.showHint ?? true);
const title = computed(() => props.title ?? '');

const emit = defineEmits<{
  'update:modelValue': [avatar: string | undefined];
}>();
</script>

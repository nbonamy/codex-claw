<template>
  <div class="agent-avatar-picker">
    <button
      class="agent-avatar-picker__trigger"
      type="button"
      aria-label="Change avatar"
      :aria-expanded="popoverOpen"
      @click="popoverOpen = !popoverOpen"
    >
      <AgentAvatar
        class="agent-avatar-picker__preview"
        :avatar="modelValue"
        :name="name"
        size="xl"
      />
    </button>
    <button
      class="agent-avatar-picker__hint"
      type="button"
      @click="popoverOpen = !popoverOpen"
    >
      Click to change
    </button>
    <div
      v-if="popoverOpen"
      class="agent-avatar-picker__popover"
      role="dialog"
      aria-label="Choose avatar"
    >
      <div class="agent-avatar-picker__grid">
        <button
          class="agent-avatar-picker__preset"
          type="button"
          aria-label="Use initials"
          :aria-pressed="!customAvatarActive && !modelValue"
          @click="selectAvatar(undefined)"
        >
        </button>
        <button
          v-for="preset in avatarPresets"
          :key="preset"
          class="agent-avatar-picker__preset"
          type="button"
          :aria-label="`Use ${preset} avatar`"
          :aria-pressed="!customAvatarActive && modelValue === preset"
          @click="selectAvatar(preset)"
        >
          {{ preset }}
        </button>
        <input
          v-model="customAvatar"
          class="agent-avatar-picker__custom"
          :class="{ 'agent-avatar-picker__custom--active': customAvatarActive }"
          type="text"
          aria-label="Custom avatar character"
          :aria-invalid="customAvatarInvalid"
          placeholder="…"
          title="Enter one character, or press Control-Command-Space on macOS"
          @focus="customAvatarActive = true"
          @input="customAvatarInvalid = false"
          @keydown.enter.prevent="applyCustomAvatar"
        />
        <button
          class="agent-avatar-picker__custom-apply"
          type="button"
          aria-label="Use custom avatar"
          :disabled="!customAvatar.trim()"
          @mousedown.prevent
          @click="applyCustomAvatar"
        >
          <CheckIcon aria-hidden="true" />
        </button>
      </div>

      <div class="agent-avatar-picker__divider" />

      <button
        class="agent-avatar-picker__choose-image"
        type="button"
        aria-label="Choose avatar image"
        @click="openImagePicker"
      >
        <PhotoIcon aria-hidden="true" />
        <span>Pick image…</span>
      </button>
      <input
        ref="fileInput"
        class="agent-avatar-picker__file"
        type="file"
        accept="image/*"
        @change="onImageFileSelected"
      />
    </div>

    <AgentAvatarCropDialog
      :visible="Boolean(pendingImage)"
      :image="pendingImage"
      @apply="applyCroppedAvatar"
      @cancel="cancelCrop"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { CheckIcon, PhotoIcon } from '../shared/icons/app-icons';
import AgentAvatar from './AgentAvatar.vue';
import AgentAvatarCropDialog from './AgentAvatarCropDialog.vue';

const avatarPresets = [
  '🤖', '🧠', '💻', '🖥️', '👾', '👨‍💻', '👩‍💻', '🦾', '🚀',
  '⚡', '🔧', '🛠️', '⚙️', '🔥', '💡', '🎯', '📡', '🦞', '🐙',
  '🦊', '🦄', '🐺', '🦅', '🦉', '🐝', '🦋', '🎾', '🎵', '👹',
  '🌟', '🎮', '💎', '🌈', '🔮', '🎨', '⭐', '🎧',
];

const props = withDefaults(defineProps<{
  modelValue?: string;
  name: string;
}>(), {
  modelValue: undefined,
});

const emit = defineEmits<{
  'update:modelValue': [avatar: string | undefined];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const pendingImage = ref<string | null>(null);
const popoverOpen = ref(false);
const customAvatar = ref('');
const customAvatarInvalid = ref(false);
const customAvatarActive = ref(false);

watch(() => props.modelValue, (value) => {
  const customValue = customAvatarValue(value);
  customAvatar.value = customValue;
  customAvatarActive.value = Boolean(customValue);
}, { immediate: true });

function openImagePicker(): void {
  fileInput.value?.click();
}

function selectAvatar(nextAvatar: string | undefined): void {
  emit('update:modelValue', nextAvatar);
  pendingImage.value = null;
  customAvatarActive.value = false;
  popoverOpen.value = false;
}

function applyCustomAvatar(): void {
  const segments = avatarSegments(customAvatar.value);
  if (segments.length !== 1) {
    customAvatarInvalid.value = true;
    return;
  }

  const [segment] = segments;
  customAvatar.value = '';
  customAvatarInvalid.value = false;
  selectAvatar(segment?.segment);
}

function customAvatarValue(value: string | undefined): string {
  if (!value || value.startsWith('data:image/') || avatarPresets.includes(value)) {
    return '';
  }
  const segments = avatarSegments(value);
  return segments.length === 1 ? segments[0]?.segment ?? '' : '';
}

function avatarSegments(value: string): Intl.SegmentData[] {
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value.trim())];
}

function onImageFileSelected(event: Event): void {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      pendingImage.value = reader.result;
      popoverOpen.value = false;
    }
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function cancelCrop(): void {
  pendingImage.value = null;
}

function applyCroppedAvatar(nextAvatar: string): void {
  emit('update:modelValue', nextAvatar);
  cancelCrop();
}
</script>

<style scoped>
.agent-avatar-picker {
  position: relative;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  min-width: 0;
}

.agent-avatar-picker__trigger {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-lg);
  background: var(--color-surface-base);
  cursor: pointer;
}

.agent-avatar-picker__trigger .agent-avatar-picker__preview {
  border-radius: var(--radius-md);
}

.agent-avatar-picker__hint {
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
  cursor: pointer;
}

.agent-avatar-picker__popover {
  position: absolute;
  z-index: 30;
  right: 0;
  top: calc(100% + var(--space-6));
  width: 280px;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-6);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-2xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.agent-avatar-picker__grid {
  display: grid;
  grid-template-columns: repeat(8, var(--space-12));
  gap: var(--space-4);
}

.agent-avatar-picker__preset {
  width: var(--space-16);
  height: var(--space-16);
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  font-size: var(--font-size-20);
  cursor: pointer;
}

.agent-avatar-picker__preset[aria-pressed="true"],
.agent-avatar-picker__preset:hover {
  background: var(--color-surface-base);
  border-color: var(--color-primary);
}

.agent-avatar-picker__divider {
  height: 1px;
  background: var(--color-border);
}

.agent-avatar-picker__custom {
  width: var(--space-16);
  height: var(--space-16);
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-20);
  text-align: center;
  outline: none;
}

.agent-avatar-picker__custom:focus {
  border-color: var(--color-primary);
}

.agent-avatar-picker__custom--active {
  border-color: var(--color-primary);
  background: var(--color-surface-base);
}

.agent-avatar-picker__custom::placeholder {
  color: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
  opacity: 1;
}

.agent-avatar-picker__custom[aria-invalid="true"] {
  border-color: var(--color-error);
}

.agent-avatar-picker__custom-apply {
  width: var(--space-16);
  height: var(--space-16);
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.agent-avatar-picker__custom-apply:hover:not(:disabled) {
  color: var(--color-primary);
}

.agent-avatar-picker__custom-apply:disabled {
  color: var(--color-text-muted);
  cursor: default;
  opacity: 0.35;
}

.agent-avatar-picker__custom-apply svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  stroke-width: 2.5;
}

.agent-avatar-picker__choose-image {
  justify-self: stretch;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 32px;
  padding: 0 var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  font: inherit;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
}

.agent-avatar-picker__choose-image svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.agent-avatar-picker__file {
  display: none;
}

</style>

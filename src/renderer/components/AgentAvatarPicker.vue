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
          :aria-pressed="!modelValue"
          @click="selectAvatar(undefined)"
        >
        </button>
        <button
          v-for="preset in avatarPresets"
          :key="preset"
          class="agent-avatar-picker__preset"
          type="button"
          :aria-label="`Use ${preset} avatar`"
          :aria-pressed="modelValue === preset"
          @click="selectAvatar(preset)"
        >
          {{ preset }}
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
        <span>Choose Image...</span>
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
import { ref } from 'vue';
import { PhotoIcon } from '../shared/icons/app-icons';
import AgentAvatar from './AgentAvatar.vue';
import AgentAvatarCropDialog from './AgentAvatarCropDialog.vue';

const avatarPresets = [
  '✺', '◎', '▮', '▻', '👾', '🤖', '🧠', '💻', '🖥️', '⌨️',
  '👨‍💻', '👩‍💻', '🦾', '🚀', '⚡', '🔧', '🛠️', '⚙️', '🔥', '💡',
  '🎯', '📡', '🦊', '🐙', '🦄', '🐺', '🦅', '🦉', '🐝', '🦋',
  '👹', '🌟', '👾', '🎮', '💎', '🌈', '🔮', '🎨', '⭐',
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

function openImagePicker(): void {
  fileInput.value?.click();
}

function selectAvatar(nextAvatar: string | undefined): void {
  emit('update:modelValue', nextAvatar);
  pendingImage.value = null;
  popoverOpen.value = false;
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
  --agent-avatar-size: var(--space-12);
  --agent-avatar-font-size: var(--font-size-13);
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

.agent-avatar-picker__choose-image {
  justify-self: center;
  display: inline-flex;
  align-items: center;
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

<template>
  <div
    ref="rootEl"
    class="chat-composer-action-menu__root"
  >
    <button
      class="chat-composer-action-menu__button"
      type="button"
      aria-label="Composer actions"
      :disabled="disabled"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click="toggleMenu"
    >
      <PlusIcon />
    </button>

    <AppMenu
      v-if="menuOpen"
      class="chat-composer-action-menu"
      ariaLabel="Composer actions"
      :items="menuItems"
      @select="selectMenuItem"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Component } from 'vue';
import type { ApprovalPreset } from '../../shared/contracts';
import { approvalPresetOptions } from '../../shared/approval-presets';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { HandStopIcon, ListDetailsIcon, PaperclipIcon, PlusIcon, ShieldCheckIcon, Sparkles } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  disabled?: boolean;
  approvalPreset?: ApprovalPreset | null;
  planMode: boolean;
  showApprovalMenu?: boolean;
  showPlanMode?: boolean;
}>(), {
  disabled: false,
  approvalPreset: null,
  showApprovalMenu: false,
  showPlanMode: true,
});

const emit = defineEmits<{
  attach: [];
  'selectApprovalPreset': [preset: ApprovalPreset];
  'update:planMode': [enabled: boolean];
}>();

const rootEl = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const approvalOptions = approvalPresetOptions;
const menuItems = computed<AppMenuItem[]>(() => {
  const items: AppMenuItem[] = []

  if (props.showApprovalMenu) {
    items.push({
      id: 'approval',
      type: 'submenu',
      label: 'Approval',
      // value: selectedApprovalLabel.value,
      icon: ShieldCheckIcon,
      submenuWidth: 'wide',
      items: approvalOptions.map((option) => ({
        id: approvalItemId(option.id),
        type: 'radio',
        label: option.label,
        description: option.description,
        icon: approvalIcon(option.id),
        checked: option.id === props.approvalPreset,
      })),
    });
  }

  if (props.showPlanMode) {
    items.push({
      id: 'plan-mode',
      type: 'checkbox',
      label: 'Plan mode',
      accessory: 'switch',
      checked: props.planMode,
      icon: ListDetailsIcon
    });
  }

  items.push(  { id: 'group-attach', type: 'separator' });

  items.push({
      id: 'attach',
      type: 'action',
      label: 'Add Files & Photos',
      icon: PaperclipIcon,
      disabled: true,
    },
  );

  return items;
});

onMounted(() => {
  document.addEventListener('click', closeOnOutsideClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick);
});

function toggleMenu(event: MouseEvent): void {
  event.stopPropagation();
  if (!props.disabled) {
    menuOpen.value = !menuOpen.value;
  }
}

function closeOnOutsideClick(event: MouseEvent): void {
  const root = rootEl.value;
  if (root && event.target && !root.contains(event.target as Node)) {
    menuOpen.value = false;
  }
}

function approvalIcon(preset: ApprovalPreset): Component {
  if (preset === 'ask-for-approval') {
    return HandStopIcon;
  }
  if (preset === 'approve-for-me') {
    return Sparkles;
  }
  return ShieldCheckIcon;
}

function selectMenuItem(itemId: string): void {
  if (itemId === 'plan-mode') {
    emit('update:planMode', !props.planMode);
    return;
  }

  const approvalPreset = approvalPresetFromItemId(itemId);
  if (approvalPreset) {
    emit('selectApprovalPreset', approvalPreset);
    menuOpen.value = false;
  }
}

function approvalItemId(preset: ApprovalPreset): string {
  return `approval:${preset}`;
}

function approvalPresetFromItemId(itemId: string): ApprovalPreset | null {
  const preset = itemId.replace(/^approval:/, '');
  return preset === 'ask-for-approval' || preset === 'approve-for-me' || preset === 'full-access'
    ? preset
    : null;
}
</script>

<style scoped>
.chat-composer-action-menu__root {
  position: relative;
  flex: 0 0 auto;
}

.chat-composer-action-menu__button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--chat-composer-button-size, 36px);
  height: var(--chat-composer-button-size, 36px);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.chat-composer-action-menu__button:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.chat-composer-action-menu__button:disabled {
  cursor: default;
}

.chat-composer-action-menu__button svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.chat-composer-action-menu {
  position: absolute;
  left: 0;
  bottom: calc(100% + var(--space-4));
  z-index: 10;
}
</style>

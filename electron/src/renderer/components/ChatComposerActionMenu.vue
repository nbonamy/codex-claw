<template>
  <CodexComposerMenu
    class="chat-composer-action-menu__root"
    menu-class="chat-composer-action-menu"
    aria-label="Composer actions"
    button-label="Composer actions"
    :disabled="disabled"
    :items="menuItems"
    @select="selectMenuItem"
  >
    <template #trigger="{ open, toggle }">
      <button
        class="chat-composer-action-menu__button"
        type="button"
        aria-label="Composer actions"
        aria-haspopup="menu"
        :aria-expanded="open"
        :disabled="disabled"
        @click="toggle"
      >
        <PlusIcon />
      </button>
    </template>
  </CodexComposerMenu>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import type { ApprovalPreset } from '@codex-claw/shared/contracts';
import { approvalPresetOptions } from '@codex-claw/shared/approval-presets';
import {
  CodexComposerMenu,
  type CodexComposerMenuItem,
  type CodexComposerMenuSelectableItem,
} from 'codex-app-sdk/vue';
import { HandStopIcon, ListDetailsIcon, PaperclipIcon, PlusIcon, ShieldCheckIcon, Sparkles } from '../shared/icons/app-icons';

type ComposerMenuAction =
  | { kind: 'approval'; preset: ApprovalPreset }
  | { kind: 'attach' }
  | { kind: 'plan-mode' };

const props = withDefaults(defineProps<{
  disabled?: boolean;
  approvalPreset?: ApprovalPreset | null;
  approvalPresets?: ApprovalPreset[];
  planMode: boolean;
  showApprovalMenu?: boolean;
  showPlanMode?: boolean;
}>(), {
  disabled: false,
  approvalPreset: null,
  approvalPresets: () => [],
  showApprovalMenu: false,
  showPlanMode: true,
});

const emit = defineEmits<{
  attach: [];
  selectApprovalPreset: [preset: ApprovalPreset];
  'update:planMode': [enabled: boolean];
}>();

const allowedApprovalPresets = computed(() => new Set(props.approvalPresets));
const menuItems = computed<CodexComposerMenuItem<ComposerMenuAction>[]>(() => {
  const items: CodexComposerMenuItem<ComposerMenuAction>[] = [];

  if (props.showApprovalMenu) {
    items.push({
      id: 'approval',
      type: 'submenu',
      label: 'Approval',
      icon: ShieldCheckIcon,
      items: approvalPresetOptions.map((option) => ({
        id: `approval:${option.id}`,
        type: 'radio',
        label: option.label,
        description: option.description,
        icon: approvalIcon(option.id),
        checked: option.id === props.approvalPreset,
        disabled: !allowedApprovalPresets.value.has(option.id),
        payload: { kind: 'approval', preset: option.id },
      })),
    });
  }

  if (props.showPlanMode) {
    items.push({
      id: 'plan-mode',
      type: 'checkbox',
      label: 'Plan mode',
      checked: props.planMode,
      icon: ListDetailsIcon,
      payload: { kind: 'plan-mode' },
    });
  }

  items.push(
    { id: 'group-attach', type: 'separator' },
    {
      id: 'attach',
      type: 'action',
      label: 'Add Files & Photos',
      icon: PaperclipIcon,
      disabled: true,
      payload: { kind: 'attach' },
    },
  );

  return items;
});

function approvalIcon(preset: ApprovalPreset): Component {
  if (preset === 'ask-for-approval') {
    return HandStopIcon;
  }
  if (preset === 'approve-for-me') {
    return Sparkles;
  }
  return ShieldCheckIcon;
}

function selectMenuItem(item: CodexComposerMenuSelectableItem<ComposerMenuAction>): void {
  const action = item.payload;
  if (!action) {
    return;
  }
  if (action.kind === 'plan-mode') {
    emit('update:planMode', !props.planMode);
  } else if (action.kind === 'approval') {
    emit('selectApprovalPreset', action.preset);
  } else {
    emit('attach');
  }
}
</script>

<style scoped>
.chat-composer-action-menu__root {
  --codex-border-color: var(--color-border);
  --codex-composer-button-size: var(--chat-composer-button-size, 36px);
  --codex-composer-menu-radius: var(--radius-xl);
  --codex-composer-menu-shadow: var(--shadow-menu);
  --codex-hover-color: var(--color-surface-low);
  --codex-muted-text-color: var(--color-text-muted);
  --codex-surface-color: var(--color-surface-lowest);
  --codex-text-color: var(--color-text);
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

:deep(.chat-composer-action-menu .codex-composer-menu-list__submenu-list) {
  width: 360px;
  max-width: min(360px, calc(100vw - var(--space-12)));
}
</style>

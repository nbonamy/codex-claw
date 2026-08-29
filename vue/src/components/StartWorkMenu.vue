<template>
  <el-popover
    v-model:visible="visible"
    placement="bottom-start"
    trigger="click"
    :width="292"
    popper-class="claw-popover start-work-menu__popover"
  >
    <template #reference>
      <button
        class="start-work-menu__trigger"
        type="button"
        aria-label="New session"
      >
        <PlusIcon aria-hidden="true" />
        <span>New session</span>
      </button>
    </template>

    <div class="start-work-menu">
      <span class="start-work-menu__heading">Add project from</span>
      <AppMenu
        class="app-menu--embedded"
        ariaLabel="Add project from"
        :items="menuItems"
        @select="select"
      />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IconFolder as FolderIcon, IconLink as LinkIcon } from '@tabler/icons-vue';
import { GitHubIcon, PlusIcon } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';

type StartWorkAction = 'github' | 'local' | 'url';

const emit = defineEmits<{
  select: [action: StartWorkAction];
}>();

const visible = ref(false);
const menuItems: AppMenuItem[] = [
  { id: 'local', type: 'action', label: 'Local folder or repository…', icon: FolderIcon },
  { id: 'github', type: 'action', label: 'GitHub repository…', icon: GitHubIcon },
  { id: 'url', type: 'action', label: 'Repository URL…', icon: LinkIcon },
];

function select(action: string): void {
  if (action !== 'local' && action !== 'github' && action !== 'url') return;
  visible.value = false;
  emit('select', action);
}
</script>

<style scoped>
.start-work-menu__trigger {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  padding: 0 var(--space-8);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-base);
  font: inherit;
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  text-align: left;
  cursor: pointer;
}

.start-work-menu__trigger:hover,
.start-work-menu__trigger:focus-visible {
  background: var(--color-surface-high);
  outline: 0;
}

.start-work-menu__trigger svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.start-work-menu {
  display: grid;
  gap: var(--space-1);
}

.start-work-menu__heading {
  padding: var(--space-3) var(--space-6) var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
}
</style>

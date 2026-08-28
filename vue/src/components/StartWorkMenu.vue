<template>
  <el-popover
    v-model:visible="visible"
    placement="bottom-start"
    trigger="click"
    width="292"
    :teleported="false"
    popper-class="start-work-menu__popover"
  >
    <template #reference>
      <button
        class="start-work-menu__trigger"
        type="button"
        aria-label="Start work"
        title="Start work"
      >
        <PlusIcon aria-hidden="true" />
      </button>
    </template>

    <div class="start-work-menu" role="menu" aria-label="Start work">
      <template v-if="repository">
        <span class="start-work-menu__heading">Start session in</span>
        <button type="button" role="menuitem" @click="select('repository')">
          <GitForkIcon aria-hidden="true" />
          <strong>{{ repository.name }}</strong>
        </button>
        <span class="start-work-menu__divider" />
      </template>

      <span class="start-work-menu__heading">Add project from</span>
      <button type="button" role="menuitem" @click="select('local')">
        <FolderIcon aria-hidden="true" />
        <span>Local folder or repository…</span>
      </button>
      <button type="button" role="menuitem" @click="select('github')">
        <GitHubIcon aria-hidden="true" />
        <span>GitHub repository…</span>
      </button>
      <button type="button" role="menuitem" @click="select('url')">
        <LinkIcon aria-hidden="true" />
        <span>Repository URL…</span>
      </button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { IconBrandGithub as GitHubIcon, IconFolder as FolderIcon, IconLink as LinkIcon } from '@tabler/icons-vue';
import { GitForkIcon, PlusIcon } from '../shared/icons/app-icons';

type StartWorkAction = 'github' | 'local' | 'repository' | 'url';

defineProps<{
  repository?: { name: string } | null;
}>();

const emit = defineEmits<{
  select: [action: StartWorkAction];
}>();

const visible = ref(false);

function select(action: StartWorkAction): void {
  visible.value = false;
  emit('select', action);
}
</script>

<style scoped>
.start-work-menu__trigger {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.start-work-menu__trigger:hover,
.start-work-menu__trigger:focus-visible {
  color: var(--color-text);
  background: var(--color-surface-base);
  outline: 0;
}

.start-work-menu__trigger svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.start-work-menu {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3);
}

.start-work-menu__heading {
  padding: var(--space-3) var(--space-4) var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
}

.start-work-menu button {
  min-width: 0;
  min-height: 38px;
  display: grid;
  grid-template-columns: var(--icon-md) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.start-work-menu button:hover,
.start-work-menu button:focus-visible {
  background: var(--color-surface-base);
  outline: 0;
}

.start-work-menu button svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.start-work-menu button strong,
.start-work-menu button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.start-work-menu__divider {
  height: 1px;
  margin: var(--space-2) var(--space-4);
  background: var(--color-border);
}
</style>

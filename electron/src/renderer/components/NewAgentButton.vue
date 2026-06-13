<template>
  <div
    class="new-agent-button"
    :class="[
      `new-agent-button--${tone}`,
      `new-agent-button--${size}`,
      `new-agent-button--${presentation}`,
      { 'new-agent-button--menu': showBenchMenu },
    ]"
  >
    <PlusCircleIcon
      v-if="detachedIcon"
      class="new-agent-button__detached-icon"
      aria-hidden="true"
    />
    <el-button-group class="new-agent-button__group">
      <el-button
        :type="buttonType"
        class="agent-sidebar__new new-agent-button__primary"
        :aria-label="label"
        @click="emitNewAgent"
      >
        <PlusCircleIcon
          v-if="!detachedIcon"
          class="new-agent-button__icon"
        />
        <span class="new-agent-button__label">{{ label }}</span>
      </el-button>
      <el-popover
        v-if="showBenchMenu"
        v-model:visible="menuVisible"
        placement="top"
        trigger="manual"
        width="200"
        popper-class="new-agent-button__popover"
        :teleported="false"
      >
        <template #reference>
          <el-button
            :type="buttonType"
            class="new-agent-button__chevron"
            aria-label="Open Bench"
            @click="toggleMenu"
          >
            <ChevronDown />
          </el-button>
        </template>
        <div v-if="menuVisible" class="new-agent-menu" role="menu" aria-label="New agent options">
          <button
            class="new-agent-menu__create"
            type="button"
            role="menuitem"
            @click="createFromMenu"
          >
            <PlusCircleIcon class="new-agent-menu__create-icon" />
            <span>Create New Agent</span>
          </button>

          <div class="new-agent-menu__section">Bench</div>
          <p v-if="bench.length === 0" class="new-agent-menu__empty">
            Right-click an agent → Save to Bench
          </p>
          <template v-else>
            <div
              v-for="template in bench"
              :key="template.id"
              class="new-agent-menu__template-row"
            >
              <button
                class="new-agent-menu__template"
                type="button"
                role="menuitem"
                @click="deployTemplate(template.id)"
              >
                <AgentAvatar
                  class="new-agent-menu__avatar"
                  :avatar="template.avatar"
                  :name="template.name"
                  size="md"
                />
                <span class="new-agent-menu__template-meta">
                  <strong>{{ template.name }}</strong>
                  <span>{{ folderBasename(template.folder) }}</span>
                </span>
              </button>
              <button
                class="new-agent-menu__delete"
                type="button"
                :aria-label="`Remove ${template.name} from Bench`"
                @click="confirmRemoveTemplate(template)"
              >
                <Trash2Icon class="new-agent-menu__delete-icon" />
              </button>
            </div>
          </template>
        </div>
      </el-popover>
    </el-button-group>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { BenchTemplate } from '@codex-claw/shared/contracts';
import { ChevronDown, PlusCircleIcon, Trash2Icon } from '../shared/icons/app-icons';
import AgentAvatar from './AgentAvatar.vue';

type NewAgentButtonPresentation = 'default' | 'tile';
type NewAgentButtonSize = 'regular' | 'small';
type NewAgentButtonTone = 'primary' | 'muted' | 'ghost';

const props = withDefaults(defineProps<{
  bench?: BenchTemplate[];
  label?: string;
  presentation?: NewAgentButtonPresentation;
  showBenchMenu?: boolean;
  size?: NewAgentButtonSize;
  tone?: NewAgentButtonTone;
}>(), {
  bench: () => [],
  label: 'New Agent',
  presentation: 'default',
  showBenchMenu: true,
  size: 'regular',
  tone: 'primary',
});

const emit = defineEmits<{
  'deploy-bench-template': [templateId: string];
  'new-agent': [];
  'remove-bench-template': [templateId: string];
}>();

const menuVisible = ref(false);
const bench = computed(() => props.bench);
const buttonType = computed(() => props.tone === 'primary' ? 'primary' : undefined);
const detachedIcon = computed(() => props.tone !== 'primary');

function emitNewAgent(): void {
  menuVisible.value = false;
  emit('new-agent');
}

function createFromMenu(): void {
  menuVisible.value = false;
  emitNewAgent();
}

function toggleMenu(): void {
  if (!props.showBenchMenu) {
    return;
  }

  menuVisible.value = !menuVisible.value;
}

function deployTemplate(templateId: string): void {
  menuVisible.value = false;
  emit('deploy-bench-template', templateId);
}

async function confirmRemoveTemplate(template: BenchTemplate): Promise<void> {
  menuVisible.value = false;
  await nextTick();

  try {
    await ElMessageBox.confirm(
      `${template.name} will be removed from Bench. Existing agents stay unchanged.`,
      `Remove ${template.name} from Bench?`,
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Remove',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  emit('remove-bench-template', template.id);
}

function folderBasename(folder: string): string {
  return folder.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? folder;
}
</script>

<style scoped>

.new-agent-button {
  --new-agent-button-height: 44px;
  --new-agent-button-border-radius: var(--radius-lg);
  --new-agent-button-color: white;
  --new-agent-button-bg: var(--color-primary);
  --new-agent-button-border: var(--color-primary);
  --new-agent-button-hover-bg: color-mix(in srgb, var(--color-primary) 80%, var(--color-background));
  --new-agent-button-hover-border: color-mix(in srgb, var(--color-primary) 80%, var(--color-background));
  --new-agent-button-padding-inline: var(--space-8);
  --new-agent-button-icon-display: none;
  --new-agent-button-label-display: inline;
  width: 100%;
}

.new-agent-button--small {
  --new-agent-button-height: 24px;
  --new-agent-button-border-radius: var(--radius-md);
  --new-agent-button-padding-inline: var(--space-3);
  width: auto;
}

.new-agent-button--muted {
  --new-agent-button-height: 24px;
  --new-agent-button-color: var(--color-text-muted);
  --new-agent-button-bg: transparent;
  --new-agent-button-border: transparent;
  --new-agent-button-hover-bg: transparent;
  --new-agent-button-hover-border: transparent;
  --new-agent-button-icon-display: block;
}

.new-agent-button--ghost {
  --new-agent-button-color: var(--color-text-muted);
  --new-agent-button-bg: transparent;
  --new-agent-button-border: transparent;
  --new-agent-button-hover-bg: var(--color-surface-low);
  --new-agent-button-hover-border: transparent;
  --new-agent-button-icon-display: block;
}

.new-agent-button--tile {
  width: auto;
  flex-direction: column;
  gap: var(--space-6);
  justify-content: center;
}

.new-agent-button__group {
  width: 100%;
  display: flex;
  align-items: center;
}

.new-agent-button--muted,
.new-agent-button--ghost {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.new-agent-button--muted .new-agent-button__group,
.new-agent-button--ghost .new-agent-button__group {
  width: auto;
}

.new-agent-button__primary {
  flex: 1;
  height: var(--new-agent-button-height);
  min-height: var(--new-agent-button-height);
  border-color: var(--new-agent-button-border);
  border-radius: var(--new-agent-button-border-radius);
  color: var(--new-agent-button-color);
  background: var(--new-agent-button-bg);
  font-size: var(--font-size-14);
  line-height: var(--line-height-22);
  font-weight: var(--font-weight-semibold);
  justify-content: center;
  gap: var(--space-6);
  padding-inline: var(--new-agent-button-padding-inline);
}

.new-agent-button--small .new-agent-button__primary {
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.new-agent-button--tile .new-agent-button__primary {
  height: var(--new-agent-button-height);
  min-height: var(--new-agent-button-height);
}

.new-agent-button__chevron {
  height: var(--new-agent-button-height);
  min-height: var(--new-agent-button-height);
  border-color: var(--new-agent-button-border);
  border-top-right-radius: var(--new-agent-button-border-radius) !important;
  border-bottom-right-radius: var(--new-agent-button-border-radius) !important;
  border-left-color: var(--color-background) !important;
  border-right: none;
  color: var(--new-agent-button-color);
  background: var(--new-agent-button-bg);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  padding: 0 var(--space-3);
}

.new-agent-button--ghost .new-agent-button__chevron {
  border-left-color: var(--color-border) !important;
}

.new-agent-button--muted .new-agent-button__chevron {
  border-left-color: var(--color-border) !important;
}

.new-agent-button--muted .new-agent-button__chevron,
.new-agent-button--ghost .new-agent-button__chevron {
  width: var(--space-16);
  padding-inline: var(--space-2);
}

.new-agent-button--muted .new-agent-button__chevron :deep(svg),
.new-agent-button--ghost .new-agent-button__chevron :deep(svg) {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.new-agent-button__primary:hover,
.new-agent-button__primary:focus-visible,
.new-agent-button__chevron:hover,
.new-agent-button__chevron:focus-visible {
  z-index: 0;
  color: var(--new-agent-button-color);
  background: var(--new-agent-button-hover-bg);
  border-color: var(--new-agent-button-hover-border);
}

.new-agent-button--muted .new-agent-button__chevron:hover,
.new-agent-button--muted .new-agent-button__chevron:focus-visible,
.new-agent-button--ghost .new-agent-button__chevron:hover,
.new-agent-button--ghost .new-agent-button__chevron:focus-visible {
  border-left-color: var(--color-border-strong) !important;
}

.new-agent-button__icon {
  display: var(--new-agent-button-icon-display);
  width: var(--icon-md);
  height: var(--icon-md);
}

.new-agent-button--tile .new-agent-button__icon {
  width: var(--icon-xl);
  height: var(--icon-xl);
}

.new-agent-button__detached-icon {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--new-agent-button-color);
}

.new-agent-button--tile .new-agent-button__detached-icon {
  width: calc(var(--icon-xl) + var(--space-4));
  height: calc(var(--icon-xl) + var(--space-4));
}

.new-agent-button__label {
  display: var(--new-agent-button-label-display);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-agent-menu {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-1);
}

.new-agent-menu__create,
.new-agent-menu__template {
  width: 100%;
  min-width: 0;
  border: none;
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.new-agent-menu__create {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-6);
  border-radius: var(--radius-md);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.new-agent-menu__create:hover,
.new-agent-menu__create:focus-visible,
.new-agent-menu__template-row:hover,
.new-agent-menu__template-row:focus-within {
  background: var(--color-surface-low);
  outline: none;
}

.new-agent-menu__create-icon {
  width: var(--icon-md);
  height: var(--icon-md);
  flex: 0 0 auto;
}

.new-agent-menu__section {
  padding: var(--space-3) var(--space-6) var(--space-1);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--font-size-10);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  text-transform: uppercase;
}

.new-agent-menu__empty {
  margin: 0;
  padding: var(--space-4) var(--space-6);
  padding-left: var(--space-10);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-16);
}

.new-agent-menu__template-row {
  min-height: 44px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 24px;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--color-text);
}

.new-agent-menu__template {
  grid-column: 1 / 3;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-6);
}

.new-agent-menu__template:focus-visible {
  outline: none;
}

.new-agent-menu__template-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5px;
}

.new-agent-menu__template-meta strong,
.new-agent-menu__template-meta span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.new-agent-menu__template-meta strong {
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.new-agent-menu__template-meta span {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
}

.new-agent-menu__delete {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
  opacity: 0;
}

.new-agent-menu__template-row:hover .new-agent-menu__delete,
.new-agent-menu__template-row:focus-within .new-agent-menu__delete,
.new-agent-menu__delete:focus-visible {
  opacity: 1;
}

.new-agent-menu__delete:hover,
.new-agent-menu__delete:focus-visible {
  color: var(--color-error);
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  outline: none;
}

.new-agent-menu__delete-icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
</style>

<style>
.new-agent-button__popover.el-popper {
  min-width: 284px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-menu);
}

.new-agent-button__popover.el-popper .el-popper__arrow::before {
  border-color: var(--color-border);
  background: var(--color-surface-lowest);
}

@container (max-width: 180px) {
  .new-agent-button__group {
    grid-template-columns: 1fr 1fr;
  }

  .new-agent-button__primary {
    min-width: 0;
    height: var(--space-20);
    min-height: var(--space-20);
    border-top-right-radius: var(--new-agent-button-border-radius) !important;
    border-bottom-right-radius: var(--new-agent-button-border-radius) !important;
    justify-content: center;
    padding: 0;
  }

  .new-agent-button__icon {
    display: block !important;
  }

  .new-agent-button__label {
    display: none;
  }

  .new-agent-button__chevron {
    display: none;
  }
}
</style>

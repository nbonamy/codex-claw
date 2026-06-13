<template>
  <div
    ref="menuEl"
    class="chat-composer-slash-menu"
    role="listbox"
    aria-label="Commands and skills"
  >
    <template v-if="visibleCommands.length > 0">
      <div class="chat-composer-slash-menu__section">
        {{ t('chat.commands.title') }}
      </div>
      <button
        v-for="(command, index) in visibleCommands"
        :key="command.id"
        class="chat-composer-slash-menu__item"
        :class="{ 'chat-composer-slash-menu__item--active': index === activeIndex }"
        role="option"
        type="button"
        @mousedown.prevent="$emit('selectCommand', command)"
      >
        <span
          class="chat-composer-slash-menu__icon"
          aria-hidden="true"
        >
          <TerminalIcon />
        </span>
        <span class="chat-composer-slash-menu__main">
          <span class="chat-composer-slash-menu__name">{{ command.name }}</span>
          <span class="chat-composer-slash-menu__description">{{ commandDescription(command) }}</span>
        </span>
      </button>
    </template>

    <template v-if="visibleSkills.length > 0">
      <div class="chat-composer-slash-menu__section">
        {{ t('chat.skills.title') }}
      </div>
      <button
        v-for="(skill, index) in visibleSkills"
        :key="skill.path"
        class="chat-composer-slash-menu__item"
        :class="{ 'chat-composer-slash-menu__item--active': visibleCommands.length + index === activeIndex }"
        role="option"
        type="button"
        @mousedown.prevent="$emit('selectSkill', skill)"
      >
        <span
          class="chat-composer-slash-menu__icon"
          aria-hidden="true"
        >
          <SparklesIcon />
        </span>
        <span class="chat-composer-slash-menu__main">
          <span class="chat-composer-slash-menu__name">{{ skill.name }}</span>
          <span class="chat-composer-slash-menu__description">{{ skillDescription(skill) }}</span>
        </span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BackendCommandSummary, BackendSkillSummary } from '@codex-claw/shared/contracts';
import { commandDescription } from '../shared/chat/composer-commands';
import { skillDescription } from '../shared/chat/composer-skills';
import { SparklesIcon, TerminalIcon } from '../shared/icons/app-icons';

const props = defineProps<{
  activeIndex: number;
  visibleCommands: BackendCommandSummary[];
  visibleSkills: BackendSkillSummary[];
}>();

defineEmits<{
  selectCommand: [command: BackendCommandSummary];
  selectSkill: [skill: BackendSkillSummary];
}>();

const { t } = useI18n();
const menuEl = ref<HTMLElement | null>(null);

watch(
  () => [props.activeIndex, props.visibleCommands, props.visibleSkills],
  async () => {
    await nextTick();
    const activeItem = menuEl.value?.querySelectorAll<HTMLButtonElement>('.chat-composer-slash-menu__item')
      .item(props.activeIndex);
    if (typeof activeItem?.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  },
);
</script>

<style scoped>
.chat-composer-slash-menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--space-4));
  left: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 280px;
  overflow-y: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.chat-composer-slash-menu__section {
  padding: var(--space-3) var(--space-4) var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: normal;
  text-transform: uppercase;
}

.chat-composer-slash-menu__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  padding: var(--space-3) var(--space-4);
  border: 0;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  line-height: 1.35;
  text-align: left;
}

.chat-composer-slash-menu__item:hover,
.chat-composer-slash-menu__item--active {
  background: var(--color-surface);
}

.chat-composer-slash-menu__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-md);
  height: var(--icon-md);
  flex: 0 0 var(--icon-md);
  color: var(--color-text-muted);
}

.chat-composer-slash-menu__main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--space-4);
}

.chat-composer-slash-menu__name {
  overflow: hidden;
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.chat-composer-slash-menu__description {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}
</style>

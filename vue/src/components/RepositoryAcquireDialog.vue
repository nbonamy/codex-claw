<template>
  <el-dialog
    class="claw-dialog repository-acquire-dialog"
    :model-value="visible"
    :teleported="false"
    width="680px"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="repository-acquire-dialog__search">
        <SearchIcon aria-hidden="true" />
        <input
          ref="input"
          v-model="query"
          :placeholder="mode === 'url' ? 'Paste a Git repository URL' : 'Find a GitHub repository'"
          :aria-label="mode === 'url' ? 'Repository URL' : 'Find a GitHub repository'"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter.prevent="submitUrl"
        >
      </div>
    </template>

    <section class="repository-acquire-dialog__body">
      <template v-if="mode === 'url'">
        <div class="repository-acquire-dialog__url-state">
          <LinkIcon aria-hidden="true" />
          <div>
            <strong>Clone from a repository URL</strong>
            <span>HTTPS and SSH Git URLs are supported.</span>
          </div>
        </div>
      </template>
      <template v-else>
        <p v-if="loading" class="repository-acquire-dialog__state">Loading repositories…</p>
        <p v-else-if="error" class="repository-acquire-dialog__state repository-acquire-dialog__state--error">{{ error }}</p>
        <template v-else>
          <h3>Repositories</h3>
          <button
            v-for="repository in filteredRepositories"
            :key="repository.id"
            type="button"
            class="repository-acquire-dialog__row"
            @click="emit('select-repository', repository)"
          >
            <GitHubIcon aria-hidden="true" />
            <span>
              <strong>{{ repository.fullName }}</strong>
              <small>{{ localRepositoryNames.has(repository.name) ? 'On this machine' : repository.isPrivate ? 'Private repository' : 'GitHub repository' }}</small>
            </span>
            <em>{{ localRepositoryNames.has(repository.name) ? 'Open' : 'Clone' }}</em>
          </button>
          <p v-if="filteredRepositories.length === 0" class="repository-acquire-dialog__state">No matching repositories.</p>
        </template>
      </template>
    </section>

    <template v-if="mode === 'url'" #footer>
      <button class="claw-button claw-button--tertiary" type="button" @click="emit('close')">Cancel</button>
      <button class="claw-button claw-button--primary" type="button" :disabled="!canSubmitUrl || busy" @click="submitUrl">
        {{ busy ? 'Cloning…' : 'Clone repository' }}
      </button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { IconBrandGithub as GitHubIcon, IconLink as LinkIcon, IconSearch as SearchIcon } from '@tabler/icons-vue';
import type { WorkRepository } from '@codex-claw/core/contracts';

const props = withDefaults(defineProps<{
  busy?: boolean;
  error?: string | null;
  loading?: boolean;
  localRepositoryNames?: string[];
  mode: 'github' | 'url';
  repositories?: WorkRepository[];
  visible: boolean;
}>(), {
  busy: false,
  error: null,
  loading: false,
  localRepositoryNames: () => [],
  repositories: () => [],
});

const emit = defineEmits<{
  close: [];
  'clone-url': [url: string];
  'select-repository': [repository: WorkRepository];
}>();

const input = ref<HTMLInputElement | null>(null);
const query = ref('');
const localRepositoryNames = computed(() => new Set(props.localRepositoryNames));
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());
const filteredRepositories = computed(() => props.repositories.filter((repository) => (
  `${repository.fullName} ${repository.name}`.toLocaleLowerCase().includes(normalizedQuery.value)
)));
const canSubmitUrl = computed(() => /^(?:https?:\/\/|ssh:\/\/|git@|[^\s]+@[^\s]+:)[^\s]+/iu.test(query.value.trim()));

watch(() => [props.visible, props.mode] as const, async ([visible]) => {
  if (!visible) return;
  query.value = '';
  await nextTick();
  input.value?.focus();
}, { immediate: true });

function onVisibilityChanged(visible: boolean): void {
  if (!visible) emit('close');
}

function submitUrl(): void {
  if (canSubmitUrl.value && !props.busy) emit('clone-url', query.value.trim());
}
</script>

<style scoped>
.repository-acquire-dialog__search {
  display: grid;
  grid-template-columns: var(--icon-md) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-8);
}

.repository-acquire-dialog__search svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.repository-acquire-dialog__search input {
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
}

.repository-acquire-dialog__body {
  min-height: 320px;
  padding: var(--space-8);
}

.repository-acquire-dialog__body h3 {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-13);
}

.repository-acquire-dialog__row {
  width: 100%;
  min-height: 52px;
  display: grid;
  grid-template-columns: var(--icon-lg) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.repository-acquire-dialog__row:hover,
.repository-acquire-dialog__row:focus-visible {
  background: var(--color-surface-base);
  outline: 0;
}

.repository-acquire-dialog__row > svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
  color: var(--color-text-muted);
}

.repository-acquire-dialog__row > span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.repository-acquire-dialog__row strong,
.repository-acquire-dialog__row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-acquire-dialog__row small,
.repository-acquire-dialog__row em {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-style: normal;
}

.repository-acquire-dialog__url-state {
  display: grid;
  grid-template-columns: var(--icon-lg) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-6);
  padding: var(--space-6);
}

.repository-acquire-dialog__url-state svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
  color: var(--color-text-muted);
}

.repository-acquire-dialog__url-state div {
  display: grid;
  gap: var(--space-2);
}

.repository-acquire-dialog__url-state span,
.repository-acquire-dialog__state {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.repository-acquire-dialog__state {
  margin: var(--space-8) 0;
  text-align: center;
}

.repository-acquire-dialog__state--error {
  color: var(--color-error);
}
</style>

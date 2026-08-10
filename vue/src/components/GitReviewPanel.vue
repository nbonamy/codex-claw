<template>
  <section class="git-review-panel" aria-label="GitHub review">
    <header class="git-review-panel__toolbar">
      <div class="git-review-panel__summary">
        <div class="git-review-panel__repository">
          <GitHubIcon aria-hidden="true" />
          <strong>{{ repositoryName }}</strong>
        </div>
        <div class="git-review-panel__branch">
          <span>{{ gitStatus?.branch ?? 'Working tree' }}</span>
          <span v-if="gitStatus?.upstream" aria-hidden="true">→</span>
          <span v-if="gitStatus?.upstream" class="git-review-panel__upstream">{{ gitStatus.upstream }}</span>
        </div>
      </div>

      <div class="git-review-panel__stats" aria-label="Diff statistics">
        <span class="git-review-panel__added">+{{ gitStatus?.addedLines ?? 0 }}</span>
        <span class="git-review-panel__removed">-{{ gitStatus?.removedLines ?? 0 }}</span>
      </div>

      <div ref="actionsRoot" class="git-review-panel__actions">
        <button type="button" aria-label="Refresh repository diff" title="Refresh" @click="emit('refresh')">
          <RefreshIcon aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Review options"
          title="Review options"
          :aria-expanded="menuOpen"
          @click.stop="menuOpen = !menuOpen"
        >
          <DotsVerticalIcon aria-hidden="true" />
        </button>
        <AppMenu
          v-if="menuOpen"
          class="git-review-panel__menu"
          ariaLabel="Review options"
          :items="menuItems"
          @select="selectMenuItem"
        />
      </div>
    </header>

    <div v-if="workflow" class="git-review-panel__workflow" aria-label="Commit and pull request workflow">
      <p v-if="workflowError" class="git-review-panel__error" role="alert">{{ workflowError }}</p>
      <p v-if="workflow.detached" class="git-review-panel__warning">Check out or create a branch before committing or pushing.</p>
      <p v-else-if="!workflow.remote" class="git-review-panel__warning">Add a Git remote before pushing.</p>
      <p v-else-if="!workflow.githubConnected" class="git-review-panel__warning">Connect GitHub in Settings → Connections before creating a pull request.</p>
      <p v-else-if="workflow.githubError" class="git-review-panel__warning">GitHub status unavailable: {{ workflow.githubError }}</p>
      <p v-else-if="workflow.files.length" class="git-review-panel__warning">Commit all selected changes, then push the branch before creating a pull request.</p>
      <p v-if="workflow.existingPullRequest" class="git-review-panel__existing-pr">
        Pull request #{{ workflow.existingPullRequest.number }} already exists: {{ workflow.existingPullRequest.title }}
      </p>

      <fieldset v-if="workflow.files.length" class="git-review-panel__files">
        <legend>Select changes to stage</legend>
        <label v-for="file in workflow.files" :key="file.path">
          <input v-model="selectedPaths" type="checkbox" :value="file.path" />
          <code>{{ file.indexStatus }}{{ file.worktreeStatus }}</code>
          <span>{{ file.path }}</span>
        </label>
        <button type="button" :disabled="busy || selectedPaths.length === 0" @click="stageSelected">Stage selected</button>
      </fieldset>

      <div class="git-review-panel__form">
        <label>Commit message<input v-model="commitMessage" type="text" placeholder="Describe this change" /></label>
        <button type="button" :disabled="busy || !commitMessage.trim() || workflow.stagedFiles.length === 0 || workflow.detached" @click="commit">Commit</button>
        <button type="button" :disabled="busy || workflow.detached || !workflow.remote || workflow.files.length > 0" @click="push">Push {{ workflow.branch ?? 'branch' }}</button>
      </div>

      <div v-if="!workflow.existingPullRequest" class="git-review-panel__form git-review-panel__pr-form">
        <label>Pull request title<input v-model="pullRequestTitle" type="text" /></label>
        <label>Pull request body<textarea v-model="pullRequestBody" rows="3" /></label>
        <button type="button" :disabled="busy || !pullRequestTitle.trim() || !workflow.githubConnected || Boolean(workflow.githubError) || workflow.detached || !workflow.remote || workflow.files.length > 0" @click="createPullRequest">Create draft PR</button>
      </div>
    </div>

    <GitDiffPreviewPanel
      :collapse-all-signal="collapseAllSignal"
      :diff="panel.diff"
      :error="panel.error"
      :expand-all-signal="expandAllSignal"
      :state="panel.state"
      :word-wrap="wordWrap"
      @all-expanded-change="allExpanded = $event"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Agent, AgentGitCommitInput, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStageInput, AgentGitStatus, AgentGitWorkflow } from '@codex-claw/core/contracts';
import { DotsVerticalIcon, GitHubIcon, ListDetailsIcon, RefreshIcon, TextWrapDisabledIcon, TextWrapIcon } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
import type { SidePanelGitDiffState } from './side-panel';

const props = defineProps<{
  agent: Agent;
  gitStatus?: AgentGitStatus | null;
  panel: SidePanelGitDiffState;
  getWorkflow?: (agentId: string) => Promise<AgentGitWorkflow>;
  stageFiles?: (agentId: string, input: AgentGitStageInput) => Promise<AgentGitWorkflow>;
  commitChanges?: (agentId: string, input: AgentGitCommitInput) => Promise<AgentGitWorkflow>;
  pushBranch?: (agentId: string, input: AgentGitPushInput) => Promise<AgentGitWorkflow>;
  createPullRequest?: (agentId: string, input: AgentGitPullRequestInput) => Promise<AgentGitWorkflow>;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const actionsRoot = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const wordWrap = ref(false);
const allExpanded = ref(true);
const expandAllSignal = ref(0);
const collapseAllSignal = ref(0);
const workflow = ref<AgentGitWorkflow | null>(null);
const workflowError = ref<string | null>(null);
const busy = ref(false);
const selectedPaths = ref<string[]>([]);
const commitMessage = ref('');
const pullRequestTitle = ref('');
const pullRequestBody = ref('');
const repositoryName = computed(() => fileBasename(props.gitStatus?.folder ?? props.agent.folder));
const menuItems = computed<AppMenuItem[]>(() => [
  {
    id: 'word-wrap',
    type: 'checkbox',
    label: 'Word wrap',
    icon: wordWrap.value ? TextWrapIcon : TextWrapDisabledIcon,
    checked: wordWrap.value,
  },
  {
    id: allExpanded.value ? 'collapse-all' : 'expand-all',
    type: 'action',
    label: allExpanded.value ? 'Collapse all' : 'Expand all',
    icon: ListDetailsIcon,
  },
]);

onMounted(() => {
  document.addEventListener('click', closeMenuOnOutsideClick);
  void loadWorkflow();
});
onBeforeUnmount(() => document.removeEventListener('click', closeMenuOnOutsideClick));

function selectMenuItem(itemId: string): void {
  menuOpen.value = false;
  if (itemId === 'word-wrap') {
    wordWrap.value = !wordWrap.value;
  } else if (itemId === 'expand-all') {
    expandAllSignal.value += 1;
  } else if (itemId === 'collapse-all') {
    collapseAllSignal.value += 1;
  }
}

function closeMenuOnOutsideClick(event: MouseEvent): void {
  if (!actionsRoot.value?.contains(event.target as Node)) {
    menuOpen.value = false;
  }
}

function fileBasename(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments.at(-1) ?? path;
}

async function loadWorkflow(): Promise<void> {
  if (!props.getWorkflow) return;
  await perform(async () => {
    workflow.value = await props.getWorkflow!(props.agent.id);
    selectedPaths.value = [...workflow.value.unstagedFiles];
    if (!pullRequestTitle.value) pullRequestTitle.value = `Update ${workflow.value.branch ?? repositoryName.value}`;
  });
}

async function stageSelected(): Promise<void> {
  if (!props.stageFiles || !workflow.value) return;
  const message = `Stage ${selectedPaths.value.length} selected file(s) in ${workflow.value.repository} on ${workflow.value.branch ?? 'detached HEAD'}?`;
  if (!window.confirm(message)) return;
  await perform(async () => { workflow.value = await props.stageFiles!(props.agent.id, { paths: selectedPaths.value, confirmed: true }); });
}

async function commit(): Promise<void> {
  if (!props.commitChanges || !workflow.value) return;
  if (!window.confirm(`Create commit in ${workflow.value.repository} on ${workflow.value.branch} with message “${commitMessage.value.trim()}”?`)) return;
  await perform(async () => { workflow.value = await props.commitChanges!(props.agent.id, { message: commitMessage.value, confirmed: true }); commitMessage.value = ''; });
}

async function push(): Promise<void> {
  if (!props.pushBranch || !workflow.value) return;
  if (!window.confirm(`Push ${workflow.value.repository}:${workflow.value.branch} to ${workflow.value.remote} (${workflow.value.remoteUrl})?`)) return;
  await perform(async () => { workflow.value = await props.pushBranch!(props.agent.id, { confirmed: true }); });
}

async function createPullRequest(): Promise<void> {
  if (!props.createPullRequest || !workflow.value) return;
  if (!window.confirm(`Create draft pull request for ${workflow.value.repository}:${workflow.value.branch} on GitHub?`)) return;
  await perform(async () => { workflow.value = await props.createPullRequest!(props.agent.id, { title: pullRequestTitle.value, body: pullRequestBody.value, confirmed: true }); });
}

async function perform(action: () => Promise<void>): Promise<void> {
  busy.value = true;
  workflowError.value = null;
  try { await action(); }
  catch (error) { workflowError.value = error instanceof Error ? error.message : String(error); }
  finally { busy.value = false; }
}
</script>

<style scoped>
.git-review-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-surface-lowest);
}

.git-review-panel__toolbar {
  min-height: 56px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-4) var(--space-8);
  border-bottom: 1px solid var(--color-border);
}

.git-review-panel__summary {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.git-review-panel__repository,
.git-review-panel__branch,
.git-review-panel__stats,
.git-review-panel__actions {
  display: flex;
  align-items: center;
}

.git-review-panel__repository {
  gap: var(--space-3);
  min-width: 0;
}

.git-review-panel__repository svg {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
}

.git-review-panel__repository strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
}

.git-review-panel__branch {
  gap: var(--space-2);
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
  white-space: nowrap;
}

.git-review-panel__upstream {
  overflow: hidden;
  text-overflow: ellipsis;
}

.git-review-panel__stats {
  gap: var(--space-2);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
}

.git-review-panel__added { color: var(--color-success); }
.git-review-panel__removed { color: var(--color-error); }

.git-review-panel__actions {
  position: relative;
  gap: var(--space-1);
}

.git-review-panel__actions > button {
  display: grid;
  place-items: center;
  width: var(--space-12);
  height: var(--space-12);
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.git-review-panel__actions > button:hover,
.git-review-panel__actions > button[aria-expanded='true'] {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.git-review-panel__actions svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.git-review-panel__menu {
  position: absolute;
  z-index: 10;
  top: calc(100% + var(--space-2));
  right: 0;
}

.git-review-panel__workflow {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-8);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-low);
  font-size: var(--font-size-13);
}

.git-review-panel__workflow p { margin: 0; }
.git-review-panel__error { color: var(--color-error); }
.git-review-panel__warning { color: var(--color-warning); }
.git-review-panel__existing-pr { color: var(--color-success); }
.git-review-panel__files { display: grid; gap: var(--space-2); margin: 0; padding: 0; border: 0; }
.git-review-panel__files label { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.git-review-panel__files label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.git-review-panel__form { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: var(--space-3); }
.git-review-panel__pr-form { grid-template-columns: 1fr; }
.git-review-panel__form label { display: grid; gap: var(--space-1); color: var(--color-text-muted); }
.git-review-panel__form input,
.git-review-panel__form textarea {
  min-width: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font: inherit;
}
.git-review-panel__workflow button {
  width: fit-content;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font: inherit;
  cursor: pointer;
}
.git-review-panel__workflow button:disabled { opacity: 0.5; cursor: default; }
</style>

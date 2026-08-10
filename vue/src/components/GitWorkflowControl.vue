<template>
  <div
    ref="root"
    class="git-workflow-control agent-header__git-actions"
  >
    <button
      class="git-workflow-control__primary"
      type="button"
      :disabled="busy || !firstEnabledAction"
      aria-label="Run Git action"
      title="Run Git action"
      @click="runFirstEnabled"
    >
      <GitHubIcon aria-hidden="true" />
    </button>
    <button
      class="git-workflow-control__trigger"
      type="button"
      aria-label="Choose Git action"
      title="Choose Git action"
      :aria-expanded="menuOpen"
      @click.stop="toggleMenu"
    >
      <ChevronDown aria-hidden="true" />
    </button>
    <AppMenu
      v-if="menuOpen"
      class="git-workflow-control__menu"
      ariaLabel="Git actions"
      :items="menuItems"
      @select="selectAction"
    />
  </div>

  <el-dialog
    v-if="commitDialogOpen"
    v-model="commitDialogOpen"
    class="claw-dialog git-workflow-control__dialog"
    width="min(560px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">Commit changes</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch ?? 'detached HEAD' }}</span></div></template>
    <div class="git-workflow-control__dialog-form">
      <textarea
        ref="commitMessageInput"
        v-model="commitMessage"
        autofocus
        rows="4"
        placeholder="Commit message…"
      />
      <label class="git-workflow-control__check">
        <el-switch v-model="includeUnstaged" size="small" />
        <span>Include unstaged changes</span>
        <span class="git-workflow-control__stats" :class="{ 'git-workflow-control__stats--muted': !includeUnstaged }">+{{ trackedAddedLines }} <em>−{{ trackedRemovedLines }}</em></span>
      </label>
      <label class="git-workflow-control__check">
        <el-switch v-model="includeUntracked" size="small" :disabled="!hasUntrackedFiles || busy" />
        <span>{{ hasUntrackedFiles ? 'Include untracked files' : 'No untracked files' }}</span>
        <span v-if="hasUntrackedFiles" class="git-workflow-control__stats" :class="{ 'git-workflow-control__stats--muted': !includeUntracked }">+{{ untrackedAddedLines }}</span>
      </label>
    </div>
    <template #footer>
      <div class="claw-dialog__footer"><button class="git-workflow-control__cancel" type="button" @click="commitDialogOpen = false">Cancel</button><button class="git-workflow-control__submit" type="button" :disabled="busy || !canCommit" @click="commit(false)">Commit</button><button class="git-workflow-control__submit" type="button" :disabled="busy || !canCommit || !pushCapable" @click="commit(true)">Commit and push</button></div>
    </template>
  </el-dialog>

  <el-dialog
    v-if="pullRequestDialogOpen"
    v-model="pullRequestDialogOpen"
    class="claw-dialog git-workflow-control__dialog"
    width="min(560px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">Create pull request</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch }}</span></div></template>
    <div class="git-workflow-control__dialog-form">
      <input v-model="pullRequestTitle" autofocus placeholder="Title" />
      <textarea v-model="pullRequestBody" rows="5" placeholder="Describe the change (optional)" />
    </div>
    <template #footer>
      <div class="claw-dialog__footer"><button class="git-workflow-control__cancel" type="button" @click="pullRequestDialogOpen = false">Cancel</button><button class="git-workflow-control__submit" type="button" :disabled="busy || !pullRequestTitle.trim()" @click="createPullRequest">Create PR</button></div>
    </template>
  </el-dialog>

  <el-dialog
    v-if="mergeDialogOpen"
    v-model="mergeDialogOpen"
    class="claw-dialog git-workflow-control__dialog"
    width="min(560px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">Merge branch</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch }}</span></div></template>
    <div class="git-workflow-control__dialog-form">
      <div class="git-workflow-control__merge-strategy" role="radiogroup" aria-label="Merge strategy">
        <label :class="{ 'git-workflow-control__merge-option--selected': mergeStrategy === 'merge' }">
          <input v-model="mergeStrategy" type="radio" value="merge" />
          <span>Merge commit</span>
        </label>
        <label :class="{ 'git-workflow-control__merge-option--selected': mergeStrategy === 'squash' }">
          <input v-model="mergeStrategy" type="radio" value="squash" />
          <span>Squash and merge</span>
        </label>
      </div>
      <label class="git-workflow-control__check">
        <el-switch v-model="deleteBranch" size="small" />
        <span>Delete branch after merging</span>
      </label>
      <label class="git-workflow-control__check">
        <el-switch v-model="deleteWorktree" size="small" />
        <span>Delete worktree after merging</span>
      </label>
      <p v-if="mergeUnavailable" class="git-workflow-control__hint">Merge is available once a merge target is configured for this worktree.</p>
    </div>
    <template #footer>
      <div class="claw-dialog__footer"><button class="git-workflow-control__cancel" type="button" @click="mergeDialogOpen = false">Cancel</button><button class="git-workflow-control__submit" type="button" :disabled="busy" @click="merge">Merge</button></div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Agent, AgentGitCommitInput, AgentGitMergeInput, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStatus, AgentGitWorkflow } from '@codex-claw/core/contracts';
import { ChevronDown, CloudUploadIcon, GitCommitIcon, GitForkIcon, GitHubIcon, GitMergeIcon } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';

const props = defineProps<{
  agent: Agent;
  gitStatus?: AgentGitStatus | null;
  getWorkflow?: (agentId: string) => Promise<AgentGitWorkflow>;
  commitChanges?: (agentId: string, input: AgentGitCommitInput) => Promise<AgentGitWorkflow>;
  pushBranch?: (agentId: string, input: AgentGitPushInput) => Promise<AgentGitWorkflow>;
  createPullRequest?: (agentId: string, input: AgentGitPullRequestInput) => Promise<AgentGitWorkflow>;
  mergeBranch?: (agentId: string, input: AgentGitMergeInput) => Promise<AgentGitWorkflow>;
}>();

const emit = defineEmits<{ 'open-git-diff': [] }>();
const root = ref<HTMLElement | null>(null);
const workflow = ref<AgentGitWorkflow | null>(null);
const workflowError = ref<string | null>(null);
const menuOpen = ref(false);
const busy = ref(false);
const commitDialogOpen = ref(false);
const pullRequestDialogOpen = ref(false);
const mergeDialogOpen = ref(false);
const commitMessageInput = ref<HTMLTextAreaElement | null>(null);
const commitMessage = ref('');
const includeUnstaged = ref(true);
const includeUntracked = ref(true);
const pullRequestTitle = ref('');
const pullRequestBody = ref('');
const mergeStrategy = ref<'merge' | 'squash'>('merge');
const deleteBranch = ref(false);
const deleteWorktree = ref(false);
const mergeUnavailable = computed(() => !props.mergeBranch);
const unstagedAddedLines = computed(() => workflow.value?.unstagedAddedLines ?? props.gitStatus?.addedLines ?? 0);
const unstagedRemovedLines = computed(() => workflow.value?.unstagedRemovedLines ?? props.gitStatus?.removedLines ?? 0);
const trackedAddedLines = computed(() => (workflow.value?.stagedAddedLines ?? 0) + unstagedAddedLines.value);
const trackedRemovedLines = computed(() => (workflow.value?.stagedRemovedLines ?? 0) + unstagedRemovedLines.value);
const commitTrackedAddedLines = computed(() => (workflow.value?.stagedAddedLines ?? 0) + (includeUnstaged.value ? unstagedAddedLines.value : 0));
const commitTrackedRemovedLines = computed(() => (workflow.value?.stagedRemovedLines ?? 0) + (includeUnstaged.value ? unstagedRemovedLines.value : 0));
const commitAddedLines = computed(() => commitTrackedAddedLines.value + (includeUntracked.value ? workflow.value?.untrackedAddedLines ?? 0 : 0));
const commitRemovedLines = computed(() => commitTrackedRemovedLines.value + (includeUntracked.value ? workflow.value?.untrackedRemovedLines ?? 0 : 0));
const untrackedFileCount = computed(() => workflow.value?.files.filter((file) => file.indexStatus === '?').length ?? 0);
const hasUntrackedFiles = computed(() => untrackedFileCount.value > 0);
const untrackedAddedLines = computed(() => workflow.value?.untrackedAddedLines ?? 0);
const canCommit = computed(() => Boolean(commitMessage.value.trim()) && (commitAddedLines.value > 0 || commitRemovedLines.value > 0));

const commitEnabled = computed(() => Boolean(workflow.value?.files.length));
const pushEnabled = computed(() => Boolean(workflow.value?.branch && workflow.value?.remote && (workflow.value?.ahead ?? props.gitStatus?.ahead ?? 0) > 0));
const pushCapable = computed(() => Boolean(workflow.value?.branch && workflow.value?.remote && props.pushBranch));
const branchEnabled = computed(() => Boolean(workflow.value?.branch && !workflow.value?.detached));
const integrationBranch = computed(() => ['main', 'master', 'develop', 'development', 'trunk'].includes(workflow.value?.branch ?? ''));
const mergeEnabled = computed(() => branchEnabled.value && !integrationBranch.value);
const prEnabled = computed(() => branchEnabled.value && (!integrationBranch.value || Boolean(workflow.value?.files.length)));
const firstEnabledAction = computed(() => (commitEnabled.value ? 'commit' : pushEnabled.value ? 'push' : prEnabled.value ? 'create-pr' : mergeEnabled.value && !mergeUnavailable.value ? 'merge' : null));
const menuItems = computed<AppMenuItem[]>(() => [
  { id: 'commit', type: 'action', label: 'Commit', icon: GitCommitIcon, disabled: !commitEnabled.value },
  { id: 'push', type: 'action', label: 'Push', icon: CloudUploadIcon, disabled: !pushEnabled.value },
  { id: 'create-pr', type: 'action', label: 'Create PR', icon: GitForkIcon, disabled: !prEnabled.value },
  { id: 'merge', type: 'action', label: 'Merge', icon: GitMergeIcon, disabled: !mergeEnabled.value || mergeUnavailable.value },
]);

watch(commitDialogOpen, (open) => {
  if (open) void nextTick(() => commitMessageInput.value?.focus());
});

onMounted(() => {
  document.addEventListener('click', closeMenu);
  void loadWorkflow();
});
onBeforeUnmount(() => document.removeEventListener('click', closeMenu));
watch(() => [props.agent.id, props.gitStatus?.updatedAt], () => { void loadWorkflow(); });

async function loadWorkflow(closeMenu = true): Promise<void> {
  if (!props.getWorkflow) return;
  workflow.value = null;
  workflowError.value = null;
  if (closeMenu) menuOpen.value = false;
  try { workflow.value = await props.getWorkflow(props.agent.id); } catch (error) { workflowError.value = error instanceof Error ? error.message : String(error); }
}
function closeMenu(event: MouseEvent): void { if (!root.value?.contains(event.target as Node)) menuOpen.value = false; }
function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) void loadWorkflow(false);
}
function runFirstEnabled(): void { if (firstEnabledAction.value) selectAction(firstEnabledAction.value); }
function selectAction(action: string): void {
  menuOpen.value = false;
  if (action === 'commit' && commitEnabled.value) commitDialogOpen.value = true;
  else if (action === 'push' && pushEnabled.value) void push();
  else if (action === 'create-pr' && prEnabled.value) { pullRequestTitle.value = `Update ${workflow.value?.branch ?? ''}`.trim(); pullRequestDialogOpen.value = true; }
  else if (action === 'merge' && mergeEnabled.value && !mergeUnavailable.value) mergeDialogOpen.value = true;
}
async function commit(pushAfter: boolean): Promise<void> {
  if (!props.commitChanges) return;
  await perform(async () => {
    workflow.value = await props.commitChanges!(props.agent.id, { message: commitMessage.value, includeUnstaged: includeUnstaged.value, includeUntracked: includeUntracked.value, confirmed: true });
    if (pushAfter && props.pushBranch) workflow.value = await props.pushBranch(props.agent.id, { confirmed: true });
    commitMessage.value = '';
    commitDialogOpen.value = false;
  });
}
async function push(): Promise<void> {
  if (!props.pushBranch) return;
  await perform(async () => { workflow.value = await props.pushBranch!(props.agent.id, { confirmed: true }); });
}
async function createPullRequest(): Promise<void> {
  if (!props.createPullRequest) return;
  await perform(async () => { workflow.value = await props.createPullRequest!(props.agent.id, { title: pullRequestTitle.value, body: pullRequestBody.value, confirmed: true }); pullRequestDialogOpen.value = false; });
}
async function merge(): Promise<void> {
  if (!props.mergeBranch) return;
  await perform(async () => { workflow.value = await props.mergeBranch!(props.agent.id, { strategy: mergeStrategy.value, deleteBranch: deleteBranch.value, deleteWorktree: deleteWorktree.value, confirmed: true }); mergeDialogOpen.value = false; });
}
async function perform(action: () => Promise<void>): Promise<void> { busy.value = true; workflowError.value = null; try { await action(); } catch (error) { workflowError.value = error instanceof Error ? error.message : String(error); } finally { busy.value = false; } }
</script>

<style scoped>
.git-workflow-control {
  position: relative;
  display: inline-flex;
  align-items: stretch;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  -webkit-app-region: no-drag;
}

.git-workflow-control > button {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.git-workflow-control__primary {
  width: 34px;
  border-radius: calc(var(--radius-lg) - 1px) 0 0 calc(var(--radius-lg) - 1px);
}

.git-workflow-control__trigger {
  width: 28px;
  border-left: 1px solid var(--color-border) !important;
  border-radius: 0 calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0;
}

.git-workflow-control > button:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-high);
}

.git-workflow-control > button:disabled {
  opacity: 0.45;
  cursor: default;
}

.git-workflow-control svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.git-workflow-control__menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + var(--space-2));
  right: 0;
}

.git-workflow-control__dialog-form {
  display: grid;
  gap: 0;
}

.git-workflow-control__dialog-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-8);
  min-width: 0;
}

.git-workflow-control__dialog-header .git-workflow-control__branch {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.git-workflow-control__dialog-form textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 112px;
  border: 0;
  border-radius: 0;
  padding: var(--space-4) 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  outline: none;
  resize: none;
}

.git-workflow-control__dialog-form input[type="text"],
.git-workflow-control__dialog-form > input:not([type]) {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font: inherit;
  outline: none;
}

.git-workflow-control__dialog-form input[type="text"]:focus,
.git-workflow-control__dialog-form > input:not([type]):focus {
  border-color: var(--color-primary);
  background: var(--color-surface-low);
}

.git-workflow-control__branch,
.git-workflow-control__hint {
  color: var(--color-text-muted);
}

.git-workflow-control__check {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-height: var(--space-16);
  border-top: 1px solid var(--color-border);
  padding: var(--space-4) 0;
}

.git-workflow-control__merge-strategy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.git-workflow-control__merge-strategy label {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: var(--space-20);
  padding: 0 var(--space-2);
  color: var(--color-text-muted);
  cursor: pointer;
}

.git-workflow-control__merge-strategy label + label {
  border-left: 1px solid var(--color-border);
}

.git-workflow-control__merge-strategy label:hover,
.git-workflow-control__merge-option--selected {
  color: var(--color-text) !important;
  background: var(--color-surface-low);
}

.git-workflow-control__merge-strategy input {
  margin: 0;
  accent-color: var(--color-primary);
}

.git-workflow-control__stats {
  margin-left: auto;
  color: var(--color-success);
  font-variant-numeric: tabular-nums;
}

.git-workflow-control__stats em {
  color: var(--color-error);
  font-style: normal;
}

.git-workflow-control__stats--muted,
.git-workflow-control__stats--muted em {
  color: var(--color-text-muted);
}

:global(.git-workflow-control__dialog .el-dialog__body) {
  padding-bottom: 0;
}

.git-workflow-control__cancel,
.git-workflow-control__submit {
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-8);
  font: inherit;
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  cursor: pointer;
}

.git-workflow-control__cancel {
  border: 1px solid var(--color-border);
  background: transparent;
}

.git-workflow-control__submit {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.git-workflow-control__submit:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

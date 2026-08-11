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
    :class="{ 'git-workflow-control__dialog--transient': commitOperation.status !== 'editing' && commitOperation.status !== 'error' }"
    width="min(560px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    :close-on-click-modal="!commitOperationRunning"
    :close-on-press-escape="!commitOperationRunning"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">Commit changes</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch ?? 'detached HEAD' }}</span></div></template>
    <div
      v-if="commitOperation.status === 'editing'"
      class="git-workflow-control__dialog-form"
    >
      <textarea
        ref="commitMessageInput"
        v-model="commitMessage"
        autofocus
        rows="4"
        placeholder="Commit message…"
      />
      <div class="git-workflow-control__check git-workflow-control__scope-row">
        <span class="git-workflow-control__scope-spacer" aria-hidden="true" />
        <span>Staged changes</span>
        <span class="git-workflow-control__stats">+{{ stagedAddedLines }} <em>−{{ stagedRemovedLines }}</em></span>
      </div>
      <label class="git-workflow-control__check git-workflow-control__scope-row">
        <el-switch v-model="includeUnstaged" size="small" />
        <span>Include unstaged changes</span>
        <span class="git-workflow-control__stats" :class="{ 'git-workflow-control__stats--muted': !includeUnstaged }">+{{ unstagedAddedLines }} <em>−{{ unstagedRemovedLines }}</em></span>
      </label>
      <label class="git-workflow-control__check git-workflow-control__scope-row">
        <el-switch v-model="includeUntracked" size="small" :disabled="!hasUntrackedFiles || busy" />
        <span>{{ hasUntrackedFiles ? 'Include untracked files' : 'No untracked files' }}</span>
        <span class="git-workflow-control__stats" :class="{ 'git-workflow-control__stats--muted': !includeUntracked || !hasUntrackedFiles }">+{{ untrackedAddedLines }} <em>−{{ untrackedRemovedLines }}</em></span>
      </label>
    </div>
    <GitOperationFeedback
      v-else
      :status="commitFeedbackStatus"
      :title="commitOperationTitle"
      :detail="commitOperationDetail"
    >
      <template #icon><GitCommitIcon /></template>
    </GitOperationFeedback>
    <template #footer>
      <div
        v-if="commitOperation.status === 'editing'"
        class="claw-dialog__footer"
      ><button class="git-workflow-control__cancel" type="button" @click="commitDialogOpen = false">Cancel</button><button class="git-workflow-control__submit" type="button" :disabled="busy || !canCommit" @click="commit(false)">Commit</button><button class="git-workflow-control__submit" type="button" :disabled="busy || !canCommit || !pushCapable" @click="commit(true)">Commit and push</button></div>
      <div
        v-else-if="commitOperation.status === 'error'"
        class="claw-dialog__footer"
      ><button class="git-workflow-control__cancel" type="button" @click="commitDialogOpen = false">Close</button><button class="git-workflow-control__submit" type="button" @click="commitOperation.commitCreated ? retryCommitPush() : returnToCommitForm()">{{ commitOperation.commitCreated ? 'Retry push' : 'Back' }}</button></div>
    </template>
  </el-dialog>

  <el-dialog
    v-if="pushDialogOpen"
    v-model="pushDialogOpen"
    class="claw-dialog git-workflow-control__dialog"
    :class="{ 'git-workflow-control__dialog--transient': pushOperation.status === 'pushing' || pushOperation.status === 'success' }"
    width="min(620px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    :close-on-click-modal="!pushOperationRunning"
    :close-on-press-escape="!pushOperationRunning"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">Push changes</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch }}</span></div></template>
    <div
      v-if="pushOperation.status === 'confirming'"
      class="git-workflow-control__push-summary"
    >
      <strong class="git-workflow-control__push-count">
        {{ pendingPushCount }} {{ pendingPushCount === 1 ? 'commit' : 'commits' }}
      </strong>
      <div class="git-workflow-control__push-destination">
        <ArrowRightIcon class="git-workflow-control__push-arrow" aria-hidden="true" />
        <code>{{ pushDestination }}</code>
      </div>
      <p v-if="workflow?.files.length" class="git-workflow-control__push-note">Uncommitted changes stay in this worktree and will not be pushed.</p>
    </div>
    <GitOperationFeedback
      v-else
      :status="pushFeedbackStatus"
      :title="pushOperationTitle"
      :detail="pushOperationDetail"
    >
      <template #icon><CloudUploadIcon /></template>
    </GitOperationFeedback>
    <template #footer>
      <div
        v-if="pushOperation.status === 'confirming'"
        class="claw-dialog__footer"
      ><button class="git-workflow-control__cancel" type="button" @click="pushDialogOpen = false">Cancel</button><button class="git-workflow-control__submit" type="button" :disabled="busy" @click="push">Push</button></div>
      <div
        v-else-if="pushOperation.status === 'error'"
        class="claw-dialog__footer"
      ><button class="git-workflow-control__cancel" type="button" @click="pushDialogOpen = false">Close</button><button class="git-workflow-control__submit" type="button" @click="push">Retry</button></div>
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
    :class="{ 'git-workflow-control__dialog--transient': mergeOperation.status === 'merging' || mergeOperation.status === 'pushing' || mergeOperation.status === 'success' }"
    width="min(660px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    :close-on-click-modal="!mergeOperationRunning"
    :close-on-press-escape="!mergeOperationRunning"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">Merge branch</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch }}</span></div></template>
    <div v-if="mergeOperation.status === 'confirming'" class="git-workflow-control__dialog-form">
      <div class="git-workflow-control__merge-strategy" role="radiogroup" aria-label="Merge strategy">
        <label :class="{ 'git-workflow-control__merge-option--selected': mergeStrategy === 'merge' }">
          <input v-model="mergeStrategy" type="radio" value="merge" />
          <GitMergeIcon class="git-workflow-control__merge-icon" aria-hidden="true" />
          <span class="git-workflow-control__merge-copy">
            <strong>Merge commit</strong>
            <span>Preserve every commit in a merge commit.</span>
          </span>
        </label>
        <label :class="{ 'git-workflow-control__merge-option--selected': mergeStrategy === 'squash' }">
          <input v-model="mergeStrategy" type="radio" value="squash" />
          <ArrowsMinimizeIcon class="git-workflow-control__merge-icon" aria-hidden="true" />
          <span class="git-workflow-control__merge-copy">
            <strong>Squash and merge</strong>
            <span>Combine all changes into a single commit.</span>
          </span>
        </label>
      </div>
      <textarea
        v-if="mergeStrategy === 'squash'"
        ref="squashCommitMessageInput"
        v-model="squashCommitMessage"
        class="git-workflow-control__merge-message"
        rows="4"
        aria-label="Squash commit message"
        placeholder="Squash commit message…"
      />
      <label v-if="workflow?.isLinkedWorktree" class="git-workflow-control__check git-workflow-control__merge-cleanup">
        <el-switch v-model="deleteWorktree" size="small" />
        <span>Delete worktree after merging</span>
      </label>
      <label v-if="workflow?.isLinkedWorktree" class="git-workflow-control__check git-workflow-control__merge-cleanup">
        <el-switch v-model="deleteBranch" size="small" :disabled="!deleteWorktree" />
        <span>Delete branch after removing worktree</span>
      </label>
      <p v-if="mergeUnavailable" class="git-workflow-control__hint">Merge is available once a merge target is configured for this worktree.</p>
    </div>
    <GitOperationFeedback
      v-else
      :status="mergeFeedbackStatus"
      :title="mergeOperationTitle"
      :detail="mergeOperationDetail"
    >
      <template #icon><GitMergeIcon /></template>
    </GitOperationFeedback>
    <template #footer>
      <div v-if="mergeOperation.status === 'confirming'" class="claw-dialog__footer"><button class="git-workflow-control__cancel" type="button" @click="mergeDialogOpen = false">Cancel</button><button class="git-workflow-control__submit" type="button" :disabled="busy || !canMerge" @click="merge(false)">Merge</button><button class="git-workflow-control__submit" type="button" :disabled="busy || !canMerge || !pushCapable" @click="merge(true)">Merge and push</button></div>
      <div v-else-if="mergeOperation.status === 'error'" class="claw-dialog__footer"><button class="git-workflow-control__cancel" type="button" @click="mergeDialogOpen = false">Close</button><button class="git-workflow-control__submit" type="button" @click="mergeOperation.mergeCreated ? retryMergePush() : merge(mergeOperation.pushAfter)">{{ mergeOperation.mergeCreated ? 'Retry push' : 'Retry' }}</button></div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Agent, AgentGitCommitInput, AgentGitMergeInput, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStatus, AgentGitWorkflow } from '@codex-claw/core/contracts';
import { ArrowRightIcon, ArrowsMinimizeIcon, ChevronDown, CloudUploadIcon, GitCommitIcon, GitForkIcon, GitHubIcon, GitMergeIcon } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import GitOperationFeedback from './GitOperationFeedback.vue';

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
const pushDialogOpen = ref(false);
const pullRequestDialogOpen = ref(false);
const mergeDialogOpen = ref(false);
const commitMessageInput = ref<HTMLTextAreaElement | null>(null);
const squashCommitMessageInput = ref<HTMLTextAreaElement | null>(null);
const commitMessage = ref('');
const includeUnstaged = ref(true);
const includeUntracked = ref(false);
const pullRequestTitle = ref('');
const pullRequestBody = ref('');
const mergeStrategy = ref<'merge' | 'squash'>('merge');
const squashCommitMessage = ref('');
const deleteBranch = ref(false);
const deleteWorktree = ref(false);
const committedMessage = ref('');
type CommitOperation =
  | { status: 'editing' }
  | { status: 'committing' }
  | { status: 'pushing' }
  | { status: 'success'; pushed: boolean }
  | { status: 'error'; commitCreated: boolean; message: string };
const commitOperation = ref<CommitOperation>({ status: 'editing' });
type PushOperation =
  | { status: 'confirming' }
  | { status: 'pushing' }
  | { status: 'success' }
  | { status: 'error'; message: string };
const pushOperation = ref<PushOperation>({ status: 'confirming' });
type MergeOperation =
  | { status: 'confirming' }
  | { status: 'merging'; branch: string; pushAfter: boolean }
  | { status: 'pushing'; branch: string }
  | { status: 'success'; branch: string; pushed: boolean }
  | { status: 'error'; branch: string; mergeCreated: boolean; pushAfter: boolean; message: string };
const mergeOperation = ref<MergeOperation>({ status: 'confirming' });
let commitSuccessTimer: ReturnType<typeof setTimeout> | null = null;
let pushSuccessTimer: ReturnType<typeof setTimeout> | null = null;
let mergeSuccessTimer: ReturnType<typeof setTimeout> | null = null;
const mergeUnavailable = computed(() => !props.mergeBranch);
const unstagedAddedLines = computed(() => workflow.value?.unstagedAddedLines ?? props.gitStatus?.addedLines ?? 0);
const unstagedRemovedLines = computed(() => workflow.value?.unstagedRemovedLines ?? props.gitStatus?.removedLines ?? 0);
const stagedAddedLines = computed(() => workflow.value?.stagedAddedLines ?? 0);
const stagedRemovedLines = computed(() => workflow.value?.stagedRemovedLines ?? 0);
const commitTrackedAddedLines = computed(() => (workflow.value?.stagedAddedLines ?? 0) + (includeUnstaged.value ? unstagedAddedLines.value : 0));
const commitTrackedRemovedLines = computed(() => (workflow.value?.stagedRemovedLines ?? 0) + (includeUnstaged.value ? unstagedRemovedLines.value : 0));
const commitAddedLines = computed(() => commitTrackedAddedLines.value + (includeUntracked.value ? workflow.value?.untrackedAddedLines ?? 0 : 0));
const commitRemovedLines = computed(() => commitTrackedRemovedLines.value + (includeUntracked.value ? workflow.value?.untrackedRemovedLines ?? 0 : 0));
const untrackedFileCount = computed(() => workflow.value?.files.filter((file) => file.indexStatus === '?').length ?? 0);
const hasUntrackedFiles = computed(() => untrackedFileCount.value > 0);
const untrackedAddedLines = computed(() => workflow.value?.untrackedAddedLines ?? 0);
const untrackedRemovedLines = computed(() => workflow.value?.untrackedRemovedLines ?? 0);
const canCommit = computed(() => Boolean(commitMessage.value.trim()) && (commitAddedLines.value > 0 || commitRemovedLines.value > 0));
const commitOperationRunning = computed(() => commitOperation.value.status === 'committing' || commitOperation.value.status === 'pushing');
const commitFeedbackStatus = computed<'running' | 'success' | 'error'>(() => commitOperation.value.status === 'success' ? 'success' : commitOperation.value.status === 'error' ? 'error' : 'running');
const commitOperationTitle = computed(() => {
  if (commitOperation.value.status === 'committing') return 'Creating commit';
  if (commitOperation.value.status === 'pushing') return 'Pushing commit';
  if (commitOperation.value.status === 'success') return commitOperation.value.pushed ? 'Committed and pushed' : 'Commit created';
  if (commitOperation.value.status === 'error') return commitOperation.value.commitCreated ? 'Commit created, but push failed' : 'Commit failed';
  return '';
});
const commitOperationDetail = computed(() => commitOperation.value.status === 'error' ? commitOperation.value.message : commitOperation.value.status === 'pushing' || (commitOperation.value.status === 'success' && commitOperation.value.pushed) ? pushDestination.value : committedMessage.value);
const pendingPushCount = computed(() => workflow.value?.ahead ?? props.gitStatus?.ahead ?? 0);
const pushDestination = computed(() => workflow.value?.upstream ?? [workflow.value?.remote, workflow.value?.branch].filter(Boolean).join('/'));
const pushOperationRunning = computed(() => pushOperation.value.status === 'pushing');
const pushFeedbackStatus = computed<'running' | 'success' | 'error'>(() => pushOperation.value.status === 'success' ? 'success' : pushOperation.value.status === 'error' ? 'error' : 'running');
const pushOperationTitle = computed(() => pushOperation.value.status === 'pushing' ? `Pushing ${pendingPushCount.value} ${pendingPushCount.value === 1 ? 'commit' : 'commits'}` : pushOperation.value.status === 'success' ? 'Push complete' : 'Push failed');
const pushOperationDetail = computed(() => pushOperation.value.status === 'error' ? pushOperation.value.message : pushDestination.value);
const mergeOperationRunning = computed(() => mergeOperation.value.status === 'merging' || mergeOperation.value.status === 'pushing');
const mergeFeedbackStatus = computed<'running' | 'success' | 'error'>(() => mergeOperation.value.status === 'success' ? 'success' : mergeOperation.value.status === 'error' ? 'error' : 'running');
const mergeOperationTitle = computed(() => mergeOperation.value.status === 'success'
  ? mergeOperation.value.pushed ? 'Merged and pushed' : 'Merge complete'
  : mergeOperation.value.status === 'error'
    ? mergeOperation.value.mergeCreated ? 'Merge complete, but push failed' : 'Merge failed'
    : mergeOperation.value.status === 'pushing'
      ? 'Pushing merged branch'
    : mergeOperation.value.status === 'merging'
      ? `Merging ${mergeOperation.value.branch}`
      : '');
const mergeOperationDetail = computed(() => mergeOperation.value.status === 'error'
  ? mergeOperation.value.message
  : mergeOperation.value.status === 'success'
    ? mergeOperation.value.pushed ? `${mergeOperation.value.branch} merged and pushed successfully` : `${mergeOperation.value.branch} merged successfully`
    : mergeOperation.value.status === 'pushing'
      ? 'Pushing the resulting base branch'
    : deleteWorktree.value
      ? 'Merging changes and cleaning up the linked worktree'
      : 'Merging changes into the base worktree');

const commitEnabled = computed(() => workflow.value === null
  ? !workflowError.value && (props.gitStatus?.changedFiles ?? 0) > 0
  : Boolean(workflow.value.files.length));
const pushEnabled = computed(() => Boolean(workflow.value?.branch && workflow.value?.remote && (workflow.value?.ahead ?? props.gitStatus?.ahead ?? 0) > 0));
const pushCapable = computed(() => Boolean(workflow.value?.branch && workflow.value?.remote && props.pushBranch));
const branchEnabled = computed(() => Boolean(workflow.value?.branch && !workflow.value?.detached));
const integrationBranch = computed(() => ['main', 'master', 'develop', 'development', 'trunk'].includes(workflow.value?.branch ?? ''));
const mergeEnabled = computed(() => branchEnabled.value && !integrationBranch.value);
const canMerge = computed(() => mergeStrategy.value === 'merge' || Boolean(squashCommitMessage.value.trim()));
const prEnabled = computed(() => branchEnabled.value && (!integrationBranch.value || Boolean(workflow.value?.files.length)));
const firstEnabledAction = computed(() => (commitEnabled.value ? 'commit' : pushEnabled.value ? 'push' : prEnabled.value ? 'create-pr' : mergeEnabled.value && !mergeUnavailable.value ? 'merge' : null));
const menuItems = computed<AppMenuItem[]>(() => [
  { id: 'commit', type: 'action', label: 'Commit', icon: GitCommitIcon, disabled: !commitEnabled.value },
  { id: 'push', type: 'action', label: 'Push', icon: CloudUploadIcon, disabled: !pushEnabled.value },
  { id: 'create-pr', type: 'action', label: 'Create PR', icon: GitForkIcon, disabled: !prEnabled.value },
  { id: 'merge', type: 'action', label: 'Merge', icon: GitMergeIcon, disabled: !mergeEnabled.value || mergeUnavailable.value },
]);

watch(commitDialogOpen, (open) => {
  if (open && commitOperation.value.status === 'editing') {
    void nextTick(() => commitMessageInput.value?.focus());
  } else if (!open) {
    resetCommitOperation();
  }
});

watch(pushDialogOpen, (open) => {
  if (!open) resetPushOperation();
});

watch(mergeDialogOpen, (open) => {
  if (open) {
    resetMergeOperation();
    squashCommitMessage.value = '';
    if (!workflow.value?.isLinkedWorktree) {
      deleteWorktree.value = false;
      deleteBranch.value = false;
    }
  } else {
    resetMergeOperation();
  }
});

watch(deleteWorktree, (enabled) => {
  if (!enabled) deleteBranch.value = false;
});

watch(mergeStrategy, (strategy) => {
  if (strategy === 'squash' && mergeDialogOpen.value) void nextTick(() => squashCommitMessageInput.value?.focus());
});

onMounted(() => {
  document.addEventListener('click', closeMenu);
  void loadWorkflow({ reset: true });
});
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenu);
  clearCommitSuccessTimer();
  clearPushSuccessTimer();
  clearMergeSuccessTimer();
});
watch(() => props.agent.id, () => { void loadWorkflow({ reset: true }); });
watch(() => props.gitStatus?.updatedAt, () => { void loadWorkflow({ closeMenu: false }); });

async function loadWorkflow(options: { closeMenu?: boolean; reset?: boolean } = {}): Promise<void> {
  const { closeMenu = true, reset = false } = options;
  if (reset) workflow.value = null;
  if (!props.getWorkflow) return;
  workflowError.value = null;
  if (closeMenu) menuOpen.value = false;
  try { workflow.value = await props.getWorkflow(props.agent.id); } catch (error) { workflowError.value = error instanceof Error ? error.message : String(error); }
}
function closeMenu(event: MouseEvent): void { if (!root.value?.contains(event.target as Node)) menuOpen.value = false; }
function toggleMenu(): void {
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) void loadWorkflow({ closeMenu: false });
}
function runFirstEnabled(): void { if (firstEnabledAction.value) selectAction(firstEnabledAction.value); }
function selectAction(action: string): void {
  menuOpen.value = false;
  if (action === 'commit' && commitEnabled.value) {
    resetCommitOperation();
    commitDialogOpen.value = true;
  }
  else if (action === 'push' && pushEnabled.value) {
    resetPushOperation();
    pushDialogOpen.value = true;
  }
  else if (action === 'create-pr' && prEnabled.value) { pullRequestTitle.value = `Update ${workflow.value?.branch ?? ''}`.trim(); pullRequestDialogOpen.value = true; }
  else if (action === 'merge' && mergeEnabled.value && !mergeUnavailable.value) mergeDialogOpen.value = true;
}
async function commit(pushAfter: boolean): Promise<void> {
  if (!props.commitChanges) return;
  clearCommitSuccessTimer();
  committedMessage.value = commitMessage.value.trim();
  busy.value = true;
  workflowError.value = null;
  commitOperation.value = { status: 'committing' };
  let commitCreated = false;
  try {
    workflow.value = await props.commitChanges!(props.agent.id, { message: commitMessage.value, includeUnstaged: includeUnstaged.value, includeUntracked: includeUntracked.value, confirmed: true });
    commitCreated = true;
    if (pushAfter && props.pushBranch) {
      commitOperation.value = { status: 'pushing' };
      workflow.value = await props.pushBranch(props.agent.id, { confirmed: true });
    }
    commitMessage.value = '';
    showCommitSuccess(pushAfter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    commitOperation.value = { status: 'error', commitCreated, message };
  } finally {
    busy.value = false;
  }
}
async function retryCommitPush(): Promise<void> {
  if (!props.pushBranch) return;
  busy.value = true;
  workflowError.value = null;
  commitOperation.value = { status: 'pushing' };
  try {
    workflow.value = await props.pushBranch(props.agent.id, { confirmed: true });
    showCommitSuccess(true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    commitOperation.value = { status: 'error', commitCreated: true, message };
  } finally {
    busy.value = false;
  }
}
async function push(): Promise<void> {
  if (!props.pushBranch) return;
  clearPushSuccessTimer();
  busy.value = true;
  workflowError.value = null;
  pushOperation.value = { status: 'pushing' };
  try {
    workflow.value = await props.pushBranch(props.agent.id, { confirmed: true });
    pushOperation.value = { status: 'success' };
    pushSuccessTimer = setTimeout(() => {
      pushDialogOpen.value = false;
    }, 1500);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    pushOperation.value = { status: 'error', message };
  } finally {
    busy.value = false;
  }
}
async function createPullRequest(): Promise<void> {
  if (!props.createPullRequest) return;
  await perform(async () => { workflow.value = await props.createPullRequest!(props.agent.id, { title: pullRequestTitle.value, body: pullRequestBody.value, confirmed: true }); pullRequestDialogOpen.value = false; });
}
async function merge(pushAfter: boolean): Promise<void> {
  if (!props.mergeBranch || !canMerge.value) return;
  clearMergeSuccessTimer();
  const branch = workflow.value?.branch ?? 'branch';
  busy.value = true;
  workflowError.value = null;
  mergeOperation.value = { status: 'merging', branch, pushAfter };
  let mergeCreated = false;
  try {
    workflow.value = await props.mergeBranch!(props.agent.id, {
      strategy: mergeStrategy.value,
      ...(mergeStrategy.value === 'squash' ? { commitMessage: squashCommitMessage.value.trim() } : {}),
      deleteBranch: deleteBranch.value,
      deleteWorktree: deleteWorktree.value,
      confirmed: true,
    });
    mergeCreated = true;
    if (pushAfter && props.pushBranch) {
      mergeOperation.value = { status: 'pushing', branch };
      workflow.value = await props.pushBranch(props.agent.id, { confirmed: true, target: 'mergeTarget' });
    }
    showMergeSuccess(branch, pushAfter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    mergeOperation.value = { status: 'error', branch, mergeCreated, pushAfter, message };
  } finally {
    busy.value = false;
  }
}
async function retryMergePush(): Promise<void> {
  if (!props.pushBranch || mergeOperation.value.status !== 'error' || !mergeOperation.value.mergeCreated) return;
  const branch = mergeOperation.value.branch;
  busy.value = true;
  workflowError.value = null;
  mergeOperation.value = { status: 'pushing', branch };
  try {
    workflow.value = await props.pushBranch(props.agent.id, { confirmed: true, target: 'mergeTarget' });
    showMergeSuccess(branch, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    mergeOperation.value = { status: 'error', branch, mergeCreated: true, pushAfter: true, message };
  } finally {
    busy.value = false;
  }
}
async function perform(action: () => Promise<void>): Promise<void> { busy.value = true; workflowError.value = null; try { await action(); } catch (error) { workflowError.value = error instanceof Error ? error.message : String(error); } finally { busy.value = false; } }
function returnToCommitForm(): void {
  commitOperation.value = { status: 'editing' };
  void nextTick(() => commitMessageInput.value?.focus());
}
function showCommitSuccess(pushed: boolean): void {
  commitOperation.value = { status: 'success', pushed };
  commitSuccessTimer = setTimeout(() => {
    commitDialogOpen.value = false;
  }, 1500);
}
function resetCommitOperation(): void {
  clearCommitSuccessTimer();
  includeUnstaged.value = true;
  includeUntracked.value = false;
  commitOperation.value = { status: 'editing' };
}
function clearCommitSuccessTimer(): void {
  if (commitSuccessTimer !== null) {
    clearTimeout(commitSuccessTimer);
    commitSuccessTimer = null;
  }
}
function resetPushOperation(): void {
  clearPushSuccessTimer();
  pushOperation.value = { status: 'confirming' };
}
function clearPushSuccessTimer(): void {
  if (pushSuccessTimer !== null) {
    clearTimeout(pushSuccessTimer);
    pushSuccessTimer = null;
  }
}
function resetMergeOperation(): void {
  clearMergeSuccessTimer();
  mergeOperation.value = { status: 'confirming' };
}
function showMergeSuccess(branch: string, pushed: boolean): void {
  mergeOperation.value = { status: 'success', branch, pushed };
  mergeSuccessTimer = setTimeout(() => {
    mergeDialogOpen.value = false;
  }, 1500);
}
function clearMergeSuccessTimer(): void {
  if (mergeSuccessTimer !== null) {
    clearTimeout(mergeSuccessTimer);
    mergeSuccessTimer = null;
  }
}

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

.git-workflow-control__dialog-header .claw-dialog__title {
  flex: 0 0 auto;
  white-space: nowrap;
}

.git-workflow-control__dialog-header .git-workflow-control__branch {
  min-width: 0;
  flex: 1 1 auto;
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

.git-workflow-control__push-summary {
  display: grid;
  gap: var(--space-4);
  justify-items: start;
  padding: var(--space-10) 0 var(--space-8);
  text-align: left;
}

.git-workflow-control__push-count {
  display: block;
  justify-self: start;
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-20);
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-semibold);
  line-height: 1.2;
  text-align: left;
}

.git-workflow-control__push-destination {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.git-workflow-control__push-destination code {
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.git-workflow-control__push-arrow {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.git-workflow-control__push-note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: 1.45;
}

.git-workflow-control__check {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-height: var(--space-16);
  border-top: 1px solid var(--color-border);
  padding: var(--space-4) 0;
}

.git-workflow-control__scope-spacer {
  width: 32px;
  flex: 0 0 32px;
}

.git-workflow-control__merge-strategy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  padding: var(--space-6) 0 var(--space-8);
}

.git-workflow-control__merge-strategy label {
  position: relative;
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  justify-items: center;
  gap: var(--space-4);
  min-height: 124px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6) var(--space-8);
  color: var(--color-text-muted);
  text-align: center;
  cursor: pointer;
}

.git-workflow-control__merge-strategy label:hover,
.git-workflow-control__merge-option--selected {
  color: var(--color-text) !important;
  border-color: var(--color-primary) !important;
  background: color-mix(
    in srgb,
    var(--color-primary) 6%,
    transparent
  ) !important;
}

.git-workflow-control__merge-strategy input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.git-workflow-control__merge-strategy label:focus-within {
  border-color: var(--color-primary);
}

.git-workflow-control__merge-icon {
  width: 30px;
  height: 30px;
  color: var(--color-primary);
  stroke-width: 1.7;
}

.git-workflow-control__merge-copy {
  display: grid;
  gap: var(--space-1);
}

.git-workflow-control__merge-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
}

.git-workflow-control__merge-copy span {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.git-workflow-control__merge-cleanup {
  min-height: var(--space-24);
  box-sizing: border-box;
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

:global(.git-workflow-control__dialog--transient .el-dialog__footer) {
  display: none;
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

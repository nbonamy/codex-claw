<template>
  <div
    ref="root"
    class="git-workflow-control agent-header__git-actions"
  >
    <button
      class="git-workflow-control__primary"
      type="button"
      :disabled="busy || !firstEnabledAction"
      :aria-label="$t('surface.gitWorkflowControl.runGitAction')"
      :title="$t('surface.gitWorkflowControl.runGitAction')"
      @click="runFirstEnabled"
    >
      <GitHubIcon aria-hidden="true" />
    </button>
    <button
      class="git-workflow-control__trigger"
      type="button"
      :disabled="busy"
      :aria-label="$t('surface.gitWorkflowControl.chooseGitAction')"
      :title="$t('surface.gitWorkflowControl.chooseGitAction')"
      :aria-expanded="menuOpen"
      @click.stop="toggleMenu"
    >
      <ChevronDown aria-hidden="true" />
    </button>
    <AppMenu
      v-if="menuOpen"
      class="git-workflow-control__menu"
      :ariaLabel="$t('surface.gitWorkflowControl.gitActions')"
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
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">{{ $t('surface.gitWorkflowControl.commitChanges') }}</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch ?? 'detached HEAD' }}</span></div></template>
    <div
      v-if="commitOperation.status === 'editing'"
      class="git-workflow-control__dialog-form"
    >
      <div class="git-workflow-control__message-editor">
        <textarea
          ref="commitMessageInput"
          v-model="commitMessage"
          autofocus
          rows="4"
          :placeholder="$t('surface.gitWorkflowControl.commitMessage')"
        />
        <button
          v-if="canGenerateMessage"
          class="git-workflow-control__generate"
          type="button"
          :disabled="busy || commitAddedLines + commitRemovedLines === 0"
          :aria-busy="generatingKind === 'commit'"
          :aria-label="$t('surface.gitWorkflowControl.generateCommitMessageWithCodex')"
          :title="$t('surface.gitWorkflowControl.generateWithCodex')"
          @click="generateCommitMessage"
        >
          <SparklesIcon aria-hidden="true" />
          <span>{{ generatingKind === 'commit' ? $t('surface.gitWorkflowControl.generating') : $t('surface.gitWorkflowControl.generate') }}</span>
        </button>
      </div>
      <p v-if="generationError && generationErrorKind === 'commit'" class="git-workflow-control__generation-error">{{ generationError }}</p>
      <div class="git-workflow-control__check git-workflow-control__scope-row">
        <span class="git-workflow-control__scope-spacer" aria-hidden="true" />
        <span>{{ $t('surface.gitWorkflowControl.stagedChanges') }}</span>
        <span class="git-workflow-control__stats">+{{ stagedAddedLines }} <em>−{{ stagedRemovedLines }}</em></span>
      </div>
      <label class="git-workflow-control__check git-workflow-control__scope-row">
        <el-switch v-model="includeUnstaged" size="small" :disabled="busy" />
        <span>{{ $t('surface.gitWorkflowControl.includeUnstagedChanges') }}</span>
        <span class="git-workflow-control__stats" :class="{ 'git-workflow-control__stats--muted': !includeUnstaged }">+{{ unstagedAddedLines }} <em>−{{ unstagedRemovedLines }}</em></span>
      </label>
      <label class="git-workflow-control__check git-workflow-control__scope-row">
        <el-switch v-model="includeUntracked" size="small" :disabled="!hasUntrackedFiles || busy" />
        <span>{{ hasUntrackedFiles ? $t('surface.gitWorkflowControl.includeUntrackedFiles') : $t('surface.gitWorkflowControl.noUntrackedFiles') }}</span>
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
      ><button class="claw-button claw-button--tertiary" type="button" @click="commitDialogOpen = false">{{ $t('surface.gitWorkflowControl.cancel') }}</button><button class="claw-button claw-button--secondary" type="button" :disabled="busy || !canCommit" @click="commit(false)">{{ $t('surface.gitWorkflowControl.commit') }}</button><button class="claw-button claw-button--primary" type="button" :disabled="busy || !canCommit || !pushCapable" @click="commit(true)">{{ $t('surface.gitWorkflowControl.commitAndPush') }}</button></div>
      <div
        v-else-if="commitOperation.status === 'error'"
        class="claw-dialog__footer"
      ><button class="claw-button claw-button--tertiary" type="button" @click="commitDialogOpen = false">{{ $t('surface.gitWorkflowControl.close') }}</button><button class="claw-button" :class="commitOperation.commitCreated ? 'claw-button--primary' : 'claw-button--secondary'" type="button" @click="commitOperation.commitCreated ? retryCommitPush() : returnToCommitForm()">{{ commitOperation.commitCreated ? $t('surface.gitWorkflowControl.retryPush') : $t('surface.gitWorkflowControl.back') }}</button></div>
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
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">{{ $t('surface.gitWorkflowControl.pushChanges') }}</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch }}</span></div></template>
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
      <p v-if="workflow?.files.length" class="git-workflow-control__push-note">{{ $t('surface.gitWorkflowControl.uncommittedChangesStayInThisWorktreeAndWillNotBePushed') }}</p>
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
      ><button class="claw-button claw-button--tertiary" type="button" @click="pushDialogOpen = false">{{ $t('surface.gitWorkflowControl.cancel') }}</button><button class="claw-button claw-button--primary" type="button" :disabled="busy" @click="push">{{ $t('surface.gitWorkflowControl.push') }}</button></div>
      <div
        v-else-if="pushOperation.status === 'error'"
        class="claw-dialog__footer"
      ><button class="claw-button claw-button--tertiary" type="button" @click="pushDialogOpen = false">{{ $t('surface.gitWorkflowControl.close') }}</button><button class="claw-button claw-button--primary" type="button" @click="push">{{ $t('surface.gitWorkflowControl.retry') }}</button></div>
    </template>
  </el-dialog>

  <el-dialog
    v-if="pullRequestDialogOpen"
    v-model="pullRequestDialogOpen"
    class="claw-dialog git-workflow-control__dialog"
    :class="{ 'git-workflow-control__dialog--transient': pullRequestOperation.status === 'success' }"
    width="min(560px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    :close-on-click-modal="!pullRequestOperationRunning"
    :close-on-press-escape="!pullRequestOperationRunning"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">{{ $t('surface.gitWorkflowControl.createPullRequest') }}</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch }}</span></div></template>
    <div
      v-if="pullRequestOperation.status === 'editing'"
      class="git-workflow-control__dialog-form git-workflow-control__pull-request-form"
    >
      <div class="git-workflow-control__message-editor git-workflow-control__message-editor--pull-request">
        <input v-model="pullRequestTitle" autofocus :placeholder="$t('surface.gitWorkflowControl.title')" />
        <textarea v-model="pullRequestBody" rows="5" :placeholder="$t('surface.gitWorkflowControl.describeTheChangeOptional')" />
        <button
          v-if="canGenerateMessage"
          class="git-workflow-control__generate"
          type="button"
          :disabled="busy"
          :aria-busy="generatingKind === 'pullRequest'"
          :aria-label="$t('surface.gitWorkflowControl.generatePullRequestDraftWithCodex')"
          :title="$t('surface.gitWorkflowControl.generateWithCodex')"
          @click="generatePullRequestMessage"
        >
          <SparklesIcon aria-hidden="true" />
          <span>{{ generatingKind === 'pullRequest' ? $t('surface.gitWorkflowControl.generating') : $t('surface.gitWorkflowControl.generate') }}</span>
        </button>
      </div>
      <p v-if="generationError && generationErrorKind === 'pullRequest'" class="git-workflow-control__generation-error">{{ generationError }}</p>
      <label v-if="reportBackAgentName" class="git-workflow-control__check git-workflow-control__report-back">
        <el-switch v-model="reportBack" size="small" />
        <span>{{ $t('surface.gitWorkflowControl.reportBackTo', { name: reportBackAgentName }) }}</span>
      </label>
    </div>
    <GitOperationFeedback
      v-else
      :status="pullRequestFeedbackStatus"
      :title="pullRequestOperationTitle"
      :detail="pullRequestOperationDetail"
    >
      <template #icon><GitForkIcon /></template>
    </GitOperationFeedback>
    <template #footer>
      <div
        v-if="pullRequestOperation.status === 'editing'"
        class="claw-dialog__footer"
      ><button class="claw-button claw-button--tertiary" type="button" @click="pullRequestDialogOpen = false">{{ $t('surface.gitWorkflowControl.cancel') }}</button><button class="claw-button claw-button--primary" type="button" :disabled="busy || !pullRequestTitle.trim()" @click="createPullRequest">{{ $t('surface.gitWorkflowControl.createPR') }}</button></div>
      <div
        v-else-if="pullRequestOperation.status === 'creating'"
        class="claw-dialog__footer"
      ><button class="claw-button claw-button--secondary" type="button" @click="runPullRequestInBackground">{{ $t('surface.gitWorkflowControl.runInBackground') }}</button></div>
      <div
        v-else-if="pullRequestOperation.status === 'error'"
        class="claw-dialog__footer"
      ><button class="claw-button claw-button--tertiary" type="button" @click="pullRequestDialogOpen = false">{{ $t('surface.gitWorkflowControl.close') }}</button><button class="claw-button claw-button--primary" type="button" @click="createPullRequest">{{ $t('surface.gitWorkflowControl.retry') }}</button></div>
    </template>
  </el-dialog>

  <el-dialog
    v-if="mergeDialogOpen"
    v-model="mergeDialogOpen"
    class="claw-dialog git-workflow-control__dialog"
    :class="{ 'git-workflow-control__dialog--transient': mergeOperation.status === 'success' }"
    width="min(660px, calc(100vw - 32px))"
    :teleported="false"
    :show-close="false"
    :close-on-click-modal="!mergeOperationRunning"
    :close-on-press-escape="!mergeOperationRunning"
    destroy-on-close
  >
    <template #header><div class="claw-form-dialog__header git-workflow-control__dialog-header"><h2 class="claw-dialog__title">{{ $t('surface.gitWorkflowControl.mergeBranch') }}</h2><span class="git-workflow-control__branch">{{ workflow?.repository }} · {{ workflow?.branch }}</span></div></template>
    <div v-if="mergeOperation.status === 'confirming'" class="git-workflow-control__dialog-form">
      <div class="git-workflow-control__merge-strategy" role="radiogroup" :aria-label="$t('surface.gitWorkflowControl.mergeStrategy')">
        <label :class="{ 'git-workflow-control__merge-option--selected': mergeStrategy === 'merge' }">
          <input v-model="mergeStrategy" type="radio" value="merge" />
          <GitMergeIcon class="git-workflow-control__merge-icon" aria-hidden="true" />
          <span class="git-workflow-control__merge-copy">
            <strong>{{ $t('surface.gitWorkflowControl.mergeCommit') }}</strong>
            <span>{{ $t('surface.gitWorkflowControl.preserveEveryCommitInAMergeCommit') }}</span>
          </span>
        </label>
        <label :class="{ 'git-workflow-control__merge-option--selected': mergeStrategy === 'squash' }">
          <input v-model="mergeStrategy" type="radio" value="squash" />
          <ArrowsMinimizeIcon class="git-workflow-control__merge-icon" aria-hidden="true" />
          <span class="git-workflow-control__merge-copy">
            <strong>{{ $t('surface.gitWorkflowControl.squashAndMerge') }}</strong>
            <span>{{ $t('surface.gitWorkflowControl.combineAllChangesIntoASingleCommit') }}</span>
          </span>
        </label>
      </div>
      <textarea
        v-if="mergeStrategy === 'squash'"
        ref="squashCommitMessageInput"
        v-model="squashCommitMessage"
        class="git-workflow-control__merge-message"
        rows="4"
        :aria-label="$t('surface.gitWorkflowControl.squashCommitMessage')"
        :placeholder="$t('surface.gitWorkflowControl.squashCommitMessage2')"
      />
      <label v-if="reportBackAgentName" class="git-workflow-control__check git-workflow-control__report-back">
        <el-switch v-model="reportBack" size="small" />
        <span>{{ $t('surface.gitWorkflowControl.reportBackTo', { name: reportBackAgentName }) }}</span>
      </label>
      <label v-if="workflow?.isLinkedWorktree" class="git-workflow-control__check git-workflow-control__merge-cleanup">
        <el-switch v-model="deleteWorktree" size="small" />
        <span>{{ $t('surface.gitWorkflowControl.deleteWorktreeAfterMerging') }}</span>
      </label>
      <label v-if="workflow?.isLinkedWorktree" class="git-workflow-control__check git-workflow-control__merge-cleanup">
        <el-switch v-model="deleteBranch" size="small" :disabled="!deleteWorktree" />
        <span>{{ $t('surface.gitWorkflowControl.deleteBranchAfterRemovingWorktree') }}</span>
      </label>
      <p v-if="mergeUnavailable" class="git-workflow-control__hint">{{ $t('surface.gitWorkflowControl.mergeIsAvailableOnceAMergeTargetIsConfiguredForThisWorkt') }}</p>
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
      <div v-if="mergeOperation.status === 'confirming'" class="claw-dialog__footer"><button class="claw-button claw-button--tertiary" type="button" @click="mergeDialogOpen = false">{{ $t('surface.gitWorkflowControl.cancel') }}</button><button class="claw-button claw-button--secondary" type="button" :disabled="busy || !canMerge" @click="merge(false)">{{ $t('surface.gitWorkflowControl.merge') }}</button><button class="claw-button claw-button--primary" type="button" :disabled="busy || !canMerge || !pushCapable" @click="merge(true)">{{ $t('surface.gitWorkflowControl.mergeAndPush') }}</button></div>
      <div v-else-if="mergeOperationRunning" class="claw-dialog__footer"><button class="claw-button claw-button--secondary" type="button" @click="runMergeInBackground">{{ $t('surface.gitWorkflowControl.runInBackground') }}</button></div>
      <div v-else-if="mergeOperation.status === 'error'" class="claw-dialog__footer"><button class="claw-button claw-button--tertiary" type="button" @click="mergeDialogOpen = false">{{ $t('surface.gitWorkflowControl.close') }}</button><button class="claw-button claw-button--primary" type="button" @click="mergeOperation.mergeCreated ? retryMergePush() : merge(mergeOperation.pushAfter)">{{ mergeOperation.mergeCreated ? $t('surface.gitWorkflowControl.retryPush') : $t('surface.gitWorkflowControl.retry') }}</button></div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import type { Agent, AgentGitCommitInput, AgentGitMergeInput, AgentGitMessageGenerationInput, AgentGitMessageGenerationResult, AgentGitOperationProgress, AgentGitPullRequestInput, AgentGitPushInput, AgentGitStatus, AgentGitWorkflow, MainToRendererEvent } from '@codex-claw/core/contracts';
import { ArrowRightIcon, ArrowsMinimizeIcon, ChevronDown, CloudUploadIcon, GitCommitIcon, GitForkIcon, GitHubIcon, GitMergeIcon, SparklesIcon } from '../shared/icons/app-icons';
import { codexClawApi } from '../platform-api';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import GitOperationFeedback from './GitOperationFeedback.vue';

const props = defineProps<{
  agent: Agent;
  gitStatus?: AgentGitStatus | null;
  getWorkflow?: (agentId: string) => Promise<AgentGitWorkflow>;
  generateMessage?: (agentId: string, input: AgentGitMessageGenerationInput) => Promise<AgentGitMessageGenerationResult>;
  commitChanges?: (agentId: string, input: AgentGitCommitInput) => Promise<AgentGitWorkflow>;
  pushBranch?: (agentId: string, input: AgentGitPushInput) => Promise<AgentGitWorkflow>;
  createPullRequest?: (agentId: string, input: AgentGitPullRequestInput) => Promise<AgentGitWorkflow>;
  mergeBranch?: (agentId: string, input: AgentGitMergeInput) => Promise<AgentGitWorkflow>;
  reportBackAgentName?: string | null;
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
const reportBack = ref(true);
const gitOperationProgress = ref<AgentGitOperationProgress | null>(null);
const committedMessage = ref('');
const generatingKind = ref<'commit' | 'pullRequest' | null>(null);
const generationError = ref<string | null>(null);
const generationErrorKind = ref<'commit' | 'pullRequest' | null>(null);
let generationRequestId = 0;
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
type PullRequestOperation =
  | { status: 'editing' }
  | { status: 'creating' }
  | { status: 'success' }
  | { status: 'error'; message: string };
const pullRequestOperation = ref<PullRequestOperation>({ status: 'editing' });
const pullRequestBackgrounded = ref(false);
type MergeOperation =
  | { status: 'confirming' }
  | { status: 'merging'; branch: string; pushAfter: boolean; closeAgentAfterPush: boolean }
  | { status: 'pushing'; branch: string; closeAgentAfterPush: boolean }
  | { status: 'success'; branch: string; pushed: boolean }
  | { status: 'error'; branch: string; mergeCreated: boolean; pushAfter: boolean; closeAgentAfterPush: boolean; message: string };
const mergeOperation = ref<MergeOperation>({ status: 'confirming' });
const mergeBackgrounded = ref(false);
let commitSuccessTimer: ReturnType<typeof setTimeout> | null = null;
let pushSuccessTimer: ReturnType<typeof setTimeout> | null = null;
let pullRequestSuccessTimer: ReturnType<typeof setTimeout> | null = null;
let mergeSuccessTimer: ReturnType<typeof setTimeout> | null = null;
const debugOperationTimers: Array<ReturnType<typeof setTimeout>> = [];
const mergeUnavailable = computed(() => !props.mergeBranch);
const canGenerateMessage = computed(() => props.agent.backend === 'codex' && Boolean(props.generateMessage));
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
  if (commitOperation.value.status === 'committing') return translate('surface.gitWorkflowControl.creatingCommit');
  if (commitOperation.value.status === 'pushing') return translate('surface.gitWorkflowControl.pushingCommit');
  if (commitOperation.value.status === 'success') return commitOperation.value.pushed ? translate('surface.gitWorkflowControl.committedAndPushed') : translate('surface.gitWorkflowControl.commitCreated');
  if (commitOperation.value.status === 'error') return commitOperation.value.commitCreated ? translate('surface.gitWorkflowControl.commitCreatedButPushFailed') : translate('surface.gitWorkflowControl.commitFailed');
  return '';
});
const commitOperationDetail = computed(() => commitOperation.value.status === 'error' ? commitOperation.value.message : commitOperation.value.status === 'pushing' || (commitOperation.value.status === 'success' && commitOperation.value.pushed) ? pushDestination.value : committedMessage.value);
const pendingPushCount = computed(() => workflow.value?.ahead ?? props.gitStatus?.ahead ?? 0);
const pushDestination = computed(() => workflow.value?.upstream ?? [workflow.value?.remote, workflow.value?.branch].filter(Boolean).join('/'));
const pushOperationRunning = computed(() => pushOperation.value.status === 'pushing');
const pushFeedbackStatus = computed<'running' | 'success' | 'error'>(() => pushOperation.value.status === 'success' ? 'success' : pushOperation.value.status === 'error' ? 'error' : 'running');
const pushOperationTitle = computed(() => pushOperation.value.status === 'pushing' ? `Pushing ${pendingPushCount.value} ${pendingPushCount.value === 1 ? 'commit' : 'commits'}` : pushOperation.value.status === 'success' ? translate('surface.gitWorkflowControl.pushComplete') : translate('surface.gitWorkflowControl.pushFailed'));
const pushOperationDetail = computed(() => pushOperation.value.status === 'error' ? pushOperation.value.message : pushDestination.value);
const pullRequestOperationRunning = computed(() => pullRequestOperation.value.status === 'creating');
const pullRequestFeedbackStatus = computed<'running' | 'success' | 'error'>(() => pullRequestOperation.value.status === 'success' ? 'success' : pullRequestOperation.value.status === 'error' ? 'error' : 'running');
const pullRequestOperationTitle = computed(() => pullRequestOperation.value.status === 'creating'
  ? gitOperationProgress.value?.operation === 'pullRequest' && gitOperationProgress.value.phase === 'handoff'
    ? translate('surface.gitWorkflowControl.buildingHandoffReport')
    : translate('surface.gitWorkflowControl.creatingPullRequest')
  : pullRequestOperation.value.status === 'success'
    ? translate('surface.gitWorkflowControl.pullRequestCreated')
    : pullRequestOperation.value.status === 'error'
      ? translate('surface.gitWorkflowControl.pullRequestFailed')
      : '');
const pullRequestOperationDetail = computed(() => pullRequestOperation.value.status === 'error'
  ? pullRequestOperation.value.message
  : gitOperationProgress.value?.operation === 'pullRequest' && gitOperationProgress.value.phase === 'handoff'
    ? translate('surface.gitWorkflowControl.waitingForWorkerSummary')
  : pullRequestTitle.value.trim());
const mergeOperationRunning = computed(() => mergeOperation.value.status === 'merging' || mergeOperation.value.status === 'pushing');
const mergeFeedbackStatus = computed<'running' | 'success' | 'error'>(() => mergeOperation.value.status === 'success' ? 'success' : mergeOperation.value.status === 'error' ? 'error' : 'running');
const mergeOperationTitle = computed(() => mergeOperation.value.status === 'success'
  ? mergeOperation.value.pushed ? translate('surface.gitWorkflowControl.mergedAndPushed') : translate('surface.gitWorkflowControl.mergeComplete')
  : mergeOperation.value.status === 'error'
    ? mergeOperation.value.mergeCreated ? translate('surface.gitWorkflowControl.mergeCompleteButPushFailed') : translate('surface.gitWorkflowControl.mergeFailed')
    : gitOperationProgress.value?.operation === 'merge' && gitOperationProgress.value.phase === 'handoff'
      ? translate('surface.gitWorkflowControl.buildingHandoffReport')
    : mergeOperation.value.status === 'pushing'
      ? translate('surface.gitWorkflowControl.pushingMergedBranch')
    : mergeOperation.value.status === 'merging'
      ? `Merging ${mergeOperation.value.branch}`
      : '');
const mergeOperationDetail = computed(() => mergeOperation.value.status === 'error'
  ? mergeOperation.value.message
  : mergeOperation.value.status === 'success'
    ? mergeOperation.value.pushed ? `${mergeOperation.value.branch} merged and pushed successfully` : `${mergeOperation.value.branch} merged successfully`
    : gitOperationProgress.value?.operation === 'merge' && gitOperationProgress.value.phase === 'handoff'
      ? translate('surface.gitWorkflowControl.waitingForWorkerSummary')
    : mergeOperation.value.status === 'pushing'
      ? translate('surface.gitWorkflowControl.pushingTheResultingBaseBranch')
    : deleteWorktree.value
      ? translate('surface.gitWorkflowControl.mergingChangesAndCleaningUpTheLinkedWorktree')
      : translate('surface.gitWorkflowControl.mergingChangesIntoTheBaseWorktree'));

const commitEnabled = computed(() => workflow.value === null
  ? !workflowError.value && (props.gitStatus?.changedFiles ?? 0) > 0
  : Boolean(workflow.value.files.length));
const pushEnabled = computed(() => Boolean(workflow.value?.branch && workflow.value?.remote && (workflow.value?.ahead ?? props.gitStatus?.ahead ?? 0) > 0));
const pushCapable = computed(() => Boolean(workflow.value?.branch && workflow.value?.remote && props.pushBranch));
const currentBranchAvailable = computed(() => Boolean(workflow.value?.branch && !workflow.value?.detached));
const integrationBranch = computed(() => ['main', 'master', 'develop', 'development', 'trunk'].includes(workflow.value?.branch ?? ''));
const mergeEnabled = computed(() => currentBranchAvailable.value && !integrationBranch.value);
const canMerge = computed(() => mergeStrategy.value === 'merge' || Boolean(squashCommitMessage.value.trim()));
const prEnabled = computed(() => currentBranchAvailable.value && !integrationBranch.value);
const firstEnabledAction = computed(() => (commitEnabled.value ? 'commit' : pushEnabled.value ? 'push' : mergeEnabled.value && !mergeUnavailable.value ? 'merge' : prEnabled.value ? 'create-pr' : null));
const menuItems = computed<AppMenuItem[]>(() => [
  { id: 'commit', type: 'action', label: translate('surface.gitWorkflowControl.commit'), icon: GitCommitIcon, disabled: !commitEnabled.value },
  { id: 'push', type: 'action', label: translate('surface.gitWorkflowControl.push'), icon: CloudUploadIcon, disabled: !pushEnabled.value },
  { id: 'merge', type: 'action', label: translate('surface.gitWorkflowControl.merge'), icon: GitMergeIcon, disabled: !mergeEnabled.value || mergeUnavailable.value },
  { id: 'create-pr', type: 'action', label: translate('surface.gitWorkflowControl.createPR'), icon: GitForkIcon, disabled: !prEnabled.value },
]);

watch(commitDialogOpen, (open) => {
  if (open && commitOperation.value.status === 'editing') {
    void nextTick(() => commitMessageInput.value?.focus());
  } else if (!open) {
    generationRequestId += 1;
    resetCommitOperation();
  }
});

watch(pushDialogOpen, (open) => {
  if (!open) resetPushOperation();
});

watch(pullRequestDialogOpen, (open) => {
  if (open) {
    reportBack.value = true;
  } else if (!pullRequestOperationRunning.value) {
    generationRequestId += 1;
    resetPullRequestOperation();
  }
});

watch(mergeDialogOpen, (open) => {
  if (open) {
    resetMergeOperation();
    reportBack.value = true;
    squashCommitMessage.value = '';
    if (!workflow.value?.isLinkedWorktree) {
      deleteWorktree.value = false;
      deleteBranch.value = false;
    }
  } else if (!mergeOperationRunning.value) {
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
  unsubscribeMainEvents = codexClawApi?.onEvent(handleMainEvent) ?? null;
  void loadWorkflow({ reset: true });
});
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenu);
  unsubscribeMainEvents?.();
  clearCommitSuccessTimer();
  clearPushSuccessTimer();
  clearPullRequestSuccessTimer();
  clearMergeSuccessTimer();
  clearDebugOperationTimers();
});
watch(() => props.agent.id, () => { void loadWorkflow({ reset: true }); });
watch(() => props.gitStatus?.updatedAt, () => {
  if (!busy.value) void loadWorkflow({ closeMenu: false });
});

let workflowLoadRequestId = 0;
let workflowLoadAgentId: string | null = null;
let workflowLoadPromise: Promise<void> | null = null;

async function loadWorkflow(options: { closeMenu?: boolean; reset?: boolean } = {}): Promise<void> {
  const { closeMenu = true, reset = false } = options;
  if (reset) workflow.value = null;
  if (!props.getWorkflow) return;
  const agentId = props.agent.id;
  if (workflowLoadAgentId === agentId && workflowLoadPromise) {
    return workflowLoadPromise;
  }
  const requestId = ++workflowLoadRequestId;
  workflowError.value = null;
  if (closeMenu) menuOpen.value = false;
  workflowLoadAgentId = agentId;
  const request = props.getWorkflow(agentId).then((nextWorkflow) => {
    if (requestId === workflowLoadRequestId && props.agent.id === agentId) {
      workflow.value = nextWorkflow;
    }
  }).catch((error: unknown) => {
    if (requestId === workflowLoadRequestId && props.agent.id === agentId) {
      workflowError.value = error instanceof Error ? error.message : String(error);
    }
  }).finally(() => {
    if (requestId === workflowLoadRequestId) {
      workflowLoadAgentId = null;
      workflowLoadPromise = null;
    }
  });
  workflowLoadPromise = request;
  return request;
}
function closeMenu(event: MouseEvent): void { if (!root.value?.contains(event.target as Node)) menuOpen.value = false; }
function toggleMenu(): void {
  if (busy.value) return;
  menuOpen.value = !menuOpen.value;
}
function runFirstEnabled(): void { if (firstEnabledAction.value) selectAction(firstEnabledAction.value); }
function selectAction(action: string): void {
  if (busy.value) return;
  menuOpen.value = false;
  if (action === 'commit' && commitEnabled.value) {
    resetCommitOperation();
    commitDialogOpen.value = true;
  }
  else if (action === 'push' && pushEnabled.value) {
    resetPushOperation();
    pushDialogOpen.value = true;
  }
  else if (action === 'create-pr' && prEnabled.value) {
    resetPullRequestOperation();
    pullRequestTitle.value = '';
    pullRequestBody.value = '';
    pullRequestDialogOpen.value = true;
  }
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
async function generateCommitMessage(): Promise<void> {
  if (!props.generateMessage || !canGenerateMessage.value || commitAddedLines.value + commitRemovedLines.value === 0) return;
  const requestId = ++generationRequestId;
  generatingKind.value = 'commit';
  generationError.value = null;
  generationErrorKind.value = null;
  busy.value = true;
  try {
    const result = await props.generateMessage(props.agent.id, {
      kind: 'commit',
      includeUnstaged: includeUnstaged.value,
      includeUntracked: includeUntracked.value,
    });
    if (requestId !== generationRequestId || result.kind !== 'commit') return;
    commitMessage.value = result.message;
  } catch (error) {
    if (requestId !== generationRequestId) return;
    generationError.value = error instanceof Error ? error.message : String(error);
    generationErrorKind.value = 'commit';
  } finally {
    if (requestId === generationRequestId) {
      generatingKind.value = null;
      busy.value = false;
      void nextTick(() => commitMessageInput.value?.focus());
    }
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
  clearDebugOperationTimers();
  clearPullRequestSuccessTimer();
  const agentId = props.agent.id;
  busy.value = true;
  workflowError.value = null;
  gitOperationProgress.value = {
    operation: 'pullRequest',
    phase: props.reportBackAgentName && reportBack.value ? 'handoff' : 'delivery',
  };
  pullRequestOperation.value = { status: 'creating' };
  try {
    const result = await props.createPullRequest(agentId, {
      title: pullRequestTitle.value,
      body: pullRequestBody.value,
      ...(props.reportBackAgentName ? { reportBack: reportBack.value } : {}),
      confirmed: true,
    });
    if (props.agent.id === agentId) workflow.value = result;
    pullRequestOperation.value = { status: 'success' };
    if (pullRequestBackgrounded.value) {
      ElMessage.success(translate('surface.gitWorkflowControl.pullRequestCreated'));
      resetPullRequestOperation();
    } else {
      pullRequestSuccessTimer = setTimeout(() => {
        pullRequestDialogOpen.value = false;
      }, 1500);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    pullRequestOperation.value = { status: 'error', message };
    if (pullRequestBackgrounded.value) {
      ElMessage.error(`${translate('surface.gitWorkflowControl.pullRequestFailed')}: ${message}`);
      resetPullRequestOperation();
    }
  } finally {
    busy.value = false;
  }
}
async function generatePullRequestMessage(): Promise<void> {
  if (!props.generateMessage || !canGenerateMessage.value) return;
  const requestId = ++generationRequestId;
  generatingKind.value = 'pullRequest';
  generationError.value = null;
  generationErrorKind.value = null;
  busy.value = true;
  try {
    const result = await props.generateMessage(props.agent.id, { kind: 'pullRequest' });
    if (requestId !== generationRequestId || result.kind !== 'pullRequest') return;
    pullRequestTitle.value = result.title;
    pullRequestBody.value = result.body;
  } catch (error) {
    if (requestId !== generationRequestId) return;
    generationError.value = error instanceof Error ? error.message : String(error);
    generationErrorKind.value = 'pullRequest';
  } finally {
    if (requestId === generationRequestId) {
      generatingKind.value = null;
      busy.value = false;
    }
  }
}
async function merge(pushAfter: boolean): Promise<void> {
  if (!props.mergeBranch || !canMerge.value) return;
  clearDebugOperationTimers();
  clearMergeSuccessTimer();
  const agentId = props.agent.id;
  const branch = workflow.value?.branch ?? 'branch';
  const closeAgentAfterPush = pushAfter && deleteWorktree.value;
  busy.value = true;
  workflowError.value = null;
  gitOperationProgress.value = {
    operation: 'merge',
    phase: props.reportBackAgentName && reportBack.value ? 'handoff' : 'delivery',
  };
  mergeOperation.value = { status: 'merging', branch, pushAfter, closeAgentAfterPush };
  let mergeCreated = false;
  try {
    const mergeResult = await props.mergeBranch!(agentId, {
      strategy: mergeStrategy.value,
      ...(mergeStrategy.value === 'squash' ? { commitMessage: squashCommitMessage.value.trim() } : {}),
      deleteBranch: deleteBranch.value,
      deleteWorktree: deleteWorktree.value,
      ...(pushAfter ? { pushAfter: true } : {}),
      ...(props.reportBackAgentName ? { reportBack: reportBack.value } : {}),
      confirmed: true,
    });
    if (props.agent.id === agentId) workflow.value = mergeResult;
    mergeCreated = true;
    if (pushAfter && props.pushBranch) {
      mergeOperation.value = { status: 'pushing', branch, closeAgentAfterPush };
      const pushResult = await props.pushBranch(agentId, {
        confirmed: true,
        target: 'mergeTarget',
        ...(closeAgentAfterPush ? { closeAgentAfterPush: true } : {}),
      });
      if (props.agent.id === agentId) workflow.value = pushResult;
    }
    showMergeSuccess(branch, pushAfter);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    mergeOperation.value = { status: 'error', branch, mergeCreated, pushAfter, closeAgentAfterPush, message };
    if (mergeBackgrounded.value) {
      ElMessage.error(`${mergeOperationTitle.value}: ${message}`);
      resetMergeOperation();
    }
  } finally {
    busy.value = false;
  }
}
async function retryMergePush(): Promise<void> {
  if (!props.pushBranch || mergeOperation.value.status !== 'error' || !mergeOperation.value.mergeCreated) return;
  const branch = mergeOperation.value.branch;
  const closeAgentAfterPush = mergeOperation.value.closeAgentAfterPush;
  busy.value = true;
  workflowError.value = null;
  mergeOperation.value = { status: 'pushing', branch, closeAgentAfterPush };
  try {
    workflow.value = await props.pushBranch(props.agent.id, {
      confirmed: true,
      target: 'mergeTarget',
      ...(closeAgentAfterPush ? { closeAgentAfterPush: true } : {}),
    });
    showMergeSuccess(branch, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    workflowError.value = message;
    mergeOperation.value = { status: 'error', branch, mergeCreated: true, pushAfter: true, closeAgentAfterPush, message };
  } finally {
    busy.value = false;
  }
}
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
  resetGeneration();
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
function resetPullRequestOperation(): void {
  clearPullRequestSuccessTimer();
  pullRequestBackgrounded.value = false;
  gitOperationProgress.value = null;
  pullRequestOperation.value = { status: 'editing' };
  resetGeneration();
}
function resetGeneration(): void {
  if (generatingKind.value) busy.value = false;
  generatingKind.value = null;
  generationError.value = null;
  generationErrorKind.value = null;
}
function clearPullRequestSuccessTimer(): void {
  if (pullRequestSuccessTimer !== null) {
    clearTimeout(pullRequestSuccessTimer);
    pullRequestSuccessTimer = null;
  }
}
function resetMergeOperation(): void {
  clearMergeSuccessTimer();
  mergeBackgrounded.value = false;
  gitOperationProgress.value = null;
  mergeOperation.value = { status: 'confirming' };
}
function showMergeSuccess(branch: string, pushed: boolean): void {
  mergeOperation.value = { status: 'success', branch, pushed };
  if (mergeBackgrounded.value) {
    ElMessage.success(mergeOperationTitle.value);
    resetMergeOperation();
    return;
  }
  mergeSuccessTimer = setTimeout(() => {
    mergeDialogOpen.value = false;
  }, 1500);
}

function runPullRequestInBackground(): void {
  if (!pullRequestOperationRunning.value) return;
  pullRequestBackgrounded.value = true;
  pullRequestDialogOpen.value = false;
}

function runMergeInBackground(): void {
  if (!mergeOperationRunning.value) return;
  mergeBackgrounded.value = true;
  mergeDialogOpen.value = false;
}
function clearMergeSuccessTimer(): void {
  if (mergeSuccessTimer !== null) {
    clearTimeout(mergeSuccessTimer);
    mergeSuccessTimer = null;
  }
}

async function showDebugOperationProgress(operation: 'pullRequest' | 'merge'): Promise<void> {
  clearDebugOperationTimers();
  pullRequestDialogOpen.value = false;
  mergeDialogOpen.value = false;
  resetPullRequestOperation();
  resetMergeOperation();

  if (operation === 'pullRequest') {
    pullRequestTitle.value = 'Debug progress preview';
    pullRequestDialogOpen.value = true;
    pullRequestOperation.value = { status: 'creating' };
  } else {
    mergeDialogOpen.value = true;
    await nextTick();
    mergeOperation.value = {
      status: 'merging',
      branch: workflow.value?.branch ?? props.gitStatus?.branch ?? 'debug/worktree-preview',
      pushAfter: false,
      closeAgentAfterPush: false,
    };
  }

  gitOperationProgress.value = { operation, phase: 'handoff' };
  debugOperationTimers.push(setTimeout(() => {
    if (gitOperationProgress.value?.operation !== operation) return;
    gitOperationProgress.value = { operation, phase: 'delivery' };
  }, 3_000));
  debugOperationTimers.push(setTimeout(() => {
    if (gitOperationProgress.value?.operation !== operation) return;
    if (operation === 'pullRequest') {
      pullRequestOperation.value = { status: 'success' };
      if (pullRequestBackgrounded.value) {
        ElMessage.success(translate('surface.gitWorkflowControl.pullRequestCreated'));
        resetPullRequestOperation();
      } else {
        pullRequestSuccessTimer = setTimeout(() => {
          pullRequestDialogOpen.value = false;
        }, 1_500);
      }
      return;
    }

    const branch = mergeOperation.value.status === 'merging'
      ? mergeOperation.value.branch
      : workflow.value?.branch ?? props.gitStatus?.branch ?? 'debug/worktree-preview';
    showMergeSuccess(branch, false);
  }, 6_000));
}

function clearDebugOperationTimers(): void {
  debugOperationTimers.splice(0).forEach((timer) => clearTimeout(timer));
}

defineExpose({ showDebugOperationProgress });

let unsubscribeMainEvents: (() => void) | null = null;

function handleMainEvent(event: MainToRendererEvent): void {
  if (event.type !== 'git.operationProgress' || event.agentId !== props.agent.id) return;
  gitOperationProgress.value = {
    operation: event.payload.operation,
    phase: event.payload.phase,
  };
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
.git-workflow-control__dialog-form input:not([type]) {
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
.git-workflow-control__dialog-form input:not([type]):focus {
  border-color: var(--color-primary);
  background: var(--color-surface-low);
}

.git-workflow-control__pull-request-form input:not([type]) {
  border: 0;
  border-bottom: 1px solid var(--color-border);
  border-radius: 0;
  padding: var(--space-4) 0 var(--space-6);
  background: transparent;
}

.git-workflow-control__pull-request-form input:not([type]):focus {
  border-color: var(--color-border);
  background: transparent;
}

.git-workflow-control__pull-request-form textarea {
  padding: var(--space-6) 0 var(--space-4);
}

.git-workflow-control__message-editor {
  position: relative;
  min-width: 0;
}

.git-workflow-control__message-editor textarea,
.git-workflow-control__message-editor--pull-request > input {
  padding-right: 104px;
}

.git-workflow-control__pull-request-form
  .git-workflow-control__message-editor--pull-request
  > input {
  padding-right: 104px;
}

.git-workflow-control__generate {
  position: absolute;
  top: var(--space-3);
  right: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 28px;
  border: 0;
  border-radius: var(--radius-md);
  padding: 0 var(--space-3);
  color: var(--color-primary);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.git-workflow-control__generate:hover:not(:disabled) {
  background: var(--color-surface-high);
}

.git-workflow-control__generate:disabled {
  opacity: 0.45;
  cursor: default;
}

.git-workflow-control__generate svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.git-workflow-control__generation-error {
  margin: 0 0 var(--space-4);
  color: var(--color-error);
  font-size: var(--font-size-13);
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

.git-workflow-control__report-back {
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
</style>

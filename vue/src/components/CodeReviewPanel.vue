<template>
  <section class="code-review-panel" :aria-label="$t('surface.codeReviewPanel.codeReview')">
    <div v-if="!session" class="code-review-panel__empty">
      <template v-if="nothingToReview">
        <span class="code-review-panel__empty-icon"><IconCircleCheck aria-hidden="true" /></span>
        <h2>{{ $t('surface.codeReviewPanel.nothingToReview') }}</h2>
        <p>{{ $t('surface.codeReviewPanel.nothingToReviewDescription') }}</p>
      </template>
      <template v-else>
        <span class="code-review-panel__empty-icon"><IconChecklist aria-hidden="true" /></span>
        <h2>{{ $t('surface.codeReviewPanel.reviewThisBranch') }}</h2>
        <div class="code-review-panel__setup">
          <fieldset>
            <legend>{{ $t('surface.codeReviewPanel.scope') }}</legend>
            <div class="code-review-panel__choices" role="radiogroup">
              <button
                class="code-review-panel__choice"
                :class="{ 'is-selected': scope === 'uncommitted' }"
                type="button"
                role="radio"
                :aria-checked="scope === 'uncommitted'"
                :disabled="!hasUncommittedChanges"
                @click="scope = 'uncommitted'"
              >
                <span class="code-review-panel__choice-content">
                  <FileDiffIcon class="code-review-panel__choice-icon" aria-hidden="true" />
                  <span class="code-review-panel__choice-copy">
                    <strong>{{ $t('surface.codeReviewPanel.uncommittedChanges') }}</strong>
                    <small>{{ uncommittedDescription }}</small>
                  </span>
                </span>
              </button>
              <button
                class="code-review-panel__choice"
                :class="{ 'is-selected': scope === 'branch' }"
                type="button"
                role="radio"
                :aria-checked="scope === 'branch'"
                :disabled="!hasBranchChanges"
                @click="scope = 'branch'"
              >
                <span class="code-review-panel__choice-content">
                  <GitBranchIcon class="code-review-panel__choice-icon" aria-hidden="true" />
                  <span class="code-review-panel__choice-copy">
                    <strong>{{ $t('surface.codeReviewPanel.currentBranch') }}</strong>
                    <small>{{ branchDescription }}</small>
                  </span>
                </span>
              </button>
            </div>
          </fieldset>

          <fieldset>
            <legend>{{ $t('surface.codeReviewPanel.reviewerThread') }}</legend>
            <div class="code-review-panel__choices" role="radiogroup">
              <button
                class="code-review-panel__choice"
                :class="{ 'is-selected': threadMode === 'independent' }"
                type="button"
                role="radio"
                :aria-checked="threadMode === 'independent'"
                @click="threadMode = 'independent'"
              >
                <span class="code-review-panel__choice-content">
                  <RobotFaceIcon class="code-review-panel__choice-icon" aria-hidden="true" />
                  <span class="code-review-panel__choice-copy">
                    <strong>{{ $t('surface.codeReviewPanel.independentReviewer') }}</strong>
                    <small>{{ $t('surface.codeReviewPanel.independentReviewerDescription') }}</small>
                  </span>
                </span>
              </button>
              <button
                class="code-review-panel__choice"
                :class="{ 'is-selected': threadMode === 'current' }"
                type="button"
                role="radio"
                :aria-checked="threadMode === 'current'"
                :disabled="!currentThreadAvailable"
                @click="threadMode = 'current'"
              >
                <span class="code-review-panel__choice-content">
                  <MessageCircleIcon class="code-review-panel__choice-icon" aria-hidden="true" />
                  <span class="code-review-panel__choice-copy">
                    <strong>{{ $t('surface.codeReviewPanel.currentThread') }}</strong>
                    <small>{{ currentThreadDescription }}</small>
                  </span>
                </span>
              </button>
            </div>
          </fieldset>
        </div>
        <button
          class="claw-button claw-button--primary code-review-panel__start"
          type="button"
          :disabled="busy"
          @click="startSelectedReview"
        >
          <IconSparkles aria-hidden="true" />
          {{ $t('surface.codeReviewPanel.startReview') }}
        </button>
      </template>
    </div>

    <template v-else>
      <header class="code-review-panel__header">
        <div>
          <span class="code-review-panel__eyebrow">{{ $t('surface.codeReviewPanel.codeReview') }}</span>
          <h2>{{ sessionTitle }}</h2>
        </div>
        <span class="code-review-panel__status" :data-status="session.status">{{
          sessionStatus
        }}</span>
      </header>

      <div
        class="code-review-panel__rounds"
        role="tablist"
        :aria-label="$t('surface.codeReviewPanel.reviewRounds')"
      >
        <button
          v-for="round in session.rounds"
          :key="round.id"
          type="button"
          role="tab"
          :aria-selected="selectedRoundId === round.id"
          :class="{ 'is-active': selectedRoundId === round.id }"
          @click="selectedRoundId = round.id"
        >
          {{ $t('surface.codeReviewPanel.roundNumber', { number: round.number }) }}
        </button>
      </div>

      <div
        v-if="session.status !== 'reviewing'"
        class="code-review-panel__progress"
        :aria-label="$t('surface.codeReviewPanel.cumulativeProgress')"
      >
        <span v-for="item in progressItems" :key="item.label"
          ><strong>{{ item.value }}</strong> {{ item.label }}</span
        >
      </div>

      <div
        v-if="selectedRound?.status === 'reviewing'"
        class="code-review-panel__working"
        :class="{ 'is-waiting': findings.length === 0 }"
        aria-live="polite"
      >
        <template v-if="findings.length === 0">
          <span class="code-review-panel__spinner" aria-hidden="true" />
          <div class="code-review-panel__working-copy">
            <strong>{{ $t('surface.codeReviewPanel.reviewInProgress') }}</strong>
            <span>{{ reviewingScope }}</span>
          </div>
        </template>
        <template v-else>
          <span class="code-review-panel__spinner" aria-hidden="true" />
          <strong>{{ reviewingScope }}</strong>
          <span class="code-review-panel__working-count">{{
            $t('surface.codeReviewPanel.findingsFound', { count: findings.length })
          }}</span>
        </template>
      </div>

      <p
        v-if="selectedRound?.status === 'failed'"
        class="code-review-panel__error"
        role="alert"
      >
        {{ selectedRound.error || $t('surface.codeReviewPanel.reviewRoundFailed') }}
      </p>

      <div
        v-else-if="selectedRound?.status !== 'reviewing' && findings.length === 0"
        class="code-review-panel__clear"
      >
        <IconCircleCheck aria-hidden="true" />
        <strong>{{ $t('surface.codeReviewPanel.noFindings') }}</strong>
        <span>{{ $t('surface.codeReviewPanel.noFindingsDescription') }}</span>
      </div>

      <ol v-else-if="findings.length" class="code-review-panel__findings">
        <li
          v-for="finding in findings"
          :id="`finding-${finding.id}`"
          :key="`${selectedRound?.id}:${finding.id}`"
          class="review-finding"
          :data-priority="finding.priority"
          :data-state="findingState(finding)"
          :data-decision="finding.decision.state"
        >
          <div class="review-finding__title-row">
            <button
              class="review-finding__toggle"
              type="button"
              :aria-expanded="isFindingExpanded(finding.id)"
              :aria-controls="`finding-details-${finding.id}`"
              @click="toggleFinding(finding.id)"
            >
              <span class="review-finding__priority">{{
                finding.priority.toUpperCase()
              }}</span>
              <span class="review-finding__title">
                <strong>{{ finding.title }}</strong>
              </span>
              <span v-if="findingStateLabel(finding)" class="review-finding__state">{{ findingStateLabel(finding) }}</span>
              <IconChevronDown
                class="review-finding__chevron"
                aria-hidden="true"
              />
            </button>

            <div v-if="canArbitrate" class="review-finding__quick-actions">
              <button
                class="claw-button claw-button--tertiary review-finding__quick-action"
                type="button"
                :aria-label="$t('surface.codeReviewPanel.clarify')"
                :title="$t('surface.codeReviewPanel.clarify')"
                :disabled="busy"
                @click="clarifyFinding(finding)"
              >
                <IconMessageQuestion aria-hidden="true" />
              </button>
              <el-switch
                class="review-finding__selection"
                size="small"
                :model-value="finding.decision.state !== 'rejected'"
                :aria-label="$t('surface.codeReviewPanel.includeFinding')"
                :title="$t('surface.codeReviewPanel.includeFinding')"
                :disabled="busy"
                @click.stop
                @change="setFindingSelected(finding, $event)"
              />
            </div>
          </div>

          <div
            v-if="isFindingExpanded(finding.id)"
            :id="`finding-details-${finding.id}`"
            class="review-finding__body"
          >
            <button
              v-if="finding.location"
              class="review-finding__location"
              type="button"
              @click="emit('openFile', finding.location.file)"
            >
              {{ locationLabel(finding) }}
            </button>
            <div class="review-finding__description" v-html="renderMarkdown(finding.body)" />

            <blockquote
              v-if="finding.decision.state === 'rejected' && finding.decision.reason"
              class="review-finding__decision"
            >
              <strong>{{ $t('surface.codeReviewPanel.stateRejected') }}</strong>
              {{ finding.decision.reason }}
            </blockquote>

          </div>
        </li>
      </ol>

      <footer
        v-if="selectedRoundId === session.activeRoundId"
        class="code-review-panel__footer"
      >
        <template v-if="session.status === 'ready'">
          <span>{{ footerMessage }}</span>
          <button
            class="claw-button claw-button--primary"
            type="button"
            :disabled="busy"
            @click="submitRound"
          >
            {{ selectedCount ? $t('surface.codeReviewPanel.remediateSelected') : $t('surface.codeReviewPanel.completeRound') }}
          </button>
        </template>
        <template v-else-if="session.status === 'fixing'">
          <span>{{ $t('surface.codeReviewPanel.fixesInProgressDescription') }}</span>
        </template>
        <template v-else-if="session.status === 'readyToFinish'">
          <button
            class="claw-button claw-button--secondary"
            type="button"
            :disabled="busy"
            @click="run(() => finishReview(agent.id, session!.id))"
          >
            {{ $t('surface.codeReviewPanel.finishReview') }}
          </button>
          <button
            class="claw-button claw-button--primary"
            type="button"
            :disabled="busy"
            @click="run(() => reviewAgain(agent.id, session!.id))"
          >
            {{ $t('surface.codeReviewPanel.reviewAgain') }}
          </button>
        </template>
        <template v-else-if="session.status === 'finished'">
          <span>{{ $t('surface.codeReviewPanel.reviewFinished') }}</span>
          <button
            class="claw-button claw-button--primary"
            type="button"
            :disabled="busy"
            @click="retryReview"
          >
            {{ $t('surface.codeReviewPanel.startNewReview') }}
          </button>
        </template>
        <template v-else-if="session.status === 'failed'">
          <span>{{ $t('surface.codeReviewPanel.reviewStopped') }}</span>
          <button
            class="claw-button claw-button--primary"
            type="button"
            :disabled="busy"
            @click="retryReview"
          >
            {{ $t('surface.codeReviewPanel.retryReview') }}
          </button>
        </template>
      </footer>
    </template>
    <p v-if="error" class="code-review-panel__error" role="alert">
      {{ error }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  IconChecklist,
  IconChevronDown,
  IconCircleCheck,
  IconMessageQuestion,
  IconSparkles,
} from "@tabler/icons-vue";
import {
  FileDiffIcon,
  GitBranchIcon,
  MessageCircleIcon,
  RobotFaceIcon,
} from "../shared/icons/app-icons";
import {
  codeReviewProgress,
  type CodeReviewFinding,
  type CodeReviewStartInput,
  type CodeReviewThreadMode,
} from "@codex-claw/core/code-review";
import type { Agent, AgentGitStatus, AppSnapshot } from "@codex-claw/core/contracts";
import { renderMarkdown } from "@codex-app-sdk/vue";

const props = defineProps<{
  agent: Agent;
  gitStatus?: AgentGitStatus | null;
  startReview: (agentId: string, input: CodeReviewStartInput) => Promise<AppSnapshot>;
  decideFinding: (
    agentId: string,
    input: import("@codex-claw/core/code-review").CodeReviewDecisionInput,
  ) => Promise<AppSnapshot>;
  submitReviewRound: (
    agentId: string,
    sessionId: string,
  ) => Promise<AppSnapshot>;
  finishReview: (agentId: string, sessionId: string) => Promise<AppSnapshot>;
  reviewAgain: (agentId: string, sessionId: string) => Promise<AppSnapshot>;
}>();

const { t } = useI18n();
const emit = defineEmits<{
  clarifyFinding: [payload: {
    sessionId: string;
    roundId: string;
    finding: CodeReviewFinding;
  }];
  openFile: [path: string];
}>();
const busy = ref(false);
const error = ref<string | null>(null);
const scope = ref<CodeReviewStartInput["scope"]["type"]>("uncommitted");
const threadMode = ref<CodeReviewThreadMode>("independent");
const selectedRoundId = ref("");
const expandedFindingId = ref<string | null>(null);
const session = computed(() => props.agent.codeReview ?? null);
const branchScope = computed(() => props.gitStatus?.diffCatalog?.branch);
const scopeCatalogReady = computed(() => Boolean(props.gitStatus?.diffCatalog) && props.gitStatus?.state !== "unknown");
const hasUncommittedChanges = computed(() => {
  const catalog = props.gitStatus?.diffCatalog;
  return !scopeCatalogReady.value || !catalog || hasDiffChanges(catalog.uncommitted);
});
const hasBranchChanges = computed(() => {
  const catalog = props.gitStatus?.diffCatalog;
  return Boolean(catalog?.branch && catalog.commits.length > 0 && hasDiffChanges(catalog.branch));
});
const nothingToReview = computed(() => scopeCatalogReady.value
  && !hasUncommittedChanges.value
  && !hasBranchChanges.value);
const currentThreadAvailable = computed(() => Boolean(props.agent.backendSession));
const uncommittedDescription = computed(() => hasUncommittedChanges.value
  ? t("surface.codeReviewPanel.uncommittedDescription")
  : t("surface.codeReviewPanel.uncommittedUnavailable"));
const branchDescription = computed(() => hasBranchChanges.value && branchScope.value
  ? t("surface.codeReviewPanel.branchDescription", {
      branch: props.gitStatus?.branch ?? t("surface.codeReviewPanel.currentBranchFallback"),
      base: branchScope.value.baseRef,
    })
  : t("surface.codeReviewPanel.branchUnavailable"));
const currentThreadDescription = computed(() => currentThreadAvailable.value
  ? t("surface.codeReviewPanel.currentThreadDescription")
  : t("surface.codeReviewPanel.currentThreadUnavailable"));
const selectedRound = computed(
  () =>
    session.value?.rounds.find((round) => round.id === selectedRoundId.value) ??
    session.value?.rounds.at(-1),
);
const findings = computed(() =>
  [...(selectedRound.value?.findings ?? [])].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  ),
);
const progress = computed(() =>
  session.value
    ? codeReviewProgress(session.value)
    : {
        total: 0,
        undecided: 0,
        selected: 0,
        rejected: 0,
        skipped: 0,
        pending: 0,
        fixing: 0,
        fixed: 0,
      },
);
const progressItems = computed(() =>
  session.value?.status === "ready"
    ? [
        { value: selectedCount.value, label: t("surface.codeReviewPanel.selected") },
        { value: progress.value.rejected, label: t("surface.codeReviewPanel.unselected") },
        { value: progress.value.fixed, label: t("surface.codeReviewPanel.fixed") },
      ]
    : [
        { value: progress.value.skipped, label: t("surface.codeReviewPanel.skipped") },
        { value: progress.value.pending, label: t("surface.codeReviewPanel.pending") },
        { value: progress.value.fixing, label: t("surface.codeReviewPanel.fixing") },
        { value: progress.value.fixed, label: t("surface.codeReviewPanel.fixed") },
      ],
);
const canArbitrate = computed(
  () =>
    session.value?.status === "ready" &&
    selectedRoundId.value === session.value.activeRoundId,
);
const selectedCount = computed(
  () =>
    selectedRound.value?.findings.filter(
      (finding) => finding.decision.state !== "rejected",
    ).length ?? 0,
);
const sessionTitle = computed(
  () => props.gitStatus?.branch?.trim() || t("surface.codeReviewPanel.codeReview"),
);
const sessionStatus = computed(
  () =>
    ({
      reviewing: t("surface.codeReviewPanel.statusReviewing"),
      ready: t("surface.codeReviewPanel.statusReady"),
      fixing: t("surface.codeReviewPanel.statusFixing"),
      readyToFinish: t("surface.codeReviewPanel.statusReadyToFinish"),
      finished: t("surface.codeReviewPanel.statusFinished"),
      failed: t("surface.codeReviewPanel.statusFailed"),
    })[session.value?.status ?? "reviewing"],
);
const reviewingScope = computed(() => {
  const reviewScope = session.value?.scope;
  if (reviewScope?.type === "branch") {
    return t("surface.codeReviewPanel.inspectingBranch", {
      branch: props.gitStatus?.branch ?? t("surface.codeReviewPanel.currentBranchFallback"),
      base: reviewScope.baseRef,
    });
  }
  return t("surface.codeReviewPanel.inspectingUncommitted");
});
const footerMessage = computed(() =>
  t("surface.codeReviewPanel.findingsSelected", {
    count: selectedCount.value,
    total: selectedRound.value?.findings.length ?? 0,
  }),
);

watch(
  () => session.value?.activeRoundId,
  (roundId) => {
    if (roundId) selectedRoundId.value = roundId;
    expandedFindingId.value = null;
  },
  { immediate: true },
);

watch(
  [hasUncommittedChanges, hasBranchChanges],
  ([uncommitted, branch]) => {
    if (scope.value === "uncommitted" && !uncommitted && branch) scope.value = "branch";
    if (scope.value === "branch" && !branch && uncommitted) scope.value = "uncommitted";
  },
  { immediate: true },
);

async function run(action: () => Promise<unknown>): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    await action();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    busy.value = false;
  }
}

function setFindingSelected(
  finding: CodeReviewFinding,
  value: string | number | boolean,
): void {
  const round = selectedRound.value;
  if (!session.value || !round) return;
  void run(() =>
    props.decideFinding(props.agent.id, {
      sessionId: session.value!.id,
      roundId: round.id,
      findingId: finding.id,
      decision: value === true ? "select" : "reject",
    }),
  );
}

function clarifyFinding(finding: CodeReviewFinding): void {
  const round = selectedRound.value;
  if (!session.value || !round) return;
  emit("clarifyFinding", {
    sessionId: session.value.id,
    roundId: round.id,
    finding,
  });
}

function submitRound(): void {
  if (!session.value) return;
  void run(() => props.submitReviewRound(props.agent.id, session.value!.id));
}

function startSelectedReview(): void {
  if (nothingToReview.value) return;
  const reviewScope: CodeReviewStartInput["scope"] = scope.value === "branch" && branchScope.value
    ? { type: "branch", baseRef: branchScope.value.baseRef }
    : { type: "uncommitted" };
  void run(() => props.startReview(props.agent.id, { scope: reviewScope, threadMode: threadMode.value }));
}

function retryReview(): void {
  const review = session.value;
  if (!review) return;
  const reviewScope: CodeReviewStartInput["scope"] = review.scope.type === "branch"
    ? { type: "branch", baseRef: review.scope.baseRef }
    : { type: "uncommitted" };
  void run(() => props.startReview(props.agent.id, {
    scope: reviewScope,
    threadMode: review.threadMode,
  }));
}

function findingState(finding: CodeReviewFinding): string {
  return finding.remediation.state;
}

function findingStateLabel(finding: CodeReviewFinding): string {
  const state = findingState(finding);
  return (
    (
      {
        notStarted: "",
        skipped: t("surface.codeReviewPanel.stateSkipped"),
        pending: t("surface.codeReviewPanel.statePending"),
        fixing: t("surface.codeReviewPanel.stateFixing"),
        fixed: t("surface.codeReviewPanel.stateFixed"),
      } as Record<string, string>
    )[state] ?? state
  );
}

function isFindingExpanded(findingId: string): boolean {
  return expandedFindingId.value === findingId;
}

function toggleFinding(findingId: string): void {
  expandedFindingId.value =
    expandedFindingId.value === findingId ? null : findingId;
  if (expandedFindingId.value) {
    void nextTick(() => {
      document
        .getElementById(`finding-${findingId}`)
        ?.scrollIntoView?.({ block: "nearest" });
    });
  }
}

function locationLabel(finding: CodeReviewFinding): string {
  if (!finding.location) return "";
  const { file, line, endLine } = finding.location;
  if (!line) return file;
  return `${file}:${line}${endLine && endLine !== line ? `–${endLine}` : ""}`;
}

function priorityRank(priority: CodeReviewFinding["priority"]): number {
  return { p0: 0, p1: 1, p2: 2, p3: 3 }[priority];
}

function hasDiffChanges(summary: { addedLines: number; removedLines: number; changedFiles: number }): boolean {
  return summary.changedFiles > 0 || summary.addedLines > 0 || summary.removedLines > 0;
}
</script>

<style scoped>
.code-review-panel {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  color: var(--color-text);
}

.code-review-panel__empty {
  margin: auto;
  width: min(720px, 100%);
  box-sizing: border-box;
  display: grid;
  justify-items: center;
  gap: var(--space-6);
  padding: var(--space-16);
  text-align: center;
}

.code-review-panel__setup {
  width: 100%;
  display: grid;
  gap: var(--space-10);
  text-align: left;
}

.code-review-panel__start {
  margin-top: var(--space-6);
}

.code-review-panel__setup fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.code-review-panel__setup legend {
  margin-bottom: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.code-review-panel__choices {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.code-review-panel__choice {
  min-width: 0;
  min-height: 132px;
  box-sizing: border-box;
  width: 100%;
  height: auto;
  margin: 0;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.code-review-panel__choice:hover:not(:disabled):not(.is-selected) {
  border-color: var(--color-outline);
  background: var(--color-surface-low);
}

.code-review-panel__choice.is-selected {
  border-color: var(--color-primary);
  background: var(--color-primary-container);
}

.code-review-panel__choice:disabled {
  opacity: 0.45;
  cursor: default;
}

.code-review-panel__choice:focus-visible {
  border-color: var(--color-primary);
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.code-review-panel__choice-content {
  display: grid;
  justify-items: center;
  gap: var(--space-4);
  text-align: center;
}

.code-review-panel__choice-icon {
  width: var(--icon-xl);
  height: var(--icon-xl);
  color: var(--color-primary);
  stroke-width: 1.7;
}

.code-review-panel__choice-copy {
  display: grid;
  gap: var(--space-1);
}

.code-review-panel__choice-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
}

.code-review-panel__choice-copy small {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.code-review-panel__empty h2,
.code-review-panel__header h2 {
  margin: 0;
  font-size: var(--font-size-18);
}

.code-review-panel__empty p {
  margin: 0 0 var(--space-3);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.code-review-panel__empty-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.code-review-panel__empty-icon svg {
  width: 26px;
  height: 26px;
}

.code-review-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.code-review-panel__header > div {
  min-width: 0;
}

.code-review-panel__header h2 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-review-panel__eyebrow {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.code-review-panel__status,
.review-finding__state {
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--color-surface-low);
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  white-space: nowrap;
}

.code-review-panel__status[data-status="ready"],
.code-review-panel__status[data-status="readyToFinish"] {
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.code-review-panel__rounds {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6) 0;
  overflow-x: auto;
}

.code-review-panel__rounds button {
  border: 0;
  border-bottom: 2px solid transparent;
  padding: var(--space-2) var(--space-1);
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.code-review-panel__rounds button.is-active {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.code-review-panel__progress {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 1px;
  margin: var(--space-4) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-border);
}

.code-review-panel__progress span {
  display: grid;
  gap: 2px;
  padding: var(--space-3);
  background: var(--color-surface-low);
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.code-review-panel__progress strong {
  color: var(--color-text);
  font-size: var(--font-size-16);
}

.code-review-panel__working {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.code-review-panel__working strong {
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

.code-review-panel__working.is-waiting {
  grid-template-columns: 1fr;
  justify-items: center;
  margin: auto;
  padding: var(--space-8);
  border-bottom: 0;
  text-align: center;
}

.code-review-panel__working.is-waiting .code-review-panel__spinner {
  width: 28px;
  height: 28px;
}

.code-review-panel__working-copy {
  display: grid;
  gap: var(--space-1);
  justify-items: center;
  line-height: 1.4;
}

.code-review-panel__working-count {
  padding: 2px var(--space-2);
  border-radius: 999px;
  background: var(--color-surface-low);
  font-size: var(--font-size-11);
}

.code-review-panel__clear {
  margin: auto;
  color: var(--color-text-muted);
  line-height: 1.4;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-4);
  align-items: center;
  padding: var(--space-8);
}

.code-review-panel__clear span {
  display: block;
}

.code-review-panel__clear svg {
  color: var(--color-success);
}

.code-review-panel__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: review-spin 0.8s linear infinite;
}

@keyframes review-spin {
  to {
    transform: rotate(360deg);
  }
}

.code-review-panel__findings {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  gap: var(--space-3);
  margin: 0;
  padding: 0 var(--space-6) var(--space-6);
  list-style: none;
}

.review-finding {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
}

.review-finding[data-state="fixing"],
.review-finding[data-state="pending"] {
  border-color: var(--color-primary);
}

.review-finding[data-state="skipped"] {
  opacity: 0.74;
}

.review-finding[data-state="fixed"] {
  border-color: var(--color-success);
}

.review-finding__title-row {
  display: flex;
  align-items: stretch;
  min-width: 0;
}

.review-finding__toggle {
  flex: 1;
  min-width: 0;
  min-height: 46px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.review-finding__toggle:hover,
.review-finding__toggle:focus-visible {
  background: var(--color-surface-low);
}

.review-finding__title {
  flex: 1;
  min-width: 0;
}

.review-finding__title strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.review-finding__priority {
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-error-container);
  color: var(--color-error);
  font-weight: 700;
  font-size: var(--font-size-11);
}

.review-finding[data-priority="p2"] .review-finding__priority,
.review-finding[data-priority="p3"] .review-finding__priority {
  background: var(--color-surface-high);
  color: var(--color-text-muted);
}

.review-finding[data-decision="rejected"] .review-finding__title {
  color: var(--color-text-muted);
}

.review-finding[data-decision="rejected"] .review-finding__priority {
  opacity: 0.55;
}

.review-finding__chevron {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--color-text-muted);
  transition: transform 120ms ease;
}

.review-finding__toggle[aria-expanded="true"] .review-finding__chevron {
  transform: rotate(180deg);
}

.review-finding__quick-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3) var(--space-2) 0;
}

.review-finding__quick-action {
  width: 28px;
  min-height: 28px;
  padding: 0;
}

.review-finding__quick-action svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.review-finding__selection {
  flex: 0 0 auto;
}

.review-finding__location {
  justify-self: start;
  max-width: 100%;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-12);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.review-finding__body {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-border);
}

.review-finding__description :deep(p) {
  margin: 0;
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
}

.review-finding__decision {
  margin: 0;
  padding: var(--space-3);
  border-left: 3px solid var(--color-text-muted);
  background: var(--color-surface-low);
}

.review-finding__decision strong {
  display: block;
  margin-bottom: var(--space-1);
}

.code-review-panel__footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
}

.code-review-panel__footer > span {
  margin-right: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.code-review-panel__error {
  margin: var(--space-4) var(--space-6);
  padding: var(--space-4);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  background: var(--color-error-container);
  font-size: var(--font-size-13);
}
</style>

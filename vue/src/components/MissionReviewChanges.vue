<template>
  <section class="mission-review-changes" :aria-label="t('missions.changesTab')">
    <header class="mission-review-changes__header">
      <el-select
        v-if="repositories.length"
        v-model="selectedRepositoryPath"
        :aria-label="t('missions.reviewRepository')"
      >
        <el-option
          v-for="repository in repositories"
          :key="repository.repositoryPath"
          :value="repository.repositoryPath"
          :label="repositoryLabel(repository.repositoryPath)"
        />
      </el-select>
      <MissionWorkspaceOpenIn
        v-if="selectedRepository?.workspacePath && selectedRepository.agent"
        :agent="selectedRepository.agent"
        :available="openInAvailable"
        :catalog="openInApplications"
        :workspace-path="selectedRepository.workspacePath"
        @open="emit('open-worktree', $event)"
      />
      <el-select v-model="target" :aria-label="t('missions.diffScope')">
        <el-option value="branch" :label="t('missions.branchDiff')" />
        <el-option value="uncommitted" :label="t('missions.uncommittedDiff')" />
      </el-select>
      <button class="claw-button" type="button" @click="refresh">{{ t('missions.refreshDiff') }}</button>
    </header>
    <GitDiffPreviewPanel :diff="diff" :state="state" :error="error" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Agent, AgentGitDiff, AgentGitDiffTarget, AgentGitStatus, OpenInApplicationCatalog } from '@codex-claw/core/contracts';
import type { Mission } from '@codex-claw/core/missions';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
import MissionWorkspaceOpenIn, { type MissionWorkspaceOpenRequest } from './MissionWorkspaceOpenIn.vue';

const props = withDefaults(defineProps<{
  active?: boolean;
  agent: Agent;
  agents?: Agent[];
  baseSha?: string;
  gitStatus?: AgentGitStatus | null;
  gitStatuses?: Record<string, AgentGitStatus>;
  getDiff: (agentId: string, target?: AgentGitDiffTarget) => Promise<AgentGitDiff>;
  mission?: Mission;
  openInAvailable?: boolean;
  openInApplications?: OpenInApplicationCatalog;
  workspacePath?: string;
}>(), {
  active: true,
  agents: () => [],
  gitStatuses: () => ({}),
  openInApplications: () => ({ defaultApplication: 'finder', applications: [] }),
});

const emit = defineEmits<{ 'open-worktree': [request: MissionWorkspaceOpenRequest] }>();
const { t } = useI18n();
const target = ref<'branch' | 'uncommitted'>('branch');
const selectedRepositoryPath = ref('');
const diff = ref('');
const state = ref<'idle' | 'loading' | 'error'>('idle');
const error = ref<string | null>(null);
let request = 0;

const repositories = computed(() => {
  const workspaces = props.mission?.execution?.workspaces ?? [];
  if (!workspaces.length) {
    return [{
      repositoryPath: props.workspacePath ?? props.agent.folder ?? props.agent.name ?? props.agent.id,
      workspacePath: props.workspacePath ?? props.agent.folder ?? undefined,
      baseSha: props.baseSha,
      agent: props.agent,
      gitStatus: props.gitStatus,
    }];
  }
  return workspaces.map(workspace => {
    const run = props.mission?.execution?.runs.slice().reverse().find(candidate => (
      candidate.stage === 'implementation'
      && candidate.repositoryPath === workspace.repositoryPath
      && candidate.workerId
    ));
    const agent = props.agents.find(candidate => candidate.id === run?.workerId);
    return {
      repositoryPath: workspace.repositoryPath,
      workspacePath: workspace.path,
      baseSha: workspace.baseSha,
      agent,
      gitStatus: agent ? props.gitStatuses[agent.id] : undefined,
    };
  });
});
const selectedRepository = computed(() => (
  repositories.value.find(repository => repository.repositoryPath === selectedRepositoryPath.value)
  ?? repositories.value[0]
));

async function refresh(): Promise<void> {
  const repository = selectedRepository.value;
  if (!repository?.agent) {
    diff.value = '';
    error.value = t('missions.reviewRepositoryAgentUnavailable');
    state.value = 'error';
    return;
  }
  const current = ++request;
  state.value = 'loading';
  error.value = null;
  try {
    const result = await props.getDiff(
      repository.agent.id,
      target.value === 'branch'
        ? { type: 'branch', ...(repository.baseSha ? { baseRef: repository.baseSha } : {}) }
        : { type: 'uncommitted' },
    );
    if (current !== request) return;
    diff.value = result.diff;
    state.value = 'idle';
  } catch (cause) {
    if (current !== request) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
    state.value = 'error';
  }
}

function repositoryLabel(repositoryPath: string): string {
  return repositoryPath.split('/').filter(Boolean).at(-1) ?? repositoryPath;
}

watch(repositories, available => {
  if (!available.some(repository => repository.repositoryPath === selectedRepositoryPath.value)) {
    selectedRepositoryPath.value = available[0]?.repositoryPath ?? '';
  }
}, { immediate: true });
watch(
  () => [
    props.active,
    selectedRepository.value?.agent?.id,
    selectedRepository.value?.gitStatus?.updatedAt,
    target.value,
  ] as const,
  ([active]) => {
    if (active) void refresh();
  },
  { immediate: true },
);
</script>

<style scoped>
.mission-review-changes {
  display: grid;
  gap: var(--space-4);
}

.mission-review-changes__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.mission-review-changes__header .el-select {
  width: 200px;
}
</style>

<template>
  <section class="mission-code-review" :aria-label="t('missions.codeReview')">
    <header>
      <h2>{{ t('missions.codeReview') }}</h2>
      <el-select v-model="target" :aria-label="t('missions.diffScope')" @change="refresh">
        <el-option value="branch" :label="t('missions.branchDiff')" />
        <el-option value="uncommitted" :label="t('missions.uncommittedDiff')" />
      </el-select>
      <button class="claw-button" type="button" @click="refresh">{{ t('missions.refreshDiff') }}</button>
      <GitWorkflowControl :agent="agent" :git-status="gitStatus" :get-workflow="getWorkflow" :generate-message="generateMessage" :commit-changes="commitChanges" :push-branch="pushBranch" :create-pull-request="createPullRequest" @open-git-diff="refresh" />
    </header>
    <GitDiffPreviewPanel :diff="diff" :state="state" :error="error" />
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Agent, AgentGitStatus, CodexClawApi } from '@codex-claw/core/contracts';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
import GitWorkflowControl from './GitWorkflowControl.vue';
const props = defineProps<{
  agent: Agent;
  baseSha?: string;
  gitStatus?: AgentGitStatus | null;
  getDiff: CodexClawApi['getAgentGitDiff'];
  getWorkflow?: CodexClawApi['getAgentGitWorkflow'];
  generateMessage?: CodexClawApi['generateAgentGitMessage'];
  commitChanges?: CodexClawApi['commitAgentGitChanges'];
  pushBranch?: CodexClawApi['pushAgentGitBranch'];
  createPullRequest?: CodexClawApi['createAgentGitPullRequest'];
}>();
const { t } = useI18n();
const target = ref<'branch' | 'uncommitted'>('branch');
const diff = ref('');
const state = ref<'idle' | 'loading' | 'error'>('idle');
const error = ref<string | null>(null);
let request = 0;
async function refresh() {
  const current = ++request;
  state.value = 'loading'; error.value = null;
  try {
    const result = await props.getDiff(props.agent.id, target.value === 'branch' ? { type: 'branch', ...(props.baseSha ? { baseRef: props.baseSha } : {}) } : { type: 'uncommitted' });
    if (current !== request) return;
    diff.value = result.diff; state.value = 'idle';
  } catch (e) {
    if (current !== request) return;
    error.value = e instanceof Error ? e.message : String(e); state.value = 'error';
  }
}
watch(() => [props.agent.id, props.gitStatus?.updatedAt], refresh, { immediate: true });
</script>
<style scoped>
.mission-code-review { display: flex; flex-direction: column; min-height: 240px; max-height: 600px; margin-bottom: 20px; }
header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
header .el-select { width: 200px; }
</style>

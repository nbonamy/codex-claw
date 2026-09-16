import { TypedIpcMain } from '@codex-app-sdk/electron';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { requestClawBackend } from '@codex-claw/core/backend-protocol/rpc';
import { ipcChannels, type CodexClawIpcRequests } from '@codex-claw/core/ipc';
import { encodedAppError } from '@codex-claw/core/app-error';
import type { ClawBackendClientPort } from './backend-client';

export function registerAgentGitIpcHandlers(
  ipc: TypedIpcMain<CodexClawIpcRequests>,
  getBackendClient: () => ClawBackendClientPort,
): void {
  ipc.handle(ipcChannels.getAgentGitDiff, async (_event, agentId, target) => {
    return requestClawBackend(getBackendClient(), backendMethods.agentGitDiffGet, { agentId, target });
  });
  ipc.handle(ipcChannels.getAgentGitWorkflow, (_event, agentId) => (
    requestClawBackend(getBackendClient(), backendMethods.agentGitWorkflowGet, { agentId })
  ));
  ipc.handle(ipcChannels.generateAgentGitMessage, async (_event, agentId, input) => {
    try {
      return await requestClawBackend(getBackendClient(), backendMethods.agentGitMessageGenerate, { agentId, input });
    } catch (error) {
      throw encodedAppError(error);
    }
  });
  ipc.handle(ipcChannels.stageAgentGitFiles, (_event, agentId, input) => (
    requestClawBackend(getBackendClient(), backendMethods.agentGitStage, { agentId, input })
  ));
  ipc.handle(ipcChannels.commitAgentGitChanges, (_event, agentId, input) => (
    requestClawBackend(getBackendClient(), backendMethods.agentGitCommit, { agentId, input })
  ));
  ipc.handle(ipcChannels.pushAgentGitBranch, (_event, agentId, input) => (
    requestClawBackend(getBackendClient(), backendMethods.agentGitPush, { agentId, input })
  ));
  ipc.handle(ipcChannels.createAgentGitBranch, (_event, agentId, input) => (
    requestClawBackend(getBackendClient(), backendMethods.agentGitBranchCreate, { agentId, input })
  ));
  ipc.handle(ipcChannels.createAgentGitPullRequest, async (_event, agentId, input) => {
    try {
      return await requestClawBackend(getBackendClient(), backendMethods.agentGitPullRequestCreate, { agentId, input });
    } catch (error) {
      throw encodedAppError(error);
    }
  });
  ipc.handle(ipcChannels.mergeAgentGitBranch, (_event, agentId, input) => (
    requestClawBackend(getBackendClient(), backendMethods.agentGitMerge, { agentId, input })
  ));
}

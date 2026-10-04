import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { agentResponseFromClientResponse } from '@codex-claw/core/agent-request';
import type { ClientRequestResponse } from '@codex-claw/core/contracts';
import type { UpdateSettingsInput } from '@codex-claw/core/contracts';
import { splitSettingsInput } from '@codex-claw/core/client-preferences';
import type { ClawSnapshotGetResult } from '@codex-claw/core/backend-protocol/rpc';

export type ClawBackendPort = {
  request<Result>(method: string, params?: unknown): Promise<Result>;
};

type ParamsFactory = (args: unknown[]) => unknown;

const directOperations: Readonly<Record<string, readonly [string, ParamsFactory?]>> = {
  startVisualize: [backendMethods.agentVisualizeStart, namedOptional('agentId', 'input')],
  setVisualizeOpen: [backendMethods.agentVisualizeOpenSet, named('agentId', 'input')],
  generateVisualizationSuggestion: [backendMethods.agentVisualizationSuggestionGenerate, named('agentId', 'input')],
  selectVisualization: [backendMethods.agentVisualizationSelect, named('agentId', 'input')],
  deleteVisualization: [backendMethods.agentVisualizationDelete, named('agentId', 'input')],
  saveVisualizationCanvas: [backendMethods.agentVisualizationCanvasSave, named('agentId', 'input')],
  readVisualizationAsset: [backendMethods.agentVisualizationAssetGet, named('agentId', 'visualizationId')],
  startCodeReview: [backendMethods.agentCodeReviewStart, named('agentId', 'input')],
  decideCodeReviewFinding: [backendMethods.agentCodeReviewFindingDecide, named('agentId', 'input')],
  discussCodeReviewFinding: [backendMethods.agentCodeReviewFindingDiscuss, named('agentId', 'input')],
  submitCodeReviewRound: [backendMethods.agentCodeReviewRoundSubmit, named('agentId', 'sessionId')],
  finishCodeReview: [backendMethods.agentCodeReviewFinish, named('agentId', 'sessionId')],
  discardCodeReview: [backendMethods.agentCodeReviewDiscard, named('agentId', 'sessionId')],
  reviewCodeAgain: [backendMethods.agentCodeReviewAgain, named('agentId', 'sessionId')],
  respondToThreadFlag: [backendMethods.agentThreadFlagRespond, named('agentId', 'response')],
  respondToPlanReview: [backendMethods.agentPlanReviewRespond, named('agentId', 'response')],
  listSshHosts: [backendMethods.connectionsSshHostsList],
  addSshConnection: [backendMethods.connectionsSshCreate, named('input')],
  updateRemoteConnection: [backendMethods.connectionsUpdate, named('connectionId', 'input')],
  removeRemoteConnection: [backendMethods.connectionsDelete, named('connectionId')],
  getRemoteControlStatus: [backendMethods.remoteControlStatusGet],
  enableRemoteControl: [backendMethods.remoteControlEnable],
  disableRemoteControl: [backendMethods.remoteControlDisable],
  startDevicePairing: [backendMethods.remoteControlPairingStart],
  checkDevicePairing: [backendMethods.remoteControlPairingCheck, named('session')],
  listPairedDevices: [backendMethods.remoteControlClientsList, named('environmentId')],
  revokePairedDevice: [backendMethods.remoteControlClientRevoke, named('environmentId', 'clientId')],
  connectWorkProvider: [backendMethods.workProviderConnect, named('provider')],
  pollWorkProviderAuthorization: [backendMethods.workProviderAuthorizationPoll, named('provider')],
  disconnectWorkProvider: [backendMethods.workProviderDisconnect, named('provider')],
  listWorkRepositories: [backendMethods.workProviderRepositoriesList, namedOptional('provider', 'location')],
  configureWorkBacklog: [backendMethods.workProviderBacklogConfigure, namedOptional('input', 'location')],
  listGlobalWorkItems: [backendMethods.workProviderGlobalItemsList, namedOptional('provider', 'location', 'query')],
  listWorkItems: [backendMethods.workProviderItemsList, namedOptional('provider', 'repositoryId', 'location')],
  listBackendModels: [backendMethods.agentModelsList, namedOptional('agentId', 'backend')],
  listBackendPlugins: [backendMethods.agentPluginsList, named('agentId')],
  listBackendSkills: [backendMethods.agentSkillsList, named('agentId')],
  listAgentFiles: [backendMethods.agentFilesList, named('agentId')],
  previewAgentFile: [backendMethods.agentFilePreview, named('agentId', 'filePath')],
  readAgentFileChunk: [backendMethods.agentFileChunkRead, named('agentId', 'filePath', 'offset')],
  getAgentGitDiff: [backendMethods.agentGitDiffGet, namedOptional('agentId', 'target')],
  getAgentGitWorkflow: [backendMethods.agentGitWorkflowGet, named('agentId')],
  generateAgentGitMessage: [backendMethods.agentGitMessageGenerate, named('agentId', 'input')],
  stageAgentGitFiles: [backendMethods.agentGitStage, named('agentId', 'input')],
  commitAgentGitChanges: [backendMethods.agentGitCommit, named('agentId', 'input')],
  pushAgentGitBranch: [backendMethods.agentGitPush, named('agentId', 'input')],
  createAgentGitBranch: [backendMethods.agentGitBranchCreate, named('agentId', 'input')],
  createAgentGitPullRequest: [backendMethods.agentGitPullRequestCreate, named('agentId', 'input')],
  mergeAgentGitBranch: [backendMethods.agentGitMerge, named('agentId', 'input')],
  listSourceFolders: [backendMethods.sourceFoldersList, firstArgument],
  listSourceRepositories: [backendMethods.sourceRepositoriesList, optionalNamed('remoteConnectionId')],
  cloneSourceRepository: [backendMethods.sourceRepositoryClone, named('input')],
  listSourceBranches: [backendMethods.sourceBranchesList, namedOptional('repoPath', 'remoteConnectionId')],
  listSourceWorktrees: [backendMethods.sourceWorktreesList, namedOptional('repoPath', 'remoteConnectionId')],
  suggestSourceWorktreePath: [backendMethods.sourceWorktreePathSuggest, named('input')],
  createSourceWorktree: [backendMethods.sourceWorktreeCreate, named('input')],
  updateTeam: [backendMethods.teamUpdate, named('input')],
  reorderTeams: [backendMethods.clientTeamOrderUpdate, named('input')],
  closeTeam: [backendMethods.teamDelete, named('teamId')],
  disconnectTeam: [backendMethods.teamDisconnect, named('teamId')],
  selectTeam: [backendMethods.clientNavigationSelectTeam, named('teamId')],
  createAutomation: [backendMethods.automationCreate, namedOptional('input', 'location')],
  updateAutomation: [backendMethods.automationUpdate, namedOptional('input', 'location')],
  runAutomation: [backendMethods.automationRun, namedOptional('automationId', 'location')],
  clearAutomationHistory: [backendMethods.automationHistoryClear, namedOptional('automationId', 'location')],
  deleteAutomationExecution: [backendMethods.automationExecutionDelete, namedOptional('automationId', 'executionId', 'location')],
  deleteAutomation: [backendMethods.automationDelete, namedOptional('automationId', 'location')],
  listAgentConversations: [backendMethods.agentConversationsList, named('agentId')],
  resumeAgentConversation: [backendMethods.agentConversationResume, named('agentId', 'ref')],
  readConversationMessages: [backendMethods.agentConversationMessagesGet, namedOptional('ref', 'agentId', 'location')],
  createAgent: [backendMethods.agentCreate, named('input')],
  createProject: [backendMethods.projectCreate, named('input')],
  executeMission: [backendMethods.missionExecute, named('input')],
  createMission: [backendMethods.missionCreate, named('input')],
  deleteMission: [backendMethods.missionDelete, named('input')],
  readMissionArtifact: [backendMethods.missionArtifactRead, (args) => ({ missionId: args[0], stage: args[1] })],
  updateMission: [backendMethods.missionUpdate, named('input')],
  createQuickChat: [backendMethods.agentQuickChatCreate, named('input')],
  updateAgent: [backendMethods.agentUpdate, named('input')],
  assignWorkItemToAgent: [backendMethods.agentWorkItemAssign, named('agentId', 'item')],
  removeWorkItemAssignment: [backendMethods.agentWorkItemAssignmentDelete, named('item')],
  duplicateAgent: [backendMethods.agentDuplicate, namedOptional('agentId', 'options')],
  forkAgent: [backendMethods.agentFork, namedOptional('agentId', 'turnId')],
  handoffAgent: [backendMethods.agentHandoff, named('agentId', 'input')],
  moveAgentToTeam: [backendMethods.agentTeamMove, named('input')],
  reorderAgents: [backendMethods.clientAgentOrderUpdate, named('input')],
  reorderRepositories: [backendMethods.clientRepositoryOrderUpdate, named('input')],
  restartAgent: [backendMethods.agentConversationReset, named('agentId')],
  loadConversationHistory: [backendMethods.agentConversationLoad, named('agentId')],
  loadOlderAgentHistory: [backendMethods.agentConversationHistoryLoadOlder, named('agentId')],
  closeAgent: [backendMethods.agentDelete, namedOptional('agentId', 'input')],
  selectAgent: [backendMethods.clientNavigationSelectAgent, named('agentId')],
  readEngineInstructions: [backendMethods.engineInstructionsRead, named('engine')],
  saveEngineInstructions: [backendMethods.engineInstructionsSave, named('input')],
  getCodexResourceSharingStatus: [backendMethods.settingsCodexResourceSharingGet],
  setCodexResourceSharing: [backendMethods.settingsCodexResourceSharingSet, named('input')],
  getPluginStatus: [backendMethods.settingsPluginStatusGet],
  getCodexAuthentication: [backendMethods.codexAuthenticationGet, namedOptional('remoteConnectionId')],
  getClaudeAuthentication: [backendMethods.claudeAuthenticationGet, optionalNamed('connectionId')],
  getProviderSetup: [backendMethods.providerSetupGet, namedOptional('remoteConnectionId')],
  getProviderConnections: [backendMethods.providerConnectionsGet, namedOptional('remoteConnectionId')],
  getProviderUsage: [backendMethods.providerUsageGet, named('backend')],
  setProviderEnabled: [backendMethods.providerEnabledSet, (args) => ({ backend: args[0], enabled: args[1], ...(args[2] ? { remoteConnectionId: args[2] } : {}) })],
  disconnectProvider: [backendMethods.providerDisconnect, (args) => ({ backend: args[0], ...(args[1] ? { remoteConnectionId: args[1] } : {}) })],
  configureProviderSetup: [backendMethods.providerSetupConfigure, named('backend', 'choice')],
  installProvider: [backendMethods.providerInstall, named('backend', 'remoteConnectionId')],
  cancelCodexChatGptLogin: [backendMethods.codexLoginCancel, namedOptional('remoteConnectionId', 'loginId')],
  startCodexChatGptDeviceCodeLogin: [backendMethods.codexChatGptDeviceCodeLoginStart, named('remoteConnectionId')],
  startCodexChatGptLogin: [backendMethods.codexChatGptLoginStart],
  logoutCodex: [backendMethods.codexLogout],
  setAgentGoal: [backendMethods.agentGoalUpdate, named('agentId', 'objective')],
  clearAgentGoal: [backendMethods.agentGoalClear, named('agentId')],
  setAgentApprovalPreset: [backendMethods.agentApprovalPresetUpdate, named('agentId', 'preset')],
  setAgentPermissionMode: [backendMethods.agentPermissionModeUpdate, named('agentId', 'mode')],
  sendPrompt: [backendMethods.agentPromptSend, namedOptional('agentId', 'prompt', 'options')],
  steerPrompt: [backendMethods.agentPromptSteer, namedOptional('agentId', 'prompt', 'options')],
  deleteQueuedPrompt: [backendMethods.agentQueuedPromptDelete, named('agentId', 'promptId')],
  steerQueuedPrompt: [backendMethods.agentQueuedPromptSteer, namedOptional('agentId', 'promptId', 'prompt')],
  updateQueuedPrompt: [backendMethods.agentQueuedPromptUpdate, named('agentId', 'promptId', 'prompt')],
  interruptAgent: [backendMethods.agentInterrupt, named('agentId')],
  deleteTurn: [backendMethods.agentTurnDelete, named('agentId', 'turnId')],
  editTurn: [backendMethods.agentTurnEdit, named('agentId', 'turnId', 'content')],
  retryTurn: [backendMethods.agentTurnRetry, named('agentId', 'turnId')],
  continueInterruptedTurn: [backendMethods.agentTurnContinueInterrupted, named('agentId')],
  respondToClientRequest: [backendMethods.agentRequestRespond, (args) => ({ response: agentResponseFromClientResponse(args[0] as ClientRequestResponse) })],
};

const desktopOnlyOperations = new Set([
  'browserClearAnnotations', 'browserClose', 'browserGoBack', 'browserGoForward', 'browserNavigate',
  'browserOpen', 'browserReload', 'browserResolveAnnotation', 'browserCopyScreenshot', 'browserGetZoom', 'browserSetAnnotationMode', 'browserSetBounds', 'browserSetZoom',
  'browserSetVisible', 'chooseAgentFolder', 'chooseCodexBinary', 'chooseSourceFolder',
  'chooseSourceWorktreeDestination', 'getDaemonStatus', 'getOpenInApplications', 'getSystemPermissions',
  'getUpdateStatus', 'installUpdate', 'launchChatGptApp', 'openAccessibilitySettings', 'openAgentPath',
  'openScreenRecordingSettings', 'quit', 'reloadRenderer', 'restartApp', 'setDaemonEnabled', 'setDockBadgeCount',
]);

export async function invokeClawWebOperation(
  backend: ClawBackendPort,
  operation: string,
  args: unknown[],
): Promise<unknown> {
  if (operation === 'updateSettings') {
    const { policy, preferences } = splitSettingsInput(args[0] as UpdateSettingsInput);
    let result: unknown;
    if (Object.keys(policy).length) result = await backend.request(backendMethods.settingsUpdate, { input: policy });
    if (Object.keys(preferences).length) result = await backend.request(backendMethods.clientPreferencesUpdate, { input: preferences });
    return result ?? (await backend.request<ClawSnapshotGetResult>(backendMethods.snapshotGet)).snapshot;
  }
  if (operation === 'checkRemoteConnection') {
    return backend.request(args[1] === true ? backendMethods.connectionsRuntimeInspect : backendMethods.connectionsRuntimeSync, { connectionId: args[0] });
  }
  if (operation === 'createTeam') {
    const input = args[0] as { remoteTeamId?: string };
    return backend.request(input.remoteTeamId ? backendMethods.teamConnect : backendMethods.teamCreate, { input });
  }
  if (operation === 'getSnapshot') {
    return (await backend.request<ClawSnapshotGetResult>(backendMethods.snapshotGet)).snapshot;
  }
  if (operation === 'getSnapshotState') {
    const state = await backend.request<ClawSnapshotGetResult>(backendMethods.snapshotGet);
    return {
      snapshot: state.snapshot,
      lastBackendEventSeq: state.lastEventSeq,
      connection: { status: 'connected' },
    };
  }
  if (operation === 'getAutomationSnapshot') {
    return snapshotForLocation(backend, backendMethods.snapshotAutomationsGet, args[0]);
  }
  if (desktopOnlyOperations.has(operation)) {
    throw new Error(`'${operation}' is not available in Claw Web.`);
  }
  const definition = directOperations[operation];
  if (!definition) throw new Error(`Unknown Claw web operation: ${operation}`);
  return backend.request(definition[0], definition[1]?.(args));
}

async function snapshotForLocation(backend: ClawBackendPort, method: string, location: unknown): Promise<unknown> {
  if (isRecord(location) && location.kind === 'remote') return backend.request(method, { location });
  return (await backend.request<ClawSnapshotGetResult>(backendMethods.snapshotGet)).snapshot;
}

function named(...names: string[]): ParamsFactory {
  return (args) => Object.fromEntries(names.map((name, index) => [name, args[index]]));
}

function namedOptional(...names: string[]): ParamsFactory {
  return (args) => Object.fromEntries(names.flatMap((name, index) => args[index] == null ? [] : [[name, args[index]]]));
}

function optionalNamed(name: string): ParamsFactory {
  return (args) => args[0] == null ? undefined : { [name]: args[0] };
}

function firstArgument(args: unknown[]): unknown {
  return args[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

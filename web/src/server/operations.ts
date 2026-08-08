import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import type { ClawSnapshotGetResult } from '@codex-claw/core/backend-protocol/rpc';

export type ClawBackendPort = {
  request<Result>(method: string, params?: unknown): Promise<Result>;
};

type ParamsFactory = (args: unknown[]) => unknown;

const directOperations: Readonly<Record<string, readonly [string, ParamsFactory?]>> = {
  listSshHosts: [backendMethods.connectionsSshHostsList],
  addSshConnection: [backendMethods.connectionsSshCreate, named('input')],
  checkRemoteConnection: [backendMethods.connectionsSync, named('connectionId')],
  updateRemoteConnection: [backendMethods.connectionsUpdate, named('connectionId', 'input')],
  removeRemoteConnection: [backendMethods.connectionsDelete, named('connectionId')],
  getDevicePairingStatus: [backendMethods.devicePairingStatusGet],
  enableDevicePairing: [backendMethods.devicePairingEnable],
  disableDevicePairing: [backendMethods.devicePairingDisable],
  startDevicePairing: [backendMethods.devicePairingStart],
  checkDevicePairing: [backendMethods.devicePairingStatus, named('session')],
  listPairedDevices: [backendMethods.devicePairingClientsList, named('environmentId')],
  revokePairedDevice: [backendMethods.devicePairingClientRevoke, named('environmentId', 'clientId')],
  connectWorkProvider: [backendMethods.workProviderConnect, named('provider')],
  openWorkProviderAuthorization: [backendMethods.workProviderAuthorizationOpen, named('provider')],
  completeWorkProviderConnection: [backendMethods.workProviderConnectionComplete, named('provider')],
  disconnectWorkProvider: [backendMethods.workProviderDisconnect, named('provider')],
  listWorkRepositories: [backendMethods.workProviderRepositoriesList, namedOptional('provider', 'location')],
  configureWorkBacklog: [backendMethods.workProviderBacklogConfigure, namedOptional('input', 'location')],
  listWorkItems: [backendMethods.workProviderItemsList, namedOptional('provider', 'repositoryId', 'location')],
  listBackendModels: [backendMethods.agentModelsList, named('agentId')],
  listBackendSkills: [backendMethods.agentSkillsList, named('agentId')],
  listAgentFiles: [backendMethods.agentFilesList, named('agentId')],
  previewAgentFile: [backendMethods.agentFilePreview, named('agentId', 'filePath')],
  openAgentGitDiff: [backendMethods.agentGitDiffOpen, named('agentId')],
  listSourceFolders: [backendMethods.sourceFoldersList, firstArgument],
  listSourceRepositories: [backendMethods.sourceRepositoriesList, optionalNamed('remoteConnectionId')],
  listSourceWorktrees: [backendMethods.sourceWorktreesList, namedOptional('repoPath', 'remoteConnectionId')],
  suggestSourceWorktreePath: [backendMethods.sourceWorktreePathSuggest, named('input')],
  createSourceWorktree: [backendMethods.sourceWorktreeCreate, named('input')],
  createTeam: [backendMethods.teamCreate, named('input')],
  updateTeam: [backendMethods.teamUpdate, named('input')],
  reorderTeams: [backendMethods.teamReorder, named('input')],
  closeTeam: [backendMethods.teamDelete, named('teamId')],
  disconnectTeam: [backendMethods.teamDisconnect, named('teamId')],
  selectTeam: [backendMethods.teamSelect, named('teamId')],
  createLoop: [backendMethods.loopCreate, namedOptional('input', 'location')],
  updateLoop: [backendMethods.loopUpdate, namedOptional('input', 'location')],
  runLoop: [backendMethods.loopRun, namedOptional('loopId', 'location')],
  clearLoopHistory: [backendMethods.loopHistoryClear, namedOptional('loopId', 'location')],
  deleteLoopExecution: [backendMethods.loopExecutionDelete, namedOptional('loopId', 'executionId', 'location')],
  deleteLoop: [backendMethods.loopDelete, namedOptional('loopId', 'location')],
  listAgentConversations: [backendMethods.agentConversationsList, named('agentId')],
  resumeAgentConversation: [backendMethods.agentConversationResume, named('agentId', 'ref')],
  readConversationMessages: [backendMethods.agentConversationMessagesGet, namedOptional('ref', 'agentId', 'location')],
  createAgent: [backendMethods.agentCreate, named('input')],
  updateAgent: [backendMethods.agentUpdate, named('input')],
  assignWorkItemToAgent: [backendMethods.agentWorkItemAssign, named('agentId', 'item')],
  removeWorkItemAssignment: [backendMethods.agentWorkItemAssignmentDelete, named('item')],
  duplicateAgent: [backendMethods.agentDuplicate, named('agentId')],
  forkAgent: [backendMethods.agentFork, namedOptional('agentId', 'messageIndex')],
  moveAgentToTeam: [backendMethods.agentTeamMove, named('input')],
  reorderAgents: [backendMethods.agentReorder, named('input')],
  saveAgentToBench: [backendMethods.benchAgentTemplateCreate, named('agentId')],
  deployBenchTemplate: [backendMethods.benchTemplateDeploy, namedOptional('templateId', 'teamId', 'location')],
  removeBenchTemplate: [backendMethods.benchTemplateDelete, namedOptional('templateId', 'location')],
  restartAgent: [backendMethods.agentRestart, named('agentId')],
  hydrateAgentHistory: [backendMethods.agentHistoryHydrate, named('agentId')],
  loadOlderAgentHistory: [backendMethods.agentHistoryLoadOlder, named('agentId')],
  closeAgent: [backendMethods.agentDelete, named('agentId')],
  selectAgent: [backendMethods.agentSelect, named('agentId')],
  updateSettings: [backendMethods.settingsUpdate, named('input')],
  getCodexResourceSharingStatus: [backendMethods.settingsCodexResourceSharingGet],
  setCodexResourceSharing: [backendMethods.settingsCodexResourceSharingSet, named('input')],
  getPluginStatus: [backendMethods.settingsPluginStatusGet],
  getCodexAuthentication: [backendMethods.codexAuthenticationGet],
  cancelCodexChatGptLogin: [backendMethods.codexChatGptLoginCancel],
  startCodexChatGptLogin: [backendMethods.codexChatGptLoginStart],
  logoutCodex: [backendMethods.codexLogout],
  setAgentGoal: [backendMethods.agentGoalUpdate, named('agentId', 'objective')],
  clearAgentGoal: [backendMethods.agentGoalClear, named('agentId')],
  setAgentApprovalPreset: [backendMethods.agentApprovalPresetUpdate, named('agentId', 'preset')],
  sendPrompt: [backendMethods.agentPromptSend, namedOptional('agentId', 'prompt', 'options')],
  steerPrompt: [backendMethods.agentPromptSteer, namedOptional('agentId', 'prompt', 'options')],
  deleteQueuedPrompt: [backendMethods.agentQueuedPromptDelete, named('agentId', 'promptId')],
  steerQueuedPrompt: [backendMethods.agentQueuedPromptSteer, named('agentId', 'promptId')],
  interruptAgent: [backendMethods.agentInterrupt, named('agentId')],
  deleteMessage: [backendMethods.agentMessageDelete, named('agentId', 'messageId')],
  editMessage: [backendMethods.agentMessageUpdate, named('agentId', 'messageId', 'prompt')],
  retryMessage: [backendMethods.agentMessageRetry, named('agentId', 'messageId')],
  respondToClientRequest: [backendMethods.clientRequestRespond, named('response')],
};

const desktopOnlyOperations = new Set([
  'browserClearAnnotations', 'browserClose', 'browserGoBack', 'browserGoForward', 'browserNavigate',
  'browserOpen', 'browserReload', 'browserResolveAnnotation', 'browserSetAnnotationMode', 'browserSetBounds',
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
  if (operation === 'getBenchSnapshot') {
    return snapshotForLocation(backend, backendMethods.snapshotBenchGet, args[0]);
  }
  if (operation === 'getLoopSnapshot') {
    return snapshotForLocation(backend, backendMethods.snapshotLoopsGet, args[0]);
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

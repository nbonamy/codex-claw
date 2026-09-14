import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SurfaceMessageQuestionPart } from '@codex-app-sdk/core/surface';
import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as ContractValues from '../contracts';
import * as ConversationValues from '../contracts/conversation';
import type * as Contracts from '../contracts';
import type * as SharedContracts from '../contracts/shared';
import type * as GitContracts from '../contracts/git';
import type * as WorkspaceContracts from '../contracts/workspace';
import type * as ConnectionContracts from '../contracts/connections';
import type * as BackendContracts from '../contracts/backend';
import type * as ConversationContracts from '../contracts/conversation';
import type * as WorkContracts from '../contracts/work';

const contractModules = {
  shared: {
    path: fileURLToPath(new URL('../contracts/shared.ts', import.meta.url)),
    dependencies: [],
    exports: [
      'AgentBackend',
      'AppText',
      'AppTextDescriptor',
      'ApprovalPreset',
      'ReasoningEffort',
    ],
  },
  git: {
    path: fileURLToPath(new URL('../contracts/git.ts', import.meta.url)),
    dependencies: [],
    exports: [
      'AgentCloseInput',
      'AgentGitBranchInput',
      'AgentGitCommitInput',
      'AgentGitCommitSummary',
      'AgentGitDiff',
      'AgentGitDiffCatalog',
      'AgentGitDiffScope',
      'AgentGitDiffSection',
      'AgentGitDiffSummary',
      'AgentGitDiffTarget',
      'AgentGitFile',
      'AgentGitMergeInput',
      'AgentGitMessageGenerationInput',
      'AgentGitMessageGenerationResult',
      'AgentGitOperationProgress',
      'AgentGitPullRequest',
      'AgentGitPullRequestInput',
      'AgentGitPushInput',
      'AgentGitStageInput',
      'AgentGitStatus',
      'AgentGitWorkflow',
      'AgentPullRequestTracking',
      'TurnGitDiff',
    ],
  },
  workspace: {
    path: fileURLToPath(new URL('../contracts/workspace.ts', import.meta.url)),
    dependencies: [],
    exports: [
      'AgentFilePreviewResult',
      'AgentFileSearchItem',
      'AgentWorkspaceIdentity',
      'CloneSourceRepositoryInput',
      'CreateSourceRepositoryInput',
      'CreateSourceWorktreeInput',
      'SourceBranch',
      'SourceFolderEntry',
      'SourceFolderListInput',
      'SourceFolderListing',
      'SourceFolderState',
      'SourceRepository',
      'SourceWorktree',
    ],
  },
  connections: {
    path: fileURLToPath(new URL('../contracts/connections.ts', import.meta.url)),
    dependencies: [],
    exports: [
      'AddSshConnectionInput',
      'DevicePairingSession',
      'DevicePairingStatus',
      'PairedDevice',
      'RemoteConnection',
      'RemoteConnectionStatus',
      'RemoteConnectionTransport',
      'RemoteConnectionsState',
      'SshHostCandidate',
      'UpdateRemoteConnectionInput',
    ],
  },
  backend: {
    path: fileURLToPath(new URL('../contracts/backend.ts', import.meta.url)),
    dependencies: ['./shared'],
    exports: [
      'AccountRateLimitWindow',
      'AccountRateLimits',
      'BackendCapabilities',
      'BackendCommandSummary',
      'BackendConnectionState',
      'BackendDefaults',
      'BackendModelOption',
      'BackendPermissionModeOption',
      'BackendPlanModeSupport',
      'BackendPluginSummary',
      'BackendReasoningEffortOption',
      'BackendRuntimeStatus',
      'BackendServiceTier',
      'BackendSession',
      'BackendSkillSummary',
      'CodexAccount',
      'CodexApprovalPreset',
      'CodexApprovalsReviewer',
      'CodexAuthentication',
      'CodexChatGptLogin',
      'CodexThreadSettings',
    ],
  },
  conversation: {
    path: fileURLToPath(new URL('../contracts/conversation.ts', import.meta.url)),
    dependencies: ['./shared'],
    exports: [
      'AgentContextUsage',
      'AgentFileActivity',
      'AgentHistoryLoadResult',
      'AgentQueuedPrompt',
      'AgentSubagentTree',
      'AskUserAnswers',
      'AskUserQuestion',
      'AskUserQuestionOption',
      'AskUserRequest',
      'BackendConversationRef',
      'BackendPromptOptions',
      'ClientRequest',
      'ClientRequestResponse',
      'ConfirmToolRequest',
      'ConversationFileLink',
      'ConversationListInput',
      'ConversationResumeTarget',
      'ConversationStorageState',
      'ConversationSummary',
      'PromptAttachment',
      'PromptSkillInput',
      'RendererMessage',
      'RendererMessageAttachment',
      'RendererMessageMedia',
      'RendererMessagePart',
      'RendererPromptAttachment',
      'RendererSendPromptOptions',
      'RendererToolPart',
      'RendererToolPartUpdate',
      'SendPromptOptions',
      'SubagentActivity',
      'SubagentActivityChange',
      'SubagentActivityKind',
      'SubagentIdentityChange',
      'SubagentNode',
      'SubagentOperation',
      'SubagentOperationChange',
      'SubagentOperationKind',
      'SubagentOperationLifecycle',
      'SubagentOperationStatus',
      'SubagentStatus',
      'SubagentStatusChange',
      'ThreadGoal',
      'ThreadGoalStatus',
      'ThreadPlan',
      'ThreadPlanKind',
      'ThreadPlanStatus',
      'ThreadPlanStep',
      'ThreadPlanStepStatus',
      'ToolConfirmationDecision',
      'subagentActivityKinds',
      'subagentOperationKinds',
      'subagentOperationLifecycles',
      'subagentOperationStatuses',
      'subagentStatuses',
    ],
  },
  work: {
    path: fileURLToPath(new URL('../contracts/work.ts', import.meta.url)),
    dependencies: ['./conversation', './shared'],
    exports: [
      'Automation',
      'AutomationExecutionCreatedAgent',
      'AutomationExecutionLogEntry',
      'AutomationExecutionStatus',
      'AutomationLocation',
      'AutomationRepositoryTarget',
      'AutomationSchedule',
      'CreateAutomationInput',
      'GitHubWorkBacklogConfiguration',
      'GitHubWorkBacklogConfigurationInput',
      'GlobalWorkItemQuery',
      'UpdateAutomationInput',
      'WorkBacklogAssignment',
      'WorkBacklogAssignmentPolicy',
      'WorkBacklogAssignmentStatus',
      'WorkBacklogConfigurationInput',
      'WorkBacklogProviderConfigurations',
      'WorkBacklogState',
      'WorkIntegrationConnection',
      'WorkIntegrationStatus',
      'WorkItem',
      'WorkItemKind',
      'WorkItemLabel',
      'WorkItemPage',
      'WorkItemQuery',
      'WorkItemState',
      'WorkProviderAuthorization',
      'WorkProviderKind',
      'WorkProviderSettings',
      'WorkRepository',
    ],
  },
} as const;

function moduleExports(paths: string[]): Map<string, string[]> {
  const program = ts.createProgram({
    rootNames: paths,
    options: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const checker = program.getTypeChecker();
  return new Map(paths.map((path) => {
    const sourceFile = program.getSourceFile(path);
    if (!sourceFile) throw new Error(`Missing contract source: ${path}`);
    const symbol = checker.getSymbolAtLocation(sourceFile);
    if (!symbol) throw new Error(`Missing contract module symbol: ${path}`);
    return [path, checker.getExportsOfModule(symbol).map((entry) => entry.name).sort()];
  }));
}

function domainDependencies(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true);
  return sourceFile.statements.flatMap((statement) => {
    if (
      (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) return [];
    const dependency = statement.moduleSpecifier.text;
    return dependency.startsWith('.') ? [dependency] : [];
  });
}

describe('contract domain ownership', () => {
  it('keeps extracted domain export surfaces exact and barrel-compatible', () => {
    const barrelPath = fileURLToPath(new URL('../contracts.ts', import.meta.url));
    const paths = [barrelPath, ...Object.values(contractModules).map((module) => module.path)];
    const exportsByPath = moduleExports(paths);
    const expectedMovedExports = Object.values(contractModules)
      .flatMap((module) => [...module.exports])
      .sort();

    expect(exportsByPath.get(barrelPath)).toHaveLength(221);
    expect(exportsByPath.get(barrelPath)).toEqual(expect.arrayContaining(expectedMovedExports));
    for (const module of Object.values(contractModules)) {
      expect(exportsByPath.get(module.path)).toEqual([...module.exports].sort());
    }
    expect(exportsByPath.get(contractModules.work.path)).not.toContain('WorkProviderConnectResult');
  });

  it('keeps the extracted domain dependency graph explicit and acyclic', () => {
    for (const module of Object.values(contractModules)) {
      expect(domainDependencies(module.path)).toEqual(module.dependencies);
    }
  });

  it('preserves every moved type through the compatibility barrel', () => {
    expectTypeOf<Contracts.AppTextDescriptor>().toEqualTypeOf<SharedContracts.AppTextDescriptor>();
    expectTypeOf<Contracts.AppText>().toEqualTypeOf<SharedContracts.AppText>();
    expectTypeOf<Contracts.AgentBackend>().toEqualTypeOf<SharedContracts.AgentBackend>();
    expectTypeOf<Contracts.ApprovalPreset>().toEqualTypeOf<SharedContracts.ApprovalPreset>();
    expectTypeOf<Contracts.ReasoningEffort>().toEqualTypeOf<SharedContracts.ReasoningEffort>();

    expectTypeOf<Contracts.AgentGitStatus>().toEqualTypeOf<GitContracts.AgentGitStatus>();
    expectTypeOf<Contracts.AgentGitDiffScope>().toEqualTypeOf<GitContracts.AgentGitDiffScope>();
    expectTypeOf<Contracts.AgentGitDiffSection>().toEqualTypeOf<GitContracts.AgentGitDiffSection>();
    expectTypeOf<Contracts.AgentGitDiff>().toEqualTypeOf<GitContracts.AgentGitDiff>();
    expectTypeOf<Contracts.AgentGitFile>().toEqualTypeOf<GitContracts.AgentGitFile>();
    expectTypeOf<Contracts.AgentGitPullRequest>().toEqualTypeOf<GitContracts.AgentGitPullRequest>();
    expectTypeOf<Contracts.AgentPullRequestTracking>().toEqualTypeOf<GitContracts.AgentPullRequestTracking>();
    expectTypeOf<Contracts.AgentGitWorkflow>().toEqualTypeOf<GitContracts.AgentGitWorkflow>();
    expectTypeOf<Contracts.AgentGitStageInput>().toEqualTypeOf<GitContracts.AgentGitStageInput>();
    expectTypeOf<Contracts.AgentGitCommitInput>().toEqualTypeOf<GitContracts.AgentGitCommitInput>();
    expectTypeOf<Contracts.AgentGitPushInput>().toEqualTypeOf<GitContracts.AgentGitPushInput>();
    expectTypeOf<Contracts.AgentGitBranchInput>().toEqualTypeOf<GitContracts.AgentGitBranchInput>();
    expectTypeOf<Contracts.AgentCloseInput>().toEqualTypeOf<GitContracts.AgentCloseInput>();
    expectTypeOf<Contracts.AgentGitPullRequestInput>().toEqualTypeOf<GitContracts.AgentGitPullRequestInput>();
    expectTypeOf<Contracts.AgentGitMergeInput>().toEqualTypeOf<GitContracts.AgentGitMergeInput>();
    expectTypeOf<Contracts.AgentGitMessageGenerationInput>().toEqualTypeOf<GitContracts.AgentGitMessageGenerationInput>();
    expectTypeOf<Contracts.AgentGitMessageGenerationResult>().toEqualTypeOf<GitContracts.AgentGitMessageGenerationResult>();
    expectTypeOf<Contracts.TurnGitDiff>().toEqualTypeOf<GitContracts.TurnGitDiff>();
    expectTypeOf<Contracts.AgentGitOperationProgress>().toEqualTypeOf<GitContracts.AgentGitOperationProgress>();

    expectTypeOf<Contracts.AgentWorkspaceIdentity>().toEqualTypeOf<WorkspaceContracts.AgentWorkspaceIdentity>();
    expectTypeOf<Contracts.AgentFileSearchItem>().toEqualTypeOf<WorkspaceContracts.AgentFileSearchItem>();
    expectTypeOf<Contracts.AgentFilePreviewResult>().toEqualTypeOf<WorkspaceContracts.AgentFilePreviewResult>();
    expectTypeOf<Contracts.SourceWorktree>().toEqualTypeOf<WorkspaceContracts.SourceWorktree>();
    expectTypeOf<Contracts.SourceBranch>().toEqualTypeOf<WorkspaceContracts.SourceBranch>();
    expectTypeOf<Contracts.SourceRepository>().toEqualTypeOf<WorkspaceContracts.SourceRepository>();
    expectTypeOf<Contracts.CloneSourceRepositoryInput>().toEqualTypeOf<WorkspaceContracts.CloneSourceRepositoryInput>();
    expectTypeOf<Contracts.SourceFolderEntry>().toEqualTypeOf<WorkspaceContracts.SourceFolderEntry>();
    expectTypeOf<Contracts.SourceFolderListing>().toEqualTypeOf<WorkspaceContracts.SourceFolderListing>();
    expectTypeOf<Contracts.SourceFolderListInput>().toEqualTypeOf<WorkspaceContracts.SourceFolderListInput>();
    expectTypeOf<Contracts.SourceFolderState>().toEqualTypeOf<WorkspaceContracts.SourceFolderState>();
    expectTypeOf<Contracts.CreateSourceWorktreeInput>().toEqualTypeOf<WorkspaceContracts.CreateSourceWorktreeInput>();

    expectTypeOf<Contracts.SshHostCandidate>().toEqualTypeOf<ConnectionContracts.SshHostCandidate>();
    expectTypeOf<Contracts.RemoteConnectionStatus>().toEqualTypeOf<ConnectionContracts.RemoteConnectionStatus>();
    expectTypeOf<Contracts.RemoteConnectionTransport>().toEqualTypeOf<ConnectionContracts.RemoteConnectionTransport>();
    expectTypeOf<Contracts.RemoteConnection>().toEqualTypeOf<ConnectionContracts.RemoteConnection>();
    expectTypeOf<Contracts.RemoteConnectionsState>().toEqualTypeOf<ConnectionContracts.RemoteConnectionsState>();
    expectTypeOf<Contracts.DevicePairingStatus>().toEqualTypeOf<ConnectionContracts.DevicePairingStatus>();
    expectTypeOf<Contracts.DevicePairingSession>().toEqualTypeOf<ConnectionContracts.DevicePairingSession>();
    expectTypeOf<Contracts.PairedDevice>().toEqualTypeOf<ConnectionContracts.PairedDevice>();
    expectTypeOf<Contracts.AddSshConnectionInput>().toEqualTypeOf<ConnectionContracts.AddSshConnectionInput>();
    expectTypeOf<Contracts.UpdateRemoteConnectionInput>().toEqualTypeOf<ConnectionContracts.UpdateRemoteConnectionInput>();

    expectTypeOf<Contracts.CodexApprovalPreset>().toEqualTypeOf<BackendContracts.CodexApprovalPreset>();
    expectTypeOf<Contracts.CodexApprovalsReviewer>().toEqualTypeOf<BackendContracts.CodexApprovalsReviewer>();
    expectTypeOf<Contracts.BackendSession>().toEqualTypeOf<BackendContracts.BackendSession>();
    expectTypeOf<Contracts.BackendDefaults>().toEqualTypeOf<BackendContracts.BackendDefaults>();
    expectTypeOf<Contracts.CodexThreadSettings>().toEqualTypeOf<BackendContracts.CodexThreadSettings>();
    expectTypeOf<Contracts.AccountRateLimitWindow>().toEqualTypeOf<BackendContracts.AccountRateLimitWindow>();
    expectTypeOf<Contracts.AccountRateLimits>().toEqualTypeOf<BackendContracts.AccountRateLimits>();
    expectTypeOf<Contracts.BackendPlanModeSupport>().toEqualTypeOf<BackendContracts.BackendPlanModeSupport>();
    expectTypeOf<Contracts.BackendCapabilities>().toEqualTypeOf<BackendContracts.BackendCapabilities>();
    expectTypeOf<Contracts.BackendPermissionModeOption>().toEqualTypeOf<BackendContracts.BackendPermissionModeOption>();
    expectTypeOf<Contracts.CodexAccount>().toEqualTypeOf<BackendContracts.CodexAccount>();
    expectTypeOf<Contracts.CodexAuthentication>().toEqualTypeOf<BackendContracts.CodexAuthentication>();
    expectTypeOf<Contracts.CodexChatGptLogin>().toEqualTypeOf<BackendContracts.CodexChatGptLogin>();
    expectTypeOf<Contracts.BackendReasoningEffortOption>().toEqualTypeOf<BackendContracts.BackendReasoningEffortOption>();
    expectTypeOf<Contracts.BackendServiceTier>().toEqualTypeOf<BackendContracts.BackendServiceTier>();
    expectTypeOf<Contracts.BackendModelOption>().toEqualTypeOf<BackendContracts.BackendModelOption>();
    expectTypeOf<Contracts.BackendSkillSummary>().toEqualTypeOf<BackendContracts.BackendSkillSummary>();
    expectTypeOf<Contracts.BackendPluginSummary>().toEqualTypeOf<BackendContracts.BackendPluginSummary>();
    expectTypeOf<Contracts.BackendCommandSummary>().toEqualTypeOf<BackendContracts.BackendCommandSummary>();
    expectTypeOf<Contracts.BackendRuntimeStatus>().toEqualTypeOf<BackendContracts.BackendRuntimeStatus>();
    expectTypeOf<Contracts.BackendConnectionState>().toEqualTypeOf<BackendContracts.BackendConnectionState>();

    expectTypeOf<Contracts.ThreadGoalStatus>().toEqualTypeOf<ConversationContracts.ThreadGoalStatus>();
    expectTypeOf<Contracts.ThreadGoal>().toEqualTypeOf<ConversationContracts.ThreadGoal>();
    expectTypeOf<Contracts.ThreadPlanStepStatus>().toEqualTypeOf<ConversationContracts.ThreadPlanStepStatus>();
    expectTypeOf<Contracts.ThreadPlanKind>().toEqualTypeOf<ConversationContracts.ThreadPlanKind>();
    expectTypeOf<Contracts.ThreadPlanStatus>().toEqualTypeOf<ConversationContracts.ThreadPlanStatus>();
    expectTypeOf<Contracts.ThreadPlanStep>().toEqualTypeOf<ConversationContracts.ThreadPlanStep>();
    expectTypeOf<Contracts.ThreadPlan>().toEqualTypeOf<ConversationContracts.ThreadPlan>();
    expectTypeOf<Contracts.BackendConversationRef>().toEqualTypeOf<ConversationContracts.BackendConversationRef>();
    expectTypeOf<Contracts.ConversationListInput>().toEqualTypeOf<ConversationContracts.ConversationListInput>();
    expectTypeOf<Contracts.ConversationResumeTarget>().toEqualTypeOf<ConversationContracts.ConversationResumeTarget>();
    expectTypeOf<Contracts.ConversationStorageState>().toEqualTypeOf<ConversationContracts.ConversationStorageState>();
    expectTypeOf<Contracts.ConversationSummary>().toEqualTypeOf<ConversationContracts.ConversationSummary>();
    expectTypeOf<Contracts.SubagentStatus>().toEqualTypeOf<ConversationContracts.SubagentStatus>();
    expectTypeOf<Contracts.SubagentOperationKind>().toEqualTypeOf<ConversationContracts.SubagentOperationKind>();
    expectTypeOf<Contracts.SubagentOperationLifecycle>().toEqualTypeOf<ConversationContracts.SubagentOperationLifecycle>();
    expectTypeOf<Contracts.SubagentOperationStatus>().toEqualTypeOf<ConversationContracts.SubagentOperationStatus>();
    expectTypeOf<Contracts.SubagentActivityKind>().toEqualTypeOf<ConversationContracts.SubagentActivityKind>();
    expectTypeOf<Contracts.SubagentNode>().toEqualTypeOf<ConversationContracts.SubagentNode>();
    expectTypeOf<Contracts.SubagentOperation>().toEqualTypeOf<ConversationContracts.SubagentOperation>();
    expectTypeOf<Contracts.SubagentOperationChange>().toEqualTypeOf<ConversationContracts.SubagentOperationChange>();
    expectTypeOf<Contracts.SubagentActivity>().toEqualTypeOf<ConversationContracts.SubagentActivity>();
    expectTypeOf<Contracts.SubagentActivityChange>().toEqualTypeOf<ConversationContracts.SubagentActivityChange>();
    expectTypeOf<Contracts.SubagentStatusChange>().toEqualTypeOf<ConversationContracts.SubagentStatusChange>();
    expectTypeOf<Contracts.SubagentIdentityChange>().toEqualTypeOf<ConversationContracts.SubagentIdentityChange>();
    expectTypeOf<Contracts.AgentSubagentTree>().toEqualTypeOf<ConversationContracts.AgentSubagentTree>();
    expectTypeOf<Contracts.PromptSkillInput>().toEqualTypeOf<ConversationContracts.PromptSkillInput>();
    expectTypeOf<Contracts.PromptAttachment>().toEqualTypeOf<ConversationContracts.PromptAttachment>();
    expectTypeOf<Contracts.RendererPromptAttachment>().toEqualTypeOf<ConversationContracts.RendererPromptAttachment>();
    expectTypeOf<Contracts.SendPromptOptions>().toEqualTypeOf<ConversationContracts.SendPromptOptions>();
    expectTypeOf<Contracts.RendererSendPromptOptions>().toEqualTypeOf<ConversationContracts.RendererSendPromptOptions>();
    expectTypeOf<Contracts.BackendPromptOptions>().toEqualTypeOf<ConversationContracts.BackendPromptOptions>();
    expectTypeOf<Contracts.RendererMessageAttachment>().toEqualTypeOf<ConversationContracts.RendererMessageAttachment>();
    expectTypeOf<Contracts.RendererMessageMedia>().toEqualTypeOf<ConversationContracts.RendererMessageMedia>();
    expectTypeOf<Contracts.RendererMessagePart>().toEqualTypeOf<ConversationContracts.RendererMessagePart>();
    expectTypeOf<Extract<Contracts.RendererMessagePart, { type: 'question' }>>()
      .toEqualTypeOf<SurfaceMessageQuestionPart>();
    expectTypeOf<Contracts.RendererToolPart>().toEqualTypeOf<ConversationContracts.RendererToolPart>();
    expectTypeOf<Contracts.RendererToolPartUpdate>().toEqualTypeOf<ConversationContracts.RendererToolPartUpdate>();
    expectTypeOf<Contracts.RendererMessage>().toEqualTypeOf<ConversationContracts.RendererMessage>();
    expectTypeOf<Contracts.AgentFileActivity>().toEqualTypeOf<ConversationContracts.AgentFileActivity>();
    expectTypeOf<Contracts.ConversationFileLink>().toEqualTypeOf<ConversationContracts.ConversationFileLink>();
    expectTypeOf<Contracts.AgentQueuedPrompt>().toEqualTypeOf<ConversationContracts.AgentQueuedPrompt>();
    expectTypeOf<Contracts.AgentHistoryLoadResult>().toEqualTypeOf<ConversationContracts.AgentHistoryLoadResult>();

    expectTypeOf<Contracts.WorkProviderKind>().toEqualTypeOf<WorkContracts.WorkProviderKind>();
    expectTypeOf<Contracts.WorkIntegrationStatus>().toEqualTypeOf<WorkContracts.WorkIntegrationStatus>();
    expectTypeOf<Contracts.WorkIntegrationConnection>().toEqualTypeOf<WorkContracts.WorkIntegrationConnection>();
    expectTypeOf<Contracts.WorkProviderSettings>().toEqualTypeOf<WorkContracts.WorkProviderSettings>();
    expectTypeOf<Contracts.WorkBacklogAssignmentPolicy>().toEqualTypeOf<WorkContracts.WorkBacklogAssignmentPolicy>();
    expectTypeOf<Contracts.WorkBacklogAssignmentStatus>().toEqualTypeOf<WorkContracts.WorkBacklogAssignmentStatus>();
    expectTypeOf<Contracts.WorkBacklogAssignment>().toEqualTypeOf<WorkContracts.WorkBacklogAssignment>();
    expectTypeOf<Contracts.GitHubWorkBacklogConfiguration>().toEqualTypeOf<WorkContracts.GitHubWorkBacklogConfiguration>();
    expectTypeOf<Contracts.GitHubWorkBacklogConfigurationInput>().toEqualTypeOf<WorkContracts.GitHubWorkBacklogConfigurationInput>();
    expectTypeOf<Contracts.WorkBacklogProviderConfigurations>().toEqualTypeOf<WorkContracts.WorkBacklogProviderConfigurations>();
    expectTypeOf<Contracts.WorkBacklogConfigurationInput>().toEqualTypeOf<WorkContracts.WorkBacklogConfigurationInput>();
    expectTypeOf<Contracts.WorkBacklogState>().toEqualTypeOf<WorkContracts.WorkBacklogState>();
    expectTypeOf<Contracts.WorkProviderAuthorization>().toEqualTypeOf<WorkContracts.WorkProviderAuthorization>();
    expectTypeOf<Contracts.WorkRepository>().toEqualTypeOf<WorkContracts.WorkRepository>();
    expectTypeOf<Contracts.WorkItemLabel>().toEqualTypeOf<WorkContracts.WorkItemLabel>();
    expectTypeOf<Contracts.WorkItemState>().toEqualTypeOf<WorkContracts.WorkItemState>();
    expectTypeOf<Contracts.WorkItemKind>().toEqualTypeOf<WorkContracts.WorkItemKind>();
    expectTypeOf<Contracts.WorkItemQuery>().toEqualTypeOf<WorkContracts.WorkItemQuery>();
    expectTypeOf<Contracts.GlobalWorkItemQuery>().toEqualTypeOf<WorkContracts.GlobalWorkItemQuery>();
    expectTypeOf<Contracts.WorkItemPage>().toEqualTypeOf<WorkContracts.WorkItemPage>();
    expectTypeOf<Contracts.WorkItem>().toEqualTypeOf<WorkContracts.WorkItem>();
    expectTypeOf<Contracts.AutomationRepositoryTarget>().toEqualTypeOf<WorkContracts.AutomationRepositoryTarget>();
    expectTypeOf<Contracts.AutomationSchedule>().toEqualTypeOf<WorkContracts.AutomationSchedule>();
    expectTypeOf<Contracts.AutomationExecutionStatus>().toEqualTypeOf<WorkContracts.AutomationExecutionStatus>();
    expectTypeOf<Contracts.AutomationExecutionCreatedAgent>().toEqualTypeOf<WorkContracts.AutomationExecutionCreatedAgent>();
    expectTypeOf<Contracts.AutomationExecutionLogEntry>().toEqualTypeOf<WorkContracts.AutomationExecutionLogEntry>();
    expectTypeOf<Contracts.Automation>().toEqualTypeOf<WorkContracts.Automation>();
    expectTypeOf<Contracts.AutomationLocation>().toEqualTypeOf<WorkContracts.AutomationLocation>();
    expectTypeOf<Contracts.CreateAutomationInput>().toEqualTypeOf<WorkContracts.CreateAutomationInput>();
    expectTypeOf<Contracts.UpdateAutomationInput>().toEqualTypeOf<WorkContracts.UpdateAutomationInput>();
  });

  it('preserves conversation runtime constants through the compatibility barrel', () => {
    expect(ContractValues.subagentStatuses).toBe(ConversationValues.subagentStatuses);
    expect(ContractValues.subagentOperationKinds).toBe(ConversationValues.subagentOperationKinds);
    expect(ContractValues.subagentOperationLifecycles).toBe(ConversationValues.subagentOperationLifecycles);
    expect(ContractValues.subagentOperationStatuses).toBe(ConversationValues.subagentOperationStatuses);
    expect(ContractValues.subagentActivityKinds).toBe(ConversationValues.subagentActivityKinds);
  });
});

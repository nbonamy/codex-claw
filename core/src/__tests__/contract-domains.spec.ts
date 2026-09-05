import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type * as Contracts from '../contracts';
import type * as SharedContracts from '../contracts/shared';
import type * as GitContracts from '../contracts/git';
import type * as WorkspaceContracts from '../contracts/workspace';
import type * as ConnectionContracts from '../contracts/connections';

const contractModules = {
  shared: {
    path: fileURLToPath(new URL('../contracts/shared.ts', import.meta.url)),
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
    exports: [
      'AgentCloseInput',
      'AgentGitBranchInput',
      'AgentGitCommitInput',
      'AgentGitDiff',
      'AgentGitDiffScope',
      'AgentGitDiffSection',
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
    exports: [
      'AgentFilePreviewResult',
      'AgentFileSearchItem',
      'AgentWorkspaceIdentity',
      'CloneSourceRepositoryInput',
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
  it('keeps the four leaf domain export surfaces exact and barrel-compatible', () => {
    const barrelPath = fileURLToPath(new URL('../contracts.ts', import.meta.url));
    const paths = [barrelPath, ...Object.values(contractModules).map((module) => module.path)];
    const exportsByPath = moduleExports(paths);
    const expectedMovedExports = Object.values(contractModules)
      .flatMap((module) => [...module.exports])
      .sort();

    expect(exportsByPath.get(barrelPath)).toHaveLength(214);
    expect(exportsByPath.get(barrelPath)).toEqual(expect.arrayContaining(expectedMovedExports));
    for (const module of Object.values(contractModules)) {
      expect(exportsByPath.get(module.path)).toEqual([...module.exports].sort());
    }
  });

  it('keeps the extracted leaf domain graph acyclic', () => {
    for (const module of Object.values(contractModules)) {
      expect(domainDependencies(module.path)).toEqual([]);
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
  });
});

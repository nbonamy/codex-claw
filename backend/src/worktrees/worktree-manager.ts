import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SourceWorktree, WorktreeInitializationMode } from '@codex-claw/core/contracts';
import {
  createGitWorktree,
  type GitWorktreeCreateInput,
} from '../git-worktrees';

const execFileAsync = promisify(execFile);

type WorktreeInitializationSource = 'repository' | 'automatic' | 'none';

export type WorktreeInitializationProgress =
  | { phase: 'detecting' }
  | {
    phase: 'running';
    source: Exclude<WorktreeInitializationSource, 'none'>;
    command: string;
    commandIndex: number;
    commandCount: number;
  }
  | {
    phase: 'complete';
    source: WorktreeInitializationSource;
    commands: string[];
  };

export type PreparedWorktree = {
  worktree: SourceWorktree;
  created: boolean;
  initialization: {
    source: WorktreeInitializationSource;
    commands: string[];
  };
};

export type WorktreeManagerOptions = {
  createGitWorktree?: typeof createGitWorktree;
  getInitializationMode?: () => WorktreeInitializationMode;
  platform?: NodeJS.Platform;
  runCommand?: WorktreeCommandRunner;
};

export type WorktreeCreateOptions = {
  onInitializationProgress?: (progress: WorktreeInitializationProgress) => void;
};

type WorktreeCommand = {
  command: string;
  args: string[];
  display: string;
};

type WorktreeInitializationPlan = {
  source: Exclude<WorktreeInitializationSource, 'none'>;
  commands: WorktreeCommand[];
};

type WorktreeCommandRunner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => Promise<{ stdout?: string; stderr?: string }>;

const defaultCommandRunner: WorktreeCommandRunner = (command, args, options) => execFileAsync(command, args, {
  ...options,
  maxBuffer: 10 * 1024 * 1024,
});

/** Owns the complete create-and-initialize lifecycle for a linked Git worktree. */
export class WorktreeManager {
  private readonly getInitializationMode: () => WorktreeInitializationMode;
  private readonly createGitWorktree: typeof createGitWorktree;
  private readonly platform: NodeJS.Platform;
  private readonly runCommand: WorktreeCommandRunner;

  constructor(options: WorktreeManagerOptions = {}) {
    this.createGitWorktree = options.createGitWorktree ?? createGitWorktree;
    this.getInitializationMode = options.getInitializationMode ?? (() => 'off');
    this.platform = options.platform ?? process.platform;
    this.runCommand = options.runCommand ?? defaultCommandRunner;
  }

  async create(input: GitWorktreeCreateInput, options: WorktreeCreateOptions = {}): Promise<PreparedWorktree> {
    const created = await this.createGitWorktree(input);
    if (!created.created) {
      return {
        ...created,
        initialization: { source: 'none', commands: [] },
      };
    }

    const initialization = await this.initialize(
      input.repoPath,
      created.worktree.path,
      options.onInitializationProgress,
    );
    return { ...created, initialization };
  }

  private async initialize(
    repositoryPath: string,
    worktreePath: string,
    onProgress?: (progress: WorktreeInitializationProgress) => void,
  ): Promise<PreparedWorktree['initialization']> {
    const mode = this.getInitializationMode();
    if (mode === 'off') {
      const initialization = { source: 'none' as const, commands: [] };
      onProgress?.({ phase: 'complete', ...initialization });
      return initialization;
    }

    onProgress?.({ phase: 'detecting' });
    const repositoryPlan = await this.repositoryPlan(worktreePath);
    const plan = repositoryPlan ?? (mode === 'automatic' ? await this.automaticPlan(worktreePath) : null);
    if (!plan) {
      const initialization = { source: 'none' as const, commands: [] };
      onProgress?.({ phase: 'complete', ...initialization });
      return initialization;
    }

    const commands = plan.commands.map((command) => command.display);
    const environment = {
      ...process.env,
      AGENT_WORKTREE_PATH: worktreePath,
      AGENT_WORKTREE_SOURCE_PATH: repositoryPath,
      CI: process.env.CI ?? '1',
    };
    for (const [index, command] of plan.commands.entries()) {
      onProgress?.({
        phase: 'running',
        source: plan.source,
        command: command.display,
        commandIndex: index,
        commandCount: plan.commands.length,
      });
      await this.runCommand(command.command, command.args, { cwd: worktreePath, env: environment });
    }

    const initialization = { source: plan.source, commands };
    onProgress?.({ phase: 'complete', ...initialization });
    return initialization;
  }

  private async repositoryPlan(worktreePath: string): Promise<WorktreeInitializationPlan | null> {
    const setupRoot = path.join(worktreePath, '.agents', 'worktree');
    const platformSetup = this.platform === 'darwin'
      ? 'setup-macos.sh'
      : this.platform === 'linux'
        ? 'setup-linux.sh'
        : this.platform === 'win32'
          ? 'setup-win.ps1'
          : null;
    const setupPath = platformSetup && await exists(path.join(setupRoot, platformSetup))
      ? path.join(setupRoot, platformSetup)
      : await exists(path.join(setupRoot, 'setup'))
        ? path.join(setupRoot, 'setup')
        : null;
    if (!setupPath) return null;

    const contents = await readFile(setupPath, 'utf8');
    if (!contents.trim()) return { source: 'repository', commands: [] };
    const relativePath = path.relative(worktreePath, setupPath);
    return {
      source: 'repository',
      commands: [this.scriptCommand(setupPath, relativePath, contents)],
    };
  }

  private scriptCommand(scriptPath: string, relativePath: string, contents: string): WorktreeCommand {
    if (this.platform === 'win32') {
      const scriptArgs = scriptPath.endsWith('.ps1')
        ? ['-File', scriptPath]
        : ['-Command', contents];
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...scriptArgs],
        display: relativePath,
      };
    }
    return { command: '/bin/sh', args: [scriptPath], display: relativePath };
  }

  private async automaticPlan(worktreePath: string): Promise<WorktreeInitializationPlan | null> {
    const commands = [
      ...await nodeCommands(worktreePath),
      ...await pythonCommands(worktreePath, this.platform),
      ...await goCommands(worktreePath),
    ];
    return commands.length > 0 ? { source: 'automatic', commands } : null;
  }
}

async function nodeCommands(worktreePath: string): Promise<WorktreeCommand[]> {
  const packageJsonPath = path.join(worktreePath, 'package.json');
  if (!await exists(packageJsonPath)) return [];

  const packageManager = await declaredPackageManager(packageJsonPath);
  const pnpmLock = await exists(path.join(worktreePath, 'pnpm-lock.yaml'));
  if (packageManager === 'pnpm' || (!packageManager && pnpmLock)) {
    return [command('pnpm', ['install', ...(pnpmLock ? ['--frozen-lockfile'] : [])])];
  }
  const yarnLock = await exists(path.join(worktreePath, 'yarn.lock'));
  if (packageManager === 'yarn' || (!packageManager && yarnLock)) {
    const immutable = await exists(path.join(worktreePath, '.yarnrc.yml'));
    return [command('yarn', ['install', ...(yarnLock ? [immutable ? '--immutable' : '--frozen-lockfile'] : [])])];
  }
  const bunLock = await exists(path.join(worktreePath, 'bun.lock')) || await exists(path.join(worktreePath, 'bun.lockb'));
  if (packageManager === 'bun' || (!packageManager && bunLock)) {
    return [command('bun', ['install', ...(bunLock ? ['--frozen-lockfile'] : [])])];
  }
  return [await exists(path.join(worktreePath, 'package-lock.json'))
    ? command('npm', ['ci'])
    : command('npm', ['install', '--package-lock=false'])];
}

async function pythonCommands(worktreePath: string, platform: NodeJS.Platform): Promise<WorktreeCommand[]> {
  if (await exists(path.join(worktreePath, 'uv.lock'))) return [command('uv', ['sync'])];
  if (await exists(path.join(worktreePath, 'poetry.lock'))) return [command('poetry', ['install'])];
  if (await exists(path.join(worktreePath, 'Pipfile.lock'))) return [command('pipenv', ['sync'])];
  if (!await exists(path.join(worktreePath, 'requirements.txt'))) return [];

  if (platform === 'win32') {
    return [
      command('py', ['-3', '-m', 'venv', '.venv']),
      command(path.join('.venv', 'Scripts', 'python.exe'), ['-m', 'pip', 'install', '-r', 'requirements.txt']),
    ];
  }
  return [
    command('python3', ['-m', 'venv', '.venv']),
    command(path.join('.venv', 'bin', 'python'), ['-m', 'pip', 'install', '-r', 'requirements.txt']),
  ];
}

async function goCommands(worktreePath: string): Promise<WorktreeCommand[]> {
  return await exists(path.join(worktreePath, 'go.mod')) ? [command('go', ['mod', 'download'])] : [];
}

async function declaredPackageManager(packageJsonPath: string): Promise<'npm' | 'pnpm' | 'yarn' | 'bun' | null> {
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { packageManager?: unknown };
    if (typeof parsed.packageManager !== 'string') return null;
    const name = parsed.packageManager.split('@', 1)[0];
    return name === 'npm' || name === 'pnpm' || name === 'yarn' || name === 'bun' ? name : null;
  } catch {
    return null;
  }
}

function command(executable: string, args: string[]): WorktreeCommand {
  return { command: executable, args, display: [executable, ...args].join(' ') };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

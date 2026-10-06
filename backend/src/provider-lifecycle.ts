import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AgentBackend, AppSnapshot, CodexResourceSharingStatus, SetCodexResourceSharingInput } from '@workspace/core/contracts';
import type { ProviderHomeSettings, ProviderSetupChoice } from '@workspace/core/contracts/provider-setup';
import { withDiscoveredRuntimePath } from '@workspace/core/runtime-discovery';
import { backendHomeDir } from './state';
import { createCodexLifecycle } from './codex/provider-lifecycle';
import { createClaudeLifecycle } from './claude/provider-lifecycle';
import { createAntigravityLifecycle } from './antigravity/provider-lifecycle';

/** Provider-owned lifecycle policy; setup owns serialization and persistence. */
export type ProviderLifecycle = {
  home(snapshot: AppSnapshot, choice?: ProviderSetupChoice): ProviderHomeSettings;
  installed(snapshot: AppSnapshot): boolean;
  prepareHome(home: ProviderHomeSettings, configuring: boolean): Promise<void>;
  applyHome?(home: ProviderHomeSettings): void;
  install(): Promise<void>;
  sharing?: {
    status(home: ProviderHomeSettings): Promise<CodexResourceSharingStatus>;
    set(home: ProviderHomeSettings, input: SetCodexResourceSharingInput): Promise<void>;
  };
};

export function createProviderLifecycles(): ReadonlyMap<AgentBackend, ProviderLifecycle> {
  return new Map([['codex', createCodexLifecycle()], ['claude', createClaudeLifecycle()], ['antigravity', createAntigravityLifecycle()]]);
}

export function providerHomePaths(backend: AgentBackend, configured: string | undefined) {
  const isolated = path.join(backendHomeDir(), `${backend}-home`);
  const candidate = configured ? path.resolve(configured) : null;
  // A launcher can inherit App's private home; that is not the external setup.
  const existing = candidate && candidate !== isolated ? candidate : path.join(homedir(), `.${backend}`);
  return { isolated, existing };
}

export async function installProviderCli(command: string): Promise<void> {
  if (process.platform === 'win32') throw new Error('Install the provider CLI manually on Windows, then retry.');
  await promisify(execFile)('/bin/bash', ['-c', command], {
    env: withDiscoveredRuntimePath(undefined), timeout: 540_000, maxBuffer: 1024 * 1024,
  });
}

import { lstat, mkdir, readlink, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ProviderHomeSettings } from '@codex-claw/core/contracts/provider-setup';
import { resolveRuntimeExecutable } from '@codex-claw/core/runtime-discovery';
import { remoteClaudeInstallCommand } from '../connections/remote-claude-install';
import { installProviderCli, providerHomePaths, type ProviderLifecycle } from '../provider-lifecycle';

export function createClaudeLifecycle(): ProviderLifecycle {
  const configured = process.env.CLAUDE_CONFIG_DIR;
  const paths = providerHomePaths('claude', configured);
  return {
    home(snapshot, choice) {
      if (choice) return { ...choice, homePath: choice.isolated ? paths.isolated : paths.existing };
      const preserve = snapshot.general.claudeCodeEnabled || snapshot.agents.some(agent => agent.backend === 'claude');
      const homePath = preserve ? path.resolve(configured || paths.existing) : paths.isolated;
      return { homePath, isolated: homePath === paths.isolated, shareSkills: !preserve };
    },
    installed: () => Boolean(resolveRuntimeExecutable(process.env.CODEX_CLAW_CLAUDE_COMMAND || 'claude')),
    async prepareHome(home, configuring) {
      const requestedSharing = home.shareSkills;
      await prepareClaudeHome(home, paths.existing);
      if (configuring && requestedSharing && !home.shareSkills) {
        throw new Error('This Claw home already has private skills. They were kept; disable skill sharing to continue.');
      }
    },
    applyHome: home => { process.env.CLAUDE_CONFIG_DIR = home.homePath; },
    install: () => installProviderCli(remoteClaudeInstallCommand()),
  };
}

async function prepareClaudeHome(home: ProviderHomeSettings, existingHome: string): Promise<void> {
    await mkdir(home.homePath, { recursive: true, mode: 0o700 });
    if (!home.isolated) return;
    const source = path.join(existingHome, 'skills');
    const target = path.join(home.homePath, 'skills');
    if (source === target) return;
    const current = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    // Existing private skills belong to the user. Never replace them during onboarding.
    if (current && !current.isSymbolicLink()) { home.shareSkills = false; return; }
    const linked = current ? path.resolve(path.dirname(target), await readlink(target)) : null;
    if (linked && linked !== source) { home.shareSkills = false; return; }
    if (home.shareSkills && !current) await symlink(source, target, 'dir');
    if (!home.shareSkills && linked === source) await unlink(target);
}

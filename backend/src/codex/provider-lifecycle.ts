import { product } from '@workspace/core/product';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { resolveRuntimeExecutable } from '@workspace/core/runtime-discovery';
import { resolveCodexCommand } from './codex-command';
import { backendHomeDir } from '../state';
import { remoteCodexInstallCommand } from '../connections/remote-codex-install';
import { getCodexResourceSharingStatus, initializeCodexResourceSharing, setCodexResourceSharing } from '../codex-resource-sharing';
import { installProviderCli, providerHomePaths, type ProviderLifecycle } from '../provider-lifecycle';

export function createCodexLifecycle(): ProviderLifecycle {
  const paths = providerHomePaths('codex', process.env.CODEX_HOME);
  const resources = (homePath: string) => ({ appCodexHome: homePath, userCodexHome: paths.existing });
  return {
    home: (_snapshot, choice = { isolated: true, shareSkills: true }) => ({
      ...choice, homePath: choice.isolated ? paths.isolated : paths.existing,
    }),
    installed: snapshot => Boolean(resolveRuntimeExecutable(resolveCodexCommand(snapshot.general.codexBinaryPath,
      { bundledPath: process.env.APP_BUNDLED_CODEX_PATH }) || 'codex')),
    async prepareHome(home, configuring) {
      await mkdir(home.homePath, { recursive: true, mode: 0o700 });
      if (!home.isolated) return;
      await initializeCodexResourceSharing(home.shareSkills, resources(home.homePath));
      if (configuring && (await getCodexResourceSharingStatus(home.shareSkills, resources(home.homePath))).migrationRequired) {
        throw new Error(`This ${product.name} home already has private skills or plugins. They were kept; disable sharing to continue.`);
      }
    },
    install: () => installProviderCli(remoteCodexInstallCommand(path.join(backendHomeDir(), 'codex'))),
    sharing: {
      status: home => home.isolated ? getCodexResourceSharingStatus(home.shareSkills, resources(home.homePath))
        : Promise.resolve({ enabled: true, migrationRequired: false }),
      set: (home, input) => setCodexResourceSharing(input, resources(home.homePath)),
    },
  };
}

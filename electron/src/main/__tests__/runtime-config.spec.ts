import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('runtime config', () => {
  it('returns null when no backend command is configured', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: true,
      env: {},
      resourcesPath: '/app/resources',
    })).toBeNull();
  });

  it('reads the backend command and comma-separated args from the environment', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      cwd: process.cwd(),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: ' node ',
        CODEX_CLAW_BACKEND_ARGS: ' dist/clawd.mjs, --stdio ',
      },
    })).toStrictEqual({
      command: 'node',
      args: ['dist/clawd.mjs', '--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
      },
    });
  });

  it('defaults backend args to stdio mode', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      cwd: process.cwd(),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
      },
    });
  });

  it('forwards the GitHub OAuth client ID when Electron starts clawd with one in its environment', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      cwd: process.cwd(),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
        CODEX_CLAW_GITHUB_CLIENT_ID: ' github-client-id ',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        CODEX_CLAW_GITHUB_CLIENT_ID: 'github-client-id',
        HOME: homedir(),
      },
    });
  });

  it('forwards an explicitly configured assets path to clawd', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
      },
    });
  });

  it('forwards an explicitly configured bundled Codex path to local clawd', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
        CODEX_CLAW_BUNDLED_CODEX_PATH: '/app/resources/codex/codex',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_BUNDLED_CODEX_PATH: '/app/resources/codex/codex',
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
      },
    });
  });

  it('starts dev clawd with the moved Electron assets path', () => {
    const devScript = readFileSync(path.resolve(__dirname, '../../../../scripts/dev.mjs'), 'utf8');

    expect(devScript).toContain("CODEX_CLAW_ASSETS_PATH: path.join(rootDir, 'electron', 'assets')");
    expect(devScript).toContain("CODEX_CLAW_BACKEND_MODE: 'bundled'");
    expect(devScript).not.toContain("CODEX_CLAW_ASSETS_PATH: path.join(rootDir, 'assets')");
    expect(devScript).toContain(
      "CODEX_CLAW_BUNDLED_CODEX_PATH: path.join(rootDir, 'electron', 'resources', 'codex', 'codex')",
    );
    expect(devScript).toContain(
      "CODEX_APP_SDK_ASSETS_PATH: path.join(rootDir, 'node_modules', '@codex-app-sdk', 'backend', 'assets')",
    );
  });

  it('routes root and Electron workspace dev commands through the same supervisor', () => {
    const rootPackage = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const electronPackage = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const devScript = readFileSync(path.resolve(__dirname, '../../../../scripts/dev.mjs'), 'utf8');
    const sdkBuildScript = readFileSync(path.resolve(__dirname, '../../../../scripts/build-sdk.mjs'), 'utf8');

    expect(rootPackage.scripts.dev).toBe('npm run dev:electron');
    expect(rootPackage.scripts['build:codex']).toBe('node scripts/prepare-codex-app-server.mjs');
    expect(electronPackage.scripts.dev).toBe('node ../scripts/dev.mjs');
    expect(electronPackage.scripts['build:codex']).toBe('node ../scripts/prepare-codex-app-server.mjs');
    expect(rootPackage.scripts['dev:electron']).toBe('node scripts/dev.mjs');
    expect(rootPackage.scripts['start:electron']).toBe('npm run start -w @codex-claw/electron');
    expect(rootPackage.scripts['build:sdk']).toBe('node scripts/build-sdk.mjs');
    expect(rootPackage.scripts.build).toBe('npm run build:electron');
    expect(rootPackage.scripts['build:electron']).toBe('node scripts/build.mjs');
    expect(rootPackage.scripts['build:backend']).toMatch(/^npm run build:sdk &&/);
    expect(rootPackage.scripts.package).toBe('npm run package:electron');
    expect(rootPackage.scripts['package:electron']).toMatch(/^npm run build:sdk &&/);
    expect(rootPackage.scripts.make).toBe('npm run make:electron');
    expect(rootPackage.scripts['make:electron']).toMatch(/^npm run build:sdk &&/);
    expect(electronPackage.scripts['build:computer-use']).toBe(
      'node ../scripts/prepare-computer-use.mjs',
    );
    expect(electronPackage.scripts['build:computer-use:local']).toBe(
      'node ../scripts/prepare-computer-use.mjs --local',
    );
    expect(electronPackage.scripts['build:tts']).toBe('node ../scripts/prepare-tts-helper.mjs');
    expect(electronPackage.scripts.package).toBe(
      'npm run build:codex && npm run build:computer-use && npm run build:tts && electron-forge package',
    );
    expect(electronPackage.scripts.make).toBe(
      'npm run release-notes:check && npm run build:codex && npm run build:computer-use && npm run build:tts && electron-forge make',
    );
    expect(electronPackage.scripts.build).toContain('npm run build:codex && npm run build:computer-use && npm run build:tts &&');
    expect(devScript).toContain("await run('npm', ['run', 'build:codex'])");
    expect(devScript).toContain("await run('npm', ['run', 'build:computer-use'])");
    expect(devScript).toContain("await run('npm', ['run', 'build:tts'])");
    expect(devScript).toContain("start('npm', ['run', 'start:electron']");
    expect(devScript).not.toContain("['run', 'build:sdk']");
    expect(sdkBuildScript).toContain("specifier.startsWith('file:')");
    expect(sdkBuildScript).toContain("spawnSync(npmCommand, ['run', 'build']");
  });

  it('uses sibling SDK sources for dev while leaving package builds on dist', () => {
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const devScript = readFileSync(path.join(repositoryRoot, 'scripts/dev.mjs'), 'utf8');
    const aliasConfig = readFileSync(path.join(repositoryRoot, 'vite.sdk-aliases.ts'), 'utf8');
    const viteConfigs = [
      'backend/vite.config.ts',
      'electron/vite.main.config.ts',
      'electron/vite.preload.config.ts',
      'electron/vite.renderer.config.ts',
    ].map((filePath) => readFileSync(path.join(repositoryRoot, filePath), 'utf8'));

    expect(devScript).toContain("process.env.CODEX_APP_SDK_SOURCE = '1'");
    expect(aliasConfig).toContain("'@codex-app-sdk/vue': path.join(sdkSourceRoot, 'packages/vue/src/index.ts')");
    expect(aliasConfig).toContain("'@codex-app-sdk/vue/styles.css': path.join(sdkSourceRoot, 'packages/vue/src/styles.css')");
    expect(aliasConfig).toContain("'@codex-app-sdk/core/conversation-replica': path.join(sdkSourceRoot, 'packages/core/src/conversation-replica.ts')");
    for (const viteConfig of viteConfigs) {
      expect(viteConfig).toContain('useSdkSources');
      expect(viteConfig).toContain('sdkSourceAliases');
    }
    expect(viteConfigs[3]).toContain('exclude: Object.keys(sdkSourceAliases)');
    expect(viteConfigs[3]).toContain("dedupe: ['vue']");
  });

  it('pins release Computer Use artifacts and keeps a local development path', () => {
    const releaseConfig = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../computer-use-release.json'), 'utf8'),
    ) as { repository: string; version: string; sha256: string };
    const prepareScript = readFileSync(
      path.resolve(__dirname, '../../../../scripts/prepare-computer-use.mjs'),
      'utf8',
    );

    expect(releaseConfig.repository).toBe('nbonamy/computer-use');
    expect(releaseConfig.version).toBe('2.0.0');
    expect(releaseConfig.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prepareScript).toContain('Computer Use release checksum mismatch');
    expect(prepareScript).toContain("process.env.COMPUTER_USE_LOCAL === '1'");
    expect(prepareScript).toContain('process.argv.includes(\'--local\')');
    expect(prepareScript).toContain('process.argv.includes(\'--release\')');
  });

  it('pins and packages the native neural TTS helper without a system voice fallback', () => {
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const packageManifest = readFileSync(path.join(repositoryRoot, 'native/tts-helper/Package.swift'), 'utf8');
    const resolved = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'native/tts-helper/Package.resolved'), 'utf8'),
    ) as { pins: Array<{ identity: string; state: { revision: string; version: string } }> };
    const helperSource = readFileSync(
      path.join(repositoryRoot, 'native/tts-helper/Sources/CodexClawTTSHelper/App.swift'),
      'utf8',
    );
    const prepareScript = readFileSync(path.join(repositoryRoot, 'scripts/prepare-tts-helper.mjs'), 'utf8');
    const forgeConfig = readFileSync(path.join(repositoryRoot, 'electron/forge.config.ts'), 'utf8');

    expect(packageManifest).toContain('exact: "0.15.5"');
    expect(resolved.pins).toContainEqual(expect.objectContaining({
      identity: 'fluidaudio',
      state: {
        revision: '19600a485baa4998812e4654b70d2bab8f2c9949',
        version: '0.15.5',
      },
    }));
    expect(helperSource).toContain('KokoroAneManager()');
    expect(helperSource).not.toContain('AVSpeechSynthesizer');
    expect(prepareScript).toContain("process.platform !== 'darwin'");
    expect(forgeConfig).toContain("'.tts/codex-claw-tts-helper'");
  });

  it('loads Electron build environment variables from the workspace root', () => {
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const forgeConfig = readFileSync(path.join(repositoryRoot, 'electron/forge.config.ts'), 'utf8');
    const mainViteConfig = readFileSync(path.join(repositoryRoot, 'electron/vite.main.config.ts'), 'utf8');

    for (const config of [forgeConfig, mainViteConfig]) {
      expect(config).toContain("dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true })");
    }
  });

  it('pins and verifies the bundled Codex app-server executable', () => {
    const repositoryRoot = path.resolve(__dirname, '../../../..');
    const releaseConfig = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'codex-app-server-release.json'), 'utf8'),
    ) as { version: string; targets: Array<{ platform: string; arch: string }> };
    const forgeConfig = readFileSync(path.join(repositoryRoot, 'electron/forge.config.ts'), 'utf8');

    expect(releaseConfig.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(releaseConfig.targets).toStrictEqual([
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'linux', arch: 'x64' },
    ]);
    expect(forgeConfig).toContain("'resources/codex'");
    expect(forgeConfig).toContain("process.platform === 'darwin'");
    expect(forgeConfig).toContain('ignore: shouldPreserveUpstreamCodexSignature');
  });

  it('resolves the packaged clawd runtime from resources when no env command is configured', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {
        PATH: '/usr/bin:/Users/nicolas/.nvm/versions/node/v22.19.0/bin',
      },
      execFileSync: vi.fn(() => {
        throw new Error('login shell unavailable');
      }),
      existsSync: (filePath) => filePath === '/app/resources/clawd/clawd.mjs' ||
        filePath === '/app/resources/codex/codex' ||
        filePath === '/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node',
      homedir: () => '/Users/nicolas',
      resourcesPath: '/app/resources',
    })).toStrictEqual({
      command: '/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node',
      args: [
        '/app/resources/clawd/clawd.mjs',
        '--stdio',
      ],
      env: {
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
        CODEX_CLAW_BUNDLED_CODEX_PATH: '/app/resources/codex/codex',
        CODEX_CLAW_HOME: '/Users/nicolas/.codex-claw',
        HOME: '/Users/nicolas',
        PATH: '/usr/bin:/Users/nicolas/.nvm/versions/node/v22.19.0/bin',
      },
    });
  });

  it('converts the runtime command to serve mode for daemon launches', async () => {
    const { runtimeClawdServeCommand } = await import('../runtime-config');

    expect(runtimeClawdServeCommand({
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'node',
        CODEX_CLAW_BACKEND_ARGS: '/app/clawd.mjs,--stdio',
        CODEX_CLAW_HOME: '/Users/nicolas/.codex-claw',
      },
    })).toStrictEqual({
      command: 'node',
      args: ['/app/clawd.mjs', 'serve'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_HOME: '/Users/nicolas/.codex-claw',
        HOME: homedir(),
      },
    });
  });

  it('returns null for packaged apps when node cannot be discovered', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {
        PATH: '/usr/bin',
      },
      execFileSync: vi.fn(() => {
        throw new Error('login shell unavailable');
      }),
      existsSync: (filePath) => filePath === '/app/resources/clawd/clawd.mjs',
      resourcesPath: '/app/resources',
    })).toBeNull();
  });

  it('returns null for packaged apps when the bundled runtime is missing', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {},
      existsSync: () => false,
      resourcesPath: '/app/resources',
    })).toBeNull();
  });

  it('defaults backend mode to auto and accepts explicit bundled or existing modes', async () => {
    const { runtimeClawdBackendMode } = await import('../runtime-config');

    expect(runtimeClawdBackendMode({ env: {} })).toBe('auto');
    expect(runtimeClawdBackendMode({ env: { CODEX_CLAW_BACKEND_MODE: 'bundled' } })).toBe('bundled');
    expect(runtimeClawdBackendMode({ env: { CODEX_CLAW_BACKEND_MODE: 'existing' } })).toBe('existing');
    expect(runtimeClawdBackendMode({ env: { CODEX_CLAW_BACKEND_MODE: 'nope' } })).toBe('auto');
  });

  it('resolves the local clawd socket path from CODEX_CLAW_HOME or an explicit socket override', async () => {
    const { runtimeClawdSocketPath } = await import('../runtime-config');

    expect(runtimeClawdSocketPath({ env: { CODEX_CLAW_HOME: '/tmp/codex-claw' } })).toBe('/tmp/codex-claw/clawd.sock');
    expect(runtimeClawdSocketPath({ env: { CODEX_CLAW_BACKEND_SOCKET: '/tmp/custom.sock' } })).toBe('/tmp/custom.sock');
  });
});

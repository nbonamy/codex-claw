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

  it('starts dev clawd with the moved Electron assets path', () => {
    const devScript = readFileSync(path.resolve(__dirname, '../../../../scripts/dev.mjs'), 'utf8');

    expect(devScript).toContain("CODEX_CLAW_ASSETS_PATH: path.join(rootDir, 'electron', 'assets')");
    expect(devScript).not.toContain("CODEX_CLAW_ASSETS_PATH: path.join(rootDir, 'assets')");
  });

  it('routes root and Electron workspace dev commands through the same supervisor', () => {
    const rootPackage = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const electronPackage = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const devScript = readFileSync(path.resolve(__dirname, '../../../../scripts/dev.mjs'), 'utf8');

    expect(rootPackage.scripts.dev).toBe('node scripts/dev.mjs');
    expect(electronPackage.scripts.dev).toBe('node ../scripts/dev.mjs');
    expect(rootPackage.scripts['dev:electron']).toBe('npm run start -w @codex-claw/electron');
    expect(rootPackage.scripts.build).toBe('node scripts/build.mjs');
    expect(electronPackage.scripts['build:computer-use']).toBe(
      'node ../scripts/prepare-computer-use.mjs',
    );
    expect(electronPackage.scripts['build:computer-use:local']).toBe(
      'node ../scripts/prepare-computer-use.mjs --local',
    );
    expect(electronPackage.scripts.package).toBe('npm run build:computer-use && electron-forge package');
    expect(electronPackage.scripts.make).toBe('npm run build:computer-use && electron-forge make');
    expect(electronPackage.scripts.build).toContain('npm run build:computer-use &&');
    expect(devScript).toContain("await run('npm', ['run', 'build:computer-use'])");
    expect(devScript).toContain("start('npm', ['run', 'dev:electron']");
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
    expect(aliasConfig).toContain("'codex-app-sdk/vue': path.join(sdkSourceRoot, 'vue/index.ts')");
    expect(aliasConfig).toContain("'codex-app-sdk/styles.css': path.join(sdkSourceRoot, 'vue/styles.css')");
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
    expect(releaseConfig.version).toMatch(/^0\.\d+\.\d+$/);
    expect(releaseConfig.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(prepareScript).toContain('Computer Use release checksum mismatch');
    expect(prepareScript).toContain("process.env.COMPUTER_USE_LOCAL === '1'");
    expect(prepareScript).toContain('process.argv.includes(\'--local\')');
    expect(prepareScript).toContain('process.argv.includes(\'--release\')');
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

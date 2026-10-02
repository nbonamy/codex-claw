import { mkdtemp, mkdir, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderSetup } from '../provider-setup';
import { createTestSnapshot, createRemoteAgent } from './server-test-fixtures';
import { ClawBackendServer } from '../server';
import { loadBackendSnapshot, saveBackendSnapshot } from '../state';

const cli = vi.hoisted(() => ({ installed: new Set<string>(), fail: false, installs: 0 }));
vi.mock('@codex-claw/core/runtime-discovery', () => ({
  resolveRuntimeExecutable: (command: string) => cli.installed.has(command) ? command : null,
  withDiscoveredRuntimePath: () => ({}),
}));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFile: Object.assign(() => undefined, {
    [Symbol.for('nodejs.util.promisify.custom')]: async () => {
      cli.installs++;
      if (cli.fail) throw new Error('private installer output');
      cli.installed.add('claude');
      return { stdout: '', stderr: '' };
    },
  }),
}));

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'claw-provider-setup-'));
  vi.stubEnv('CODEX_CLAW_HOME', path.join(root, 'claw'));
  vi.stubEnv('CODEX_HOME', path.join(root, 'codex'));
  vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(root, 'claude'));
  vi.stubEnv('CODEX_CLAW_BUNDLED_CODEX_PATH', '');
  vi.stubEnv('CODEX_CLAW_CLAUDE_COMMAND', '');
  cli.installed.clear(); cli.installs = 0; cli.fail = false;
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });

describe('provider onboarding setup', () => {
  it('uses the registered lifecycle policy for detection, installation, and home configuration', async () => {
    const snapshot = createTestSnapshot();
    let installed = false;
    const prepareHome = vi.fn();
    const applyHome = vi.fn();
    const lifecycle: import('../provider-lifecycle').ProviderLifecycle = {
      home: (_snapshot, choice = { isolated: true, shareSkills: false }) => ({ ...choice, homePath: '/engine-owned/home' }),
      installed: () => installed,
      prepareHome, applyHome,
      install: async () => { installed = true; },
    };
    const reconnect = vi.fn();
    const setup = new ProviderSetup(snapshot, vi.fn(), reconnect, new Map([['claude', lifecycle]]));
    await setup.initialize();
    expect(setup.list()).toEqual([{ backend: 'claude', installed: false, locked: false, homePath: '/engine-owned/home', isolated: true, shareSkills: false }]);
    expect(await setup.install('claude')).toMatchObject({ installed: true });
    const result = await setup.configure('claude', { isolated: false, shareSkills: true });
    expect(result).toMatchObject({ homePath: '/engine-owned/home', isolated: false, shareSkills: true });
    expect(prepareHome).toHaveBeenLastCalledWith(snapshot.general.providerHomes?.claude, true);
    expect(applyHome).toHaveBeenLastCalledWith(snapshot.general.providerHomes?.claude);
    expect(reconnect).toHaveBeenCalledTimes(2);
  });

  it('keeps Customize and Settings sharing consistent across a saved reload', async () => {
    const snapshot = createTestSnapshot();
    const setup = new ProviderSetup(snapshot, () => saveBackendSnapshot(snapshot), vi.fn());
    await setup.initialize();
    await setup.configure('codex', { isolated: true, shareSkills: false });
    const reloaded = await loadBackendSnapshot();
    const restarted = new ProviderSetup(reloaded, vi.fn(), vi.fn());
    await restarted.initialize();
    const server = new ClawBackendServer({ version: 'test', snapshot: reloaded, providerSetup: restarted, saveSnapshot: saveBackendSnapshot });
    try {
      expect(await server.handleMessage({ jsonrpc: '2.0', id: 1, method: 'settings/codexResourceSharing/get' }))
        .toMatchObject({ result: { enabled: false, migrationRequired: false } });
      expect(restarted.list().find(home => home.backend === 'codex')?.shareSkills).toBe(false);
      expect(reloaded.general).not.toHaveProperty('shareCodexSkillsAndPlugins');
      await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 'settings/codexResourceSharing/set', params: { input: { enabled: true } } });
      expect((await loadBackendSnapshot()).general.providerHomes?.codex?.shareSkills).toBe(true);
      expect(await readlink(path.join(root, 'claw/codex-home/skills'))).toBe(path.relative(path.join(root, 'claw/codex-home'), path.join(root, 'codex/skills')));
    } finally { await server.close(); }
  });
  it('persists separate homes and shares skills without copying credentials; reload keeps the choices', async () => {
    const snapshot = createTestSnapshot();
    snapshot.general.providerEnabled = { codex: true, claude: false };
    await mkdir(path.join(root, 'claude/skills'), { recursive: true });
    await writeFile(path.join(root, 'claude/skills/example.md'), 'my skill');
    await writeFile(path.join(root, 'claude/auth.json'), 'private');
    const setup = new ProviderSetup(snapshot, () => saveBackendSnapshot(snapshot), vi.fn());
    await setup.initialize();
    expect(await readFile(path.join(root, 'claw/claude-home/skills/example.md'), 'utf8')).toBe('my skill');
    await expect(readFile(path.join(root, 'claw/claude-home/auth.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    const reloaded = await loadBackendSnapshot();
    expect(reloaded.general.providerEnabled).toEqual({ codex: true, claude: false });
    expect(reloaded.general.providerHomes).toStrictEqual({
      codex: { isolated: true, shareSkills: true, homePath: path.join(root, 'claw/codex-home') },
      claude: { isolated: true, shareSkills: true, homePath: path.join(root, 'claw/claude-home') },
    });
    await setup.configure('claude', { isolated: false, shareSkills: true });
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(path.join(root, 'claude'));
    expect((await loadBackendSnapshot()).general.providerHomes?.claude?.homePath).toBe(path.join(root, 'claude'));
    await setup.configure('claude', { isolated: true, shareSkills: false });
    await expect(readlink(path.join(root, 'claw/claude-home/skills'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path.join(root, 'claude/skills/example.md'), 'utf8')).toBe('my skill');
  });

  it('preserves an existing Claude setup and rejects changing a provider that owns chats', async () => {
    const snapshot = createTestSnapshot();
    snapshot.general.claudeCodeEnabled = true;
    snapshot.agents = [{ ...createRemoteAgent(), backend: 'claude' }];
    const reconnect = vi.fn();
    const setup = new ProviderSetup(snapshot, vi.fn(), reconnect);
    await setup.initialize();
    expect(setup.list().find(item => item.backend === 'claude')).toMatchObject({ isolated: false, homePath: path.join(root, 'claude'), locked: true });
    await expect(setup.configure('claude', { isolated: true, shareSkills: true })).rejects.toThrow('already has chats');
    expect(reconnect).not.toHaveBeenCalled();
  });

  it('never replaces existing private skills', async () => {
    const privateSkills = path.join(root, 'claw/claude-home/skills');
    await mkdir(privateSkills, { recursive: true });
    await writeFile(path.join(privateSkills, 'mine.md'), 'keep');
    const setup = new ProviderSetup(createTestSnapshot(), vi.fn(), vi.fn());
    await setup.initialize();
    expect(await readFile(path.join(privateSkills, 'mine.md'), 'utf8')).toBe('keep');
    expect(setup.list().find(item => item.backend === 'claude')?.shareSkills).toBe(false);
    await expect(setup.configure('claude', { isolated: true, shareSkills: true })).rejects.toThrow('private skills');
    expect(await readFile(path.join(privateSkills, 'mine.md'), 'utf8')).toBe('keep');
  });

  it('restores the persisted home when driver replacement fails and prevents overlapping setup', async () => {
    const snapshot = createTestSnapshot();
    let release!: () => void;
    const reconnect = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }))
      .mockRejectedValueOnce(new Error('driver failed')).mockResolvedValue(undefined);
    const setup = new ProviderSetup(snapshot, () => saveBackendSnapshot(snapshot), reconnect);
    await setup.initialize();
    const changing = setup.configure('claude', { isolated: false, shareSkills: true });
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledOnce());
    await expect(setup.configure('codex', { isolated: false, shareSkills: true })).rejects.toThrow('already in progress');
    release();
    await changing;
    await expect(setup.configure('claude', { isolated: true, shareSkills: false })).rejects.toThrow('driver failed');
    expect(process.env.CLAUDE_CONFIG_DIR).toBe(path.join(root, 'claude'));
    expect((await loadBackendSnapshot()).general.providerHomes?.claude).toStrictEqual({ isolated: false, shareSkills: true, homePath: path.join(root, 'claude') });
  });

  it('detects without installing; explicit RPC installation updates status and redacts failures', async () => {
    const snapshot = createTestSnapshot();
    cli.installed.add('codex');
    const setup = new ProviderSetup(snapshot, vi.fn(), vi.fn());
    await setup.initialize();
    const server = new ClawBackendServer({ version: 'test', snapshot, providerSetup: setup });
    const request = (method: string, params?: unknown) => server.handleMessage({ jsonrpc: '2.0', id: 1, method, params });
    expect(await request('provider/setup/get')).toMatchObject({ result: [expect.objectContaining({ backend: 'codex', installed: true }), expect.objectContaining({ backend: 'claude', installed: false })] });
    expect(cli.installs).toBe(0);
    cli.fail = true;
    await expect(request('provider/install', { backend: 'claude' })).rejects.toThrow('Could not install Claude Code.');
    cli.fail = false;
    expect(await request('provider/install', { backend: 'claude' })).toMatchObject({ result: { backend: 'claude', installed: true } });
    await expect(request('provider/setup/configure', { backend: 'claude', choice: { isolated: 'yes' } })).rejects.toThrow('Invalid provider setup');
    await expect(request('settings/update', { input: { general: { providerHomes: { claude: { homePath: '/arbitrary' } } } } })).rejects.toThrow('provider setup');
  });
});

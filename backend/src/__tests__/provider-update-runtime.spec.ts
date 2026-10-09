import { describe, expect, it, vi } from 'vitest';
import { ProviderUpdateRuntime } from '../provider-update-runtime';

function fixture(resolved: string) {
  const run = vi.fn(async (_file: string, args: string[]) => {
    if (args[0] === '--version') return 'codex-cli 1.0.0';
    if (args[0] === 'root') return '/tools/lib/node_modules';
    if (args[0] === '--prefix') return '/brew';
    if (args[0] === 'info') return JSON.stringify({ casks: [{ token: 'claude-code', version: '1.1.0' }, { token: 'codex', version: '1.2.0' }] });
    return '';
  });
  const fetchText = vi.fn(async () => JSON.stringify({ version: '1.2.0' }));
  const read = vi.fn(async () => JSON.stringify({ name: '@openai/codex' }));
  const runtime = new ProviderUpdateRuntime({ command: backend => backend, claudeHome: () => '/user/.claude' }, {
    home: '/user', platform: 'darwin',
    resolve: command => command === 'npm' ? '/tools/bin/npm' : command === 'brew' ? '/brew/bin/brew' : `/user/.local/bin/${command}`,
    realpath: async file => file.startsWith('/tools/lib/') ? file : resolved,
    run, read, fetchText,
  });
  return { runtime, run, read, fetchText };
}

describe('installed provider updates', () => {
  it('uses the package manager owning the resolved executable and pins the checked target', async () => {
    const f = fixture('/tools/lib/node_modules/@openai/codex/bin/codex.js');
    const installation = await f.runtime.inspect('codex');
    expect(installation).toMatchObject({ method: 'npm', version: '1.0.0', latestVersion: '1.2.0' });
    expect(f.run.mock.calls.some(([, args]) => args[0] === 'install')).toBe(false);
    await f.runtime.upgrade(installation);
    expect(f.run).toHaveBeenLastCalledWith('/tools/bin/npm', ['install', '-g', '@openai/codex@1.2.0'], 300_000, expect.any(Object));
  });

  it('keeps a different npm prefix manual rather than upgrading an unrelated global installation', async () => {
    const f = fixture('/other/lib/node_modules/@openai/codex/bin/codex.js');
    const installation = await f.runtime.inspect('codex');
    expect(installation).toMatchObject({ method: 'manual', command: undefined });
    await expect(f.runtime.upgrade(installation)).rejects.toThrow('Manual');
  });

  it('uses Homebrew availability rather than npm latest and preserves the stable cask', async () => {
    const f = fixture('/brew/Caskroom/claude-code/1.0.0/claude');
    const installation = await f.runtime.inspect('claude');
    expect(installation).toMatchObject({ method: 'homebrew', channel: 'stable', latestVersion: '1.1.0' });
    expect(f.fetchText).not.toHaveBeenCalled();
    await f.runtime.upgrade(installation);
    expect(f.run).toHaveBeenLastCalledWith('/brew/bin/brew', ['upgrade', '--cask', 'claude-code'], 300_000, expect.any(Object));
  });

  it('respects the native Claude release channel and uses its own updater', async () => {
    const f = fixture('/user/.local/share/claude/versions/1.0.0');
    f.read.mockResolvedValue(JSON.stringify({ autoUpdatesChannel: 'stable' }));
    f.fetchText.mockResolvedValue('1.1.0\n');
    const installation = await f.runtime.inspect('claude');
    expect(installation).toMatchObject({ method: 'native', channel: 'stable', latestVersion: '1.1.0' });
    expect(f.fetchText).toHaveBeenCalledWith('https://downloads.claude.ai/claude-code-releases/stable');
    await f.runtime.upgrade(installation);
    expect(f.run).toHaveBeenLastCalledWith('/user/.local/bin/claude', ['update'], 300_000, { CLAUDE_CONFIG_DIR: '/user/.claude' });
  });

  it('does not treat a wrapper as a managed installation', async () => {
    const f = fixture('/user/scripts/codex-wrapper');
    const installation = await f.runtime.inspect('codex');
    expect(installation).toMatchObject({ method: 'manual', command: undefined });
  });

  it('reports registry failures instead of claiming the installed provider is current', async () => {
    const f = fixture('/tools/lib/node_modules/@openai/codex/bin/codex.js');
    f.fetchText.mockRejectedValue(new Error('offline'));
    await expect(f.runtime.inspect('codex')).rejects.toThrow('offline');
  });
});

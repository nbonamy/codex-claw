import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalClaudeAuthentication } from '../authentication';
import { homedir } from 'node:os';
import path from 'node:path';

const cli = vi.hoisted(() => ({ stdout: '', error: null as null | { code: number | string }, calls: vi.fn() }));
vi.mock('node:child_process', () => ({
  execFile: Object.assign(() => undefined, {
    [Symbol.for('nodejs.util.promisify.custom')]: async (command: string, args: string[], options: unknown) => {
      cli.calls(command, args, options);
      if (cli.error) throw Object.assign(new Error('private CLI diagnostic'), cli.error, { stdout: cli.stdout });
      return { stdout: cli.stdout, stderr: 'private account' };
    },
  }),
}));
vi.mock('@codex-claw/core/runtime-discovery', () => ({ withDiscoveredRuntimePath: (env: unknown) => env }));

beforeEach(() => { cli.error = null; cli.calls.mockClear(); });

describe('local Claude authentication', () => {
  it('leaves the default home implicit so Claude can find the normal login', async () => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', path.join(homedir(), '.claude'));
    cli.stdout = JSON.stringify({ loggedIn: true });
    try {
      await expect(getLocalClaudeAuthentication()).resolves.toStrictEqual({ loggedIn: true, configDirectory: null });
      expect(cli.calls.mock.calls[0]![2].env.CLAUDE_CONFIG_DIR).toBeUndefined();
    } finally { vi.unstubAllEnvs(); }
  });

  it.each([true, false])('returns only login state and the configured home, loggedIn=%s', async (loggedIn) => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/tmp/claw-auth-home');
    cli.stdout = JSON.stringify({ loggedIn, email: 'private', accessToken: 'private' });
    if (!loggedIn) cli.error = { code: 1 };
    await expect(getLocalClaudeAuthentication()).resolves.toStrictEqual({ loggedIn, configDirectory: '/tmp/claw-auth-home' });
    expect(cli.calls).toHaveBeenCalledWith(expect.any(String), ['auth', 'status', '--json'], expect.objectContaining({ env: { CLAUDE_CONFIG_DIR: '/tmp/claw-auth-home' } }));
    vi.unstubAllEnvs();
  });

  it.each([
    { metadata: { authMethod: 'claude.ai', email: 'user@example.com', subscriptionType: 'max' }, account: { type: 'subscription', email: 'user@example.com', subscription: 'max' } },
    { metadata: { authMethod: 'claude.ai', email: null, subscriptionType: null }, account: { type: 'subscription' } },
    { metadata: { authMethod: 'api_key', email: 'private' }, account: { type: 'apiKey' } },
  ])('exposes safe account metadata for $metadata.authMethod without credentials or organization details', async ({ metadata, account }) => {
    vi.stubEnv('CLAUDE_CONFIG_DIR', '/tmp/claw-auth-home');
    cli.stdout = JSON.stringify({ loggedIn: true, ...metadata, accessToken: 'secret', orgId: 'private' });
    try {
      await expect(getLocalClaudeAuthentication()).resolves.toStrictEqual({ loggedIn: true, configDirectory: '/tmp/claw-auth-home', account });
    } finally { vi.unstubAllEnvs(); }
  });

  it.each(['invalid json', '{"loggedIn":"yes"}'])('rejects malformed status without exposing raw output', async (output) => {
    cli.stdout = output;
    await expect(getLocalClaudeAuthentication()).rejects.toThrow('invalid authentication status');
  });

  it('reports missing CLI safely instead of treating the connection as signed out', async () => {
    cli.error = { code: 'ENOENT' };
    await expect(getLocalClaudeAuthentication()).rejects.toThrow('Make sure Claude Code is installed');
  });
});

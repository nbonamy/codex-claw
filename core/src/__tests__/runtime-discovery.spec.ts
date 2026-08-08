import { describe, expect, it, vi } from 'vitest';
import {
  discoveredRuntimePath,
  discoveredRuntimePathEntries,
  resolveRuntimeExecutable,
  withDiscoveredRuntimePath,
} from '../runtime-discovery';

describe('runtime discovery', () => {
  it('merges current PATH, login-shell PATH, common user bins, and nvm command bin', () => {
    const execFileSync = vi.fn()
      .mockReturnValueOnce('/usr/local/bin:/usr/bin')
      .mockReturnValueOnce('/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node');
    const existsSync = vi.fn((filePath: string) => [
      '/Users/nicolas/.local/bin',
      '/Users/nicolas/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node',
    ].includes(filePath));

    expect(discoveredRuntimePathEntries({
      env: {
        PATH: '/usr/bin:/bin',
        SHELL: '/bin/zsh',
      },
      execFileSync,
      existsSync,
      homedir: () => '/Users/nicolas',
      pathDelimiter: ':',
      platform: 'darwin',
    })).toStrictEqual([
      '/usr/bin',
      '/bin',
      '/usr/local/bin',
      '/Users/nicolas/.local/bin',
      '/Users/nicolas/bin',
      '/opt/homebrew/bin',
      '/Users/nicolas/.nvm/versions/node/v22.19.0/bin',
    ]);
  });

  it('falls back to nvm files when the nvm shell command is unavailable', () => {
    const execFileSync = vi.fn()
      .mockReturnValueOnce('/usr/bin:/bin')
      .mockImplementationOnce(() => {
        throw new Error('nvm missing');
      });
    const existsSync = vi.fn((filePath: string) => [
      '/Users/nicolas/.nvm/alias/default',
      '/Users/nicolas/.nvm/versions/node',
    ].includes(filePath));
    const readFileSync = vi.fn().mockReturnValue('22');
    const readdirSync = vi.fn().mockReturnValue(['v20.11.1', 'v22.19.0', 'v22.20.0']);

    expect(discoveredRuntimePath({
      env: {
        PATH: '/usr/bin:/bin',
        SHELL: '/bin/zsh',
      },
      execFileSync,
      existsSync,
      homedir: () => '/Users/nicolas',
      pathDelimiter: ':',
      platform: 'darwin',
      readFileSync,
      readdirSync,
    })).toBe('/usr/bin:/bin:/Users/nicolas/.nvm/versions/node/v22.20.0/bin');
  });

  it('resolves executables from the discovered runtime path', () => {
    const existsSync = vi.fn((filePath: string) => filePath === '/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node');

    expect(resolveRuntimeExecutable('node', {
      env: {
        PATH: '/usr/bin:/Users/nicolas/.nvm/versions/node/v22.19.0/bin',
      },
      execFileSync: vi.fn(() => {
        throw new Error('shell unavailable');
      }),
      existsSync,
      homedir: () => '/Users/nicolas',
      pathDelimiter: ':',
      platform: 'darwin',
    })).toBe('/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node');
  });

  it('returns a copy of env with the discovered PATH', () => {
    const env = withDiscoveredRuntimePath({ PATH: '/usr/bin', TEST_FLAG: '1' }, {
      execFileSync: vi.fn(() => '/opt/homebrew/bin:/usr/bin'),
      existsSync: vi.fn(() => false),
      homedir: () => '/Users/nicolas',
      pathDelimiter: ':',
      platform: 'darwin',
    });

    expect(env.TEST_FLAG).toBe('1');
    expect(env.PATH).toBe('/usr/bin:/opt/homebrew/bin');
  });

  it('handles absolute and Windows executable candidates', () => {
    expect(resolveRuntimeExecutable('/opt/bin/node', {
      existsSync: (filePath) => filePath === '/opt/bin/node',
    })).toBe('/opt/bin/node');
    expect(resolveRuntimeExecutable('/missing/node', { existsSync: () => false })).toBeNull();
    expect(resolveRuntimeExecutable('missing', {
      env: { PATH: '/bin' },
      execFileSync: vi.fn(() => ''),
      existsSync: () => false,
      homedir: () => '/home/nicolas',
      pathDelimiter: ':',
      platform: 'linux',
    })).toBeNull();

    const existsSync = vi.fn((filePath: string) => filePath === 'C:\\bin/codex.cmd');
    expect(resolveRuntimeExecutable('codex', {
      env: { PATH: 'C:\\bin', PATHEXT: '.EXE;.CMD' },
      existsSync,
      pathDelimiter: ';',
      platform: 'win32',
    })).toBe('C:\\bin/codex.cmd');
    expect(discoveredRuntimePathEntries({ env: {}, pathDelimiter: ';', platform: 'win32' })).toStrictEqual([]);
  });

  it('handles nushell paths and unusable nvm aliases', () => {
    const execFileSync = vi.fn()
      .mockReturnValueOnce('/nu/bin')
      .mockImplementationOnce(() => { throw new Error('nvm unavailable'); });
    expect(discoveredRuntimePathEntries({
      env: { SHELL: '/opt/nu' },
      execFileSync,
      existsSync: () => false,
      homedir: () => '/home/nicolas',
      pathDelimiter: ':',
      platform: 'linux',
    })).toStrictEqual(['/nu/bin']);
    expect(execFileSync).toHaveBeenNthCalledWith(1, '/opt/nu', ['-l', '-c', 'print $env.PATH'], expect.any(Object));

    expect(discoveredRuntimePathEntries({
      env: { PATH: '/usr/bin' },
      execFileSync: vi.fn(() => { throw new Error('no shell'); }),
      existsSync: (filePath) => filePath.endsWith('/.nvm/alias/default') || filePath.endsWith('/.nvm/versions/node'),
      homedir: () => '/home/nicolas',
      pathDelimiter: ':',
      platform: 'linux',
      readFileSync: () => '',
      readdirSync: () => [],
    })).toStrictEqual(['/usr/bin']);
    expect(discoveredRuntimePathEntries({
      env: { PATH: '/usr/bin' },
      execFileSync: vi.fn(() => { throw new Error('no shell'); }),
      existsSync: (filePath) => filePath.endsWith('/.nvm/alias/default') || filePath.endsWith('/.nvm/versions/node'),
      homedir: () => '/home/nicolas',
      pathDelimiter: ':',
      platform: 'linux',
      readFileSync: () => { throw new Error('unreadable'); },
      readdirSync: () => [],
    })).toStrictEqual(['/usr/bin']);
  });
});

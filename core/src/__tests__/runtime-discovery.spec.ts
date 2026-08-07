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
});

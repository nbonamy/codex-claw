import { describe, expect, it } from 'vitest';
import { canonicalGitRemoteIdentity, repositoryIconKeyForRemote, sanitizeGitRemoteUrl } from '../git-remote';

describe('git remote identity', () => {
  it('removes credentials and non-identity URL parts before persistence', () => {
    expect(sanitizeGitRemoteUrl('https://oauth2:secret@GitHub.com/openai/codex.git?token=secret#main')).toBe(
      'https://github.com/openai/codex.git',
    );
    expect(sanitizeGitRemoteUrl('git@github.com:openai/codex.git')).toBe('github.com:openai/codex.git');
  });

  it('canonicalizes equivalent HTTPS and SSH remotes to one identity', () => {
    expect(canonicalGitRemoteIdentity('https://token@github.com/openai/codex.git')).toBe('github.com/openai/codex');
    expect(canonicalGitRemoteIdentity('git@github.com:openai/codex.git')).toBe('github.com/openai/codex');
    expect(repositoryIconKeyForRemote('ssh://git@github.com/openai/codex.git')).toBe('remote:github.com/openai/codex');
  });

  it('rejects local paths and malformed remotes', () => {
    expect(sanitizeGitRemoteUrl('/src/codex')).toBeUndefined();
    expect(repositoryIconKeyForRemote('/src/codex')).toBeUndefined();
  });
});

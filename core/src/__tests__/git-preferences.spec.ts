import { describe, expect, it } from 'vitest';
import { normalizeGitSettings, resolveGitPreferences } from '../git-preferences';

describe('Git preferences', () => {
  it('normalizes supported preferences and applies one-off, repository, then app precedence without saving choices', () => {
    const settings = normalizeGitSettings({ defaults: { pull: 'merge', update: 'invalid' }, repositories: {
      '/clone/.git': { pull: 'rebase', baseBranch: ' release ', integration: 'ff-only' },
    } });
    expect(resolveGitPreferences(settings, '/clone/.git', { pull: 'ff-only' })).toStrictEqual({ pull: 'ff-only', update: 'merge', integration: 'ff-only', baseBranch: 'release' });
    expect(resolveGitPreferences(settings, '/clone/.git').pull).toBe('rebase');
    expect(resolveGitPreferences(settings, '/another-clone/.git')).toStrictEqual({ pull: 'merge', update: 'merge', integration: 'merge' });
    settings.repositories['/clone/.git'] = {};
    expect(resolveGitPreferences(settings, '/clone/.git')).toStrictEqual(settings.defaults);
  });
});

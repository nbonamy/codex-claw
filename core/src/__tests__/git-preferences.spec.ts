import { describe, expect, it } from 'vitest';
import { normalizeGitSettings } from '../git-preferences';

describe('Git preferences', () => {
  it('validates supported strategies and supplies missing defaults', () => {
    expect(normalizeGitSettings({ pull: 'rebase', update: 'invalid' })).toStrictEqual({ pull: 'rebase', update: 'merge' });
    expect(normalizeGitSettings(undefined)).toStrictEqual({ pull: 'git-config', update: 'merge' });
    expect(normalizeGitSettings({ pull: 'ff-only', update: 'rebase' })).toStrictEqual({ pull: 'ff-only', update: 'rebase' });
  });
});

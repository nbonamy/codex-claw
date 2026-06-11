import { describe, expect, it } from 'vitest';
import { parseBranchStatus, parseChangedFiles, parseNumstat } from '../agent-git-service';

describe('agent git service parsers', () => {
  it('parses branch tracking status', () => {
    expect(parseBranchStatus('## main...origin/main [ahead 2, behind 1]\n M README.md\n')).toStrictEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
    });
  });

  it('parses changed and untracked files from porcelain status', () => {
    expect(parseChangedFiles([
      '## main',
      ' M README.md',
      'A  src/main.ts',
      '?? scratch.md',
    ].join('\n'))).toStrictEqual({
      changedFiles: 3,
      hasUntracked: true,
    });
  });

  it('sums numstat lines and ignores binary changes', () => {
    expect(parseNumstat([
      '10\t2\tREADME.md',
      '-\t-\tassets/icon.png',
      '4\t0\tsrc/main.ts',
    ].join('\n'))).toStrictEqual({
      addedLines: 14,
      removedLines: 2,
    });
  });
});

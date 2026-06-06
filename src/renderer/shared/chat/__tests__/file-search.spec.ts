import { describe, expect, it } from 'vitest';
import { filterFileSearchItems } from '../file-search';

describe('filterFileSearchItems', () => {
  const files = [
    { name: 'README.md', path: 'README.md' },
    { name: 'package.json', path: 'package.json' },
    { name: 'ChatComposer.vue', path: 'src/renderer/components/ChatComposer.vue' },
    { name: 'research.md', path: 'docs/research.md' },
  ];

  it('matches files by name and path with fuzzy ranking', () => {
    expect(filterFileSearchItems(files, 'chat').map((file) => file.path)).toStrictEqual([
      'src/renderer/components/ChatComposer.vue',
    ]);

    expect(filterFileSearchItems(files, 'docsres').map((file) => file.path)).toStrictEqual([
      'docs/research.md',
    ]);
  });

  it('returns a capped unfiltered list for an empty query', () => {
    expect(filterFileSearchItems(files, '', 2)).toStrictEqual(files.slice(0, 2));
  });
});

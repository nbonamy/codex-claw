import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ WebContentsView: class {} }));

import { normalizeBrowserUrl, safePartitionName } from '../browser-pane';

describe('browser pane helpers', () => {
  it('normalizes a bare host into an https URL', () => {
    expect(normalizeBrowserUrl('example.com/docs')).toBe('https://example.com/docs');
    expect(normalizeBrowserUrl('http://localhost:3000')).toBe('http://localhost:3000/');
  });

  it('rejects unsafe protocols and empty addresses', () => {
    expect(() => normalizeBrowserUrl('')).toThrow('Enter a URL');
    expect(() => normalizeBrowserUrl('file:///Users/nicolas/.ssh/id_rsa')).toThrow('Only http and https');
  });

  it('uses a safe, stable profile partition name for each agent', () => {
    expect(safePartitionName('agent:/one')).toBe('agent--one');
    expect(safePartitionName('')).toBe('default');
  });
});

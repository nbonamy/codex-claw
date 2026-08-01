import { describe, expect, it } from 'vitest';
import { applyRendererPlatform, rendererPlatform } from '../renderer-platform';

describe('renderer platform', () => {
  it('detects macOS navigator platform values', () => {
    expect(rendererPlatform('MacIntel')).toBe('macos');
    expect(rendererPlatform('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('macos');
    expect(rendererPlatform('Win32')).toBe('other');
    expect(rendererPlatform('Linux x86_64')).toBe('other');
  });

  it('marks the document root for platform-specific shell composition', () => {
    const root = document.createElement('html');

    applyRendererPlatform(root, 'MacIntel');

    expect(root.dataset.platform).toBe('macos');
  });
});

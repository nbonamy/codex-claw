import { describe, expect, it } from 'vitest';
import {
  claudeBackendCapabilities,
  codexBackendCapabilities,
  defaultBackendCapabilities,
} from '../backend-capabilities';

describe('backend capabilities', () => {
  it('returns the native Codex capability set', () => {
    expect(defaultBackendCapabilities('codex')).toBe(codexBackendCapabilities);
    expect(codexBackendCapabilities).toMatchObject({
      attachments: true,
      planMode: 'native',
      goals: true,
      steerPrompt: true,
      approvals: true,
    });
  });

  it('returns the prompted Claude capability set', () => {
    expect(defaultBackendCapabilities('claude')).toBe(claudeBackendCapabilities);
    expect(claudeBackendCapabilities).toMatchObject({
      attachments: false,
      planMode: 'prompted',
      goals: false,
      steerPrompt: false,
      approvals: false,
    });
  });
});

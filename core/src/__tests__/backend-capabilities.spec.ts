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
      serviceTier: true,
      steerPrompt: true,
      approvals: true,
      conversationFork: true,
    });
  });

  it('returns the prompted Claude capability set', () => {
    expect(defaultBackendCapabilities('claude')).toBe(claudeBackendCapabilities);
    expect(claudeBackendCapabilities).toMatchObject({
      attachments: true,
      planMode: 'prompted',
      goals: false,
      serviceTier: false,
      steerPrompt: false,
      approvals: true,
      conversationFork: false,
      approvalPresets: [],
      permissionModes: [
        expect.objectContaining({ id: 'default', label: 'Default' }),
        expect.objectContaining({ id: 'acceptEdits', label: 'Accept edits' }),
        expect.objectContaining({ id: 'dontAsk', label: "Don't ask" }),
        expect.objectContaining({ id: 'auto', label: 'Auto (experimental)' }),
        expect.objectContaining({ id: 'bypassPermissions', dangerous: true }),
      ],
    });
  });
});

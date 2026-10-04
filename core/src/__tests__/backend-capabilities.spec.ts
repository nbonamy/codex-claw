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
      goals: true,
      serviceTier: false,
      steerPrompt: true,
      approvals: true,
      conversationFork: true,
      approvalPresets: [],
      permissionModes: [
        expect.objectContaining({ id: 'default', label: { key: 'permissions.claude.default.label' } }),
        expect.objectContaining({ id: 'acceptEdits', label: { key: 'permissions.claude.acceptEdits.label' } }),
        expect.objectContaining({ id: 'dontAsk', label: { key: 'permissions.claude.dontAsk.label' } }),
        expect.objectContaining({ id: 'auto', label: { key: 'permissions.claude.auto.label' } }),
        expect.objectContaining({ id: 'bypassPermissions', dangerous: true }),
      ],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { appCommandFromDeepLink, deepLinksFromArgv } from '../deep-links';

describe('Codex Claw deep links', () => {
  it('submits to the active agent by default', () => {
    expect(appCommandFromDeepLink('codex-claw://new?prompt=Profile%20five%20agents')).toStrictEqual({
      type: 'open-agent-composer',
      prompt: 'Profile five agents',
      submit: true,
    });
  });

  it('selects a named agent and decodes its prompt', () => {
    expect(appCommandFromDeepLink('codex-claw://agents/agent-dina?prompt=Run%20the%20benchmark')).toStrictEqual({
      type: 'open-agent-composer',
      agentId: 'agent-dina',
      prompt: 'Run the benchmark',
      submit: true,
    });
    expect(appCommandFromDeepLink('codex-claw://agents/agent-dina')).toStrictEqual({
      type: 'open-agent-composer',
      agentId: 'agent-dina',
    });
  });

  it('supports an explicit draft-only link', () => {
    expect(appCommandFromDeepLink('codex-claw://agents/agent-dina?prompt=Review%20this&submit=false')).toStrictEqual({
      type: 'open-agent-composer',
      agentId: 'agent-dina',
      prompt: 'Review this',
      submit: false,
    });
  });

  it('rejects malformed, unsupported, credentialed, fragmented, and oversized links', () => {
    expect(appCommandFromDeepLink('https://example.com')).toBeNull();
    expect(appCommandFromDeepLink('codex-claw://unknown?prompt=test')).toBeNull();
    expect(appCommandFromDeepLink('codex-claw://user:secret@new?prompt=test')).toBeNull();
    expect(appCommandFromDeepLink('codex-claw://new?prompt=test#fragment')).toBeNull();
    expect(appCommandFromDeepLink('codex-claw://new?prompt=test&submit=maybe')).toBeNull();
    expect(appCommandFromDeepLink(`codex-claw://new?prompt=${'x'.repeat(100_001)}`)).toBeNull();
    expect(appCommandFromDeepLink('codex-claw://new')).toBeNull();
  });

  it('extracts only Claw links from a secondary process argument list', () => {
    expect(deepLinksFromArgv([
      '/Applications/Codex Claw.app',
      '--flag',
      'codex-claw://new?prompt=one',
      'https://example.com',
      'codex-claw://agents/agent-dina?prompt=two',
    ])).toStrictEqual([
      'codex-claw://new?prompt=one',
      'codex-claw://agents/agent-dina?prompt=two',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import { appDeveloperInstructions } from '../agent-prompts';

describe('appDeveloperInstructions', () => {
  it('discovers bundled skills through MCP without injecting their bodies or filesystem paths', () => {
    const agent = createInitialSnapshot().agents[0]!;
    const instructions = appDeveloperInstructions(agent);

    expect(instructions).toContain('read-skill');
    expect(instructions).toContain('korus-inline-html');
    expect(instructions).toContain('korus-visualize');
    expect(instructions).not.toContain('<artifact');
    expect(instructions).not.toContain('korus-computer-use');
    expect(appDeveloperInstructions(agent, { computerUseEnabled: true, chromeEnabled: false })).toContain('korus-computer-use');
  });
});

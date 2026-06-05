import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('renderer theme tokens', () => {
  it('uses id8 renderer tokens without Codex Claw compatibility aliases', () => {
    const variablesCss = readFileSync(join(root, 'styles/variables.css'), 'utf8');
    const themeCss = readFileSync(join(root, 'styles/theme.css'), 'utf8');
    const chatBlock = readFileSync(join(root, 'shared/chat/ChatMessageBlock.vue'), 'utf8');
    const codexClawPrefix = '--' + 'cc-';

    expect(variablesCss).toContain('--color-secondary:');
    expect(variablesCss).not.toContain(codexClawPrefix);
    expect(themeCss).not.toContain(codexClawPrefix);
    expect(chatBlock).toContain('color: var(--color-secondary);');
  });
});

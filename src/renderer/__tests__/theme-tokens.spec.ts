import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('renderer theme tokens', () => {
  it('keeps links on a dedicated semantic token instead of the app accent', () => {
    const themeCss = readFileSync(join(root, 'styles/theme.css'), 'utf8');
    const chatBlock = readFileSync(join(root, 'shared/chat/ChatMessageBlock.vue'), 'utf8');

    expect(themeCss).toContain('--cc-link:');
    expect(themeCss).toContain('--color-link: var(--cc-link);');
    expect(chatBlock).toContain('color: var(--color-link);');
  });
});

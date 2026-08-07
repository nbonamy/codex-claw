import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(baseCss)?.[1] ?? '';
}

describe('shared dialog chrome', () => {
  it('keeps close controls near the outer edge without moving dialog titles', () => {
    expect(rule('.claw-dialog .el-dialog__header')).toContain(
      'padding: var(--space-8) var(--space-8) var(--space-8) var(--space-20);',
    );
  });

  it('gives ordinary dialog bodies consistent padding on every edge', () => {
    expect(rule('.claw-dialog .el-dialog__body')).toContain(
      'padding: var(--space-12);',
    );
    expect(baseCss).not.toContain('.claw-dialog .el-dialog__body:has(form)');
    expect(rule('.claw-form-dialog')).not.toContain('padding:');
  });

  it('rounds the body when a dialog has no footer', () => {
    expect(rule('.claw-dialog .el-dialog__body:last-child')).toContain(
      'border-radius: 0 0 var(--radius-xl) var(--radius-xl);',
    );
  });
});

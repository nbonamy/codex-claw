import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

function rule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(baseCss)?.[1] ?? '';
}

describe('shared dialog chrome', () => {
  it('aligns dialog headers with the shared body and footer gutters', () => {
    expect(rule('.claw-dialog .el-dialog__header')).toContain(
      'padding: var(--space-8) var(--space-12) var(--space-4);',
    );
  });

  it('lets dialog content sit beneath the header with the shared horizontal gutter', () => {
    expect(rule('.claw-dialog .el-dialog__body')).toContain(
      'padding: 0 var(--space-12) var(--space-8);',
    );
    expect(baseCss).not.toContain('.claw-dialog .el-dialog__body:has(form)');
    expect(rule('.claw-form-dialog')).not.toContain('padding:');
  });

  it('offers compact dialog chrome without changing the default gutters', () => {
    expect(rule('.claw-dialog--compact.el-dialog')).toContain('padding: 0;');
    expect(rule('.claw-dialog--compact .el-dialog__body')).toContain('padding: 0;');
    expect(rule('.claw-dialog .el-dialog__body')).toContain(
      'padding: 0 var(--space-12) var(--space-8);',
    );
  });

  it('rounds the body when a dialog has no footer', () => {
    expect(rule('.claw-dialog .el-dialog__body:last-child')).toContain(
      'border-radius: 0 0 var(--radius-xl) var(--radius-xl);',
    );
  });
});

import { product } from '@workspace/core/product';
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundledCodexVersion } from '@workspace/core/codex-release';
import { remoteCodexInstallCommand } from '../remote-codex-install';

const temporaryRoots: string[] = [];
afterEach(() => { for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe(`${product.name}-owned remote Codex installation`, () => {
  function fixture(checksumValid: boolean) {
    const root = mkdtempSync(path.join(tmpdir(), 'app-runtime-test-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'source');
    mkdirSync(path.join(source, 'bin'), { recursive: true });
    writeFileSync(path.join(source, 'bin/codex'), `#!/bin/sh\necho codex-cli ${bundledCodexVersion}\n`, { mode: 0o755 });
    writeFileSync(path.join(source, 'bin/codex-code-mode-host'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    execFileSync('tar', ['-czf', path.join(root, 'archive'), '-C', source, '.']);
    const digest = createHash('sha256').update(readFileSync(path.join(root, 'archive'))).digest('hex');
    writeFileSync(path.join(root, 'sums'), `${checksumValid ? digest : 'bad'}  codex-package-x86_64-unknown-linux-musl.tar.gz\n`);
    const mocks = `
uname() { if [ "$1" = '-s' ]; then echo Linux; else echo x86_64; fi; }
curl() {
  case "$*" in *SHA256SUMS*) source_file='${root}/sums';; *) source_file='${root}/archive';; esac
  for last_arg do :; done
  cp "$source_file" "$last_arg"
}
`;
    const command = mocks + remoteCodexInstallCommand().replace(`$HOME/${product.homeDirectory}/codex`, `${root}/managed`);
    return { root, command, binary: path.join(root, 'managed', bundledCodexVersion, 'bin/codex') };
  }

  it('installs the pinned verified package and skips download when already installed', () => {
    const { command, binary } = fixture(true);
    execFileSync('sh', ['-c', command]);
    expect(execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim()).toBe(`codex-cli ${bundledCodexVersion}`);
    execFileSync('sh', ['-c', command.replace('curl() {', 'curl() { exit 99;')]);
  });

  it('rejects a corrupt download without installing its executable', () => {
    const { command, binary } = fixture(false);
    expect(() => execFileSync('sh', ['-c', command], { stdio: 'pipe' })).toThrow();
    expect(() => readFileSync(binary)).toThrow();
  });
});

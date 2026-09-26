import { spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { remoteClaudeInstallCommand } from '../remote-claude-install';

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

it('installs Claude into the remote user home when the CLI is missing', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'claw-remote-claude-'));
  temporaryHomes.push(home);
  const fakeBin = path.join(home, 'fake-bin');
  await mkdir(fakeBin);
  const installer = path.join(home, 'installer.sh');
  await writeFile(installer, `#!/bin/sh
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/claude" <<'CLAUDE'
#!/bin/sh
printf '2.1.283 (Claude Code)\\n'
CLAUDE
chmod +x "$HOME/.local/bin/claude"
`);
  const curl = path.join(fakeBin, 'curl');
  await writeFile(curl, `#!/bin/sh
for arg in "$@"; do output="$arg"; done
cp "$FAKE_INSTALLER" "$output"
`);
  await chmod(curl, 0o755);

  const result = spawnSync('sh', ['-c', remoteClaudeInstallCommand()], {
    encoding: 'utf8',
    env: {
      HOME: home,
      PATH: `${fakeBin}${path.delimiter}/usr/bin${path.delimiter}/bin`,
      FAKE_INSTALLER: installer,
    },
  });

  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('2.1.283 (Claude Code)');
  expect(await readFile(path.join(home, '.local/bin/claude'), 'utf8')).toContain('Claude Code');
});

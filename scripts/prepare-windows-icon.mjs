import { execFileSync } from 'node:child_process';
import path from 'node:path';

if (process.platform === 'win32') {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(import.meta.dirname, 'prepare-windows-icon.ps1')], { stdio: 'inherit' });
}

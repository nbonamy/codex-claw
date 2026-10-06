import { cursorTo, moveCursor, clearScreenDown } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';

function clean(text) {
  return stripVTControlCharacters(String(text)).replace(/[\x00-\x1f\x7f]/g, ' ');
}

function elapsed(start, end, now) {
  const from = Date.parse(start);
  if (!Number.isFinite(from)) return '';
  const seconds = Math.max(0, Math.floor(((Date.parse(end) || now) - from) / 1000));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

// Only presentation lives here; run identity and success gates remain in the CLI.
export function createReleaseProgress(output = process.stdout, jobNames) {
  const interactive = Boolean(output.isTTY && process.env.TERM !== 'dumb');
  let previousRows = 0;
  let previousKey = '';
  let lastWrite = 0;
  let frame = 0;
  return (title, run, jobs, now = Date.now()) => {
    const key = JSON.stringify([run.status, run.conclusion, jobs.map(job =>
      [job.name, job.status, job.conclusion, job.steps?.map(step => [step.name, step.status, step.conclusion])])]);
    if (!interactive && key === previousKey && now - lastWrite < 30_000) return;
    previousKey = key;
    lastWrite = now;
    const duration = elapsed(run.run_started_at, run.status === 'completed' ? run.updated_at : null, now);
    const rows = [
      [`${title} · ${run.conclusion || run.status}${duration ? ` · elapsed ${duration}` : ''}`, 36],
      [run.html_url, 90],
    ];
    for (const name of jobNames ?? jobs.map(job => job.name)) {
      const job = jobs.find(candidate => candidate.name === name);
      const status = job?.conclusion || job?.status || (run.status === 'completed' ? 'not run' : 'waiting');
      const active = status === 'in_progress';
      const failed = ['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure'].includes(status);
      const marker = status === 'success' ? '✓' : failed ? '✗' : active ? ['⠋', '⠙', '⠹', '⠸'][frame % 4] : '·';
      const color = status === 'success' ? 32 : failed ? 31 : active ? 36 : 90;
      const steps = job?.steps ?? [];
      const step = steps.find(item => item.conclusion === 'failure' || item.conclusion === 'timed_out')
        ?? steps.find(item => item.status === 'in_progress');
      const count = steps.length ? `${steps.filter(item => item.status === 'completed').length}/${steps.length} steps` : '';
      const duration = elapsed(job?.started_at, job?.completed_at, now);
      const stepName = step?.name.replace(/^Run /, '').replace(/^npm run /, '');
      const detail = [stepName, duration, count].filter(Boolean).join(' · ');
      rows.push([`${marker} ${name.padEnd(22)} ${status === 'failure' ? 'failed' : active ? 'running' : status}${detail ? ` · ${detail}` : ''}`, color]);
    }
    if (interactive && previousRows) {
      moveCursor(output, 0, -previousRows);
      cursorTo(output, 0);
      clearScreenDown(output);
    }
    const visible = interactive ? rows.slice(0, Math.max(1, (output.rows || 24) - 1)) : rows;
    const rendered = visible.map(([text, color]) => {
      const line = clean(text);
      const width = Math.max(1, (output.columns || 100) - 1);
      const clipped = interactive && line.length > width ? line.slice(0, width - 1) + '…' : line;
      return interactive && !process.env.NO_COLOR ? `\x1b[${color}m${clipped}\x1b[0m` : clipped;
    });
    output.write(rendered.join('\n') + '\n');
    previousRows = visible.length;
    frame++;
  };
}

export function failureExcerpt(log) {
  const lines = log.split(/\r?\n/).map(line => clean(line
    .replace(/^[^\t]*\t[^\t]*\t/, '')
    .replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '')));
  // Expected-error tests can log "Error:" before the real failure summary.
  const match = [/Failed Tests|\bFAIL\s/, /##\[error\]/, /\b(?:AssertionError|Error):|\b(?:fatal|error)[: ]/i]
    .map(pattern => lines.findIndex(line => pattern.test(line))).find(index => index >= 0) ?? -1;
  const start = match < 0 ? Math.max(0, lines.length - 25) : Math.max(0, match - 2);
  return lines.slice(start, start + 35).map(line => line.length > 500 ? line.slice(0, 499) + '…' : line).join('\n');
}

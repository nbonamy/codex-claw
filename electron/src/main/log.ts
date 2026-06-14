export function logMain(area: string, message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const suffix = details ? ` ${safeJson(details)}` : '';
  console.info(`[codex-claw:${area}] ${message}${suffix}`);
}

export function warnMain(area: string, message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const suffix = details ? ` ${safeJson(details)}` : '';
  console.warn(`[codex-claw:${area}] ${message}${suffix}`.replaceAll(/[ ]+/g, ' '));
}

function safeJson(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details);
  } catch {
    return JSON.stringify({ detail: 'unserializable' });
  }
}

export function logMain(area: string, message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const suffix = details ? ` ${safeJson(details)}` : '';
  console.error(`[clawd:${area}] ${message}${suffix}`);
}

export function warnMain(area: string, message: string, details?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const suffix = details ? ` ${safeJson(details)}` : '';
  console.warn(`[clawd:${area}] ${message}${suffix}`);
}

function safeJson(details: Record<string, unknown>): string {
  try {
    return JSON.stringify(details);
  } catch {
    return JSON.stringify({ detail: 'unserializable' });
  }
}

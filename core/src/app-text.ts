import type { AppText, AppTextDescriptor } from './contracts';

export function isAppTextDescriptor(value: unknown): value is AppTextDescriptor {
  if (!isRecord(value) || typeof value.key !== 'string') return false;
  if (value.params === undefined) return true;
  if (!isRecord(value.params)) return false;
  return Object.values(value.params).every((param) => typeof param === 'string' || typeof param === 'number');
}

export function appText(value: unknown): AppText | undefined {
  if (typeof value === 'string') return value;
  return isAppTextDescriptor(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { StoreFormatError } from './store-format';

export type Migration<From = unknown, To = unknown> = {
  readonly from: number;
  readonly to: number;
  up(value: From): To;
};

/**
 * Applies contiguous steps until `target`. A step is written against the frozen
 * shape of its own version, never against the live contracts.
 */
export function migrateData(file: string, data: unknown, version: number, target: number, steps: readonly Migration[]): unknown {
  let current = data;
  let at = version;
  while (at < target) {
    const step = steps.find((candidate) => candidate.from === at);
    if (!step || step.to !== at + 1) {
      throw new StoreFormatError(`${file}: no migration from schema ${at} to ${at + 1}.`);
    }
    current = step.up(current);
    at = step.to;
  }
  return current;
}

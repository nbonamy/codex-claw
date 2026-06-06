export type IdGenerator = () => string;

export function createEntityId(prefix: string): string {
  return `${prefix}-${randomId()}`;
}

export function createUniqueEntityId(prefix: string, existingIds: Iterable<string>, createId: IdGenerator = () => createEntityId(prefix)): string {
  const existing = new Set(existingIds);
  let id = createId();
  while (existing.has(id)) {
    id = createId();
  }
  return id;
}

function randomId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

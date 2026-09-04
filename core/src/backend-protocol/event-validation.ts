export type EventValueValidator = (value: unknown, path: string) => void;

export function failEventValidation(path: string, reason: string): never {
  throw new Error(`Invalid Claw backend event at ${path}: ${reason}.`);
}

export function expectRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failEventValidation(path, 'expected an object');
  }
}

export function expectString(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== 'string') failEventValidation(path, 'expected a string');
}

export function expectNumber(
  value: unknown,
  path: string,
): asserts value is number {
  if (typeof value !== 'number') failEventValidation(path, 'expected a number');
}

export function expectBoolean(
  value: unknown,
  path: string,
): asserts value is boolean {
  if (typeof value !== 'boolean')
    failEventValidation(path, 'expected a boolean');
}

export function expectLiteral<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): asserts value is Value {
  if (typeof value !== 'string' || !allowed.includes(value as Value)) {
    failEventValidation(path, 'expected a supported string value');
  }
}

export function expectNullable(
  value: unknown,
  path: string,
  validator: EventValueValidator,
): void {
  if (value !== null) validator(value, path);
}

export function expectOptional(
  record: Record<string, unknown>,
  key: string,
  path: string,
  validator: EventValueValidator,
): void {
  if (record[key] !== undefined) validator(record[key], `${path}.${key}`);
}

export function expectArray(
  value: unknown,
  path: string,
  validator: EventValueValidator,
): void {
  if (!Array.isArray(value)) failEventValidation(path, 'expected an array');
  value.forEach((item, index) => validator(item, `${path}[${index}]`));
}

export function expectStringArray(value: unknown, path: string): void {
  expectArray(value, path, expectString);
}

export function expectKnownShape(
  value: unknown,
  path: string,
  guard: (candidate: unknown) => boolean,
  description: string,
): void {
  if (!guard(value)) failEventValidation(path, `expected ${description}`);
}

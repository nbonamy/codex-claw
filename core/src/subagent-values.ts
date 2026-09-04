import {
  subagentActivityKinds,
  subagentOperationKinds,
  subagentOperationLifecycles,
  subagentOperationStatuses,
  subagentStatuses,
  type SubagentActivityKind,
  type SubagentOperationKind,
  type SubagentOperationLifecycle,
  type SubagentOperationStatus,
  type SubagentStatus,
} from './contracts';

export function isSubagentStatus(value: unknown): value is SubagentStatus {
  return includesString(subagentStatuses, value);
}

export function isSubagentOperationKind(value: unknown): value is SubagentOperationKind {
  return includesString(subagentOperationKinds, value);
}

export function isSubagentOperationLifecycle(value: unknown): value is SubagentOperationLifecycle {
  return includesString(subagentOperationLifecycles, value);
}

export function isSubagentOperationStatus(value: unknown): value is SubagentOperationStatus {
  return includesString(subagentOperationStatuses, value);
}

export function isSubagentActivityKind(value: unknown): value is SubagentActivityKind {
  return includesString(subagentActivityKinds, value);
}

function includesString<Values extends readonly string[]>(values: Values, value: unknown): value is Values[number] {
  return typeof value === 'string' && values.includes(value);
}

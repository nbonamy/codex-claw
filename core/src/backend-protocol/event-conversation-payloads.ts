import { isAgentGitStatus } from '../snapshot-guard-collections';
import {
  expectArray,
  expectBoolean,
  expectKnownShape,
  expectLiteral,
  expectNullable,
  expectNumber,
  expectOptional,
  expectRecord,
  expectString,
  expectStringArray,
  type EventValueValidator,
} from './event-validation';

function expectPromptAttachment(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(value.type, ['image', 'file'], `${path}.type`);
  expectString(value.path, `${path}.path`);
  ['name', 'mimeType'].forEach((key) =>
    expectOptional(value, key, path, expectString),
  );
  if (value.type === 'image') {
    expectOptional(value, 'detail', path, (candidate, candidatePath) => {
      expectLiteral(
        candidate,
        ['auto', 'low', 'high', 'original'],
        candidatePath,
      );
    });
    expectOptional(value, 'previewUrl', path, expectString);
  }
}

function expectPromptSkill(value: unknown, path: string): void {
  expectRecord(value, path);
  expectString(value.name, `${path}.name`);
  expectString(value.path, `${path}.path`);
}

function expectSendPromptOptions(value: unknown, path: string): void {
  expectRecord(value, path);
  expectOptional(value, 'attachments', path, (candidate, candidatePath) =>
    expectArray(candidate, candidatePath, expectPromptAttachment),
  );
  ['model', 'reasoningEffort', 'serviceTier'].forEach((key) => {
    expectOptional(value, key, path, (candidate, candidatePath) =>
      expectNullable(candidate, candidatePath, expectString),
    );
  });
  expectOptional(value, 'planMode', path, expectBoolean);
  expectOptional(value, 'skills', path, (candidate, candidatePath) =>
    expectArray(candidate, candidatePath, expectPromptSkill),
  );
  expectOptional(value, 'inputMethod', path, (candidate, candidatePath) =>
    expectLiteral(candidate, ['typed', 'dictated'], candidatePath),
  );
  expectOptional(value, 'recordUserMessage', path, expectBoolean);
  expectOptional(value, 'backendOptions', path, (candidate, candidatePath) => {
    expectRecord(candidate, candidatePath);
    expectLiteral(candidate.kind, ['codex', 'claude'], `${candidatePath}.kind`);
    if (candidate.kind === 'codex') {
      ['reasoningEffort', 'serviceTier'].forEach((key) => {
        expectOptional(candidate, key, candidatePath, (item, itemPath) =>
          expectNullable(item, itemPath, expectString),
        );
      });
      expectOptional(candidate, 'skills', candidatePath, (item, itemPath) =>
        expectArray(item, itemPath, expectPromptSkill),
      );
      return;
    }
    expectOptional(
      candidate,
      'thinkingBudgetTokens',
      candidatePath,
      (item, itemPath) => expectNullable(item, itemPath, expectNumber),
    );
    expectOptional(
      candidate,
      'permissionMode',
      candidatePath,
      (item, itemPath) => expectNullable(item, itemPath, expectString),
    );
  });
}

function expectBackendApproval(value: unknown, path: string): void {
  expectRecord(value, path);
  ['id', 'conversationId', 'itemId', 'title'].forEach((key) =>
    expectString(value[key], `${path}.${key}`),
  );
  expectLiteral(
    value.kind,
    ['command', 'file-change', 'permissions'],
    `${path}.kind`,
  );
  ['turnId', 'description', 'command', 'cwd'].forEach((key) =>
    expectOptional(value, key, path, expectString),
  );
  expectOptional(
    value,
    'requestedPermissions',
    path,
    (candidate, candidatePath) => {
      expectArray(candidate, candidatePath, (permission, permissionPath) => {
        expectRecord(permission, permissionPath);
        expectLiteral(
          permission.kind,
          ['filesystem', 'network'],
          `${permissionPath}.kind`,
        );
        if (permission.kind === 'filesystem') {
          expectLiteral(
            permission.access,
            ['read', 'write', 'deny'],
            `${permissionPath}.access`,
          );
          expectString(permission.path, `${permissionPath}.path`);
          return;
        }
        expectBoolean(permission.enabled, `${permissionPath}.enabled`);
        ['host', 'protocol'].forEach((key) =>
          expectOptional(permission, key, permissionPath, expectString),
        );
      });
    },
  );
  expectOptional(value, 'allowedScopes', path, (candidate, candidatePath) => {
    expectArray(candidate, candidatePath, (scope, scopePath) =>
      expectLiteral(scope, ['once', 'session'], scopePath),
    );
  });
  expectOptional(value, 'canDeny', path, expectBoolean);
}

function expectGitDiff(value: unknown, path: string): void {
  expectRecord(value, path);
  expectNumber(value.addedLines, `${path}.addedLines`);
  expectNumber(value.removedLines, `${path}.removedLines`);
  expectOptional(value, 'diff', path, expectString);
}

function expectFileActivity(value: unknown, path: string): void {
  expectRecord(value, path);
  ['messageId', 'itemId', 'path'].forEach((key) =>
    expectString(value[key], `${path}.${key}`),
  );
  expectLiteral(value.action, ['read', 'edit', 'create'], `${path}.action`);
  expectLiteral(
    value.status,
    ['running', 'completed', 'failed'],
    `${path}.status`,
  );
}

export const conversationPayloadValidators = {
  'agent.promptQueued': (value, path) => {
    expectRecord(value, path);
    ['id', 'text'].forEach((key) => expectString(value[key], `${path}.${key}`));
    expectOptional(value, 'options', path, expectSendPromptOptions);
    expectOptional(value, 'submitted', path, expectBoolean);
  },
  'agent.promptRetryScheduled': (value, path) => {
    expectRecord(value, path);
    ['id', 'lastError'].forEach((key) =>
      expectString(value[key], `${path}.${key}`),
    );
    expectNumber(value.attempts, `${path}.attempts`);
    expectOptional(value, 'retryAt', path, expectString);
  },
  'agent.promptDequeued': (value, path) => {
    expectRecord(value, path);
    expectStringArray(value.ids, `${path}.ids`);
  },
  'diff.updated': expectGitDiff,
  'file.activity': expectFileActivity,
  'git.statusUpdated': (value, path) =>
    expectKnownShape(value, path, isAgentGitStatus, 'agent git status'),
  'backendApproval.requested': (value, path) => {
    expectRecord(value, path);
    expectBackendApproval(value.approval, `${path}.approval`);
  },
  'backendApproval.resolved': (value, path) => {
    expectRecord(value, path);
    expectBackendApproval(value.approval, `${path}.approval`);
    expectNullable(
      value.decision,
      `${path}.decision`,
      (candidate, candidatePath) =>
        expectLiteral(candidate, ['approve', 'deny'], candidatePath),
    );
    expectNullable(value.scope, `${path}.scope`, (candidate, candidatePath) =>
      expectLiteral(candidate, ['once', 'session'], candidatePath),
    );
    expectLiteral(
      value.reason,
      [
        'host',
        'server',
        'conversation_closed',
        'conversation_removed',
        'surface_disconnected',
      ],
      `${path}.reason`,
    );
  },
} satisfies Record<string, EventValueValidator>;

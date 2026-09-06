import { isAppTextDescriptor } from '../app-text';
import { isAccountRateLimits } from '../snapshot-guard-collections';
import { decodeAppSnapshot } from '../snapshot-guards';
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
  type EventValueValidator,
} from './event-validation';

function expectAppText(value: unknown, path: string): void {
  if (typeof value !== 'string' && !isAppTextDescriptor(value)) {
    throw new Error(
      `Invalid Claw backend event at ${path}: expected application text.`,
    );
  }
}

function expectBackendCapabilities(value: unknown, path: string): void {
  expectRecord(value, path);
  const booleans = [
    'attachments',
    'models',
    'skills',
    'reasoningEffort',
    'serviceTier',
    'thinkingBudget',
    'goals',
    'steerPrompt',
    'interrupt',
    'history',
    'conversationFork',
    'deleteTurn',
    'editTurn',
    'retryTurn',
    'approvals',
  ];
  booleans.forEach((key) => expectOptional(value, key, path, expectBoolean));
  expectOptional(value, 'planMode', path, (candidate, candidatePath) => {
    expectLiteral(
      candidate,
      ['native', 'prompted', 'unsupported'],
      candidatePath,
    );
  });
  expectOptional(value, 'approvalPresets', path, (candidate, candidatePath) => {
    expectArray(candidate, candidatePath, (item, itemPath) => {
      expectLiteral(
        item,
        ['ask-for-approval', 'approve-for-me', 'full-access'],
        itemPath,
      );
    });
  });
  expectOptional(value, 'permissionModes', path, (candidate, candidatePath) => {
    expectArray(candidate, candidatePath, (item, itemPath) => {
      expectRecord(item, itemPath);
      expectString(item.id, `${itemPath}.id`);
      expectAppText(item.label, `${itemPath}.label`);
      expectAppText(item.description, `${itemPath}.description`);
      expectOptional(item, 'dangerous', itemPath, expectBoolean);
    });
  });
}

function expectBackendRuntimeStatus(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(value.backend, ['codex', 'claude'], `${path}.backend`);
  expectLiteral(
    value.status,
    ['notConfigured', 'starting', 'running', 'error'],
    `${path}.status`,
  );
  expectOptional(value, 'detail', path, expectAppText);
  expectOptional(value, 'capabilities', path, expectBackendCapabilities);
}

function expectConnectionState(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(
    value.status,
    ['connecting', 'connected', 'reconnecting', 'error'],
    `${path}.status`,
  );
  expectOptional(value, 'detail', path, expectAppText);
}

function expectSnapshotMetadata(value: unknown, path: string): void {
  const decoded = decodeAppSnapshot(value);
  if (decoded?.kind !== 'metadata') {
    throw new Error(
      `Invalid Claw backend event at ${path}: expected snapshot metadata.`,
    );
  }
}

function expectRateLimits(value: unknown, path: string): void {
  if (isAccountRateLimits(value)) return;
  expectRecord(value, path);
  expectKnownShape(
    value.rateLimits,
    `${path}.rateLimits`,
    isAccountRateLimits,
    'account rate limits',
  );
}

function expectDevicePairingStatus(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(
    value.status,
    ['disabled', 'connecting', 'connected', 'errored'],
    `${path}.status`,
  );
  expectOptional(value, 'serverName', path, expectString);
  expectOptional(value, 'installationId', path, expectString);
  expectOptional(value, 'environmentId', path, (candidate, candidatePath) =>
    expectNullable(candidate, candidatePath, expectString),
  );
  expectOptional(
    value,
    'allowRemoteControl',
    path,
    (candidate, candidatePath) =>
      expectNullable(candidate, candidatePath, expectBoolean),
  );
  expectOptional(value, 'detail', path, expectString);
}

function expectModel(value: unknown, path: string): void {
  expectRecord(value, path);
  expectString(value.id, `${path}.id`);
  expectString(value.model, `${path}.model`);
  expectString(value.displayName, `${path}.displayName`);
  expectOptional(value, 'description', path, expectString);
  expectOptional(value, 'hidden', path, expectBoolean);
  expectOptional(
    value,
    'supportedReasoningEfforts',
    path,
    (candidate, candidatePath) => {
      expectArray(candidate, candidatePath, (item, itemPath) => {
        expectRecord(item, itemPath);
        expectString(item.reasoningEffort, `${itemPath}.reasoningEffort`);
        expectString(item.description, `${itemPath}.description`);
      });
    },
  );
  expectOptional(
    value,
    'defaultReasoningEffort',
    path,
    (candidate, candidatePath) =>
      expectNullable(candidate, candidatePath, expectString),
  );
  expectOptional(value, 'serviceTiers', path, (candidate, candidatePath) => {
    expectArray(candidate, candidatePath, (item, itemPath) => {
      expectRecord(item, itemPath);
      expectString(item.id, `${itemPath}.id`);
      expectString(item.name, `${itemPath}.name`);
      expectString(item.description, `${itemPath}.description`);
    });
  });
  expectOptional(
    value,
    'defaultServiceTier',
    path,
    (candidate, candidatePath) =>
      expectNullable(candidate, candidatePath, expectString),
  );
  expectOptional(value, 'isDefault', path, expectBoolean);
  expectOptional(value, 'capabilities', path, expectBackendCapabilities);
  expectOptional(value, 'providerMetadata', path, expectRecord);
}

function expectSkill(value: unknown, path: string): void {
  expectRecord(value, path);
  expectOptional(value, 'id', path, expectString);
  expectString(value.name, `${path}.name`);
  [
    'description',
    'shortDescription',
    'displayName',
    'iconSmall',
    'iconLarge',
    'brandColor',
    'defaultPrompt',
    'scope',
  ].forEach((key) => expectOptional(value, key, path, expectString));
  expectString(value.path, `${path}.path`);
  expectBoolean(value.enabled, `${path}.enabled`);
  expectOptional(value, 'providerMetadata', path, expectRecord);
}

function expectGitDiffSection(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(
    value.scope,
    ['staged', 'unstaged', 'untracked'],
    `${path}.scope`,
  );
  expectString(value.diff, `${path}.diff`);
}

function expectSidePanelMarkdown(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(value.kind, ['markdown'], `${path}.kind`);
  expectOptional(value, 'purpose', path, (candidate, candidatePath) =>
    expectLiteral(candidate, ['plan'], candidatePath),
  );
  expectOptional(value, 'title', path, expectAppText);
  expectOptional(value, 'path', path, expectString);
  expectString(value.content, `${path}.content`);
}

function expectSidePanelGitDiff(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(value.kind, ['gitDiff'], `${path}.kind`);
  expectOptional(value, 'scope', path, (candidate, candidatePath) =>
    expectLiteral(candidate, ['workingTree', 'turn'], candidatePath),
  );
  expectOptional(value, 'title', path, expectAppText);
  expectOptional(value, 'subtitle', path, (candidate, candidatePath) =>
    expectNullable(candidate, candidatePath, expectAppText),
  );
  expectString(value.diff, `${path}.diff`);
  expectOptional(value, 'sections', path, (candidate, candidatePath) =>
    expectArray(candidate, candidatePath, expectGitDiffSection),
  );
  expectOptional(value, 'state', path, (candidate, candidatePath) =>
    expectLiteral(candidate, ['idle', 'error'], candidatePath),
  );
  expectOptional(value, 'error', path, (candidate, candidatePath) =>
    expectNullable(candidate, candidatePath, expectString),
  );
}

function expectAgentCreationProgress(value: unknown, path: string): void {
  expectRecord(value, path);
  expectString(value.id, `${path}.id`);
  expectLiteral(value.state, ['running', 'success', 'error'], `${path}.state`);
  expectLiteral(value.backend, ['codex', 'claude'], `${path}.backend`);
  expectString(value.repositoryName, `${path}.repositoryName`);
  expectBoolean(value.createWorktree, `${path}.createWorktree`);
  expectOptional(value, 'branchName', path, expectString);
  expectBoolean(value.hasPrompt, `${path}.hasPrompt`);
  expectOptional(value, 'phase', path, (candidate, candidatePath) => {
    expectLiteral(
      candidate,
      [
        'creatingWorktree',
        'initializingWorktree',
        'creatingAgent',
        'startingPrompt',
      ],
      candidatePath,
    );
  });
  ['initializationDetail', 'agentId', 'agentName', 'error'].forEach((key) =>
    expectOptional(value, key, path, expectString),
  );
}

function expectBrowserAnnotation(value: unknown, path: string): void {
  expectRecord(value, path);
  ['id', 'agentId', 'browserId', 'url'].forEach((key) =>
    expectString(value[key], `${path}.${key}`),
  );
  expectLiteral(value.kind, ['element', 'area'], `${path}.kind`);
  ['selector', 'label', 'comment'].forEach((key) =>
    expectOptional(value, key, path, expectString),
  );
  expectRecord(value.rect, `${path}.rect`);
  const rect = value.rect as Record<string, unknown>;
  ['x', 'y', 'width', 'height'].forEach((key) =>
    expectNumber(rect[key], `${path}.rect.${key}`),
  );
}

function expectWorkBacklogAssignment(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(value.provider, ['github'], `${path}.provider`);
  ['itemId', 'agentId', 'assignedAt'].forEach((key) =>
    expectString(value[key], `${path}.${key}`),
  );
  expectOptional(value, 'policy', path, (candidate, candidatePath) =>
    expectLiteral(candidate, ['complete', 'review'], candidatePath),
  );
  expectLiteral(
    value.status,
    ['blocked', 'completed', 'inProgress', 'readyForReview', 'working'],
    `${path}.status`,
  );
  [
    'completedAt',
    'note',
    'updatedAt',
    'automationId',
    'automationExecutionId',
  ].forEach((key) => expectOptional(value, key, path, expectString));
}

function expectId(value: unknown, path: string): void {
  expectRecord(value, path);
  expectString(value.id, `${path}.id`);
}

export const runtimePayloadValidators = {
  'backend.statusChanged': expectBackendRuntimeStatus,
  'client.connectionChanged': expectConnectionState,
  'snapshot.updated': expectSnapshotMetadata,
  'account.rateLimitsUpdated': expectRateLimits,
  'devicePairing.statusChanged': expectDevicePairingStatus,
  'models.changed': (value, path) => {
    expectRecord(value, path);
    expectArray(value.models, `${path}.models`, expectModel);
  },
  'skills.changed': (value, path) => {
    expectRecord(value, path);
    expectNullable(value.cwd, `${path}.cwd`, expectString);
    expectLiteral(value.status, ['loaded'], `${path}.status`);
    expectArray(value.skills, `${path}.skills`, expectSkill);
  },
  'sidePanel.markdownRequested': expectSidePanelMarkdown,
  'sidePanel.gitDiffRequested': expectSidePanelGitDiff,
  'celebration.requested': (value, path) => {
    expectRecord(value, path);
    expectLiteral(
      value.kind,
      ['confetti', 'stars', 'shapes', 'schoolPride'],
      `${path}.kind`,
    );
  },
  'agentCreation.progress': expectAgentCreationProgress,
  'git.operationProgress': (value, path) => {
    expectRecord(value, path);
    expectLiteral(
      value.operation,
      ['pullRequest', 'merge'],
      `${path}.operation`,
    );
    expectLiteral(value.phase, ['handoff', 'delivery'], `${path}.phase`);
  },
  'browser.annotationCreated': expectBrowserAnnotation,
  'workBacklog.assignmentUpdated': expectWorkBacklogAssignment,
  'clientRequest.resolved': expectId,
} satisfies Record<string, EventValueValidator>;

import {
  isAgentGitStatus,
  isRendererMessage,
} from '../snapshot-guard-collections';
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
  failEventValidation,
  type EventValueValidator,
} from './event-validation';

function expectPlanStep(value: unknown, path: string): void {
  expectRecord(value, path);
  expectString(value.step, `${path}.step`);
  expectLiteral(
    value.status,
    ['pending', 'inProgress', 'completed'],
    `${path}.status`,
  );
}

function expectTurnStarted(value: unknown, path: string): void {
  expectRecord(value, path);
  if (value.turn !== undefined) {
    expectRecord(value.turn, `${path}.turn`);
    expectString(value.turn.id, `${path}.turn.id`);
    expectLiteral(value.turn.backend, ['claude'], `${path}.turn.backend`);
    return;
  }
  expectLiteral(value.status, ['inProgress'], `${path}.status`);
  expectString(value.startedAt, `${path}.startedAt`);
}

function expectTurnCompleted(value: unknown, path: string): void {
  expectRecord(value, path);
  if (value.turn !== undefined) {
    expectRecord(value.turn, `${path}.turn`);
    expectString(value.turn.id, `${path}.turn.id`);
    expectLiteral(
      value.turn.status,
      ['completed', 'interrupted'],
      `${path}.turn.status`,
    );
    return;
  }
  expectLiteral(
    value.status,
    ['completed', 'interrupted', 'failed', 'inProgress'],
    `${path}.status`,
  );
  expectOptional(value, 'error', path, (candidate, candidatePath) => {
    expectNullable(candidate, candidatePath, (error, errorPath) => {
      expectRecord(error, errorPath);
      expectString(error.message, `${errorPath}.message`);
      expectNullable(
        error.additionalDetails,
        `${errorPath}.additionalDetails`,
        expectString,
      );
      if (!Object.prototype.hasOwnProperty.call(error, 'codexErrorInfo')) {
        failEventValidation(
          `${errorPath}.codexErrorInfo`,
          'expected the field to be present',
        );
      }
    });
  });
  expectOptional(value, 'willRetry', path, expectBoolean);
  ['startedAt', 'completedAt'].forEach((key) => {
    expectOptional(value, key, path, (candidate, candidatePath) =>
      expectNullable(candidate, candidatePath, expectString),
    );
  });
  expectOptional(value, 'durationMs', path, (candidate, candidatePath) =>
    expectNullable(candidate, candidatePath, expectNumber),
  );
}

function expectCompaction(value: unknown, path: string): void {
  expectRecord(value, path);
  if (Object.prototype.hasOwnProperty.call(value, 'itemId')) {
    expectNullable(value.itemId, `${path}.itemId`, expectString);
  } else if (Object.keys(value).length > 0) {
    failEventValidation(path, 'expected an empty object or item identifier');
  }
}

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

function expectToolPart(value: unknown, path: string): void {
  expectRecord(value, path);
  expectLiteral(value.type, ['tool'], `${path}.type`);
  ['id', 'kind', 'title'].forEach((key) =>
    expectString(value[key], `${path}.${key}`),
  );
  expectLiteral(
    value.status,
    ['running', 'completed', 'failed'],
    `${path}.status`,
  );
  ['statusText', 'body'].forEach((key) =>
    expectOptional(value, key, path, expectString),
  );
  expectOptional(value, 'metadata', path, expectRecord);
}

function expectToolPartUpdate(value: unknown, path: string): void {
  expectRecord(value, path);
  expectString(value.itemId, `${path}.itemId`);
  ['messageId', 'title', 'body', 'bodyDelta', 'bodyAppend'].forEach((key) =>
    expectOptional(value, key, path, expectString),
  );
  expectOptional(value, 'status', path, (candidate, candidatePath) =>
    expectLiteral(candidate, ['running', 'completed', 'failed'], candidatePath),
  );
  expectOptional(value, 'statusText', path, (candidate, candidatePath) =>
    expectNullable(candidate, candidatePath, expectString),
  );
  expectOptional(value, 'metadata', path, expectRecord);
  expectOptional(value, 'fallbackToolPart', path, expectToolPart);
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

function expectConfirmToolRequest(value: unknown, path: string): void {
  expectRecord(value, path);
  [
    'argumentsPreview',
    'integrationId',
    'integrationName',
    'summary',
    'toolName',
  ].forEach((key) => expectString(value[key], `${path}.${key}`));
  ['allowConversation', 'allowAlways'].forEach((key) =>
    expectOptional(value, key, path, expectBoolean),
  );
}

function expectAskUserRequest(value: unknown, path: string): void {
  expectRecord(value, path);
  expectString(value.itemId, `${path}.itemId`);
  expectArray(
    value.questions,
    `${path}.questions`,
    (question, questionPath) => {
      expectRecord(question, questionPath);
      ['id', 'header', 'question'].forEach((key) =>
        expectString(question[key], `${questionPath}.${key}`),
      );
      ['isOther', 'isSecret'].forEach((key) =>
        expectBoolean(question[key], `${questionPath}.${key}`),
      );
      expectOptional(question, 'multiSelect', questionPath, expectBoolean);
      expectNullable(
        question.options,
        `${questionPath}.options`,
        (options, optionsPath) => {
          expectArray(options, optionsPath, (option, optionPath) => {
            expectRecord(option, optionPath);
            expectString(option.label, `${optionPath}.label`);
            expectString(option.description, `${optionPath}.description`);
          });
        },
      );
    },
  );
}

function expectClientRequest(
  value: unknown,
  path: string,
  kind: 'confirm_tool' | 'ask_user',
): void {
  expectRecord(value, path);
  expectString(value.id, `${path}.id`);
  expectLiteral(value.kind, [kind], `${path}.kind`);
  expectRecord(value.payload, `${path}.payload`);
  if (kind === 'confirm_tool') {
    expectConfirmToolRequest(
      value.payload.confirmation,
      `${path}.payload.confirmation`,
    );
  } else {
    expectAskUserRequest(value.payload.request, `${path}.payload.request`);
  }
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
  'turn.started': expectTurnStarted,
  'turn.planUpdated': (value, path) => {
    expectRecord(value, path);
    expectNullable(value.explanation, `${path}.explanation`, expectString);
    expectArray(value.plan, `${path}.plan`, expectPlanStep);
    expectOptional(value, 'markdown', path, expectString);
    expectOptional(value, 'status', path, (candidate, candidatePath) =>
      expectLiteral(candidate, ['running', 'completed'], candidatePath),
    );
  },
  'turn.proposedPlanDelta': (value, path) => {
    expectRecord(value, path);
    ['itemId', 'delta'].forEach((key) =>
      expectString(value[key], `${path}.${key}`),
    );
    expectOptional(value, 'markdown', path, expectString);
  },
  'turn.proposedPlanCompleted': (value, path) => {
    expectRecord(value, path);
    expectString(value.itemId, `${path}.itemId`);
    expectString(value.markdown, `${path}.markdown`);
  },
  'turn.completed': expectTurnCompleted,
  'context.compactionStarted': expectCompaction,
  'context.compactionCompleted': expectCompaction,
  'message.delta': (value, path) => {
    expectRecord(value, path);
    expectString(value.delta, `${path}.delta`);
    ['messageId', 'itemId'].forEach((key) =>
      expectOptional(value, key, path, expectString),
    );
    expectOptional(value, 'phase', path, (candidate, candidatePath) =>
      expectLiteral(candidate, ['commentary', 'final_answer'], candidatePath),
    );
  },
  'message.updated': (value, path) => {
    expectRecord(value, path);
    expectKnownShape(
      value.message,
      `${path}.message`,
      isRendererMessage,
      'renderer message',
    );
  },
  'message.userSubmitted': (value, path) => {
    expectRecord(value, path);
    expectKnownShape(
      value.message,
      `${path}.message`,
      isRendererMessage,
      'renderer message',
    );
  },
  'message.steer': (value, path) => {
    expectRecord(value, path);
    expectString(value.prompt, `${path}.prompt`);
    expectOptional(value, 'attachments', path, (candidate, candidatePath) =>
      expectArray(candidate, candidatePath, expectPromptAttachment),
    );
  },
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
  'item.started': (value, path) => {
    expectRecord(value, path);
    expectOptional(value, 'messageId', path, expectString);
    expectToolPart(value.toolPart, `${path}.toolPart`);
  },
  'item.updated': expectToolPartUpdate,
  'item.completed': (value, path) => {
    expectRecord(value, path);
    expectOptional(value, 'messageId', path, expectString);
    expectToolPart(value.toolPart, `${path}.toolPart`);
  },
  'diff.updated': expectGitDiff,
  'file.activity': expectFileActivity,
  'git.statusUpdated': (value, path) =>
    expectKnownShape(value, path, isAgentGitStatus, 'agent git status'),
  'approval.requested': (value, path) =>
    expectClientRequest(value, path, 'confirm_tool'),
  'toolInput.requested': (value, path) =>
    expectClientRequest(value, path, 'ask_user'),
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
  error: (value, path) => {
    expectRecord(value, path);
    expectString(value.message, `${path}.message`);
    expectOptional(value, 'willRetry', path, expectBoolean);
  },
} satisfies Record<string, EventValueValidator>;

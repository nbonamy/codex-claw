import { product } from '@workspace/core/product';
import type { Automation, SourceRepository, Team, WorkIntegrationConnection, WorkSource } from '@workspace/core/contracts';
import { mount } from '@vue/test-utils';
import { ElButton, ElOption, ElSelect, ElSwitch } from 'element-plus';
import AutomationEditor from '../AutomationEditor.vue';

export function mountEditor(
  overrides: Partial<{
    connection: WorkIntegrationConnection;
    connections: WorkIntegrationConnection[];
    currentRepositoryPath: string;
    automation: Automation;
    repositories: WorkSource[];
    sourceRepositories: SourceRepository[];
    teams: Team[];
  }> = {},
) {
  return mount(AutomationEditor, {
    attachTo: document.body,
    props: {
      mode: overrides.automation ? 'edit' : 'create',
      connections: overrides.connections ?? [overrides.connection ?? {
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
      }],
      automation: overrides.automation,
      currentRepositoryPath: overrides.currentRepositoryPath,
      repositories: overrides.repositories ?? workRepositories(),
      sourceRepositories: overrides.sourceRepositories ?? sourceRepositories(),
      teams: overrides.teams ?? [
        {
          id: 'team-app',
          name: `${product.name}`,
          avatar: 'CC',
          color: '#1B4FB2',
          agentIds: [],
        },
      ],
    },
    global: {
      components: { ElButton, ElOption, ElSelect, ElSwitch },
    },
  });
}

export function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'automation-bugs',
    name: 'GitHub bugs',
    enabled: true,
    repositories: [
      {
        provider: 'github',
        sourceId: 'nbonamy/agent-workspace',
        executionRepositoryPath: '/Users/nbonamy/src/agent-workspace',
      },
    ],
    teamId: 'team-app',
    selectionPrompt: 'Pick ready bugs.',
    assignmentPrompt: 'Fix the issue and run tests.',
    schedule: { intervalMinutes: 60 },
    executionLog: [],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    ...overrides,
  };
}

export function workRepositories(): WorkSource[] {
  return [
    {
      provider: 'github',
      id: 'nbonamy/agent-workspace',
      owner: 'nbonamy',
      name: 'agent-workspace',
      fullName: 'nbonamy/agent-workspace',
      url: 'https://github.com/nbonamy/agent-workspace',
      isPrivate: true,
    },
    {
      provider: 'github',
      id: 'nbonamy/witsy',
      owner: 'nbonamy',
      name: 'witsy',
      fullName: 'nbonamy/witsy',
      url: 'git@github.com:nbonamy/witsy.git',
      isPrivate: true,
    },
  ];
}

export function sourceRepositories(): SourceRepository[] {
  return [
    {
      name: 'agent-workspace',
      path: '/Users/nbonamy/src/agent-workspace',
      remoteIdentity: 'github.com/nbonamy/agent-workspace',
      worktrees: [],
    },
    {
      name: 'witsy',
      path: '/Users/nbonamy/src/witsy',
      remoteIdentity: 'github.com/nbonamy/witsy',
      worktrees: [],
    },
  ];
}

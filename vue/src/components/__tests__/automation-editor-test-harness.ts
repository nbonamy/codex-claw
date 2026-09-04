import type { Automation, SourceRepository, Team, WorkIntegrationConnection, WorkRepository } from '@codex-claw/core/contracts';
import { mount } from '@vue/test-utils';
import { ElButton, ElOption, ElSelect, ElSwitch } from 'element-plus';
import AutomationEditor from '../AutomationEditor.vue';

export function mountEditor(
  overrides: Partial<{
    connection: WorkIntegrationConnection;
    automation: Automation;
    repositories: WorkRepository[];
    sourceRepositories: SourceRepository[];
    teams: Team[];
  }> = {},
) {
  return mount(AutomationEditor, {
    props: {
      mode: overrides.automation ? 'edit' : 'create',
      connection: overrides.connection ?? {
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
      },
      automation: overrides.automation,
      repositories: overrides.repositories ?? workRepositories(),
      sourceRepositories: overrides.sourceRepositories ?? sourceRepositories(),
      teams: overrides.teams ?? [
        {
          id: 'team-codex-claw',
          name: 'Codex Claw',
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
        repositoryId: 'nbonamy/codex-claw',
        sourceRepositoryPath: '/Users/nbonamy/src/codex-claw',
      },
    ],
    teamId: 'team-codex-claw',
    selectionPrompt: 'Pick ready bugs.',
    assignmentPrompt: 'Fix the issue and run tests.',
    schedule: { intervalMinutes: 60 },
    executionLog: [],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    ...overrides,
  };
}

export function workRepositories(): WorkRepository[] {
  return [
    {
      provider: 'github',
      id: 'nbonamy/codex-claw',
      owner: 'nbonamy',
      name: 'codex-claw',
      fullName: 'nbonamy/codex-claw',
      url: 'https://github.com/nbonamy/codex-claw',
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
      name: 'codex-claw',
      path: '/Users/nbonamy/src/codex-claw',
      remoteIdentity: 'github.com/nbonamy/codex-claw',
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

import { mount } from '@vue/test-utils';
import { ElButton, ElCheckbox, ElInput, ElOption, ElOptionGroup, ElSelect, ElSwitch } from 'element-plus';
import type { BackendModelOption, BenchTemplate, Automation, SourceRepository, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import AutomationEditor from '../AutomationEditor.vue';

export function mountEditor(overrides: Partial<{
  benchTemplates: BenchTemplate[];
  backendModels: BackendModelOption[];
  chooseAgentFolder: () => Promise<string | null>;
  connection: WorkIntegrationConnection;
  itemsByRepository: Record<string, WorkItem[]>;
  automation: Automation;
  repositories: WorkRepository[];
  sourceRepositories: SourceRepository[];
  teams: Team[];
}> = {}) {
  return mount(AutomationEditor, {
    props: {
      mode: 'create',
      backendModels: overrides.backendModels ?? [],
      benchTemplates: overrides.benchTemplates ?? benchTemplates(),
      chooseAgentFolder: overrides.chooseAgentFolder,
      connection: overrides.connection ?? {
        provider: 'github',
        status: 'connected',
        accountLabel: 'nbonamy',
      },
      itemsByRepository: overrides.itemsByRepository ?? {
        'github:nbonamy/codex-claw': [workItem()],
      },
      automation: overrides.automation,
      repositories: overrides.repositories ?? [{
        provider: 'github',
        id: 'nbonamy/codex-claw',
        owner: 'nbonamy',
        name: 'codex-claw',
        fullName: 'nbonamy/codex-claw',
        url: 'https://github.com/nbonamy/codex-claw',
        isPrivate: true,
      }],
      sourceRepositories: overrides.sourceRepositories ?? [{
        name: 'codex-claw',
        path: '/Users/nbonamy/src/codex-claw',
        worktrees: [],
      }],
      teams: overrides.teams ?? [{
        id: 'team-codex-claw',
        name: 'Codex Claw',
        avatar: 'CC',
        color: '#1B4FB2',
        agentIds: [],
      }],
    },
    global: {
      components: { ElButton, ElCheckbox, ElInput, ElOption, ElOptionGroup, ElSelect, ElSwitch },
    },
  });
}

export function automation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'automation-bugs',
    name: 'GitHub bugs',
    enabled: true,
    source: {
      provider: 'github',
      repositoryId: 'nbonamy/codex-claw',
      tagName: 'bug',
    },
    action: {
      type: 'create-agent-from-bench',
      benchTemplateId: 'bench-dina',
      teamTarget: {
        mode: 'existing',
        teamId: 'team-codex-claw',
      },
    },
    instructions: {},
    executionLog: [],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
    ...overrides,
  };
}

export function benchTemplates(): BenchTemplate[] {
  return [{
    id: 'bench-dina',
    name: 'Dina',
    avatar: 'DI',
    folder: '/Users/nbonamy/src/codex-claw',
    backend: 'codex',
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  }];
}

export function models(): BackendModelOption[] {
  return [{
    id: 'gpt-5.1-codex-fast',
    model: 'gpt-5.1-codex-fast',
    displayName: 'GPT-5.1 Codex Fast',
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: 'Low' },
      { reasoningEffort: 'high', description: 'High' },
    ],
    defaultReasoningEffort: 'low',
    isDefault: true,
  }, {
    id: 'gpt-5.1-codex-max',
    model: 'gpt-5.1-codex-max',
    displayName: 'GPT-5.1 Codex Max',
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: 'Medium' },
      { reasoningEffort: 'high', description: 'High' },
    ],
    defaultReasoningEffort: 'medium',
  }];
}

export function workItem(): WorkItem {
  return {
    provider: 'github',
    id: 'nbonamy/codex-claw#12',
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number: 12,
    title: 'Fix cockpit',
    url: 'https://github.com/nbonamy/codex-claw/issues/12',
    state: 'open',
    assignees: ['nbonamy', 'alex'],
    labels: [{ name: 'bug' }],
    createdAt: '2026-06-09T10:00:00.000Z',
    updatedAt: '2026-06-09T10:00:00.000Z',
  };
}

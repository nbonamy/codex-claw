import type { WorkItem, WorkProviderKind, WorkSource } from '../../contracts';
import { workProviderKinds, workProviders } from '../../work-providers';

// Test-only registration simulates adding a definition at the composition point.
// It deliberately shares no GitHub/Linear metadata or native ID conventions.
export const mockWorkProvider = 'mock-work' as WorkProviderKind;
export const mockWorkSource: WorkSource = {
  provider: mockWorkProvider, id: 'board:opaque', name: 'Product',
  fullName: 'Product', url: 'https://example.test/board',
};
export const mockWorkItem: WorkItem = {
  provider: mockWorkProvider, id: 'task:opaque', sourceId: mockWorkSource.id,
  sourceName: mockWorkSource.fullName, identifier: 'TASK-blue',
  title: 'Repair login', body: 'Reproduction details', url: 'https://example.test/task',
  state: 'open', nativeState: 'In progress', labels: [{ name: 'bug' }],
  createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z',
};

export function registerMockWorkProvider(): () => void {
  Object.assign(workProviders, {
    [mockWorkProvider]: {
      label: 'Mock work source',
      sourceLabel: { key: 'backlogSource.sources' },
      description: { key: 'backlogSource.sources' },
      configurationDetail: 'Mock source is not configured.',
      repositoryBacked: false,
      pullRequests: false,
      initialView: 'assignedToMe',
      branchPrefix: '',
      automationBranchPrefix: '',
    },
  });
  workProviderKinds.push(mockWorkProvider);
  return () => {
    Reflect.deleteProperty(workProviders, mockWorkProvider);
    const index = workProviderKinds.indexOf(mockWorkProvider);
    if (index >= 0) workProviderKinds.splice(index, 1);
  };
}

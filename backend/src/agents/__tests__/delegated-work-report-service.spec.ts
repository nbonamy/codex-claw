import { describe, expect, it, vi } from 'vitest';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import type { Agent, MainToRendererEvent, RendererMessage } from '@codex-claw/core/contracts';
import { DelegatedWorkReportService } from '../delegated-work-report-service';

describe('DelegatedWorkReportService', () => {
  it('asks an idle delegated agent for a complete handoff and delivers it to its creator', async () => {
    const snapshot = createEmptySnapshot();
    const parent = agent('agent-main', 'main');
    const worker = { ...agent('agent-worker', 'fix/resume'), delegatedByAgentId: parent.id };
    snapshot.agents = [parent, worker];
    const sendPrompt = vi.fn();
    const sendMessage = vi.fn();
    const service = new DelegatedWorkReportService({ getSnapshot: () => snapshot, sendPrompt, sendMessage });

    const report = service.prepare(worker, { kind: 'pullRequest', branch: 'fix/resume' });
    expect(sendPrompt).toHaveBeenCalledWith(worker.id, expect.stringMatching(/will create a pull request from `fix\/resume`.*Do not run tools.*Do not claim that no pull request was created/s));

    snapshot.messages.push(assistantMessage(worker.id, 'turn-report', 'Implemented the full fix.\n\nTests pass.'));
    service.handleEvent(event(worker.id, 'turn-report', 'turn.completed'));
    await expect(report).resolves.toBe('Implemented the full fix.\n\nTests pass.');

    expect(service.deliver(worker, {
      kind: 'pullRequest', branch: 'fix/resume', number: 42, title: 'Fix resume instructions', url: 'https://github.com/openai/codex/pull/42', draft: true,
    }, await report)).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(worker.id, parent.id, expect.stringMatching(/Please give the user.*Draft pull request #42 was created.*https:\/\/github.com\/openai\/codex\/pull\/42.*Implemented the full fix/s));
  });

  it('falls back without prompting when the worker is busy or has no delegation recipient', async () => {
    const snapshot = createEmptySnapshot();
    const parent = agent('agent-main', 'main');
    const worker = { ...agent('agent-worker', 'feature'), delegatedByAgentId: parent.id, status: { type: 'working' } as const };
    snapshot.agents = [parent, worker];
    const sendPrompt = vi.fn();
    const sendMessage = vi.fn();
    const service = new DelegatedWorkReportService({ getSnapshot: () => snapshot, sendPrompt, sendMessage });

    const outcome = { kind: 'merge' as const, branch: 'feature', repository: 'main' };
    await expect(service.prepare(worker, outcome)).resolves.toBeNull();
    expect(sendPrompt).not.toHaveBeenCalled();
    expect(service.deliver(worker, outcome, null)).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(worker.id, parent.id, expect.stringMatching(/merged directly into main without creating a pull request.*could not prepare a handoff summary/s));
    expect(service.recipientName(agent('standalone', 'standalone'))).toBeNull();
  });

  it('notifies a surviving worker of the authoritative pull request result', () => {
    const snapshot = createEmptySnapshot();
    const parent = agent('agent-main', 'main');
    const worker = { ...agent('agent-worker', 'fix/resume'), delegatedByAgentId: parent.id };
    snapshot.agents = [parent, worker];
    const sendMessage = vi.fn();
    const service = new DelegatedWorkReportService({ getSnapshot: () => snapshot, sendPrompt: vi.fn(), sendMessage });

    expect(service.notifyWorker(worker, {
      kind: 'pullRequest', branch: 'fix/resume', number: 42, title: 'Fix resume instructions', url: 'https://github.com/openai/codex/pull/42', draft: false,
    })).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(parent.id, worker.id, expect.stringMatching(/Pull request #42 was created from `fix\/resume`: Fix resume instructions.*https:\/\/github.com\/openai\/codex\/pull\/42.*informational update.*Do not make changes or reply/s));
  });

  it('tells the worker when Claw is taking over a direct merge', async () => {
    const snapshot = createEmptySnapshot();
    const parent = agent('agent-main', 'main');
    const worker = { ...agent('agent-worker', 'feature'), delegatedByAgentId: parent.id };
    snapshot.agents = [parent, worker];
    const sendPrompt = vi.fn();
    const service = new DelegatedWorkReportService({ getSnapshot: () => snapshot, sendPrompt });

    const report = service.prepare(worker, { kind: 'merge', branch: 'feature', repository: 'owner/repo' });
    expect(sendPrompt).toHaveBeenCalledWith(worker.id, expect.stringMatching(/will merge `feature` directly into owner\/repo without a pull request.*Do not run tools/s));

    snapshot.messages.push(assistantMessage(worker.id, 'turn-report', 'Implemented and verified the change.'));
    service.handleEvent(event(worker.id, 'turn-report', 'turn.completed'));
    await expect(report).resolves.toBe('Implemented and verified the change.');
  });

  it('falls back when the summary prompt cannot start', async () => {
    const snapshot = createEmptySnapshot();
    const parent = agent('agent-main', 'main');
    const worker = { ...agent('agent-worker', 'feature'), delegatedByAgentId: parent.id };
    snapshot.agents = [parent, worker];
    const service = new DelegatedWorkReportService({
      getSnapshot: () => snapshot,
      sendPrompt: () => { throw new Error('backend unavailable'); },
    });

    await expect(service.prepare(worker, { kind: 'merge', branch: 'feature', repository: 'main' })).resolves.toBeNull();
  });
});

function agent(id: string, name: string): Agent {
  return {
    id, name, folder: `/repo/${name}`, backend: 'codex', status: { type: 'idle' },
    createdAt: '2026-09-03T00:00:00.000Z', updatedAt: '2026-09-03T00:00:00.000Z',
  };
}

function assistantMessage(agentId: string, turnId: string, text: string): RendererMessage {
  return {
    id: 'message-report', agentId, turnId, role: 'assistant', status: 'complete',
    parts: [{ type: 'text', text }], createdAt: '2026-09-03T00:01:00.000Z',
  };
}

function event(agentId: string, turnId: string, type: MainToRendererEvent['type']): Pick<MainToRendererEvent, 'agentId' | 'turnId' | 'type'> {
  return { agentId, turnId, type };
}

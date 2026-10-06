import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcpSession } from '../session';
import { AntigravityHost } from '../antigravity-host';
import { decodeAppBackendEvent } from '@workspace/core/backend-protocol/events';
import type { Agent } from '@workspace/core/contracts';
import type { BackendEvent } from '@workspace/core/backend-driver';

let root: string;
const sessions: AcpSession[] = [];
vi.mock('@workspace/core/runtime-discovery', async importOriginal => ({
  ...await importOriginal<typeof import('@workspace/core/runtime-discovery')>(),
  withDiscoveredRuntimePath: () => ({ ...process.env }),
}));
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'korus-acp-session-'));
  vi.stubEnv('APP_ANTIGRAVITY_COMMAND', path.join(root, 'runtime'));
  vi.stubEnv('ANTIGRAVITY_HARNESS_PATH', path.join(root, 'harness'));
  vi.stubEnv('GEMINI_HOME', path.join(root, 'home'));
  vi.stubEnv('APP_HOME', path.join(root, 'app'));
  await writeFile(path.join(root, 'harness'), '', { mode: 0o700 });
  await writeFile(path.join(root, 'runtime'), `#!/usr/bin/env node
const rl=require('node:readline').createInterface({input:process.stdin});
const send=v=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...v})+'\\n');
let sessionId=require('node:crypto').randomUUID(), promptId;
const update=update=>send({method:'session/update',params:{sessionId,update}});
rl.on('line',line=>{
 const v=JSON.parse(line), reply=result=>send({id:v.id,result});
 if(v.method==='initialize') reply({protocolVersion:2,agentInfo:{name:'antigravity-acp',version:'1.3.0'}});
 else if(v.method==='authenticate') reply({});
 else if(v.method==='session/new') reply({sessionId,models:{currentModelId:'gemini-low',availableModels:[{modelId:'gemini-low',name:'Gemini Low'}]}});
 else if(v.method==='session/load') {
   sessionId=v.params.sessionId;
   update({sessionUpdate:'user_message_chunk',content:{type:'text',text:'Create a file'}});
   update({sessionUpdate:'tool_call',toolCallId:'replay-id',title:'Create file',kind:'edit',status:'completed'});
   update({sessionUpdate:'tool_call_update',toolCallId:'replay-id',status:'failed',rawOutput:'Rejected by user'});
   update({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Denied.'}});
   reply({});
 } else if(v.method==='session/prompt') {
   promptId=v.id;
   const text=v.params.prompt[0].text;
   if(text==='crash') process.exit(1);
   if(text==='wait') return;
   if(text==='question'||text==='deny') {
     update({sessionUpdate:'tool_call',toolCallId:'live-id',title:'Create file',kind:'edit',status:'pending'});
     send({id:v.id,method:'session/request_permission',params:{sessionId,toolCall:{toolCallId:text==='question'?'interaction_1':'live-id',title:text==='question'?'Which option?':'Create file'},options:text==='question'?[{optionId:'native-choice-7',name:'Proceed',kind:'allow_once'}]:[{optionId:'native-deny-9',name:'Deny',kind:'reject_once'}]}});
   } else {update({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Recovered.'}});reply({stopReason:'end_turn'});}
 } else if(v.method==='session/cancel') send({id:promptId,result:{stopReason:'cancelled'}});
 else if(!v.method) {
   update({sessionUpdate:'tool_call_update',toolCallId:'live-id',status:v.result.outcome.optionId==='native-deny-9'?'failed':'completed',rawOutput:v.result.outcome.optionId});
   send({id:promptId,result:{stopReason:'end_turn'}});
 } else reply({});
});
`, { mode: 0o700 });
});
afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.close()));
  vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true });
});
async function open(sessionId?: string) {
  const changed = vi.fn();
  const session = await AcpSession.open({ agentId: 'agent', cwd: root, home: path.join(root, 'home'), mcpServers: [], sessionId, changed });
  sessions.push(session);
  return { session, changed };
}

describe('Antigravity native session', () => {
  it('routes two same-folder agents through distinct native sessions and validated provider frames', async () => {
    const host = new AntigravityHost();
    const events: BackendEvent[] = [];
    host.onEvent(event => { decodeAppBackendEvent({ ...event, seq: events.length + 1, occurredAt: new Date().toISOString() }); events.push(event); });
    const first: Agent = { id: 'first', name: 'First', folder: root, backend: 'antigravity', createdAt: '', updatedAt: '', status: { type: 'idle' } };
    const second = { ...first, id: 'second' };
    try {
      const [a, b] = await Promise.all([host.sendPrompt(first, 'hello'), host.sendPrompt(second, 'hello')]);
      expect(a.backendSession).not.toEqual(b.backendSession);
      expect(a.backendSession.kind).toBe('antigravity');
      await vi.waitFor(() => expect(events.filter(event => event.type === 'antigravity.conversationEventReceived' && event.payload.event.type === 'turn.completed')).toHaveLength(2));
      const snapshots = events.filter(event => event.type === 'antigravity.conversationSnapshotChanged');
      expect(snapshots.map(event => event.agentId)).toEqual(expect.arrayContaining(['first', 'second']));
      first.backendSession = a.backendSession;
      await host.releaseConversation(first.id);
      await host.loadConversation(first);
      const loaded = events.filter(event => event.type === 'antigravity.conversationSnapshotChanged').at(-1)!;
      expect(loaded.payload.snapshot.messages).toHaveLength(2);
      expect(loaded.payload.snapshot.messages[1]?.parts[0]).toMatchObject({ type: 'tool', status: 'failed' });
    } finally { await host.close(); }
  });
  it('serializes prompts, cancels natively, and accepts a fresh turn in the same process', async () => {
    const { session } = await open();
    const first = session.prompt('wait');
    expect(() => session.prompt('overlap')).toThrow('previous turn');
    await expect(session.interrupt('stale-turn')).rejects.toThrow('changed');
    await session.interrupt(first.turnId);
    expect(session.snapshot.turns[0]?.status).toBe('interrupted');
    await session.prompt('next').completion;
    expect(session.snapshot.turns.map(turn => turn.status)).toEqual(['interrupted', 'completed']);
    expect(session.snapshot.messages.at(-1)?.parts).toEqual([{ type: 'text', text: 'Recovered.' }]);
  });

  it.each(['deny', 'question'] as const)('maps %s to the exact native option and resolves its app request', async kind => {
    const { session } = await open();
    const turn = session.prompt(kind);
    await vi.waitFor(() => expect(session.snapshot.clientRequests).toHaveLength(1));
    const request = session.snapshot.clientRequests[0]!;
    expect(request.kind).toBe(kind === 'question' ? 'ask_user' : 'confirm_tool');
    expect(() => session.respond({ id: request.id, agentId: 'other', outcome: { kind: 'cancelled' } })).toThrow('another agent');
    expect(() => session.respond({ id: request.id, outcome: { kind: 'decision', decision: 'always_allow' } })).toThrow('options supplied');
    session.respond({ id: request.id, outcome: kind === 'question' ? { kind: 'answered', answers: { interaction_1: { answers: ['Proceed'] } } } : { kind: 'decision', decision: 'deny' } });
    await turn.completion;
    expect(session.snapshot.clientRequests).toEqual([]);
    expect(session.snapshot.answeredClientRequestIds).toContain(request.id);
    expect(session.snapshot.messages.at(-1)?.parts).toContainEqual(expect.objectContaining({ type: 'tool', status: kind === 'question' ? 'completed' : 'failed', output: kind === 'question' ? 'native-choice-7' : 'native-deny-9' }));
  });

  it('rebuilds loaded history from changed replay IDs in order without publishing partial history', async () => {
    const { session, changed } = await open('stored-session');
    expect(session.sessionId).toBe('stored-session');
    expect(changed).not.toHaveBeenCalled();
    expect(session.snapshot.messages).toHaveLength(2);
    expect(session.snapshot.messages[1]?.parts).toEqual([
      expect.objectContaining({ type: 'tool', id: 'replay-id', status: 'failed', output: 'Rejected by user' }),
      { type: 'text', text: 'Denied.' },
    ]);
    expect(session.snapshot).toMatchObject({ busy: false, activeTurnId: null, clientRequests: [] });
  });

  it('marks runtime exit as a failed turn and rejects future work on the dead session', async () => {
    const { session } = await open();
    await session.prompt('crash').completion;
    expect(session.snapshot).toMatchObject({ busy: false, turns: [expect.objectContaining({ status: 'failed' })], error: expect.stringContaining('Antigravity') });
    expect(() => session.prompt('next')).toThrow('closed');
  });
});

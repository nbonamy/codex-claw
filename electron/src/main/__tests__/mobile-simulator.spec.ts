import { describe, expect, it, vi } from 'vitest';
import { MobileSimulatorService } from '../mobile/service';
import type { MobileAdapter } from '../mobile/adapter';

function fixture() {
  const adapter: MobileAdapter = {
    list: vi.fn(async () => ({ devices: [{ id: 'phone', name: 'iPhone', platform: 'ios' as const, state: 'shutdown' as const }], setup: [] })),
    boot: vi.fn(async () => undefined),
    screen: vi.fn(async () => ({ png: Buffer.from('real-image'), width: 1200, height: 2400, scale: 3 })),
    perform: vi.fn(async () => undefined),
    inspect: vi.fn(async () => 'Settings'),
  };
  const consent = vi.fn(async () => true);
  return { adapter, consent, service: new MobileSimulatorService(adapter, consent) };
}

describe('mobile simulator attachment', () => {
  it('grants one owner after consent, refuses competing agents, and releases without stopping the device', async () => {
    const { service, adapter, consent } = fixture();
    const { attachment } = await service.execute('a', { action: 'attach', deviceId: 'phone' });
    expect(consent).toHaveBeenCalledWith('a', 'iPhone');
    expect(adapter.boot).toHaveBeenCalledOnce();
    await expect(service.execute('b', { action: 'attach', deviceId: 'phone' })).rejects.toThrow('another agent');
    await expect(service.execute('b', { action: 'screenshot', attachmentId: attachment!.id })).rejects.toThrow('No matching');
    expect((await service.execute('a', { action: 'list' })).catalog?.devices[0]?.owner).toBe('a');
    await service.execute('a', { action: 'detach', attachmentId: attachment!.id });
    expect((await service.execute('b', { action: 'attach', deviceId: 'phone' })).attachment?.device.id).toBe('phone');
    await expect(service.execute('a', { action: 'screenshot', attachmentId: attachment!.id })).rejects.toThrow('No matching');
  });

  it('returns actual image bytes and rejects stale orientation and out-of-bounds input before delivering it', async () => {
    const { service, adapter } = fixture();
    const { attachment } = await service.execute('a', { action: 'attach', deviceId: 'phone' });
    const attachmentId = attachment!.id;
    expect((await service.execute('a', { action: 'screenshot', attachmentId })).frame).toStrictEqual({ attachmentId, data: Buffer.from('real-image').toString('base64'), mimeType: 'image/png', scale: 3, width: 1200, height: 2400 });
    await expect(service.execute('a', { action: 'tap', attachmentId, x: 1200, y: 1, width: 1200, height: 2400 })).rejects.toThrow('coordinates');
    await expect(service.execute('a', { action: 'tap', attachmentId, x: 10, y: 10, width: 2400, height: 1200 })).rejects.toThrow('dimensions changed');
    expect(adapter.perform).not.toHaveBeenCalled();
    await service.execute('a', { action: 'tap', attachmentId, x: 300, y: 600, width: 1200, height: 2400 });
    expect(adapter.perform).toHaveBeenCalledWith(attachment!.device, expect.objectContaining({ x: 300, y: 600 }), expect.objectContaining({ scale: 3 }));
  });

  it('keeps denied consent and bridge failure recoverable without granting an attachment', async () => {
    const { service, consent, adapter } = fixture();
    consent.mockResolvedValueOnce(false);
    await expect(service.execute('a', { action: 'attach', deviceId: 'phone' })).rejects.toThrow('declined');
    expect(adapter.boot).not.toHaveBeenCalled();
    vi.mocked(adapter.screen).mockRejectedValueOnce(new Error('helper failed'));
    await expect(service.execute('a', { action: 'attach', deviceId: 'phone' })).rejects.toThrow('helper failed');
    expect(await service.execute('a', { action: 'status' })).toStrictEqual({ attachment: null });
    expect((await service.execute('a', { action: 'attach', deviceId: 'phone' })).attachment).not.toBeNull();
  });

  it('invalidates in-flight consent and queued work on disconnect', async () => {
    const { service, consent } = fixture();
    let allow!: (value: boolean) => void;
    consent.mockImplementationOnce(() => new Promise(resolve => { allow = resolve; }));
    const pending = service.execute('a', { action: 'attach', deviceId: 'phone' });
    await vi.waitFor(() => expect(consent).toHaveBeenCalled());
    const queued = service.execute('b', { action: 'attach', deviceId: 'phone' });
    service.clear(); allow(true);
    await expect(pending).rejects.toThrow('session ended');
    await expect(queued).rejects.toThrow('session ended');
    expect(await service.execute('a', { action: 'status' })).toStrictEqual({ attachment: null });
  });

  it('labels unavailable accessibility as screenshot fallback and removes closed agent ownership', async () => {
    const { service, adapter } = fixture();
    const { attachment } = await service.execute('a', { action: 'attach', deviceId: 'phone' });
    vi.mocked(adapter.inspect).mockRejectedValueOnce(new Error('no AX'));
    expect((await service.execute('a', { action: 'inspect', attachmentId: attachment!.id })).inspection?.kind).toBe('screenshot');
    service.retainAgents([]);
    expect((await service.execute('a', { action: 'status' })).attachment).toBeNull();
  });
});

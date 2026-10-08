import type { MobileAction, MobileAttachment, MobileRequest, MobileResult } from '@workspace/core/mobile-simulator';
import { randomUUID } from 'node:crypto';
import type { DeviceScreen, MobileAdapter } from './adapter';

/** One desktop owner per device, shared by the pane and authenticated MCP caller. */
export class MobileSimulatorService {
  private readonly attachments = new Map<string, MobileAttachment>();
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private pending = 0;
  private retainedAgentIds: Set<string> | null = null;

  constructor(
    private readonly adapter: MobileAdapter,
    private readonly authorize: (agentId: string, deviceName: string) => Promise<boolean>,
  ) {}

  execute(agentId: string, input: MobileRequest): Promise<MobileResult> {
    if (this.pending >= 8)
      return Promise.reject(new Error('Simulator is busy. Try again after the current operation.'));
    this.pending++;
    const generation = this.generation;
    const result = this.queue.then(async () => {
      if (generation !== this.generation) throw new Error('Simulator session ended. Attach again.');
      return this.run(agentId, input, generation);
    });
    this.queue = result.catch(() => undefined);
    return result.finally(() => {
      this.pending--;
    });
  }

  clear(): void {
    this.generation++;
    for (const attachment of this.attachments.values()) this.adapter.detach(attachment.device);
    this.attachments.clear();
  }
  retainAgents(agentIds: string[]): void {
    this.retainedAgentIds = new Set(agentIds);
    for (const id of this.attachments.keys())
      if (!agentIds.includes(id)) {
        this.adapter.detach(this.attachments.get(id)!.device);
        this.attachments.delete(id);
      }
  }

  private async run(agentId: string, input: MobileRequest, generation: number): Promise<MobileResult> {
    if (!input || typeof input !== 'object' || typeof input.action !== 'string')
      throw new Error('Invalid simulator request.');
    if (this.retainedAgentIds && !this.retainedAgentIds.has(agentId)) throw new Error('Agent is no longer available.');
    const current = this.attachments.get(agentId) ?? null;
    if (input.action === 'status') return { attachment: current };
    if (input.action === 'list') {
      const catalog = await this.adapter.list();
      for (const device of catalog.devices) {
        const owner = [...this.attachments].find(([, attachment]) => attachment.device.id === device.id);
        if (owner) device.owner = owner[0];
      }
      return { attachment: current, catalog };
    }
    if (input.action === 'attach') {
      if (current) {
        if (current.device.id === input.deviceId) return { attachment: current };
        throw new Error('Detach the current device before attaching another.');
      }
      const device = (await this.adapter.list()).devices.find((device) => device.id === input.deviceId);
      if (!device) throw new Error('Device unavailable. Refresh devices and check prerequisites.');
      if ([...this.attachments.values()].some((attachment) => attachment.device.id === device.id))
        throw new Error('This device is attached to another agent. Its owner must detach first.');
      if (!(await this.authorize(agentId, device.name))) throw new Error('Simulator access was declined.');
      if (generation !== this.generation) throw new Error('Simulator session ended. Attach again.');
      try {
        await this.adapter.boot(device);
        await this.adapter.screen(device); // Verify the bridge and coordinate metadata before granting input.
        if (generation !== this.generation) throw new Error('Simulator session ended. Attach again.');
        if (this.retainedAgentIds && !this.retainedAgentIds.has(agentId))
          throw new Error('Agent is no longer available.');
        const attachment = { id: randomUUID(), device: { ...device, state: 'booted' as const } };
        this.attachments.set(agentId, attachment);
        return { attachment };
      } catch (error) {
        this.adapter.detach(device);
        throw error;
      }
    }
    if (!current || !('attachmentId' in input) || current.id !== input.attachmentId)
      throw new Error('No matching attachment. Read simulator status and attach again.');
    if (input.action === 'detach') {
      this.adapter.detach(current.device);
      this.attachments.delete(agentId);
      return { attachment: null };
    }
    if (input.action === 'inspect') {
      let inspection: NonNullable<MobileResult['inspection']>;
      try {
        inspection = { kind: 'accessibility', text: await this.adapter.inspect(current.device) };
      } catch {
        inspection = {
          kind: 'screenshot',
          text: 'Accessibility is unavailable. Read a screenshot; do not infer control state from missing accessibility data.',
        };
      }
      if (this.attachments.get(agentId) !== current || generation !== this.generation)
        throw new Error('Simulator session ended.');
      return { attachment: current, inspection };
    }
    if (input.action === 'screenshot') {
      const screen = await this.adapter.screen(current.device);
      if (this.attachments.get(agentId) !== current || generation !== this.generation)
        throw new Error('Simulator session ended.');
      return {
        attachment: current,
        frame: {
          attachmentId: current.id,
          data: screen.png.toString('base64'),
          mimeType: 'image/png',
          scale: screen.scale,
          width: screen.width,
          height: screen.height,
        },
      };
    }
    validateAction(input);
    let screen: DeviceScreen | undefined;
    if (input.action === 'tap' || input.action === 'swipe') {
      screen = await this.adapter.screen(current.device);
      if (screen.width !== input.width || screen.height !== input.height)
        throw new Error('Screen dimensions changed. Read a fresh screenshot before interacting.');
    }
    if (generation !== this.generation || this.attachments.get(agentId) !== current)
      throw new Error('Simulator session ended.');
    await this.adapter.perform(current.device, input, screen);
    return { attachment: current };
  }
}

function validateAction(input: MobileAction): void {
  switch (input.action) {
    case 'tap':
    case 'swipe': {
      const point = (x: number, y: number) =>
        Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < input.width && y < input.height;
      if (
        !Number.isInteger(input.width) ||
        !Number.isInteger(input.height) ||
        input.width <= 0 ||
        input.height <= 0 ||
        input.width > 10000 ||
        input.height > 10000 ||
        !point(input.x, input.y)
      )
        throw new Error('Invalid screenshot coordinates.');
      if (
        input.action === 'swipe' &&
        (!point(input.toX, input.toY) ||
          !Number.isFinite(input.durationMs) ||
          input.durationMs < 100 ||
          input.durationMs > 3000)
      )
        throw new Error('Invalid swipe.');
      return;
    }
    case 'text':
      if (typeof input.text !== 'string' || input.text.length > 2000) throw new Error('Invalid text.');
      return;
    case 'launch':
      if (typeof input.appId !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.]{0,199}$/.test(input.appId))
        throw new Error('Invalid app identifier.');
      return;
    case 'button':
      if (!['home', 'back', 'enter', 'backspace'].includes(input.button)) throw new Error('Unsupported device button.');
      return;
    default:
      throw new Error('Unsupported simulator action.');
  }
}

import type { AgentBackend, AppSnapshot, SetCodexResourceSharingInput } from '@codex-claw/core/contracts';
import type { ProviderHomeSettings, ProviderSetupChoice, ProviderSetupStatus } from '@codex-claw/core/contracts/provider-setup';
import { backendDisplayName } from '@codex-claw/core/backend-driver';
import { createProviderLifecycles, type ProviderLifecycle } from './provider-lifecycle';

/** Owns local provider homes. Never copies authentication or moves existing chats. */
export class ProviderSetup {
  private busy = false;
  private readonly installations = new Map<AgentBackend, boolean>();

  constructor(
    private readonly snapshot: AppSnapshot,
    private readonly persist: () => Promise<void>,
    private readonly reconnect: (backend: AgentBackend) => Promise<void>,
    private readonly lifecycles: ReadonlyMap<AgentBackend, ProviderLifecycle> = createProviderLifecycles(),
  ) {}

  async initialize(): Promise<void> {
    for (const [backend, lifecycle] of this.lifecycles) {
      if (!this.snapshot.general.providerHomes?.[backend]) {
        this.snapshot.general.providerHomes = {
          ...this.snapshot.general.providerHomes,
          [backend]: lifecycle.home(this.snapshot),
        };
      }
      const home = this.home(backend);
      await lifecycle.prepareHome(home, false);
      lifecycle.applyHome?.(home);
    }
    await this.persist();
  }

  list(): ProviderSetupStatus[] {
    return [...this.lifecycles.keys()].map(backend => this.status(backend));
  }

  async configure(backend: AgentBackend, choice: ProviderSetupChoice): Promise<ProviderSetupStatus> {
    if (this.busy) throw new Error('Provider setup is already in progress.');
    if (this.locked(backend)) throw new Error('This provider already has chats. Its setup cannot be changed here.');
    const lifecycle = this.lifecycle(backend);
    const previous = this.home(backend);
    this.busy = true;
    try {
      const next = lifecycle.home(this.snapshot, choice);
      await lifecycle.prepareHome(next, true);
      this.snapshot.general.providerHomes = { ...this.snapshot.general.providerHomes, [backend]: next };
      lifecycle.applyHome?.(next);
      await this.reconnect(backend);
      await this.persist();
      return this.status(backend);
    } catch (error) {
      this.snapshot.general.providerHomes = { ...this.snapshot.general.providerHomes, [backend]: previous };
      lifecycle.applyHome?.(previous);
      await lifecycle.prepareHome(previous, false);
      await this.reconnect(backend);
      throw error;
    } finally { this.busy = false; }
  }

  async install(backend: AgentBackend): Promise<ProviderSetupStatus> {
    if (this.busy) throw new Error('Provider setup is already in progress.');
    if (this.status(backend).installed) return this.status(backend);
    this.busy = true;
    try {
      await this.lifecycle(backend).install();
      this.invalidateInstallation(backend);
      if (!this.status(backend).installed) throw new Error('Provider was not detected after installation.');
      await this.reconnect(backend);
      return this.status(backend);
    } catch {
      throw new Error(`Could not install ${backendDisplayName(backend)}. Install its CLI manually, then retry.`);
    } finally { this.busy = false; }
  }

  private home(backend: AgentBackend): ProviderHomeSettings {
    return this.snapshot.general.providerHomes?.[backend] ?? this.lifecycle(backend).home(this.snapshot);
  }

  private locked(backend: AgentBackend): boolean {
    return this.snapshot.agents.some(agent => agent.backend === backend);
  }

  invalidateInstallation(backend: AgentBackend): void { this.installations.delete(backend); }

  private status(backend: AgentBackend): ProviderSetupStatus {
    if (this.installations.has(backend)) return { backend, ...this.home(backend), installed: this.installations.get(backend)!, locked: this.locked(backend) };
    const installed = this.lifecycle(backend).installed(this.snapshot);
    this.installations.set(backend, installed);
    return { backend, ...this.home(backend), installed, locked: this.locked(backend) };
  }

  private lifecycle(backend: AgentBackend): ProviderLifecycle {
    const lifecycle = this.lifecycles.get(backend);
    if (!lifecycle) throw new Error(`Provider setup is unavailable for ${backend}.`);
    return lifecycle;
  }

  getResourceSharingStatus(backend: AgentBackend) {
    const sharing = this.lifecycle(backend).sharing;
    if (!sharing) throw new Error(`Resource sharing is unavailable for ${backend}.`);
    return sharing.status(this.home(backend));
  }

  async setResourceSharing(backend: AgentBackend, input: SetCodexResourceSharingInput): Promise<void> {
    const sharing = this.lifecycle(backend).sharing;
    if (!sharing) throw new Error(`Resource sharing is unavailable for ${backend}.`);
    await sharing.set(this.home(backend), input);
  }
}

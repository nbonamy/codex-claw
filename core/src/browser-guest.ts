/** The renderer creates the guest element; Electron main retains navigation policy. */
export function browserGuestPartition(agentId: string, visualization = false): string {
  const name = safePartitionName(agentId);
  return visualization
    ? `codex-claw-visualization-${name}`
    : `persist:codex-claw-browser-${name}`;
}

export function isBrowserGuestPartition(value: string): boolean {
  return /^persist:codex-claw-browser-[a-zA-Z\d_-]+$|^codex-claw-visualization-[a-zA-Z\d_-]+$/u.test(value);
}

export function safePartitionName(agentId: string): string {
  return agentId.replace(/[^a-zA-Z\d_-]/gu, '-').slice(0, 80) || 'default';
}

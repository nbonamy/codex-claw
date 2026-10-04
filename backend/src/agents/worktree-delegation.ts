export const WORKTREE_DELEGATION_PROMPT = [
  'Delegate this task to a new Codex Claw co-agent in a dedicated worktree, not an engine-native subagent.',
  'Use the current conversation to write a self-contained handoff with the task, decisions, relevant context, constraints, and acceptance criteria.',
  'Choose an appropriate branch name and use the create-agent tool with createWorktree set to true, a concise user-visible task as prompt, and the full handoff as instructions.',
  'If no specific task is supplied, delegate the work just agreed in this conversation. If the task or repository is unclear, ask before creating the co-agent.',
  'Have the co-agent report back when ready for review. Keep this conversation and the current agent open; do not implement the delegated work here or merge it automatically.',
].join(' ');

export function expandWorktreeDelegationCommand(prompt: string): string | null {
  const match = /^\/(?:delegate|worktree)(?:\s+([\s\S]*))?$/.exec(prompt.trim());
  if (!match) return null;
  const task = match[1]?.trim();
  return task ? `${WORKTREE_DELEGATION_PROMPT}\n\nTask to delegate:\n${task}` : WORKTREE_DELEGATION_PROMPT;
}

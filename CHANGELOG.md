# Changelog

All notable Codex Claw changes are recorded here. The history through `0.2.0`
was reconstructed from the Git log because earlier releases did not maintain a
changelog or release tags.

## [0.3.0] - 2026-08-02

### New features

- In-app browser with agent-specific tabs, annotations, and tools that continue
  working while another agent is selected.
- Native macOS Computer Use tools for agents to inspect and operate desktop
  applications.
- Git workspace review, source previews, streamlined agent setup, compact agent
  lists, and a refined native macOS shell.
- ChatGPT authentication, mobile device pairing, Fast mode, and clearer Claw
  tool presentation.
- Per-agent drafts, attachments, queues, model settings, and side-panel state.
- Prompt automation through the `codex-claw://` deep-link protocol.
- Sender labels and cleaner message bubbles for agent-to-agent collaboration.

### Improvements and fixes

- Made agent switching immediate and kept the interface responsive with several
  agents streaming concurrently.
- Reduced conversation rendering, catalog loading, snapshot processing, and
  long-session memory overhead; inactive transcripts now unload safely after
  five minutes and reload on demand.
- Prevented backend event-stream overload and output-backpressure crashes.
- Stabilized queued and steered prompt submission, attachments, compaction
  state, background-agent selection, and app-server reconnection.
- Preserved live tool calls, drafts, queues, and conversation state across agent
  switches and background activity.
- Fixed GitHub token refresh, device pairing, Fast mode hydration, catalog
  flicker, status clearing, and tool presentation regressions.

## [0.2.0] - 2026-06-18

### New features

- Always-on background agents through the `clawd` daemon, including automatic
  daemon upgrades when the desktop app is updated.
- SSH connections to remote Claw instances with remote teams, agents, loops,
  and work integrations.
- Conversation history and resume, source and Git diff previews, agent Git
  statistics, and repository worktree selection.
- System permission controls and sleep prevention while agents are working.

### Improvements and fixes

- Made agent and team state survive desktop restarts while background work
  continues in the daemon.
- Improved remote connection recovery, conversation hydration, agent restart
  behavior, and packaged runtime discovery.
- Fixed direct teammate delivery, GitHub authentication in packaged builds,
  snapshot consistency, and scoped file previews.

## [0.1.0] - 2026-06-05

### New features

- Native Codex conversations with streaming messages, tools, approvals,
  questions, plans, goals, context usage, queues, steering, and interruption.
- Teams, multiple agents, Bench templates, agent messaging, avatars, themes,
  settings, keyboard shortcuts, file mentions, skills, and dictation.
- Claude CLI conversations and transcript hydration behind a provider-neutral
  backend contract.
- Cockpit, GitHub backlog connections, work assignments, automation loops,
  Markdown previews, and source worktree creation.

### Improvements and fixes

- Stabilized thread persistence, status updates, tool ordering, user-input
  handling, compaction, message actions, native menus, and packaged Codex paths.

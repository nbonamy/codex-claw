# Changelog

All notable Codex Claw changes are recorded here.

## [0.4.0] - 2026-08-03

### New features

- Turn-aware file links now open edit targets in their own diff tabs, while
  read and create targets continue to open source tabs.
- Agent workspaces retain per-turn diff tabs and fall back to the current Git
  review when a link has no usable turn context.
- Added a Plugins settings page with opt-in Computer Use and Chrome controls,
  ChatGPT handoff, and a catalog of common integrations.
- Markdown previews now open as tabs in the right sidebar.
- Chrome availability stays in sync with ChatGPT.
- Execution plans can be dismissed and reopened from the agent header.
- Browser and plan annotations now support voice recording and transcription.

### Improvements and fixes

- Browser annotations now dismiss on outside click and immediately resume
  element selection while annotation mode remains active.
- Plan reviews now support compact inline comments, batch refinement, clear
  confirmation, and a locked review state while a revised plan is generated;
  they now open as agent workspace tabs instead of replacing the sidebar.
- Fixed macOS voice transcription in development builds by resolving the
  bundled Apple Speech helper from the linked SDK assets.

## [0.3.1] - 2026-08-02

### New features

- Added macOS update checks, a Codex Claw menu action, a downloaded-update
  badge, and install-and-relaunch flow.
- Added the signed desktop release publishing workflow and update feed.
- Added live file activity in conversations and clickable file targets for
  reads, edits, and creates.
- Published the Codex Claw landing page with release downloads and product
  documentation.

### Improvements and fixes

- Computer Use MCP tools are hidden until explicitly enabled, while plugin
  settings persist across launches and apply to new and resumed conversations.
- Refined Plugins and Integrations settings cards, banners, spacing, and
  dialog presentation.

- Update checks now run at startup and once per hour in packaged builds.
- Git review now includes untracked files and keeps the change statistics
  visible alongside long filenames.
- File activity no longer opens files unexpectedly; explicit file targets remain
  available from the conversation.
- Preserved conversation workspace context while navigating between agents.
- Refined exploration labels and made right-sidebar resize affordances subtler.

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

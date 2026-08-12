# Changelog

All notable Codex Claw changes are recorded here.

## Unreleased

## [0.10.1] - 2026-08-12

### New features

- Agent responses can now open interactive visualizations in a dedicated,
  sandboxed workspace tab.

## [0.10.0] - 2026-08-12

### New features

- A new repository Backlog workspace lets you browse, search, and filter GitHub
  issues and pull requests, then prefill a custom prompt or dispatch focused
  investigate, fix, feedback, and review actions to the current agent or an
  isolated duplicate; work can stay in the current folder or use a new
  worktree, while pull requests check out their actual head branch.

### Improvements and fixes

- Conversation titles now stay aligned with Claw agent names, including agent
  renames, and closing an agent archives its Codex conversation.
- Git status refreshes are now limited to meaningful active-agent and Git
  lifecycle events, avoiding redundant background requests and stale results.
- Long code lines in conversations now wrap instead of overflowing the message
  pane.

## [0.9.1] - 2026-08-11

### New features

- The Git workflow menu can now create and switch to a branch in the current
  folder or a new worktree, automatically keeping the agent attached to the
  resulting workspace.
- Commit and pull-request dialogs can now ask Codex to draft concise messages
  from the selected changes without creating a visible conversation.
- Previously submitted prompts can now be recalled from the composer for quick
  reuse or editing.

### Improvements and fixes

- Settings are now organized around Codex and Claude Code, with clearer plugin
  ownership and Codex Device Pairing labels.
- Git dialogs and other app dialogs now use consistent compact actions,
  repository context, progress feedback, and completion states.

## [0.9.0] - 2026-08-11

### New features

- The agent header now provides a complete Git workflow for committing selected
  staged, unstaged, or untracked changes, pushing branches, creating draft pull
  requests, and merging or squashing branches with safe worktree cleanup and
  visible progress, success, and retry states.
- Experimental Claude Code agents can now be enabled from General → Advanced,
  using the installed Claude Code runtime with its own model, effort, permission,
  attachment, context-usage, compaction, tool-detail, and conversation-history
  support.
- Agent workspaces now include a searchable file browser and Command-P quick
  open, while workspace-local files can open safely in the in-app browser.
- Image workspace tabs now support native trackpad pinch-to-zoom around the
  pointer.

### Improvements and fixes

- Long conversations now prefetch older history before reaching the top and
  preserve chronological placement without briefly showing stale content at the
  bottom; restored local Markdown images also render again.
- Git workflow refreshes no longer spend GitHub API quota checking for pull
  requests, and rate-limit failures now report when creation can be retried.
- New Codex conversations retain their workspace classification when opened in
  ChatGPT, plugin skills use friendly plugin-qualified names, and narrow
  tool-call rows truncate cleanly instead of overflowing.

## [0.8.1] - 2026-08-09

### Improvements and fixes

- What’s New now lets you browse notes from every previous Codex Claw release.

## [0.8.0] - 2026-08-09

### New features

- Subagents are now visible from the agent header, with live and completed
  workers grouped in a compact menu and each conversation opening in its own
  workspace tab.

### Improvements and fixes

- Prompts submitted remotely now appear in the conversation without requiring
  a reload.
- File and diff previews, including Review, now scroll horizontally when long
  lines extend beyond the workspace pane.

## [0.7.0] - 2026-08-09

### New features

- Agents and project files can now be opened directly in installed editors,
  Finder, or terminals, with each agent remembering its preferred application.
- Unread agent activity is now visible in the agent list, team rail, and macOS
  Dock badge so completed work and requests are easier to locate.
- Every composer image can now keep its own saved annotation draft, be reopened
  for edits, and submit grouped feedback for multiple images in one prompt.
- Code blocks in conversations now include a dedicated copy action.

### Improvements and fixes

- Image annotation now keeps the in-app browser behind its modal, uses explicit
  Clear, Cancel, and counted Save actions, and supports Command+Enter to save.
- The selected agent now remains active after reconnecting to the backend, and
  the Chrome plugin configuration is restored correctly at startup.
- Unread Dock badges no longer retain stale counts, and Command-number hints
  disappear as soon as a real Command shortcut is used.
- Generated images now use the correct tool presentation and support reliable
  fullscreen viewing and downloads, while pasted images retain their previews.
- Empty completed responses now show a clear fallback, and interrupted or
  restored turns no longer leave tool activity displayed as running forever.

## [0.6.1] - 2026-08-07

### New features

- Codex Claw now shares ChatGPT's installed skills and plugins by default,
  explicitly asks existing installs before migrating their resource folders,
  and provides a General → Advanced setting for fresh or copied isolation.
- The prompt composer now grows with longer messages until twelve lines are
  visible, then scrolls internally.
- Pressing Escape twice within two seconds now interrupts an active response,
  even when the composer does not have focus.

### Improvements and fixes

- Changing skills and plugin sharing now keeps the desktop app open while a
  blocking reconnect screen safely restarts the backend and refreshes
  conversations, resource catalogs, and workspace state.
- Dialogs now use consistent body padding without double-spacing forms,
  including the create and edit forms for teams and agents.
- Computer Use activity now identifies the target app, control, coordinates,
  window, or display, including dedicated presentation for screenshots and
  Screen Recording permission requests.
- Absolute file links outside an agent repository now open as read-only tabs in
  that agent's sidebar workspace.
- Passive Computer Use checks, app discovery, permission requests, and
  screenshots no longer display the blue virtual cursor over the desktop.

## [0.6.0] - 2026-08-06

### New features

- Codex Claw now bundles its local Codex app-server executable, while remote
  agents continue using the Codex installation on their remote host.
- Existing Codex conversations can now be forked into a new agent from the
  agent menu or from a specific user or assistant message.
- Image annotation now lets you mark up a composer image with arrows,
  rectangles, numbered comments, zoom, color inspection, and Retina-aware
  measurements, then send the annotated image and feedback together.
- Appshots capture the frontmost macOS window directly into the active agent
  with a configurable dual-Command, dual-Option, or dual-Shift hotkey and an
  optional confirmation sound.
- Computer Use can now capture a target application window or macOS display as
  an image, with Screen Recording permission surfaced in Settings.
- Clicking an image in a conversation now opens it in a dedicated per-agent
  workspace tab.

### Improvements and fixes

- Execution plans now keep a stable Task list heading and show the model's
  plan-update title as a separate, full-width block below the header.
- Duplicated and forked agents now appear directly below their source agent.
- Conversations now open with less initial history while older turns remain
  available on demand.
- Historical image attachments render previews again, and selected attachments
  stay contained within the composer.
- Web searches now use their own tool presentation, while new SDK tool kinds
  keep their intended identity instead of falling back to a generic tool.
- Message actions are disabled while an agent is busy, controlled composer
  caret movement is preserved, and user-message presentation is more
  consistent.

## [0.5.1] - 2026-08-04

### Improvements and fixes

- Dialog close buttons now sit closer to the top-right corner, and dialogs
  without footers keep their rounded bottom corners.

## [0.5.0] - 2026-08-04

### New features

- Added an in-app What’s New dialog, available from the native Help menu and
  lower-left account menu, with release notes verified during release packaging.

### Improvements and fixes

- Long conversations now load progressively, keep only recent messages mounted
  until you scroll upward, and use less memory across long sessions.
- Large conversations no longer retransmit and redraw their full transcript for
  routine agent selection, prompt, status, or background-state updates.
- Mobile remote access can keep a plugged-in Mac awake, with streamlined
  connection, pairing, and device controls in Settings.
- Added keyboard shortcuts for opening Settings and compacting the active
  agent's context.
- Holding Command now reveals numbered shortcuts for the first nine agents in
  the active team, and Command+1 through Command+9 switches directly to them.
- Inactive agent transcripts now remain warm for 15 minutes before they are
  eligible for eviction.
- Conversations now preserve submitted `/review` commands and open external
  links correctly, while Git status is analyzed when an agent is first shown.
- Restored conversations no longer briefly show a stale execution plan while
  their message history is loading.

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

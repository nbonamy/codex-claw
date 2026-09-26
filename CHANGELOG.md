# Changelog

All notable Codex Claw changes are recorded here.

## Unreleased

### New features

- Goal mode can now be toggled from the composer menu. Goal and Plan modes are
  mutually exclusive, whichever entry point activates them.
- Changed-file headers in Git diffs can open the full file directly in a
  workspace tab.

### Improvements and fixes

- App, composer, model, and suggestion menus now use consistent spacing,
  typography, icon emphasis, and selected-state treatment.
- The backend selector above an empty composer now uses the full shelf row.
- Added and removed line backgrounds now extend across the full horizontally
  scrolled Git diff.

## [0.22.1] - 2026-09-26

### Improvements and fixes

- Quick Chats can preview absolute file links such as shared memory and
  instruction files even though they do not have a project workspace.
- Claude Code keeps live tool calls and the following answer in one message
  when conversation history refreshes during generation.
- Saved-draft actions remain available through their keyboard shortcuts and
  the Edit menu without duplicating them in the composer menu.

## [0.22.0] - 2026-09-26

### New features

- Choose Codex or Claude Code across agent creation flows, including worktrees,
  work items, projects, and repository URLs. Fresh chats can switch before the
  first prompt, and independent reviews can use a different backend. The
  selector stays hidden when only one backend is enabled.
- Save a prompt or selected text for later with ⇧⌘X, then search and restore
  persistent drafts with ⇧⌘V.
- SSH connections can install Claude Code and show its sign-in status with
  guided authentication steps in Settings.
- Reviewers can add, correct, or retract structured findings across turns
  while a review remains open.
- The new Agent menu groups edit, duplicate, fork, compact, compress, resume,
  and restart actions in the same order as the agent context menu.

### Improvements and fixes

- An empty, idle composer can send “continue”; a restored interrupted turn
  resumes through its dedicated action without adding a user prompt.
- Git diff menu statistics align with the main indicator, and the selected
  scope is easier to distinguish.
- Repository URL acquisition accepts SSH addresses and keeps the selected
  backend through agent creation.
- Remote Codex sign-in distinguishes unavailable status from a required
  sign-in, and Claude settings stay in sync with remote hosts.
- Independent reviews with no remediated findings now say that no code changes
  were made.

## [0.21.1] - 2026-09-25

### New features

- The in-app browser now offers page zoom controls and a device toolbar with
  responsive, phone, tablet, desktop, and custom viewport sizes.
- Capture the visible browser page or a selected area directly to the clipboard.

### Improvements and fixes

- Code reviews end with a short, natural summary while keeping the detailed
  findings in the Review pane. After an independent review, the original agent
  receives a concise, programmatic list of remediated findings.

## [0.21.0] - 2026-09-25

### New features

- Visualize diagrams now open on a persistent canvas. Edit supported Mermaid
  shapes, annotate selected elements for the agent, and export the canvas as a
  PNG. SVG and generated-image diagrams remain image elements on the canvas.
- Visualize diagrams now belong to their Git repository instead of the agent
  that created them. Agents in linked worktrees share diagrams and editable
  canvases, which remain available after a worktree agent is removed.
- Browser tabs can copy their current URL or open it in the system browser.
  The address bar also offers an open-external action on hover or focus.

### Improvements and fixes

- Creating a project from a Quick Chat now shows progress through folder
  creation, agent setup, and the first prompt.
- In-app browser pages remain visible beneath Claw menus and dialogs instead
  of disappearing when an overlay opens. The empty browser surface is white
  and no longer shows a loading message.
- Tool-opened browser pages now keep the requested URL in the address bar,
  and resizing the workspace no longer stalls when the pointer crosses the
  embedded browser.
- Workspace tab labels collapse before their close buttons, keeping the close
  action available until tabs reach icon-only width.
- Selecting `/goal` opens a composer mode for the objective rather than sending
  an empty goal immediately. Slash-menu keyboard selection now distinguishes
  Tab completion from Enter activation.
- The conversation shows “Working” when hidden Claw tool activity is the only
  visible sign of an active turn, and skill reads show the skill name instead
  of `SKILL.md`.

## [0.20.7] - 2026-09-24

### New features

- Turn a Quick Chat into a project on request. Codex Claw creates the
  folder and a project agent, hands over the conversation's decisions, and
  keeps the original Quick Chat available.

### Improvements and fixes

- Projects can use ordinary folders without Git. New projects start with an
  empty folder, and folder agents stay separate from Quick chats.
- Quick Chats can access Claw tools, including project creation.
- Codex Claw uses its own Computer Use tools instead of the bundled alternative;
  older Computer Use calls also have readable activity labels.
- Workspace tabs keep a stable height when labels appear or collapse, and
  multi-target tool titles display their overflow count consistently.

## [0.20.6] - 2026-09-24

### Improvements and fixes

- Single free-text questions now use a compact input-and-send layout. In
  multi-question cards, the primary action follows Back in the footer.

## [0.20.5] - 2026-09-24

### Improvements and fixes

- File tabs can copy either an absolute or a repository-relative path. Their
  tooltips wait longer, and the conversation keeps a readable width beside the
  workspace.
- The Git indicator says “No changes” when the selected diff is empty, and
  weekly usage limits show a live time-to-reset countdown.
- Visualize is available from an empty workspace, even before a diagram session
  exists, and opens the same flow as `/visualize`.
- Completed work can offer review at the handoff, while status updates and
  turn-completion calls no longer clutter conversation or execution previews.
- App and chat controls no longer select their labels when clicked. Completed
  earlier turns no longer retain a stale streaming indicator.

## [0.20.4] - 2026-09-24

### New features

- Right-click workspace tabs to copy a file path, close that tab, or close the
  other tabs.

### Improvements and fixes

- Workspace tabs shrink to icons before scrolling is needed, with navigation
  controls for overflow and a full-title tooltip on hover.
- Browser menus and tab menus now appear above the native browser view instead
  of being hidden behind it.

## [0.20.3] - 2026-09-23

### Improvements and fixes

- Removed the Command-R shortcut for Restart Agent to prevent accidental restarts;
  the action remains available from the menu.
- Increased the backend event buffer to reduce the chance of losing a large
  conversation update during a burst. Recovery from a fully saturated buffer
  remains a separate issue.

## [0.20.2] - 2026-09-23

### Improvements and fixes

- Codex blocking questions now use the conversation composer instead of a narrow
  inline tool card. Answering restores the composer and leaves the completed
  answer in the transcript.
- Asynchronous questions return the normal composer after their turn and remain
  available through a Pending question control. They can be reopened or
  dismissed, and a new prompt no longer revives an obsolete question.
- Question responses still reach their conversation if a request event was
  missed, and review invitations clear when the user submits a new prompt
  without clearing other proposed actions.

## [0.20.1] - 2026-09-23

### New features

- Start a Mission from an open GitHub issue in any repository represented by its
  team. The issue picker opens on the first available repository, and the issue
  details become the Mission's starting context.

### Improvements and fixes

- Missions now belong to their team. Closing a team also removes its Missions
  and workers while leaving Mission worktrees on disk, with the effect stated
  in the confirmation dialog.
- Restarting Codex Claw restores the selected Mission workspace instead of
  showing its lead as an ordinary agent thread.

## [0.20.0] - 2026-09-22

### New features

- Missions guide work from requirements and tickets through implementation,
  Review, and Ship in a dedicated workspace. Stage artifacts, agent progress,
  repository worktrees, and delivery actions stay together. Mission Review
  presents selectable findings, repository-specific fixes, a Changes tab, and
  a fresh review run; shipping does not require fixing every finding.
- The new Review pane can review uncommitted or branch changes with the current
  agent or an independent reviewer. Triage findings, discuss them in chat,
  apply selected fixes as a batch, and run another round that remembers skipped
  findings and checks accepted fixes for regressions.
- `/visualize` opens a persistent diagram workspace beside the conversation.
  Agents can suggest, create, edit, and delete Mermaid, SVG, or generated-image
  visualizations; thumbnails, zoom, and pan make them easy to inspect.
- Agents can propose moving implementation into a dedicated worktree through
  an inline action that the user can accept or dismiss. Co-agents inherit the
  originating model and reasoning effort unless explicitly changed.
- Worktree branches can be updated with the latest base-branch changes before
  merging, with progress and a conflict-resolution handoff to the agent.

### Improvements and fixes

- The Git diff indicator now defaults to uncommitted changes, remembers its
  selected mode per agent, and changes mode without opening the diff pane.
- Manual worktree creation uses the same staged progress experience as agent
  creation. Merge and cleanup report retained folders without losing the
  completed work, and shared worktrees are not offered for deletion while
  another agent still uses them.
- Agent status clears at turn completion, and status, announcements,
  celebrations, and proposed actions can complete together with fewer tool
  steps. Review invitations appear when uncommitted work is ready for review.
- Generated images remain visible outside collapsed assistant work and can be
  copied directly. Codex questions now use an in-conversation answer composer
  with simpler choices and an explicit cancel action.
- Visualize tools remain discoverable throughout an agent session while their
  actions still require the matching open pane. Long-running backend requests
  use operation-specific timeouts to avoid premature failures.

## [0.19.5] - 2026-09-18

### Improvements and fixes

- File links in conversations can now preview files anywhere on the agent's
  local or remote host, including shared instructions and other resources
  outside the repository.
- `/compact` is passed through to Codex instead of opening Claw's retired
  session-compression dialog. Slash-command suggestions now appear only when
  `/` is the first character in the prompt.
- Delegation instructions now distinguish engine-native subagents from separate
  Claw co-agents, asking for clarification when a request is ambiguous.
- The selected agent row preserves the sidebar's translucent background.

## [0.19.4] - 2026-09-18

### New features

- Select text in a conversation, add a comment, and carry it into the next
  prompt as a compact, removable annotation. Annotation drafts stay with their
  agent across navigation, survive failed submissions, and keep their detailed
  context out of the visible user message.

### Improvements and fixes

- Agent creation, navigation, announcements, and celebrations now respect the
  initiating or receiving client instead of leaking shared selection state
  across desktop, web, or remote clients.
- Plan reviews, queued prompts, approvals, and questions remain scoped to the
  correct agent and conversation. Replayed plans no longer create duplicate
  reviews, and cancelled Claude permission requests clear promptly.
- Interrupted and failed Codex work groups are labeled as stopped or failed
  instead of appearing completed.

## [0.19.3] - 2026-09-15

### Improvements and fixes

- Plan Review now opens reliably for plans returned through Codex Plan mode.
  Implement Plan closes the review before submitting exactly one implementation
  prompt, and the footer actions use the standard priority and ordering.
- Live Codex execution plans once again appear in the conversation mini panel.
  The right-workspace add menu no longer includes the redundant Backlog entry.

## [0.19.2] - 2026-09-15

### New features

- Press Command-K to search and jump to any agent across teams. Results show
  repository and team context, prioritize unread agents and then recent
  activity, and switch teams automatically when needed.
- Remote teams can now create Git projects, browse existing folders, and clone
  GitHub repositories directly on their devbox. Connection settings detect
  mismatched Claw and Codex versions, upgrade both managed runtimes together,
  and support ChatGPT device-code sign-in without moving tokens through Claw.
- Personalization settings can edit the global developer instructions used by
  Codex or Claude, with an explicit option to replace both. Git settings now
  accept custom guidance for generated commit messages and pull request titles
  and descriptions.

### Improvements and fixes

- Codex conversations use reasoning summaries as activity labels and correctly
  reopen a completed work group when an asynchronous answer resumes the turn.
  Codex memory support is enabled for new app-server sessions.
- Queued prompts are delivered only once when turn completion and idle events
  arrive together.
- Remote folder selection is more compact and direct, while longer remote
  discovery, authentication, prompt, and repository operations have enough
  time to finish without spurious request timeouts.
- Active-team rail indicators now pulse by brightness without fading, and Git
  worktree initialization is grouped with the rest of the Git settings.

## [0.19.1] - 2026-09-14

- Computer Use actions can now observe their settled result in the same call, wait for expected text, and type, replace, or submit directly into a targeted field without foregrounding the app.
- Computer Use now recovers cleanly from lost observations without repeating delivered actions, returns more compact contextual state, and opts into screenshots only when visual context is useful.

## [0.19.0] - 2026-09-14

### New features

- Backlog and Agents now have separate global rail entries. Backlog remains the
  operator inbox for connected work, while the new agent Cockpit shows every
  agent grouped by team or ranked by current and recent activity, with quick
  prompts available directly from each card.
- Codex agents can ask non-blocking questions inline while continuing to work.
  Option and free-text answers stay attached to the question and restore with
  conversation history.
- Computer Use is upgraded to v2.0.1 with explicit window selection, stable
  element observations and state diffs, combined accessibility and screenshot
  capture, plus keyboard shortcuts, drag, paste, text selection, secondary
  actions, and right or middle clicks.

### Improvements and fixes

- Returning to a previously viewed conversation now restores its rendered
  history and scroll position across agent and team switches.
- Cockpit Recent mode prioritizes agents currently working before idle agents,
  and persisted activity times keep its ordering meaningful after restart.
  Team icons show active work without overriding unread indicators.
- Asynchronous questions and active-turn state now reconcile correctly after a
  restart. Optional questions no longer leave agents waiting for input, and
  graceful SDK shutdown gives provider history time to flush.
- Context-compaction markers now settle cleanly and retain their position among
  surrounding activity. Duplicate skill mentions are suppressed, and composer
  menu chevrons align consistently.
- Refined the Cockpit layout menu, title hierarchy, and Backlog rail icon for a
  denser, quieter workspace.

## [0.18.0] - 2026-09-13

### New features

- Connected GitHub accounts now give Codex and Claude agents access to
  GitHub's hosted MCP tools through Claw-managed, automatically refreshed
  credentials. Claw avoids duplicate GitHub tool surfaces while preserving the
  ChatGPT connector as a fallback when its own GitHub connection is unavailable.
- Create an empty Git-backed project directly from the Add Project menu.
- Choose which changes to review from the agent header: the current branch,
  all uncommitted work, unstaged or staged changes, the latest turn, or an
  individual recent commit.

### Improvements and fixes

- Switching teams now updates immediately and shows the selected conversation's
  loading state instead of blocking navigation or briefly appearing empty.
- Git statistics refresh while an active agent edits files, and Git reviews now
  load reliably without clone errors or hiding valid branch and commit diffs.
- Assistant activity keeps its original order around final responses, and
  generated media produced during a turn stays grouped with its collapsible
  work details.

## [0.17.0] - 2026-09-08

### New features

- Compress Session starts a fresh conversation with a condensed handoff of
  completed work, key decisions, and next steps. The original conversation is
  archived, and the new session keeps the agent's model and reasoning settings.
- Closing or restarting a Codex agent now archives its retired session. Resume
  Session searches both active and archived conversations in the agent's folder
  and restores archived sessions when selected.
- Save favorite model, reasoning-effort, and speed combinations directly from
  the model menu. Favorites can be reordered or removed in a dedicated dialog.
- The bundled Codex runtime now includes GPT-6-Astra where available to your
  account.

### Improvements and fixes

- Codex conversations now group assistant work by turn, with clearer separation
  between intermediate activity and the final response.
- Improved conversation loading after restart, with automatic retries for
  transient failures and a visible Retry screen when history cannot be loaded.
  Missing optional skill metadata no longer prevents conversations from loading.
- Editing, deleting, retrying, and forking conversation turns now use the
  provider's authoritative history. Long rollback operations have more time to
  finish, and action failures remain visible without discarding the session.
- Fixed first-prompt and Thinking indicator flicker during new conversation
  creation, duplicate user messages, and duplicate compaction indicators.
- Restored queued prompts above the composer, cancellation, and follow-up
  actions. Model selection keeps the menu open to choose reasoning effort, and
  favorites correctly apply Fast mode.
- Merge now checks that branches include the latest target-branch commit
  before merging. Squash-merge cleanup no longer prevents a
  requested push, and merge and pull-request dialogs warn about uncommitted work.
- Automated work selection now considers eligible items across the configured
  repositories before creating agents and isolated worktrees. Completed workers
  remain available for review or continuation.
- Spoken acknowledgments can be limited to dictated prompts, and acknowledgments
  that will not play are labeled as skipped. Celebrations only play for the
  selected agent.
- Agent headers avoid repeating unnamed agents' branch names and show their
  repository context immediately after creation. Update badges no longer appear
  while merely checking for updates.
- Removed the obsolete Bench, legacy backlog and issue-creation screens, and
  Prepare Work flow. Temporarily hidden the unstable current-turn diff summary
  above the composer.

## [0.16.0] - 2026-09-03

### New features

- Agents can now speak a brief acknowledgment when work starts and an optional
  completion cue through on-device neural voices on macOS. Voice, agent scope,
  foreground-only behavior, previews, and a global mute shortcut are available
  in Settings.
- Delegated Git work can now report back to its parent agent when creating a
  pull request or merging directly. Claw asks the worker for a final handoff,
  shows the handoff phase in progress, and lets the operation continue in the
  background.
- Claw now tracks pull requests created for agents and flags them when they are
  merged or closed, with guided cleanup for the agent, worktree, and local
  branch while preserving work from unmerged pull requests.

### Improvements and fixes

- Repository and agent drag-and-drop are now distinct: repositories move with
  all their agents, while agents can only be reordered inside their repository.
- The active sidebar session is easier to distinguish from other sessions.
- Agent celebrations now respect the celebration setting and vary their visual
  effect instead of always showing confetti.
- Rolling back a long, paginated Codex conversation now uses the current Codex
  revert protocol and refreshes the retained history correctly.

## [0.15.2] - 2026-09-02

### Improvements and fixes

- Composer chips and rendered mentions now align cleanly with the surrounding
  text.
- The empty right workspace no longer shows a redundant Backlog shortcut;
  repository work remains available from the new-tab menu.

## [0.15.1] - 2026-09-02

### Improvements and fixes

- Resumed goals now continue running across restarts, remain visibly marked as
  working between turns, and leave the composer shelf once complete.
- Claw agents now receive explicit guidance for single-call worktree
  delegation, persistent Markdown presentation, and meaningful celebrations,
  making those existing workflows more reliable to invoke.

## [0.15.0] - 2026-09-02

### New features

- Agents can now delegate work as one complete handoff: create an isolated
  worktree, start another agent with initial instructions, and show staged
  setup progress while the agent gets ready.
- New worktrees can now initialize before an agent starts. Repository-owned
  `.agents/worktree` scripts take precedence, while Auto-detect can copy local
  environment files and restore Node.js, Python, and Go dependencies. Settings
  can limit initialization to repository instructions or disable it entirely.

### Improvements and fixes

- Work assignment and worktree creation now use clearer new-agent and
  existing-agent choices, allow branch names to be edited, and offer to reuse
  an existing worktree instead of surfacing a raw Git error.
- Cockpit repository rows now link directly to GitHub instead of showing an
  ambiguous agent-launch control.
- Closing an agent now gives linked-worktree cleanup enough time to finish
  without timing out.
- Plain code blocks now preserve their original line breaks when no syntax
  highlighter is available.

## [0.14.3] - 2026-09-02

### Improvements and fixes

- Agents are now explicitly prompted to celebrate releases, hard fixes, major
  features, migrations, and genuine breakthroughs, making configured visual
  celebrations more reliable after meaningful accomplishments.

## [0.14.2] - 2026-09-01

### New features

- Starting work from an issue or pull request now shows a staged preparation
  view while Codex Claw creates the branch or isolated worktree, starts the
  session, and hands over the work context.
- Inline conversation images now open or focus a reusable image workspace tab,
  while the explicit maximize control opens the stock fullscreen viewer.

### Improvements and fixes

- Older conversation history now prefetches as the transcript reaches the top,
  avoids duplicate requests, and preserves the visible scroll position as
  earlier messages arrive.
- Initial ChatGPT connection now uses a smooth edge-to-edge progress indicator.

## [0.14.1] - 2026-09-01

### Improvements and fixes

- Update checks now show live checking and downloading progress in the header
  before an update is ready to install.

## [0.14.0] - 2026-09-01

### New features

- Loops are now Automations throughout Codex Claw, with existing saved loops,
  execution history, and work assignments migrated automatically.
- GitHub can now be connected directly from first-run onboarding or the
  repository picker through a secure browser authorization flow.
- Experimental Linux x64 builds now bundle the matching Codex runtime while
  keeping macOS-only Computer Use and Appshots features disabled.

### Improvements and fixes

- First-run setup now provides a consistent ChatGPT and optional GitHub
  onboarding experience, ending with a single celebratory completion screen.
- Generated images now render through an app-scoped local-media protocol,
  restoring image previews without exposing arbitrary local files.
- Long and restored conversations now omit unnecessary historical tool
  payloads, reducing synchronization size while preserving the genuine latest
  messages when older history loads.
- The GitHub repository picker now keeps a stable height across loading, empty,
  filtered, and populated states.

## [0.13.0] - 2026-08-30

### New features

- Computer Use now provides an on-demand operating guide and semantic
  Accessibility targeting for dialogs and native menus, including safe menu
  dismissal without moving the physical pointer.

### Improvements and fixes

- Computer Use now bundles helper 0.3.0 with absolute screenshot coordinate
  metadata, a guarded physical-click fallback for Electron controls, and
  automatic virtual-cursor cleanup after inactivity.
- Form dialogs now share one compact, labels-above-fields layout, while the
  legacy File → New Agent action and Command-T shortcut have been removed in
  favor of contextual repository and session entry points.
- Team rail avatars and the new-team control now use a consistent square shape,
  with a cleaner focus ring and a clearer unread indicator.
- Agents created through MCP now use repository identity instead of accepting a
  separate agent avatar; custom names remain optional.

## [0.12.0] - 2026-08-30

### New features

- Sessions is now organized around repositories, branches, worktrees, and chats,
  with collapsible repository groups, persistent custom repository icons, and
  compact controls for starting work where it belongs.
- Projects can now be added from a local folder, a GitHub repository, or a
  repository URL, then opened from a branch, pull request, or issue without
  leaving Claw.
- Repository work can now continue in an existing session on a branch or start
  in a new isolated session and worktree, with branch-aware worktree creation
  and assignment directly from the Sessions workflow.
- Workspace-free Quick Chats now provide persistent conversations for work that
  does not belong to a repository.
- Team agents can now be mentioned in prompts with stable `@` suggestions, and
  agents can trigger optional, user-controlled celebration effects for the
  moments that deserve them.

### Improvements and fixes

- Long conversations now synchronize with bounded snapshot and transcript
  payloads, keep retry progress out of durable history, and use Codex 0.151.0's
  stable image-aware compaction support to reclaim substantially more context.
- Fast mode now remains enabled for a conversation after Claw restarts.
- Agent editing is now limited to an optional display name, while unnamed
  sessions consistently use their branch or conversation title.
- ChatGPT integrations now offer to quit an already-running normal instance
  before relaunching it with Claw's isolated Codex home.
- Cockpit now shows unread indicators for teams containing unread sessions,
  native Edit menu actions are restored, subagent conversations recover from
  oversized-history failures, and recalled prompts no longer depend on browser
  text selection.

## [0.11.1] - 2026-08-14

### Improvements and fixes

- Closing an agent now preserves its provider conversation in history instead
  of archiving the Codex thread.
- Completed assignments whose source work item remains open now return to
  Backlog, keeping Cockpit counts and available work consistent.

## [0.11.0] - 2026-08-14

### New features

- Cockpit is now a cross-repository backlog-first operator inbox, with
  repository navigation, All/Backlog/WIP/Focus views, an Assigned to me
  default, and true paginated GitHub results.
- Multiple issues can be selected and launched together into a chosen team;
  each item gets its own automatically named background agent and isolated
  worktree without additional setup dialogs.

### Improvements and fixes

- Repository recency now follows open issue and pull-request activity, Cockpit
  automatically falls back to the most useful non-empty view, and completed or
  orphaned assignments no longer distort active-work counts.

## [0.10.2] - 2026-08-12

### Improvements and fixes

- Repository backlog assignments now stay attached to their agents and are
  grouped as in progress, blocked, ready for review, or completed; agents can
  update that lifecycle with a visible note, while users can jump to the owner
  or clear the assignment and optionally close its agent.
- Closing an agent that uses a linked worktree now offers safe cleanup of the
  worktree and local branch, with an explicit option to delete the tracked
  remote branch; backlog work also reuses existing branches and worktrees when
  possible.
- Queued prompts can now be edited directly in the composer, including
  atomically steering the revised prompt with Command/Ctrl+Enter.
- Backlog issue and pull-request links now open directly in the system browser,
  duplicated work starts in the background without stealing focus, and action
  popovers remain open until dismissed with a click.

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

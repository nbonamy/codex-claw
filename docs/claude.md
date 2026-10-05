# Claude Code Integration

Korus uses the official Claude Agent SDK through `daemon`. This document
describes its integration and ownership boundaries.

## Existing Korus Integration Shape

Claude steering, same-folder native forks, and native goals enter through the
existing driver/RPC capabilities. The transport keeps ownership of queued input
until the SDK replays its UUID and the resulting work completes; stopping a
steered turn closes that owned query. Fork cutoffs come from persisted native
message boundaries, not renderer IDs. Goal state comes from structured native
`goal_status` transcript records, with explicit clear distinct from completion.
See the [capability audit and runtime evidence](research/claude-capabilities.md)
for the tested versions, semantics, limitations, and reproduction details.

The host reports explicit interruption before failure, and failure before
successful completion. An error result or unexpected SDK iterator end emits a
failed terminal outcome, including when a durable task result was already
submitted. That result remains provisional and cannot trigger success delivery.
An asynchronous interrupt callback may only settle and release its own turn;
it cannot clear a newer turn using the same session. Readiness and successful
task completion remain separate concepts.

Subscription usage is fetched on demand by `daemon`, using the configured Claude
home's OAuth login in place (macOS Keychain, credential file fallback elsewhere).
Credentials never enter IPC, snapshots, or renderer state. The internal
`api.anthropic.com/api/oauth/usage` endpoint requires `user:inference` and
`user:profile` scopes and provides overall five-hour and weekly percentages.
This is a CLI-internal endpoint, not a stable public SDK API; errors are bounded
and surfaced separately from accounts without quotas. API-key/third-party
billing has no subscription usage row. Korus does not refresh or rewrite OAuth
credentials; an expired login needs to be refreshed through Claude Code.

Claude authentication failures emit the app-owned `provider.authenticationChanged`
event with disconnected, credential-free account metadata. The owning daemon
updates its connection observation and publishes a snapshot immediately, so
Settings and new-work admission no longer rely on the previously cached login.
This leaves the engine's enabled preference and existing conversations intact;
service errors and usage limits do not imply logout. Claude Code still owns
credential renewal and sign-in. Failed turns remain valid conversation snapshots
across the backend transport and history refresh.
Before admitting new work, the daemon re-probes an installed engine last observed
disconnected. A login completed externally can therefore make the next retry
succeed without first refreshing Settings. Healthy observations remain cached;
this is not continuous authentication polling or Korus-owned token renewal.

First-run onboarding offers Codex and Claude independently and requires an
explicit Continue after at least one authenticates. Local Claude status is
checked by `daemon` against the SDK's configured home; sign-in instructions use
that exact directory and support both Claude subscriptions and Console API
billing. Onboarding completion is persisted, but live engine authentication is
not. A Claude-only installation does not need successful Codex authentication.
Existing workspaces remain accessible when an engine is disconnected; new work
requires a connected engine on its owning host.

Korus currently talks to provider runtimes through `daemon`. The daemon
owns the Codex app-server and Claude Code child processes, request routing, and
provider-to-app event adaptation. Electron and Web clients consume app-owned
backend events and `RendererMessage` shapes.

The Claude driver lives under `backend/src/claude/` and uses the official
`@anthropic-ai/claude-agent-sdk` transport. The SDK launches Claude Code with
its native settings, skills, hooks, and project instructions. Korus does not
call the Messages API directly or replace Claude Code with a generic model loop.

Claude Code installation is explicit in onboarding or Settings, including on
remote hosts. SSH connection setup does not install a coding engine. The
Anthropic installer owns its per-user
`~/.local/bin/claude` launcher and `~/.local/share/claude/versions` directory;
Korus does not copy Claude into its pinned Codex runtime directory. Remote
authentication is separate: the remote user signs in with Claude Code before
running Claude agents there. If remote Claude installation fails, Codex remains
available on that connection. Settings can retry installation independently.
Runtime discovery includes `~/.local/bin` when launching Claude from a
non-interactive SSH session.
For a ready SSH connection, Settings checks the remote user's Claude login with
the remote daemon's `claude auth status` in its configured home and shows only
the logged-in state. When sign-in is needed,
Settings presents `claude auth login --claudeai` for a Claude subscription and
`claude auth login --console` for Anthropic Console API billing. The user runs
one command in an interactive shell on that host, then refreshes status.
Claude Code owns the login and credentials;
Korus does not move them between machines.

Each live Claude session owns one long-running Agent SDK query. Korus sends
subsequent turns through that query's streaming input instead of spawning a new
`claude -p` process for every prompt. A persisted agent with no live query is
resumed through the SDK's `resume` option. Korus retains at most one idle live
query per agent: switching conversations releases the previous query, while an
agent-identity, instruction, MCP, or permission-safety change restarts and
resumes the query so stale configuration cannot leak into later turns.

Code review defaults to a separate visible reviewer agent in the same workspace.
The user may instead use the current agent and session. Review turns use the
normal Claude conversation replica while adding only the review-session finding
tools; clarification and batched remediation resume that same session id. An
independent reviewer starts without the source conversation history but inherits
its selected model and reasoning effort. For an independent reviewer, `Review
again` retains the old Claude session and starts a fresh one on the same sidebar
agent. Current-thread reviews preserve the user-owned session for every round
and after finish; an independent reviewer's agent is removed when the review
finishes, but its native history is retained and a report is saved first.
Inspection turns must successfully call `finish_review_round({ findingCount })`
before returning. Korus validates the count against its ledger and waits for
the turn to end before advancing. Missing confirmation fails the round and
pauses automatic mode; native `ReportFindings` calls do not populate this ledger.

The transport configures:

- the Claude Code system-prompt and tool presets;
- user, project, and local setting sources;
- the active Korus agent's working directory, model, and permission mode;
- Korus's agent-scoped collaboration MCP server and allowed-tool rule;
- partial streaming events for responsive text and tool cards.

Claude's app-owned MCP server is named `korus`, from `product.mcpServerName`.
Claude Code reserves `workspace` and silently omits a dynamic server with that
name. Tool allow rules, review prompts, and collaboration instructions must use
the same configured namespace. Codex retains its existing `workspace` namespace;
tool presentation recognizes both names, including retained Claude history.

The live Claude transport uses the Agent SDK and feeds its messages into one
Claude conversation host. The host is the sole owner of the normalized Claude
transcript and maps SDK stream messages into immutable
`ClaudeConversationEvent`s:

- `system/init` or any message with `session_id` records a Claude
  `BackendSession`.
- `stream_event` text deltas become incremental `message.delta` events.
- `stream_event` tool starts and input JSON deltas create and update running
  tool cards before the final assistant message arrives.
- assistant text blocks become `message.delta`.
- `tool_use` blocks pass through a shared Claude semantic adapter. Bash keeps
  its command and description; Read, Write, Edit, Glob, Grep, web, Agent, and
  MCP tools expose app-owned titles, paths, actions, icons, and available line
  statistics without making the renderer provider-aware.
- Read, Write, Edit, and NotebookEdit emit app-owned file activity so file
  links and authoritative repository Git status stay current while Claude is
  working.
- `tool_result` blocks update those tool cards and their semantic lifecycle.
- `result` completes the turn or emits an app error.

Claude text currently has no equivalent explicit work/final phase in Korus's
adapter. It therefore remains unphased and uses the shared SDK renderer's
existing flat message layout. Korus does not guess a final-answer boundary or
label every Claude message as final; if the provider exposes reliable phase
semantics later, the driver can populate the same provider-neutral fields.

The host maintains one `ClaudeConversationSnapshot` per agent and publishes a
bounded reset followed by revisioned provider deltas. The renderer applies
those deltas with the shared Claude replica; `AppSnapshot` and the generic Korus
coordination reducer never contain or mutate Claude messages.
Conversation refreshes republish the snapshot of an open live session, preserving
its message identities and turn state. Transcript history is used when no live
session exists; an in-flight history read cannot replace a session started during
that read.

This gives Claude agents local prompt send, persistent multi-turn sessions,
streaming display, session resume, and interrupt through the
`AgentBackendDriver` lifecycle seam. Agent SDK permission callbacks are
normalized into the Claude provider snapshot. Claude's `AskUserQuestion` tool
is normalized to the provider's multi-question form, and the response is
routed back to the blocked SDK tool call. Session-scoped and persistent
permission suggestions back Korus's Allow for conversation and Always allow
choices.
The main and split panes project pending permission parts into the shared SDK
composer's `confirm_tool` requests, using the exact transcript tool-part ID.
Resolution stays on the existing agent-targeted client-response path; the SDK
hides pending inline duplicates and restores the retained draft and attachments.
Claude's proactive permission posture remains distinct from Codex approval
presets. The composer renders a capability-driven Permissions submenu with
Claude's own `default`, `acceptEdits`, `dontAsk`, `auto`, and
`bypassPermissions` modes. Native `plan` permission mode remains behind
Korus's separate Plan-mode control. The last permission choice is persisted in
the Claude branch of the agent defaults and routed to the Claude driver as an
opaque mode ID. The driver validates the advertised mode before applying it;
`bypassPermissions` also enables the Agent SDK's explicit dangerous-skip
safety gate. Codex continues to use its independent approval-preset contract
and menu.
Claude advertises prompt attachments through the shared composer. The Electron
attachment registry resolves renderer-safe references before they reach
`daemon`; the Agent SDK transport sends supported images, PDFs, and text/source
files as native multimodal content blocks. Other binary files remain available
to Claude Code by their trusted local path. Rollback and edit/retry remain
disabled until those surfaces are implemented reliably for Claude. Model
listing is local.
Claude context usage comes from the Agent SDK's `getContextUsage()` control
request and is normalized into Korus's provider-neutral context gauge after
session initialization, turns, and compaction. Selecting a persisted Claude
conversation also opens a short-lived, non-persisting SDK query to restore the
exact gauge without sending a prompt or changing the transcript. Claude's
automatic and manual compaction status/boundary messages reuse Korus's existing
compaction lifecycle.
`/compact` (including optional summary instructions) remains a Claude-owned
local command; Korus routes it without displaying a user prompt, and completed
boundaries are restored from Claude transcript history.
Skill listing is filesystem-derived: Korus reads user skills from its configured home's `skills` directory
and project skills from `<agent-folder>/.claude/skills`, parses each
`SKILL.md` frontmatter, and lets project skills override global skills with the
same name.
Folderless Quick Chats use the user's home directory as Claude's runtime cwd,
without assigning a project folder to the agent. Model discovery, turns, and
transcript recovery use that same directory; skill discovery includes only
user skills. Claude conversation references retain a null folder for these chats.
Claude advertises `planMode: "prompted"`: Korus owns the composer Plan-mode
flag, and when the renderer sends `planMode: true`, the driver keeps the prompt
text unchanged and starts the Agent SDK turn with its native `permissionMode:
"plan"`. This avoids relying on the interactive `/plan` slash command, which
is not available in every SDK environment. Claude's stream output then exposes
a provider-specific plan flow:

- `EnterPlanMode` marks the Claude session as planning.
- `system/status.permissionMode: "plan"` is normalized to
  `conversation.modeUpdated`.
- Claude may write a private plan file under `~/.claude/plans/...`; Korus treats
  that `Write` tool's streamed `content` as `turn.proposedPlanDelta` and does
  not render the private write as a generic chat tool.
- `ExitPlanMode` carries the final `input.plan`; Korus normalizes it to
  `turn.proposedPlanCompleted` and opens the app-owned plan preview.

Claude's plan file is a provider artifact, not Korus's source of truth. The
source of truth for the UI is the app-owned agent plan stored from normalized
plan events. Plan comments keep `planMode` enabled and send a follow-up prompt
so Claude can emit a new `ExitPlanMode` plan; confirming clears Plan mode and
sends the implementation prompt through the normal Claude path.

Claude transcript history is loaded from Claude Code's local JSONL transcripts,
not from the CLI. Claude stores project transcripts under
`<configured-home>/projects/<project-directory>/<session-id>.jsonl`, where the project
directory is the absolute folder path with non-alphanumeric characters replaced by `-`
(`"/Users/nbonamy/src/id8"` becomes `"-Users-nbonamy-src-id8"`). A
`sessions-index.json` file can also point to the transcript path.

The Claude transcript adapter lives in `backend/src/claude/` and reads only the
displayable records:

- `type: "user"` entries with non-meta text become user `RendererMessage`s.
- `type: "assistant"` text blocks become assistant message text parts.
- assistant `tool_use` blocks use the same semantic Claude tool adapter as the
  live stream, preserving commands, filenames, MCP identity, and available
  line statistics after restart.
- user `tool_result` blocks complete the matching tool cards.
- Non-display queue operations, `last-prompt`, sidechains, and meta
  local-command records are ignored; structured goal records hydrate goal state.

On agent selection or startup hydration, the Claude conversation host emits a
`claude.conversationSnapshotChanged` frame. Later SDK and transcript events are
transported in `claude.conversationEventReceived` frames. Korus owns the outer
agent/revision envelope but does not reinterpret the provider event.

The Resume Session dialog opened from an agent's sidebar menu is the Claude
implementation of the generic driver capability documented in
[architecture](architecture.md). The daemon scans that agent folder's
`projects/.../*.jsonl` entries under the configured Claude home, sorts them
newest first by file modification time, and returns app-owned
`ConversationSummary` rows with an opaque `BackendConversationRef`. Clicking a
session row stores that session id as the agent's current
`BackendSession`, reloads its transcript messages, and the next prompt resumes
that session through the Agent SDK. Resume is allowed only while the agent is
idle.

The Agent SDK launches the configured executable directly rather than through
a shell. Prompt and developer-instruction text is delivered over the SDK input
stream and is not included in Korus's process logs.

Before a Claude session starts, Korus offers the safe local aliases `opus`,
`sonnet`, and `haiku`, with `sonnet` as the default. When a Claude agent is
selected, Korus opens a short-lived Agent SDK query with session persistence
disabled, reads its initialization model catalog, and closes it without sending
a prompt. The composer therefore refreshes to the SDK's current models after a
restart without creating an empty Claude conversation. Display names,
descriptions, and supported effort levels come from the SDK, so the composer
only offers an effort selector for models that advertise it. The selected
effort is passed to the Agent SDK on the first turn and updated on later turns
with its runtime flag settings API. Claude transcript hydration also reads the
latest main-thread assistant model and effort from the JSONL record, so opening
or reloading a conversation restores its own selection. When older history has
no such metadata, Korus falls back to the last Claude model and effort used by
that agent; resolved transcript model IDs are matched back to the SDK catalog's
friendly model entry.

The transport prepends common user binary folders such as `~/.local/bin`,
`~/bin`, `/opt/homebrew/bin`, and `/usr/local/bin` to `PATH` because packaged or
GUI-launched Electron processes often do not inherit the user's shell PATH. Set
`APP_CLAUDE_COMMAND=/absolute/path/to/claude` to override executable
resolution. If Claude Code emits the common unauthenticated stream result, Korus
normalizes it to an actionable app error telling the user to open Claude Code
and run `/login`.

## Configured Home Foundation

Korus honors a process-wide `CLAUDE_CONFIG_DIR` for Claude SDK queries,
transcript hydration, Resume Session discovery, personal skill discovery, and
private plan streaming. SDK session deletion uses that same process environment.
On startup, provider setup applies the persisted Claude home to the process;
per-query home overrides are not supported. Project settings
and skills remain workspace-scoped. The skill catalog follows symlinked skill
directories and skips broken links.

Personalization reads and writes `CLAUDE.md` in that configured home, so the
editor and Claude's native instruction loading address the same file.

New setups default to `~/.korus/claude-home`, with personal skills linked
from the existing Claude home. Onboarding can select the existing home instead,
or disable skill sharing. Existing private skill folders are never replaced.
Existing Claude-enabled installations retain their current home; no history or
credentials are copied. Provider homes are persisted in `general.providerHomes`.
Changing a home requires explicit confirmation when that provider owns agents;
those agents and Quick Chats are removed from Korus. Conversation files remain
in the previous home, and switching back does not restore the removed agents.
An isolated home requires its own authentication.

`providerHomes.<backend>.shareSkills` is the single sharing preference. Codex's
legacy sharing flag is migrated on state load only if its provider home is
absent; it is not written back. Codex setup and Settings use the same resource
sharing operations for skills and plugins, preserving private resources until
the user explicitly chooses a migration.

Leave `CLAUDE_CONFIG_DIR` unset when invoking Claude with the default
`~/.claude` home. The CLI treats explicitly setting even that same path
differently for credential lookup. Authentication checks, SDK child processes,
and displayed login commands must agree; local authentication returns a null
`configDirectory` to indicate the default, unset environment.

For an isolated authentication probe, use the unmodified CLI's own flow. Choose
subscription login (`--claudeai`) or Console/API billing (`--console`):

```sh
CLAUDE_CONFIG_DIR="$HOME/.korus/claude-home" claude auth login --claudeai
# Alternatively, for Console/API billing:
CLAUDE_CONFIG_DIR="$HOME/.korus/claude-home" claude auth login --console
CLAUDE_CONFIG_DIR="$HOME/.korus/claude-home" claude auth status
```

For an isolated Console-key probe, choose the CLI's API-key creation option
when offered. Keyless Console profiles live outside `CLAUDE_CONFIG_DIR` and
must not be treated as isolated credentials merely because this variable is set.

Credentials remain Claude-owned; do not copy login tokens or settings from the
normal Claude home. Each SSH host must authenticate its own home. The current
remote Settings login instructions still address that host's default home;
remote cutover must update the instructions and status check together.

`configured-home.spec.ts` covers restart/history/resume routing, symlinked
skills, private plan streaming, and real SDK deletion against temporary homes.
Its scripted query tests prove Korus's routing, not browser login or live-model
session persistence. A live probe on 2026-10-02 with Claude Code 2.1.283 confirmed
an authenticated first prompt followed by history hydration and a second prompt
in a fresh Node process, retaining the same session ID and recalling the first
prompt's marker. The probe used Korus's real driver/SDK transport with tools
disabled; it did not restart the desktop app or migrate existing conversations.

That probe exposed Claude's canonical cwd storage (`/tmp` becomes `/private/tmp`
on macOS). History reads and Resume Session discovery now check both the agent's
logical path and its resolved filesystem path, deduplicating session IDs while
preserving logical-path history and reads for removed workspaces.

## Remaining capability boundaries

Steering, same-folder idle forks, resume, and native goals are implemented.
Steering is boundary-dependent delivery, not immediate interruption.
Rollback/edit/retry/delete-turn controls remain unsupported; additional
capabilities need evidence at the SDK and driver boundaries before enabling UI.
See the [capability audit](research/claude-capabilities.md) for dated runtime
probes, unsupported cases, and validation limits.

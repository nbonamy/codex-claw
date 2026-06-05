# New / Edit Agent Dialog

## Summary

Build a Skwad-inspired agent dialog that makes the current `New Agent` button
real and also supports editing existing agents. The first version stays
Codex-only, persists agent metadata across restarts, and includes a proper
avatar flow: initials fallback, preset emoji/icons, and local image crop/edit.

## Key Changes

- Add a focused `AgentDialog` flow:
  - `New Agent` opens create mode.
  - Agent row right-click opens a small context menu with `Edit Agent`.
  - Dialog fields: avatar, name, folder, fixed read-only backend row `Codex`.
  - Create title: `New Agent`; edit title: `Edit Agent`.
  - Save is disabled until folder and name are valid; selecting a folder
    auto-fills name from the folder basename if the name is empty.
  - Edit mode is disabled for non-idle agents to avoid changing folder/thread
    state mid-turn.

- Add reusable avatar rendering/editing:
  - Introduce one shared avatar component used by sidebar, header, and dialog.
  - Avatar value supports `undefined` for initials fallback, emoji/icon text, or
    an image data URL.
  - Image picker uses browser file APIs in the renderer, not Node access.
  - Avatar editor crops to a square PNG data URL, displayed as a circular avatar
    in the UI.

- Update app contracts:
  - Add `chooseAgentFolder(): Promise<string | null>` for native directory
    selection from main.
  - Change `createAgent(input)` to return `AppSnapshot` so renderer state is
    refreshed from main.
  - Add `updateAgent(input): Promise<AppSnapshot>`.
  - Add `UpdateAgentInput` with `id`, `name`, `folder`, and optional `avatar`.
  - Main validates name/folder, verifies selected folder is a directory, and
    rejects edits for non-idle agents.
  - Folder changes clear stale Codex thread and MCP registration fields for that
    agent.

- Add lightweight main-process persistence:
  - Store sanitized app metadata in `app.getPath('userData')/state.json`.
  - Persist teams, agents, bench, active agent, theme, and Codex thread IDs.
  - Do not persist messages/transcripts yet.
  - On load, reset transient runtime fields: app-server status, agent status,
    MCP session IDs, registration flags, and status text.
  - Persist after create, update, select-agent, and `thread.started`.

## Test Plan

- Contract/reducer tests:
  - Create agent trims/defaults name, assigns active team, selects new agent.
  - Update agent changes name/avatar/folder and clears thread state only when
    folder changes.
  - Busy agent update is rejected.
  - Persistence load/save sanitizes transient fields and preserves thread IDs.

- IPC/app-state tests:
  - `chooseAgentFolder`, `createAgent`, and `updateAgent` are exposed through
    preload.
  - App state replaces its snapshot after create/update.
  - Folder chooser cancellation keeps dialog state unchanged.

- Component tests:
  - `AgentDialog` create mode validates fields, auto-fills name from folder,
    emits create payload.
  - Edit mode pre-fills values, emits update payload, and disables save for
    non-idle agents.
  - Avatar picker supports initials fallback, emoji selection, and image crop
    apply/cancel.
  - `AgentSidebar` opens create from footer and edit from row context menu.
  - `AppShell` wires create/edit dialog events without leaking Codex protocol
    details.

- Gates:
  - `npm test`
  - `npm run test:coverage`
  - `npm run lint`
  - `npm run build`
  - Live app visual check for create, edit, folder pick, avatar pick/crop,
    restart persistence.

## Assumptions

- Bench templates are not implemented in this phase; the dialog structure
  should leave room for Bench later.
- No worktree creation, personas, fork conversation, companion agents, Claude,
  or shell-agent support in this phase.
- Agent persistence covers metadata only; transcript persistence remains a
  later rendering/history feature.

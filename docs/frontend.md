# Frontend

Codex Claw's renderer is Vue 3 with TypeScript and Element Plus. Keep views
thin, state transitions explicit, and app-specific behavior inside owned
components and stores.

## Visual Direction

Use two primary references:

- Skwad screenshots for the team rail, agent list, agent identity, status
  language, and Bench/product feel.
- `docs/codex.png` for the native desktop shell shape: left navigation,
  central conversation, and right-side artifact/document panes.

The app should feel like an operational coding workspace, not a marketing page
or generic chat demo.

## Components

Every piece of UI with its own visual identity or reusable behavior should be a
component.

Views are orchestrators. They compose components, manage page-level state, and
call stores or IPC actions. They should not contain inline UI logic that belongs
in a child component.

Component rules:

- Props are typed with TypeScript generics: `defineProps<{ ... }>()`.
- Events are typed with `defineEmits<{ ... }>()`.
- Styles are scoped unless a token, reset, or shell-level rule is intentionally
  global.
- Prefer Element Plus controls for menus, dropdowns, popovers, dialogs,
  selects, tooltips, forms, tabs, and loading states.
- Customize Element Plus with scoped wrapper classes and design tokens instead
  of hand-rolling standard interaction behavior.
- Use app-owned shared components only when behavior is genuinely shared across
  surfaces.

## Small Component Principles

Prefer small components with one clear job. This keeps visual work testable and
keeps streaming/product state from leaking into every part of the tree.

Rules:

- Split shell, navigation, agent rows, headers, diff blocks, and artifact panes
  into focused product components. Use the SDK conversation pane for composer,
  message, tool, and approval UI.
- Keep components named after product concepts, not implementation mechanics.
- Pass typed props and emit typed events. Avoid reaching into parent stores
  from deep children unless the component is intentionally store-owned.
- Keep data shaping in stores, composables, or adapters. Components should not
  translate raw Codex or Claude/backend payloads.
- Prefer computed view models over complex template expressions.
- Avoid components that both fetch/subscribe and render large UI trees. Put
  subscription/state orchestration in a view or store and pass stable props
  down.
- Promote a component to shared only after it is used by more than one surface
  or clearly belongs to a shared rendering primitive.
- Co-locate component tests with the component and test it in isolation when
  the behavior is local.
- Use `CodexConversationPane` from `codex-app-sdk/vue` for the complete
  product-neutral conversation surface, including composer, messages, tools,
  approvals, copy, attachments, paste/drop, and voice transcription. Keep the
  Claw wrapper limited to provider/agent state mapping and product side-panel
  routing.
- Extend composer actions with typed menu entries and slots; do not fork the
  menu component when an app builder needs another action.
- Do not copy SDK leaf components, CSS, audio helpers, clipboard logic, or
  attachment plumbing into the renderer.

## App Shell

The first shell should support the product shape even before every feature is
implemented:

- team rail on the far left;
- agent list with avatar, name, folder, and status;
- persisted View-menu compact agent-list mode with mini avatars, names, and status icons;
- active agent header;
- central conversation and composer;
- optimistic agent switching that reveals the cached conversation immediately;
  backend session hydration, Git status, and agent catalogs refresh
  asynchronously, while snapshots returned by background work preserve the
  current renderer selection and cannot switch the user back to another agent;
- per-agent in-memory composer state, including unsent text, selected
  attachments, and the current selection/caret, so switching agents restores
  the editor exactly; queued prompts remain backend-owned snapshot state and
  the renderer never removes them before `clawd` confirms dequeue;
- per-agent in-memory model, reasoning, Fast mode, and plan-mode selections,
  restored synchronously on selection; model catalogs are loaded once per
  backend at startup, while skills and files are cached by working folder and
  reused across agents; explicit catalog-change events are the only automatic
  refresh path;
- a non-blocking connection strip while Electron reconnects to `clawd`; the
  existing conversation remains visible because agents continue in the
  background daemon;
- passive structured execution plans floating at the conversation's upper right
  while a turn is running; completed Plan-mode proposals continue to use the
  explicit review panel;
- Claw-owned MCP activity keeps its phase-aware titles and uses host-provided
  semantic icons for browser, Computer Use, collaboration, workspace, Markdown,
  and work-item tools while unrelated MCP servers retain SDK fallbacks;
- agent-owned right-side tabbed workspaces for the in-app Browser and GitHub
  Review, with full working-tree diffs opened from the agent header's git
  statistics; every agent preserves its own open/active tabs, open state, and
  width, and inactive workspaces stay mounted so background browser tooling can
  continue without stealing the user's selected agent. Live edits refresh files
  that the user already has open but never reveal or select a workspace tab;
  clicking an SDK tool-call file target is the only action that opens its
  canonical path in the owning workspace. Edit targets with turn context open
  a turn-scoped diff tab; links without that context fall back to the current
  Git review;
- empty right-workspace launcher for opening Review or Browser before any tab
  exists; manually closing the last tab collapses the workspace. Review uses
  `Command+G` and Browser uses `Command+B`, while existing `Command+D`
  duplicate-agent and `Command+R`
  restart-agent shortcuts remain unchanged;
- focused artifact panes for documents, plans, and read-only source previews;
- Bench entry point in the agent creation flow;
- repository-first agent creation that keeps Codex implicit, puts custom folder
  selection first, progressively reveals checkout controls, and hides backend
  and resolved-path implementation details; identity and workspace settings
  use grouped surfaces with compact row controls;
- full-space Settings surface launched from the rail, with its own category
  sidebar and screen-level panels instead of dialog chrome; its first page
  launches `/Applications/ChatGPT.app` with Claw's isolated `CODEX_HOME` for
  plugin, sandbox-policy, and advanced Codex configuration; Plugins keeps
  Computer Use and Chrome disabled by default, persists explicit capability
  choices, and directs plugin activation through ChatGPT; Connections keeps
  remote Claw hosts separate from official Codex device pairing, including
  pairing progress and paired-device revocation.

Avoid layout jumps during streaming, loading, plan updates, approval prompts,
and artifact pane changes.

## Local SDK Development

`npm run dev` resolves `codex-app-sdk` entrypoints from the sibling
`../codex-app-sdk/src` tree. Renderer SDK edits participate in Vite hot module
replacement, while main, preload, and `clawd` SDK edits rebuild through their
existing watchers. Package, make, backend, and release builds consume SDK
`dist`; while the dependency uses a local `file:` reference, every root build
entrypoint rebuilds the sibling SDK first. The build step becomes a no-op when
Claw switches to a published npm dependency.

## Design Tokens And Themes

Themes are a first-class architecture concern.

Rules:

- Use semantic CSS custom properties for colors, spacing, typography, borders,
  radii, shadows, and diff colors.
- Do not hard-code product colors inside components.
- Do not tie components to id8 token names; copy useful patterns, then rename
  tokens to Codex Claw-owned names.
- Keep theme application centralized, likely at the document root.
- Build with future VS Code JSON theme import in mind, but do not block early
  product work on the importer.

Token categories should include:

- app backgrounds and panels;
- sidebars, rails, and active selections;
- text, muted text, and inverse text;
- borders and dividers;
- accent, danger, success, warning, and working/status colors;
- composer and input surfaces;
- SDK conversation surfaces, bridged through the documented `--codex-*`
  semantic theme tokens and `data-codex-theme` appearance attribute;
- tool call, approval, plan, and reasoning surfaces;
- diff added, removed, changed, and gutter colors;
- code and syntax colors.

Claw's UI typography follows Codex's system-font treatment: use the native
system sans stack and a restrained weight scale. Reserve stronger weights for
real hierarchy instead of making routine labels and navigation feel bold.

Theme rules:

- Components consume semantic tokens only.
- Theme switching should update CSS variables at the document root.
- Appearance settings should end with a representative Git diff preview so
  palette and code-font changes can be evaluated in context.
- Theme application should bridge the active Claw palette into the SDK's
  optional `--codex-*` token contract rather than restyling SDK internals.
- Element Plus theme overrides should be derived from the same app tokens.
- Syntax highlighting and diff rendering should be fed by the same theme
  source whenever practical. Source previews use Shiki; git diff previews use
  Claw-owned Vue rendering fed by parsed unified diff data.

## Internationalization

User-facing renderer strings should be compatible with Vue I18n from the start.

Rules:

- Put reusable renderer copy in `src/renderer/i18n/messages.ts`.
- Use `vue-i18n` in components for dynamic UI labels instead of assembling
  English strings inline.
- Keep backend adapters responsible for app-owned semantic descriptors, not
  localized text.
- Do not send localized strings through IPC as the durable contract when a
  structured descriptor can express the same state.
- It is acceptable to migrate existing static copy gradually as components are
  touched, but new shared rendering primitives should use the i18n catalog.

## UX Standards

- Build the actual app surface first.
- Keep operational UI dense, clear, and repeatable.
- Prefer concrete actions over explanatory in-app text.
- Use icons for familiar tool buttons.
- Use text buttons for clear commands.
- Do not create nested cards or card-heavy shells.
- Keep form-dialog chrome shared: title-only compact headers, full-width header
  and footer dividers, and the semantic dialog-body surface belong to
  `.claw-dialog`, not individual product dialogs.
- Avoid decorative layouts that slow down real coding workflows.
- Keep empty, loading, error, offline, and permission states explicit.
- Ensure text fits in compact desktop windows.
- Preserve keyboard/composer behavior as the chat renderer grows.
- Keep status language short and useful.
- Render emoji avatars borderless and scale the glyph to the shared avatar box;
  image and initials avatars keep the standard circular treatment.
- Keep rail, sidebar, and main-content titlebars on the shared workbench appbar
  height so adjacent shell regions align exactly.
- On macOS, keep the native traffic lights vertically centered in that appbar
  and reserve enough team-rail width and top padding that they never overlap
  sidebar or rail controls.
- Compose the macOS rail and agent sidebar over Electron's native menu vibrancy
  using translucent semantic shell tokens; keep main content opaque and retain
  the native window shadow instead of simulating glass or shadow in CSS.

## Rendering Surfaces

The renderer should be able to display backend-native work without becoming
backend-protocol-shaped.

High-priority surfaces:

- user and assistant messages;
- streaming assistant deltas;
- reasoning summaries;
- plan updates;
- command execution and output;
- tool calls;
- approval requests;
- ask-user prompts;
- file changes, read-only source previews, and diffs;
- errors and interrupted turns.

Renderer components consume app-owned state, not raw app-server or backend
payloads.

## Verification

For frontend changes:

```bash
npm test
npm run build
```

When coverage and lint scripts exist, include:

```bash
npm run test:coverage
npm run lint
```

For meaningful visual changes, run the app locally and capture screenshots when
the desktop smoke tooling exists.

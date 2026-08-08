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
- Mount the reusable shell through `mountClawVueApp` with a typed `ClawClient`.
  Components consume injected app APIs and capability flags; they do not read
  Electron globals or branch on user-agent strings.
- Keep product platform names separate from implementation technology.
  `ClawClient.platform` is `desktop`, `web`, or `custom`: Claw owns the complete
  desktop and web profiles, while custom embedders must explicitly provide
  their capabilities and host actions. Electron is the current desktop adapter,
  not a renderer platform contract.
- Treat transcription as an SDK-native capability. A host that does not supply
  transcription gets no microphone from the SDK composer; do not add a second
  Claw transcription setting or feature flag.
- Treat Computer Use, Appshots, native dialogs, the embedded browser, Open In,
  Dock badges, desktop updates, daemon controls, system permissions, and app
  lifecycle as host capabilities. Unsupported controls must be absent in web,
  and security-sensitive capabilities such as Computer Use must also be absent
  from the web backend tool surface.

## App Shell

The first shell should support the product shape even before every feature is
implemented:

- team rail on the far left;
- agent list with avatar, name, folder, and status;
- a tall red leading-edge signal marks agents with completed turns,
  approval/input requests, or errors received outside the visible thread; teams
  containing at least one unread agent carry a short, thick red orbital sweep
  at the top-right of their rail avatar, except the
  currently selected team, which is treated as read for team-level display
  while retaining unread state for agents not being viewed. Selecting a team
  explicitly marks the agent it opens as read; selecting an agent or focusing
  its active thread does the same. The macOS Dock badge shows the number of
  unread agent threads;
- persisted View-menu compact agent-list mode with mini avatars, names, and status icons;
- agent context actions for duplicating configuration or forking the active
  backend conversation; both insert the new selected agent directly below the
  source agent;
- opted-in Fork actions on user and assistant messages, routed by absolute
  host message index into the same new-agent workflow;
- a standalone image-annotation dialog that centers the source image within a
  larger virtual drawing canvas so marks can extend beyond the image, accumulates
  numbered comments through the shared annotation popup portaled above canvas
  and dialog clipping, and emits a rasterized PNG plus structured annotation
  metadata. Its compact header keeps the title and tools left, places live
  indicators on the right, and omits a redundant close icon. Initial framing
  fits oversized source images to the canvas viewport without upscaling small
  images or changing the user-visible zoom, and edge drags scroll the
  drawing workspace, and a live header inspector shows cursor RGB values, image
  size, and zoom with Tab-to-copy color support. The dialog stays fixed at 80%
  of viewport width and 80% of viewport height while Command shortcuts and
  native trackpad pinch gestures control zoom inside its scrolling canvas. A
  separate `@2x` toolbar toggle reports image dimensions
  and measured gaps in logical Retina pixels; clipboard images enable it
  automatically from a 2x native representation or macOS screenshot PNG
  density metadata. A single image in the conversation composer exposes the
  Browser-style annotation action; sending from the dialog submits the rendered
  annotated PNG instead of the original attachment, alongside the numbered
  annotation comments and any existing composer text. Escape
  cancels the active mark before it can close the dialog. The development
  fixture is available from Debug → Image Annotation
  and uses a clipboard image when present, otherwise a centered crop of the
  bundled shell screenshot;
- active agent header;
- ChatGPT-style split Open In controls in the active-agent header and project-file
  previews, plus the same installed-app list in agent context menus. The primary
  button reuses each agent's last choice; agents without one default to VS Code,
  then a detected JetBrains IDE, then Finder. Native app discovery supplies
  icons and includes Finder, Terminal, iTerm2, Ghostty, Xcode, Android Studio,
  and a detected JetBrains IDE when installed;
- central conversation and composer;
- optimistic agent switching that reveals the cached conversation immediately;
  backend session hydration and agent catalogs refresh asynchronously, while
  Git status is analyzed the first time an agent is shown and then refreshed
  manually or after app-observed file activity; snapshots returned by background
  work preserve the current renderer selection and cannot switch the user back
  to another agent;
- per-agent in-memory composer state, including unsent text, selected
  attachments, and the current selection/caret, so switching agents restores
  the editor exactly; queued prompts remain backend-owned snapshot state and
  the renderer never removes them before `clawd` confirms dequeue;
- per-agent in-memory model, reasoning, Fast mode, and plan-mode selections,
  restored synchronously on selection; model catalogs are loaded once per
  backend at startup, while skills and files are cached by working folder and
  reused across agents; explicit catalog-change events refresh skills during
  normal operation, while resource sharing changes that restart the backend
  block interaction with a reconnect overlay and reload the renderer from a
  fresh snapshot so SDK controllers, event cursors, and catalogs cannot retain
  the previous backend instance;
- a non-blocking connection strip while Electron reconnects to `clawd`; the
  existing conversation remains visible because agents continue in the
  background daemon;
- passive structured execution plans floating at the conversation's upper right
  while a turn is running and retained in the agent snapshot; the plan can be
  dismissed and reopened from the header list control; the floating card uses
  a stable Task list heading and presents the backend explanation as a
  separate, full-width title clamped to two lines below the header; their
  app-owned lifecycle is derived from per-step state and finalized as
  completed, incomplete, interrupted, or failed when the turn ends, while
  completed Plan-mode proposals continue to use the explicit review panel;
- Claw-owned MCP activity keeps its phase-aware, target-aware titles and uses
  host-provided semantic icons for browser, every bundled Computer Use action,
  collaboration, workspace, Markdown, and work-item tools while unrelated MCP
  servers retain SDK fallbacks;
- agent-owned right-side tabbed workspaces for the in-app Browser and GitHub
  Review, with full working-tree diffs opened from the agent header's git
  statistics; clicking a conversation image opens it in a Claw-owned image tab,
  while the SDK lightbox remains the fallback for hosts without that action;
  every agent preserves its own open/active tabs, open state, and
  width, and inactive workspaces stay mounted so background browser tooling can
  continue without stealing the user's selected agent. Live edits refresh files
  that the user already has open but never reveal or select a workspace tab;
  MCP Markdown previews open as Markdown tabs in this same workspace, while
  plan-review Markdown opens a dedicated per-agent Plan tab with its explicit
  review controls and preserved draft comments;
  clicking an SDK tool-call file target is the only action that opens its
  canonical path in the owning workspace. Edit targets with turn context open
  a turn-scoped diff tab; links without that context fall back to the current
  Git review;
- empty right-workspace launcher for opening Review or Browser before any tab
  exists; manually closing the last tab collapses the workspace. Review uses
  `Command+G` and Browser uses `Command+B`, while existing `Command+D`
  duplicate-agent and `Command+R` restart-agent shortcuts remain unchanged;
  `Command+K` submits `/compact` for the active agent. Holding Command briefly
  replaces the first nine agents' activity dots with `Command+1` through
  `Command+9` hints; pressing the matching number switches agents;
- focused artifact panes for documents, plans, and read-only source previews;
- Bench entry point in the agent creation flow;
- repository-first agent creation that keeps Codex implicit, puts custom folder
  selection first, progressively reveals checkout controls, and hides backend
  and resolved-path implementation details; identity and workspace settings
  use grouped surfaces with compact row controls;
- a theme-aware What’s New dialog that renders the release notes embedded in
  the application and opens from both the native Help menu and lower-left
  account menu;
- full-space Settings surface launched from the rail, with its own category
  sidebar and screen-level panels instead of dialog chrome. Desktop launches
  the ChatGPT process with Claw's isolated `CODEX_HOME`, web opens the
  `codex://` deep link, and custom hosts expose the ChatGPT page only when they
  supply a launch action. Plugins keeps Computer Use and Chrome disabled by
  default, persists explicit capability choices, and routes plugin management
  through the host action (the built-in web profile uses
  `https://chatgpt.com/plugins`). Empty General sections are omitted so a
  restricted custom profile can intentionally leave the page blank.
  Connections keeps optional remote Claw hosts separate from official Codex
  device pairing, including pairing progress and paired-device revocation;
  custom hosts may omit remote-host management while retaining device pairing.
  External authorization links use a host action instead of assuming the clawd
  process can open a local browser. Appshots configures a
  left-and-right modifier chord, active-agent destination, and capture sound;
  General → System permissions reports both Accessibility and the Computer Use
  helper's Screen Recording permission. General → Advanced shares ChatGPT's
  skills and plugins by default and can return to fresh or copied isolated
  resources only while all chats are idle. Existing non-linked Claw homes show
  an explicit launch-time migration choice instead of changing in the
  background. Settings is also available
  from the native macOS app menu and lower-left account menu with `Command+,`.

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

Development builds expose a native Debug menu with deterministic fixtures for
sending a real MCP collaboration message to the current agent, opening the
Codex Claw website in the agent browser, opening a sample Markdown tab, showing
an approval request, marking inactive agents in the current and another team as
unread, and toggling execution-plan and Plan Review states. Keep
these fixtures local and repeatable; resolving a debug approval must never
reach the backend.

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

- Put reusable renderer copy in `vue/src/i18n/messages.ts`.
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
  and footer dividers, and evenly padded semantic dialog bodies belong to
  `.claw-dialog`, not individual product dialogs. Form content must not add a
  second outer padding layer.
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
- explicitly clicked absolute file links, including files outside the agent
  repository, opened as read-only source previews on the agent's host;
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

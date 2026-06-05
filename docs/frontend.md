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

- Split shell, navigation, agent rows, headers, composer, message parts, tool
  calls, approval prompts, diff blocks, and artifact panes into focused
  components.
- Keep components named after product concepts, not implementation mechanics.
- Pass typed props and emit typed events. Avoid reaching into parent stores
  from deep children unless the component is intentionally store-owned.
- Keep data shaping in stores, composables, or adapters. Components should not
  translate raw Codex payloads.
- Prefer computed view models over complex template expressions.
- Avoid components that both fetch/subscribe and render large UI trees. Put
  subscription/state orchestration in a view or store and pass stable props
  down.
- Promote a component to shared only after it is used by more than one surface
  or clearly belongs to a shared rendering primitive.
- Co-locate component tests with the component and test it in isolation when
  the behavior is local.

## App Shell

The first shell should support the product shape even before every feature is
implemented:

- team rail on the far left;
- agent list with avatar, name, folder, and status;
- active agent header;
- central conversation and composer;
- right-side artifact pane for documents, plans, files, diffs, and future SWE
  surfaces;
- Bench entry point in the agent creation flow.

Avoid layout jumps during streaming, loading, plan updates, approval prompts,
and artifact pane changes.

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
- tool call, approval, plan, and reasoning surfaces;
- diff added, removed, changed, and gutter colors;
- code and syntax colors.

Theme rules:

- Components consume semantic tokens only.
- Theme switching should update CSS variables at the document root.
- Element Plus theme overrides should be derived from the same app tokens.
- Syntax highlighting and diff rendering should be fed by the same theme
  source whenever practical.

## UX Standards

- Build the actual app surface first.
- Keep operational UI dense, clear, and repeatable.
- Prefer concrete actions over explanatory in-app text.
- Use icons for familiar tool buttons.
- Use text buttons for clear commands.
- Do not create nested cards or card-heavy shells.
- Avoid decorative layouts that slow down real coding workflows.
- Keep empty, loading, error, offline, and permission states explicit.
- Ensure text fits in compact desktop windows.
- Preserve keyboard/composer behavior as the chat renderer grows.
- Keep status language short and useful.

## Rendering Surfaces

The renderer should be able to display Codex-native work without becoming
Codex-protocol-shaped.

High-priority surfaces:

- user and assistant messages;
- streaming assistant deltas;
- reasoning summaries;
- plan updates;
- command execution and output;
- tool calls;
- approval requests;
- ask-user prompts;
- file changes and diffs;
- errors and interrupted turns.

Renderer components consume app-owned state, not raw app-server payloads.

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

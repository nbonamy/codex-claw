# Frontend

Codex Claw's renderer is Vue 3 with TypeScript and Element Plus. This is a
working guide for consistent implementation. Feature behavior and its history
belong in tests; backend and process ownership belong in the architecture docs.

## Working Method

Before changing a surface:

1. Inspect the nearest component and its colocated tests.
2. Search `vue/src/shared/` and `vue/src/components/` by interaction and product
   concept before creating markup or CSS.
3. Choose the narrowest correct owner: component, renderer state, composable,
   renderer view model, core policy, SDK, or host capability.
4. Reuse a component only when its contract fits without caller-specific flags.
   Keep one-off composition product-local; promote it after a second real use or
   when the contract is clearly domain-neutral. Record the mismatch when a
   canonical component does not fit.
5. Verify the changed contract per `docs/testing.md`. For visible behavior,
   perform one proportional runtime, DOM, or screenshot check when tooling
   exists.

The change is ready when ownership is clear, reuse is justified, and the
changed behavior is specified at its public seam.

## Visual Direction

Use `docs/codex.png` for the native shell shape: navigation on the left,
conversation in the center, and workspace artifacts on the right.

The app is a dense operational workspace: quiet, compact, border-light, and
stable during loading or streaming. Prefer concrete actions, restrained font
weight, and predictable geometry over decorative cards or explanatory copy.

## Ownership and Components

- **Components** own ephemeral interaction and derived presentation state such
  as an open popover, active tab, local query, or filtered local rows.
- **`vue/src/app-state.ts`** owns renderer state shared across surfaces and the
  client replica of server-authored app state. It is the public renderer-state
  facade and event router, not the owner of every async workflow.
- **Colocated composables** own reusable stateful behavior such as async
  loading, caching, request lifecycle, and mutations used by a focused surface.
- **Renderer view models** stay beside the surface when their projection exists
  only for that renderer experience.
- **Core** owns cross-client domain policy and app contracts. Keep pure policy
  projections there and specify them directly in core tests.
- **Views and shell components** coordinate state, navigation, subscriptions,
  and product components. Their templates remain thin.
- **Product components** represent one product concept under
  `vue/src/components/` and expose typed props and semantic emits.
- **Shared interaction primitives** provide domain-neutral behavior under
  `vue/src/shared/` and have isolated public-contract tests.
- **SDK surfaces** own product-neutral conversation, composer, message, tool,
  approval, attachment, clipboard, and transcription behavior.
- **Host capabilities** own Electron/web differences such as native dialogs,
  Browser views, Computer Use, Open In, Dock badges, and app lifecycle.

Product components may depend on shared UI; shared UI does not import the
product layer, stores, views, or backend clients. Components consume app-owned
contracts rather than provider protocol types, Electron globals, filesystem
APIs, or raw backend payloads.

Shells coordinate focused modules; they do not implement multi-step workflows.
Move polling, timers, persistence transitions, and cleanup for one workflow
into a colocated composable. Use `AsyncCatalogCache` for keyed async catalogs so
request deduplication, source invalidation, stale-result rejection, and pushed
updates remain one policy instead of being repeated in renderer state. Keep
reusable dialog workflows such as repository acquisition in composables so the
shell only supplies product context and navigation callbacks.

The renderer-state facade delegates provider catalogs and authorization,
composer catalogs and selections, unread policy, history paging, and
source-repository discovery to focused `*-state.ts` modules.
`AppShell` similarly delegates first-run onboarding, repository acquisition and
session creation, issue and pull-request routing, Cockpit backlog state,
per-agent right-workspace state, workspace preview request races, and image
annotation to `use-*.ts` composables. Work-item routing owns branch resolution,
worktree-backed agent creation, reassignment protection, prompt generation, and
the pending new-agent assignment lifecycle. New multi-step state belongs
in the relevant module; keep simple navigation and one-step event forwarding in
the facade or shell.

The shell's rendered hierarchy follows the same ownership rule. First-run
onboarding, team/agent navigation, backend connection status, and the active
agent workspace are focused child components. The workspace owns plan,
subagent, repository backlog, browser, link, and image routing; shell-level
keyboard and native-menu commands live in a lifecycle-owning composable.

### Component Rules

- Name components after product concepts.
- Use typed `defineProps` and `defineEmits`; pass stable data down and semantic
  events up.
- Prefer computed presentation state over branching template expressions.
- Split a child when it has its own visual identity, state machine, reusable
  behavior, or isolated test seam.
- Keep styles scoped unless a token, reset, shell rule, or shared primitive is
  intentionally global.
- Keep wrappers only when they add product semantics while delegating the
  underlying interaction and appearance.

## Canonical UI Primitives

Search by behavior, not only filename. Historical product names do not prove a
component is single-use.

### Shared interaction primitives

| Need | Canonical UI | Location |
| --- | --- | --- |
| Action, checkbox/radio, separator, or submenu rows | `AppMenu` | `vue/src/shared/menu/AppMenu.vue` |
| Application launcher and icon catalog | `OpenInControl` | `vue/src/shared/OpenInControl.vue` |
| Product glyphs, including GitHub | App icon catalog | `vue/src/shared/icons/app-icons.ts` |
| Dialog chrome and footer actions | `.claw-dialog`, `.claw-button` | `vue/src/styles/base.css` |
| Form dialog structure and fields | `FormDialog`, `FormDialogField` | `vue/src/shared/dialog/` |
| Voice-enabled multiline input | `VoiceTextarea` | `vue/src/shared/VoiceTextarea.vue` |

### Reusable product components

| Need | Canonical UI | Location |
| --- | --- | --- |
| Emoji, grapheme, or cropped-image identity | `IdentityPicker` | `vue/src/shared/identity/IdentityPicker.vue` |
| Searchable compact picker | Header filter plus list body | GitHub mode in `RepositoryAcquireDialog`; `RepositorySessionSourceDialog` |
| Settings structure | `SettingsPanelFrame`, `SettingsSection`, `SettingsRow` | `vue/src/components/Settings*.vue` |
| Dense structured data | `AppDataList` | `vue/src/components/AppDataList.vue` |
| Operation feedback | `GitOperationFeedback` | `vue/src/components/GitOperationFeedback.vue` |

`IdentityPicker` is a reusable product component despite its current path: it
depends on avatar-specific product leaves. Keep new product dependencies out of
`shared/`; extract domain-neutral preview and crop leaves before treating the
picker as a shared interaction primitive.

Use `CodexConversationPane` from `@codex-app-sdk/vue` as the complete
conversation and composer surface. Extend it through its controller, slots, and
typed actions. Keep Claw's wrapper limited to app-state mapping and product
routing; the SDK retains its leaf UI, CSS, attachment, clipboard, and
transcription code.

For app-owned MCP icons, phase-aware titles, and bounded presentation metadata,
follow [Custom MCP Tools](custom-tools.md).

## Interaction Patterns

### Dialogs and Pickers

- Form dialogs compose `FormDialog` and `FormDialogField`: a title and optional
  subtitle, one padded semantic body, labels above controls, and a divided
  footer. Form content adds no second outer gutter.
- Footer actions use `.claw-button`: dismiss is tertiary, alternatives are
  secondary, and at most one action is primary.
- Searchable compact pickers use the filter as the complete top row. The body
  starts with loading, error, empty, or results; the accessible label carries
  the dialog purpose.
- Dialogs emit domain actions. Their parent or composable owns persistence and
  backend calls.

### Menus, Popovers, and Tabs

- Use `AppMenu` for consistent row models, roles, spacing, selected/disabled
  states, separators, and submenus. Extend `AppMenu` itself when menus need
  roving focus, Arrow/Home/End, or keyboard activation; the containing overlay
  owns Escape, closing, and focus return.
- Share one item model when actions appear both inline and in a menu.
- Use Element Plus teleport and placement for popover-based controls. An
  anchored inline menu may own positioning explicitly and must account for
  clipping.
- Use Element Plus tabs for navigation and radio or segmented controls for
  exclusive form choices. Keep surface-specific styling local and tokenized.
- Pill tabs preserve symmetric first and last padding because Element Plus
  removes padding at the outer edges.

### Lists, Actions, and Layout

- Use `AppDataList` for dense structured data and focused product rows for
  navigation or action lists.
- Align icon, primary text, metadata, badge, and trailing action columns on a
  compact cadence. Reserve strong weight for real hierarchy.
- Make the whole row the primary target; keep secondary actions quiet and
  keyboard reachable.
- Source shared glyphs from the app icon catalog. Labeled Element Plus buttons
  receive icons through the `icon` prop.
- Hover and focus treatments keep geometry stable.
- Align shell titlebars to the shared appbar height. Each workspace pane owns
  its scroll axes and constrains long content instead of resizing the shell.

## Styling and Feedback

- Use semantic variables for colors and repeated design-system values. Keep
  genuinely component-specific geometry local.
- Derive Element Plus overrides from the same variables and scope them to the
  owning wrapper.
- Bridge themes into the SDK through documented `--codex-*` variables and
  `data-codex-theme`; do not restyle SDK internals.
- Use the native system sans stack and restrained weights.
- Make reachable loading, working, awaiting-input, empty, offline, error, and
  interrupted states explicit near the action or content they affect.
- Drive staged operation steps from semantic backend phases when real progress
  is available. Timing may smooth completion, but it must not imply that a
  backend phase has completed before it actually has.
- Commit an async result only while its request identity still matches the
  active selection.

## Accessibility and Copy

- Give every icon-only control an accessible name.
- Preserve native keyboard behavior, visible focus, and predictable focus
  return when overlays close.
- Use one semantic target per action; avoid nested interactive elements.
- Keep labels and status language short and concrete.
- Put reusable renderer copy in `vue/src/i18n/messages.ts` and use `vue-i18n`
  for dynamic labels.
- Send app-owned error and status descriptors across backend and IPC boundaries;
  localize them only in the client that renders them.
- Keep raw backend, provider, Git, and shell text as diagnostic detail rather
  than durable presentation copy.

Behavior is the ledger. Update the test at the owning seam when a rule changes;
update this guide only when a reusable convention or canonical component
changes.

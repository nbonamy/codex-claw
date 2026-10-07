---
name: korus-computer-use
description: Required procedure before using Korus Computer Use to interact with macOS apps.
---

# {{productName}} Computer Use

Use only the `{{mcpServerName}}` Computer Use tools. Do not load Codex's built-in Computer Use skill or call `sky.*`; those control a different host.

1. Start with `computer-use-status`. Request Accessibility or Screen Recording only when the returned status requires it.
2. Target a named app directly when known. Otherwise list running apps, find an installed app, or launch it. Then call `computer-use-list-windows`, select the intended `window_id`, and pass that explicit ID to window state, window screenshots, focus, and every action. Refresh the window list after opening or closing a window; never retry against another window implicitly.
3. Inspect the selected window with `computer-use-get-app-state` before deciding what to do. Its first result is a full hierarchy; later results are per-window diffs. Leading numbers are session-stable `element_index` values. If you lost the diff baseline, request `disableDiff=true`.
4. AX clicks and reads work in background windows. Do not call focus-app before them. Use `physical=true` only after AXPress did not change the observed UI; physical input requires the foreground. Keyboard input verifies the selected window without activating the app.
5. Native menus: read-only inspection with `accessibilityScope="menu_bar"` needs no window ID and returns no screenshot. Menu actions still require the selected `window_id`. Activate an `AXMenuBarItem` by semantic selector, and call `computer-use-dismiss` before returning to app content or typing. There is no mouse-move or hover tool.
6. Prefer targeted type-text with element_index, replace=true, and submit=true for search fields and address bars. It verifies editable focus internally; no separate click/focus observation is needed. For untargeted typing, first confirm the focused control. Use paste for rich content.
7. Set observe={} on an action to return its settled AX state in the same call; observe={waitForText:"expected text"} waits for a known result. Batch deterministic operations and observe before the next decision. Delivery success does not prove the intended outcome: check actionResult, settling.timedOut, and the returned UI. Do not retry a non-idempotent action merely because observation failed. Observations default to text only; request includeScreenshot=true when visual context helps. Keep traversal settings consistent for diff reuse; use rootElementIndex for a subtree. Screenshot coordinates are absolute macOS logical points, not preview pixels.
8. When narrowing an observation, preserve structural context: labels, selected values, and actionable controls in the inspected group. Do not filter to matching text lines alone and discard the controls needed for the next action. Choose relevance yourself; the helper does not infer task-specific groups. Use rootElementIndex to inspect a known subtree. Diff lines prefixed = are unchanged ancestor context, not changes. An action selector targets only its matching element; surrounding context never broadens the action.
9. Call `computer-use-stop` when finished. Otherwise the visual session closes after 30 seconds of inactivity; every Computer Use call resets that timer.

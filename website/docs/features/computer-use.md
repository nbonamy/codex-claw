---
description: Enable native macOS application inspection and interaction for agents.
---

# Computer Use

Computer Use lets an agent inspect and operate native macOS applications: discover apps and windows, read controls, click, type, use menus, and capture screenshots. It is opt-in and currently available through the macOS desktop app.

## Enable access

1. Open **Settings → Plugins** and enable **Computer Use** in the **Korus** section.
2. Open **Settings → General → System permissions**.
3. Grant **Accessibility** for native app inspection and interaction. Use the **Grant** action to open the macOS permission flow.
4. Grant **Screen Recording** when screenshots are needed.
5. Return to Korus and refresh the permission status. Follow any restart instructions macOS displays.

The bundled **Korus Computer Use** helper needs the permissions reported by Korus. A permission granted to a different terminal or automation app does not establish the helper's access.

These permissions apply to native application interaction and screen capture. Use the in-app [Browser](./browser) for a web preview when that is the surface you need.

## Describe the application task

Name the app, window, and result you want:

```text
Use Computer Use to inspect the Settings window of my local app.
Open Appearance, change the theme to dark, and confirm that the
window updates. Report what you observed.
```

The agent identifies the app and a specific window before acting. If you have several similar windows, include a title or other distinguishing detail. Opening or closing a window can require the agent to rediscover it.

Some native controls can be inspected and operated without bringing the app forward. Physical clicks and drags require the target app to be frontmost and unobstructed. Let the agent refresh its observation if you move a window or change the screen during an interaction.

Computer Use controls the desktop host connected to Korus. It is not automatically access to a remote team's operating system.

## Choose the right surface

| Task | Surface |
| --- | --- |
| Inspect a local web preview or navigate a public website | [In-app Browser](./browser). |
| Use existing Chrome tabs, login state, or extensions | Chrome plugin setup in [Browser](./browser#external-browser-work). |
| Exercise a native macOS app, dialog, or menu | Computer Use. |

## Troubleshoot permissions

If discovery works but interaction fails, check **Accessibility** in Korus's system permissions. If inspection works but screenshots fail, check **Screen Recording** separately.

For a window-not-found, focus, or stale-control error, ask the agent to list the app's current windows and inspect the target again before continuing. For physical input failures, bring the intended app forward and remove obstructing dialogs.

Include the app, intended window, exact failing action, and permission status in a problem report.

See [Troubleshooting](../troubleshooting/).

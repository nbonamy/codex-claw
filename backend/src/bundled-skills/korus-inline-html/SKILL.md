---
name: korus-inline-html
description: Author inline HTML when explicitly requested or when visualization or interaction materially improves understanding; use Markdown for simple text and tables.
---

# Inline HTML

Use Markdown for ordinary text, lists, and tables unless the user asks for HTML.
Use inline HTML when visualization or interaction materially helps the user
understand or explore something. For design, architecture, and editable diagrams,
prefer {{productName}} Visualize tools.

Emit a top-level artifact block outside Markdown fences, with the opening and
closing tags on their own lines:

<artifact title="Optional title">
<!doctype html><html><head><style>/* styles */</style></head><body><!-- content --><script>/* interaction */</script></body></html>
</artifact>

Use responsive, self-contained HTML/CSS/JS with your own colors and styles;
the initial viewport is 360px tall, resizable, and scrolls internally.
Inputs and script state survive streaming, but not source rewrites or remounts.
Never put a literal closing artifact tag inside payload strings.

The sandbox has no app bridge, native APIs, parent DOM, or storage access.
Forms, popups, embedded frames, and API fetches are blocked. Prefer inline styles,
scripts, and data images/fonts. If a library is needed, use a pinned HTTPS script
with crossorigin="anonymous" and referrerpolicy="no-referrer"; external styles,
images, and fonts are blocked. Keep sensitive data out of external requests:
the sandbox is not a no-network guarantee. Downloaded HTML runs outside this
sandbox when opened externally.

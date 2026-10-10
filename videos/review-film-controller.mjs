const DURATION = 56;
const SCENES = [
  { name: "opening", start: 0, end: 3.2 },
  {
    name: "command",
    start: 3.2,
    end: 8.5,
    chapter: "01 / 06",
    title: "Start with /review.",
    detail: "Open a focused review without leaving the agent workspace.",
  },
  {
    name: "setup",
    start: 8.5,
    end: 22,
    chapter: "02 / 06",
    title: "Your review. Your rules.",
    detail: "Choose the reviewer, priorities, and automatic round limit.",
  },
  {
    name: "reviewing",
    start: 22,
    end: 27,
    chapter: "03 / 06",
    title: "A fresh conversation. An independent reviewer.",
    detail:
      "The review starts in a new thread, separate from the feature work.",
  },
  {
    name: "findings",
    start: 27,
    end: 31,
    chapter: "04 / 06",
    title: "Fix what matters.",
    detail: "Critical, high, and medium findings are selected automatically.",
  },
  {
    name: "fixing",
    start: 31,
    end: 39,
    chapter: "05 / 06",
    title: "Work through the findings.",
    detail:
      "Qualifying findings are fixed one by one, with verification evidence.",
  },
  {
    name: "second",
    start: 39,
    end: 50,
    chapter: "06 / 06",
    title: "Check the fixes. Close the loop.",
    detail:
      "A fresh reviewer checks the fixes. The loop stops when clear or at your round limit.",
  },
  { name: "ending", start: 50, end: DURATION },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => 1 - (1 - clamp(value, 0, 1)) ** 3;
const mix = (start, end, progress) => start + (end - start) * progress;

function message(body, tool = "", backend = "Claude") {
  return `<div class="review-message"><strong><i>${backend === "Claude" ? "✻" : "✦"}</i> ${backend}</strong><p>${body}</p>${tool ? `<span class="review-message__tool"><i>✓</i>${tool}</span>` : ""}</div>`;
}

function activity(items) {
  return `<div class="review-activity">${items.map(([label, state]) => `<div class="review-activity__row is-${state}"><i>${state === "done" ? "✓" : state === "working" ? "◌" : "·"}</i><span>${label}</span><small>${state === "done" ? "Done" : state === "working" ? "Working" : "Queued"}</small></div>`).join("")}</div>`;
}

function newThread(round) {
  return `<div class="review-thread-divider"><span>New independent conversation · Round ${round}</span></div>`;
}

function finding(priority, title, file, description, state, expanded = false) {
  const stateLabel =
    state === "fixed"
      ? "Fixed"
      : state === "fixing"
        ? "Fixing"
        : state === "pending"
          ? "Pending"
          : "";
  return `<article class="review-finding ${state === "fixed" ? "is-fixed" : state === "fixing" ? "is-fixing" : ""}"><div class="review-finding__heading"><span class="review-finding__priority">${priority}</span><strong>${title}</strong>${stateLabel ? `<span class="review-finding__state">${stateLabel}</span>` : `<span class="review-finding__switch"></span>`}</div>${expanded ? `<div class="review-finding__detail"><a>${file}</a><p>${description}</p></div>` : ""}</article>`;
}

function reviewFrame(status, round, body, footer = "") {
  return `<div class="review-session"><header class="review-session__header"><div><small>CODE REVIEW · CLAUDE</small><strong>feature/cloud-agents</strong></div><span>${status}</span></header><div class="review-auto-status"><span>${status === "Finished" ? "Automatic review complete" : `Automatic · round ${round} of 3`}</span>${status === "Finished" ? "" : "<span>Stop automatic review</span>"}</div><div class="review-rounds"><span class="${round === 1 ? "is-active" : ""}">Round 1</span>${round > 1 ? `<span class="is-active">Round 2</span>` : ""}</div><div class="review-session__body">${body}</div>${footer ? `<footer class="review-session__footer">${footer}</footer>` : ""}</div>`;
}

function setupPanel(variant) {
  const variants = [
    "choose",
    "providers",
    "claude",
    "automatic",
    "settings",
    "priorities",
    "priorityChosen",
    "roundsChosen",
    "configured",
  ];
  const stage = variants.indexOf(variant);
  const settings = stage >= 4 && stage < 8;
  return `<div class="review-setup"><div class="review-setup__intro"><h3>Review this branch</h3><p>Inspect Codex's implementation with an independent reviewer.</p></div><h4>Scope</h4><div class="review-setup__options"><div class="review-setup__option"><b>▤</b><strong>Uncommitted changes</strong><small>Working tree</small></div><div class="review-setup__option is-selected"><b>⑂</b><strong>Current branch</strong><small>against origin/main</small></div></div><h4>Reviewer thread</h4><div class="review-setup__options"><div class="review-setup__option is-selected"><b>✦</b><strong>Independent reviewer</strong><small>Separate conversation</small></div><div class="review-setup__option ${stage >= 3 ? "is-disabled" : ""}"><b>◌</b><strong>Current thread</strong><small>${stage >= 3 ? "Unavailable in automatic mode" : "Stay in this conversation"}</small></div></div><h4>Review model</h4><div class="review-model-row"><span id="review-provider">${stage >= 2 ? "✻ Claude" : "✦ Codex"} ▾</span><span>Default model ▾</span><span>Default effort ▾</span>${variant === "providers" ? `<div class="review-provider-menu"><span>✦ Codex</span><span id="choose-claude">✻ Claude</span></div>` : ""}</div><div class="review-automatic-row"><strong>Automatic remediation</strong>${stage >= 3 ? `<span id="configure-auto">Configure</span>` : ""}<span id="automatic-toggle" class="review-toggle ${stage >= 3 ? "is-on" : ""}"></span></div>${stage >= 8 ? `<p class="review-config-summary">Critical through medium · Up to 3 rounds · No local commits</p>` : ""}<span class="review-action" id="start-automatic-review">Start review →</span></div>
    ${settings ? `<div class="review-settings-overlay"><div class="review-settings-dialog"><h3>Automatic remediation</h3><label>Fix priorities</label><div class="review-settings-select" id="priority-select">${stage >= 6 ? "Critical, high and medium" : "Critical and high"}<span>▾</span></div>${variant === "priorities" ? `<div class="review-priority-menu"><span>Only critical findings</span><span>Critical and high</span><span id="choose-priority">Critical, high and medium</span><span>All findings</span></div>` : ""}<label>Maximum review rounds</label><div class="review-round-input"><span>−</span><b>${stage >= 7 ? "3" : "2"}</b><span id="round-increase">+</span></div><div class="review-commit-row"><label>Commit after each fix round</label><span class="review-toggle"></span></div><p>Leave changes uncommitted for you to inspect and commit.</p><p>Automatic mode uses an independent reviewer for each round.<br>Never pushes or merges.</p><footer><span class="review-action" id="settings-done">Done</span></footer></div></div>` : ""}`;
}

function sceneVariant(scene, local) {
  if (scene.name === "command") return local >= 4.95 ? "sent" : "typing";
  if (scene.name === "setup")
    return local >= 10.76
      ? "configured"
      : local >= 8.1
        ? "roundsChosen"
        : local >= 6.96
          ? "priorityChosen"
          : local >= 5.1
            ? "priorities"
            : local >= 3.9
              ? "settings"
              : local >= 2.8
                ? "automatic"
                : local >= 1.86
                  ? "claude"
                  : local >= 0.8
                    ? "providers"
                    : "choose";
  if (scene.name === "reviewing")
    return local < 1 ? "starting" : local >= 4.2 ? "found" : "scanning";
  if (scene.name === "findings") return "expanded";
  if (scene.name === "fixing")
    return local >= 6.8
      ? "fixedBoth"
      : local >= 3.4
        ? "fixedFirst"
        : "fixFirst";
  if (scene.name === "second")
    return local < 0.8
      ? "starting"
      : local >= 7.5
        ? "handoff"
        : local >= 3.7
          ? "clear"
          : "scanning";
  return "";
}

function sceneContent(scene, variant) {
  switch (scene.name) {
    case "command":
      return {
        center: `${message("Cloud-agent support is implemented. The branch and focused checks are ready for independent review.", "Built by Codex · 3 files changed", "Codex")}${activity(
          [
            ["Connect cloud-based agents", "done"],
            ["Track connection and recovery status", "done"],
            ["Run focused feature checks", "done"],
          ],
        )}`,
        panel: `<div class="review-pane--dormant"><span>☑</span><strong>Code Review</strong><p>Inspect a branch or uncommitted work with an agent reviewer.</p></div>`,
        role: "Codex · feature/cloud-agents",
        label: "REVIEW / COMMAND",
      };
    case "setup":
      return {
        center: `${message("Cloud-agent support is implemented. The branch and focused checks are ready for independent review.", "Built by Codex · 3 files changed", "Codex")}${activity(
          [
            ["Connect cloud-based agents", "done"],
            ["Track connection and recovery status", "done"],
            ["Run focused feature checks", "done"],
          ],
        )}`,
        panel: setupPanel(variant),
        role: "Codex · feature/cloud-agents",
        label: "REVIEW / SETUP",
      };
    case "reviewing":
      return {
        center: `${newThread(1)}${
          variant === "starting"
            ? ""
            : message(
                "I’ll review the feature branch independently, looking for failure cases and regressions.",
              )
        }`,
        panel: reviewFrame(
          "Reviewing",
          1,
          `<div class="review-working"><span class="review-working__spinner"></span><strong>Review in progress</strong><p>Inspecting feature/cloud-agents against origin/main</p>${variant === "found" ? `<span class="review-working__count">2 findings found</span>` : ""}</div>`,
        ),
        role: "Claude · independent reviewer · Round 1",
        label: "REVIEW / INSPECT",
      };
    case "findings":
      return {
        center: message(
          "The findings are in the Review pane. I’ll apply the fixes selected by your priority settings.",
        ),
        panel: reviewFrame(
          "Automatic",
          1,
          `<div class="review-totals"><span><b>2</b> findings</span><span><b>2</b> auto-selected</span><span><b>0</b> fixed</span></div><div class="review-findings">${finding("High", "Reconnect duplicates a session", "src/cloud-session.ts:42", "Reuse the remote run identity after a dropped connection.", "selected", variant === "expanded")}${finding("Medium", "Offline agent appears active", "src/agent-status.ts:86", "Show a recoverable offline state when the endpoint drops.", "selected")}</div>`,
          `<span>High and medium findings qualify</span><span>Starting fixes automatically…</span>`,
        ),
        role: "Claude · independent reviewer · Round 1",
        label: "REVIEW / FINDINGS",
      };
    case "fixing": {
      const first = variant === "fixFirst" ? "fixing" : "fixed";
      const second =
        variant === "fixedBoth"
          ? "fixed"
          : variant === "fixedFirst"
            ? "fixing"
            : "pending";
      const fixedCount = Number(first === "fixed") + Number(second === "fixed");
      return {
        center: message(
          variant === "fixedBoth"
            ? "The selected fixes and their checks are complete. A fresh review will verify the result."
            : "I’m applying the selected fixes and running checks. Progress is tracked in the Review pane.",
        ),
        panel: reviewFrame(
          "Fixing",
          1,
          `<div class="review-fix-progress"><div><strong>Remediation progress</strong><span>${fixedCount} of 2 fixed</span></div><div class="review-fix-progress__track"><i id="review-fix-fill"></i></div></div><div class="review-findings">${finding("High", "Reconnect duplicates a session", "src/cloud-session.ts:42", "Use the remote run identity as the session key.", first)}${finding("Medium", "Offline agent appears active", "src/agent-status.ts:86", "Keep the offline state visible until recovery.", second)}</div>`,
          variant === "fixedBoth"
            ? `<span>Both fixes verified</span><span>Starting a fresh review round…</span>`
            : `<span>Fixing selected findings</span><span>● In progress</span>`,
        ),
        role: "Claude · independent reviewer · remediation",
        label: "REVIEW / FIX",
      };
    }
    case "second": {
      const complete = variant === "clear" || variant === "handoff";
      return {
        center: `${newThread(2)}${
          variant === "starting"
            ? ""
            : message(
                complete
                  ? "This fresh review found no open findings. Automatic review is complete after two of the three allowed rounds."
                  : "I’m reviewing the updated branch independently, including the fixes from the earlier round.",
              )
        }`,
        panel: reviewFrame(
          complete ? "Finished" : "Reviewing",
          2,
          complete
            ? `<div class="review-totals"><span><b>2</b> fixed</span><span><b>0</b> open</span><span><b>2</b> rounds</span></div><div class="review-clear"><span>✓</span><strong>No open findings</strong><p>The follow-up review is clear.</p></div>`
            : `<div class="review-working"><span class="review-working__spinner"></span><strong>Review in progress</strong><p>Checking the updated branch and prior findings</p></div>`,
          complete
            ? `<span>Report saved · 2 rounds used</span><span>Changes left uncommitted</span>`
            : "",
        ),
        role: "Claude · independent reviewer · Round 2",
        label: "REVIEW / VERIFY",
      };
    }
    default:
      return null;
  }
}

export function createFilm(document, browserWindow = document.defaultView) {
  const $ = (selector) => document.querySelector(selector);
  const film = $("#film");
  const viewport = $(".film-viewport");
  const opening = $(".opening");
  const walkthrough = $(".walkthrough");
  const ending = $(".ending");
  const toggle = $("#play-toggle");
  const scrubber = $("#scrubber");
  let time = 0;
  let playing = false;
  let lastFrame = 0;
  let paintedKey = "";

  function targetCenter(selector) {
    const target = $(selector);
    if (!target) return null;
    const outer = film.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const scale = outer.width / 1600 || 1;
    return {
      x: (rect.left + rect.width / 2 - outer.left) / scale,
      y: (rect.top + rect.height / 2 - outer.top) / scale,
    };
  }

  function updatePointer(scene, local) {
    const schedules = {
      command: [[3.5, 4.95, "#composer-send"]],
      setup: [
        [0.2, 0.8, "#review-provider"],
        [0.95, 1.6, "#choose-claude"],
        [2.1, 2.8, "#automatic-toggle"],
        [3.2, 3.9, "#configure-auto"],
        [4.4, 5.1, "#priority-select"],
        [6, 6.7, "#choose-priority"],
        [7.4, 8.1, "#round-increase"],
        [9.8, 10.5, "#settings-done"],
        [11.9, 12.8, "#start-automatic-review"],
      ],
    };
    const pointer = $("#film-pointer");
    const ring = $("#pointer-ring");
    const active = schedules[scene.name]?.find(
      ([start, click]) => local >= start && local <= click + 0.25,
    );
    if (!active) {
      pointer.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    const [start, click, selector] = active;
    const target = targetCenter(selector);
    if (!target) {
      pointer.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    const travel = ease((local - start) / (click - start));
    pointer.style.opacity = String(clamp((local - start) / 0.2, 0, 1));
    pointer.style.transform = `translate(${mix(target.x + 150, target.x - 7, travel)}px, ${mix(target.y + 92, target.y - 4, travel)}px) scale(${local >= click ? 0.88 : 1})`;
    const ripple = (local - click) / 0.28;
    ring.style.opacity = ripple >= 0 && ripple <= 1 ? String(1 - ripple) : "0";
    ring.style.transform = `translate(${target.x - 20}px, ${target.y - 20}px) scale(${0.5 + Math.max(0, ripple) * 1.5})`;
  }

  function updateMotion(scene, local) {
    $(".film-glow--one").style.transform =
      `translate(${Math.sin(time * 0.23) * 90}px, ${Math.cos(time * 0.14) * 50}px)`;
    $(".film-glow--two").style.transform =
      `translate(${Math.cos(time * 0.17) * 105}px, ${Math.sin(time * 0.21) * 65}px)`;
    if (scene.name === "opening") {
      const leave = ease((local - 2.35) / 0.85);
      opening.style.opacity = "1";
      opening.style.transform = `translateX(${-420 * leave}px) scale(${1 - leave * 0.06})`;
      opening.style.clipPath = `inset(0 ${leave * 100}% 0 0)`;
      walkthrough.style.opacity = "0";
      ending.style.opacity = "0";
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }
    opening.style.opacity = "0";
    if (scene.name === "ending") {
      const arrive = ease(local / 1.1);
      walkthrough.style.opacity = "0";
      ending.style.opacity = "1";
      ending.style.transform = `translateY(${95 * (1 - arrive)}px) scale(${0.95 + 0.05 * arrive})`;
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }
    ending.style.opacity = "0";
    walkthrough.style.opacity = "1";
    walkthrough.style.transform = "none";
    walkthrough.style.clipPath =
      scene.name === "command" && local < 0.8
        ? `inset(0 ${100 * (1 - ease(local / 0.8))}% 0 0)`
        : "none";
    if (scene.name === "command") {
      const count = Math.floor(clamp((local - 0.6) / 3.3, 0, 1) * 7);
      $("#composer-text").textContent =
        local >= 4.95
          ? "Ask a follow-up"
          : `/review`.slice(0, count) + (count < 7 ? "▍" : "");
      $("#review-composer").classList.toggle("is-typing", local < 4.95);
    } else {
      $("#composer-text").textContent = "Ask a follow-up";
      $("#review-composer").classList.remove("is-typing");
    }
    if (
      scene.name === "reviewing" ||
      (scene.name === "second" && local < 3.7)
    ) {
      const spinner = $(".review-working__spinner");
      if (spinner) spinner.style.transform = `rotate(${local * 220}deg)`;
    }
    if (scene.name === "findings") {
      $(".review-findings")
        ?.querySelectorAll(".review-finding")
        .forEach((item, index) => {
          const reveal = ease((local - 0.55 - index * 0.55) / 0.5);
          item.style.opacity = String(reveal);
          item.style.transform = `translateY(${(1 - reveal) * 22}px)`;
        });
    }
    if (scene.name === "fixing") {
      const first = clamp(local / 3.4, 0, 1);
      const second = clamp((local - 3.4) / 3.4, 0, 1);
      const fill = $("#review-fix-fill");
      if (fill) fill.style.width = `${Math.round((first + second) * 50)}%`;
    }
    if (scene.name === "second" && local >= 3.7) {
      const check = $(".review-clear > span");
      if (check)
        check.style.transform = `scale(${0.75 + ease((local - 3.7) / 0.55) * 0.25})`;
    }
    updatePointer(scene, local);
  }

  function paintScene(scene, variant) {
    const content = sceneContent(scene, variant);
    if (!content) return;
    const owner =
      scene.name === "command" ||
      scene.name === "setup" ||
      variant === "handoff";
    if (variant === "handoff") {
      content.center = `${message("Claude's automatic review is complete: two findings fixed, no open findings after two rounds. The report and verification evidence are saved.", "Review report · 2 fixed · 0 open", "Korus")}${message("The reviewed changes are ready for you to inspect. No commits, pushes, or merges were made.", "Back in the implementation conversation", "Codex")}`;
      content.role = "Codex · feature/cloud-agents";
    }
    $("#chapter-index").textContent = scene.chapter;
    $("#chapter-title").textContent = scene.title;
    $("#chapter-detail").textContent = scene.detail;
    $("#conversation-body").innerHTML = content.center;
    $("#review-pane-body").innerHTML = content.panel;
    $("#conversation-name").textContent = owner
      ? "Cloud agent work"
      : "Code reviewer";
    $("#conversation-role").textContent = content.role;
    $("#workspace-title").textContent = owner
      ? "Cloud agent work"
      : "Code reviewer";
    $("#workspace-status").textContent =
      scene.name === "second" && (variant === "clear" || variant === "handoff")
        ? "Review clear"
        : scene.name === "command" || scene.name === "setup"
          ? "Branch ready"
          : "Review in progress";
    const hasReviewer =
      scene.name !== "command" &&
      scene.name !== "setup" &&
      variant !== "handoff";
    $(".review-avatar").textContent = owner ? "✦" : "✻";
    $(".review-avatar").classList.toggle("is-claude", !owner);
    $("#reviewer-session").classList.toggle("is-visible", hasReviewer);
    $("#reviewer-session").classList.toggle(
      "sidebar-session--active",
      hasReviewer && !owner,
    );
    $("#target-session").classList.toggle("sidebar-session--active", owner);
    $("#film-footer-stage").textContent = content.label;
  }

  function fit() {
    film.style.transform = `scale(${(viewport.clientWidth || 1600) / 1600})`;
  }

  function seek(nextTime) {
    time = clamp(Number(nextTime) || 0, 0, DURATION);
    const scene = SCENES.find((item) => time < item.end) || SCENES.at(-1);
    const local = time - scene.start;
    const variant = sceneVariant(scene, local);
    const key = `${scene.name}/${variant}`;
    if (key !== paintedKey) {
      paintScene(scene, variant);
      paintedKey = key;
    }
    opening.style.pointerEvents = scene.name === "opening" ? "auto" : "none";
    ending.style.pointerEvents = scene.name === "ending" ? "auto" : "none";
    if (scene.name !== "opening" && scene.name !== "ending")
      $("#film-progress").style.width =
        `${((time - SCENES[1].start) / (SCENES[6].end - SCENES[1].start)) * 100}%`;
    updateMotion(scene, local);
    scrubber.value = String(time);
    $("#timecode").textContent =
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:56`;
    return { scene: scene.name, variant, time };
  }

  function frame(now) {
    if (!playing) return;
    if (lastFrame) seek(time + (now - lastFrame) / 1000);
    lastFrame = now;
    if (time >= DURATION) {
      pause();
      return;
    }
    browserWindow.requestAnimationFrame(frame);
  }
  function play() {
    if (playing) return;
    if (time >= DURATION) seek(0);
    playing = true;
    lastFrame = 0;
    toggle.textContent = "Pause";
    toggle.setAttribute("aria-label", "Pause film");
    browserWindow.requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    lastFrame = 0;
    toggle.textContent = "Play";
    toggle.setAttribute("aria-label", "Play film");
  }
  toggle.addEventListener("click", () => (playing ? pause() : play()));
  $("#restart").addEventListener("click", () => {
    pause();
    seek(0);
  });
  scrubber.addEventListener("input", () => {
    pause();
    seek(scrubber.value);
  });
  browserWindow?.addEventListener?.("resize", fit);
  fit();
  seek(0);
  return {
    seek,
    play,
    pause,
    get time() {
      return time;
    },
    get duration() {
      return DURATION;
    },
  };
}

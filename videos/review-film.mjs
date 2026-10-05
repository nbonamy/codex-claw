import "./product.mjs";

const DURATION = 50;
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
    end: 15,
    chapter: "02 / 06",
    title: "Choose the work to inspect.",
    detail: "Review this branch with an independent reviewer.",
  },
  {
    name: "reviewing",
    start: 15,
    end: 21,
    chapter: "03 / 06",
    title: "A second set of eyes.",
    detail: "The reviewer examines the branch and records structured findings.",
  },
  {
    name: "findings",
    start: 21,
    end: 29,
    chapter: "04 / 06",
    title: "Decide what matters.",
    detail:
      "Inspect findings, keep the relevant ones, and start targeted fixes.",
  },
  {
    name: "fixing",
    start: 29,
    end: 37,
    chapter: "05 / 06",
    title: "Fix with evidence.",
    detail: "Remediation progresses through the selected findings.",
  },
  {
    name: "second",
    start: 37,
    end: 44,
    chapter: "06 / 06",
    title: "Review it again.",
    detail: "A fresh round verifies the fixes before you finish.",
  },
  { name: "ending", start: 44, end: DURATION },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => 1 - (1 - clamp(value, 0, 1)) ** 3;
const mix = (start, end, progress) => start + (end - start) * progress;

function message(body, tool = "") {
  return `<div class="review-message"><strong><i>✦</i> Codex</strong><p>${body}</p>${tool ? `<span class="review-message__tool"><i>✓</i>${tool}</span>` : ""}</div>`;
}

function diff(mode = "source") {
  const rows =
    mode === "fixed"
      ? [
          ["41", "const session = await remote.connect(runId);", ""],
          [
            "42",
            "if (sessions.has(runId)) return sessions.get(runId);",
            "is-added",
          ],
          ["43", "sessions.set(runId, session);", "is-added"],
          ["44", "return session;", ""],
        ]
      : [
          ["41", "const session = await remote.connect(runId);", ""],
          ["42", "sessions.set(randomId(), session);", "is-removed is-focus"],
          ["43", "return session;", ""],
        ];
  return `<div class="review-diff"><header>src/cloud-session.ts <span>${mode === "fixed" ? "reviewed fix" : "feature/cloud-agents"}</span></header>${rows.map(([number, code, className]) => `<div class="review-diff__line ${className}"><b>${number}</b><span>${code}</span></div>`).join("")}</div>`;
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
  return `<div class="review-session"><header class="review-session__header"><div><small>CODE REVIEW</small><strong>feature/cloud-agents</strong></div><span>${status}</span></header><div class="review-rounds"><span class="${round === 1 ? "is-active" : ""}">Round 1</span>${round > 1 ? `<span class="is-active">Round 2</span>` : ""}</div><div class="review-session__body">${body}</div>${footer ? `<footer class="review-session__footer">${footer}</footer>` : ""}</div>`;
}

function sceneVariant(scene, local) {
  if (scene.name === "command") return local >= 4.95 ? "sent" : "typing";
  if (scene.name === "setup") return local >= 6.1 ? "started" : "choose";
  if (scene.name === "reviewing") return local >= 4.7 ? "found" : "scanning";
  if (scene.name === "findings") return local >= 2.4 ? "expanded" : "list";
  if (scene.name === "fixing")
    return local >= 6.8
      ? "fixedBoth"
      : local >= 3.4
        ? "fixedFirst"
        : "fixFirst";
  if (scene.name === "second") return local >= 3.7 ? "clear" : "scanning";
  return "";
}

function sceneContent(scene, variant) {
  switch (scene.name) {
    case "command":
      return {
        center: `${message("The branch is ready. The implementation and focused checks are complete.", "3 files changed · branch ready")}${diff()}`,
        panel: `<div class="review-pane--dormant"><span>☑</span><strong>Code Review</strong><p>Inspect a branch or uncommitted work with an agent reviewer.</p></div>`,
        role: "Codex · feature/cloud-agents",
        label: "REVIEW / COMMAND",
      };
    case "setup":
      return {
        center: `${message("The branch is ready. The implementation and focused checks are complete.", "3 files changed · branch ready")}${diff()}`,
        panel: `<div class="review-setup"><div class="review-setup__intro"><span>☑</span><h3>Review this branch</h3><p>Choose the changes and reviewer conversation.</p></div><h4>Scope</h4><div class="review-setup__options"><div class="review-setup__option"><b>▤</b><strong>Uncommitted changes</strong><small>Working tree</small></div><div class="review-setup__option is-selected"><b>⑂</b><strong>Current branch</strong><small>against origin/main</small></div></div><h4>Reviewer thread</h4><div class="review-setup__options"><div class="review-setup__option is-selected"><b>✦</b><strong>Independent reviewer</strong><small>Separate conversation</small></div><div class="review-setup__option"><b>◌</b><strong>Current thread</strong><small>Stay in this conversation</small></div></div><span class="review-action">Start review →</span></div>`,
        role: "Codex · feature/cloud-agents",
        label: "REVIEW / SETUP",
      };
    case "reviewing":
      return {
        center: `${message("I’m inspecting feature/cloud-agents against origin/main. I’ll report findings with file locations and evidence.", "Reading branch diff")}${diff()}`,
        panel: reviewFrame(
          "Reviewing",
          1,
          `<div class="review-working"><span class="review-working__spinner"></span><strong>Review in progress</strong><p>Inspecting feature/cloud-agents against origin/main</p>${variant === "found" ? `<span class="review-working__count">2 findings found</span>` : ""}</div>`,
        ),
        role: "Independent reviewer · Round 1",
        label: "REVIEW / INSPECT",
      };
    case "findings":
      return {
        center: `${message("I found two issues worth resolving before this branch is ready. The first can duplicate a remote session after reconnect; the second leaves an offline agent looking active.", "2 findings recorded")}${diff()}`,
        panel: reviewFrame(
          "Ready",
          1,
          `<div class="review-totals"><span><b>2</b> findings</span><span><b>2</b> selected</span><span><b>0</b> fixed</span></div><div class="review-findings">${finding("P1", "Reconnect duplicates a session", "src/cloud-session.ts:42", "Reuse the remote run identity after a dropped connection.", "selected", variant === "expanded")}${finding("P2", "Offline agent appears active", "src/agent-status.ts:86", "Show a recoverable offline state when the endpoint drops.", "selected")}</div>`,
          `<span>2 findings selected</span><span class="review-action">Remediate selected →</span>`,
        ),
        role: "Independent reviewer · Round 1",
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
        center: `${message(variant === "fixedBoth" ? "Both selected findings are fixed. I verified the reconnect identity and offline-state behavior with focused checks." : variant === "fixedFirst" ? "The reconnect fix is in. I’m now correcting the offline status path." : "I’m applying the selected fixes in the branch and recording evidence for each finding.", variant === "fixedBoth" ? "Focused checks passed" : "Remediation in progress")}${diff(variant === "fixFirst" ? "source" : "fixed")}`,
        panel: reviewFrame(
          "Fixing",
          1,
          `<div class="review-fix-progress"><div><strong>Remediation progress</strong><span>${fixedCount} of 2 fixed</span></div><div class="review-fix-progress__track"><i id="review-fix-fill"></i></div></div><div class="review-findings">${finding("P1", "Reconnect duplicates a session", "src/cloud-session.ts:42", "Use the remote run identity as the session key.", first)}${finding("P2", "Offline agent appears active", "src/agent-status.ts:86", "Keep the offline state visible until recovery.", second)}</div>`,
          variant === "fixedBoth"
            ? `<span>Both fixes verified</span><span class="review-action">Review again →</span>`
            : `<span>Fixing selected findings</span><span>● In progress</span>`,
        ),
        role: "Independent reviewer · remediation",
        label: "REVIEW / FIX",
      };
    }
    case "second":
      return {
        center: `${message(variant === "clear" ? "The second review found no open findings. The selected fixes are verified and this review is ready to finish." : "I’m checking the updated branch in a fresh round, including the earlier findings.", variant === "clear" ? "Round 2 complete · 0 findings" : "Round 2 in progress")}${diff("fixed")}`,
        panel: reviewFrame(
          variant === "clear" ? "Ready to finish" : "Reviewing",
          2,
          variant === "clear"
            ? `<div class="review-totals"><span><b>2</b> fixed</span><span><b>0</b> open</span><span><b>2</b> rounds</span></div><div class="review-clear"><span>✓</span><strong>No open findings</strong><p>The follow-up review is clear.</p></div>`
            : `<div class="review-working"><span class="review-working__spinner"></span><strong>Review in progress</strong><p>Checking the updated branch and prior findings</p></div>`,
          variant === "clear"
            ? `<span>Round 2 is clear</span><span class="review-action">Finish review →</span>`
            : "",
        ),
        role: "Independent reviewer · Round 2",
        label: "REVIEW / VERIFY",
      };
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
      setup: [[4.9, 6.1, ".review-setup > .review-action"]],
      findings: [
        [0.9, 2.4, ".review-finding:first-child .review-finding__heading"],
        [6.2, 7.6, ".review-session__footer .review-action"],
      ],
      fixing: [[6.85, 7.7, ".review-session__footer .review-action"]],
      second: [[5.4, 6.6, ".review-session__footer .review-action"]],
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
    $("#chapter-index").textContent = scene.chapter;
    $("#chapter-title").textContent = scene.title;
    $("#chapter-detail").textContent = scene.detail;
    $("#conversation-body").innerHTML = content.center;
    $("#review-pane-body").innerHTML = content.panel;
    $("#conversation-name").textContent =
      scene.name === "command" || scene.name === "setup"
        ? "Cloud agent work"
        : "Code reviewer";
    $("#conversation-role").textContent = content.role;
    $("#workspace-title").textContent =
      scene.name === "command" || scene.name === "setup"
        ? "Cloud agent work"
        : "Code reviewer";
    $("#workspace-status").textContent =
      scene.name === "second" && variant === "clear"
        ? "Review clear"
        : scene.name === "command" || scene.name === "setup"
          ? "Branch ready"
          : "Review in progress";
    const hasReviewer = scene.name !== "command" && scene.name !== "setup";
    $("#reviewer-session").classList.toggle("is-visible", hasReviewer);
    $("#reviewer-session").classList.toggle(
      "sidebar-session--active",
      hasReviewer,
    );
    $("#target-session").classList.toggle(
      "sidebar-session--active",
      !hasReviewer,
    );
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
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:50`;
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

if (typeof window !== "undefined" && document.querySelector("#film")) {
  const params = new URLSearchParams(window.location.search);
  const exportMode = params.has("export");
  if (exportMode) document.body.classList.add("exporting");
  const controller = createFilm(document, window);
  window.seekFilm = controller.seek;
  window.filmController = controller;
  if (params.has("t")) controller.seek(Number(params.get("t")));
  if (!exportMode) controller.play();
}

const DURATION = 48;
const STAGES = ["Requirements", "Tickets", "Implementation", "Review", "Ship"];
const PROMPT =
  "Add support for cloud-based agents. Let teams connect a remote agent, start repository-bound sessions, and follow its status and artifacts beside local agents. Keep existing local sessions unchanged.";

const SCENES = [
  { name: "opening", start: 0, end: 3.3 },
  {
    name: "prompt",
    start: 3.3,
    end: 9.3,
    stage: 0,
    chapter: "01 / 06",
    title: "Start with an outcome.",
    detail: "Describe the change you want to deliver.",
  },
  {
    name: "requirements",
    start: 9.3,
    end: 16.3,
    stage: 0,
    chapter: "02 / 06",
    title: "Shape it together.",
    detail: "A reviewable brief makes the intent explicit before code begins.",
  },
  {
    name: "tickets",
    start: 16.3,
    end: 22.5,
    stage: 1,
    chapter: "03 / 06",
    title: "Turn intent into work.",
    detail: "Approve an ordered backlog, grounded in the repository.",
  },
  {
    name: "implementation",
    start: 22.5,
    end: 30.5,
    stage: 2,
    chapter: "04 / 06",
    title: "Build in an isolated worktree.",
    detail: "Follow the implementation and its evidence—not just the chat.",
  },
  {
    name: "review",
    start: 30.5,
    end: 37.6,
    stage: 3,
    chapter: "05 / 06",
    title: "Review, fix, review again.",
    detail: "Findings become decisions and follow-up work.",
  },
  {
    name: "ship",
    start: 37.6,
    end: 42,
    stage: 4,
    chapter: "06 / 06",
    title: "Deliver the change.",
    detail: "Carry the reviewed work through the repository handoff.",
  },
  { name: "github", start: 42, end: 44.8 },
  { name: "ending", start: 44.8, end: DURATION },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function ease(value) {
  const t = clamp(value, 0, 1);
  return 1 - (1 - t) ** 3;
}
function mix(start, end, progress) {
  return start + (end - start) * progress;
}
function chatAgent(message, tool = "") {
  return `<div class="chat-agent"><strong><i>✦</i> Codex</strong><p>${message}</p>${tool ? `<div class="chat-tool"><i>✓</i>${tool}</div>` : ""}</div>`;
}
function chatUser(message) {
  return `<div class="chat-user">${message}</div>`;
}
function action(label, accepted = false) {
  return `<span class="${accepted ? "accepted-action" : "primary-action"}">${label}${accepted ? "" : " &nbsp; →"}</span>`;
}
function ticket(number, title, summary, ready = true) {
  return `<article class="ticket-card" data-ticket="${number}"><div><b>${number}</b><strong>${title}</strong></div><p>${summary}</p><small>${ready ? "Ready to build" : "After 01"}</small></article>`;
}
function buildRow(number, title, status) {
  return `<div class="build-row"><span>${number}</span><strong>${title}</strong><small class="${status === "Done" ? "done" : ""}">${status}</small></div>`;
}
function reviewFinding(priority, title, summary, file, state) {
  const label =
    state === "fixed"
      ? "✓ Fixed"
      : state === "fixing"
        ? "● Fixing"
        : "☑ Selected";
  return `<article class="finding ${state}" data-finding="${priority}"><div><span class="priority">${state === "fixed" ? "Fixed" : priority}</span><strong>${title}</strong></div><p>${summary}</p><footer><span>codex-claw · ${file}</span><b>${label}</b></footer></article>`;
}

function sceneVariant(scene, local) {
  if (scene.name === "prompt") return local >= 4.75 ? "sent" : "typing";
  if (scene.name === "requirements")
    return local >= 6.05 ? "approved" : "review";
  if (scene.name === "tickets") return local >= 5.45 ? "approved" : "draft";
  if (scene.name === "implementation") {
    if (local >= 6.7) return "complete";
    if (local >= 4.7) return "ticket3";
    if (local >= 2.7) return "ticket2";
    return "ticket1";
  }
  if (scene.name === "review") {
    if (local >= 5.6) return "clean";
    if (local >= 4.85) return "readyToRerun";
    if (local >= 3.15) return "fixSecond";
    if (local >= 1.5) return "fixFirst";
    return "triage";
  }
  if (scene.name === "ship") return "pending";
  return "";
}

function sceneContent(scene, variant) {
  switch (scene.name) {
    case "prompt":
      return {
        heading: "Mission brief",
        action: "",
        artifact: `<div class="prompt-empty"><div class="prompt-symbol">◎</div><h4>What do you want to build?</h4><p>Describe the outcome. Your mission lead will help shape the work.</p><div class="prompt-box"><small>Describe what you want to build…</small><span id="prompt-text"></span><b>↑</b></div></div>`,
        conversation:
          variant === "sent"
            ? `${chatUser("Add support for cloud-based agents.")}${chatAgent("I’ll shape the requirements and bring you a brief to review.", "Shaping requirements")}`
            : "",
        role: "Requirements · guiding the mission with you",
      };
    case "requirements":
      return {
        heading: "Mission brief",
        action:
          variant === "approved"
            ? action("✓ Accepted", true)
            : action("Approve and continue"),
        artifact: `<div class="artifact-document"><p class="artifact-kicker">Proposed requirements · codex-claw</p><h4>Cloud-based agents</h4><p>Make remote coding sessions feel like part of the same repository workspace.</p><div class="divider"></div><h5>What we’re building</h5><ul><li>Connect a cloud agent endpoint for a team.</li><li>Start a remote session from repository context.</li><li>Show its status and artifacts beside local sessions.</li></ul><h5>Acceptance criteria</h5><ul><li>Reconnect does not create duplicate sessions.</li><li>Offline state is visible and recoverable.</li><li>Existing local sessions behave as before.</li></ul><div class="artifact-note">⊕ &nbsp; Select text to leave an inline comment.</div></div>`,
        conversation: `${chatUser("Add support for cloud-based agents.")}${chatAgent("Here’s the Mission brief. I included repository context, reconnect behavior, and the local-session boundary.", "Mission brief ready for review")}`,
        role: "Requirements · shaping requirements",
      };
    case "tickets":
      return {
        heading: "Implementation backlog",
        action:
          variant === "approved"
            ? action("✓ Accepted", true)
            : action("Approve and continue"),
        artifact: `<p class="artifact-kicker">3 tickets · codex-claw</p><div class="ticket-grid">${ticket("01", "Connect cloud agent endpoint", "Add connection state and secure session metadata.")}${ticket("02", "Launch repository-bound sessions", "Start and restore remote work from repository context.")}${ticket("03", "Show progress and artifacts", "Surface remote status without changing local sessions.", false)}</div><div class="artifact-note">☷ &nbsp; Review the tickets or ask for changes in chat.</div>`,
        conversation: `${chatAgent("The brief is now an ordered backlog: connection, repository sessions, then visible progress and artifacts.", "3 tickets drafted")}${chatUser("Looks good. Protect the existing local flow.")}`,
        role: "Tickets · shaping tickets",
      };
    case "implementation": {
      const complete = variant === "complete";
      const completeCount = complete
        ? 3
        : variant === "ticket3"
          ? 2
          : variant === "ticket2"
            ? 1
            : 0;
      const activeTicket = Math.min(completeCount + 1, 3);
      const status = (index) =>
        index <= completeCount
          ? "Done"
          : index === activeTicket
            ? "Building"
            : "Waiting";
      return {
        heading: "Implementation evidence",
        action: complete
          ? action("Continue to Review")
          : `<span class="working-action">● &nbsp; Building ${activeTicket} of 3</span>`,
        artifact: `<div class="implementation-summary"><div><strong>Execution</strong><span>${completeCount} of 3 tickets complete</span></div><div class="meter"><i id="implementation-progress-fill"></i></div></div><section class="repo-lane"><header><b>▣</b><strong>codex-claw</strong><span>⑂ mission/cloud-agents</span></header>${buildRow("01", "Connect cloud agent endpoint", status(1))}${buildRow("02", "Launch repository-bound sessions", status(2))}${buildRow("03", "Show progress and artifacts", status(3))}</section><div class="artifact-note">⑂ &nbsp; Dedicated worktree · mission/cloud-agents</div>`,
        conversation: `${chatAgent(complete ? "All three tickets are implemented. The focused tests pass; the changes are ready for Review." : variant === "ticket3" ? "Repository sessions are ready. I’m wiring status and artifacts into the workspace." : variant === "ticket2" ? "The endpoint connection is ready. Next I’m starting sessions from repository context." : "I’m building the cloud connection in the Mission worktree.", complete ? "Focused tests passed" : `Building ticket ${activeTicket} of 3`)}`,
        role: "Builder · codex-claw",
      };
    }
    case "review": {
      const fixedCount =
        variant === "readyToRerun" || variant === "clean"
          ? 2
          : variant === "fixSecond"
            ? 1
            : 0;
      const firstState =
        variant === "triage"
          ? "selected"
          : variant === "fixFirst"
            ? "fixing"
            : "fixed";
      const secondState =
        variant === "readyToRerun" || variant === "clean"
          ? "fixed"
          : variant === "fixSecond"
            ? "fixing"
            : "selected";
      const messages = {
        triage:
          "I found two issues to resolve before shipping. Both are selected for a targeted fix.",
        fixFirst:
          "I’m fixing the reconnect path first so one remote run maps to one session.",
        fixSecond:
          "Reconnect is fixed and tested. I’m correcting the offline status next.",
        readyToRerun:
          "Both fixes are complete in the same worktree. Re-run Review to verify them.",
        clean:
          "The follow-up review found no open findings. You can move to Ship.",
      };
      return {
        heading: "Review findings",
        action:
          variant === "clean"
            ? action("Approve and continue")
            : variant === "readyToRerun"
              ? action("Re-run review")
              : variant === "triage"
                ? action("Fix 2 selected")
                : `<span class="working-action">● &nbsp; Fixing selected findings</span>`,
        artifact: `<div class="review-tabs"><span>Review</span><span>Changes</span></div><div class="review-fix-progress"><div><strong>Remediation progress</strong><span>${fixedCount} of 2 fixed</span></div><div class="meter"><i id="review-progress-fill"></i></div></div>${variant === "clean" ? `<div class="review-clean"><span>✓</span><h4>No open findings</h4><p>The follow-up review is clear. Ready for delivery.</p></div>` : `<div class="finding-list">${reviewFinding("P1", "Reconnect can duplicate a cloud session", "Reuse the remote run identity after a dropped connection.", "cloud-session.ts", firstState)}${reviewFinding("P2", "Offline agent still appears active", "Show a recoverable offline state when the endpoint drops.", "agent-status.ts", secondState)}</div><div class="artifact-note">${variant === "readyToRerun" ? "✓ &nbsp; Both fixes are complete. Run Review again to verify." : "⊕ &nbsp; Findings are resolved one at a time in the Mission worktree."}</div>`}`,
        conversation: `${chatAgent(messages[variant], variant === "clean" ? "Follow-up review complete" : variant === "readyToRerun" ? "Focused tests passed" : variant === "triage" ? "2 findings selected" : "Remediation in progress")}`,
        role: "Review · checking the work",
      };
    }
    case "ship":
      return {
        heading: "Repository delivery",
        action: "",
        artifact: `<div class="ship-summary"><span>0 of 1 repositories delivered</span><div class="meter"><i></i></div></div><article class="ship-card"><header><span>⑂</span><div><strong>codex-claw</strong><small>mission/cloud-agents</small></div><em>Ready to ship</em></header><p>Commit the reviewed work, then create a pull request.</p><div class="ship-actions"><span>Open worktree</span><span>Create pull request →</span></div></article>`,
        conversation: `${chatAgent("The reviewed branch is ready. Create a pull request when you’re ready to hand it off.", "Review approved")}`,
        role: "Ship · repository handoff",
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
  const github = $(".github-scene");
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
      prompt: [[3.5, 4.75, ".prompt-box b"]],
      requirements: [[4.8, 6.05, "#artifact-action > span"]],
      tickets: [[4.2, 5.45, "#artifact-action > span"]],
      implementation: [[6.85, 7.75, "#artifact-action > span"]],
      review: [
        [0.45, 1.5, "#artifact-action > span"],
        [4.9, 5.6, "#artifact-action > span"],
      ],
      ship: [[2.8, 4.25, ".ship-actions span:last-child"]],
    };
    const active = schedules[scene.name]?.find(
      ([start, click]) => local >= start && local <= click + 0.25,
    );
    const pointer = $("#film-pointer");
    const ring = $("#pointer-ring");
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
    const x = mix(target.x + 160, target.x - 7, travel);
    const y = mix(target.y + 95, target.y - 4, travel);
    pointer.style.opacity = String(clamp((local - start) / 0.2, 0, 1));
    pointer.style.transform = `translate(${x}px, ${y}px) scale(${local >= click ? 0.88 : 1})`;
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
      const leave = ease((local - 2.35) / 0.95);
      opening.style.opacity = "1";
      opening.style.transform = `translateX(${-420 * leave}px) scale(${1 - leave * 0.06})`;
      opening.style.clipPath = `inset(0 ${leave * 100}% 0 0)`;
      walkthrough.style.opacity = "0";
      github.style.opacity = "0";
      ending.style.opacity = "0";
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }

    opening.style.opacity = "0";
    if (scene.name === "github") {
      walkthrough.style.opacity = "0";
      github.style.opacity = "1";
      ending.style.opacity = "0";
      const cardReveal = ease(local / 0.55);
      const reviewReveal = ease((local - 0.35) / 0.4);
      const checksReveal = ease((local - 0.75) / 0.4);
      $(".pr-card").style.opacity = String(cardReveal);
      $(".pr-card").style.transform = `translateY(${(1 - cardReveal) * 32}px)`;
      $(".pr-review-status").style.opacity = String(reviewReveal);
      $(".pr-review-status").style.transform =
        `translateX(${(1 - reviewReveal) * 20}px)`;
      $(".pr-check-status").style.opacity = String(checksReveal);
      $(".pr-check-status").style.transform =
        `translateX(${(1 - checksReveal) * 20}px)`;
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }
    if (scene.name === "ending") {
      const arrive = ease(local / 1.1);
      walkthrough.style.opacity = "0";
      github.style.opacity = String(1 - arrive);
      ending.style.opacity = "1";
      ending.style.transform = `translateY(${95 * (1 - arrive)}px) scale(${0.95 + 0.05 * arrive})`;
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }

    ending.style.opacity = "0";
    github.style.opacity = "0";
    walkthrough.style.opacity = "1";
    walkthrough.style.transform = "none";
    walkthrough.style.clipPath =
      scene.name === "prompt" && local < 0.8
        ? `inset(0 ${100 * (1 - ease(local / 0.8))}% 0 0)`
        : "none";

    if (scene.name === "requirements") {
      $(".artifact-document")
        ?.querySelectorAll("li")
        .forEach((item, index) => {
          const reveal = ease((local - 0.65 - index * 0.28) / 0.5);
          item.style.opacity = String(reveal);
          item.style.transform = `translateY(${(1 - reveal) * 13}px)`;
        });
    }
    if (scene.name === "tickets") {
      $("#artifact-body")
        .querySelectorAll(".ticket-card")
        .forEach((card, index) => {
          const reveal = ease((local - 0.65 - index * 0.48) / 0.6);
          card.style.opacity = String(reveal);
          card.style.transform = `translateY(${(1 - reveal) * 32}px) scale(${0.95 + reveal * 0.05})`;
        });
    }
    if (scene.name === "implementation") {
      $("#implementation-progress-fill").style.width =
        `${Math.round(clamp((local - 0.7) / 6, 0, 1) * 100)}%`;
      $("#artifact-body")
        .querySelectorAll(".build-row")
        .forEach((row, index) => {
          const reveal = ease((local - 0.5 - index * 0.31) / 0.5);
          row.style.opacity = String(reveal);
          row.style.transform = `translateX(${(1 - reveal) * 24}px)`;
        });
    }
    if (scene.name === "review") {
      const firstFix = clamp((local - 1.5) / 1.65, 0, 1);
      const secondFix = clamp((local - 3.15) / 1.7, 0, 1);
      $("#review-progress-fill").style.width =
        `${Math.round((firstFix + secondFix) * 50)}%`;
    }
    if (scene.name === "ship") {
      const meter = $(".ship-summary .meter i");
      if (meter)
        meter.style.width = `${Math.round(ease((local - 4.25) / 0.9) * 100)}%`;
    }
    updatePointer(scene, local);
  }

  function fit() {
    const scale = (viewport.clientWidth || 1600) / 1600;
    film.style.transform = `scale(${scale})`;
  }

  function renderStages(scene, variant) {
    const current = scene.stage;
    const completed =
      current + (scene.name === "ship" && variant === "complete" ? 1 : 0);
    $("#stage-list").innerHTML = STAGES.map((name, index) => {
      const state =
        index < completed
          ? "complete"
          : index === current
            ? "current"
            : "upcoming";
      const status =
        state === "complete"
          ? "Complete"
          : state === "upcoming"
            ? "Not started"
            : scene.name === "prompt"
              ? "Ready to start"
              : variant === "approved" || variant === "clean"
                ? "Ready for review"
                : "In progress";
      return `<li class="${state}" data-stage="${name.toLowerCase()}"><span class="stage-marker">${state === "complete" ? "✓" : index + 1}</span><span class="stage-copy"><strong>${name}</strong><small>${status}</small></span></li>`;
    }).join("");
    $("#stage-count").textContent = `${completed} of 5 stages`;
    $("#stage-percent").textContent = `${completed * 20}%`;
    $("#stage-progress-fill").style.width = `${completed * 20}%`;
    $("#mission-status").textContent =
      completed === 5 ? "Completed" : "In progress";
    $("#mission-status").classList.toggle("completed", completed === 5);
  }

  function paintScene(scene, variant) {
    const content = sceneContent(scene, variant);
    if (!content) return;
    $("#chapter-index").textContent = scene.chapter;
    $("#chapter-title").textContent = scene.title;
    $("#chapter-detail").textContent = scene.detail;
    $("#artifact-title").textContent = content.heading;
    $("#artifact-action").innerHTML = content.action;
    $("#artifact-body").innerHTML = content.artifact;
    $("#conversation-body").innerHTML = content.conversation;
    $("#conversation-name").textContent =
      scene.name === "implementation" ? "codex-claw" : "Mission lead";
    $("#conversation-role").textContent = content.role;
    $("#film-footer-stage").textContent =
      `MISSION / ${STAGES[scene.stage].toUpperCase()}`;
    renderStages(scene, variant);
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
    if (scene.stage !== undefined) {
      $("#film-progress").style.width =
        `${((time - SCENES[1].start) / (SCENES[6].end - SCENES[1].start)) * 100}%`;
    }
    if (scene.name === "prompt") {
      const count = Math.floor(
        (variant === "sent" ? 1 : clamp((local - 0.7) / 3.7, 0, 1)) *
          PROMPT.length,
      );
      $("#prompt-text").textContent =
        PROMPT.slice(0, count) + (count < PROMPT.length ? "▍" : "");
    }
    updateMotion(scene, local);
    scrubber.value = String(time);
    $("#timecode").textContent =
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:48`;
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

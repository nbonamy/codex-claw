const DURATION = 43;
const SCENES = [
  { name: "opening", start: 0, end: 3 },
  {
    name: "chat",
    start: 3,
    end: 8.2,
    chapter: "01 / 05",
    title: "Start with a Quick Chat.",
    detail: "Explore the idea before choosing a project folder.",
    footer: "PROJECT / DISCUSS",
  },
  {
    name: "shape",
    start: 8.2,
    end: 16,
    chapter: "02 / 05",
    title: "Shape the first version.",
    detail: "Turn the conversation into a useful starting brief.",
    footer: "PROJECT / SHAPE",
  },
  {
    name: "ask",
    start: 16,
    end: 21,
    chapter: "03 / 05",
    title: "Say when it is time.",
    detail: "Project creation starts only when you ask for it.",
    footer: "PROJECT / REQUEST",
  },
  {
    name: "create",
    start: 21,
    end: 28,
    chapter: "04 / 05",
    title: "Claw takes care of setup.",
    detail: "Folder, project agent, and handoff—one connected step.",
    footer: "PROJECT / CREATE",
  },
  {
    name: "ready",
    start: 28,
    end: 34,
    chapter: "05 / 05",
    title: "A project is ready to open.",
    detail: "The new agent appears beside the original Quick Chat.",
    footer: "PROJECT / READY",
  },
  {
    name: "work",
    start: 34,
    end: 38,
    chapter: "05 / 05",
    title: "Pick up where you left off.",
    detail: "The project agent starts with the agreed context.",
    footer: "PROJECT / BUILD",
  },
  { name: "ending", start: 38, end: DURATION },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => 1 - (1 - clamp(value, 0, 1)) ** 3;
const mix = (a, b, amount) => a + (b - a) * amount;

function userMessage(text) {
  return `<div class="delegate-user">${text}</div>`;
}

function agentMessage(text, name = "Codex") {
  return `<div class="delegate-message"><strong>✦ ${name}</strong><p>${text}</p></div>`;
}

const firstQuestion =
  "I have an idea for a simple app that turns meeting notes into clear tasks.";
const firstAnswer =
  "Yes. Let’s turn the key points into tasks, then make the results easy to check.";
const createRequest =
  "Create a project called actionboard and start it with this plan.";

function conversationMontage() {
  const rounds = [
    [
      "Could it handle messy meeting notes?",
      "Yes. Extract candidate tasks first, then let you edit them before saving.",
    ],
    [
      "Can we add owners and due dates?",
      "We can suggest both when they are mentioned and keep every field editable.",
    ],
    [
      "Could each task link to the sentence it came from?",
      "Absolutely. Put the source sentence beside each task so it is easy to verify.",
    ],
  ];
  return `<div class="delegate-iteration project-montage"><div class="delegate-iteration__heading"><span>QUICK CHAT</span><strong>Finding the shape together</strong><small id="iteration-count">01 / 03</small></div><div class="delegate-iteration__stage">${rounds.map(([user, agent]) => `<div class="delegate-iteration__round">${userMessage(user)}${agentMessage(agent)}</div>`).join("")}</div><div class="delegate-iteration__track"><i id="iteration-fill"></i></div><p>Three quick turns. One clear starting point.</p></div>`;
}

function brief() {
  return `<div class="project-intro"><span>FIRST VERSION · AGREED IN CHAT</span><strong>Meeting notes → actionable tasks</strong><p>Paste notes. Extract tasks with owner and due date. Review each task beside its source sentence.</p></div>`;
}

function toolCall() {
  return `<div class="project-tool"><header><span class="project-tool__glyph">◫</span><strong>create-project</strong><small>Quick Chat action</small></header><div class="project-tool__body"><div><span>Name</span><code>actionboard</code></div><div><span>Handoff</span><strong>Build a focused meeting-notes app with editable tasks, owners, due dates, and source links.</strong></div></div></div>`;
}

function setupCard() {
  const steps = [
    "Create project folder",
    "Start project agent",
    "Send the agreed handoff",
  ];
  return `<div class="project-progress"><header><span>✦</span><div><strong>Creating actionboard</strong><small>Turning the Quick Chat plan into a working project</small></div></header><div class="project-progress__steps">${steps.map((step, index) => `<div class="project-progress__step" data-step="${index}"><b>${index + 1}</b><span>${step}</span></div>`).join("")}</div><div class="project-progress__track"><i id="creation-fill"></i></div></div>`;
}

function resultCard() {
  return `<div class="project-result"><span>✓</span><div><strong>actionboard is ready</strong><small>Project folder created · project agent started · handoff sent</small></div></div>`;
}

function contentFor(scene, variant) {
  switch (scene.name) {
    case "chat":
      return variant === "typing"
        ? agentMessage("What would you like to make?")
        : `${userMessage(firstQuestion)}${agentMessage(firstAnswer)}`;
    case "shape":
      return variant === "montage"
        ? conversationMontage()
        : `<div class="delegate-iteration__later">A few turns later</div>${agentMessage("We have a focused first version: notes in, editable tasks out, with owners, dates, and source links.")}${brief()}`;
    case "ask":
      return `${brief()}${variant === "typing" ? "" : userMessage(createRequest)}${variant === "sent" ? agentMessage("I’ll create the project and give its agent our starting brief. This Quick Chat will stay here.") : ""}`;
    case "create":
      return `${userMessage(createRequest)}${toolCall()}${setupCard()}`;
    case "ready":
      return `${userMessage(createRequest)}${resultCard()}${agentMessage("Created actionboard and started its project agent. You can open it from the sidebar; this chat is still here.")}`;
    case "work":
      return `${userMessage("Build actionboard from our Quick Chat brief: notes in, editable tasks out, with owners, due dates, and source links.")}${agentMessage(variant === "working" ? "I have the handoff. I’m setting up the app and starting with the notes-to-tasks flow." : "I have the handoff and the project folder. I’ll start with the notes input and an editable task list.", "Project agent")}${variant === "working" ? '<div class="project-file-list"><strong>Starting in actionboard</strong><span>Notes input</span><span>Task review</span><span>Source links</span></div>' : ""}`;
    default:
      return "";
  }
}

function variantFor(scene, local) {
  if (scene.name === "chat") return local < 2.7 ? "typing" : "answered";
  if (scene.name === "shape") return local < 5.2 ? "montage" : "brief";
  if (scene.name === "ask")
    return local < 2.7 ? "typing" : local < 3.5 ? "requested" : "sent";
  if (scene.name === "work") return local < 1.8 ? "arrived" : "working";
  return "default";
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

  function paint(scene, variant) {
    if (scene.name === "opening" || scene.name === "ending") return;
    $("#chapter-index").textContent = scene.chapter;
    $("#chapter-title").textContent = scene.title;
    $("#chapter-detail").textContent = scene.detail;
    $("#film-footer-stage").textContent = scene.footer;
    $("#conversation-body").innerHTML = contentFor(scene, variant);
    const inProject = scene.name === "work";
    $("#workspace-path").textContent = inProject
      ? "actionboard / project folder"
      : "Quick Chat · no project folder";
    $("#workspace-title").textContent = inProject
      ? "Project agent"
      : "New app idea";
    $("#workspace-status").textContent = inProject
      ? "Working"
      : scene.name === "create"
        ? "Creating project"
        : scene.name === "ready"
          ? "Project ready"
          : "Discussing";
    $("#conversation-name").textContent = inProject
      ? "Project agent"
      : "New app idea";
    $("#conversation-role").textContent = inProject
      ? "Codex · actionboard"
      : "Codex · Quick Chat";
    $("#quick-session").classList.toggle("sidebar-session--active", !inProject);
    $("#project-session").classList.toggle(
      "sidebar-session--active",
      inProject,
    );
  }

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

  function pointer(scene, local) {
    const cursor = $("#film-pointer");
    const ring = $("#pointer-ring");
    if (scene.name !== "ready" || local < 3.2 || local > 5.8) {
      cursor.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    const target = targetCenter("#project-session");
    if (!target) return;
    const move = ease((local - 3.2) / 1.5);
    cursor.style.opacity = String(clamp((local - 3.2) / 0.2, 0, 1));
    cursor.style.transform = `translate(${mix(target.x + 180, target.x - 8, move)}px, ${mix(target.y + 130, target.y - 7, move)}px) scale(${local > 4.7 ? 0.9 : 1})`;
    const pulse = (local - 4.7) / 0.36;
    ring.style.opacity = pulse >= 0 && pulse <= 1 ? String(1 - pulse) : "0";
    ring.style.transform = `translate(${target.x - 20}px, ${target.y - 20}px) scale(${0.55 + Math.max(0, pulse) * 1.5})`;
  }

  function motion(scene, local) {
    $(".film-glow--one").style.transform =
      `translate(${Math.sin(time * 0.19) * 95}px, ${Math.cos(time * 0.14) * 52}px)`;
    $(".film-glow--two").style.transform =
      `translate(${Math.cos(time * 0.16) * 105}px, ${Math.sin(time * 0.21) * 62}px)`;
    if (scene.name === "opening") {
      const leave = ease((local - 2.25) / 0.75);
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
      const arrive = ease(local / 0.95);
      walkthrough.style.opacity = "0";
      ending.style.opacity = "1";
      ending.style.transform = `translateY(${72 * (1 - arrive)}px) scale(${0.95 + arrive * 0.05})`;
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }
    ending.style.opacity = "0";
    walkthrough.style.opacity = "1";
    walkthrough.style.clipPath =
      scene.name === "chat" && local < 0.75
        ? `inset(0 ${100 * (1 - ease(local / 0.75))}% 0 0)`
        : "none";
    if (scene.name === "shape" && local < 5.2) {
      const round = Math.min(2, Math.floor(local / 1.7));
      const transition = round < 2 ? ease(((local % 1.7) - 1.25) / 0.4) : 0;
      const position = round + transition;
      $("#iteration-count").textContent =
        `${String(round + 1).padStart(2, "0")} / 03`;
      $("#iteration-fill").style.width =
        `${Math.round(clamp(local / 5.2, 0, 1) * 100)}%`;
      $("#conversation-body")
        .querySelectorAll(".delegate-iteration__round")
        .forEach((element, index) => {
          const distance = position - index;
          element.style.opacity = String(clamp(1 - Math.abs(distance), 0, 1));
          element.style.transform = `translateY(${-235 * distance}px) scale(${1 - 0.06 * Math.abs(distance)})`;
        });
    }
    const composer = $("#review-composer");
    const typingPrompt =
      scene.name === "chat" && local < 2.7
        ? [firstQuestion, (local - 0.25) / 2.2]
        : scene.name === "ask" && local < 2.7
          ? [createRequest, (local - 0.2) / 2.35]
          : null;
    if (typingPrompt) {
      $("#composer-text").textContent =
        typingPrompt[0].slice(
          0,
          Math.floor(clamp(typingPrompt[1], 0, 1) * typingPrompt[0].length),
        ) + "▍";
      composer.classList.add("is-typing");
    } else {
      $("#composer-text").textContent = "Ask a follow-up";
      composer.classList.remove("is-typing");
    }
    const projectGroup = $("#project-group");
    const shown = scene.name === "ready" || scene.name === "work";
    projectGroup.classList.toggle("is-visible", shown);
    const arrival = scene.name === "ready" ? ease(local / 1.2) : shown ? 1 : 0;
    projectGroup.style.opacity = String(arrival);
    projectGroup.style.transform = `translateY(${(1 - arrival) * 12}px)`;
    if (scene.name === "create") {
      const progress = clamp(local / 7, 0, 1);
      $("#creation-fill").style.width = `${Math.round(progress * 100)}%`;
      $("#conversation-body")
        .querySelectorAll(".project-progress__step")
        .forEach((element, index) => {
          const active = Math.min(2, Math.floor(progress * 3));
          element.classList.toggle("is-active", index === active);
          element.classList.toggle("is-complete", index < active);
          element.querySelector("b").textContent =
            index < active ? "✓" : String(index + 1);
        });
    }
    pointer(scene, local);
  }

  function fit() {
    film.style.transform = `scale(${(viewport.clientWidth || 1600) / 1600})`;
  }

  function seek(nextTime) {
    time = clamp(Number(nextTime) || 0, 0, DURATION);
    const scene = SCENES.find((item) => time < item.end) || SCENES.at(-1);
    const local = time - scene.start;
    const variant = variantFor(scene, local);
    const key = `${scene.name}/${variant}`;
    if (key !== paintedKey) {
      paint(scene, variant);
      paintedKey = key;
    }
    if (scene.name !== "opening" && scene.name !== "ending")
      $("#film-progress").style.width =
        `${((time - SCENES[1].start) / (SCENES[6].end - SCENES[1].start)) * 100}%`;
    motion(scene, local);
    scrubber.value = String(time);
    $("#timecode").textContent =
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:43`;
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

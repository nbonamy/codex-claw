const DURATION = 40;
const SCENES = [
  { name: "opening", start: 0, end: 2.5 },
  {
    name: "chat",
    start: 2.5,
    end: 8,
    chapter: "01 / 06",
    label: "DISCUSS",
    title: "Start with a Quick Chat.",
    subtitle: "No folder to choose. Just the idea.",
    note: "A thought can stay a conversation until it is ready.",
  },
  {
    name: "montage",
    start: 8,
    end: 14.8,
    chapter: "02 / 06",
    label: "SHAPE",
    title: "Shape it together.",
    subtitle: "A few fast turns make the first version clear.",
    note: "Messy notes. Owners. Due dates. Source links.",
  },
  {
    name: "ask",
    start: 14.8,
    end: 20,
    chapter: "03 / 06",
    label: "DECIDE",
    title: "Ready? Say the word.",
    subtitle: "You decide when the discussion becomes a project.",
    note: "The project is created only when you ask.",
  },
  {
    name: "setup",
    start: 20,
    end: 27.5,
    chapter: "04 / 06",
    label: "CREATE",
    title: "Claw sets up the project.",
    subtitle: "Folder, project agent, and handoff.",
    note: "One request. The setup happens automatically.",
  },
  {
    name: "ready",
    start: 27.5,
    end: 32.5,
    chapter: "05 / 06",
    label: "READY",
    title: "The project appears.",
    subtitle: "The original Quick Chat stays right where it was.",
    note: "Your conversation is kept. Your project has a home.",
  },
  {
    name: "work",
    start: 32.5,
    end: 36.5,
    chapter: "06 / 06",
    label: "BUILD",
    title: "Pick up with context.",
    subtitle: "The project agent starts from the agreed brief.",
    note: "From a conversation to a place to build.",
  },
  { name: "ending", start: 36.5, end: DURATION },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => 1 - (1 - clamp(value, 0, 1)) ** 3;
const mix = (start, end, amount) => start + (end - start) * amount;
const firstQuestion =
  "I want an app that turns meeting notes into clear tasks.";
const createRequest =
  "Create a project called actionboard and start it with this plan.";

function userMessage(message) {
  return `<div class="shorts-user">${message}</div>`;
}

function agentMessage(message, name = "Codex") {
  return `<div class="shorts-agent"><strong>✦ ${name}</strong><p>${message}</p></div>`;
}

function brief() {
  return `<div class="shorts-brief"><span>FIRST VERSION · AGREED IN CHAT</span><strong>Meeting notes → actionable tasks</strong><p>Editable tasks with owners, due dates, and a link back to each source sentence.</p></div>`;
}

function montage() {
  const rounds = [
    [
      "Could it handle messy notes?",
      "Yes. Extract candidate tasks, then let you edit them.",
    ],
    [
      "Can we add owners and due dates?",
      "Suggest them when mentioned. Keep every field editable.",
    ],
    [
      "Could each task show its source?",
      "Absolutely. Put the source sentence beside each task.",
    ],
  ];
  return `<div class="shorts-montage"><div class="shorts-montage__header"><span>QUICK CHAT · ITERATING</span><b id="montage-count">01 / 03</b></div><div class="shorts-montage__stage">${rounds.map(([user, agent]) => `<div class="shorts-montage__round">${userMessage(user)}${agentMessage(agent)}</div>`).join("")}</div><div class="shorts-montage__track"><i id="montage-fill"></i></div><p>Three quick turns. One clear starting point.</p></div>`;
}

function toolCard() {
  return `<div class="shorts-tool"><header><i>◫</i> create-project</header><div><span>Project name <strong>actionboard</strong></span><small>Handoff: notes in, editable tasks out, with owners, dates, and source links.</small></div></div>`;
}

function setupCard() {
  const steps = [
    "Create project folder",
    "Start project agent",
    "Send the agreed handoff",
  ];
  return `<div class="shorts-setup"><div class="shorts-setup__title"><b>✦</b> Creating actionboard</div>${steps.map((step, index) => `<div class="shorts-setup__step" data-step="${index}"><b>${index + 1}</b><span>${step}</span></div>`).join("")}<div class="shorts-setup__track"><i id="setup-fill"></i></div></div>`;
}

function readyCard() {
  return `<div class="shorts-result"><b>✓</b><div><strong>actionboard is ready</strong><small>Folder created · agent started · brief sent</small></div></div><div class="shorts-session-list"><strong>YOUR SESSIONS</strong><div class="shorts-session-list__row is-chat"><b>◌</b><span>New app idea<small>Quick Chat · still here</small></span><i></i></div><div id="new-project-row" class="shorts-session-list__row is-project"><b>◫</b><span>actionboard<small>Project agent · ready to open</small></span><i></i></div></div>`;
}

function workCard(variant) {
  return `<div class="shorts-handoff"><strong>PROJECT AGENT · HANDOFF</strong><span>Build actionboard from our Quick Chat plan: notes in, editable tasks out, with owners, dates, and source links.</span></div>${agentMessage("I have the brief and the project folder. I’m starting with the notes-to-tasks flow.", "Project agent")}${variant === "working" ? '<div class="shorts-task-chips"><span>Notes input</span><span>Task review</span><span>Source links</span></div>' : ""}`;
}

function contentFor(scene, variant) {
  switch (scene.name) {
    case "chat":
      return variant === "typing"
        ? `<div class="shorts-idea"><span>QUICK CHAT</span><strong>No project folder needed yet.</strong></div>${agentMessage("What are you imagining?")}`
        : `${userMessage(firstQuestion)}${agentMessage("Yes. Let’s turn the key points into tasks and make the results easy to check.")}`;
    case "montage":
      return variant === "summary"
        ? `${agentMessage("That gives us a focused first version: notes in, editable tasks out, with owners, dates, and source links.")}${brief()}`
        : montage();
    case "ask":
      return `${brief()}${variant === "typing" ? "" : userMessage(createRequest)}${variant === "sent" ? agentMessage("I’ll create the project and hand our plan to its agent. This chat will stay here.") : ""}`;
    case "setup":
      return `${toolCard()}${setupCard()}`;
    case "ready":
      return readyCard();
    case "work":
      return workCard(variant);
    default:
      return "";
  }
}

function variantFor(scene, local) {
  if (scene.name === "chat") return local < 2.5 ? "typing" : "answered";
  if (scene.name === "montage") return local < 5.0 ? "rounds" : "summary";
  if (scene.name === "ask")
    return local < 2.7 ? "typing" : local < 3.7 ? "requested" : "sent";
  if (scene.name === "work") return local < 2.1 ? "arrived" : "working";
  return "default";
}

export function createFilm(document, browserWindow = document.defaultView) {
  const $ = (selector) => document.querySelector(selector);
  const film = $("#film");
  const viewport = $(".film-viewport");
  const opening = $(".shorts-opening");
  const story = $(".shorts-story");
  const ending = $(".shorts-ending");
  const toggle = $("#play-toggle");
  const scrubber = $("#scrubber");
  let time = 0;
  let playing = false;
  let lastFrame = 0;
  let paintedKey = "";

  function paint(scene, variant) {
    if (scene.name === "opening" || scene.name === "ending") return;
    $("#chapter-number").textContent = scene.chapter;
    $("#chapter-label").textContent = scene.label;
    $("#story-title").textContent = scene.title;
    $("#story-subtitle").textContent = scene.subtitle;
    $("#story-note").textContent = scene.note;
    $("#progress-label").textContent = scene.label;
    $("#scene-body").innerHTML = contentFor(scene, variant);
    $("#scene-body").classList.toggle(
      "is-dense",
      scene.name === "setup" || scene.name === "ready" || scene.name === "work",
    );
    const project = scene.name === "work";
    $("#app-path").textContent = project
      ? "actionboard · project folder"
      : "Quick Chat · no project folder";
    $("#app-title").textContent = project ? "Project agent" : "New app idea";
    $("#app-state").textContent = project
      ? "Working"
      : scene.name === "setup"
        ? "Creating"
        : scene.name === "ready"
          ? "Project ready"
          : "Discussing";
  }

  function targetCenter(selector) {
    const target = $(selector);
    if (!target) return null;
    const outer = film.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const scale = outer.width / 1080 || 1;
    return {
      x: (rect.left + rect.width / 2 - outer.left) / scale,
      y: (rect.top + rect.height / 2 - outer.top) / scale,
    };
  }

  function pointer(scene, local) {
    const cursor = $("#film-pointer");
    const ring = $("#pointer-ring");
    if (scene.name !== "ready" || local < 2.4 || local > 4.8) {
      cursor.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    const target = targetCenter("#new-project-row");
    if (!target) return;
    const travel = ease((local - 2.4) / 1.55);
    cursor.style.opacity = String(clamp((local - 2.4) / 0.22, 0, 1));
    cursor.style.transform = `translate(${mix(target.x + 330, target.x - 9, travel)}px, ${mix(target.y + 205, target.y - 12, travel)}px) scale(${local >= 3.95 ? 0.88 : 1})`;
    const pulse = (local - 3.95) / 0.37;
    ring.style.opacity = pulse >= 0 && pulse <= 1 ? String(1 - pulse) : "0";
    ring.style.transform = `translate(${target.x - 35}px, ${target.y - 35}px) scale(${0.55 + Math.max(0, pulse) * 1.5})`;
  }

  function motion(scene, local) {
    $(".shorts-glow--top").style.transform =
      `translate(${Math.sin(time * 0.19) * 74}px, ${Math.cos(time * 0.14) * 61}px)`;
    $(".shorts-glow--bottom").style.transform =
      `translate(${Math.cos(time * 0.18) * 70}px, ${Math.sin(time * 0.16) * 64}px)`;
    if (scene.name === "opening") {
      const leave = ease((local - 1.75) / 0.75);
      opening.style.transform = `translateY(${-1920 * leave}px)`;
      story.style.transform = "none";
      ending.style.transform = "translateY(1920px)";
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }
    opening.style.transform = "translateY(-1920px)";
    if (scene.name === "ending") {
      ending.style.transform = `translateY(${1920 * (1 - ease(local / 0.9))}px)`;
      $("#film-pointer").style.opacity = "0";
      $("#pointer-ring").style.opacity = "0";
      return;
    }
    ending.style.transform = "translateY(1920px)";
    $("#story-title").style.transform =
      `translateY(${24 * (1 - ease(local / 0.45))}px)`;
    $("#app-panel").style.transform =
      `translateY(${14 * (1 - ease(local / 0.6))}px)`;
    const composer = $("#app-composer");
    const prompt =
      scene.name === "chat" && local < 2.5
        ? [firstQuestion, (local - 0.25) / 2.0]
        : scene.name === "ask" && local < 2.7
          ? [createRequest, (local - 0.2) / 2.25]
          : null;
    if (prompt) {
      $("#composer-text").textContent =
        prompt[0].slice(
          0,
          Math.floor(clamp(prompt[1], 0, 1) * prompt[0].length),
        ) + "▍";
      composer.classList.add("is-typing");
    } else {
      $("#composer-text").textContent = "Ask a follow-up";
      composer.classList.remove("is-typing");
    }
    if (scene.name === "montage" && local < 5) {
      const round = Math.min(2, Math.floor(local / 1.63));
      const transition = round < 2 ? ease(((local % 1.63) - 1.18) / 0.42) : 0;
      const position = round + transition;
      $("#montage-count").textContent =
        `${String(round + 1).padStart(2, "0")} / 03`;
      $("#montage-fill").style.width = `${Math.round((local / 5) * 100)}%`;
      $("#scene-body")
        .querySelectorAll(".shorts-montage__round")
        .forEach((element, index) => {
          const distance = position - index;
          element.style.opacity = String(clamp(1 - Math.abs(distance), 0, 1));
          element.style.transform = `translateY(${-325 * distance}px) scale(${1 - 0.06 * Math.abs(distance)})`;
        });
    }
    if (scene.name === "setup") {
      const progress = clamp(local / 7.5, 0, 1);
      $("#setup-fill").style.width = `${Math.round(progress * 100)}%`;
      $("#scene-body")
        .querySelectorAll(".shorts-setup__step")
        .forEach((element, index) => {
          const active = Math.min(2, Math.floor(progress * 3));
          element.classList.toggle("is-active", index === active);
          element.classList.toggle("is-complete", index < active);
          element.querySelector("b").textContent =
            index < active ? "✓" : String(index + 1);
        });
    }
    if (scene.name === "ready") {
      const arrival = ease(local / 1.2);
      const row = $("#new-project-row");
      row.style.opacity = String(arrival);
      row.style.transform = `translateY(${(1 - arrival) * 78}px)`;
    }
    pointer(scene, local);
    $("#film-progress").style.width =
      `${((time - SCENES[1].start) / (SCENES[6].end - SCENES[1].start)) * 100}%`;
  }

  function fit() {
    film.style.transform = `scale(${(viewport.clientWidth || 1080) / 1080})`;
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
    motion(scene, local);
    scrubber.value = String(time);
    $("#timecode").textContent =
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:40`;
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

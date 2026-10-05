import "./product.mjs";

const DURATION = 31;
const SCENES = [
  { name: "opening", start: 0, end: 2.5 },
  {
    name: "ask",
    start: 2.5,
    end: 7,
    chapter: "01 / 05",
    title: "Ask to see the system.",
    detail: "Type /visualize to open diagram suggestions.",
    footer: "VISUALIZE / ASK",
  },
  {
    name: "generate",
    start: 7,
    end: 9.5,
    chapter: "02 / 05",
    title: "A shared view appears.",
    detail: "Choose a suggestion and watch the canvas take shape.",
    footer: "VISUALIZE / GENERATE",
  },
  {
    name: "annotate",
    start: 9.5,
    end: 15.5,
    chapter: "03 / 05",
    title: "Point to what should change.",
    detail: "An annotation is anchored to the selected shape.",
    footer: "VISUALIZE / ANNOTATE",
  },
  {
    name: "send",
    start: 15.5,
    end: 18,
    chapter: "04 / 05",
    title: "Send the annotation.",
    detail: "The selected shape and comment are enough context.",
    footer: "VISUALIZE / SEND",
  },
  {
    name: "refine",
    start: 18,
    end: 26.5,
    chapter: "05 / 05",
    title: "Refine just that part.",
    detail: "The agent updates the canvas; untouched shapes remain.",
    footer: "VISUALIZE / REFINE",
  },
  { name: "ending", start: 26.5, end: DURATION },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => 1 - (1 - clamp(value, 0, 1)) ** 3;
const mix = (a, b, amount) => a + (b - a) * amount;

const user = (content) =>
  `<div class="viz-message viz-message--user"><p>${content}</p></div>`;
const agent = (content) =>
  `<div class="viz-message viz-message--agent"><span class="viz-message__author">✦ Codex</span><p>${content}</p></div>`;
const tool = (label, detail = "Done") =>
  `<div class="viz-tool"><b>◈</b><span>${label}</span><small>${detail}</small></div>`;
const initialPrompt = "/visualize";
const comment = "Split review from approval.";
const submittedAnnotation = `<span class="viz-annotation-in-chat">◈ Review &amp; approval · ${comment}</span>`;

function conversation(scene, local) {
  if (scene === "ask") {
    if (local < 1.45) return "";
    return user(initialPrompt);
  }
  if (scene === "generate") {
    return (
      user(initialPrompt) +
      tool("add-visualization · Release flow") +
      agent(
        "Here’s the release flow. Select any part you want to discuss or refine.",
      )
    );
  }
  if (scene === "annotate") {
    return (
      user(initialPrompt) +
      tool("add-visualization · Release flow") +
      agent(
        "Here’s the release flow. Select any part you want to discuss or refine.",
      )
    );
  }
  if (scene === "send") {
    const base =
      user(initialPrompt) +
      agent(
        "Here’s the release flow. Select any part you want to discuss or refine.",
      );
    if (local < 1.6) return base;
    return base + user(submittedAnnotation);
  }
  if (scene === "refine") {
    let result = user(submittedAnnotation);
    if (local > 0.3)
      result += tool(
        "read-visualization-canvas · selected shape",
        local < 1.1 ? "Reading…" : "Done",
      );
    if (local > 1.1)
      result += tool(
        "edit-visualization-canvas · targeted update",
        local < 4.1 ? "Updating…" : "Done",
      );
    if (local > 4.3)
      result += agent(
        "Done. Review is now distinct from human approval; the rest of the flow is unchanged.",
      );
    return result;
  }
  return "";
}

export function createFilm(document, browserWindow) {
  const $ = (selector) => document.querySelector(selector);
  const film = $("#film");
  const viewport = $(".film-viewport");
  const scrubber = $("#scrubber");
  const toggle = $("#play-toggle");
  const opening = $(".opening");
  const walkthrough = $(".walkthrough");
  const ending = $(".ending");
  const flow = $("#viz-flow");
  const fixedPath = $(".viz-lines__fixed path");
  const initialPaths = [
    ...document.querySelectorAll(".viz-lines__initial path"),
  ];
  const refinedPaths = [...document.querySelectorAll("#refined-lines path")];
  const pathLengths = new Map(
    [fixedPath, ...initialPaths, ...refinedPaths].map((path) => [
      path,
      path.getTotalLength(),
    ]),
  );
  let time = 0;
  let playing = false;
  let lastFrame = 0;
  let lastConversation = "";

  function drawPath(path, progress) {
    const length = pathLengths.get(path);
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length * (1 - progress)}`;
  }

  function targetCenter(selector) {
    const element = $(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const outer = film.getBoundingClientRect();
    const scale = outer.width / 1600;
    return {
      x: (rect.left + rect.width / 2 - outer.left) / scale,
      y: (rect.top + rect.height / 2 - outer.top) / scale,
    };
  }

  function pointer(scene, local) {
    const schedules = {
      ask: [[2.6, 3.75, "#release-suggestion"]],
      annotate: [
        [0.1, 0.7, "#annotate-button"],
        [0.9, 1.65, "#review-node"],
        [4.75, 5.55, "#add-annotation"],
      ],
      send: [[0.4, 1.55, "#chat-composer b"]],
    };
    const active = schedules[scene]?.find(
      ([start, click]) => local >= start && local <= click + 0.25,
    );
    const cursor = $("#film-pointer");
    const ring = $("#pointer-ring");
    if (!active) {
      cursor.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    const [start, click, selector] = active;
    const target = targetCenter(selector);
    if (!target) {
      cursor.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    const travel = ease((local - start) / (click - start));
    cursor.style.opacity = String(clamp((local - start) / 0.2, 0, 1));
    cursor.style.transform = `translate(${mix(target.x + 150, target.x - 7, travel)}px, ${mix(target.y + 92, target.y - 4, travel)}px) scale(${local >= click ? 0.88 : 1})`;
    const ripple = (local - click) / 0.28;
    ring.style.opacity = ripple >= 0 && ripple <= 1 ? String(1 - ripple) : "0";
    ring.style.transform = `translate(${target.x - 20}px, ${target.y - 20}px) scale(${0.5 + Math.max(0, ripple) * 1.5})`;
  }

  function seek(nextTime) {
    time = clamp(Number(nextTime) || 0, 0, DURATION);
    const scene = SCENES.find((item) => time < item.end) || SCENES.at(-1);
    const local = time - scene.start;
    const isOpening = scene.name === "opening";
    const isEnding = scene.name === "ending";
    const transitionIn = ease((time - 1.7) / 1.0);
    const transitionOut = ease((time - 26) / 1.0);
    opening.style.opacity = String(1 - transitionIn);
    opening.style.transform = `translateX(${-115 * transitionIn}px) scale(${1 - 0.045 * transitionIn})`;
    walkthrough.style.opacity = String(transitionIn * (1 - transitionOut));
    walkthrough.style.transform = `translateX(${mix(80, 0, transitionIn) - 70 * transitionOut}px) scale(${0.96 + 0.04 * transitionIn - 0.02 * transitionOut})`;
    ending.style.opacity = String(transitionOut);
    ending.style.transform = `translateY(${36 * (1 - transitionOut)}px)`;

    if (!isOpening && !isEnding) {
      $("#chapter-index").textContent = scene.chapter;
      $("#chapter-title").textContent = scene.title;
      $("#chapter-detail").textContent = scene.detail;
      $("#film-footer-stage").textContent = scene.footer;
      $("#film-progress").style.width = `${((time - 2.5) / 24) * 100}%`;
    }

    const promptTyping = scene.name === "ask" && local < 1.45;
    $("#composer-text").textContent = promptTyping
      ? initialPrompt.slice(
          0,
          Math.floor(clamp((local - 0.2) / 1.0, 0, 1) * initialPrompt.length),
        ) || "Ask a follow-up"
      : "Ask a follow-up";
    $("#annotation-card").classList.toggle(
      "is-visible",
      scene.name === "send" && local < 1.6,
    );

    const content = conversation(scene.name, local);
    if (content !== lastConversation) {
      $("#chat-body").innerHTML = content;
      lastConversation = content;
    }

    const suggestionEntrance = ease((time - 4.05) / 0.55);
    const suggestionExit = 1 - ease((time - 6.95) / 0.2);
    const canvasVisible = time >= 7.15;
    $("#viz-suggestions").style.display = canvasVisible ? "none" : "flex";
    $("#viz-suggestions").style.opacity = String(
      suggestionEntrance * suggestionExit,
    );
    $("#viz-suggestions").style.transform =
      `translateY(${14 * (1 - suggestionEntrance)}px)`;
    document.querySelectorAll(".viz-suggestion").forEach((item, index) => {
      const appear = ease((time - 4.1 - index * 0.25) / 0.55);
      item.style.opacity = String(appear);
      const selectedSuggestion =
        index === 0 && scene.name === "ask" && local > 3.75;
      item.style.transform = `translateY(${12 * (1 - appear)}px) scale(${selectedSuggestion ? 0.975 : 1})`;
    });
    $("#viz-content").classList.toggle("is-visible", canvasVisible);
    $("#release-suggestion").style.borderColor =
      scene.name === "ask" && local > 3.75 ? "#3777d6" : "";

    const entering = clamp((time - 7.15) / 1.8, 0, 1);
    const nodes = [
      ".viz-node--brief",
      ".viz-node--implement",
      "#review-node",
      ".viz-node--ship",
    ];
    nodes.forEach((selector, index) => {
      const step = ease((entering - index * 0.18) / 0.27);
      const node = $(selector);
      node.style.opacity = String(step);
      node.style.transform = `translateY(${18 * (1 - step)}px) scale(${0.88 + 0.12 * step})`;
    });
    drawPath(fixedPath, ease((entering - 0.18) / 0.25));
    drawPath(initialPaths[0], ease((entering - 0.4) / 0.25));
    drawPath(initialPaths[1], ease((entering - 0.62) / 0.25));

    const zoom =
      time >= 8.5 && time < 18
        ? clamp((time - 8.5) / 3, 0, 1)
        : scene.name === "refine"
          ? 1 - ease(local / 1.2)
          : 0;
    flow.style.transform = `scale(${1 + 0.12 * zoom})`;
    $("#zoom-level").textContent = `${Math.round(100 + 12 * zoom)}%`;
    $("#canvas-status").textContent =
      scene.name === "refine" && local > 1.1 && local < 4.1
        ? "Updating selected shapes…"
        : "Mermaid · Excalidraw canvas";

    const annotating = scene.name === "annotate";
    const selected = annotating && local > 1.65;
    $("#annotate-button").classList.toggle(
      "is-active",
      annotating && local > 0.7,
    );
    $("#review-node").classList.toggle("is-annotated", selected);
    $("#annotation-popup").style.opacity = String(
      selected && local > 1.85 ? ease((local - 1.85) / 0.35) : 0,
    );
    $("#annotation-popup").style.transform =
      `translateY(${selected ? 0 : 12}px)`;
    $("#comment-text").textContent =
      local > 2.05 && annotating
        ? comment.slice(
            0,
            Math.floor(clamp((local - 2.05) / 1.55, 0, 1) * comment.length),
          )
        : "What should change?";

    const refining = scene.name === "refine";
    const split = refining ? ease((local - 2.3) / 1.6) : isEnding ? 1 : 0;
    if (refining || isEnding) {
      $("#review-node").style.opacity = String(1 - split);
      $("#review-node").style.transform = `scale(${1 - 0.15 * split})`;
    }
    $(".viz-lines__initial").style.opacity = String(1 - split);
    $("#refined-lines").style.opacity = String(split);
    refinedPaths.forEach((path) => drawPath(path, split));
    for (const [selector, direction] of [
      ["#code-review-node", 1],
      ["#approval-node", -1],
    ]) {
      const node = $(selector);
      node.style.opacity = String(split);
      node.style.transform = `translateX(${direction * 108 * (1 - split)}px) scale(${0.86 + 0.14 * split})`;
    }
    if (isEnding) {
      $("#code-review-node").style.opacity = "1";
      $("#approval-node").style.opacity = "1";
      $("#review-node").style.opacity = "0";
      $("#refined-lines").style.opacity = "1";
    }

    pointer(scene.name, local);

    scrubber.value = String(time);
    $("#timecode").textContent =
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:31`;
    return { scene: scene.name, time };
  }

  function fit() {
    film.style.transform = `scale(${(viewport.clientWidth || 1600) / 1600})`;
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
  browserWindow.addEventListener("resize", fit);
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
  if (params.has("export")) document.body.classList.add("exporting");
  const controller = createFilm(document, window);
  window.seekFilm = controller.seek;
  window.filmController = controller;
  if (params.has("t")) controller.seek(Number(params.get("t")));
  if (!params.has("export")) controller.play();
}

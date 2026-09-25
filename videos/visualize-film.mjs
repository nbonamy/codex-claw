const DURATION = 44;
const SCENES = [
  { name: "opening", start: 0, end: 3 },
  {
    name: "ask",
    start: 3,
    end: 9,
    chapter: "01 / 06",
    title: "Ask to see the system.",
    detail: "A diagram starts from the conversation.",
    footer: "VISUALIZE / ASK",
  },
  {
    name: "generate",
    start: 9,
    end: 15,
    chapter: "02 / 06",
    title: "A shared view appears.",
    detail: "The release flow becomes an Excalidraw canvas.",
    footer: "VISUALIZE / GENERATE",
  },
  {
    name: "explore",
    start: 15,
    end: 20,
    chapter: "03 / 06",
    title: "Explore the shape.",
    detail: "Zoom into the part that needs attention.",
    footer: "VISUALIZE / EXPLORE",
  },
  {
    name: "annotate",
    start: 20,
    end: 28,
    chapter: "04 / 06",
    title: "Point to what should change.",
    detail: "An annotation is anchored to the selected shape.",
    footer: "VISUALIZE / ANNOTATE",
  },
  {
    name: "send",
    start: 28,
    end: 33,
    chapter: "05 / 06",
    title: "Keep the conversation going.",
    detail: "The selected shape travels with the next message.",
    footer: "VISUALIZE / DISCUSS",
  },
  {
    name: "refine",
    start: 33,
    end: 40,
    chapter: "06 / 06",
    title: "Refine just that part.",
    detail: "The agent updates the canvas; untouched shapes remain.",
    footer: "VISUALIZE / REFINE",
  },
  { name: "ending", start: 40, end: DURATION },
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
const initialPrompt = "/visualize Map our release flow from brief to ship.";
const comment = "Split review from approval.";
const followup = "Update that part of the flow.";

function conversation(scene, local) {
  if (scene === "ask") {
    if (local < 2.3) return "";
    return (
      user(initialPrompt) +
      (local > 3.6
        ? agent(
            "I’ll map the stages and handoffs so we can inspect them together.",
          )
        : "")
    );
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
  if (scene === "explore" || scene === "annotate") {
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
    if (local < 3.4) return base;
    return (
      base +
      user(
        `<div class="viz-annotation-in-chat">◈ Review &amp; approval · ${comment}</div>${followup}`,
      )
    );
  }
  if (scene === "refine") {
    let result = user(
      `<div class="viz-annotation-in-chat">◈ Review &amp; approval · ${comment}</div>${followup}`,
    );
    if (local > 0.5)
      result += tool("read-visualization-canvas · selected shape");
    if (local > 1.9)
      result += tool("edit-visualization-canvas · targeted update");
    if (local > 4.1)
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
  let time = 0;
  let playing = false;
  let lastFrame = 0;
  let lastConversation = "";

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
      ask: [[4.2, 5.25, "#release-suggestion"]],
      explore: [[0.65, 2.25, ".viz-canvas__zoom span:last-child"]],
      annotate: [
        [0.2, 1.2, "#annotate-button"],
        [1.45, 2.5, "#review-node"],
        [6.2, 7.35, "#add-annotation"],
      ],
      send: [[2.1, 3.35, "#chat-composer b"]],
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
    const transitionIn = ease((time - 2.15) / 1.2);
    const transitionOut = ease((time - 39.25) / 1.1);
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
      $("#film-progress").style.width = `${((time - 3) / 37) * 100}%`;
    }

    const promptTyping = scene.name === "ask" && local < 2.3;
    const followupTyping = scene.name === "send" && local < 3.4;
    $("#composer-text").textContent = promptTyping
      ? initialPrompt.slice(
          0,
          Math.floor(clamp((local - 0.3) / 1.9, 0, 1) * initialPrompt.length),
        ) || "Ask a follow-up"
      : followupTyping
        ? followup.slice(
            0,
            Math.floor(clamp((local - 0.5) / 2.25, 0, 1) * followup.length),
          ) || "Ask a follow-up"
        : "Ask a follow-up";
    $("#annotation-card").classList.toggle(
      "is-visible",
      scene.name === "send" && local < 3.4,
    );

    const content = conversation(scene.name, local);
    if (content !== lastConversation) {
      $("#chat-body").innerHTML = content;
      lastConversation = content;
    }

    const canvasVisible = time >= 10.7;
    $("#viz-suggestions").style.display = canvasVisible ? "none" : "flex";
    $("#viz-content").classList.toggle("is-visible", canvasVisible);
    $("#release-suggestion").style.transform =
      scene.name === "generate" && local < 1.7
        ? `scale(${1 - 0.025 * ease(local / 1.7)})`
        : "";
    $("#release-suggestion").style.borderColor =
      scene.name === "generate" ? "#3777d6" : "";

    const entering = clamp((time - 10.7) / 3.1, 0, 1);
    const nodes = [
      ".viz-node--brief",
      ".viz-node--implement",
      "#review-node",
      ".viz-node--ship",
    ];
    nodes.forEach((selector, index) => {
      const step = ease((entering * 3.1 - index * 0.52) / 0.82);
      const node = $(selector);
      node.style.opacity = String(step);
      node.style.transform = `translateY(${14 * (1 - step)}px)`;
    });
    $(".viz-lines__base").style.opacity = String(
      ease((entering - 0.34) / 0.44),
    );

    const zoom =
      scene.name === "explore"
        ? ease((local - 0.5) / 2.1)
        : time >= 20 && time < 33
          ? 1
          : 0;
    flow.style.transform = `scale(${1 + 0.12 * zoom})`;
    $("#zoom-level").textContent = `${Math.round(100 + 12 * zoom)}%`;

    const annotating = scene.name === "annotate";
    const selected = annotating && local > 2.3;
    $("#annotate-button").classList.toggle(
      "is-active",
      annotating && local > 1.2,
    );
    $("#annotation-highlight").style.opacity = String(
      selected ? ease((local - 2.3) / 0.4) : 0,
    );
    $("#annotation-popup").style.opacity = String(
      selected && local > 3.1 ? ease((local - 3.1) / 0.45) : 0,
    );
    $("#annotation-popup").style.transform =
      `translateY(${selected ? 0 : 12}px)`;
    $("#comment-text").textContent =
      local > 3.5 && annotating
        ? comment.slice(
            0,
            Math.floor(clamp((local - 3.5) / 2.1, 0, 1) * comment.length),
          )
        : "What should change?";

    const refining = scene.name === "refine";
    const split = refining ? ease((local - 2.2) / 1.7) : 0;
    $("#review-node").style.opacity = String(
      (1 - split) * (canvasVisible ? 1 : entering),
    );
    $("#review-node").style.transform = `scale(${1 - 0.15 * split})`;
    $(".viz-lines__base").style.opacity = String(1 - split);
    $("#refined-lines").style.opacity = String(split);
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
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:44`;
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

import product from "../core/src/product.json" with { type: "json" };

const DURATION = 46;
const SCENES = [
  { name: "opening", start: 0, end: 3.2 },
  {
    name: "chat",
    start: 3.2,
    end: 13,
    chapter: "01 / 06",
    title: "Start with the idea.",
    detail: "Shape a feature in conversation before changing the repository.",
  },
  {
    name: "command",
    start: 13,
    end: 18,
    chapter: "02 / 06",
    title: "Give the build its own space.",
    detail: `Submit /delegate here. ${product.name} prepares the handoff and starts a worktree agent.`,
  },
  {
    name: "provision",
    start: 18,
    end: 24,
    chapter: "03 / 06",
    title: "A clean workspace, automatically.",
    detail:
      "Worktree, project setup, agent session, and instructions—all visible.",
  },
  {
    name: "work",
    start: 24,
    end: 30,
    chapter: "04 / 06",
    title: "Work together in isolation.",
    detail: "Guide the agent and inspect the changes without disturbing main.",
  },
  {
    name: "merge",
    start: 30,
    end: 36.5,
    chapter: "05 / 06",
    title: "Bring the work home.",
    detail: "Merge into the base branch and clean up the dedicated worktree.",
  },
  {
    name: "complete",
    start: 36.5,
    end: 40.5,
    chapter: "06 / 06",
    title: "One workspace again.",
    detail: "The feature lands in main; the temporary agent steps away.",
  },
  { name: "ending", start: 40.5, end: DURATION },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (value) => 1 - (1 - clamp(value, 0, 1)) ** 3;
const mix = (start, end, progress) => start + (end - start) * progress;

function userMessage(body) {
  return `<div class="delegate-user">${body}</div>`;
}

function agentMessage(body, label = "Codex") {
  return `<div class="delegate-message"><strong>✦ ${label}</strong><p>${body}</p></div>`;
}

function iterationMontage() {
  const rounds = [
    [
      "Could we add a faster way to jump between active agents?",
      "Yes. A keyboard-first switcher could search agents and repositories, then open the selected session.",
    ],
    [
      "Should Quick Chats show up alongside agents?",
      "Yes. One search can find both, with repository context when there is one.",
    ],
    [
      "Can recents lead—and can I stay on the keyboard?",
      "Yes. Recent sessions first; ⌘K, search, and Return to switch.",
    ],
  ];
  return `<div class="delegate-iteration"><div class="delegate-iteration__heading"><span>IN CONVERSATION</span><strong>Shaping the feature together</strong><small id="iteration-count">01 / 03</small></div><div class="delegate-iteration__stage">${rounds.map(([user, agent]) => `<div class="delegate-iteration__round">${userMessage(user)}${agentMessage(agent)}</div>`).join("")}</div><div class="delegate-iteration__track"><i id="iteration-fill"></i></div><p>Several iterations. One clear handoff.</p></div>`;
}

function codeDiff() {
  return `<div class="review-diff delegate-diff"><header>src/agent-switcher.ts <span>feat/agent-switcher</span></header><div class="review-diff__line"><b>18</b><span>export function findAgent(query, agents) {</span></div><div class="review-diff__line is-added"><b>19</b><span>  return agents.filter(agent =&gt;</span></div><div class="review-diff__line is-added"><b>20</b><span>    matches(agent.name, query) ||</span></div><div class="review-diff__line is-added"><b>21</b><span>    matches(agent.repository, query)</span></div><div class="review-diff__line is-added"><b>22</b><span>  );</span></div><div class="review-diff__line"><b>23</b><span>}</span></div></div>`;
}

function provisioningDialog(step) {
  const steps = [
    ["Creating isolated worktree", "feat/agent-switcher"],
    ["Initializing worktree", "Checking project setup"],
    ["Starting agent session", "New Codex session"],
    ["Handing over initial instructions", "example-project"],
  ];
  return `<div class="delegation-dialog" id="provision-dialog"><span class="delegation-dialog__eyebrow">Delegating work</span><h3>Building an isolated home in example-project…</h3><p class="delegation-dialog__subtitle">A dedicated agent is getting ready for the implementation.</p><div class="delegation-steps">${steps.map(([title, detail], index) => `<div class="delegation-step ${index < step ? "is-complete" : index === step ? "is-active" : ""}"><span class="delegation-step__icon">${index < step ? "✓" : index + 1}</span><span class="delegation-step__copy"><strong>${title}</strong><small>${detail}</small></span></div>`).join("")}</div><div class="delegation-dialog__track"><i id="provision-fill"></i></div><div class="delegation-dialog__footer"><span>Preparing dedicated workspace</span><b id="provision-percent">0%</b></div></div>`;
}

function mergeDialog(cleanup) {
  return `<div class="delegation-dialog delegate-merge-dialog" id="merge-dialog"><span class="delegation-dialog__eyebrow">Git workflow</span><h3>Merge branch</h3><p class="delegation-dialog__subtitle">example-project · feat/agent-switcher → main</p><div class="delegate-merge-dialog__options"><div class="delegate-merge-dialog__option is-selected"><strong>◉ Merge commit</strong><small>Preserve every commit in a merge commit</small></div><div class="delegate-merge-dialog__option"><strong>◯ Squash and merge</strong><small>Combine changes into one commit</small></div></div><div id="cleanup-switch" class="delegate-merge-dialog__switch ${cleanup ? "is-on" : ""}"><i></i><span>Delete worktree after merging</span></div><div class="delegate-merge-dialog__switch ${cleanup ? "is-on" : ""}"><i></i><span>Delete branch after removing worktree</span></div><div class="delegate-merge-dialog__actions"><span>Cancel</span><span id="merge-confirm">Merge</span></div></div>`;
}

function mergeProgressDialog() {
  return `<div class="delegation-dialog" id="merge-progress-dialog"><span class="delegation-dialog__eyebrow">Git workflow</span><h3>Merging into main…</h3><p class="delegation-dialog__subtitle">Integrating the branch and removing its dedicated worktree.</p><div class="delegation-steps"><div class="delegation-step is-active"><span class="delegation-step__icon">1</span><span class="delegation-step__copy"><strong>Merge feat/agent-switcher into main</strong><small>Preserve the branch history</small></span></div><div class="delegation-step"><span class="delegation-step__icon">2</span><span class="delegation-step__copy"><strong>Remove dedicated worktree</strong><small>Keep the repository clean</small></span></div><div class="delegation-step"><span class="delegation-step__icon">3</span><span class="delegation-step__copy"><strong>Close implementation agent</strong><small>Return to the parent conversation</small></span></div></div><div class="delegation-dialog__track"><i id="provision-fill"></i></div><div class="delegation-dialog__footer"><span>Finishing merge and cleanup</span><b id="provision-percent">0%</b></div></div>`;
}

function contentFor(scene, variant) {
  switch (scene.name) {
    case "chat":
      return {
        center:
          variant === "typing"
            ? agentMessage("What would you like to build?")
            : variant === "answered"
              ? `${userMessage("Could we add a faster way to jump between active agents?")}${agentMessage("Yes. A keyboard-first switcher could search agents and repositories, then open the selected session. We can keep this conversation for shaping the behavior.")}`
              : variant === "iterating"
                ? iterationMontage()
                : `<div class="delegate-iteration__later">A few iterations later</div>${userMessage("That covers Quick Chats, recents, and keyboard navigation.")}${agentMessage("We have a clear feature shape. Ready to give the implementation its own worktree?")}`,
        role: "Codex · main",
        name: "Feature discussion",
        path: "example-project / main",
        status: "Planning",
        label: "DELEGATE / DISCUSS",
      };
    case "command":
      return {
        center: `${userMessage("That covers Quick Chats, recents, and keyboard navigation.")}${agentMessage("We have a clear feature shape. Ready to give the implementation its own worktree?")}${variant === "submitted" ? `${userMessage("/delegate")}${agentMessage("I’m preparing the handoff for a new agent in its own worktree. This conversation will stay open.")}` : ""}`,
        role: "Codex · main",
        name: "Feature discussion",
        path: "example-project / main",
        status: variant === "submitted" ? "Preparing handoff" : "Planning",
        label: "DELEGATE / COMMAND",
      };
    case "provision":
      return {
        center: `${userMessage("/delegate")}${agentMessage("I’m handing the feature brief to a new agent in feat/agent-switcher.")}${`<div class="delegate-tool"><b>●</b> Creating agent with a dedicated worktree</div>`}`,
        role: "Codex · main",
        name: "Feature discussion",
        path: "example-project / main",
        status: "Creating worktree",
        label: "DELEGATE / PROVISION",
      };
    case "work": {
      const followup =
        variant === "followup" || variant === "building" || variant === "ready";
      const built = variant === "building" || variant === "ready";
      return {
        center: `${agentMessage("I’ve got the handoff. I’m adding ⌘K search across active agents and repositories in this worktree.", "Agent switcher")}${followup && variant !== "followup" ? userMessage("Please pin the three most recent sessions above search results.") : ""}${built ? agentMessage(variant === "ready" ? "Done. Recent sessions are pinned, keyboard navigation is in place, and the focused checks pass. The branch is committed and ready to merge." : "I’m wiring recent sessions into the search results and checking keyboard navigation.", "Agent switcher") : ""}${built ? codeDiff() : `<div class="delegate-tool"><b>●</b> Implementing in feat/agent-switcher</div>`}`,
        role: "Codex · feat/agent-switcher",
        name: "Agent switcher",
        path: "example-project / feat/agent-switcher",
        status: variant === "ready" ? "Ready to merge" : "Working in worktree",
        label: "DELEGATE / BUILD",
      };
    }
    case "merge":
      return {
        center: `${agentMessage("The feature branch is committed. The agent switcher is ready to merge into main.", "Agent switcher")}${codeDiff()}${variant === "menu" ? `<div class="delegate-git-menu"><span>View changes</span><span>Commit changes</span><span id="merge-menu-action" class="is-selected">⑂ Merge branch…</span><span>Create pull request…</span></div>` : ""}`,
        role: "Codex · feat/agent-switcher",
        name: "Agent switcher",
        path: "example-project / feat/agent-switcher",
        status: variant === "merging" ? "Merging" : "Ready to merge",
        label: "DELEGATE / MERGE",
      };
    case "complete":
      return {
        center: `${agentMessage("Agent switcher is merged into main. The dedicated worktree and branch are cleaned up, and the implementation agent has closed.")}${`<div class="delegate-tool"><b>✓</b> Merge complete · feat/agent-switcher → main</div>`}`,
        role: "Codex · main",
        name: "Feature discussion",
        path: "example-project / main",
        status: "Merged",
        label: "DELEGATE / COMPLETE",
      };
    default:
      return null;
  }
}

function variantFor(scene, local) {
  if (scene.name === "chat")
    return local < 3
      ? "typing"
      : local < 4.5
        ? "answered"
        : local < 8
          ? "iterating"
          : "prepared";
  if (scene.name === "command") return local < 3.65 ? "typing" : "submitted";
  if (scene.name === "provision")
    return `step${Math.min(4, Math.floor(local / 1.35))}`;
  if (scene.name === "work")
    return local < 1.3
      ? "started"
      : local < 2.7
        ? "followup"
        : local < 4.5
          ? "building"
          : "ready";
  if (scene.name === "merge")
    return local < 1.4
      ? "menu"
      : local < 2.6
        ? "dialog"
        : local < 4.1
          ? "cleanup"
          : "merging";
  return "";
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
    const schedule = {
      command: [
        [0.15, 0.75, "#composer-text"],
        [2.6, 3.55, "#composer-send"],
      ],
      merge: [
        [0.2, 1.15, "#merge-menu-action"],
        [1.55, 2.4, "#cleanup-switch"],
        [2.75, 3.85, "#merge-confirm"],
      ],
    };
    const pointer = $("#film-pointer");
    const ring = $("#pointer-ring");
    const active = schedule[scene.name]?.find(
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
    pointer.style.transform = `translate(${mix(target.x + 148, target.x - 7, travel)}px, ${mix(target.y + 92, target.y - 4, travel)}px) scale(${local >= click ? 0.87 : 1})`;
    const ripple = (local - click) / 0.28;
    ring.style.opacity = ripple >= 0 && ripple <= 1 ? String(1 - ripple) : "0";
    ring.style.transform = `translate(${target.x - 20}px, ${target.y - 20}px) scale(${0.5 + Math.max(0, ripple) * 1.5})`;
  }

  function paintScene(scene, variant) {
    const content = contentFor(scene, variant);
    if (!content) return;
    $("#chapter-index").textContent = scene.chapter;
    $("#chapter-title").textContent = scene.title;
    $("#chapter-detail").textContent = scene.detail;
    $("#conversation-body").innerHTML = content.center;
    $("#conversation-role").textContent = content.role;
    $("#conversation-name").textContent = content.name;
    $("#workspace-path").textContent = content.path;
    $("#workspace-title").textContent = content.name;
    $("#workspace-status").textContent = content.status;
    $("#film-footer-stage").textContent = content.label;
    const delegated = ["work", "merge", "complete"].includes(scene.name);
    $("#delegated-session").classList.toggle("is-visible", delegated);
    $("#delegated-session").classList.toggle(
      "sidebar-session--active",
      delegated && scene.name !== "complete",
    );
    $("#target-session").classList.toggle(
      "sidebar-session--active",
      !delegated || scene.name === "complete",
    );
    const overlay = $("#film-overlay");
    overlay.classList.toggle(
      "is-visible",
      scene.name === "provision" ||
        (scene.name === "merge" && variant !== "menu"),
    );
    if (scene.name === "provision") {
      overlay.innerHTML = provisioningDialog(Number(variant.slice(-1)));
    } else if (scene.name === "merge" && variant !== "menu") {
      overlay.innerHTML =
        variant === "merging"
          ? mergeProgressDialog()
          : mergeDialog(variant === "cleanup");
    } else {
      overlay.innerHTML = "";
    }
  }

  function updateMotion(scene, local) {
    $(".film-glow--one").style.transform =
      `translate(${Math.sin(time * 0.2) * 90}px, ${Math.cos(time * 0.13) * 50}px)`;
    $(".film-glow--two").style.transform =
      `translate(${Math.cos(time * 0.18) * 100}px, ${Math.sin(time * 0.2) * 60}px)`;
    const pointer = $("#film-pointer");
    const ring = $("#pointer-ring");
    if (scene.name === "opening") {
      const leave = ease((local - 2.35) / 0.85);
      opening.style.opacity = "1";
      opening.style.transform = `translateX(${-420 * leave}px) scale(${1 - leave * 0.06})`;
      opening.style.clipPath = `inset(0 ${leave * 100}% 0 0)`;
      walkthrough.style.opacity = "0";
      ending.style.opacity = "0";
      pointer.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    opening.style.opacity = "0";
    if (scene.name === "ending") {
      const arrive = ease(local / 1.1);
      walkthrough.style.opacity = "0";
      ending.style.opacity = "1";
      ending.style.transform = `translateY(${95 * (1 - arrive)}px) scale(${0.95 + 0.05 * arrive})`;
      pointer.style.opacity = "0";
      ring.style.opacity = "0";
      return;
    }
    ending.style.opacity = "0";
    walkthrough.style.opacity = "1";
    walkthrough.style.transform = "none";
    walkthrough.style.clipPath =
      scene.name === "chat" && local < 0.8
        ? `inset(0 ${100 * (1 - ease(local / 0.8))}% 0 0)`
        : "none";
    const composer = $("#review-composer");
    if (scene.name === "chat" && local >= 4.5 && local < 8) {
      const phase = clamp(((local - 4.5) / 3.1) * 2, 0, 2);
      $("#iteration-count").textContent =
        `${String(Math.min(3, Math.round(phase) + 1)).padStart(2, "0")} / 03`;
      $("#iteration-fill").style.width =
        `${Math.round(((local - 4.5) / 3.5) * 100)}%`;
      document
        .querySelectorAll(".delegate-iteration__round")
        .forEach((round, index) => {
          const distance = phase - index;
          round.style.opacity = String(clamp(1 - Math.abs(distance), 0, 1));
          round.style.transform = `translateY(${-260 * distance}px) scale(${1 - 0.07 * Math.abs(distance)})`;
        });
    }
    composer.classList.toggle("is-command", scene.name === "command");
    if (scene.name === "command" && local >= 0.75 && local < 3.65) {
      const prompt = "/delegate";
      $("#composer-text").textContent =
        prompt.slice(
          0,
          Math.floor(clamp((local - 1) / 1.25, 0, 1) * prompt.length),
        ) + "▍";
      composer.classList.add("is-typing");
    } else if (scene.name === "chat" && local < 3) {
      const prompt = "Could we add a faster way to jump between active agents?";
      $("#composer-text").textContent =
        prompt.slice(
          0,
          Math.floor(clamp((local - 0.4) / 2.4, 0, 1) * prompt.length),
        ) + "▍";
      composer.classList.add("is-typing");
    } else if (scene.name === "work" && local >= 1.3 && local < 2.7) {
      const prompt =
        "Please pin the three most recent sessions above search results.";
      $("#composer-text").textContent =
        prompt.slice(
          0,
          Math.floor(clamp((local - 1.3) / 1.25, 0, 1) * prompt.length),
        ) + "▍";
      composer.classList.add("is-typing");
    } else {
      $("#composer-text").textContent = "Ask a follow-up";
      composer.classList.remove("is-typing");
    }
    const delegatedRow = $("#delegated-session");
    delegatedRow.classList.toggle("is-removing", scene.name === "complete");
    if (scene.name === "work") {
      const arrival = ease(local / 1.0);
      delegatedRow.style.opacity = String(arrival);
      delegatedRow.style.transform = `translateX(${(1 - arrival) * -18}px)`;
      delegatedRow.style.removeProperty("max-height");
      delegatedRow.style.removeProperty("padding-top");
      delegatedRow.style.removeProperty("padding-bottom");
    } else if (scene.name === "complete") {
      const leave = ease((local - 0.65) / 1.55);
      delegatedRow.style.opacity = String(1 - leave);
      delegatedRow.style.transform = `translateY(${-leave * 6}px)`;
      delegatedRow.style.maxHeight = `${Math.round((1 - leave) * 42)}px`;
      delegatedRow.style.paddingTop = `${Math.round((1 - leave) * 9)}px`;
      delegatedRow.style.paddingBottom = `${Math.round((1 - leave) * 9)}px`;
    } else {
      delegatedRow.style.opacity = scene.name === "merge" ? "1" : "0";
      delegatedRow.style.transform = "none";
      delegatedRow.style.removeProperty("max-height");
      delegatedRow.style.removeProperty("padding-top");
      delegatedRow.style.removeProperty("padding-bottom");
    }
    if (scene.name === "provision") {
      const progress = clamp(local / 5.6, 0, 1);
      const fill = $("#provision-fill");
      if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
      const percent = $("#provision-percent");
      if (percent) percent.textContent = `${Math.round(progress * 100)}%`;
      const dialog = $("#provision-dialog");
      if (dialog) {
        const enter = ease(local / 0.6);
        dialog.style.transform = `translateY(${(1 - enter) * 35}px) scale(${0.94 + 0.06 * enter})`;
      }
    }
    if (scene.name === "merge" && local >= 4.1) {
      const progress = clamp((local - 4.1) / 2.3, 0, 1);
      const fill = $("#provision-fill");
      if (fill) fill.style.width = `${Math.round(progress * 100)}%`;
      const percent = $("#provision-percent");
      if (percent) percent.textContent = `${Math.round(progress * 100)}%`;
      $("#merge-progress-dialog")
        ?.querySelectorAll(".delegation-step")
        .forEach((step, index) => {
          const activeStep = Math.min(2, Math.floor(progress * 3));
          step.classList.toggle("is-active", index === activeStep);
          step.classList.toggle("is-complete", index < activeStep);
          step.querySelector(".delegation-step__icon").textContent =
            index < activeStep ? "✓" : String(index + 1);
        });
    }
    updatePointer(scene, local);
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
      paintScene(scene, variant);
      paintedKey = key;
    }
    opening.style.pointerEvents = scene.name === "opening" ? "auto" : "none";
    ending.style.pointerEvents = scene.name === "ending" ? "auto" : "none";
    if (scene.name !== "opening" && scene.name !== "ending") {
      $("#film-progress").style.width =
        `${((time - SCENES[1].start) / (SCENES[6].end - SCENES[1].start)) * 100}%`;
    }
    updateMotion(scene, local);
    scrubber.value = String(time);
    $("#timecode").textContent =
      `00:${String(Math.floor(time)).padStart(2, "0")} / 00:46`;
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

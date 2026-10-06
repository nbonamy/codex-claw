document.querySelector("#year").textContent = String(new Date().getFullYear());
document.documentElement.classList.add("js");

const reveals = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries, instance) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          instance.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );
  reveals.forEach((element) => observer.observe(element));
} else {
  reveals.forEach((element) => element.classList.add("is-visible"));
}

// Keep MP4s off the network until a visitor chooses a film. The cover is a
// direct media link so the walkthroughs remain available without JavaScript.
const films = [...document.querySelectorAll(".product-film")];
let captionsEnabled = true;
const setCaptions = (enabled) => {
  captionsEnabled = enabled;
  for (const film of films) {
    const button = film.querySelector(".film-captions");
    if (button.disabled) continue;
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Captions on" : "Captions off";
    const track = film.querySelector("track");
    // Leave unopened tracks dormant: enabling an empty URL fires a load error.
    const mode = enabled ? "showing" : "disabled";
    if (track.hasAttribute("src") && track.track.mode !== mode)
      track.track.mode = mode;
  }
};
setCaptions(captionsEnabled);
for (const film of films) {
  const video = film.querySelector("video");
  const cover = film.querySelector(".film-cover");
  const track = video.querySelector("track");
  const captions = film.querySelector(".film-captions");
  captions.hidden = false;
  captions.addEventListener("click", () => {
    setCaptions(!captionsEnabled);
  });
  video.textTracks.addEventListener("change", () => {
    if (!track.hasAttribute("src") || captions.disabled) return;
    const enabled = track.track.mode === "showing";
    if (enabled !== captionsEnabled) setCaptions(enabled);
  });
  const positionCaptions = () => {
    if (!video.clientHeight || !track.track.cues) return;
    for (const cue of track.track.cues) {
      cue.snapToLines = false;
      // Keep captions low, with room for the native controls even on phones.
      cue.line = Math.max(50, 100 - (64 / video.clientHeight) * 100);
      cue.lineAlign = "end";
    }
  };
  track.addEventListener("load", positionCaptions);
  new ResizeObserver(positionCaptions).observe(video);
  video.addEventListener("volumechange", () => {
    for (const other of films) {
      const player = other.querySelector("video");
      if (player.muted !== video.muted) player.muted = video.muted;
      if (player.volume !== video.volume) player.volume = video.volume;
    }
  });
  track.addEventListener("error", () => {
    captions.disabled = true;
    captions.textContent = "Captions unavailable";
  });
  const showError = () => {
    if (film.querySelector(".film-status")) return;
    const status = document.createElement("p");
    status.className = "film-status";
    status.setAttribute("role", "status");
    status.append("Couldn’t play inline. ");
    const link = document.createElement("a");
    link.href = cover.href;
    link.textContent = "Open video";
    status.append(link);
    film.append(status);
  };
  video.addEventListener("error", showError);
  video.addEventListener("play", () => {
    for (const other of films) {
      if (other !== film) other.querySelector("video").pause();
    }
  });
  cover.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    video.poster = cover.querySelector("img").src;
    video.src = cover.href;
    track.src = track.dataset.src;
    track.track.mode = captionsEnabled ? "showing" : "disabled";
    video.hidden = false;
    cover.hidden = true;
    video.focus({ preventScroll: true });
    video.play().catch(showError);
  });
}

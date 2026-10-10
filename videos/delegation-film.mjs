import "./product.mjs";
import { createFilm } from "./delegation-film-controller.mjs";
export { createFilm } from "./delegation-film-controller.mjs";

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

// A film in a chapter's page: drawn live by the same code that renders the
// video, in the page's own colours (it follows the light or dark theme as
// it changes), with a play button, a scrubber and the time. make.go puts
//
//     <figure class="film" data-film="<chapter>"><div class="film-frame"></div>
//     <figcaption class="film-bar"><a class="film-download" ...>...</a></figcaption></figure>
//
// at the top of a chapter whose film exists, and loads this module.

import { build, clock, load } from "./film.js";

const ICON = {
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z" fill="currentColor"/>',
  again: '<path d="M5 12a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.5 3.5v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  large: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

function button(label, icon) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "reading-iconbtn";
  set(b, label, icon);
  return b;
}
function set(b, label, icon) {
  b.title = label;
  b.setAttribute("aria-label", label);
  b.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24">${ICON[icon]}</svg>`;
}

async function mount(figure) {
  const film = build(await load(new URL(`./${figure.dataset.film}.js`, import.meta.url)));
  const frame = figure.querySelector(".film-frame");
  const bar = figure.querySelector(".film-bar");
  frame.replaceChildren(film.root);

  const play = button("Play", "play");
  const scrub = Object.assign(document.createElement("input"), { type: "range", min: 0, max: film.duration, step: 0.01, value: 0 });
  scrub.setAttribute("aria-label", "Position in the film");
  const time = Object.assign(document.createElement("span"), { className: "film-time" });
  const large = button("Full screen", "large");
  bar.prepend(play, scrub, time);
  if (document.fullscreenEnabled) bar.append(large);

  let t = 0;
  let playing = false;
  let last = 0;
  function seek(to) {
    t = Math.min(film.duration, Math.max(0, to));
    film.draw(t);
    scrub.value = t;
    time.textContent = `${clock(t)} / ${clock(film.duration)}`;
  }
  function stop() {
    playing = false;
    t >= film.duration ? set(play, "Play again", "again") : set(play, "Play", "play");
  }
  function tick(now) {
    if (!playing) return;
    seek(t + Math.min(0.1, (now - last) / 1000)); // a tab in the background does not jump ahead
    last = now;
    if (t >= film.duration) return stop();
    requestAnimationFrame(tick);
  }
  function toggle() {
    if (playing) return stop();
    if (t >= film.duration) seek(0);
    playing = true;
    set(play, "Pause", "pause");
    last = performance.now();
    requestAnimationFrame(tick);
  }

  play.addEventListener("click", toggle);
  frame.addEventListener("click", toggle);
  scrub.addEventListener("input", () => seek(Number(scrub.value)));
  large.addEventListener("click", () => (document.fullscreenElement ? document.exitFullscreen() : figure.requestFullscreen()));
  figure.addEventListener("keydown", (event) => {
    if (event.target === scrub) return; // the scrubber has its own keys
    if (event.key === " " || event.key === "k") toggle();
    else if (event.key === "ArrowLeft") seek(t - 5);
    else if (event.key === "ArrowRight") seek(t + 5);
    else return;
    event.preventDefault();
  });
  figure.tabIndex = 0;

  // Before it plays, the film shows its first picture with the chapter's title, at 0:00.
  time.textContent = `${clock(0)} / ${clock(film.duration)}`;
}

for (const figure of document.querySelectorAll("figure.film[data-film]")) {
  mount(figure).catch((error) => {
    figure.querySelector(".film-frame").textContent = "The film could not be loaded here; the MP4 below has it.";
    console.error(error);
  });
}

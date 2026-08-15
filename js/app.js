/**
 * Hash router and shell behaviour. Each view module exports
 * { title, render(container, params) } and renders into #view.
 */
import overview from "./views/overview.js";
import explorer from "./views/explorer.js";
import map from "./views/map.js";
import compliance from "./views/compliance.js";
import timeline from "./views/timeline.js";
import remedy from "./views/remedy.js";

const ROUTES = { overview, explorer, map, compliance, timeline, remedy };
const DEFAULT_ROUTE = "overview";

const viewEl = document.getElementById("view");
viewEl.dataset.booted = "1"; // tells the boot watchdog in index.html that the module graph loaded
const header = document.querySelector(".site-header");
const navToggle = document.getElementById("nav-toggle");
const navList = document.getElementById("nav-list");

let renderToken = 0;
let cleanup = null;

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const route = pathPart || DEFAULT_ROUTE;
  return { route, params: new URLSearchParams(queryPart || "") };
}

function setActiveNav(route) {
  for (const a of navList.querySelectorAll("a[data-route]")) {
    if (a.dataset.route === route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function closeNav() {
  header.classList.remove("nav-open");
  navToggle.setAttribute("aria-expanded", "false");
}

async function mount() {
  const { route, params } = parseHash();
  const view = ROUTES[route];
  if (!view) {
    window.location.hash = `#/${DEFAULT_ROUTE}`;
    return;
  }

  const token = ++renderToken;
  if (typeof cleanup === "function") {
    try { cleanup(); } catch { /* view already gone */ }
    cleanup = null;
  }

  setActiveNav(route);
  closeNav();
  document.title = `${view.title} — From Harm to Compliance`;
  viewEl.setAttribute("aria-busy", "true");
  viewEl.innerHTML = `<div class="loading"><div class="spinner" aria-hidden="true"></div>Loading ${view.title}…</div>`;

  try {
    const result = await view.render(viewEl, params);
    if (token !== renderToken) return; // superseded by a newer navigation
    cleanup = typeof result === "function" ? result : null;
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    viewEl.innerHTML = `
      <div class="card pad error-box">
        <p><strong>Could not load this view.</strong></p>
        <p>${err instanceof Error ? escapeText(err.message) : "Unexpected error"}</p>
        <p><button class="btn" id="retry-btn">Try again</button></p>
        <p class="note">If you opened index.html straight from disk, the browser
        cannot load the data files over file:// — serve the folder with
        <code>python -m http.server</code> instead.</p>
      </div>`;
    document.getElementById("retry-btn").addEventListener("click", mount);
  } finally {
    if (token === renderToken) {
      viewEl.setAttribute("aria-busy", "false");
      const h1 = viewEl.querySelector("h1");
      if (h1) {
        h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }
}

function escapeText(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

navToggle.addEventListener("click", () => {
  const open = header.classList.toggle("nav-open");
  navToggle.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (e) => {
  if (header.classList.contains("nav-open") && !header.contains(e.target)) closeNav();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeNav();
});

window.addEventListener("hashchange", mount);
mount();

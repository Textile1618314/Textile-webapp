/**
 * Recall Explorer: instant client-side search/filter/sort over all 758
 * recalls, with a detail drawer and filtered CSV export. Filter state
 * lives in the hash query so views can deep-link into a slice.
 */
import { getData } from "../api.js";
import {
  HAZARDS, CHANNELS, ARCHETYPES, BOUNDARY_CLASSES,
  hazardColor, hazardLabel, fmtInt, fmtUSD, fmtDate, yesNo, esc,
} from "../format.js";

const COLUMNS = [
  { key: "date", label: "Date", sortable: true },
  { key: "title", label: "Recall", sortable: true },
  { key: "hazard_category", label: "Hazard", sortable: true },
  { key: "primary_country", label: "Origin", sortable: true },
  { key: "sales_channel", label: "Channel", sortable: true },
  { key: "units", label: "Units", sortable: true, num: true },
  { key: "price_usd", label: "Price", sortable: true, num: true },
];

function readFilters(params) {
  return {
    q: params.get("q") || "",
    hazard: params.get("hazard") || "",
    channel: params.get("channel") || "",
    childrens: params.get("childrens") || "",
    country: params.get("country") || "",
    archetype: params.get("archetype") || "",
    from: parseInt(params.get("from"), 10) || 1974,
    to: parseInt(params.get("to"), 10) || 2026,
  };
}

function writeFilters(f) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.hazard) p.set("hazard", f.hazard);
  if (f.channel) p.set("channel", f.channel);
  if (f.childrens) p.set("childrens", f.childrens);
  if (f.country) p.set("country", f.country);
  if (f.archetype) p.set("archetype", f.archetype);
  if (f.from !== 1974) p.set("from", String(f.from));
  if (f.to !== 2026) p.set("to", String(f.to));
  const qs = p.toString();
  history.replaceState(null, "", qs ? `#/explorer?${qs}` : "#/explorer");
}

function applyFilters(records, f) {
  const q = f.q.trim().toLowerCase();
  return records.filter((r) => {
    if (r.year < f.from || r.year > f.to) return false;
    if (f.hazard && r.hazard_category !== f.hazard) return false;
    if (f.channel && r.sales_channel !== f.channel) return false;
    if (f.childrens === "yes" && !r.is_childrens) return false;
    if (f.childrens === "no" && r.is_childrens) return false;
    if (f.country && !(r.countries.includes(f.country) || r.primary_country === f.country)) return false;
    if (f.archetype && r.archetype !== f.archetype) return false;
    if (q && !r.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

function toCSV(rows) {
  const fields = ["recall_number", "date", "title", "hazard_category", "segment",
    "is_childrens", "is_violation", "units", "price_usd", "sales_channel",
    "countries", "primary_country", "remedy_options", "archetype",
    "boundary_class", "sleepwear_standard", "url"];
  const head = fields.join(",");
  const body = rows.map((r) => fields.map((k) => {
    const v = r[k];
    return csvEscape(Array.isArray(v) ? v.join("; ") : v);
  }).join(",")).join("\n");
  return head + "\n" + body;
}

export default {
  title: "Recall Explorer",

  async render(el, params) {
    const data = await getData("recalls");
    const records = data.records;
    let filters = readFilters(params);
    let sortKey = "date";
    let sortDir = -1;
    let selected = null;

    const countryList = [...new Set(records.flatMap((r) => r.countries))].sort();

    el.innerHTML = `
      <div class="view-head">
        <p class="kicker">Tool</p>
        <h1>Recall Explorer</h1>
        <p class="lede">All ${fmtInt(data.n)} CPSC apparel and home textile recalls,
        1974–2026. Filter, sort, open the underlying cpsc.gov record, or export
        the current slice as CSV.</p>
      </div>

      <section class="card" aria-label="Recall search and results">
        <form class="filter-row" id="ex-filters">
          <div class="field wide">
            <label for="ex-q">Search titles</label>
            <input type="search" id="ex-q" placeholder="e.g. pajamas, hoodie, Target…" value="${esc(filters.q)}">
          </div>
          <div class="field">
            <label for="ex-from">Years</label>
            <div class="year-pair">
              <input type="number" id="ex-from" min="1974" max="2026" value="${filters.from}" aria-label="From year">
              <span aria-hidden="true">–</span>
              <input type="number" id="ex-to" min="1974" max="2026" value="${filters.to}" aria-label="To year">
            </div>
          </div>
          <div class="field">
            <label for="ex-hazard">Hazard</label>
            <select id="ex-hazard">
              <option value="">All hazards</option>
              ${Object.entries(HAZARDS).map(([k, h]) => `<option value="${k}">${esc(h.label)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="ex-channel">Channel</label>
            <select id="ex-channel">
              <option value="">All channels</option>
              ${Object.entries(CHANNELS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="ex-childrens">Children's</label>
            <select id="ex-childrens">
              <option value="">All products</option>
              <option value="yes">Children's only</option>
              <option value="no">Adult only</option>
            </select>
          </div>
          <div class="field">
            <label for="ex-country">Origin country</label>
            <select id="ex-country">
              <option value="">All countries</option>
              ${countryList.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="ex-archetype">Archetype</label>
            <select id="ex-archetype">
              <option value="">All archetypes</option>
              ${Object.entries(ARCHETYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}
            </select>
          </div>
        </form>

        <div class="result-meta">
          <span id="ex-count" role="status"></span>
          <span style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <button class="btn quiet" id="ex-reset" type="button">Reset filters</button>
            <button class="btn" id="ex-csv" type="button">Download CSV</button>
          </span>
        </div>

        <div class="table-wrap" style="max-height:640px;overflow-y:auto">
          <table class="data" id="ex-table">
            <thead>
              <tr>
                ${COLUMNS.map((c) => `
                  <th scope="col" ${c.num ? 'class="num"' : ""}>
                    ${c.sortable
                      ? `<button type="button" data-sort="${c.key}">${esc(c.label)} <span class="sort-arrow" data-arrow="${c.key}" aria-hidden="true"></span></button>`
                      : esc(c.label)}
                  </th>`).join("")}
              </tr>
            </thead>
            <tbody id="ex-tbody"></tbody>
          </table>
        </div>
      </section>
      <p class="note">Rows open a detail panel; press Enter on a focused row to open it.
      The Compliance Checker deep-links into this table by archetype.</p>
      <div id="ex-drawer-root"></div>`;

    const tbody = document.getElementById("ex-tbody");
    const countEl = document.getElementById("ex-count");
    const drawerRoot = document.getElementById("ex-drawer-root");

    // set select initial values (options are rendered before state applies)
    document.getElementById("ex-hazard").value = filters.hazard;
    document.getElementById("ex-channel").value = filters.channel;
    document.getElementById("ex-childrens").value = filters.childrens;
    document.getElementById("ex-country").value = filters.country;
    document.getElementById("ex-archetype").value = filters.archetype;

    let current = [];

    function sortRows(rows) {
      const k = sortKey;
      return [...rows].sort((a, b) => {
        const av = a[k], bv = b[k];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
      });
    }

    function renderArrows() {
      for (const s of el.querySelectorAll("[data-arrow]")) {
        s.textContent = s.dataset.arrow === sortKey ? (sortDir === 1 ? "↑" : "↓") : "";
      }
    }

    function renderRows() {
      current = sortRows(applyFilters(records, filters));
      countEl.textContent = `${fmtInt(current.length)} of ${fmtInt(records.length)} recalls`;
      renderArrows();

      const frag = document.createDocumentFragment();
      for (const r of current) {
        const tr = document.createElement("tr");
        tr.tabIndex = 0;
        tr.setAttribute("aria-selected", selected === r ? "true" : "false");

        const tdDate = document.createElement("td");
        tdDate.textContent = fmtDate(r.date);
        tdDate.style.whiteSpace = "nowrap";

        const tdTitle = document.createElement("td");
        tdTitle.className = "cell-title";
        const span = document.createElement("span");
        span.className = "t";
        span.textContent = r.title;
        span.title = r.title;
        tdTitle.appendChild(span);

        const tdHaz = document.createElement("td");
        const chip = document.createElement("span");
        chip.className = "chip";
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = hazardColor(r.hazard_category);
        chip.append(dot, document.createTextNode(hazardLabel(r.hazard_category, true)));
        tdHaz.appendChild(chip);

        const tdCountry = document.createElement("td");
        tdCountry.textContent = r.primary_country || "-";

        const tdChan = document.createElement("td");
        tdChan.textContent = CHANNELS[r.sales_channel] || r.sales_channel;

        const tdUnits = document.createElement("td");
        tdUnits.className = "num";
        tdUnits.textContent = fmtInt(r.units);

        const tdPrice = document.createElement("td");
        tdPrice.className = "num";
        tdPrice.textContent = fmtUSD(r.price_usd);

        tr.append(tdDate, tdTitle, tdHaz, tdCountry, tdChan, tdUnits, tdPrice);
        tr.addEventListener("click", () => openDrawer(r));
        tr.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDrawer(r);
          }
        });
        frag.appendChild(tr);
      }
      tbody.replaceChildren(frag);
    }

    function specRow(dt, dd) {
      return `<dt>${esc(dt)}</dt><dd>${dd}</dd>`;
    }

    function openDrawer(r) {
      selected = r;
      const hazard = hazardLabel(r.hazard_category);
      drawerRoot.innerHTML = `
        <div class="drawer-scrim" id="ex-scrim"></div>
        <aside class="drawer" role="dialog" aria-modal="true" aria-label="Recall detail">
          <div class="drawer-head">
            <h2>${esc(r.title)}</h2>
            <button class="drawer-close" id="ex-close" aria-label="Close detail panel">×</button>
          </div>
          <div class="drawer-body">
            <p style="margin:0 0 0.9rem">
              <span class="chip"><span class="dot" style="background:${hazardColor(r.hazard_category)}"></span>${esc(hazard)}</span>
              ${r.is_childrens ? '<span class="badge blue" style="margin-left:0.4rem">Children’s</span>' : ""}
              ${r.is_violation ? '<span class="badge amber" style="margin-left:0.4rem">Violation-triggered</span>' : ""}
            </p>
            <dl class="spec">
              ${specRow("Recall number", esc(r.recall_number))}
              ${specRow("Date", esc(fmtDate(r.date)))}
              ${specRow("Segment", esc(r.segment === "home_textile" ? "Home textile" : "Apparel"))}
              ${specRow("Archetype", esc(ARCHETYPES[r.archetype] || r.archetype))}
              ${specRow("Boundary class", esc(r.boundary_class ? (BOUNDARY_CLASSES[r.boundary_class] || r.boundary_class) : "-"))}
              ${specRow("Cites sleepwear standard", esc(yesNo(r.sleepwear_standard)))}
              ${specRow("Injuries reported", esc(yesNo(r.injuries_reported)))}
              ${specRow("Units recalled", esc(fmtInt(r.units)))}
              ${specRow("Unit price", esc(fmtUSD(r.price_usd)))}
              ${specRow("Sales channel", esc(CHANNELS[r.sales_channel] || r.sales_channel))}
              ${specRow("Countries of origin", esc(r.countries.length ? r.countries.join(", ") : "-"))}
              ${specRow("Remedies offered", esc(r.remedy_options.length ? r.remedy_options.join(", ") : "not stated"))}
            </dl>
            <p style="margin-top:1rem">
              <a class="btn primary" style="display:inline-block;text-decoration:none"
                 href="${esc(r.url)}" rel="external noopener" target="_blank">
                View on cpsc.gov ↗</a>
            </p>
          </div>
        </aside>`;
      const close = () => {
        drawerRoot.replaceChildren();
        selected = null;
        renderRows();
      };
      document.getElementById("ex-close").addEventListener("click", close);
      document.getElementById("ex-scrim").addEventListener("click", close);
      drawerRoot.querySelector(".drawer").addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
      });
      document.getElementById("ex-close").focus();
      renderRows();
    }

    // filter wiring
    const form = document.getElementById("ex-filters");
    form.addEventListener("submit", (e) => e.preventDefault());

    function syncFromInputs() {
      filters = {
        q: document.getElementById("ex-q").value,
        hazard: document.getElementById("ex-hazard").value,
        channel: document.getElementById("ex-channel").value,
        childrens: document.getElementById("ex-childrens").value,
        country: document.getElementById("ex-country").value,
        archetype: document.getElementById("ex-archetype").value,
        from: parseInt(document.getElementById("ex-from").value, 10) || 1974,
        to: parseInt(document.getElementById("ex-to").value, 10) || 2026,
      };
      writeFilters(filters);
      renderRows();
    }

    let debounce = 0;
    form.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(syncFromInputs, 120);
    });

    document.getElementById("ex-reset").addEventListener("click", () => {
      filters = readFilters(new URLSearchParams());
      document.getElementById("ex-q").value = "";
      document.getElementById("ex-hazard").value = "";
      document.getElementById("ex-channel").value = "";
      document.getElementById("ex-childrens").value = "";
      document.getElementById("ex-country").value = "";
      document.getElementById("ex-archetype").value = "";
      document.getElementById("ex-from").value = "1974";
      document.getElementById("ex-to").value = "2026";
      writeFilters(filters);
      renderRows();
    });

    document.getElementById("ex-csv").addEventListener("click", () => {
      const blob = new Blob([toCSV(current)], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "cpsc_textile_recalls_filtered.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    el.querySelector("thead").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sort]");
      if (!btn) return;
      const k = btn.dataset.sort;
      if (sortKey === k) sortDir *= -1;
      else { sortKey = k; sortDir = k === "date" ? -1 : 1; }
      renderRows();
    });

    renderRows();

    return () => clearTimeout(debounce);
  },
};

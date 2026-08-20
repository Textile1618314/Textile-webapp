/**
 * Sourcing Risk Map: choropleth of import-normalised posterior recall
 * rates per billion SME, with HDI tooltips and a ranked side panel.
 */
import { loadAll } from "../api.js";
import { choropleth, logColor, mapLegend } from "../charts/choropleth.js";
import { dataTableTwin } from "../charts/base.js";
import { fmtInt, fmtNum, fmtPct, esc } from "../format.js";

function rateFmt(v) {
  if (v == null) return "-";
  return v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);
}

export default {
  title: "Sourcing Risk Map",

  async render(el) {
    const { countryRates, world } = await loadAll(["countryRates", "world"]);
    const countries = countryRates.countries;
    const withRate = countries.filter((c) => c.rate_mean != null);
    const domain = [
      Math.min(...withRate.map((c) => c.rate_mean)),
      Math.max(...withRate.map((c) => c.rate_mean)),
    ];
    const colorOf = logColor(domain);
    const byMapName = new Map(withRate.filter((c) => c.on_map).map((c) => [c.map_name, c]));

    el.innerHTML = `
      <div class="view-head">
        <p class="kicker">Where recalled product comes from</p>
        <h1>Sourcing Risk Map</h1>
        <p class="lede">Posterior recall rates per billion square-metre equivalents (SME)
        of US apparel imports, ${countryRates.window[0]}–${countryRates.window[1]}.
        A hierarchical Bayesian model shrinks small exporters toward the pool, so a
        single unlucky recall does not brand a country. Reference for rate ratios:
        <strong>posterior grand mean</strong> of the 58 modelled countries.</p>
      </div>

      <div class="map-layout">
        <section class="card" aria-labelledby="map-title">
          <div class="card-head">
            <h2 id="map-title">Recalls per billion SME imported</h2>
            <span class="sub">${fmtInt(countryRates.n_recalls_modelled)} recalls ·
              ${countryRates.n_countries} countries · 94% HDI in tooltips</span>
          </div>
          <div class="card-body">
            <div class="chart" id="map-chart"></div>
            <div id="map-legend"></div>
            <p class="note">${esc(countryRates.note)} Countries too small for the 1:110m
            basemap (${countryRates.unmatched.map(esc).join(", ")}) appear in the
            ranking only.</p>
          </div>
        </section>

        <section class="card" aria-labelledby="rank-title">
          <div class="card-head">
            <h2 id="rank-title">Ranking</h2>
            <span class="sub" id="rank-sub"></span>
          </div>
          <div class="card-body">
            <div class="seg" role="group" aria-label="Ranking metric" style="margin-bottom:0.6rem">
              <button type="button" id="rank-mode-rate" aria-pressed="true">Rate</button>
              <button type="button" id="rank-mode-recalls" aria-pressed="false">Recalls</button>
            </div>
            <ol class="rank-list" id="rank-list"></ol>
          </div>
        </section>
      </div>

      <section class="card" style="margin-top:1.1rem" aria-labelledby="map-detail-title">
        <div class="card-head"><h2 id="map-detail-title">Country detail</h2></div>
        <div class="card-body" id="map-detail">
          <p class="note">Hover or click a country on the map, or pick one from the
          ranking, to pin its numbers here.</p>
        </div>
        <div class="card-body" id="map-table"></div>
      </section>`;

    // full table twin
    document.getElementById("map-table").appendChild(dataTableTwin(
      ["Country", "Recalls", "Imports (bn SME)", "Rate / bn SME", "94% HDI", "Rate ratio vs mean"],
      [...countries].sort((a, b) => (b.rate_mean ?? 0) - (a.rate_mean ?? 0)).map((c) => [
        c.country + (c.on_map ? "" : " *"),
        c.recalls,
        fmtNum(c.bn_sme, 2),
        rateFmt(c.rate_mean),
        `${rateFmt(c.hdi_lo)} – ${rateFmt(c.hdi_hi)}`,
        `${fmtNum(c.rr_median, 1)}×`,
      ]),
      "All countries as a table (* not drawable at 110m)",
    ));

    const tooltipRows = (c) => [
      { label: "Recalls (1990–2025)", value: fmtInt(c.recalls) },
      { label: "Imports", value: `${fmtNum(c.bn_sme, 2)} bn SME` },
      { label: "Posterior rate / bn SME", value: rateFmt(c.rate_mean) },
      { label: "94% HDI", value: `${rateFmt(c.hdi_lo)} – ${rateFmt(c.hdi_hi)}` },
      { label: "Rate ratio vs mean", value: `${fmtNum(c.rr_median, 1)}× [${fmtNum(c.rr_lo, 1)}–${fmtNum(c.rr_hi, 1)}]` },
    ];

    const detailEl = document.getElementById("map-detail");

    function showDetail(c) {
      if (!c) return;
      detailEl.innerHTML = `
        <div class="grid cols-4">
          <div>
            <p class="tile-label">${esc(c.country)}${c.on_map ? "" : " (not drawable at 110m)"}</p>
            <p class="tile-value" style="font-size:1.5rem">${rateFmt(c.rate_mean)}
              <span style="font-size:0.8rem;font-weight:400;color:var(--ink-3)">recalls / bn SME</span></p>
            <p class="tile-detail">94% HDI ${rateFmt(c.hdi_lo)} – ${rateFmt(c.hdi_hi)}</p>
          </div>
          <div>
            <p class="tile-label">Recalls · imports</p>
            <p class="tile-value" style="font-size:1.5rem">${fmtInt(c.recalls)}</p>
            <p class="tile-detail">${fmtNum(c.bn_sme, 2)} bn SME imported</p>
          </div>
          <div>
            <p class="tile-label">Rate ratio vs mean</p>
            <p class="tile-value" style="font-size:1.5rem">${c.rr_median === 1 ? "1×" : fmtNum(c.rr_median, 1) + "×"}</p>
            <p class="tile-detail">94% HDI ${fmtNum(c.rr_lo, 1)} – ${fmtNum(c.rr_hi, 1)}</p>
          </div>
          <div>
            <p class="tile-label">P(rate below mean)</p>
            <p class="tile-value" style="font-size:1.5rem">${fmtPct(c.p_below_mean)}</p>
            <p class="tile-detail">posterior probability</p>
          </div>
        </div>
        <p class="note" style="margin-top:0.8rem">
          <a href="#/explorer?country=${encodeURIComponent(c.country)}">See ${esc(c.country)}'s recalls in the Explorer →</a>
        </p>`;
    }

    const mapCtl = choropleth(document.getElementById("map-chart"), {
      world,
      byMapName,
      value: (c) => c.rate_mean,
      domain,
      tooltipRows,
      onSelect: (c) => {
        if (c) {
          active = c.country;
          showDetail(c);
          mapCtl.highlight(c.map_name);
        }
        renderRanking();
      },
      ariaLabel: "World choropleth of posterior recall rates per billion SME of US apparel imports; darker blue is a higher rate. The ranking list beside the map carries the same values.",
    });
    mapLegend(document.getElementById("map-legend"), domain, "recalls per bn SME");

    // ranking
    let rankMode = "rate";
    let active = null;
    const rankList = document.getElementById("rank-list");
    const rankSub = document.getElementById("rank-sub");

    function renderRanking() {
      const sorted = [...countries].sort((a, b) => rankMode === "rate"
        ? (b.rate_mean ?? -1) - (a.rate_mean ?? -1)
        : b.recalls - a.recalls);
      rankSub.textContent = rankMode === "rate"
        ? "posterior rate per bn SME"
        : "recall count, 1990–2025";
      const maxVal = rankMode === "rate"
        ? Math.max(...sorted.map((c) => c.rate_mean ?? 0))
        : Math.max(...sorted.map((c) => c.recalls));

      const frag = document.createDocumentFragment();
      sorted.forEach((c, i) => {
        const val = rankMode === "rate" ? (c.rate_mean ?? 0) : c.recalls;
        const li = document.createElement("li");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rank-row" + (active === c.country ? " active" : "");

        const n = document.createElement("span");
        n.className = "rank-n";
        n.textContent = String(i + 1);

        const name = document.createElement("span");
        name.className = "rank-name";
        name.textContent = c.country;
        if (!c.on_map) {
          const off = document.createElement("span");
          off.className = "off-map";
          off.textContent = " · list only";
          name.appendChild(off);
        }

        const bar = document.createElement("span");
        bar.className = "rank-bar";
        const fill = document.createElement("span");
        const w = maxVal > 0 ? Math.max(2, 100 * val / maxVal) : 2;
        fill.style.width = `${w}%`;
        fill.style.background = c.rate_mean != null ? colorOf(c.rate_mean) : "#d5d5d0";
        bar.appendChild(fill);

        const v = document.createElement("span");
        v.className = "rank-val";
        v.textContent = rankMode === "rate" ? rateFmt(c.rate_mean) : fmtInt(c.recalls);

        btn.append(n, name, bar, v);
        btn.addEventListener("click", () => {
          active = c.country;
          showDetail(c);
          mapCtl.highlight(c.map_name);
          renderRanking();
        });
        li.appendChild(btn);
        frag.appendChild(li);
      });
      rankList.replaceChildren(frag);
    }

    document.getElementById("rank-mode-rate").addEventListener("click", () => {
      rankMode = "rate";
      setPressed();
      renderRanking();
    });
    document.getElementById("rank-mode-recalls").addEventListener("click", () => {
      rankMode = "recalls";
      setPressed();
      renderRanking();
    });
    function setPressed() {
      document.getElementById("rank-mode-rate").setAttribute("aria-pressed", String(rankMode === "rate"));
      document.getElementById("rank-mode-recalls").setAttribute("aria-pressed", String(rankMode === "recalls"));
    }

    renderRanking();
    const china = countries.find((c) => c.country === "China");
    if (china) showDetail(china);

    return () => mapCtl.destroy();
  },
};

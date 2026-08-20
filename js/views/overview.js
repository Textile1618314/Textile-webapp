/**
 * Overview dashboard: headline tiles, annual trend with regime shading,
 * hazard mix by regime, and jump-off cards.
 */
import { loadAll } from "../api.js";
import { lineChart } from "../charts/line.js";
import { buildLegend, dataTableTwin } from "../charts/base.js";
import {
  PALETTE, HAZARD_STACK_ORDER, OTHER_PROTECTIVE,
  hazardColor, hazardLabel, fmtInt, fmtPct, esc,
} from "../format.js";

function tile({ label, value, detail, accent }) {
  return `
    <div class="card tile">
      <div class="tile-accent" style="background:${accent}"></div>
      <p class="tile-label">${esc(label)}</p>
      <p class="tile-value">${value}</p>
      <p class="tile-detail">${detail}</p>
    </div>`;
}

export default {
  title: "Overview",

  async render(el) {
    const { meta, regimes } = await loadAll(["meta", "regimes"]);
    const h = meta.headline;

    el.innerHTML = `
      <div class="view-head">
        <p class="kicker">Interactive companion</p>
        <h1>Five decades of US apparel &amp; home textile recalls</h1>
        <p class="lede">Every CPSC apparel and home textile recall from 1974 to 2026,
        with the paper's models behind it: what gets recalled, where it is made,
        how it is detected, and where the sleepwear compliance boundary sits.</p>
      </div>

      <div class="grid cols-4" id="ov-tiles">
        ${tile({
          label: "Recalls in the hardened dataset",
          value: fmtInt(h.n_recalls),
          detail: `${meta.paper.window[0]}–${meta.paper.window[1]}, cpsc.gov`,
          accent: PALETTE.blue,
        })}
        ${tile({
          label: "Online-only recalls: flammability odds",
          value: `${h.online_flam_or.toFixed(1)}×`,
          detail: `vs store/mixed · MH OR, 95% CI ${h.online_flam_or_ci[0]}–${h.online_flam_or_ci[1]}`,
          accent: PALETTE.pink,
        })}
        ${tile({
          label: "Regime change in hazard mix",
          value: esc(h.regime_change),
          detail: `posterior change points ${h.changepoint_modes[0]} and ${h.changepoint_modes[1]}`,
          accent: PALETTE.purple,
        })}
        ${tile({
          label: "Flammability share, 2020–25",
          value: fmtPct(h.flam_share_2020_25),
          detail: "up from 16% of recalls in 2000–09",
          accent: PALETTE.amber,
        })}
      </div>

      <div class="stack" style="margin-top:1.1rem">
        <section class="card" aria-labelledby="ov-trend-title">
          <div class="card-head">
            <h2 id="ov-trend-title">Recalls per year, shaded by hazard-composition regime</h2>
            <span class="sub">1974–2026 · change points from the Bayesian model</span>
          </div>
          <div class="card-body">
            <div class="chart" id="ov-trend"></div>
            <div id="ov-trend-table"></div>
          </div>
        </section>

        <div class="grid cols-2">
          <section class="card" aria-labelledby="ov-mix-title">
            <div class="card-head">
              <h2 id="ov-mix-title">What each regime is made of</h2>
              <span class="sub">posterior mean hazard shares</span>
            </div>
            <div class="card-body" id="ov-mix"></div>
          </section>

          <section class="card" aria-labelledby="ov-findings-title">
            <div class="card-head"><h2 id="ov-findings-title">Findings behind the tiles</h2></div>
            <div class="card-body">
              <ul class="verdict-list">
                <li><strong>The e-commerce flammability channel.</strong> An online-only recall
                  is ${h.online_flam_or.toFixed(1)}× more likely to cite flammability than a
                  store or mixed-channel recall, a multiple that has stayed stable since 2000
                  (Breslow–Day p = ${h.breslow_day_p}). ${fmtPct(h.kitagawa_within_rate_share)} of the
                  flammability rise is within-channel, not channel mix.
                  <a href="#/timeline">Timeline</a></li>
                <li><strong>Enforcement now finds recalls before injuries do.</strong> In
                  ${h.detection_crossing_year} violation-detected recalls overtook
                  injury-reported ones and never looked back. <a href="#/timeline">Timeline</a></li>
                <li><strong>Sourcing risk is not import share.</strong> Import-normalised
                  posterior recall rates vary by two orders of magnitude across
                  ${h.n_countries_modelled} exporting countries. <a href="#/map">Sourcing map</a></li>
                <li><strong>The sleepwear boundary is where recalls concentrate.</strong>
                  Loungewear recalled under the children's sleepwear standards is the
                  signature modern case. <a href="#/compliance">Compliance checker</a></li>
              </ul>
            </div>
          </section>
        </div>

        <div class="grid cols-3" id="ov-links">
          <a class="card pad" href="#/explorer" style="text-decoration:none;color:inherit">
            <span class="badge blue">Tool</span>
            <h3 style="margin:0.5rem 0 0.25rem">Recall Explorer</h3>
            <p class="note">Search and filter all ${fmtInt(h.n_recalls)} recalls; open any
            record with its cpsc.gov link.</p>
          </a>
          <a class="card pad" href="#/compliance" style="text-decoration:none;color:inherit">
            <span class="badge blue">Tool</span>
            <h3 style="margin:0.5rem 0 0.25rem">Compliance Boundary Checker</h3>
            <p class="note">Walk the 16 CFR 1610 / 1615 / 1616 logic for a garment and see
            the recall record for its archetype.</p>
          </a>
          <a class="card pad" href="#/remedy" style="text-decoration:none;color:inherit">
            <span class="badge blue">Tool</span>
            <h3 style="margin:0.5rem 0 0.25rem">Remedy What-if</h3>
            <p class="note">The refund-prediction model as an interactive calculator, with
            permutation importance.</p>
          </a>
        </div>
      </div>`;

    // annual trend
    const years = regimes.years.map((d) => ({ x: d.year, y: d.n }));
    const destroyTrend = lineChart(document.getElementById("ov-trend"), {
      series: [{ key: "n", label: "Recalls", color: PALETTE.blue, values: years }],
      height: 300,
      yTitle: "recalls",
      regimes: regimes.regimes.map((r) => ({ span: r.span, label: r.label })),
      ariaLabel: "Line chart of recalls per year, 1974 to 2026, with three regime bands",
    });
    document.getElementById("ov-trend-table").appendChild(
      dataTableTwin(["Year", "Recalls"], regimes.years.map((d) => [d.year, d.n])),
    );

    // regime composition mini-bars
    const mix = document.getElementById("ov-mix");
    const mixWrap = document.createElement("div");
    for (const r of regimes.regimes) {
      const byHaz = Object.fromEntries(r.composition.map((c) => [c.hazard, c.mean]));
      const folded = {};
      for (const k of HAZARD_STACK_ORDER) {
        folded[k] = k === OTHER_PROTECTIVE.key
          ? OTHER_PROTECTIVE.members.reduce((s, mkey) => s + (byHaz[mkey] || 0), 0)
          : (byHaz[k] || 0);
      }
      const row = document.createElement("div");
      row.style.margin = "0 0 0.85rem";
      const lab = document.createElement("div");
      lab.style.cssText = "font-size:0.8rem;color:var(--ink-2);margin-bottom:0.3rem;display:flex;justify-content:space-between";
      const l1 = document.createElement("span");
      l1.innerHTML = `<strong>${esc(r.label)}</strong>`;
      const l2 = document.createElement("span");
      const top = Object.entries(folded).sort((a, b) => b[1] - a[1])[0];
      l2.textContent = `${hazardLabel(top[0], true)} leads at ${Math.round(top[1] * 100)}%`;
      lab.append(l1, l2);
      const bar = document.createElement("div");
      bar.style.cssText = "display:flex;gap:2px;height:22px;border-radius:5px;overflow:hidden";
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label",
        `${r.label}: ` + HAZARD_STACK_ORDER
          .filter((k) => folded[k] >= 0.005)
          .map((k) => `${hazardLabel(k, true)} ${Math.round(folded[k] * 100)}%`)
          .join(", "));
      for (const k of HAZARD_STACK_ORDER) {
        if (folded[k] < 0.005) continue;
        const seg = document.createElement("span");
        seg.style.cssText = `flex:${folded[k]} 0 0;background:${hazardColor(k)}`;
        seg.title = `${hazardLabel(k)}: ${Math.round(folded[k] * 100)}%`;
        bar.appendChild(seg);
      }
      row.append(lab, bar);
      mixWrap.appendChild(row);
    }
    mix.appendChild(mixWrap);
    mix.appendChild(buildLegend(HAZARD_STACK_ORDER.map((k) => ({ label: hazardLabel(k, true), color: hazardColor(k) }))));
    const mixNote = document.createElement("p");
    mixNote.className = "note";
    mixNote.textContent = "Posterior mean shares from the Dirichlet-multinomial change-point model; full year-by-year detail in the Regime Timeline.";
    mix.appendChild(mixNote);

    return () => { destroyTrend(); };
  },
};

/**
 * Regime Timeline: hazard composition by year with change-point posterior
 * densities, plus the violation-vs-injury detection overlay crossing in 2012.
 */
import { loadAll } from "../api.js";
import { stackedChart, densityStrip } from "../charts/stacked.js";
import { lineChart } from "../charts/line.js";
import { buildLegend, dataTableTwin } from "../charts/base.js";
import {
  PALETTE, HAZARD_STACK_ORDER, OTHER_PROTECTIVE,
  hazardColor, hazardLabel, fmtPct,
} from "../format.js";

export default {
  title: "Regime Timeline",

  async render(el) {
    const { regimes, detection, channel } = await loadAll(["regimes", "detection", "channel"]);

    const regimeBands = regimes.regimes.map((r) => ({ span: r.span, label: r.label }));

    el.innerHTML = `
      <div class="view-head">
        <p class="kicker">When the recall system changed</p>
        <h1>Regime Timeline</h1>
        <p class="lede">A Dirichlet-multinomial change-point model splits five decades of
        hazard composition into three regimes, with breaks concentrated at
        <strong>${regimes.changepoints.cp1.mode}</strong> and
        <strong>${regimes.changepoints.cp2.mode}</strong>. Around the second break the
        system also flipped from injury-driven to violation-driven detection.</p>
      </div>

      <div class="stack">
        <section class="card" aria-labelledby="tl-comp-title">
          <div class="card-head">
            <h2 id="tl-comp-title">Hazard composition by year</h2>
            <div class="seg" role="group" aria-label="Composition mode">
              <button type="button" id="tl-mode-share" aria-pressed="true">Share</button>
              <button type="button" id="tl-mode-count" aria-pressed="false">Count</button>
            </div>
          </div>
          <div class="card-body">
            <div id="tl-legend"></div>
            <div class="chart" id="tl-stacked"></div>
            <div class="chart" id="tl-density" style="margin-top:0.4rem"></div>
            <p class="note">Lower panel: posterior probability that each change point falls
            in a given year (${fmtPct(bestProb(regimes.changepoints.cp1))} at
            ${regimes.changepoints.cp1.mode};
            ${fmtPct(bestProb(regimes.changepoints.cp2))} at
            ${regimes.changepoints.cp2.mode}).</p>
            <div id="tl-table"></div>
          </div>
        </section>

        <section class="card" aria-labelledby="tl-regimes-title">
          <div class="card-head"><h2 id="tl-regimes-title">The three regimes</h2></div>
          <div class="card-body">
            <div class="grid cols-3" id="tl-regime-cards"></div>
          </div>
        </section>

        <section class="card" aria-labelledby="tl-detect-title">
          <div class="card-head">
            <h2 id="tl-detect-title">How recalls get found: violation-detected vs injury-reported</h2>
            <label class="switch" style="font-size:0.85rem">
              <input type="checkbox" id="tl-overlay-toggle" checked>
              <span class="track" aria-hidden="true"></span>
              Show overlay
            </label>
          </div>
          <div class="card-body">
            <div id="tl-detect-wrap">
              <div id="tl-detect-legend"></div>
              <div class="chart" id="tl-detect"></div>
            </div>
            <p class="note">Posterior share of recalls citing a detected standard violation
            vs a reported injury or incident (94% HDI bands, observed shares as dots).
            The violation share overtakes the injury share in
            <strong>${detection.crossing_year}</strong> — P(violation &gt; injury) reaches
            ${fmtPct(detection.p_violation_exceeds_injury[detection.crossing_year])} that
            year and ~100% after 2015. Detection now leads harm: recalls increasingly
            happen because testing found a violation, not because someone was hurt.</p>
            <div id="tl-detect-table"></div>
          </div>
        </section>

        <section class="card" aria-labelledby="tl-channel-title">
          <div class="card-head"><h2 id="tl-channel-title">The channel behind the third regime</h2></div>
          <div class="card-body">
            <div class="grid cols-3">
              <div>
                <p class="tile-label">Online-only recalls that cite flammability</p>
                <p class="tile-value" style="font-size:1.6rem">${fmtPct(flamGivenOnline(channel))}</p>
                <p class="tile-detail">2020–26, vs ${fmtPct(flamGivenStore(channel))} for store-only</p>
              </div>
              <div>
                <p class="tile-label">Common odds ratio (Mantel–Haenszel)</p>
                <p class="tile-value" style="font-size:1.6rem">${channel.mh_or.toFixed(2)}×</p>
                <p class="tile-detail">95% CI ${channel.mh_ci[0]}–${channel.mh_ci[1]};
                  stable across periods (Breslow–Day p = ${channel.breslow_day_p})</p>
              </div>
              <div>
                <p class="tile-label">Flammability rise explained within channels</p>
                <p class="tile-value" style="font-size:1.6rem">${fmtPct(channel.kitagawa.within_rate_share)}</p>
                <p class="tile-detail">Kitagawa decomposition; only
                  ${fmtPct(channel.kitagawa.composition_share)} is channel mix</p>
              </div>
            </div>
          </div>
        </section>
      </div>`;

    // fold protective+other for the stack
    const stackYears = regimes.years.map((d) => {
      const values = {};
      for (const k of HAZARD_STACK_ORDER) {
        values[k] = k === OTHER_PROTECTIVE.key
          ? OTHER_PROTECTIVE.members.reduce((s, mk) => s + (d.counts[mk] || 0), 0)
          : (d.counts[k] || 0);
      }
      return { year: d.year, values, n: d.n };
    });

    document.getElementById("tl-legend").appendChild(buildLegend(
      HAZARD_STACK_ORDER.map((k) => ({ label: hazardLabel(k, true), color: hazardColor(k) })),
    ));

    let mode = "share";
    let destroyStack = null;

    function renderStack() {
      if (destroyStack) destroyStack();
      destroyStack = stackedChart(document.getElementById("tl-stacked"), {
        years: stackYears,
        keys: HAZARD_STACK_ORDER,
        color: hazardColor,
        label: (k) => hazardLabel(k, true),
        mode,
        height: 330,
        regimes: regimeBands,
        ariaLabel: `Stacked columns of hazard ${mode === "share" ? "shares" : "counts"} per year, 1974 to 2026; the data table below carries the same values`,
      });
    }
    renderStack();

    const modeShare = document.getElementById("tl-mode-share");
    const modeCount = document.getElementById("tl-mode-count");
    function setMode(m) {
      mode = m;
      modeShare.setAttribute("aria-pressed", String(m === "share"));
      modeCount.setAttribute("aria-pressed", String(m === "count"));
      renderStack();
    }
    modeShare.addEventListener("click", () => setMode("share"));
    modeCount.addEventListener("click", () => setMode("count"));

    const [minYear, maxYear] = [regimes.years[0].year, regimes.years[regimes.years.length - 1].year];
    const destroyDensity = densityStrip(document.getElementById("tl-density"), {
      xDomain: [minYear, maxYear],
      series: [
        { label: "Change point 1", color: PALETTE.purple, density: regimes.changepoints.cp1.density },
        { label: "Change point 2", color: PALETTE.pink, density: regimes.changepoints.cp2.density },
      ],
      ariaLabel: "Posterior densities of the two change points, peaking in 2005 and 2011",
    });

    // composition table twin
    document.getElementById("tl-table").appendChild(dataTableTwin(
      ["Year", "Total", ...HAZARD_STACK_ORDER.map((k) => hazardLabel(k, true))],
      stackYears.map((d) => [d.year, d.n, ...HAZARD_STACK_ORDER.map((k) => d.values[k])]),
    ));

    // regime cards
    const cardsEl = document.getElementById("tl-regime-cards");
    const regimeDescriptions = [
      "Choking and small-part hazards dominate an era of injury-led recalls.",
      "The drawstring era: strangulation rules and retrofits reshape outerwear.",
      "Flammability returns as e-commerce sleepwear and loungewear surge.",
    ];
    regimes.regimes.forEach((r, i) => {
      const top3 = [...r.composition].sort((a, b) => b.mean - a.mean).slice(0, 3);
      const div = document.createElement("div");
      div.className = "card pad";
      div.style.boxShadow = "none";
      const h = document.createElement("h3");
      h.style.cssText = "margin:0 0 0.2rem;font-size:0.95rem";
      h.textContent = `Regime ${r.regime} · ${r.label}`;
      const p = document.createElement("p");
      p.className = "note";
      p.style.marginTop = "0";
      p.textContent = regimeDescriptions[i] || "";
      div.append(h, p);
      for (const c of top3) {
        const row = document.createElement("div");
        row.className = "contrib-row";
        const name = document.createElement("span");
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:0.45rem;background:${hazardColor(c.hazard)}`;
        name.append(dot, document.createTextNode(hazardLabel(c.hazard, true)));
        const val = document.createElement("span");
        val.className = "val";
        val.textContent = `${Math.round(c.mean * 100)}% [${Math.round(c.hdi_lo * 100)}–${Math.round(c.hdi_hi * 100)}]`;
        row.append(name, val);
        div.appendChild(row);
      }
      cardsEl.appendChild(div);
    });

    // detection overlay
    const detectWrap = document.getElementById("tl-detect-wrap");
    document.getElementById("tl-detect-legend").appendChild(buildLegend([
      { label: "Violation-detected share", color: PALETTE.blue, line: true },
      { label: "Injury-reported share", color: PALETTE.red, line: true },
    ]));
    const toSeries = (rows) => rows.map((d) => ({ x: d.year, y: d.mean, lo: d.hdi_lo, hi: d.hdi_hi }));
    const toDots = (rows) => rows.map((d) => ({ x: d.year, y: d.observed }));
    const destroyDetect = lineChart(document.getElementById("tl-detect"), {
      series: [
        {
          key: "violation", label: "Violation-detected", color: PALETTE.blue,
          values: toSeries(detection.series.violation), dots: toDots(detection.series.violation),
        },
        {
          key: "injury", label: "Injury-reported", color: PALETTE.red,
          values: toSeries(detection.series.injury), dots: toDots(detection.series.injury),
        },
      ],
      height: 320,
      yMax: 1,
      yFmt: (v) => `${Math.round(v * 100)}%`,
      tooltipFmt: (v) => `${Math.round(v * 100)}%`,
      markers: [{ x: detection.crossing_year, label: `${detection.crossing_year}: shares cross` }],
      ariaLabel: "Two lines with credible bands: the violation-detected share rises and crosses the falling injury-reported share in 2012",
    });
    document.getElementById("tl-detect-table").appendChild(dataTableTwin(
      ["Year", "n", "Violation share", "Injury share"],
      detection.annual.map((d) => [d.year, d.n, fmtPct(d.share_violation), fmtPct(d.share_injury)]),
    ));

    const toggle = document.getElementById("tl-overlay-toggle");
    toggle.addEventListener("change", () => {
      detectWrap.style.display = toggle.checked ? "" : "none";
    });

    return () => {
      if (destroyStack) destroyStack();
      destroyDensity();
      destroyDetect();
    };
  },
};

function bestProb(cp) {
  return Math.max(...cp.density.map((d) => d.prob));
}

function flamGivenOnline(channel) {
  const row = channel.key_shares.find((k) => k.period === "2020-26" && k.quantity === "flam_given_online_only");
  return row ? row.estimate : null;
}

function flamGivenStore(channel) {
  const row = channel.key_shares.find((k) => k.period === "2020-26" && k.quantity === "flam_given_store_only");
  return row ? row.estimate : null;
}

/**
 * Remedy & Risk Insights: the paper's refund-prediction model as a
 * what-if calculator, with permutation importance and coefficients.
 * Descriptive reconstruction — clearly labelled as not advice.
 */
import { getData } from "../api.js";
import { barChart } from "../charts/bars.js";
import { dataTableTwin } from "../charts/base.js";
import { PALETTE, CHANNELS, hazardLabel, fmtPct, fmtInt, esc } from "../format.js";

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export default {
  title: "Remedy Insights",

  async render(el) {
    const model = await getData("remedyModel");
    const num = Object.fromEntries(model.numeric_terms.map((t) => [t.term, t]));
    const catHaz = model.categorical_terms.hazard_category;
    const catChan = model.categorical_terms.sales_channel;

    el.innerHTML = `
      <div class="view-head">
        <p class="kicker">Tool · what predicts a refund</p>
        <h1>Remedy &amp; Risk Insights</h1>
        <p class="lede">Among ${fmtInt(model.n)} recalls with a stated remedy
        (${model.years[0]}–${model.years[1]}), ${fmtPct(model.base_rate)} offered a refund.
        The paper's elastic-net model finds that <strong>cheap, children's, violation-triggered
        products get refunds; expensive, large-volume ones get repairs and replacements</strong>.
        Set a profile below to see the model's view of it.</p>
      </div>

      <div class="callout" style="margin-bottom:1.1rem">
        <strong>Descriptive, not advice.</strong> This calculator replays the published
        coefficients (log-odds per SD, anchored at the sample base rate) to show
        <em>what the historical record associates with refunds</em>. It neither predicts nor
        recommends remedies for a real recall. Cross-validated AUC ${model.pooled_auc};
        inputs not shown are held at the sample average.
      </div>

      <div class="grid cols-2" style="align-items:start">
        <section class="card pad" aria-labelledby="rm-form-title">
          <h2 id="rm-form-title" style="margin:0 0 0.9rem;font-size:1.02rem">Recall profile</h2>
          <form id="rm-form" class="stack" style="gap:0.9rem">
            <div class="grid cols-2" style="gap:0.9rem">
              <div class="field">
                <label for="rm-hazard">Hazard</label>
                <select id="rm-hazard">
                  ${catHaz.map((l) => `<option value="${esc(l.level)}">${esc(hazardLabel(l.level))}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label for="rm-channel">Sales channel</label>
                <select id="rm-channel">
                  ${catChan.map((l) => `<option value="${esc(l.level)}">${esc(CHANNELS[l.level] || l.level)}</option>`).join("")}
                </select>
              </div>
            </div>
            <div class="field">
              <label for="rm-price">Unit price: <output id="rm-price-out">$25</output></label>
              <input type="range" id="rm-price" min="0.3" max="3.3" step="0.05" value="1.4"
                     aria-describedby="rm-price-hint">
              <span class="hint" id="rm-price-hint">$2 to $2,000, log scale. Price is the
              single strongest predictor — cheaper products get refunds.</span>
            </div>
            <div class="field">
              <label for="rm-units">Units recalled: <output id="rm-units-out">4,000</output></label>
              <input type="range" id="rm-units" min="1.7" max="6.7" step="0.05" value="3.6">
              <span class="hint">50 to 5,000,000, log scale.</span>
            </div>
            <div class="grid cols-2" style="gap:0.6rem">
              <label class="switch"><input type="checkbox" id="rm-childrens" checked>
                <span class="track" aria-hidden="true"></span> Children's product</label>
              <label class="switch"><input type="checkbox" id="rm-violation">
                <span class="track" aria-hidden="true"></span> Violation-triggered</label>
              <label class="switch"><input type="checkbox" id="rm-sleepstd">
                <span class="track" aria-hidden="true"></span> Cites sleepwear standard</label>
              <label class="switch"><input type="checkbox" id="rm-injuries">
                <span class="track" aria-hidden="true"></span> Injuries reported</label>
            </div>
          </form>
        </section>

        <section class="card pad" aria-live="polite" aria-labelledby="rm-score-title">
          <h2 id="rm-score-title" style="margin:0 0 0.6rem;font-size:1.02rem">Model view of this profile</h2>
          <div class="prob-readout">
            <span class="big" id="rm-prob">—</span>
            <span style="color:var(--ink-2)">modelled refund probability<br>
              <span style="font-size:0.8rem;color:var(--ink-3)">sample base rate ${fmtPct(model.base_rate)}</span></span>
          </div>
          <div class="meter" role="img" id="rm-meter" aria-label="Refund probability meter">
            <div class="fill" id="rm-meter-fill" style="width:0%"></div>
          </div>
          <p class="note" id="rm-odds"></p>
          <h3 style="font-size:0.86rem;margin:1.1rem 0 0.3rem">What moves this profile</h3>
          <div id="rm-contribs"></div>
          <p class="note">Contributions in log-odds vs the average 2010–26 recall;
          positive pushes toward refund.</p>
        </section>
      </div>

      <div class="grid cols-2" style="margin-top:1.1rem;align-items:start">
        <section class="card" aria-labelledby="rm-imp-title">
          <div class="card-head">
            <h2 id="rm-imp-title">Permutation importance</h2>
            <span class="sub">drop in AUC when a feature is shuffled</span>
          </div>
          <div class="card-body">
            <div class="chart" id="rm-imp-chart"></div>
            <div id="rm-imp-table"></div>
          </div>
        </section>
        <section class="card" aria-labelledby="rm-coef-title">
          <div class="card-head">
            <h2 id="rm-coef-title">Coefficients that survive selection</h2>
            <span class="sub">log-odds per SD, 95% bootstrap interval</span>
          </div>
          <div class="card-body">
            <div class="chart" id="rm-coef-chart"></div>
            <div id="rm-coef-table"></div>
            <p class="note">Filled bars: interval excludes zero. Terms selected in under
            half the bootstrap refits are omitted from the chart.</p>
          </div>
        </section>
      </div>`;

    const $ = (id) => document.getElementById(id);

    function centeredCat(levels, chosen) {
      const mean = levels.reduce((s, l) => s + l.coef * l.freq, 0);
      const pick = levels.find((l) => l.level === chosen);
      return { delta: (pick ? pick.coef : 0) - mean };
    }

    function zContrib(term, x) {
      const t = num[term];
      if (!t || !t.sd) return 0;
      return t.coef * ((x - t.mean) / t.sd);
    }

    function compute() {
      const log10Price = parseFloat($("rm-price").value);
      const log10Units = parseFloat($("rm-units").value);
      const price = Math.round(Math.pow(10, log10Price));
      const units = Number(Math.pow(10, log10Units).toPrecision(2));
      $("rm-price-out").textContent = `$${fmtInt(price)}`;
      $("rm-units-out").textContent = fmtInt(units);

      const contribs = [
        { label: `Price $${fmtInt(price)}`, v: zContrib("log10_price", log10Price) },
        { label: `${fmtInt(units)} units`, v: zContrib("log10_units", log10Units) },
        { label: "Children's product", v: zContrib("is_childrens", $("rm-childrens").checked ? 1 : 0) },
        { label: "Violation-triggered", v: zContrib("is_violation", $("rm-violation").checked ? 1 : 0) },
        { label: "Sleepwear standard cited", v: zContrib("sleepwear_standard", $("rm-sleepstd").checked ? 1 : 0) },
        { label: "Injuries reported", v: zContrib("injuries_reported", $("rm-injuries").checked ? 1 : 0) },
        { label: `Hazard: ${hazardLabel($("rm-hazard").value, true)}`, v: centeredCat(catHaz, $("rm-hazard").value).delta },
        { label: `Channel: ${CHANNELS[$("rm-channel").value] || $("rm-channel").value}`, v: centeredCat(catChan, $("rm-channel").value).delta },
      ];

      const z = model.base_logit + contribs.reduce((s, c) => s + c.v, 0);
      const p = sigmoid(z);
      $("rm-prob").textContent = fmtPct(p, 0);
      $("rm-meter-fill").style.width = `${(p * 100).toFixed(1)}%`;
      $("rm-meter").setAttribute("aria-label", `Refund probability meter: ${fmtPct(p, 0)}`);
      const oddsVsBase = Math.exp(z - model.base_logit);
      $("rm-odds").textContent = oddsVsBase >= 1
        ? `Odds of a refund ${oddsVsBase.toFixed(1)}× the average recall in the sample.`
        : `Odds of a refund ${(1 / oddsVsBase).toFixed(1)}× lower than the average recall in the sample.`;

      const box = $("rm-contribs");
      box.replaceChildren();
      for (const c of contribs.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))) {
        const row = document.createElement("div");
        row.className = "contrib-row";
        const name = document.createElement("span");
        name.textContent = c.label;
        const val = document.createElement("span");
        const tiny = Math.abs(c.v) < 0.005;
        val.className = "val " + (tiny ? "" : c.v > 0 ? "pos" : "neg");
        val.textContent = tiny ? "0.00" : (c.v > 0 ? "+" : "") + c.v.toFixed(2);
        row.append(name, val);
        box.appendChild(row);
      }
    }

    $("rm-form").addEventListener("input", compute);
    compute();

    // permutation importance chart
    const impItems = model.importance.filter((d) => d.importance > 0.001).slice(0, 10);
    const destroyImp = barChart($("rm-imp-chart"), {
      items: impItems.map((d) => ({
        label: d.label, value: d.importance, lo: d.lo95, hi: d.hi95,
        note: `P(importance > 0) = ${d.p_gt_zero}`,
      })),
      fmt: (v) => v.toFixed(3),
      color: PALETTE.teal,
      xTitle: "AUC drop when shuffled",
      ariaLabel: "Horizontal bars of permutation importance for the refund model; unit price dominates",
    });
    $("rm-imp-table").appendChild(dataTableTwin(
      ["Feature", "AUC drop", "95% interval"],
      model.importance.map((d) => [d.label, d.importance.toFixed(4), `${d.lo95.toFixed(4)} – ${d.hi95.toFixed(4)}`]),
    ));

    // coefficients chart
    const coefItems = model.coefficients.filter((d) => d.selected_frac >= 0.5);
    const destroyCoef = barChart($("rm-coef-chart"), {
      items: coefItems.map((d) => ({
        label: d.label, value: d.coef, lo: d.lo95, hi: d.hi95,
        color: d.excludes_zero ? PALETTE.blue : "#9db7dd",
        note: `selected in ${fmtPct(d.selected_frac)} of refits`,
      })),
      fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(2),
      xTitle: "log-odds per SD (+ toward refund)",
      ariaLabel: "Horizontal bars of elastic-net coefficients with bootstrap intervals; price is the strongest negative, children's product the strongest positive",
    });
    $("rm-coef-table").appendChild(dataTableTwin(
      ["Term", "Coefficient", "95% interval", "Selected"],
      model.coefficients.map((d) => [d.label, d.coef.toFixed(3), `${d.lo95.toFixed(3)} – ${d.hi95.toFixed(3)}`, fmtPct(d.selected_frac)]),
    ));

    return () => { destroyImp(); destroyCoef(); };
  },
};

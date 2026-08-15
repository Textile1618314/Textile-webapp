/**
 * Compliance Boundary Checker: walks the 16 CFR 1610 / 1615 / 1616 logic
 * for a described garment and shows the dataset's recall record for the
 * matching archetype. Descriptive summary of the rules as analysed in the
 * paper — not legal advice.
 */
import { getData } from "../api.js";
import { hazardColor, hazardLabel, fmtInt, fmtPct, fmtDate, esc } from "../format.js";

const CATEGORIES = [
  { value: "pajama_set", label: "Pajamas / pajama set", sleep: true },
  { value: "nightgown", label: "Nightgown / nightshirt", sleep: true },
  { value: "robe", label: "Robe / bathrobe", sleep: true },
  { value: "sleepwear_generic", label: "Sleepwear (unspecified)", sleep: true },
  { value: "wearable_blanket", label: "Wearable blanket / sleep sack", sleep: true },
  { value: "loungewear", label: "Loungewear / lounge pants", sleep: false, lounge: true },
  { value: "daywear", label: "Daywear (tees, dresses, playwear)", sleep: false },
  { value: "outerwear", label: "Outerwear (hoodies, jackets, sweatshirts)", sleep: false },
  { value: "accessory", label: "Accessory (scarf, hat, bag)", sleep: false },
  { value: "footwear", label: "Footwear / slippers", sleep: false },
  { value: "home_textile", label: "Home textile (bedding, towels, blankets)", sleep: false },
];

const WEARERS = [
  { value: "infant", label: "Infant, sized 9 months or smaller" },
  { value: "child_0_6x", label: "Child, sizes 9 months–6X" },
  { value: "child_7_14", label: "Child, sizes 7–14" },
  { value: "adult", label: "Adult (or size above 14)" },
];

const ECFR = "https://www.ecfr.gov/current/title-16/chapter-II/subchapter-D/part-";

function cite(part, label) {
  const anchor = label || `16 CFR ${part}`;
  const partNum = String(part).split(".")[0];
  return `<a class="cfr" href="${ECFR}${partNum}" rel="external" target="_blank">${esc(anchor)}</a>`;
}

/**
 * The decision walk. Returns { headline, badges, items, warnings, citations }.
 */
function decide({ category, wearer, fit, fabric }) {
  const cat = CATEGORIES.find((c) => c.value === category);
  const isChild = wearer !== "adult";
  const sleepish = cat.sleep || cat.lounge;
  const items = [];
  const warnings = [];
  const citations = new Set();
  let headline = "";
  let badges = [];

  // --- base layer: 16 CFR 1610
  if (category === "footwear") {
    items.push(`The general apparel flammability standard exempts footwear (as well as
      hats and gloves) when not attached to a covered garment, so ${cite("1610")} testing
      is normally not required. Product-safety exposure for footwear in this dataset is
      dominated by choking (small parts) and laceration hazards instead.`);
    citations.add("1610");
  } else if (category === "home_textile") {
    items.push(`${cite("1610")} covers <em>wearing apparel</em>; general home textiles such
      as bedding and towels sit outside it (separate standards exist for mattresses and
      carpets). Chemical, flammability-adjacent and drawstring hazards still appear in the
      recall record for this segment.`);
    citations.add("1610");
  } else {
    items.push(`As wearing apparel, the item must meet the Standard for the Flammability of
      Clothing Textiles, ${cite("1610")}: the 45° test with a Class 1 or Class 2 result
      (Class 3 fabrics cannot be sold). Plain-surface fabrics of at least 2.6 oz/yd², and
      fabrics of acrylic, modacrylic, nylon, olefin, polyester or wool at any weight, are
      exempt from testing (${cite("1610.1", "16 CFR 1610.1(d)")}).`);
    citations.add("1610");
  }

  // --- children's sleepwear layer
  if (sleepish && isChild) {
    const std = wearer === "child_7_14" ? "1616" : "1615";
    const stdLabel = wearer === "child_7_14"
      ? "children's sleepwear sizes 7–14 (FF 5-74)"
      : "children's sleepwear sizes 0–6X (FF 3-71)";
    citations.add(std);

    if (wearer === "infant") {
      headline = "16 CFR 1610 applies; the sleepwear standard has an infant exclusion";
      badges = [["blue", "16 CFR 1610"], ["green", "Infant exclusion possible"]];
      items.push(`Garments sized nine months or smaller can qualify as <em>infant
        garments</em> excluded from the children's sleepwear standard, provided a
        one-piece garment is no longer than 64.8 cm and no piece of a two-piece garment
        exceeds 40 cm (${cite("1615.1", "16 CFR 1615.1(c)")}). Outside those limits the
        garment is treated as sleepwear and ${cite(std)} applies in full.`);
      citations.add("1615.1");
    } else if (fit === "tight") {
      headline = `${stdLabel.startsWith("children's sleepwear sizes 7") ? "16 CFR 1616" : "16 CFR 1615"} applies — but the tight-fitting exemption can remove the flame-test requirement`;
      badges = [["blue", "16 CFR 1610"], ["green", "Tight-fitting exemption possible"]];
      items.push(`Children's sleepwear in this size band falls under ${cite(std)},
        the standard for ${stdLabel}. A garment qualifies as <em>tight-fitting</em> —
        and is excluded from the flame-resistance test requirement — only if it does not
        exceed the maximum chest, waist, seat, upper-arm, thigh, wrist and ankle
        dimensions for its size in ${cite("1615.1", "16 CFR 1615.1(o)")} (sizes 0–6X)
        or the parallel definition in ${cite("1616")} (sizes 7–14), and it must fit
        snugly at every listed point.`);
      items.push(`Tight-fitting sleepwear still needs ${cite("1610")} compliance, and CPSC
        guidance requires the permanent "wear snug-fitting, not flame resistant" caution
        label and hangtag on qualifying garments. Verify the measured garment — not the
        spec sheet — against the dimension table for every size in the range: one size
        over the maximum forfeits the exemption for that SKU.`);
      citations.add("1615.1");
    } else {
      headline = `${wearer === "child_7_14" ? "16 CFR 1616" : "16 CFR 1615"} applies in full — the garment must be flame resistant`;
      badges = [["pink", wearer === "child_7_14" ? "16 CFR 1616" : "16 CFR 1615"], ["blue", "16 CFR 1610"]];
      items.push(`Loose-fitting children's sleepwear in this size band must comply with
        ${cite(std)} (${stdLabel}): fabric, seams and trim must self-extinguish under the
        standard's 3-second open-flame test, within its char-length limits, with the
        prescribed production sampling. In practice this means inherently flame-resistant
        or treated fabric.`);
      if (fabric === "untreated") {
        warnings.push(`You selected an untreated / not flame-resistant fabric. A loose-fitting
          children's ${cat.lounge ? "loungewear-as-sleepwear" : "sleepwear"} garment in
          untreated cotton or cotton-blend fleece is the single most common flammability
          recall archetype in the dataset — these garments cannot pass the sleepwear
          standard as built.`);
      }
      if (fit === "unsure") {
        items.push(`Not sure about fit? Measure the finished garment at chest, waist, seat,
          upper arm, thigh, wrist and ankle and compare each against the maximum-dimension
          table in ${cite("1615.1", "16 CFR 1615.1(o)")} / the sizes 7–14 equivalent. If any
          measurement exceeds the table, the garment is loose-fitting and the flame-resistance
          requirement stands.`);
      }
    }

    if (cat.lounge) {
      warnings.push(`"Loungewear" is not a recognised escape category. CPSC treats garments
        that are marketed or likely to be used for sleeping as children's sleepwear no matter
        the label — the paper calls recalls in this zone <em>category arbitrage</em>, and
        about one in five sleepwear-standard recalls since 2010 is a garment sold as
        loungewear. Marketing imagery, product copy and retail placement all count.`);
    }
  } else if (sleepish && !isChild) {
    headline = "Adult sleepwear: 16 CFR 1610 only";
    badges = [["blue", "16 CFR 1610"]];
    items.push(`The children's sleepwear standards cover sizes 9 months–6X
      (${cite("1615")}) and 7–14 (${cite("1616")}); adult sleepwear is subject to the
      general apparel standard only. Note that sheer or raised-fiber robes and loungewear
      below 2.6 oz/yd² are a recurring adult flammability recall archetype.`);
  } else if (!sleepish) {
    headline = category === "footwear" || category === "home_textile"
      ? "Outside the apparel flammability standards"
      : "General wearing apparel: 16 CFR 1610" + (isChild ? " plus children's product rules" : "");
    badges = category === "home_textile" ? [["amber", "Outside 16 CFR 1610"]]
      : category === "footwear" ? [["amber", "16 CFR 1610 exemption"]]
      : [["blue", "16 CFR 1610"]];
    if (isChild && cat.value === "daywear") {
      items.push(`Daywear is not sleepwear — but if the garment is pictured or described for
        sleeping (children lounging in bed, "PJs", "cozy for bedtime"), CPSC can treat it as
        sleepwear. Keep marketing aligned with the daywear claim.`);
    }
  }

  // --- drawstrings
  if (isChild && (category === "outerwear" || category === "daywear")) {
    items.push(`Children's upper outerwear in sizes 2T–12 with neck or hood drawstrings,
      and sizes 2T–16 with certain waist drawstrings, is deemed a substantial product
      hazard under ${cite("1120", "16 CFR 1120.3(b)")} (following ASTM F1816). Drawstring
      strangulation drove the 2005–2011 recall regime in this dataset — design them out.`);
    citations.add("1120");
  }

  // --- certification paperwork
  if (isChild) {
    items.push(`As a children's product it needs a <strong>Children's Product
      Certificate</strong> backed by third-party testing at a CPSC-accepted laboratory
      for each applicable rule (CPSIA §14; ${cite("1110")}), plus permanent tracking
      information on the garment.`);
    citations.add("1110");
  } else {
    items.push(`Certify compliance with a <strong>General Certificate of Conformity</strong>
      based on a test or reasonable testing program (${cite("1110")}).`);
    citations.add("1110");
  }

  if (fabric === "fr" && sleepish && isChild && fit !== "tight") {
    items.push(`Flame-resistant fabric must stay flame resistant: the sleepwear standards
      require the garment to comply <em>as produced and after the prescribed laundering</em>,
      so keep treatment durability and care labeling in the test plan.`);
  }

  return { headline, badges, items, warnings, citations: [...citations].sort() };
}

function evidenceFor(records, category, isChild) {
  const rows = records.filter((r) => r.archetype === category && (isChild == null || r.is_childrens === isChild));
  const n = rows.length;
  const sleepStd = rows.filter((r) => r.sleepwear_standard).length;
  const hazCounts = {};
  for (const r of rows) hazCounts[r.hazard_category] = (hazCounts[r.hazard_category] || 0) + 1;
  const recent = [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 4);
  return { n, sleepStd, hazCounts, recent, rows };
}

export default {
  title: "Compliance Checker",

  async render(el) {
    const data = await getData("recalls");
    const records = data.records;

    el.innerHTML = `
      <div class="view-head">
        <p class="kicker">Tool · 16 CFR 1610 / 1615 / 1616</p>
        <h1>Compliance Boundary Checker</h1>
        <p class="lede">Describe a garment and walk the flammability-standard boundary the
        paper maps: which standard applies, whether the tight-fitting or infant exclusions
        can apply, what testing and paperwork are expected — and what the recall record
        says about products like it.</p>
      </div>

      <div class="callout" style="margin-bottom:1.1rem">
        <strong>Descriptive, not legal advice.</strong> This tool summarises the rules as
        analysed in the paper and links the controlling CFR text. Confirm any decision with
        counsel or a CPSC-accepted laboratory.
      </div>

      <div class="grid cols-2" style="align-items:start">
        <section class="card pad" aria-labelledby="cc-form-title">
          <h2 id="cc-form-title" style="margin:0 0 0.9rem;font-size:1.02rem">The garment</h2>
          <form id="cc-form" class="stack" style="gap:0.9rem">
            <div class="field">
              <label for="cc-category">1 · What is it?</label>
              <select id="cc-category">
                ${CATEGORIES.map((c) => `<option value="${c.value}">${esc(c.label)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="cc-wearer">2 · Who wears it?</label>
              <select id="cc-wearer">
                ${WEARERS.map((w) => `<option value="${w.value}">${esc(w.label)}</option>`).join("")}
              </select>
              <span class="hint">The children's sleepwear standards cover sizes 9 months–14.</span>
            </div>
            <div class="field" id="cc-fit-field">
              <label for="cc-fit">3 · Fit, per the 16 CFR 1615.1(o) dimension table</label>
              <select id="cc-fit">
                <option value="loose">Loose-fitting (or exceeds any maximum dimension)</option>
                <option value="tight">Tight-fitting (within every maximum dimension)</option>
                <option value="unsure">Not sure yet</option>
              </select>
              <span class="hint">Chest, waist, seat, upper arm, thigh, wrist and ankle all have
              size-specific maxima.</span>
            </div>
            <div class="field">
              <label for="cc-fabric">4 · Fabric</label>
              <select id="cc-fabric">
                <option value="untreated">Untreated / not flame resistant (e.g. cotton fleece)</option>
                <option value="fr">Flame resistant (inherent or durably treated)</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
          </form>
        </section>

        <div class="stack">
          <section class="card pad checker-result" aria-live="polite" id="cc-result"></section>
          <section class="card" aria-labelledby="cc-evidence-title">
            <div class="card-head">
              <h2 id="cc-evidence-title">What the recall record says</h2>
              <span class="sub" id="cc-evidence-sub"></span>
            </div>
            <div class="card-body" id="cc-evidence"></div>
          </section>
        </div>
      </div>`;

    const $ = (id) => document.getElementById(id);

    function currentInput() {
      return {
        category: $("cc-category").value,
        wearer: $("cc-wearer").value,
        fit: $("cc-fit").value,
        fabric: $("cc-fabric").value,
      };
    }

    function renderResult() {
      const input = currentInput();
      const cat = CATEGORIES.find((c) => c.value === input.category);
      const fitRelevant = (cat.sleep || cat.lounge) && input.wearer !== "adult" && input.wearer !== "infant";
      $("cc-fit-field").style.display = fitRelevant ? "" : "none";

      const d = decide(input);
      $("cc-result").innerHTML = `
        <h3>${esc(d.headline || "What applies")}</h3>
        <p>${d.badges.map(([tone, text]) => `<span class="badge ${tone}" style="margin-right:0.4rem">${esc(text)}</span>`).join("")}</p>
        ${d.warnings.map((w) => `<div class="callout" style="margin:0.7rem 0">${w}</div>`).join("")}
        <ul class="verdict-list">${d.items.map((i) => `<li>${i}</li>`).join("")}</ul>
        <p class="note">Controlling text: ${d.citations.map((c) => cite(c)).join(" · ")} — links open the current eCFR.</p>`;

      // evidence panel
      const isChild = input.wearer === "adult" ? false : true;
      const ev = evidenceFor(records, input.category, isChild);
      $("cc-evidence-sub").textContent = `${cat.label} · ${isChild ? "children's" : "adult"}`;
      const evEl = $("cc-evidence");

      if (!ev.n) {
        evEl.innerHTML = `<p class="note">No recalls of this archetype
          (${esc(cat.label)}, ${isChild ? "children's" : "adult"}) in the 758-recall dataset.
          Absence of recalls is not absence of obligation.</p>`;
        return;
      }

      const hazEntries = Object.entries(ev.hazCounts).sort((a, b) => b[1] - a[1]);
      evEl.innerHTML = `
        <div class="grid cols-3" style="margin-bottom:0.8rem">
          <div>
            <p class="tile-label">Recalls of this archetype</p>
            <p class="tile-value" style="font-size:1.5rem">${fmtInt(ev.n)}</p>
          </div>
          <div>
            <p class="tile-label">Citing a sleepwear standard</p>
            <p class="tile-value" style="font-size:1.5rem">${fmtPct(ev.sleepStd / ev.n)}</p>
            <p class="tile-detail">${fmtInt(ev.sleepStd)} of ${fmtInt(ev.n)}</p>
          </div>
          <div>
            <p class="tile-label">Leading hazard</p>
            <p class="tile-value" style="font-size:1.5rem">${esc(hazardLabel(hazEntries[0][0], true))}</p>
            <p class="tile-detail">${fmtPct(hazEntries[0][1] / ev.n)} of these recalls</p>
          </div>
        </div>
        <div id="cc-hazbar" role="img"></div>
        <h3 style="font-size:0.9rem;margin:1rem 0 0.4rem">Most recent examples</h3>
        <ul style="margin:0;padding-left:1.1rem;font-size:0.88rem">
          ${ev.recent.map((r) => `
            <li style="margin-bottom:0.35rem">
              <a href="${esc(r.url)}" rel="external noopener" target="_blank">${esc(r.title)}</a>
              <span style="color:var(--ink-3)"> — ${esc(fmtDate(r.date))}</span>
            </li>`).join("")}
        </ul>
        <p class="note"><a href="#/explorer?archetype=${encodeURIComponent(input.category)}&childrens=${isChild ? "yes" : "no"}">
          Open all ${fmtInt(ev.n)} in the Recall Explorer →</a></p>`;

      // hazard composition bar with text labels via aria + title
      const barWrap = document.getElementById("cc-hazbar");
      const bar = document.createElement("div");
      bar.style.cssText = "display:flex;gap:2px;height:20px;border-radius:5px;overflow:hidden";
      barWrap.setAttribute("aria-label", "Hazard mix: " + hazEntries.map(([k, v]) => `${hazardLabel(k, true)} ${Math.round(100 * v / ev.n)}%`).join(", "));
      for (const [k, v] of hazEntries) {
        const seg = document.createElement("span");
        seg.style.cssText = `flex:${v} 0 0;background:${hazardColor(k)}`;
        seg.title = `${hazardLabel(k)}: ${v}`;
        bar.appendChild(seg);
      }
      barWrap.replaceChildren(bar);
      const lg = document.createElement("p");
      lg.className = "note";
      lg.textContent = hazEntries.map(([k, v]) => `${hazardLabel(k, true)} ${v}`).join(" · ");
      barWrap.appendChild(lg);
    }

    document.getElementById("cc-form").addEventListener("input", renderResult);
    // sensible default: the modern trap case
    $("cc-category").value = "loungewear";
    $("cc-wearer").value = "child_0_6x";
    $("cc-fabric").value = "untreated";
    renderResult();
  },
};

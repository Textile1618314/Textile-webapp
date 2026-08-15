/**
 * Horizontal bar chart with optional CI whiskers and a reference line.
 * Used for model coefficients, permutation importance and rate rankings.
 */
import { d3 } from "../vendor.js";
import { mountResponsive, makeSvg, margins } from "./base.js";
import { showTooltip, moveTooltip, hideTooltip, tooltipContent } from "./tooltip.js";

/**
 * @param {HTMLElement} container
 * @param {{
 *   items: Array<{label:string, value:number, lo?:number, hi?:number, color?:string, note?:string}>,
 *   fmt?: (v:number)=>string, refLine?: number, ariaLabel: string,
 *   color?: string, xTitle?: string,
 * }} cfg
 */
/**
 * Trim a rendered label until it fits `maxW` pixels, then add an ellipsis.
 * Measured rather than counted in characters, because a proportional font
 * makes "Illinois" and "Wollongong" very different widths at the same length.
 */
function fitLabel(node, maxW) {
  const full = node.textContent;
  const width = () => node.getComputedTextLength();
  if (!width()) return;                       // not rendered yet: leave it alone
  if (width() <= maxW) return;
  let lo = 1;
  let hi = full.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    node.textContent = full.slice(0, mid) + "…";
    if (width() <= maxW) lo = mid;
    else hi = mid - 1;
  }
  node.textContent = full.slice(0, lo).replace(/[\s,;:(]+$/, "") + "…";
}

export function barChart(container, cfg) {
  const rowH = 30;
  const items = cfg.items;

  return mountResponsive(container, (width) => {
    const labelW = Math.min(210, Math.max(120, width * 0.32));
    const m = margins({ left: labelW, top: 8, bottom: cfg.xTitle ? 46 : 30, right: 48 });
    const height = m.top + items.length * rowH + m.bottom;
    const iw = width - m.left - m.right;
    const svg = makeSvg(container, width, height, cfg.ariaLabel);
    const fmt = cfg.fmt || d3.format(".2f");

    let lo = d3.min(items, (d) => Math.min(d.lo ?? d.value, 0));
    let hi = d3.max(items, (d) => Math.max(d.hi ?? d.value, 0));
    if (cfg.refLine != null) {
      lo = Math.min(lo, cfg.refLine);
      hi = Math.max(hi, cfg.refLine);
    }
    const span = (hi - lo) || 1;
    const hasNegative = items.some((d) => d.value < (cfg.refLine ?? 0));
    const loPad = hasNegative ? span * 0.15 : 0; // room for end-anchored labels
    const x = d3.scaleLinear().domain([lo - loPad, hi + span * 0.06])
      .range([m.left, m.left + iw]);

    // x gridlines
    const ticks = x.ticks(5);
    svg.append("g").selectAll("line").data(ticks).join("line")
      .attr("class", "grid-line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d))
      .attr("y1", m.top).attr("y2", m.top + items.length * rowH);
    svg.append("g").selectAll("text").data(ticks).join("text")
      .attr("class", "tick-label")
      .attr("x", (d) => x(d)).attr("y", m.top + items.length * rowH + 16)
      .attr("text-anchor", "middle")
      .text(fmt);
    if (cfg.xTitle) {
      svg.append("text").attr("class", "axis-title")
        .attr("x", m.left + iw).attr("y", m.top + items.length * rowH + 36)
        .attr("text-anchor", "end")
        .text(cfg.xTitle);
    }

    const zero = cfg.refLine ?? 0;
    svg.append("line").attr("class", "axis-line")
      .attr("x1", x(zero)).attr("x2", x(zero))
      .attr("y1", m.top).attr("y2", m.top + items.length * rowH);

    items.forEach((d, i) => {
      const yMid = m.top + i * rowH + rowH / 2;
      const g = svg.append("g");
      const color = d.color || cfg.color || "#2464c7";
      const x0 = x(Math.min(zero, d.value));
      const x1 = x(Math.max(zero, d.value));

      const labelEl = g.append("text")
        .attr("class", "tick-label")
        .attr("x", m.left - 10).attr("y", yMid)
        .attr("dy", "0.32em").attr("text-anchor", "end")
        .style("fill", "var(--ink-2)")
        .text(d.label);
      fitLabel(labelEl.node(), m.left - 14);

      g.append("rect")
        .attr("x", x0).attr("y", yMid - 6)
        .attr("width", Math.max(1, x1 - x0)).attr("height", 12)
        .attr("rx", 4)
        .attr("fill", color);

      if (d.lo != null && d.hi != null) {
        g.append("line")
          .attr("x1", x(d.lo)).attr("x2", x(d.hi))
          .attr("y1", yMid).attr("y2", yMid)
          .attr("stroke", "var(--ink)").attr("stroke-width", 1.4)
          .attr("opacity", 0.55);
        for (const v of [d.lo, d.hi]) {
          g.append("line")
            .attr("x1", x(v)).attr("x2", x(v))
            .attr("y1", yMid - 4).attr("y2", yMid + 4)
            .attr("stroke", "var(--ink)").attr("stroke-width", 1.4)
            .attr("opacity", 0.55);
        }
      }

      const negative = d.value < zero;
      g.append("text")
        .attr("class", "direct-label")
        .attr("x", negative
          ? x(Math.min(d.lo ?? d.value, d.value)) - 6
          : x(Math.max(d.hi ?? d.value, d.value)) + 6)
        .attr("y", yMid).attr("dy", "0.32em")
        .attr("text-anchor", negative ? "end" : "start")
        .text(fmt(d.value));

      g.append("rect")
        .attr("x", 0).attr("y", m.top + i * rowH)
        .attr("width", width).attr("height", rowH)
        .attr("fill", "transparent")
        .on("pointermove", (event) => {
          const rows = [{ label: "estimate", value: fmt(d.value), color }];
          if (d.lo != null) rows.push({ label: "95% interval", value: `${fmt(d.lo)} to ${fmt(d.hi)}` });
          if (d.note) rows.push({ label: d.note, value: "" });
          showTooltip(event, tooltipContent(d.label, rows));
          moveTooltip(event);
        })
        .on("pointerleave", hideTooltip);
    });
  });
}

/**
 * Stacked columns per year with 2px surface gaps between segments,
 * count/share modes, regime shading and per-column tooltip.
 */
import { d3 } from "../vendor.js";
import { mountResponsive, makeSvg, drawYAxis, drawXAxisYears, drawRegimeBands, REGIME_WASHES, margins } from "./base.js";
import { showTooltip, moveTooltip, hideTooltip, tooltipContent } from "./tooltip.js";

/**
 * @param {HTMLElement} container
 * @param {{
 *   years: Array<{year:number, values:Record<string,number>, n:number}>,
 *   keys: string[], color: (k:string)=>string, label: (k:string)=>string,
 *   mode?: "count"|"share", height?: number,
 *   regimes?: Array<{span:[number,number],label:string}>, ariaLabel: string,
 * }} cfg
 */
export function stackedChart(container, cfg) {
  const height = cfg.height || 340;
  const mode = cfg.mode || "count";

  return mountResponsive(container, (width) => {
    const m = margins({ left: 44 });
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const svg = makeSvg(container, width, height, cfg.ariaLabel);

    const years = cfg.years;
    const [y0, y1] = d3.extent(years, (d) => d.year);
    const slot = iw / (y1 - y0 + 1);
    const x = d3.scaleLinear().domain([y0, y1])
      .range([m.left + slot / 2, m.left + iw - slot / 2]);
    const barW = Math.min(24, Math.max(2, slot - 2));

    const yMax = mode === "share" ? 1 : d3.max(years, (d) => d.n);
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([m.top + ih, m.top]);

    if (cfg.regimes) {
      drawRegimeBands(svg, x, m.top, m.top + ih, cfg.regimes, REGIME_WASHES, { labelsAbove: true });
    }
    drawYAxis(svg, y, m.left, m.left + iw, {
      fmt: mode === "share" ? d3.format(".0%") : d3.format(","),
    });
    drawXAxisYears(svg, x, m.top + ih, { every: iw < 560 ? 20 : 10 });

    const gap = 2;
    const cols = svg.append("g");
    for (const row of years) {
      const total = row.n || 0;
      if (!total) continue;
      const g = cols.append("g")
        .attr("tabindex", -1)
        .style("cursor", "default");
      let acc = 0;
      for (const k of cfg.keys) {
        const v = row.values[k] || 0;
        if (!v) continue;
        const val = mode === "share" ? v / total : v;
        const base = mode === "share" ? acc / total : acc;
        const yTop = y(base + val);
        const yBot = y(base);
        const h = Math.max(0, yBot - yTop - gap);
        if (h > 0.4) {
          g.append("rect")
            .attr("x", x(row.year) - barW / 2)
            .attr("y", yTop)
            .attr("width", barW)
            .attr("height", h)
            .attr("rx", Math.min(2, h / 2))
            .attr("fill", cfg.color(k));
        }
        acc += v;
      }
      g.append("rect")
        .attr("x", x(row.year) - Math.max(barW / 2, slot / 2))
        .attr("y", m.top)
        .attr("width", Math.max(barW, slot))
        .attr("height", ih)
        .attr("fill", "transparent")
        .on("pointermove", (event) => {
          g.selectAll("rect").filter(function () { return this.getAttribute("fill") !== "transparent"; })
            .classed("hover-lift", true);
          const rows = cfg.keys
            .filter((k) => (row.values[k] || 0) > 0)
            .map((k) => ({
              label: cfg.label(k),
              color: cfg.color(k),
              value: mode === "share"
                ? `${d3.format(".0%")(row.values[k] / total)} (${row.values[k]})`
                : String(row.values[k]),
            }));
          rows.push({ label: "Total", value: String(total) });
          showTooltip(event, tooltipContent(String(row.year), rows));
          moveTooltip(event);
        })
        .on("pointerleave", () => {
          g.selectAll("rect").classed("hover-lift", false);
          hideTooltip();
        });
    }
  });
}

/**
 * Change-point posterior density strip: P(change point = year) as thin
 * columns under the main chart, one series per change point.
 */
export function densityStrip(container, cfg) {
  const height = cfg.height || 110;
  return mountResponsive(container, (width) => {
    const m = margins({ left: 44, top: 8, bottom: 26 });
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const svg = makeSvg(container, width, height, cfg.ariaLabel);
    svg.attr("class", "cp-strip");

    const slot = iw / (cfg.xDomain[1] - cfg.xDomain[0] + 1);
    const x = d3.scaleLinear().domain(cfg.xDomain)
      .range([m.left + slot / 2, m.left + iw - slot / 2]);
    const yMax = d3.max(cfg.series.flatMap((s) => s.density.map((d) => d.prob)));
    const y = d3.scaleLinear().domain([0, yMax * 1.05]).range([m.top + ih, m.top]);
    const barW = Math.min(12, Math.max(2, slot - 2));

    drawYAxis(svg, y, m.left, m.left + iw, { ticks: 2, fmt: d3.format(".0%") });
    drawXAxisYears(svg, x, m.top + ih, { every: iw < 560 ? 20 : 10 });

    for (const s of cfg.series) {
      const g = svg.append("g");
      for (const d of s.density) {
        if (d.prob < 0.001) continue;
        g.append("rect")
          .attr("x", x(d.year) - barW / 2)
          .attr("y", y(d.prob))
          .attr("width", barW)
          .attr("height", y(0) - y(d.prob))
          .attr("rx", 2)
          .attr("fill", s.color)
          .on("pointermove", (event) => {
            showTooltip(event, tooltipContent(`${s.label}`, [
              { label: `P(change at ${d.year})`, value: d3.format(".1%")(d.prob), color: s.color },
            ]));
            moveTooltip(event);
          })
          .on("pointerleave", hideTooltip);
      }
      const mode = s.density.reduce((a, b) => (b.prob > a.prob ? b : a));
      svg.append("text").attr("class", "direct-label")
        .attr("x", x(mode.year)).attr("y", y(mode.prob) - 5)
        .attr("text-anchor", "middle")
        .text(`${s.label}: ${mode.year}`);
    }
  });
}

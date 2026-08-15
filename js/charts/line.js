/**
 * Line chart over years: multi-series, optional HDI bands, regime shading,
 * event markers, crosshair tooltip listing every series at the snapped year.
 */
import { d3 } from "../vendor.js";
import { mountResponsive, makeSvg, drawYAxis, drawXAxisYears, drawRegimeBands, REGIME_WASHES, margins } from "./base.js";
import { showTooltip, moveTooltip, hideTooltip, tooltipContent } from "./tooltip.js";

/**
 * @param {HTMLElement} container
 * @param {{
 *   series: Array<{key:string,label:string,color:string,values:Array<{x:number,y:number,lo?:number,hi?:number}>,dots?:Array<{x:number,y:number}>}>,
 *   height?: number, yMax?: number, yFmt?: (v:number)=>string,
 *   yTitle?: string, regimes?: Array<{span:[number,number],label:string}>,
 *   markers?: Array<{x:number,label:string}>, ariaLabel: string,
 *   tooltipFmt?: (v:number)=>string, endLabels?: boolean
 * }} cfg
 */
export function lineChart(container, cfg) {
  const height = cfg.height || 320;

  return mountResponsive(container, (width) => {
    const m = margins({ left: 48 });
    const iw = width - m.left - m.right;
    const ih = height - m.top - m.bottom;
    const svg = makeSvg(container, width, height, cfg.ariaLabel);

    const allX = cfg.series.flatMap((s) => s.values.map((v) => v.x));
    const x = d3.scaleLinear().domain(d3.extent(allX)).range([m.left, m.left + iw]);
    const yMax = cfg.yMax ?? d3.max(cfg.series.flatMap((s) => s.values.map((v) => v.hi ?? v.y)));
    const y = d3.scaleLinear().domain([0, yMax * 1.06]).nice()
      .range([m.top + ih, m.top]);

    if (cfg.regimes) drawRegimeBands(svg, x, m.top, m.top + ih, cfg.regimes, REGIME_WASHES);
    drawYAxis(svg, y, m.left, m.left + iw, { fmt: cfg.yFmt || d3.format(","), title: cfg.yTitle });
    drawXAxisYears(svg, x, m.top + ih, { every: iw < 560 ? 20 : 10 });

    for (const mk of cfg.markers || []) {
      svg.append("line").attr("class", "annot-line")
        .attr("x1", x(mk.x)).attr("x2", x(mk.x))
        .attr("y1", m.top + 2).attr("y2", m.top + ih);
      svg.append("text").attr("class", "annot")
        .attr("x", x(mk.x)).attr("y", m.top - 4)
        .attr("text-anchor", "middle")
        .text(mk.label);
    }

    const lineGen = d3.line()
      .x((d) => x(d.x)).y((d) => y(d.y))
      .curve(d3.curveMonotoneX);
    const areaGen = d3.area()
      .x((d) => x(d.x)).y0((d) => y(d.lo)).y1((d) => y(d.hi))
      .curve(d3.curveMonotoneX);

    for (const s of cfg.series) {
      if (s.values.some((v) => v.lo != null)) {
        svg.append("path")
          .attr("d", areaGen(s.values.filter((v) => v.lo != null)))
          .attr("fill", s.color).attr("opacity", 0.1);
      }
      svg.append("path")
        .attr("d", lineGen(s.values))
        .attr("fill", "none")
        .attr("stroke", s.color)
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round");
      for (const d of s.dots || []) {
        svg.append("circle")
          .attr("cx", x(d.x)).attr("cy", y(d.y)).attr("r", 3)
          .attr("fill", s.color).attr("stroke", "#fff").attr("stroke-width", 2);
      }
      const last = s.values[s.values.length - 1];
      svg.append("circle")
        .attr("cx", x(last.x)).attr("cy", y(last.y)).attr("r", 4)
        .attr("fill", s.color).attr("stroke", "#fff").attr("stroke-width", 2);
      if (cfg.endLabels && cfg.series.length <= 4) {
        svg.append("text").attr("class", "direct-label")
          .attr("x", x(last.x) + 7).attr("y", y(last.y))
          .attr("dy", "0.32em")
          .text(s.label);
      }
    }

    // crosshair + unified tooltip
    const cross = svg.append("line").attr("class", "crosshair")
      .attr("y1", m.top).attr("y2", m.top + ih).attr("opacity", 0);
    const xsSorted = [...new Set(allX)].sort((a, b) => a - b);

    svg.append("rect")
      .attr("x", m.left).attr("y", m.top)
      .attr("width", iw).attr("height", ih)
      .attr("fill", "transparent")
      .on("pointermove", (event) => {
        const [px] = d3.pointer(event);
        const year = xsSorted.reduce((best, v) =>
          Math.abs(x(v) - px) < Math.abs(x(best) - px) ? v : best, xsSorted[0]);
        cross.attr("x1", x(year)).attr("x2", x(year)).attr("opacity", 1);
        const fmt = cfg.tooltipFmt || cfg.yFmt || d3.format(",");
        const rows = cfg.series.map((s) => {
          const v = s.values.find((d) => d.x === year);
          return {
            label: s.label,
            color: s.color,
            value: v ? fmt(v.y) + (v.lo != null ? ` [${fmt(v.lo)}–${fmt(v.hi)}]` : "") : "—",
          };
        });
        showTooltip(event, tooltipContent(String(year), rows));
        moveTooltip(event);
      })
      .on("pointerleave", () => {
        cross.attr("opacity", 0);
        hideTooltip();
      });
  });
}

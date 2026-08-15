/**
 * Shared chart scaffolding: responsive mounting, hairline axes, regime bands.
 */
import { d3 } from "../vendor.js";

/**
 * Renders a chart into `container` and re-renders on container resize.
 * `render(width)` must rebuild the chart from scratch.
 */
export function mountResponsive(container, render) {
  let raf = 0;
  let lastW = 0;
  const run = () => {
    const w = Math.max(280, Math.floor(container.clientWidth || 0));
    if (!w || w === lastW) return;
    lastW = w;
    render(w);
  };
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  });
  ro.observe(container);
  run();
  return () => ro.disconnect();
}

export function makeSvg(container, width, height, label) {
  container.replaceChildren();
  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("width", width)
    .attr("height", height)
    .attr("role", "img");
  if (label) svg.attr("aria-label", label);
  container.appendChild(svg.node());
  return svg;
}

/** Horizontal hairline gridlines + y tick labels (clean numbers). */
export function drawYAxis(svg, y, x0, x1, { ticks = 5, fmt = d3.format(","), title = "" } = {}) {
  const g = svg.append("g");
  const tickVals = y.ticks(ticks);
  g.selectAll("line").data(tickVals).join("line")
    .attr("class", "grid-line")
    .attr("x1", x0).attr("x2", x1)
    .attr("y1", (d) => y(d)).attr("y2", (d) => y(d));
  g.selectAll("text").data(tickVals).join("text")
    .attr("class", "tick-label")
    .attr("x", x0 - 8).attr("y", (d) => y(d))
    .attr("dy", "0.32em").attr("text-anchor", "end")
    .text(fmt);
  if (title) {
    svg.append("text").attr("class", "axis-title")
      .attr("x", x0 - 8).attr("y", y.range()[1] - 8)
      .attr("text-anchor", "end")
      .text(title);
  }
  return g;
}

/** Bottom axis line + year labels for a continuous year scale. */
export function drawXAxisYears(svg, x, yBase, { every = 10 } = {}) {
  const [d0, d1] = x.domain();
  const years = d3.range(Math.ceil(d0 / every) * every, d1 + 1, every);
  svg.append("line")
    .attr("class", "axis-line")
    .attr("x1", x.range()[0]).attr("x2", x.range()[1])
    .attr("y1", yBase).attr("y2", yBase);
  svg.append("g").selectAll("text").data(years).join("text")
    .attr("class", "tick-label")
    .attr("x", (d) => x(d)).attr("y", yBase + 16)
    .attr("text-anchor", "middle")
    .text((d) => d);
}

/**
 * Light washes marking analysis regimes behind a time chart.
 * @param {Array<{span: [number, number], label: string}>} regimes
 */
export function drawRegimeBands(svg, x, y0, y1, regimes, colors, { labelsAbove = false } = {}) {
  const g = svg.append("g").attr("aria-hidden", "true");
  const [r0, r1] = x.range();
  const clamp = (v) => Math.max(r0, Math.min(r1, v));
  regimes.forEach((r, i) => {
    const a = clamp(x(Math.max(r.span[0], x.domain()[0]) - 0.5));
    const b = clamp(x(Math.min(r.span[1], x.domain()[1]) + 0.5));
    g.append("rect")
      .attr("class", "regime-band")
      .attr("x", a).attr("y", y0)
      .attr("width", Math.max(0, b - a)).attr("height", y1 - y0)
      .attr("fill", colors[i % colors.length]);
    g.append("text")
      .attr("class", "regime-label")
      .attr("x", a + (labelsAbove ? 2 : 8))
      .attr("y", labelsAbove ? y0 - 6 : y0 + 14)
      .text(r.label);
  });
  return g;
}

export const REGIME_WASHES = ["#f5f2ec", "#eef2f7", "#f7eef2"];

/** Standard margins; left grows with the widest y label. */
export function margins(overrides = {}) {
  return { top: 18, right: 24, bottom: 34, left: 46, ...overrides };
}

/**
 * Legend row. Identity never rides on color alone: every key pairs the
 * swatch with its text label.
 * @param {Array<{label:string, color:string, line?:boolean}>} items
 */
export function buildLegend(items) {
  const ul = document.createElement("ul");
  ul.className = "chart-legend";
  for (const it of items) {
    const li = document.createElement("li");
    li.className = "key";
    const sw = document.createElement("span");
    sw.className = "swatch" + (it.line ? " line" : "");
    sw.style.background = it.color;
    li.appendChild(sw);
    li.appendChild(document.createTextNode(it.label));
    ul.appendChild(li);
  }
  return ul;
}

/**
 * Collapsible table twin of a chart, so every plotted value is reachable
 * without hover or color.
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 */
export function dataTableTwin(headers, rows, summary = "View as data table") {
  const details = document.createElement("details");
  details.className = "data-table";
  const sum = document.createElement("summary");
  sum.textContent = summary;
  details.appendChild(sum);
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";
  const table = document.createElement("table");
  table.className = "data";
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  for (const h of headers) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = h;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    r.forEach((cell, i) => {
      const td = document.createElement("td");
      if (i > 0) td.className = "num";
      td.textContent = String(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  details.appendChild(wrap);
  return details;
}

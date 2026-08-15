/**
 * World choropleth of import-normalised recall rates, log color scale on a
 * single-hue ramp. Values are joined by the basemap feature name prepared
 * in tools/build_data.py.
 */
import { d3, topojson } from "../vendor.js";
import { mountResponsive, makeSvg } from "./base.js";
import { showTooltip, moveTooltip, hideTooltip, tooltipContent } from "./tooltip.js";
import { BLUE_RAMP, fmtNum, fmtInt } from "../format.js";

/**
 * @param {HTMLElement} container
 * @param {{
 *   world: object, byMapName: Map<string, object>,
 *   value: (c:object)=>number, domain: [number, number],
 *   tooltipRows: (c:object)=>Array<{label:string,value:string}>,
 *   onSelect?: (c:object|null)=>void, ariaLabel: string,
 * }} cfg
 * @returns {{ destroy: () => void, highlight: (mapName:string|null)=>void }}
 */
export function choropleth(container, cfg) {
  const countries = topojson.feature(cfg.world, cfg.world.objects.countries);
  const colorOf = logColor(cfg.domain);
  let currentSvg = null;

  const destroy = mountResponsive(container, (width) => {
    const height = Math.round(width * 0.52);
    const svg = makeSvg(container, width, height, cfg.ariaLabel);
    currentSvg = svg;

    const projection = d3.geoNaturalEarth1();
    projection.fitSize([width, height], countries);
    const path = d3.geoPath(projection);

    svg.append("g")
      .selectAll("path")
      .data(countries.features)
      .join("path")
      .attr("d", path)
      .attr("class", (f) => {
        const c = cfg.byMapName.get(f.properties.name);
        return "country" + (c ? "" : " no-data");
      })
      .attr("data-name", (f) => f.properties.name)
      .attr("fill", (f) => {
        const c = cfg.byMapName.get(f.properties.name);
        return c ? colorOf(cfg.value(c)) : undefined;
      })
      .on("pointermove", (event, f) => {
        const c = cfg.byMapName.get(f.properties.name);
        if (!c) {
          showTooltip(event, tooltipContent(f.properties.name, [
            { label: "Not in the modelled panel", value: "" },
          ]));
        } else {
          showTooltip(event, tooltipContent(c.country, cfg.tooltipRows(c)));
        }
        moveTooltip(event);
      })
      .on("pointerleave", hideTooltip)
      .on("click", (event, f) => {
        const c = cfg.byMapName.get(f.properties.name) || null;
        if (cfg.onSelect) cfg.onSelect(c);
      });
  });

  return {
    destroy,
    highlight(mapName) {
      if (!currentSvg) return;
      currentSvg.selectAll(".country")
        .classed("active", function () {
          return mapName != null && this.getAttribute("data-name") === mapName;
        });
    },
  };
}

/** Log-scale single-hue color function over the blue ramp. */
export function logColor([lo, hi]) {
  const scale = d3.scaleLog().domain([Math.max(lo, 1e-3), hi]).range([0, 1]).clamp(true);
  const interp = d3.piecewise(d3.interpolateLab, BLUE_RAMP);
  return (v) => interp(scale(Math.max(v, 1e-3)));
}

/** Gradient legend for the log scale. */
export function mapLegend(container, [lo, hi], title) {
  container.replaceChildren();
  const wrap = document.createElement("div");
  wrap.className = "map-legend";

  const label = document.createElement("span");
  label.textContent = title;
  wrap.appendChild(label);

  const ramp = document.createElement("div");
  ramp.className = "ramp";
  ramp.style.background = `linear-gradient(90deg, ${BLUE_RAMP.join(",")})`;
  wrap.appendChild(ramp);

  const ticksWrap = document.createElement("span");
  const ticks = [lo, Math.sqrt(lo * hi), hi];
  ticksWrap.textContent = ticks.map((t) => (t >= 10 ? fmtInt(Math.round(t)) : fmtNum(t, t >= 1 ? 1 : 2))).join(" · ");
  ticksWrap.title = "log scale";
  wrap.appendChild(ticksWrap);

  const scaleNote = document.createElement("span");
  scaleNote.textContent = "(log scale)";
  wrap.appendChild(scaleNote);

  const nd = document.createElement("span");
  nd.className = "no-data-key";
  const sw = document.createElement("span");
  sw.className = "no-data-swatch";
  nd.append(sw, document.createTextNode("outside modelled panel"));
  wrap.appendChild(nd);

  container.appendChild(wrap);
}

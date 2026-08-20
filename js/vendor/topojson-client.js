/*! topojson-client v3 - vendored subset (feature/mesh decoding).
 *  Copyright 2012-2019 Michael Bostock. ISC License.
 *  https://github.com/topojson/topojson-client
 *  Only the decoding path this application needs is included, so the site
 *  carries no third-party runtime dependency. */

function identity(x) {
  return x;
}

/**
 * Build the point transform for a quantised topology. The returned function is
 * stateful by design: delta-encoded arcs accumulate, and the accumulator resets
 * whenever it is called with index 0, i.e. at the start of every arc.
 */
function transformer(topology) {
  if (topology == null) return identity;
  let x0, y0;
  const kx = topology.scale[0];
  const ky = topology.scale[1];
  const dx = topology.translate[0];
  const dy = topology.translate[1];
  return function (input, i) {
    if (!i) x0 = y0 = 0;
    const n = input.length;
    const output = new Array(n);
    output[0] = (x0 += input[0]) * kx + dx;
    output[1] = (y0 += input[1]) * ky + dy;
    for (let j = 2; j < n; ++j) output[j] = input[j];
    return output;
  };
}

function reverse(array, n) {
  let j = array.length;
  let i = j - n;
  let t;
  while (i < --j) {
    t = array[i];
    array[i++] = array[j];
    array[j] = t;
  }
}

function object(topology, o) {
  const transformPoint = transformer(topology.transform);
  const arcs = topology.arcs;

  function arc(i, points) {
    if (points.length) points.pop();
    const a = arcs[i < 0 ? ~i : i];
    const n = a.length;
    for (let k = 0; k < n; ++k) points.push(transformPoint(a[k], k));
    if (i < 0) reverse(points, n);
  }

  function point(p) {
    return transformPoint(p);
  }

  function line(arcIndexes) {
    const points = [];
    for (let i = 0, n = arcIndexes.length; i < n; ++i) arc(arcIndexes[i], points);
    if (points.length < 2) points.push(points[0]);
    return points;
  }

  function ring(arcIndexes) {
    const points = line(arcIndexes);
    while (points.length < 4) points.push(points[0]);
    return points;
  }

  function polygon(arcIndexes) {
    return arcIndexes.map(ring);
  }

  function geometry(g) {
    const type = g.type;
    let coordinates;
    switch (type) {
      case "GeometryCollection":
        return { type, geometries: g.geometries.map(geometry) };
      case "Point":
        coordinates = point(g.coordinates);
        break;
      case "MultiPoint":
        coordinates = g.coordinates.map(point);
        break;
      case "LineString":
        coordinates = line(g.arcs);
        break;
      case "MultiLineString":
        coordinates = g.arcs.map(line);
        break;
      case "Polygon":
        coordinates = polygon(g.arcs);
        break;
      case "MultiPolygon":
        coordinates = g.arcs.map(polygon);
        break;
      default:
        return null;
    }
    return { type, coordinates };
  }

  return geometry(o);
}

function singleFeature(topology, o) {
  const id = o.id;
  const bbox = o.bbox;
  const properties = o.properties == null ? {} : o.properties;
  const geometry = object(topology, o);
  if (id == null && bbox == null) return { type: "Feature", properties, geometry };
  if (bbox == null) return { type: "Feature", id, properties, geometry };
  return { type: "Feature", id, bbox, properties, geometry };
}

/**
 * Convert a TopoJSON object into GeoJSON.
 * @param {object} topology a TopoJSON topology
 * @param {object|string} o an object of that topology, or its key
 */
export function feature(topology, o) {
  if (typeof o === "string") o = topology.objects[o];
  return o.type === "GeometryCollection"
    ? { type: "FeatureCollection", features: o.geometries.map((g) => singleFeature(topology, g)) }
    : singleFeature(topology, o);
}

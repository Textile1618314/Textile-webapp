/**
 * Third-party libraries. Both are vendored under js/vendor/ and served from
 * this origin: the site has no CDN or other runtime network dependency, so it
 * renders identically on a corporate network, behind a proxy, or offline.
 *
 *   js/vendor/d3.js               d3 7.9.0, ISC — subset actually used here
 *   js/vendor/topojson-client.js  topojson-client 3, ISC — feature() decoding
 */
export * as d3 from "./vendor/d3.js";
export * as topojson from "./vendor/topojson-client.js";

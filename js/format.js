/**
 * Shared formatting helpers and the paper's fixed palette.
 * The hazard -> color mapping is constant across every view.
 */

export const PALETTE = {
  blue: "#2464c7",
  pink: "#b8155a",
  amber: "#c07400",
  purple: "#6838be",
  green: "#12854b",
  red: "#992525",
  teal: "#0c93a3",
  gray: "#57606a",
  grayLight: "#7a8290",
  ink: "#111114",
  ink2: "#52525b",
  ink3: "#82828c",
  hairline: "#e7e7e2",
  wash: "#f1f1ee",
};

/** Fixed hazard identity: key -> label + color. */
export const HAZARDS = {
  flammability_burn: { label: "Flammability / burn", short: "Flammability", color: PALETTE.pink },
  choking_small_parts: { label: "Choking / small parts", short: "Choking", color: PALETTE.blue },
  drawstring_strangulation: { label: "Drawstring strangulation", short: "Drawstring", color: PALETTE.amber },
  chemical: { label: "Chemical / toxic", short: "Chemical", color: PALETTE.purple },
  fall_slip: { label: "Fall / slip", short: "Fall", color: PALETTE.green },
  laceration_puncture: { label: "Laceration / puncture", short: "Laceration", color: PALETTE.red },
  entrapment_entanglement: { label: "Entrapment / entanglement", short: "Entrapment", color: PALETTE.teal },
  protective_failure: { label: "Protective failure", short: "Protective", color: PALETTE.gray },
  other: { label: "Other", short: "Other", color: PALETTE.grayLight },
};

/**
 * Stacking order for composition charts. This ordering was chosen so
 * adjacent hues stay separable under color-vision deficiency (validated:
 * worst adjacent pair deltaE 16.5 CVD / 21.4 normal). protective_failure
 * and other fold into one gray band in stacked charts.
 */
export const HAZARD_STACK_ORDER = [
  "flammability_burn", "chemical", "fall_slip", "choking_small_parts",
  "laceration_puncture", "entrapment_entanglement", "drawstring_strangulation",
  "other_protective",
];

export const OTHER_PROTECTIVE = {
  key: "other_protective",
  label: "Other / protective",
  color: PALETTE.gray,
  members: ["protective_failure", "other"],
};

export function hazardColor(key) {
  if (key === "other_protective") return OTHER_PROTECTIVE.color;
  return HAZARDS[key] ? HAZARDS[key].color : PALETTE.grayLight;
}

export function hazardLabel(key, short = false) {
  if (key === "other_protective") return OTHER_PROTECTIVE.label;
  const h = HAZARDS[key];
  return h ? (short ? h.short : h.label) : key;
}

export const CHANNELS = {
  online_only: "Online only",
  store_only: "Store only",
  mixed: "Store + online",
  unknown: "Unknown",
};

export const ARCHETYPES = {
  pajama_set: "Pajama set",
  nightgown: "Nightgown",
  sleepwear_generic: "Sleepwear (generic)",
  robe: "Robe",
  loungewear: "Loungewear",
  wearable_blanket: "Wearable blanket",
  daywear: "Daywear",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessory: "Accessory",
  swimwear: "Swimwear",
  costume: "Costume",
  home_textile: "Home textile",
  unclassified: "Unclassified",
};

export const BOUNDARY_CLASSES = {
  exemption_eligible: "Sleepwear: tight-fitting exemption possible",
  exemption_ineligible: "Sleepwear: exemption not available",
  not_sleepwear: "Not sleepwear",
};

/** Sequential single-hue ramp (paper blue), light to dark. */
export const BLUE_RAMP = [
  "#e8f0fb", "#cfdff6", "#b0cbf0", "#8db2e8", "#659adf",
  "#417fd4", "#2464c7", "#1b4fa3", "#123a7c", "#0b2a5c",
];

const nfInt = new Intl.NumberFormat("en-US");
const nfCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function fmtInt(x) {
  return x == null ? "-" : nfInt.format(x);
}

export function fmtCompact(x) {
  return x == null ? "-" : nfCompact.format(x);
}

export function fmtUSD(x) {
  if (x == null) return "-";
  return "$" + (x >= 100 ? nfInt.format(Math.round(x)) : x.toFixed(2));
}

export function fmtPct(x, digits = 0) {
  return x == null ? "-" : (100 * x).toFixed(digits) + "%";
}

export function fmtNum(x, digits = 2) {
  return x == null ? "-" : Number(x).toFixed(digits);
}

export function fmtDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function yesNo(b) {
  return b ? "Yes" : "No";
}

/** Escape a string for safe use inside an HTML template. */
export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

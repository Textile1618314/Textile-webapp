#!/usr/bin/env python3
"""Build the data/ JSON files for the recall companion app.

Reads the analysis results of the paper "From harm to compliance: five
decades of apparel and home textile recalls in the United States" and
writes the static JSON payloads the app fetches at runtime.

Usage:
    python3 tools/build_data.py [--proj /tmp/proj] [--out data]

The world basemap is copied from the project topojson if present,
otherwise it is built from a Natural Earth 110m admin-0 GeoJSON
(--ne-geojson). Countries that cannot be matched to the basemap are
reported and flagged on_map=false so the ranking panel still lists them.
"""

import argparse
import csv
import json
import math
import sys
from datetime import date
from pathlib import Path

Q = 100000  # topojson quantization grid


# ---------------------------------------------------------------- helpers

def fnum(v):
    """Parse a possibly-empty numeric string to float or None."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def fint(v):
    x = fnum(v)
    return int(round(x)) if x is not None else None


def fbool(v):
    return str(v).strip().lower() == "true"


def round_or_none(x, nd):
    return None if x is None else round(x, nd)


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj, compact=True):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
        else:
            json.dump(obj, f, indent=1, ensure_ascii=False, allow_nan=False)
    print(f"  wrote {path}  ({path.stat().st_size:,} bytes)")


# ---------------------------------------------------------------- recalls

RECALL_FIELDS = [
    "recall_id", "recall_number", "date", "year", "title", "hazard_category",
    "segment", "is_childrens", "is_violation", "injuries_reported", "units",
    "price_usd", "sales_channel", "countries", "primary_country",
    "remedy_options", "archetype", "boundary_class", "sleepwear_standard", "url",
]


def build_recalls(proj, out):
    rows = read_csv(proj / "02_analysis/09_dataset_hardening/results/apparel_recalls_v2.csv")
    records = []
    for r in rows:
        records.append({
            "recall_id": fint(r["recall_id"]),
            "recall_number": r["recall_number"],
            "date": r["recall_date"],
            "year": fint(r["year"]),
            "title": r["title"],
            "hazard_category": r["hazard_category"],
            "segment": r["segment"],
            "is_childrens": fbool(r["is_childrens"]),
            "is_violation": fbool(r["is_violation"]),
            "injuries_reported": fbool(r["injuries_reported"]),
            "units": fint(r["units"]),
            "price_usd": fnum(r["price_usd"]),
            "sales_channel": r["sales_channel"],
            "countries": [c for c in r["countries"].split(";") if c],
            "primary_country": r["primary_country"] or None,
            "remedy_options": [x for x in r["remedy_options"].split(";") if x],
            "archetype": r["archetype"],
            "boundary_class": r["boundary_class"] or None,
            "sleepwear_standard": fbool(r["sleepwear_standard"]),
            "url": r["url"],
        })
    records.sort(key=lambda x: (x["date"], x["recall_id"]))
    write_json(out / "recalls.json", {"n": len(records), "fields": RECALL_FIELDS,
                                      "records": records})
    return rows, records


# ---------------------------------------------------------------- world map

# analysis country name -> Natural Earth 110m NAME
NAME_TO_MAP = {
    "Burma (Myanmar)": "Myanmar",
    "Czech Republic": "Czechia",
    "Dominican Republic": "Dominican Rep.",
    "United States": "United States of America",
}

DROP_FEATURES = {"Antarctica", "Fr. S. Antarctic Lands"}  # not relevant to sourcing


def quantize_topology(features):
    """Encode a GeoJSON feature list as a quantized TopoJSON topology.

    Arcs are per-ring (no shared-border deduplication, which only affects
    file size, not rendering with topojson-client).
    """
    xs, ys = [], []

    def walk(coords, depth):
        if depth == 0:
            xs.append(coords[0]); ys.append(coords[1])
        else:
            for c in coords:
                walk(c, depth - 1)

    depth_of = {"Polygon": 2, "MultiPolygon": 3}
    for f in features:
        walk(f["geometry"]["coordinates"], depth_of[f["geometry"]["type"]] + 0)

    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    kx = (x1 - x0) / (Q - 1) if x1 > x0 else 1.0
    ky = (y1 - y0) / (Q - 1) if y1 > y0 else 1.0

    arcs = []

    def encode_ring(ring):
        pts = []
        for x, y in ring:
            qx = round((x - x0) / kx)
            qy = round((y - y0) / ky)
            if not pts or pts[-1] != [qx, qy]:
                pts.append([qx, qy])
        if len(pts) and pts[0] != pts[-1]:
            pts.append(list(pts[0]))
        if len(pts) < 4:
            return None
        arc = [pts[0][:]]
        px, py = pts[0]
        for qx, qy in pts[1:]:
            arc.append([qx - px, qy - py])
            px, py = qx, qy
        arcs.append(arc)
        return len(arcs) - 1

    geometries = []
    for f in features:
        g = f["geometry"]
        props = f["properties"]
        gid = props.get("ISO_N3")
        name = props.get("NAME")
        if g["type"] == "Polygon":
            ring_idx = [encode_ring(r) for r in g["coordinates"]]
            ring_idx = [[i] for i in ring_idx if i is not None]
            if not ring_idx:
                continue
            geometries.append({"type": "Polygon", "arcs": ring_idx,
                               "id": gid, "properties": {"name": name}})
        elif g["type"] == "MultiPolygon":
            polys = []
            for poly in g["coordinates"]:
                ring_idx = [encode_ring(r) for r in poly]
                ring_idx = [[i] for i in ring_idx if i is not None]
                if ring_idx:
                    polys.append(ring_idx)
            if not polys:
                continue
            geometries.append({"type": "MultiPolygon", "arcs": polys,
                               "id": gid, "properties": {"name": name}})

    return {
        "type": "Topology",
        "transform": {"scale": [kx, ky], "translate": [x0, y0]},
        "objects": {"countries": {"type": "GeometryCollection",
                                  "geometries": geometries}},
        "arcs": arcs,
    }


def build_world(proj, out, ne_geojson):
    provided = proj / "01_data/topojson/world_110m.json"
    if provided.exists():
        topo = read_json(provided)
        write_json(out / "world_110m.json", topo)
    else:
        print(f"  note: {provided} not found; building from {ne_geojson}")
        gj = read_json(ne_geojson)
        feats = [f for f in gj["features"]
                 if f["properties"].get("NAME") not in DROP_FEATURES]
        topo = quantize_topology(feats)
        write_json(out / "world_110m.json", topo)
    names = {g["properties"]["name"]
             for g in topo["objects"]["countries"]["geometries"]}
    return names


# ---------------------------------------------------------------- country rates

def build_country_rates(proj, out, map_names):
    rows = read_csv(proj / "02_analysis/14_bayes_hierarchical_rate/results/country_rates.csv")
    summ = read_json(proj / "02_analysis/14_bayes_hierarchical_rate/results/bayes_rate_summary.json")
    unmatched = []
    countries = []
    for r in rows:
        name = r["country"]
        map_name = NAME_TO_MAP.get(name, name)
        on_map = map_name in map_names
        if not on_map:
            unmatched.append(name)
            map_name = None
        countries.append({
            "country": name,
            "map_name": map_name,
            "on_map": on_map,
            "recalls": fint(r["recalls"]),
            "bn_sme": round_or_none(fnum(r["bn_sme"]), 4),
            "raw_rate": round_or_none(fnum(r["raw_rate"]), 4),
            "rate_mean": round_or_none(fnum(r["post_rate_mean"]), 4),
            "rate_median": round_or_none(fnum(r["post_rate_median"]), 4),
            "hdi_lo": round_or_none(fnum(r["hdi_lo"]), 4),
            "hdi_hi": round_or_none(fnum(r["hdi_hi"]), 4),
            "rr_median": round_or_none(fnum(r["rr_vs_reference_median"]), 3),
            "rr_lo": round_or_none(fnum(r["rr_hdi_lo"]), 3),
            "rr_hi": round_or_none(fnum(r["rr_hdi_hi"]), 3),
            "p_below_mean": round_or_none(fnum(r["p_rate_below_reference"]), 4),
        })
    if unmatched:
        print(f"  note: not on the 110m basemap (listed in ranking only): {', '.join(unmatched)}")
    panel = summ.get("panel", {})
    write_json(out / "country_rates.json", {
        "reference": "posterior grand mean",
        "hdi_prob": 0.94,
        "window": panel.get("years", [1990, 2025]),
        "n_countries": len(countries),
        "n_recalls_modelled": panel.get("n_recalls_modelled"),
        "total_bn_sme": round_or_none(panel.get("total_bn_sme"), 2),
        "pooled_rate": round_or_none(panel.get("pooled_rate_per_bn_sme"), 4),
        "exposure": "OTEXA total apparel imports, billions of square-metre equivalents (SME)",
        "note": ("Posterior recall rates per billion SME from a hierarchical "
                 "negative-binomial model with partial pooling; US-origin rows "
                 "and countries under 0.5 bn SME cumulative imports excluded."),
        "unmatched": unmatched,
        "countries": countries,
    })


# ---------------------------------------------------------------- regimes

def build_regimes(proj, out):
    res = proj / "02_analysis/15_bayes_changepoint/results"
    post = read_csv(res / "changepoint_posterior.csv")
    comp = read_csv(res / "regime_composition.csv")
    matrix = read_csv(res / "hazard_year_matrix.csv")
    summ = read_json(res / "changepoint_summary.json")

    hazards = summ["series"]["hazard"]["categories"]

    cp = {"1": [], "2": []}
    for r in post:
        if r["series"] == "hazard" and r["is_best_K"] == "True":
            cp[r["cp"]].append({"year": fint(r["year"]),
                                "prob": round(fnum(r["prob"]), 5)})
    for k in cp:
        cp[k].sort(key=lambda d: d["year"])

    def mode_year(dens):
        return max(dens, key=lambda d: d["prob"])["year"]

    cp1, cp2 = mode_year(cp["1"]), mode_year(cp["2"])

    regimes = []
    labels = {1: f"1974–{cp1 - 1}", 2: f"{cp1}–{cp2 - 1}", 3: f"{cp2}–2026"}
    spans = {1: [1974, cp1 - 1], 2: [cp1, cp2 - 1], 3: [cp2, 2026]}
    for k in (1, 2, 3):
        rows = [r for r in comp
                if r["series"] == "hazard" and r["is_best_K"] == "True"
                and fint(r["regime"]) == k and r["category"] in hazards]
        regimes.append({
            "regime": k,
            "label": labels[k],
            "span": spans[k],
            "composition": [{
                "hazard": r["category"],
                "mean": round(fnum(r["mean"]), 4),
                "hdi_lo": round(fnum(r["hdi_lo"]), 4),
                "hdi_hi": round(fnum(r["hdi_hi"]), 4),
            } for r in rows],
        })

    by_year = {fint(r["year"]): r for r in matrix}
    lo = min(by_year)
    hi = max(by_year)
    years = []
    for yr in range(lo, hi + 1):
        r = by_year.get(yr)
        years.append({
            "year": yr,
            "n": fint(r["n"]) if r else 0,
            "counts": {h: (fint(r[h]) if r else 0) for h in hazards},
        })

    write_json(out / "regimes.json", {
        "hazards": hazards,
        "best_K": 2,
        "changepoints": {
            "cp1": {"mode": cp1, "density": cp["1"]},
            "cp2": {"mode": cp2, "density": cp["2"]},
        },
        "regimes": regimes,
        "years": years,
        "note": ("Dirichlet-multinomial change-point model over annual hazard "
                 "composition, 1974–2026; K = 2 change points preferred by LOO."),
    })
    return cp1, cp2


# ---------------------------------------------------------------- detection

def build_detection(proj, out):
    res = proj / "02_analysis/11_violation_vs_incident/results"
    post = read_csv(res / "posterior_by_year.csv")
    annual = read_csv(res / "annual_classification.csv")
    summ = read_json(res / "posterior_summary.json")

    series = {"violation": [], "injury": []}
    for r in post:
        series[r["series"]].append({
            "year": fint(r["year"]),
            "mean": round(fnum(r["posterior_mean"]), 4),
            "hdi_lo": round(fnum(r["hdi_lo"]), 4),
            "hdi_hi": round(fnum(r["hdi_hi"]), 4),
            "observed": round(fnum(r["observed"]), 4),
            "n": fint(r["n"]),
        })
    for k in series:
        series[k].sort(key=lambda d: d["year"])

    p_exceeds = {int(k): round(v, 4) for k, v in
                 summ["posterior_prob_violation_exceeds_injury_by_year"].items()}

    write_json(out / "detection.json", {
        "crossing_year": summ["crossing_year"],
        "hdi_prob": summ["hdi_prob"],
        "series": series,
        "p_violation_exceeds_injury": p_exceeds,
        "annual": [{
            "year": fint(r["year"]), "n": fint(r["n"]),
            "violation_only": fint(r["violation_only"]),
            "both": fint(r["both"]),
            "injury_only": fint(r["injury_only"]),
            "neither": fint(r["neither"]),
            "share_violation": round(fnum(r["share_violation"]), 4),
            "share_injury": round(fnum(r["share_injury"]), 4),
        } for r in sorted(annual, key=lambda x: fint(x["year"]))],
        "note": ("Share of recalls whose trigger is a detected standard violation "
                 "vs a reported injury/incident, with beta-binomial posterior "
                 "smoothing; 2000–2026."),
    })


# ---------------------------------------------------------------- channel

def build_channel(proj, out):
    res = proj / "02_analysis/10_hazard_channel_regime/results"
    summ = read_json(res / "summary.json")
    decomp = read_json(res / "decomposition.json")
    ors = read_csv(res / "odds_ratios_by_period.csv")
    shares = read_csv(res / "key_shares.csv")

    mh = decomp["mantel_haenszel_stability"]
    kita = decomp["kitagawa_decomposition"]

    write_json(out / "channel.json", {
        "periods": summ["periods"],
        "mh_or": round(mh["common_odds_ratio_mh"], 3),
        "mh_ci": [round(mh["ci_lo"], 3), round(mh["ci_hi"], 3)],
        "mh_p": mh["mh_p"],
        "breslow_day_p": round(mh["breslow_day_p"], 3),
        "kitagawa": {
            "total_change": round(kita["total_change_in_flammability_share"]["estimate"], 4),
            "composition_share": round(kita["composition_component"]["share_of_total"], 4),
            "within_rate_share": round(kita["within_channel_rate_component"]["share_of_total"], 4),
            "periods": kita["periods"],
        },
        "flam_share_by_period": {k: round(v, 4) for k, v in
                                 summ["headline"]["flam_share_by_period"].items()},
        "online_only_share_by_period": {k: round(v, 4) for k, v in
                                        summ["headline"]["online_only_share_by_period"].items()},
        "or_by_period": [{
            "period": r["period"],
            "or": round(fnum(r["odds_ratio_haldane"]), 3),
            "lo": round(fnum(r["ci_lo"]), 3),
            "hi": round(fnum(r["ci_hi"]), 3),
        } for r in ors],
        "key_shares": [{
            "period": r["period"], "quantity": r["quantity"],
            "estimate": round(fnum(r["estimate"]), 4),
            "lo": round(fnum(r["ci_lo"]), 4), "hi": round(fnum(r["ci_hi"]), 4),
            "n": fint(r["denominator"]),
        } for r in shares],
        "note": ("Online-only recalls are ~5x more likely to be flammability "
                 "recalls than store/mixed recalls (Mantel-Haenszel common OR), "
                 "a multiple that is stable across periods (Breslow-Day)."),
    })


# ---------------------------------------------------------------- remedy model

TERM_LABELS = {
    "log10_price": "Unit price (log10 US$)",
    "log10_units": "Units recalled (log10)",
    "is_childrens": "Children's product",
    "is_violation": "Violation-triggered recall",
    "sleepwear_standard": "Cites sleepwear standard",
    "is_electric_textile": "Electric/heated textile",
    "injuries_reported": "Injuries reported",
    "firm_prior_recalls": "Firm's prior recalls",
    "missingindicator_log10_price": "Price missing",
    "title_words": "Title length (words)",
    "year": "Year",
    "n_retailers": "Number of retailers",
    "n_products": "Number of products",
    "n_countries": "Number of origin countries",
    "desc_chars": "Description length",
    "sold_online_text": "'Sold online' in text",
    "category_arbitrage": "Category arbitrage",
}

CAT_PREFIX_LABELS = {
    "hazard_category": "Hazard",
    "sales_channel": "Channel",
    "primary_country": "Origin",
    "archetype": "Archetype",
    "boundary_class": "Boundary class",
    "enforcement_mode": "Enforcement",
    "segment": "Segment",
}


def term_label(term):
    if term in TERM_LABELS:
        return TERM_LABELS[term]
    for p, lab in CAT_PREFIX_LABELS.items():
        if term.startswith(p + "_"):
            level = term[len(p) + 1:].replace("_", " ")
            return f"{lab}: {level}"
    return term.replace("_", " ")


def mean_sd(values):
    n = len(values)
    m = sum(values) / n
    var = sum((v - m) ** 2 for v in values) / n
    return m, math.sqrt(var)


def build_remedy_model(proj, out, recall_rows):
    res = proj / "02_analysis/16_ml_remedy_and_scale/results"
    coefs = read_csv(res / "coefficients_refund.csv")
    imp = read_csv(res / "permutation_importance_refund.csv")
    summ = read_json(res / "summary.json")["task_refund"]

    # model sample: 2010+, remedy field populated (matches the paper's n=379)
    sample = [r for r in recall_rows
              if fint(r["year"]) >= 2010 and r["remedy_options"]]
    n = len(sample)
    if n != summ["n"]:
        print(f"  warning: reconstructed sample n={n} vs paper n={summ['n']}")

    def log10s(field):
        return [math.log10(fnum(r[field])) for r in sample
                if fnum(r[field]) and fnum(r[field]) > 0]

    def bools(field):
        return [1.0 if fbool(r[field]) else 0.0 for r in sample]

    stats = {
        "log10_price": mean_sd(log10s("price_usd")),
        "log10_units": mean_sd(log10s("units")),
        "year": mean_sd([float(r["year"]) for r in sample]),
        "is_childrens": mean_sd(bools("is_childrens")),
        "is_violation": mean_sd(bools("is_violation")),
        "sleepwear_standard": mean_sd(bools("sleepwear_standard")),
        "is_electric_textile": mean_sd(bools("is_electric_textile")),
        "injuries_reported": mean_sd(bools("injuries_reported")),
    }

    def level_freqs(field):
        counts = {}
        for r in sample:
            counts[r[field]] = counts.get(r[field], 0) + 1
        return {k: v / n for k, v in counts.items()}

    coef_by_term = {r["term"]: fnum(r["coef"]) for r in coefs}

    numeric_terms = []
    for term in ["log10_price", "log10_units", "year", "is_childrens",
                 "is_violation", "sleepwear_standard", "is_electric_textile",
                 "injuries_reported"]:
        m, sd = stats[term]
        numeric_terms.append({
            "term": term, "label": term_label(term),
            "coef": round(coef_by_term.get(term, 0.0), 4),
            "mean": round(m, 4), "sd": round(sd, 4),
            "kind": "log10" if term.startswith("log10") else
                    ("raw" if term == "year" else "binary"),
        })

    categorical_terms = {}
    for field in ["hazard_category", "sales_channel"]:
        freqs = level_freqs(field)
        levels = []
        for level, freq in sorted(freqs.items(), key=lambda kv: -kv[1]):
            coef = coef_by_term.get(f"{field}_{level}", 0.0)
            levels.append({"level": level, "coef": round(coef, 4),
                           "freq": round(freq, 4)})
        categorical_terms[field] = levels

    base_rate = summ["outcome_value"]
    coefficients = [{
        "term": r["term"], "label": term_label(r["term"]),
        "coef": round(fnum(r["coef"]), 4),
        "lo95": round(fnum(r["lo95"]), 4), "hi95": round(fnum(r["hi95"]), 4),
        "selected_frac": round(fnum(r["selected_frac"]), 4),
        "excludes_zero": fbool(r["excludes_zero"]),
    } for r in coefs if abs(fnum(r["coef"])) > 1e-9]
    coefficients.sort(key=lambda d: -abs(d["coef"]))

    importance = [{
        "feature": r["feature"], "label": r["label"],
        "importance": round(fnum(r["importance"]), 5),
        "lo95": round(fnum(r["lo95"]), 5), "hi95": round(fnum(r["hi95"]), 5),
        "p_gt_zero": round(fnum(r["p_gt_zero"]), 3),
    } for r in imp]
    importance.sort(key=lambda d: -d["importance"])

    write_json(out / "remedy_model.json", {
        "outcome": "refund offered among stated remedies",
        "model": "elastic-net logistic regression, standardized inputs",
        "n": summ["n"], "years": summ["year_range"],
        "base_rate": round(base_rate, 4),
        "base_logit": round(math.log(base_rate / (1 - base_rate)), 4),
        "pooled_auc": round(summ["pooled_auc"], 3),
        "pooled_brier": round(summ["pooled_brier"], 4),
        "coefficients": coefficients,
        "importance": importance,
        "numeric_terms": numeric_terms,
        "categorical_terms": categorical_terms,
        "calc_note": ("Coefficients are log-odds per SD of the standardized "
                      "input (one-hot terms per level, centered on the sample "
                      "mix); the intercept is anchored at the 2010–2026 "
                      "sample base rate. Descriptive reconstruction of the "
                      "paper's model, not a compliance or legal tool."),
    })


# ---------------------------------------------------------------- meta

def build_meta(proj, out, recalls, cp1, cp2):
    hazard_counts = {}
    for r in recalls:
        hazard_counts[r["hazard_category"]] = hazard_counts.get(r["hazard_category"], 0) + 1
    sub = [r for r in recalls if 2020 <= r["year"] <= 2025]
    flam_2020_25 = sum(1 for r in sub if r["hazard_category"] == "flammability_burn") / len(sub)

    write_json(out / "meta.json", {
        "paper": {
            "title": ("From harm to compliance: five decades of apparel and "
                      "home textile recalls in the United States"),
            "short_title": "From harm to compliance",
            "dataset": "US CPSC apparel & home textile recalls, 1974–2026",
            "n_recalls": len(recalls),
            "window": [1974, 2026],
        },
        "data_retrieved": "2026-08-13",
        "built": date.today().isoformat(),
        "headline": {
            "n_recalls": len(recalls),
            "online_flam_or": 5.03,
            "online_flam_or_ci": [2.96, 8.57],
            "breslow_day_p": 0.84,
            "kitagawa_composition_share": 0.226,
            "kitagawa_within_rate_share": 0.774,
            "regime_change": f"{cp2}/{cp2 + 1}",
            "changepoint_modes": [cp1, cp2],
            "flam_share_2020_25": round(flam_2020_25, 4),
            "detection_crossing_year": 2012,
            "n_countries_modelled": 58,
            "china_share_of_recalls": round(hazard_counts and
                                            sum(1 for r in recalls if r["primary_country"] == "China") / len(recalls), 4),
        },
        "hazard_counts": hazard_counts,
        "sources": {
            "recalls": "cpsc.gov recall database (hardened dataset v2)",
            "imports": "OTEXA total apparel imports (SME), 1989–2025",
            "basemap": "Natural Earth 1:110m admin-0 countries",
        },
    }, compact=False)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--proj", default="/tmp/proj", type=Path)
    ap.add_argument("--out", default=Path(__file__).resolve().parent.parent / "data", type=Path)
    ap.add_argument("--ne-geojson", default="/tmp/nev/geojson/ne_110m_admin_0_countries.geojson",
                    type=Path)
    args = ap.parse_args()

    print("building data/ ...")
    raw_rows, recalls = build_recalls(args.proj, args.out)
    map_names = build_world(args.proj, args.out, args.ne_geojson)
    build_country_rates(args.proj, args.out, map_names)
    cp1, cp2 = build_regimes(args.proj, args.out)
    build_detection(args.proj, args.out)
    build_channel(args.proj, args.out)
    build_remedy_model(args.proj, args.out, raw_rows)
    build_meta(args.proj, args.out, recalls, cp1, cp2)
    print("done.")


if __name__ == "__main__":
    main()

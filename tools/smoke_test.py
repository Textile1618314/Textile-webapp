#!/usr/bin/env python3
"""Static smoke test for the companion app (no browser needed).

Checks, in order:
  1. node --check on every js file (syntax)
  2. every data path referenced by fetch()/api.js exists on disk and parses as JSON
  3. every element id referenced from js (getElementById / '#id' selectors)
     is defined somewhere (index.html or a js template literal)
  4. d3 / topojson are vendored locally; nothing loads from a remote origin
  5. index.html references resolve (css/js files exist)
  6. every internal hash route used in links has a registered view

Run from anywhere:  python3 tools/smoke_test.py
Exit code 0 = all checks pass.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAILURES = []


def check(name, ok, detail=""):
    mark = "ok " if ok else "FAIL"
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        FAILURES.append(name)


def js_files():
    return sorted(ROOT.glob("js/**/*.js"))


def test_node_syntax():
    for f in js_files():
        r = subprocess.run(["node", "--check", str(f)], capture_output=True, text=True)
        check(f"node --check {f.relative_to(ROOT)}", r.returncode == 0,
              r.stderr.strip().splitlines()[0] if r.returncode else "")


def test_data_paths():
    api = (ROOT / "js/api.js").read_text()
    paths = re.findall(r'"(data/[^"]+)"', api)
    check("api.js declares data files", len(paths) >= 8, f"{len(paths)} found")
    for p in paths:
        f = ROOT / p
        exists = f.exists()
        check(f"data file exists: {p}", exists)
        if exists:
            try:
                json.loads(f.read_text())
                check(f"valid JSON: {p}", True)
            except json.JSONDecodeError as e:
                check(f"valid JSON: {p}", False, str(e))
    # no other fetch() targets should exist outside api.js
    for f in js_files():
        if f.name == "api.js":
            continue
        stray = re.findall(r"fetch\(", f.read_text())
        check(f"no stray fetch() in {f.relative_to(ROOT)}", not stray)


def test_dom_ids():
    html = (ROOT / "index.html").read_text()
    defined = set(re.findall(r'id="([A-Za-z][-\w]*)"', html))
    for f in js_files():
        defined |= set(re.findall(r'id="([A-Za-z][-\w]*)"', f.read_text()))

    referenced = set()
    for f in js_files():
        src = f.read_text()
        referenced |= set(re.findall(r'getElementById\("([-\w]+)"\)', src))
        referenced |= set(re.findall(r'querySelector\("#([-\w]+)"\)', src))
        referenced |= set(re.findall(r'\$\("([-\w]+)"\)', src))

    missing = sorted(referenced - defined)
    check("all referenced element ids are defined", not missing,
          "missing: " + ", ".join(missing) if missing else f"{len(referenced)} ids resolved")


def test_vendored_libs():
    """The app must have no runtime network dependency: d3 and topojson are
    served from this origin, and nothing imports or preconnects to a CDN."""
    src = (ROOT / "js/vendor.js").read_text()
    check("vendor.js imports d3 locally", 'from "./vendor/d3.js"' in src)
    check("vendor.js imports topojson locally",
          'from "./vendor/topojson-client.js"' in src)

    for rel, floor, needle in [
        ("js/vendor/d3.js", 20_000, "geoNaturalEarth1"),
        ("js/vendor/topojson-client.js", 1_500, "function feature"),
    ]:
        f = ROOT / rel
        if not f.exists():
            check(f"vendored library present: {rel}", False, "missing")
            continue
        body = f.read_text()
        check(f"vendored library present: {rel}", len(body) > floor and needle in body,
              f"{len(body):,} bytes")

    # nothing anywhere may import from, or preconnect to, a remote origin
    for f in [*js_files(), ROOT / "index.html"]:
        body = f.read_text()
        stray = re.findall(r'from "https?://', body) + \
            re.findall(r'rel="(?:preconnect|dns-prefetch|modulepreload)"[^>]*https?://', body)
        check(f"no remote dependency in {f.relative_to(ROOT)}", not stray)


def test_index_references():
    html = (ROOT / "index.html").read_text()
    refs = re.findall(r'(?:href|src)="((?:css|js)/[^"]+)"', html)
    for r in refs:
        check(f"index.html references exist: {r}", (ROOT / r).exists())
    check("index.html loads app as ES module",
          'type="module" src="js/app.js"' in html)
    check("index.html has the boot watchdog",
          'dataset.booted' in html and 'could not start' in html)
    check("app.js raises the boot flag",
          'dataset.booted = "1"' in (ROOT / "js/app.js").read_text())


def test_routes():
    app = (ROOT / "js/app.js").read_text()
    m = re.search(r"const ROUTES = \{([^}]*)\}", app)
    registered = set(re.findall(r"(\w+)", m.group(1))) if m else set()
    used = set()
    for f in [ROOT / "index.html", *js_files()]:
        used |= set(re.findall(r'#/(\w+)', f.read_text()))
    missing = sorted(used - registered)
    check("all #/ routes are registered", not missing,
          "missing: " + ", ".join(missing) if missing else f"routes: {', '.join(sorted(registered))}")


def test_import_exports():
    """Every named import from a local module must be exported there."""
    exports = {}
    for f in js_files():
        src = f.read_text()
        names = set()
        names |= set(re.findall(r"export (?:async )?function (\w+)", src))
        names |= set(re.findall(r"export const (\w+)", src))
        names |= set(re.findall(r"export \* as (\w+)", src))
        if re.search(r"export default", src):
            names.add("default")
        for block in re.findall(r"export \{([^}]*)\}", src):
            names |= {n.strip() for n in block.split(",") if n.strip()}
        exports[f.resolve()] = names

    bad = []
    for f in js_files():
        src = f.read_text()
        for names_blob, rel in re.findall(r'import \{([^}]*)\} from "(\.[^"]+)"', src):
            target = (f.parent / rel).resolve()
            if target not in exports:
                bad.append(f"{f.relative_to(ROOT)}: unresolved module {rel}")
                continue
            for n in names_blob.split(","):
                n = n.strip().split(" as ")[0].strip()
                if n and n not in exports[target]:
                    bad.append(f"{f.relative_to(ROOT)}: '{n}' not exported by {rel}")
        for _, rel in re.findall(r'import (\w+) from "(\.[^"]+)"', src):
            target = (f.parent / rel).resolve()
            if target not in exports or "default" not in exports[target]:
                bad.append(f"{f.relative_to(ROOT)}: no default export in {rel}")
    check("named imports match exports", not bad, "; ".join(bad[:6]))


def test_data_contracts():
    """The properties each view reads must exist in the built payloads."""
    load = lambda n: json.loads((ROOT / "data" / n).read_text())

    meta = load("meta.json")
    h = meta["headline"]
    for k in ["n_recalls", "online_flam_or", "online_flam_or_ci", "regime_change",
              "changepoint_modes", "flam_share_2020_25", "breslow_day_p",
              "kitagawa_within_rate_share", "detection_crossing_year", "n_countries_modelled"]:
        check(f"meta.headline.{k}", k in h)

    recalls = load("recalls.json")
    rec = recalls["records"][0]
    for k in ["recall_id", "recall_number", "date", "year", "title", "hazard_category",
              "segment", "is_childrens", "is_violation", "injuries_reported", "units",
              "price_usd", "sales_channel", "countries", "primary_country",
              "remedy_options", "archetype", "boundary_class", "sleepwear_standard", "url"]:
        check(f"recalls.records[].{k}", k in rec)
    check("recalls has 758 records", recalls["n"] == 758 and len(recalls["records"]) == 758)
    check("recall urls point at cpsc.gov",
          all(r["url"].startswith("https://www.cpsc.gov/") for r in recalls["records"]))

    cr = load("country_rates.json")
    c0 = cr["countries"][0]
    for k in ["country", "map_name", "on_map", "recalls", "bn_sme", "rate_mean",
              "hdi_lo", "hdi_hi", "rr_median", "rr_lo", "rr_hi", "p_below_mean"]:
        check(f"country_rates.countries[].{k}", k in c0)
    check("reference is the posterior grand mean",
          cr.get("reference") == "posterior grand mean"
          and all(c["rr_median"] != 1 or c["country"] != "China"
                  for c in cr["countries"]))

    world = load("world_110m.json")
    check("world topojson has objects.countries",
          world.get("type") == "Topology" and "countries" in world.get("objects", {}))
    names = {g["properties"]["name"] for g in world["objects"]["countries"]["geometries"]}
    joinable = [c for c in cr["countries"] if c["on_map"]]
    bad_join = [c["country"] for c in joinable if c["map_name"] not in names]
    check("every on_map country joins the basemap", not bad_join, ", ".join(bad_join))

    reg = load("regimes.json")
    check("regimes has cp densities",
          {"cp1", "cp2"} <= set(reg["changepoints"]) and
          all("density" in reg["changepoints"][k] and "mode" in reg["changepoints"][k]
              for k in ("cp1", "cp2")))
    check("regimes has 3 regimes with span+composition",
          len(reg["regimes"]) == 3 and all("span" in r and "composition" in r for r in reg["regimes"]))
    yrs = [y["year"] for y in reg["years"]]
    check("regimes.years continuous 1974–2026", yrs == list(range(1974, 2027)))

    det = load("detection.json")
    check("detection series present",
          {"violation", "injury"} <= set(det["series"]) and det["crossing_year"] == 2012)
    s0 = det["series"]["violation"][0]
    for k in ["year", "mean", "hdi_lo", "hdi_hi", "observed", "n"]:
        check(f"detection.series[].{k}", k in s0)

    ch = load("channel.json")
    for k in ["mh_or", "mh_ci", "breslow_day_p", "kitagawa", "key_shares", "or_by_period"]:
        check(f"channel.{k}", k in ch)
    q = {(r["period"], r["quantity"]) for r in ch["key_shares"]}
    check("channel key_shares has 2020-26 conditionals",
          {("2020-26", "flam_given_online_only"), ("2020-26", "flam_given_store_only")} <= q)

    rm = load("remedy_model.json")
    for k in ["base_rate", "base_logit", "pooled_auc", "coefficients", "importance",
              "numeric_terms", "categorical_terms"]:
        check(f"remedy_model.{k}", k in rm)
    terms = {t["term"] for t in rm["numeric_terms"]}
    need = {"log10_price", "log10_units", "is_childrens", "is_violation",
            "sleepwear_standard", "injuries_reported"}
    check("remedy_model numeric terms cover the calculator", need <= terms,
          "missing: " + ", ".join(sorted(need - terms)))
    check("remedy_model categorical terms cover the calculator",
          {"hazard_category", "sales_channel"} <= set(rm["categorical_terms"]))


def main():
    print(f"smoke test root: {ROOT}\n")
    test_node_syntax()
    test_data_paths()
    test_dom_ids()
    test_vendored_libs()
    test_index_references()
    test_routes()
    test_import_exports()
    test_data_contracts()
    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED")
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()

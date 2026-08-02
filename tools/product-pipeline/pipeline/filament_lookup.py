#!/usr/bin/env python3
"""
Fill in real, measured filament colours from filamentcolors.xyz.

Card manifests carry a hex derived from a name lookup table, so every
"Bone White" gets the same value no matter who made it. filamentcolors.xyz
measures physical printed swatches with a colorimeter, so its hex is the real
thing -- and it separates finishes (PLA+, Silk, Matte, High Speed PLA) into
distinct records with distinct colours.

    python3 -m pipeline.filament_lookup --dry-run
    python3 -m pipeline.filament_lookup                  # write measured hexes
    python3 -m pipeline.filament_lookup --all            # re-check everything

Only rows with hex_source='guess' are touched by default, so a colour you
corrected by hand is never overwritten.

Be kind to a community-funded site: results are cached in .fc_cache.json and
requests are spaced out.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://filamentcolors.xyz/api/swatch/"
CACHE = Path(__file__).resolve().parent.parent / ".fc_cache.json"
UA = {"User-Agent": "axis3d-product-pipeline (+personal shop inventory sync)"}


def norm(s):
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def load_cache():
    if CACHE.is_file():
        try:
            return json.loads(CACHE.read_text())
        except json.JSONDecodeError:
            pass
    return {}


def search(query, cache, pause=1.0):
    key = norm(query)
    if key in cache:
        return cache[key]
    url = API + "?" + urllib.parse.urlencode({"q": query})
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            data = json.loads(r.read().decode())
    except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError) as e:
        print(f"    ! lookup failed for {query!r}: {e}")
        return []
    results = data.get("results", [])
    cache[key] = results
    CACHE.write_text(json.dumps(cache))
    time.sleep(pause)
    return results


def score(row, brand, name, material):
    """Higher is better. Brand must match; everything else is preference."""
    mfr = norm((row.get("manufacturer") or {}).get("name"))
    if norm(brand) and mfr != norm(brand):
        return -1

    cname = norm(row.get("color_name"))
    want = norm(name)
    s = 0
    if cname == want:
        s += 100
    elif want and want in cname:
        s += 60          # "Yellow" inside "Silk Dark Yellow" -- plausible but weaker
    else:
        return -1

    ftype = row.get("filament_type") or {}
    tname = norm(ftype.get("name"))
    parent = norm((ftype.get("parent_type") or {}).get("name"))
    wantm = norm(material)
    if tname == wantm:
        s += 40
    elif parent == wantm:
        s += 25          # PLA+ under PLA
    else:
        s -= 20

    # Prefer a plain colour over a special finish unless asked for one
    if any(k in cname for k in ("silk", "matte", "glow", "glitter", "sparkle")) \
            and not any(k in want for k in ("silk", "matte", "glow", "glitter", "sparkle")):
        s -= 45
    if row.get("published"):
        s += 5
    return s


def best_match(brand, name, material, cache):
    rows = search(f"{brand} {name}".strip(), cache)
    scored = [(score(r, brand, name, material), r) for r in rows]
    scored = [(s, r) for s, r in scored if s > 0]
    if not scored:
        return None
    scored.sort(key=lambda x: -x[0])
    return scored[0]


def fetch_filaments(url, key, everything):
    q = "select=id,name,brand,material,hex,hex_source"
    if not everything:
        q += "&hex_source=eq.guess"
    req = urllib.request.Request(f"{url}/rest/v1/filaments?{q}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def patch(url, key, fid, payload):
    req = urllib.request.Request(
        f"{url}/rest/v1/filaments?id=eq.{urllib.parse.quote(fid)}",
        data=json.dumps(payload).encode(), method="PATCH",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    urllib.request.urlopen(req, timeout=30)


def main():
    ap = argparse.ArgumentParser(description="Fill in measured filament colours.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true",
                    help="re-check every colour, not just unverified guesses")
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        print("! Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return 1

    try:
        rows = fetch_filaments(url, key, args.all)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        print(f"! could not read filaments: {e}")
        return 1

    print(f"{len(rows)} colour(s) to check\n")
    cache = load_cache()
    hits = misses = 0

    for f in rows:
        label = f"{f.get('brand') or '-'} {f['name']} ({f.get('material')})"
        m = best_match(f.get("brand") or "", f["name"], f.get("material") or "PLA", cache)
        if not m:
            print(f"  ?  {label:38} no confident match — leaving {f['hex']}")
            misses += 1
            continue

        s, row = m
        new_hex = "#" + (row.get("hex_color") or "").upper().lstrip("#")
        ftype = (row.get("filament_type") or {}).get("name")
        changed = new_hex != (f.get("hex") or "").upper()
        mark = "->" if changed else "=="
        print(f"  {'+' if changed else ' '}  {label:38} {f['hex']} {mark} {new_hex}"
              f"   [{ftype}, score {s}]")

        if args.dry_run:
            continue
        try:
            patch(url, key, f["id"], {
                "hex": new_hex, "hex_source": "measured", "finish": ftype,
                "fc_slug": row.get("slug"),
                "swatch_url": row.get("image_front") or row.get("card_img"),
                "buy_url": row.get("mfr_purchase_link") or row.get("amazon_purchase_link"),
            })
            hits += 1
        except urllib.error.HTTPError as e:
            print(f"    ! write failed: {e.code} {e.read().decode()[:200]}")

    print(f"\n{hits} updated, {misses} left alone"
          + (" (dry run — nothing written)" if args.dry_run else ""))
    print("Anything marked '?' needs a hand-entered hex, or a photo of your printed card.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

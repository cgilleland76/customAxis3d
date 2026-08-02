#!/usr/bin/env python3
"""
Import filament colours from sample-card manifests into Supabase.

The filament-sample-card skill writes a manifest.json next to the cards it
generates, holding brand, colour, material and hex. Making a card means you
had the spool in your hand -- so a card is the record that you can source that
colour, whether or not it is on the shelf today.

    python3 -m pipeline.import_filaments <manifest.json | folder> [...]
    python3 -m pipeline.import_filaments ~/cards --dry-run
    python3 -m pipeline.import_filaments ~/cards --out-of-stock

By default new colours land in stock. --out-of-stock adds them unticked so you
confirm each one. Existing colours never have their stock flag overwritten:
re-importing will not undo a tick you made in Shop tools.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


def slugify(material: str, brand: str, name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", f"{material}-{brand}-{name}".lower()).strip("-")


def read_manifests(targets):
    """Collect unique spools from every manifest under the given paths."""
    files = []
    for t in targets:
        p = Path(t)
        if p.is_dir():
            files += sorted(glob.glob(str(p / "**" / "manifest.json"), recursive=True))
        elif p.is_file():
            files.append(str(p))
    rows, skipped = {}, []
    for f in files:
        try:
            data = json.loads(Path(f).read_text())
        except (json.JSONDecodeError, OSError) as e:
            skipped.append(f"{f}: {e}")
            continue
        for c in data if isinstance(data, list) else [data]:
            brand = (c.get("brand") or "").strip()
            name = (c.get("color") or c.get("name") or "").strip()
            material = (c.get("type") or c.get("material") or "PLA").strip()
            hexv = (c.get("hex") or c.get("body") or "").strip().upper()
            if not name or not re.fullmatch(r"#[0-9A-F]{6}", hexv):
                skipped.append(f"{f}: skipped {brand} {name!r} (missing colour or hex)")
                continue
            # A brand that is really a product description, not a maker.
            if brand.lower() in ("", "pla filament", "petg filament", "filament"):
                brand = ""
            rows[slugify(material, brand, name)] = {
                "id": slugify(material, brand, name), "name": name,
                "material": material, "hex": hexv, "brand": brand or None,
            }
    return list(rows.values()), files, skipped


def existing_ids(url, key):
    req = urllib.request.Request(f"{url}/rest/v1/filaments?select=id",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return {row["id"] for row in json.loads(r.read().decode())}


def push(rows, url, key):
    body = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/filaments?on_conflict=id", data=body, method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    urllib.request.urlopen(req, timeout=60)


def main():
    ap = argparse.ArgumentParser(description="Import filament colours from card manifests.")
    ap.add_argument("targets", nargs="+", help="manifest.json files or folders to scan")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--out-of-stock", action="store_true",
                    help="add new colours unticked instead of in stock")
    args = ap.parse_args()

    rows, files, skipped = read_manifests(args.targets)
    print(f"{len(rows)} unique colour(s) across {len(files)} manifest(s)")
    for s in skipped:
        print(f"  ! {s}")
    if not rows:
        return 1

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        print("! Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return 1

    try:
        have = set() if args.dry_run else existing_ids(url, key)
    except (urllib.error.HTTPError, urllib.error.URLError) as e:
        print(f"! could not read existing filaments: {e}")
        return 1

    rows.sort(key=lambda r: ((r["brand"] or "").lower(), r["name"].lower()))
    new, known = [], []
    for i, r in enumerate(rows, 1):
        r["sort"] = i * 10
        if r["id"] in have:
            # Never clobber a stock flag you set by hand in Shop tools.
            known.append(r)
        else:
            r["in_stock"] = not args.out_of_stock
            new.append(r)

    for r in new:
        print(f"  + {r['brand'] or '-':10} {r['name']:16} {r['material']:5} {r['hex']}")
    for r in known:
        print(f"    {r['brand'] or '-':10} {r['name']:16} {r['material']:5} {r['hex']}  (already known)")

    if args.dry_run:
        print("\ndry run — nothing written")
        return 0

    try:
        push(new + known, url, key)
    except urllib.error.HTTPError as e:
        print(f"! push failed {e.code}: {e.read().decode()[:300]}")
        return 1
    print(f"\n{len(new)} added, {len(known)} refreshed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

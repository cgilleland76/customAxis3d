#!/usr/bin/env python3
"""
List drafts and publish them, without a trip to the web admin.

    python3 -m pipeline.drafts              # show drafts
    python3 -m pipeline.drafts --publish    # pick which to make live
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import env as _env   # noqa: E402
_env.load()


def creds():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        raise SystemExit("  Set SUPABASE_URL and SUPABASE_SERVICE_KEY (see .env.example)")
    return url, key


def get(url, key, q):
    req = urllib.request.Request(f"{url}/rest/v1/products?{q}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def set_status(url, key, pid, status):
    req = urllib.request.Request(
        f"{url}/rest/v1/products?id=eq.{urllib.parse.quote(pid)}",
        data=json.dumps({"status": status}).encode(), method="PATCH",
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    urllib.request.urlopen(req, timeout=30)


def main():
    ap = argparse.ArgumentParser(description="List and publish draft products.")
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()

    url, key = creds()
    rows = get(url, key, "select=id,name,price,category,img,status"
                         "&status=eq.draft&order=name")
    if not rows:
        print("\n  No drafts — everything is live.\n")
        return 0

    print(f"\n  {len(rows)} draft(s):\n")
    for i, p in enumerate(rows, 1):
        img = "photo" if p.get("img") else "NO IMAGE"
        print(f"   {i:>2}. {p['name']:<34} ${p.get('price') or 0:<7} "
              f"{p.get('category') or '-':<10} {img}")

    if not args.publish:
        print("\n  Run \"Publish drafts\" to make any of these live.\n")
        return 0

    print("\n  Numbers to publish, comma separated. 'all' for everything,")
    print("  Enter to cancel.")
    pick = input("  > ").strip().lower()
    if not pick:
        print("  Cancelled.\n")
        return 0

    chosen = rows if pick == "all" else [
        rows[int(n) - 1] for n in pick.replace(" ", "").split(",")
        if n.isdigit() and 1 <= int(n) <= len(rows)]
    if not chosen:
        print("  Nothing matched.\n")
        return 0

    missing = [p["name"] for p in chosen if not p.get("img")]
    if missing:
        print(f"\n  ! No image on: {', '.join(missing)}")
        if input("  Publish anyway? (y/N): ").strip().lower() != "y":
            return 0

    for p in chosen:
        try:
            set_status(url, key, p["id"], "published")
            print(f"  published  {p['name']}")
        except urllib.error.HTTPError as e:
            print(f"  ! {p['name']}: {e.code} {e.read().decode()[:120]}")
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

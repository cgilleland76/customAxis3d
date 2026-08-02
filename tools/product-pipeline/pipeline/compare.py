"""
Re-dropping a file with the same name should compare, not silently overwrite.

Every model file is hashed. On a repeat drop we can tell three cases apart:

  identical   - same bytes, nothing to do
  revised     - same name, different bytes: show what actually changed
  new         - never seen before
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

WATCHED = ("price", "print_time_s", "total_weight_g", "color_count",
           "dimensions_human", "print_profile", "layer_height")

LABELS = {
    "price": "Price", "print_time_s": "Print time", "total_weight_g": "Filament",
    "color_count": "Colors", "dimensions_human": "Size",
    "print_profile": "Profile", "layer_height": "Layer height",
}


def hash_file(path: Path, chunk=1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            b = fh.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def hash_models(folder: Path) -> dict:
    out = {}
    for pat in ("*.3mf", "*.gcode", "*.gco"):
        for f in sorted(folder.glob(pat)):
            out[f.name] = hash_file(f)
    return out


def load_previous(gen_dir: Path):
    prev = gen_dir / "spec.json"
    if not prev.is_file():
        return None
    try:
        return json.loads(prev.read_text())
    except json.JSONDecodeError:
        return None


def _values(record):
    spec = record.get("spec", {})
    v = {k: spec.get(k) for k in WATCHED}
    v["price"] = record.get("price")
    return v


def compare(prev: dict, new: dict) -> dict:
    """Return {status, changed_files, diffs}. status: new | identical | revised."""
    if not prev:
        return {"status": "new", "changed_files": [], "diffs": []}

    old_h = prev.get("file_hashes") or {}
    new_h = new.get("file_hashes") or {}

    changed = []
    for name, h in new_h.items():
        if name not in old_h:
            changed.append((name, "added"))
        elif old_h[name] != h:
            changed.append((name, "modified"))
    for name in old_h:
        if name not in new_h:
            changed.append((name, "removed"))

    ov, nv = _values(prev), _values(new)
    diffs = [(k, ov.get(k), nv.get(k)) for k in WATCHED if ov.get(k) != nv.get(k)]

    if not changed and not diffs:
        return {"status": "identical", "changed_files": [], "diffs": []}
    return {"status": "revised", "changed_files": changed, "diffs": diffs}


def _fmt(key, val):
    if val is None:
        return "-"
    if key == "print_time_s":
        m = int(round(val / 60.0))
        h, m = divmod(m, 60)
        return f"{h}h {m}m" if h else f"{m}m"
    if key == "total_weight_g":
        return f"{val:g} g"
    if key == "price":
        return f"${val:,.2f}"
    return str(val)


def report(result: dict) -> str:
    if result["status"] == "new":
        return "  new product"
    if result["status"] == "identical":
        return "  identical to the last run -- nothing changed"

    lines = ["  REVISED - same name, different contents:"]
    for name, how in result["changed_files"]:
        lines.append(f"    file  {name} ({how})")
    for key, old, new in result["diffs"]:
        label = LABELS.get(key, key)
        arrow = f"{_fmt(key, old)}  ->  {_fmt(key, new)}"
        extra = ""
        if key == "price" and isinstance(old, (int, float)) and isinstance(new, (int, float)):
            delta = new - old
            extra = f"   ({'+' if delta >= 0 else ''}{delta:,.2f})"
        lines.append(f"    {label:<12} {arrow}{extra}")
    return "\n".join(lines)

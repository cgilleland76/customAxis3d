#!/usr/bin/env python3
"""
One command to turn a product folder into a listing.

    python3 -m pipeline.build products/leopard-vase
    python3 -m pipeline.build --all
    python3 -m pipeline.build path/to/anything.3mf --dry-run

Folder layout it expects:

    products/<slug>/
        model.3mf        <- sliced, then File > Save Project As
        photos/          <- raw hero shots (optional)
        product.yml      <- the few fields you actually decide (optional)
"""

from __future__ import annotations
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline import listing as copymod       # noqa: E402
from pipeline import images as imagemod       # noqa: E402
from pipeline import pricing                  # noqa: E402
from pipeline.spec3mf import load_spec, merge_specs   # noqa: E402
from pipeline import compare as cmp             # noqa: E402

try:
    import yaml
except ImportError:
    yaml = None

ROOT = Path(__file__).resolve().parent.parent


def load_yaml(path: Path, default=None):
    if not path.is_file():
        return default if default is not None else {}
    if yaml is None:
        print("  ! PyYAML not installed (pip install pyyaml); using defaults")
        return default if default is not None else {}
    return yaml.safe_load(path.read_text()) or (default or {})


def find_models(folder: Path):
    """Every model file in the folder. A Bambu workflow normally yields two:
    the project .3mf and the exported *.gcode.3mf -- we want both."""
    hits = []
    for pat in ("*.3mf", "*.gcode", "*.gco"):
        hits += sorted(folder.glob(pat))
    seen, out = set(), []
    for h in hits:
        if h.name not in seen:
            seen.add(h.name)
            out.append(h)
    return out


def build_one(target: Path, cfg: dict, dry_run: bool = False) -> dict:
    if target.is_dir():
        folder, slug = target, target.name
        models = find_models(folder)
        meta = load_yaml(folder / "product.yml")
        photos = folder / "photos"
    else:
        folder, slug = target.parent, target.stem
        models, meta, photos = [target], {}, folder / "photos"

    if not models:
        raise FileNotFoundError(f"No .3mf or .gcode found in {folder}")

    print(f"\n=== {slug} ===")
    for m in models:
        print(f"  model: {m.name}")

    out_dir = folder / "_generated"
    if not dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)

    # Same filename re-dropped? Compare rather than silently overwrite.
    previous = cmp.load_previous(out_dir)
    hashes = cmp.hash_models(folder)

    parsed = []
    for m in models:
        try:
            parsed.append(load_spec(m, thumb_dir=out_dir if not dry_run else None))
        except Exception as e:
            print(f"  ! could not read {m.name}: {e}")
    spec = merge_specs(parsed)
    for w in spec.warnings:
        print(f"  ! {w}")

    print(f"  time:  {spec.print_time_human}")
    print(f"  size:  {spec.dimensions_human}")
    print(f"  mat:   {', '.join(spec.materials) or 'unknown'}  "
          f"{spec.total_weight_g:g} g across {spec.color_count} color(s)")
    for f in spec.filaments:
        if f.used_g:
            print(f"           slot {f.index}: {f.type or '?':<6} {f.color or '-':<8} {f.used_g:>7.2f} g")

    breakdown = pricing.price_from_spec(spec, cfg)
    sym = cfg.get("shop", {}).get("currency_symbol", "$")
    print(pricing.explain(breakdown, sym))

    image_paths = []
    if not dry_run and photos.is_dir():
        print("  images:")
        image_paths = imagemod.process_dir(photos, out_dir / "img", cfg, slug)
        for p in image_paths:
            print(f"    + {Path(p).name}")

    record = {
        "slug": slug,
        "name": meta.get("name") or (spec.object_names[0] if spec.object_names else slug),
        "category": meta.get("category", ""),
        "price": meta.get("price") or breakdown.get("price"),
        "priceable": breakdown.get("priceable", True) or bool(meta.get("price")),
        "price_breakdown": breakdown,
        "spec": spec.as_dict(),
        "description": copymod.description(meta, spec),
        "tags": copymod.tags(meta, spec, cfg),
        "images": [Path(p).name for p in image_paths],
        "slicer_previews": [Path(p).name for p in spec.thumbnails],
        "variants": cfg.get("variants", []),
        "file_hashes": hashes,
    }

    delta = cmp.compare(previous, record)
    record["change_status"] = delta["status"]
    record["changes"] = delta["diffs"]
    print(cmp.report(delta))

    if not dry_run:
        (out_dir / "spec.json").write_text(json.dumps(record, indent=2))
        (out_dir / "copy_draft.md").write_text(copymod.draft(meta, spec, breakdown, cfg))
        (out_dir / "copy_prompt.txt").write_text(copymod.prompt(meta, spec, breakdown, cfg))
        print(f"  wrote: {out_dir.relative_to(ROOT) if out_dir.is_relative_to(ROOT) else out_dir}/"
              " (spec.json, copy_draft.md, copy_prompt.txt)")

    return record


def main():
    ap = argparse.ArgumentParser(description="Build product listings from sliced 3MF files.")
    ap.add_argument("target", nargs="?", help="product folder, .3mf, or .gcode")
    ap.add_argument("--all", action="store_true", help="build every folder under products/")
    ap.add_argument("--config", default=str(ROOT / "config.yml"))
    ap.add_argument("--dry-run", action="store_true", help="print, write nothing")
    args = ap.parse_args()

    cfg = load_yaml(Path(args.config))
    if not cfg:
        print(f"! No config loaded from {args.config}; using built-in defaults")
        cfg = {"pricing": {"filament_cost_per_kg": {"default": 22.0},
                           "machine_rate_per_hour": 1.5, "labor_flat": 2.5,
                           "failure_rate": 0.08, "margin_multiplier": 2.2,
                           "min_price": 5.0, "round_style": "charm"}}

    targets = []
    if args.all:
        pdir = ROOT / "products"
        targets = [p for p in sorted(pdir.iterdir())
                   if p.is_dir() and not p.name.startswith("_")] if pdir.is_dir() else []
        if not targets:
            print("No product folders found under products/")
            return 1
    elif args.target:
        targets = [Path(args.target)]
    else:
        ap.print_help()
        return 1

    records = []
    for t in targets:
        try:
            records.append(build_one(t, cfg, args.dry_run))
        except Exception as e:
            print(f"  ! FAILED {t}: {e}")

    if records and not args.dry_run:
        out = ROOT / cfg.get("site", {}).get("output", "dist/products.json")
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(records, indent=2))
        print(f"\nWrote {len(records)} product(s) -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

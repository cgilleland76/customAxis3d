"""
Push a built product to Supabase: images to Storage, row to a table, as a DRAFT.

Uses only the standard library -- no supabase-py, no requests. Credentials come
from the environment, never from config.yml (which you might commit):

    export SUPABASE_URL="https://xxxx.supabase.co"
    export SUPABASE_SERVICE_KEY="eyJ..."     # service_role, server-side only

Column mapping lives in config.yml under `supabase.columns`, so this adapts to
whatever your products table already looks like without touching your schema.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import urllib.error
import urllib.request
from pathlib import Path


class PublishError(RuntimeError):
    pass


def _creds():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    if not url or not key:
        raise PublishError(
            "Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your environment.")
    return url, key


def _request(method, url, key, body=None, headers=None, timeout=60):
    hdrs = {"apikey": key, "Authorization": f"Bearer {key}"}
    hdrs.update(headers or {})
    req = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, raw
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        raise PublishError(f"{method} {url} -> {e.code}: {detail}") from None
    except urllib.error.URLError as e:
        raise PublishError(f"{method} {url} -> {e.reason}") from None


# ---------------------------------------------------------------- storage ---

def upload_image(local: Path, bucket: str, dest_path: str, cfg: dict,
                 dry_run=False) -> str:
    """Upload one file to Supabase Storage.

    Returns a full public URL when the bucket is public (what your admin and
    storefront can drop straight into an <img src>), or the bare object path
    when it is private (the site then has to sign it).
    """
    public_bucket = cfg.get("supabase", {}).get("public_bucket", True)

    def result(base_url):
        return (f"{base_url}/storage/v1/object/public/{bucket}/{dest_path}"
                if public_bucket else dest_path)

    if dry_run:
        return result(os.environ.get("SUPABASE_URL", "").rstrip("/"))

    url, key = _creds()
    ctype = mimetypes.guess_type(local.name)[0] or "application/octet-stream"
    _request("POST", f"{url}/storage/v1/object/{bucket}/{dest_path}", key,
             body=local.read_bytes(),
             headers={"Content-Type": ctype, "x-upsert": "true"})
    return result(url)


def signed_url(object_path: str, cfg: dict, expires_in: int = 3600) -> str:
    """Handy for spot-checking a private object; the site normally does this
    itself with supabase-js .createSignedUrl()."""
    url, key = _creds()
    bucket = cfg.get("supabase", {}).get("bucket", "product-images")
    _, raw = _request("POST", f"{url}/storage/v1/object/sign/{bucket}/{object_path}",
                      key, body=json.dumps({"expiresIn": expires_in}).encode(),
                      headers={"Content-Type": "application/json"})
    return url + json.loads(raw.decode())["signedURL"]


def upload_product_images(record: dict, gen_dir: Path, cfg: dict, dry_run=False):
    """Upload every generated image. Returns (all_paths, hero_path).

    Hero preference: your real photo if there is one, otherwise the slicer
    render -- so a product is never imageless.
    """
    scfg = cfg.get("supabase", {})
    bucket = scfg.get("bucket", "product-images")
    prefix = scfg.get("storage_prefix", "products").strip("/")
    slug = record["slug"]

    photos, renders = [], []
    img_dir = gen_dir / "img"
    if img_dir.is_dir():
        photos = sorted(f for f in img_dir.iterdir() if f.is_file())
    renders = sorted(f for f in gen_dir.glob("slicer_*.png") if f.is_file())

    def biggest(files):
        """Largest declared width wins (…-1600.webp beats …-400.webp)."""
        def width(f):
            m = re.search(r"-(\d+)\.[a-z]+$", f.name)
            return int(m.group(1)) if m else 0
        return max(files, key=lambda f: (width(f), f.stat().st_size)) if files else None

    hero_src = biggest(photos) or biggest(renders)

    paths, hero = [], None
    for f in photos + renders:
        dest = f"{prefix}/{slug}/{f.name}"
        stored = upload_image(f, bucket, dest, cfg, dry_run=dry_run)
        paths.append(stored)
        if hero_src is not None and f == hero_src:
            hero = stored
    return paths, hero


# ------------------------------------------------------------------ table ---

def build_row(record: dict, image_paths: list, cfg: dict, hero: str = None) -> dict:
    """Map the pipeline record onto your table's columns.

    config.yml:
        supabase:
          table: products
          columns:
            slug: slug            # <your column>: <pipeline field>
            title: name
            price_cents: price_cents
            ...
    """
    scfg = cfg.get("supabase", {})
    bd = record.get("price_breakdown", {})

    # Never ship local filesystem paths to the database -- thumbnails holds
    # absolute paths from whatever machine ran the build.
    spec = {k: v for k, v in record.get("spec", {}).items() if k != "thumbnails"}
    if isinstance(spec.get("source"), str):
        spec["source"] = " + ".join(Path(p).name for p in spec["source"].split(" + "))
    price = record.get("price")

    # Everything the mapping is allowed to reference.
    available = {
        "slug": record.get("slug"),
        "name": record.get("name"),
        "category": record.get("category"),
        "price": price,
        "price_cents": int(round(price * 100)) if price is not None else None,
        "cost": bd.get("cost_with_failure_buffer"),
        "margin_pct": bd.get("margin_pct"),
        "tags": record.get("tags", []),
        "description": record.get("description", ""),
        "print_time_s": spec.get("print_time_s"),
        "print_time_human": spec.get("print_time_human"),
        "weight_g": spec.get("total_weight_g"),
        "dimensions_mm": spec.get("bbox_mm"),
        "dimensions_human": spec.get("dimensions_human"),
        "color_count": spec.get("color_count"),
        "materials": spec.get("materials", []),
        "filaments": spec.get("filaments", []),
        "layer_height": spec.get("layer_height"),
        "printer": spec.get("printer"),
        "print_profile": spec.get("print_profile"),
        "hours": bd.get("hours"),
        "images": image_paths,
        "image_paths": image_paths,
        "hero_path": hero or (image_paths[0] if image_paths else None),
        "image_url": hero or (image_paths[0] if image_paths else None),
        "tags_text": ", ".join(record.get("tags", [])),
        "materials_text": ", ".join(spec.get("materials", [])),
        "spec_json": spec,
        "price_breakdown_json": bd,
        "status": scfg.get("draft_status", "draft"),
        "slots": _slots(spec, record),
    }

    mapping = scfg.get("columns")
    if not mapping:
        raise PublishError(
            "No supabase.columns mapping in config.yml. Connect the Supabase "
            "MCP and let me read your table, or fill it in by hand: "
            "<your_column>: <pipeline_field>.")

    row = {}
    unknown = []
    for column, field in mapping.items():
        if field not in available:
            unknown.append(field)
            continue
        val = available[field]
        if isinstance(val, (dict, list)) and not scfg.get("native_json", True):
            val = json.dumps(val)
        row[column] = val
    if unknown:
        raise PublishError(
            f"config.yml maps to unknown pipeline fields: {unknown}. "
            f"Available: {sorted(available)}")

    # Safety rail: a new row is never published automatically.
    status_col = scfg.get("status_column")
    if status_col:
        row[status_col] = scfg.get("draft_status", "draft")
    return row


DEFAULT_SLOT_LABELS = ["Base", "Lettering", "Accent 1", "Accent 2",
                       "Accent 3", "Accent 4", "Accent 5", "Accent 6"]


def _slots(spec: dict, record: dict):
    """One colour slot per filament the slicer actually used, so the shop can
    draw a picker without you defining anything by hand. Labels and defaults
    are a starting point -- edit them in the database if you want better names."""
    fils = [f for f in spec.get("filaments", []) if (f.get("used_g") or 0) > 0]
    if not fils:
        return None
    override = (record.get("meta_slots") or [])
    out = []
    for i, f in enumerate(fils):
        label = override[i] if i < len(override) else (
            DEFAULT_SLOT_LABELS[i] if i < len(DEFAULT_SLOT_LABELS) else f"Colour {i + 1}")
        out.append({"index": f.get("index", i + 1),
                    "label": label,
                    "hex": f.get("color") or None,
                    "default": None})
    return out


def upsert_product(row: dict, cfg: dict, dry_run=False) -> dict:
    scfg = cfg.get("supabase", {})
    table = scfg.get("table", "products")
    conflict = scfg.get("on_conflict", "slug")

    if dry_run:
        return {"dry_run": True, "table": table, "row": row}

    url, key = _creds()
    endpoint = f"{url}/rest/v1/{table}?on_conflict={conflict}"
    _, raw = _request("POST", endpoint, key,
                      body=json.dumps(row).encode(),
                      headers={"Content-Type": "application/json",
                               "Prefer": "resolution=merge-duplicates,return=representation"})
    try:
        return json.loads(raw.decode())[0]
    except (json.JSONDecodeError, IndexError, KeyError):
        return {"ok": True}


def publish(record: dict, gen_dir: Path, cfg: dict, dry_run=False) -> dict:
    """Full push: images then row. Returns the stored row."""
    if not record.get("priceable", True):
        raise PublishError(
            f"{record['slug']} has no price (no slice data). Refusing to publish "
            f"an unpriced product -- add the *.gcode.3mf export.")

    paths, hero = upload_product_images(record, gen_dir, cfg, dry_run=dry_run)
    row = build_row(record, paths, cfg, hero=hero)
    result = upsert_product(row, cfg, dry_run=dry_run)
    return {"row": result, "images": paths, "hero": hero}

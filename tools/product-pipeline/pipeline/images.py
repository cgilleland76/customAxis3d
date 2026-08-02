"""Batch-process hero photos into a consistent, web-ready set.

Background removal uses rembg when available (pip install rembg), and falls
back to a corner flood-fill that works fine on a plain sweep backdrop.
"""

from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps

SENTINEL = (255, 0, 255, 0)


def _rembg_cut(img: Image.Image):
    try:
        from rembg import remove
    except ImportError:
        return None
    try:
        return remove(img).convert("RGBA")
    except Exception:
        return None


def _flood_cut(img: Image.Image, thresh: int = 40) -> Image.Image:
    """Fallback: flood from each corner, treat what fills as background."""
    rgb = img.convert("RGB")
    work = rgb.copy()
    w, h = work.size
    for corner in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        try:
            ImageDraw.floodfill(work, corner, SENTINEL[:3], thresh=thresh)
        except Exception:
            pass
    out = rgb.convert("RGBA")
    px_work, px_out = work.load(), out.load()
    for y in range(h):
        for x in range(w):
            if px_work[x, y] == SENTINEL[:3]:
                px_out[x, y] = (0, 0, 0, 0)
    return out


def cutout(img: Image.Image, enabled: bool = True) -> Image.Image:
    if not enabled:
        return img.convert("RGBA")
    return _rembg_cut(img) or _flood_cut(img)


def frame(img: Image.Image, square: bool, padding_pct: float, background: str) -> Image.Image:
    """Trim to content, then re-canvas with consistent padding."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)

    pad = padding_pct / 100.0
    w, h = img.size
    side = max(w, h)
    canvas_w = canvas_h = int(side * (1 + 2 * pad)) if square else 0
    if not square:
        canvas_w, canvas_h = int(w * (1 + 2 * pad)), int(h * (1 + 2 * pad))

    if background.lower() == "transparent":
        canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (canvas_w, canvas_h), background)

    canvas.paste(img, ((canvas_w - w) // 2, (canvas_h - h) // 2), img)
    return canvas


def process_photo(src: Path, out_dir: Path, cfg: dict, stem: str) -> list:
    """One source photo -> N sized web images. Returns list of written paths."""
    icfg = cfg.get("images", {})
    out_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(src)
    img = ImageOps.exif_transpose(img)          # honour phone rotation
    img = cutout(img, icfg.get("remove_background", True))
    img = frame(img,
                icfg.get("square", True),
                float(icfg.get("padding_pct", 6)),
                str(icfg.get("background", "#FFFFFF")))

    fmt = str(icfg.get("format", "webp")).lower()
    quality = int(icfg.get("quality", 88))
    sizes = sorted({int(s) for s in icfg.get("sizes", [1600, 800, 400])}, reverse=True)

    # Never upscale, and never emit a file whose name overstates its real size.
    native = max(img.size)
    usable = [s for s in sizes if s <= native]
    if not usable:
        usable = [native]
        print(f"    ~ {src.name} is only {native}px; largest configured size "
              f"({sizes[0]}px) skipped rather than upscaled")

    written = []
    for size in usable:
        resized = img.copy()
        resized.thumbnail((size, size), Image.LANCZOS)
        dest = out_dir / f"{stem}-{size}.{fmt}"
        save = resized if fmt in ("webp", "png") else resized.convert("RGB")
        if fmt == "webp":
            save.save(dest, quality=quality, method=6)
        else:
            save.save(dest, quality=quality)
        written.append(str(dest))
    return written


def process_dir(photo_dir: Path, out_dir: Path, cfg: dict, slug: str) -> list:
    exts = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tif", ".tiff"}
    written = []
    if not photo_dir.is_dir():
        return written
    for i, src in enumerate(sorted(p for p in photo_dir.iterdir()
                                   if p.suffix.lower() in exts)):
        stem = f"{slug}-hero" if i == 0 else f"{slug}-{i:02d}"
        try:
            written += process_photo(src, out_dir, cfg, stem)
        except Exception as e:
            print(f"    ! skipped {src.name}: {e}")
    return written

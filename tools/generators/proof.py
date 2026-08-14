"""
Proof render.

Draws the *same* shapely polygons the mesh is extruded from, so the picture
cannot flatter the geometry. If a limb is too thin or a letter fell off, it is
missing from the proof too. This is the artefact to check against the request
before anything goes on the printer.
"""
from PIL import Image, ImageDraw

BG = (18, 21, 26)
GRID = (32, 38, 46)


def render(parts, path, width_px=1100, pad_mm=8, caption=None, notes=None):
    """parts: [(polygons, '#rrggbb', label), ...] in millimetres."""
    xs, ys = [], []
    for polys, _, _ in parts:
        for p in polys:
            x0, y0, x1, y1 = p.bounds
            xs += [x0, x1]; ys += [y0, y1]
    if not xs:
        raise ValueError("nothing to render")

    minx, maxx = min(xs) - pad_mm, max(xs) + pad_mm
    miny, maxy = min(ys) - pad_mm, max(ys) + pad_mm
    w_mm, h_mm = maxx - minx, maxy - miny
    scale = width_px / w_mm
    W, H = int(width_px), int(h_mm * scale)
    foot = 96 if (caption or notes) else 0

    img = Image.new("RGB", (W, H + foot), BG)
    d = ImageDraw.Draw(img, "RGBA")

    # 10 mm grid, so scale is readable at a glance
    step = 10.0
    x = minx - (minx % step)
    while x < maxx:
        px = (x - minx) * scale
        d.line([(px, 0), (px, H)], fill=GRID, width=1)
        x += step
    y = miny - (miny % step)
    while y < maxy:
        py = H - (y - miny) * scale
        d.line([(0, py), (W, py)], fill=GRID, width=1)
        y += step

    def to_px(pt):
        return ((pt[0] - minx) * scale, H - (pt[1] - miny) * scale)

    for polys, colour, _ in parts:
        rgb = _hex(colour)
        for p in polys:
            ext = [to_px(c) for c in p.exterior.coords]
            d.polygon(ext, fill=rgb + (255,), outline=(0, 0, 0, 90))
            for ring in p.interiors:                     # holes punched back out
                d.polygon([to_px(c) for c in ring.coords], fill=BG + (255,))

    if foot:
        d.rectangle([0, H, W, H + foot], fill=(12, 14, 18))
        ty = H + 12
        if caption:
            d.text((16, ty), caption, fill=(232, 237, 242)); ty += 20
        for line in (notes or []):
            d.text((16, ty), line, fill=(143, 160, 176)); ty += 17
        d.text((W - 190, H + 12), "%.1f x %.1f mm" % (w_mm - 2 * pad_mm, h_mm - 2 * pad_mm),
               fill=(255, 183, 77))
        d.text((W - 190, H + 32), "grid = 10 mm", fill=(107, 122, 137))

    img.save(path)
    return path


def _hex(h):
    h = (h or "#8A8A8A").lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

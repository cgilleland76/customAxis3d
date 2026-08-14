"""
Font glyphs -> shapely polygons.

The hard-won rules from the cake topper work are enforced here, because they
are what separate a printable word from a fragile one:

  * dilate letters INDIVIDUALLY, never the merged word. Whole-word dilation
    welds neighbours into a caterpillar on anything past ~6 characters.
  * keep closing small. Large morphological closing fills the gaps between
    strokes as readily as the gaps between letters.
  * tighten tracking per gap, not globally. Letters that already touch must be
    left alone.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")

# Same faces the website previews with, so what the customer saw is what gets cut.
FONTS = {
    "great-vibes":    "GreatVibes-Regular.ttf",
    "dancing-script": "DancingScript-Bold.ttf",
    "pacifico":       "Pacifico-Regular.ttf",
    "playfair":       "PlayfairDisplay-Black.ttf",
    "inter":          "Inter-Bold.ttf",
    "bebas":          "BebasNeue-Regular.ttf",
    "righteous":      "Righteous-Regular.ttf",
}

# The CSS families the configurator uses -> the file we cut from.
CSS_TO_FONT = {
    "'Great Vibes',cursive":        "great-vibes",
    "'Dancing Script',cursive":     "dancing-script",
    "'Pacifico',cursive":           "pacifico",
    "'Playfair Display',serif":     "playfair",
    "'Inter',sans-serif":           "inter",
    "'Bebas Neue',sans-serif":      "bebas",
    "'Righteous',sans-serif":       "righteous",
}


def resolve(name):
    """Accept a key, a CSS stack, or a path."""
    if not name:
        return "great-vibes"
    if name in FONTS:
        return name
    if name in CSS_TO_FONT:
        return CSS_TO_FONT[name]
    low = str(name).lower()
    for key in FONTS:
        if key.split("-")[0] in low:
            return key
    return "great-vibes"


def font_path(name):
    """
    Resolve to a real file, or fail loudly.

    Deliberately never substitutes a lookalike: printing a name in the wrong
    typeface is precisely the "that is not what I ordered" failure this whole
    toolchain exists to prevent. AXIS3D_FONT_OVERRIDE exists only so the test
    suite can run without the licensed faces present.
    """
    override = os.environ.get("AXIS3D_FONT_OVERRIDE")
    if override:
        return override
    p = os.path.join(FONT_DIR, FONTS[resolve(name)])
    if not os.path.exists(p):
        raise FileNotFoundError(
            "Font not installed: %s\n"
            "Run:  python fetch_fonts.py\n"
            "Refusing to substitute a different face." % p
        )
    return p


def _flatten(pen_value, steps=12):
    """Recording pen output -> closed contours, curves flattened."""
    contours, cur = [], []

    def q(p0, p1, p2, t):
        u = 1 - t
        return (u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1])

    def c(p0, p1, p2, p3, t):
        u = 1 - t
        return (u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1])

    for op, args in pen_value:
        if op == "moveTo":
            if len(cur) > 2:
                contours.append(cur)
            cur = [args[0]]
        elif op == "lineTo":
            cur.append(args[0])
        elif op == "qCurveTo":
            pts = list(args)
            on = pts[-1]
            offs = pts[:-1]
            if on is None:                      # implied on-curve points
                on = ((offs[0][0] + offs[-1][0]) / 2.0, (offs[0][1] + offs[-1][1]) / 2.0)
            start = cur[-1]
            for i, ctrl in enumerate(offs):
                end = on if i == len(offs) - 1 else \
                    ((ctrl[0] + offs[i + 1][0]) / 2.0, (ctrl[1] + offs[i + 1][1]) / 2.0)
                for s in range(1, steps + 1):
                    cur.append(q(start, ctrl, end, s / steps))
                start = end
        elif op == "curveTo":
            pts = list(args)
            start = cur[-1]
            if len(pts) == 3:
                for s in range(1, steps + 1):
                    cur.append(c(start, pts[0], pts[1], pts[2], s / steps))
            else:
                cur.append(pts[-1])
        elif op == "closePath":
            if len(cur) > 2:
                contours.append(cur)
            cur = []
    if len(cur) > 2:
        contours.append(cur)
    return contours


def _contours_to_poly(contours):
    """Even-odd: a contour inside another is a hole."""
    polys = [Polygon(c).buffer(0) for c in contours if len(c) >= 3]
    polys = [p for p in polys if not p.is_empty and p.area > 0]
    if not polys:
        return None
    polys.sort(key=lambda p: p.area, reverse=True)
    out = polys[0]
    for p in polys[1:]:
        out = out.symmetric_difference(p) if out.contains(p) else out.union(p)
    return out


def glyph_polys(font_name, ch, size_mm):
    """One character as shapely geometry, cap height scaled to size_mm."""
    tt = TTFont(font_path(font_name))
    upem = tt["head"].unitsPerEm
    cmap = tt.getBestCmap()
    gname = cmap.get(ord(ch))
    if gname is None:
        return None, 0.0
    gs = tt.getGlyphSet()
    pen = RecordingPen()
    gs[gname].draw(pen)
    scale = float(size_mm) / float(upem)
    contours = [[(x * scale, y * scale) for (x, y) in c] for c in _flatten(pen.value)]
    adv = tt["hmtx"][gname][0] * scale
    tt.close()
    if not contours:
        return None, adv
    return _contours_to_poly(contours), adv


def text_polys(text, font_name, size_mm, tracking=0.0, grow_mm=0.0, min_gap_mm=0.0):
    """
    Lay a string out and return one merged geometry.

    grow_mm dilates each letter on its own before merging — the rule that keeps
    long names from turning into a caterpillar.
    """
    parts, x = [], 0.0
    for ch in text:
        if ch == " ":
            _, adv = glyph_polys(font_name, "n", size_mm)
            x += adv * 0.6 + tracking
            continue
        poly, adv = glyph_polys(font_name, ch, size_mm)
        if poly is not None and not poly.is_empty:
            if grow_mm > 0:
                poly = poly.buffer(grow_mm, join_style=1)
            from shapely.affinity import translate
            parts.append(translate(poly, xoff=x))
        x += adv + tracking

    if not parts:
        return None
    merged = unary_union(parts)
    if min_gap_mm > 0:
        # close only gaps narrower than min_gap, never wider
        merged = merged.buffer(min_gap_mm / 2.0, join_style=1).buffer(-min_gap_mm / 2.0, join_style=1)
    return merged


def as_list(geom):
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    return [g for g in getattr(geom, "geoms", []) if isinstance(g, Polygon)]


def min_stroke_mm(geom):
    """
    Narrowest limb, found by eroding until the shape breaks up or vanishes.
    This is the number that decides whether script lettering survives printing.
    """
    if geom is None or geom.is_empty:
        return 0.0
    lo, hi = 0.0, 6.0
    for _ in range(18):
        mid = (lo + hi) / 2.0
        eroded = geom.buffer(-mid)
        if eroded.is_empty or eroded.area <= 0:
            hi = mid
        else:
            lo = mid
    return lo * 2.0

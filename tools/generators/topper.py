"""
Cake topper generator — rebuilt from docs/cake-topper-generator.md.

    topper width = cake diameter x 0.60
    lettering capped at 55% of width so two-letter names do not tower
    4 mm flat plate, two 50 mm spikes tapering 4 mm -> 1.2 mm
    both spike tips end at the same depth so it stands level

Output is one connected, watertight body.
"""
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from shapely.affinity import translate, scale as sscale
import text2poly as t2p
import g3mf

MM_PER_IN = 25.4
PLATE_MM = 4.0
SPIKE_LEN = 50.0
SPIKE_TOP = 4.0
SPIKE_TIP = 1.2
MIN_STROKE = 1.2          # below this the generator complains
RAIL_MIN = 2.0            # strut width used to join separated letters


def build(name, cake_in=8.0, font="great-vibes", spikes=True, colour="#1F2933"):
    width_mm = cake_in * 0.60 * MM_PER_IN
    letter_cap = width_mm * 0.55
    target_letter = min(width_mm * 0.47, letter_cap)

    # Lay out once at a nominal size, then scale to hit the width exactly.
    nominal = 40.0
    geom = t2p.text_polys(name, font, nominal, tracking=-nominal * 0.02)
    if geom is None or geom.is_empty:
        raise ValueError("nothing to cut for %r" % name)

    x0, y0, x1, y1 = geom.bounds
    if (x1 - x0) <= 0:
        raise ValueError("degenerate text")
    k = width_mm / (x1 - x0)
    if (y1 - y0) * k > target_letter:          # height, not width, is the limit
        k = target_letter / (y1 - y0)

    size = nominal * k
    grow = min(0.30, size * 0.012)             # growth capped at 1.2% of lettering height
    geom = t2p.text_polys(name, font, size, tracking=-size * 0.02,
                          grow_mm=grow, min_gap_mm=0.30)
    x0, y0, x1, y1 = geom.bounds
    geom = translate(geom, xoff=-x0, yoff=-y0)
    x0, y0, x1, y1 = geom.bounds

    warnings = []
    stroke = t2p.min_stroke_mm(geom)
    if stroke < MIN_STROKE:
        warnings.append(
            "narrowest stroke is %.2f mm (want >= %.1f) — go up a cake size or shorten the word"
            % (stroke, MIN_STROKE))

    # One body or it falls apart on the plate. A baseline rail is the honest fix
    # for non-connecting faces; script faces usually already touch.
    pieces = t2p.as_list(geom)
    rail_used = False
    if len(pieces) > 1:
        rail_h = max(RAIL_MIN, size * 0.06)
        rail = box(x0, y0, x1, y0 + rail_h)
        geom = unary_union([geom, rail])
        rail_used = True
        pieces = t2p.as_list(geom)

    body = [geom]
    if spikes:
        x0, y0, x1, y1 = geom.bounds
        for frac in (0.30, 0.70):
            sx = x0 + (x1 - x0) * frac
            shoulder = _lowest_y_near(geom, sx, SPIKE_TOP)
            spike = Polygon([
                (sx - SPIKE_TOP / 2.0, shoulder + 0.5),
                (sx + SPIKE_TOP / 2.0, shoulder + 0.5),
                (sx + SPIKE_TIP / 2.0, y0 - SPIKE_LEN),
                (sx - SPIKE_TIP / 2.0, y0 - SPIKE_LEN),
            ])
            body.append(spike)
        geom = unary_union(body)

    polys = t2p.as_list(geom)
    verts, tris = g3mf.extrude(polys, PLATE_MM)
    part = g3mf.Part(name + " topper", verts, tris, colour)

    ok, msg = part.is_manifold()
    if not ok:
        warnings.append("mesh is not manifold: " + msg)
    if len(polys) > 1:
        warnings.append("%d separate bodies — they will print as loose pieces" % len(polys))

    info = {
        "cake_in": cake_in,
        "target_width_mm": round(width_mm, 1),
        "actual_width_mm": round(part.size()[0], 1),
        "height_mm": round(part.size()[1], 1),
        "thickness_mm": PLATE_MM,
        "lettering_mm": round(y1 - y0, 1),
        "min_stroke_mm": round(stroke, 2),
        "bodies": len(polys),
        "rail_added": rail_used,
        "warnings": warnings,
    }
    return part, polys, info


def _lowest_y_near(geom, x, width):
    strip = box(x - width / 2.0, geom.bounds[1] - 1, x + width / 2.0, geom.bounds[3] + 1)
    hit = geom.intersection(strip)
    return geom.bounds[1] if hit.is_empty else hit.bounds[1]

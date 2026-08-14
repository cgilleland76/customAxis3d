"""
Minimal 3MF writer.

A 3MF is a zip holding an XML mesh. Writing it directly (rather than leaning on
a mesh library) keeps the dependency list short and, more importantly, keeps
full control of how multi-colour parts are structured: one OBJECT per colour,
not paint data. Full-depth colour regions look right from both faces, which is
what these flat parts need.
"""
import zipfile, xml.sax.saxutils as sx

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>"""


class Part:
    """One printable body in one colour."""
    def __init__(self, name, verts, tris, colour="#8A8A8A"):
        self.name = name
        self.verts = verts          # [(x, y, z), ...] in millimetres
        self.tris = tris            # [(a, b, c), ...] indices, CCW seen from outside
        self.colour = colour

    def bounds(self):
        xs = [v[0] for v in self.verts]; ys = [v[1] for v in self.verts]; zs = [v[2] for v in self.verts]
        return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))

    def size(self):
        x0, y0, z0, x1, y1, z1 = self.bounds()
        return (x1 - x0, y1 - y0, z1 - z0)

    def is_manifold(self):
        """Every edge used exactly twice, in opposite directions."""
        edges = {}
        for a, b, c in self.tris:
            for e in ((a, b), (b, c), (c, a)):
                key = tuple(sorted(e))
                edges.setdefault(key, []).append(e)
        for key, uses in edges.items():
            if len(uses) != 2:
                return False, "edge %s used %d times" % (str(key), len(uses))
            if uses[0] == uses[1]:
                return False, "edge %s has the same winding twice" % (str(key),)
        return True, "manifold"


def write(path, parts, unit="millimeter"):
    """Write parts into one 3MF. Each part becomes its own object in the build."""
    objs, items = [], []
    for i, p in enumerate(parts, start=1):
        v = "".join('<vertex x="%.4f" y="%.4f" z="%.4f"/>' % tuple(pt) for pt in p.verts)
        t = "".join('<triangle v1="%d" v2="%d" v3="%d"/>' % tri for tri in p.tris)
        objs.append(
            '<object id="%d" type="model" name="%s" partnumber="%s">'
            '<mesh><vertices>%s</vertices><triangles>%s</triangles></mesh></object>'
            % (i, sx.quoteattr(p.name)[1:-1], sx.quoteattr(p.colour)[1:-1], v, t)
        )
        items.append('<item objectid="%d"/>' % i)

    model = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="%s" xml:lang="en-US" '
        'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        '<metadata name="Application">customAxis3d generators</metadata>'
        '<resources>%s</resources><build>%s</build></model>'
        % (unit, "".join(objs), "".join(items))
    )

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("3D/3dmodel.model", model)
    return path


def extrude(polys, thickness, z0=0.0, weld_mm=0.005):
    """
    Shapely polygons -> a closed, watertight prism.

    The walls are derived FROM the cap triangulation rather than from the ring
    point lists. That is the whole trick: ear clipping is free to discard a
    degenerate ear, and if the walls were built independently they would then
    subdivide an edge the cap spans in one piece, leaving a seam. Taking the
    boundary edges of the finished triangulation makes the two agree by
    construction, so holes stay holes and the shell always closes.
    """
    import numpy as np
    import mapbox_earcut as earcut

    verts, tris = [], []

    for poly in polys:
        poly = poly.buffer(0)
        if poly.is_empty:
            continue
        for piece in (list(poly.geoms) if poly.geom_type == "MultiPolygon" else [poly]):
            piece = piece.simplify(weld_mm).buffer(0)
            if piece.is_empty:
                continue
            for sub in (list(piece.geoms) if piece.geom_type == "MultiPolygon" else [piece]):
                rings = [_clean(list(sub.exterior.coords)[:-1])] + \
                        [_clean(list(r.coords)[:-1]) for r in sub.interiors]
                rings = [r for r in rings if len(r) >= 3]
                if not rings:
                    continue

                for i, r in enumerate(rings):          # exterior CCW, holes CW
                    if (_area(r) > 0) != (i == 0):
                        rings[i] = r[::-1]

                flat, ring_ends = [], []
                for r in rings:
                    flat.extend(r)
                    ring_ends.append(len(flat))

                cap = earcut.triangulate_float64(
                    np.array(flat, dtype=np.float64),
                    np.array(ring_ends, dtype=np.uint32),
                )
                if len(cap) < 3:
                    continue
                cap = [(int(cap[i]), int(cap[i + 1]), int(cap[i + 2]))
                       for i in range(0, len(cap), 3)]
                cap = [t for t in cap if len({t[0], t[1], t[2]}) == 3]

                base_bot = len(verts)
                for (x, y) in flat:
                    verts.append((float(x), float(y), float(z0)))
                base_top = len(verts)
                for (x, y) in flat:
                    verts.append((float(x), float(y), float(z0 + thickness)))

                for a, b, c in cap:
                    tris.append((base_bot + a, base_bot + c, base_bot + b))   # down
                    tris.append((base_top + a, base_top + b, base_top + c))   # up

                # Boundary of the triangulation: any edge used by exactly one
                # triangle. Those, and only those, need a wall.
                count, direction = {}, {}
                for a, b, c in cap:
                    for e in ((a, b), (b, c), (c, a)):
                        key = (e[0], e[1]) if e[0] < e[1] else (e[1], e[0])
                        count[key] = count.get(key, 0) + 1
                        direction.setdefault(key, e)

                for key, n in count.items():
                    if n != 1:
                        continue
                    a, b = direction[key]
                    tris.append((base_bot + a, base_bot + b, base_top + b))
                    tris.append((base_bot + a, base_top + b, base_top + a))
    return verts, tris


def _clean(ring, eps=1e-7):
    """
    Drop consecutive duplicate and near-duplicate points.

    Shapely's buffer and union routinely emit them, and a zero-length edge
    makes the wall quad degenerate while ear clipping silently skips the
    matching cap triangle — which shows up later as a hole in the mesh.
    """
    out = []
    for pt in ring:
        if not out or (abs(pt[0] - out[-1][0]) > eps or abs(pt[1] - out[-1][1]) > eps):
            out.append((float(pt[0]), float(pt[1])))
    while len(out) > 1 and abs(out[0][0] - out[-1][0]) <= eps and abs(out[0][1] - out[-1][1]) <= eps:
        out.pop()

    # drop exactly-collinear points, for the reason described in extrude()
    if len(out) > 3:
        keep = []
        n = len(out)
        for i in range(n):
            a, b, c = out[i - 1], out[i], out[(i + 1) % n]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if abs(cross) > 1e-9:
                keep.append(b)
        if len(keep) >= 3:
            out = keep
    return out


def _area(ring):
    s = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % len(ring)]
        s += x1 * y2 - x2 * y1
    return s / 2.0

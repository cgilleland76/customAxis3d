"""
Extract everything a product listing needs from a sliced 3MF project file.

The trick: when you slice in Orca/Bambu Studio and then "Save Project As", the
resulting .3mf already contains the print time, per-filament gram usage, the
filament colors, and the plate preview images. So we never shell out to the
slicer CLI -- we just read the zip. Falls back to gcode if never sliced.
"""

from __future__ import annotations

import io, json, math, re, zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field, asdict
from pathlib import Path

CORE_NS = "{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}"
PROD_NS = "{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}"
PATH_ATTR = f"{PROD_NS}path"


@dataclass
class Filament:
    index: int
    type: str = ""
    color: str = ""
    used_g: float = 0.0
    used_m: float = 0.0

    def as_dict(self):
        return asdict(self)


@dataclass
class Spec:
    source: str = ""
    print_time_s: int = 0
    total_weight_g: float = 0.0
    filaments: list = field(default_factory=list)
    bbox_mm: tuple = None
    object_names: list = field(default_factory=list)
    layer_height: float = None
    nozzle_diameter: float = None
    printer: str = ""
    thumbnails: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    layer_count: int = 0
    dimension_source: str = "model geometry"
    scale_mismatch: float = 0.0
    print_profile: str = ""
    plate_count: int = 1
    part_count: int = 0
    largest_part: tuple = (0.0, 0.0)
    plate_spread: tuple = (0.0, 0.0)
    notes: list = field(default_factory=list)

    @property
    def print_time_h(self):
        return self.print_time_s / 3600.0

    @property
    def print_time_human(self):
        if not self.print_time_s:
            return "unknown"
        # round to the nearest minute so we match what the slicer shows
        total_min = int(round(self.print_time_s / 60.0))
        h, m = divmod(total_min, 60)
        if h and m:
            return f"{h}h {m}m"
        return f"{h}h" if h else f"{m}m"

    @property
    def dimensions_human(self):
        if not self.bbox_mm:
            return "unknown"
        x, y, z = self.bbox_mm
        if not z:
            return f"{x:.0f} x {y:.0f} mm (height unknown)"
        return f"{x:.0f} x {y:.0f} x {z:.0f} mm"

    @property
    def color_count(self):
        return len([f for f in self.filaments if f.used_g > 0]) or len(self.filaments)

    @property
    def materials(self):
        seen, out = set(), []
        for f in self.filaments:
            t = (f.type or "").upper()
            if t and t not in seen:
                seen.add(t)
                out.append(t)
        return out

    def as_dict(self):
        d = asdict(self)
        d["filaments"] = [f.as_dict() for f in self.filaments]
        d["print_time_human"] = self.print_time_human
        d["print_time_h"] = round(self.print_time_h, 3)
        d["dimensions_human"] = self.dimensions_human
        d["color_count"] = self.color_count
        d["materials"] = self.materials
        return d


# ---------------------------------------------------------------- 3MF ----

def read_3mf(path, thumb_dir=None) -> Spec:
    path = Path(path)
    spec = Spec(source=str(path))

    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())

        slice_info = _find(names, r"[Ss]lice_info\.config$")
        if slice_info:
            _parse_slice_info(z.read(slice_info).decode("utf-8", "replace"), spec)
        else:
            spec.warnings.append(
                "No slice_info.config in the 3MF -- this project was saved without "
                "slicing. Slice it, then File > Save Project As, to get print time "
                "and filament weight automatically.")

        proj = _find(names, r"project_settings\.config$")
        if proj:
            try:
                _parse_project_settings(
                    json.loads(z.read(proj).decode("utf-8", "replace")), spec)
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                spec.warnings.append(f"Could not parse project_settings.config: {e}")

        model = _find(names, r"3[dD]model\.model$") or _find(names, r"\.model$")
        if model:
            try:
                _parse_model(z.read(model), spec, z=z, root_part=model)
            except ET.ParseError as e:
                spec.warnings.append(f"Could not parse model geometry: {e}")

        # Sliced-output 3MFs (*.gcode.3mf) ship with <resources> empty, so the
        # bounding box has to come from the plate JSON (XY) + gcode header (Z).
        if not spec.bbox_mm:
            _fallback_dimensions(z, names, spec)

        if thumb_dir:
            spec.thumbnails = _extract_thumbnails(z, names, Path(thumb_dir))

    return spec


def _find(names, pattern):
    rx = re.compile(pattern)
    m = sorted(n for n in names if rx.search(n))
    return m[0] if m else None


def _parse_slice_info(xml_text, spec):
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        spec.warnings.append(f"Could not parse slice_info.config: {e}")
        return

    total_time, total_weight, by_index = 0, 0.0, {}
    for plate in root.iter("plate"):
        for md in plate.findall("metadata"):
            key, val = md.get("key", ""), md.get("value", "")
            if key == "prediction":
                total_time += int(float(val or 0))
            elif key == "weight":
                total_weight += float(val or 0)
        for ob in plate.findall("object"):
            nm = ob.get("name", "")
            if nm and nm not in spec.object_names and not _is_helper(nm):
                spec.object_names.append(nm)

        for fil in plate.findall("filament"):
            try:
                idx = int(fil.get("id", "0"))
            except ValueError:
                continue
            f = by_index.setdefault(idx, Filament(index=idx))
            f.type = fil.get("type", "") or f.type
            f.color = _norm_hex(fil.get("color", "")) or f.color
            f.used_g += float(fil.get("used_g") or 0)
            f.used_m += float(fil.get("used_m") or 0)

    if not root.findall("plate"):
        spec.warnings.append(
            "No slice results in this project 3MF. Bambu/Orca do not store them "
            "in saved projects -- they only land in the exported sliced plate "
            "(*.gcode.3mf). Drop that export in this folder too.")

    spec.print_time_s = total_time
    spec.total_weight_g = round(total_weight, 2)
    spec.filaments = [by_index[k] for k in sorted(by_index)]
    if not spec.total_weight_g and spec.filaments:
        spec.total_weight_g = round(sum(f.used_g for f in spec.filaments), 2)


def _parse_project_settings(cfg, spec):
    def first(key):
        v = cfg.get(key)
        if isinstance(v, list):
            return str(v[0]) if v else ""
        return str(v) if v is not None else ""

    spec.layer_height = _safe_float(first("layer_height"))
    spec.nozzle_diameter = _safe_float(first("nozzle_diameter"))
    spec.printer = first("printer_model") or first("printer_settings_id")
    spec.print_profile = first("print_settings_id")

    colors = cfg.get("filament_colour") or cfg.get("filament_color") or []
    types = cfg.get("filament_type") or []
    if isinstance(colors, str):
        colors = [colors]
    if isinstance(types, str):
        types = [types]

    for i, color in enumerate(colors, start=1):
        existing = next((f for f in spec.filaments if f.index == i), None)
        if existing is None:
            if spec.filaments:
                continue
            existing = Filament(index=i)
            spec.filaments.append(existing)
        if not existing.color:
            existing.color = _norm_hex(color)
        if not existing.type and i <= len(types):
            existing.type = str(types[i - 1])

    spec.filaments.sort(key=lambda f: f.index)


def _parse_model(data, spec, z=None, root_part="3D/3dmodel.model"):
    """Bounding box across the whole build, following 3MF production-extension
    parts (Bambu splits big meshes into 3D/Objects/*.model)."""
    parts = {}

    def structure(part):
        """One streaming pass per part: local AABB + component links per object.
        Never holds the vertex list, so a 100 MB part costs almost no memory."""
        if part in parts:
            return parts[part]
        table = {}
        if part == root_part:
            src = io.BytesIO(data)
        elif z is not None:
            try:
                src = io.BytesIO(z.read(part.lstrip("/")))
            except KeyError:
                parts[part] = table
                return table
        else:
            parts[part] = table
            return table

        cur = None
        for event, el in ET.iterparse(src, events=("start", "end")):
            if event == "start" and el.tag == f"{CORE_NS}object":
                cur = {"id": el.get("id"), "name": el.get("name") or "",
                       "lo": [math.inf] * 3, "hi": [-math.inf] * 3, "components": []}
            elif event == "end":
                if el.tag == f"{CORE_NS}vertex" and cur is not None:
                    v = (float(el.get("x", 0)), float(el.get("y", 0)), float(el.get("z", 0)))
                    for i in range(3):
                        if v[i] < cur["lo"][i]:
                            cur["lo"][i] = v[i]
                        if v[i] > cur["hi"][i]:
                            cur["hi"][i] = v[i]
                    el.clear()
                elif el.tag == f"{CORE_NS}component" and cur is not None:
                    cur["components"].append((el.get(PATH_ATTR) or part,
                                              el.get("objectid", ""),
                                              _parse_transform(el.get("transform"))))
                    el.clear()
                elif el.tag == f"{CORE_NS}object" and cur is not None:
                    table[cur["id"]] = cur
                    cur = None
                    el.clear()
                elif el.tag in (f"{CORE_NS}triangle", f"{CORE_NS}vertices",
                                f"{CORE_NS}triangles"):
                    el.clear()
        parts[part] = table
        return table

    lo, hi, used_names, rotated = [math.inf] * 3, [-math.inf] * 3, [], [False]

    def accumulate(part, oid, xf, depth=0):
        if depth > 8:
            return
        obj = structure(part).get(oid)
        if not obj:
            return
        if obj["name"] and obj["name"] not in used_names and not _is_helper(obj["name"]):
            used_names.append(obj["name"])
        if all(math.isfinite(v) for v in obj["lo"] + obj["hi"]):
            if xf and _is_rotated(xf):
                rotated[0] = True
            for corner in _corners(obj["lo"], obj["hi"]):
                pt = _apply(xf, corner)
                for i in range(3):
                    if pt[i] < lo[i]:
                        lo[i] = pt[i]
                    if pt[i] > hi[i]:
                        hi[i] = pt[i]
        for cpart, cid, cxf in obj["components"]:
            accumulate(cpart, cid, _compose(xf, cxf), depth + 1)

    root = ET.fromstring(data)
    build = root.find(f"{CORE_NS}build")
    items = list(build.findall(f"{CORE_NS}item")) if build is not None else []
    if items:
        for item in items:
            accumulate(item.get(PATH_ATTR) or root_part,
                       item.get("objectid", ""),
                       _parse_transform(item.get("transform")))
    else:
        for oid in structure(root_part):
            accumulate(root_part, oid, None)

    if all(math.isfinite(v) for v in lo + hi):
        spec.bbox_mm = tuple(round(hi[i] - lo[i], 2) for i in range(3))
        spec.dimension_source = ("model geometry (approximate: object is rotated "
                                 "off-axis)" if rotated[0] else "model geometry")
    if used_names:
        spec.object_names = used_names


def _corners(lo, hi):
    return [(lo[0] if not (i & 1) else hi[0],
             lo[1] if not (i & 2) else hi[1],
             lo[2] if not (i & 4) else hi[2]) for i in range(8)]


def _is_rotated(xf, tol=1e-6):
    """True if the 3x3 block is not a diagonal scale (i.e. real rotation/shear)."""
    return any(abs(xf[r * 3 + c]) > tol for r in range(3) for c in range(3) if r != c)


HELPER_NAMES = ("wipe_tower", "wipetower", "prime_tower", "brim", "skirt")


def _is_helper(name: str) -> bool:
    return any(h in (name or "").lower().replace(" ", "_") for h in HELPER_NAMES)


def _active_plates(names):
    """Plate numbers that were actually sliced.

    A project can carry stale plate_N.json files from arrangements that were
    never sliced -- only the plate with a matching plate_N.gcode is real.
    Reading the wrong one silently reports another model's dimensions.
    """
    have_gcode = set()
    for n in names:
        m = re.search(r"plate_(\d+)\.gcode$", n)
        if m:
            have_gcode.add(int(m.group(1)))
    return sorted(have_gcode)


def _fallback_dimensions(z, names, spec):
    """Recover size from a sliced-output 3MF that has no mesh data."""
    plates = _active_plates(names)
    spec.plate_count = len(plates)

    # --- XY from the plate bbox JSON, active plates only ------------------
    lo_x = lo_y = math.inf
    hi_x = hi_y = -math.inf
    found = False
    for pn in plates or [1]:
        cand = _find(names, rf"plate_{pn}\.json$")
        if not cand:
            continue
        try:
            data = json.loads(z.read(cand).decode("utf-8", "replace"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        real = [o for o in data.get("bbox_objects", [])
                if not _is_helper(o.get("name", ""))]
        for o in real:
            b = o.get("bbox") or []
            if len(b) != 4:
                continue
            w, d = b[2] - b[0], b[3] - b[1]
            spec.part_count += 1
            # Track the largest single part as well as the whole plate: for a
            # multi-part model the plate footprint is just how the parts were
            # arranged, which tells you nothing about the finished object.
            if w * d > spec.largest_part[0] * spec.largest_part[1]:
                spec.largest_part = (round(w, 2), round(d, 2))
            lo_x, lo_y = min(lo_x, b[0]), min(lo_y, b[1])
            hi_x, hi_y = max(hi_x, b[2]), max(hi_y, b[3])
            found = True
            nm = o.get("name", "")
            if nm and nm not in spec.object_names:
                spec.object_names.append(nm)
        if spec.layer_height is None and real:
            lh = real[0].get("layer_height")
            if lh:
                spec.layer_height = round(float(lh), 3)
        if spec.nozzle_diameter is None and data.get("nozzle_diameter"):
            spec.nozzle_diameter = round(float(data["nozzle_diameter"]), 2)

    xy = (hi_x - lo_x, hi_y - lo_y) if found else None

    # --- Z from the tallest active plate's gcode header --------------------
    zh = None
    layers = 0
    for pn in plates or [1]:
        g = _find(names, rf"plate_{pn}\.gcode$")
        if not g:
            continue
        try:
            with z.open(g) as fh:
                head = fh.read(65536).decode("utf-8", "replace")
        except (KeyError, OSError):
            continue
        m = re.search(r";\s*max_z_height:\s*([\d.]+)", head, re.I)
        if m:
            zh = max(zh or 0, float(m.group(1)))
        m = re.search(r";\s*total layer number:\s*(\d+)", head, re.I)
        if m:
            layers = max(layers, int(m.group(1)))
    spec.layer_count = layers
    if zh is None and spec.layer_height and layers:
        zh = layers * spec.layer_height

    if xy and zh:
        if spec.part_count > 1:
            # Report the biggest part, not the spread of the layout.
            spec.bbox_mm = (spec.largest_part[0], spec.largest_part[1], round(zh, 2))
            spec.dimension_source = (
                f"largest of {spec.part_count} parts + gcode header — this is a "
                f"multi-part model, so confirm the assembled size by hand")
            spec.plate_spread = (round(xy[0], 2), round(xy[1], 2))
            spec.warnings.append(
                f"{spec.part_count} parts — assembled size is a guess. Showing the "
                f"largest part ({spec.largest_part[0]:.0f} x "
                f"{spec.largest_part[1]:.0f} x {zh:.0f} mm); they were laid out "
                f"across {xy[0]:.0f} x {xy[1]:.0f} mm. A sliced file records the "
                f"layout, not how the parts go together — set the real size with "
                f"'dimensions:' in product.yml.")
        else:
            spec.bbox_mm = (round(xy[0], 2), round(xy[1], 2), round(zh, 2))
            spec.dimension_source = (
                f"plate bbox + gcode header ({len(plates)} plate(s); geometry "
                f"stripped from this 3MF)")
    elif xy:
        spec.bbox_mm = (round(xy[0], 2), round(xy[1], 2), 0.0)
        spec.warnings.append("Height unknown -- no max_z_height in the gcode header.")

    if len(plates) > 1:
        # One export is one product, so multiple plates are just how the job
        # was split across the bed. Totals are what matter; no action needed.
        spec.notes.append(
            f"{len(plates)} plates in this export; time and weight are the "
            f"total across all of them.")


def _parse_transform(text):
    if not text:
        return None
    try:
        parts = [float(p) for p in text.replace(",", " ").split()]
    except ValueError:
        return None
    return parts if len(parts) == 12 else None


def _apply(xf, v):
    if not xf:
        return v
    x, y, z = v
    return (xf[0]*x + xf[3]*y + xf[6]*z + xf[9],
            xf[1]*x + xf[4]*y + xf[7]*z + xf[10],
            xf[2]*x + xf[5]*y + xf[8]*z + xf[11])


def _compose(outer, inner):
    if outer is None:
        return inner
    if inner is None:
        return outer
    out = []
    for r in range(3):
        for c in range(3):
            out.append(sum(inner[r*3 + k] * outer[k*3 + c] for k in range(3)))
    for c in range(3):
        out.append(sum(inner[9 + k] * outer[k*3 + c] for k in range(3)) + outer[9 + c])
    return out


def _extract_thumbnails(z, names, out_dir):
    """Pull out the previews for plates that were actually sliced.

    A project carries a thumbnail for every plate it has ever held, including
    arrangements that were never sliced and leftovers from other models. Taking
    the largest PNG picks one of those at random -- which is how a card game
    ended up showing a Winnie the Pooh wand.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    active = set(_active_plates(names))

    def plate_of(name):
        m = re.search(r"_(\d+)(?:_small)?\.png$", name)
        return int(m.group(1)) if m else None

    cands = []
    for n in names:
        low = n.lower()
        if not low.endswith(".png") or "small" in low or "pick_" in low:
            continue
        if not any(k in low for k in ("thumbnail", "plate", "preview", "top_")):
            continue
        pn = plate_of(n)
        if active and pn is not None and pn not in active:
            continue                      # a plate that was never sliced
        cands.append(n)

    # plate_N.png is the lit render and makes the best hero image;
    # plate_no_light and top_N are alternates.
    def rank(n):
        low = n.lower()
        if "plate_no_light" in low:
            return 2
        if "top_" in low:
            return 3
        return 1

    written = []
    for n in sorted(cands, key=lambda n: (rank(n), n)):
        try:
            data = z.read(n)
        except KeyError:
            continue
        if len(data) < 2048:
            continue
        dest = out_dir / f"slicer_{Path(n).name}"
        dest.write_bytes(data)
        written.append(str(dest))
    return written


# ------------------------------------------------------------- gcode ----

_TIME_RX = re.compile(r";\s*(?:total estimated time|estimated printing time[^=:]*)\s*[=:]\s*(.+)", re.I)
_GRAMS_RX = re.compile(r";\s*(?:total )?filament used \[g\]\s*=\s*([\d.,\s]+)", re.I)
_MM_RX = re.compile(r";\s*(?:total )?filament used \[mm\]\s*=\s*([\d.,\s]+)", re.I)
_TYPE_RX = re.compile(r";\s*filament_type\s*=\s*(.+)", re.I)
_COLOR_RX = re.compile(r";\s*(?:filament_colour|filament_color|extruder_colour)\s*=\s*(.+)", re.I)


def read_gcode(path) -> Spec:
    path = Path(path)
    spec = Spec(source=str(path))
    text = _read_text_tail(path)

    m = _TIME_RX.search(text)
    if m:
        spec.print_time_s = _parse_duration(m.group(1))

    grams = _split_nums(_GRAMS_RX.search(text))
    meters = [v / 1000.0 for v in _split_nums(_MM_RX.search(text))]
    types = _split_strs(_TYPE_RX.search(text))
    colors = _split_strs(_COLOR_RX.search(text))

    for i in range(max(len(grams), len(meters), len(types), len(colors), 0)):
        spec.filaments.append(Filament(
            index=i + 1,
            type=types[i] if i < len(types) else "",
            color=_norm_hex(colors[i]) if i < len(colors) else "",
            used_g=grams[i] if i < len(grams) else 0.0,
            used_m=meters[i] if i < len(meters) else 0.0))

    spec.total_weight_g = round(sum(f.used_g for f in spec.filaments), 2)
    if not spec.print_time_s:
        spec.warnings.append("Could not find an estimated print time in the gcode.")
    return spec


def _read_text_tail(path, tail_bytes=400_000):
    size = path.stat().st_size
    with path.open("rb") as fh:
        head = fh.read(min(size, 200_000))
        tail = b""
        if size > tail_bytes:
            fh.seek(-tail_bytes, 2)
            tail = fh.read()
    return (head + b"\n" + tail).decode("utf-8", "replace")


def _parse_duration(text):
    text = text.strip().split(";")[0]
    total = 0.0
    for value, unit in re.findall(r"(\d+(?:\.\d+)?)\s*([dhms])", text, re.I):
        total += float(value) * {"d": 86400, "h": 3600, "m": 60, "s": 1}[unit.lower()]
    if not total:
        m = re.match(r"(\d+):(\d+):(\d+)", text)
        if m:
            h, mi, s = map(int, m.groups())
            total = h * 3600 + mi * 60 + s
    return int(total)


def _split_nums(m):
    if not m:
        return []
    out = []
    for p in m.group(1).replace(",", " ").split():
        v = _safe_float(p)
        if v is not None:
            out.append(v)
    return out


def _split_strs(m):
    return [p.strip() for p in m.group(1).split(";") if p.strip()] if m else []


def _safe_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _norm_hex(color):
    c = (color or "").strip()
    if not c:
        return ""
    if not c.startswith("#"):
        c = "#" + c
    c = c.upper()
    if len(c) == 9:
        c = c[:7]
    return c if re.fullmatch(r"#[0-9A-F]{6}", c) else ""


def load_spec(path, thumb_dir=None) -> Spec:
    path = Path(path)
    ext = path.suffix.lower()
    if ext == ".3mf":
        return read_3mf(path, thumb_dir=thumb_dir)
    if ext in {".gcode", ".gco", ".g"}:
        return read_gcode(path)
    raise ValueError(f"Unsupported file type for spec extraction: {path.name}")


def merge_specs(specs):
    """Bambu Studio splits what a listing needs across two files:

        project .3mf   -> mesh geometry (dimensions, and the mesh Blender needs)
        .gcode.3mf     -> slice results (print time, filament grams, colors)

    Neither has both. Drop both in the product folder and this stitches them
    into one Spec: slice numbers from whichever file has them, geometry from
    whichever file has real mesh data.
    """
    specs = [s for s in specs if s]
    if not specs:
        raise ValueError("no specs to merge")
    if len(specs) == 1:
        return specs[0]

    sliced = next((s for s in specs if s.print_time_s > 0 or s.total_weight_g > 0), None)
    meshed = next((s for s in specs if s.dimension_source.startswith("model geometry")), None)

    base = sliced or specs[0]
    out = Spec(
        source=" + ".join(Path(s.source).name for s in specs),
        print_time_s=base.print_time_s,
        total_weight_g=base.total_weight_g,
        filaments=list(base.filaments),
        layer_count=base.layer_count,
    )

    geo = meshed or base
    out.bbox_mm = geo.bbox_mm
    out.dimension_source = geo.dimension_source
    out.object_names = geo.object_names or base.object_names

    # Different print profiles means the export was not made from this project.
    profiles = {s.print_profile for s in specs if s.print_profile}
    if len(profiles) > 1:
        out.warnings.append(
            "MISMATCH: these files were sliced with different print profiles ("
            + " vs ".join(sorted(profiles)) +
            "). The price reflects the export's profile, not the project's.")

    for s in specs:                      # first non-empty wins for the rest
        out.layer_height = out.layer_height or s.layer_height
        out.print_profile = out.print_profile or s.print_profile
        out.nozzle_diameter = out.nozzle_diameter or s.nozzle_diameter
        out.printer = out.printer or s.printer
        out.thumbnails = out.thumbnails or s.thumbnails

    # The project and the export must describe the same object. Compare heights:
    # X/Y are unreliable (the sliced bbox includes brim and support), Z is not.
    if sliced and meshed and sliced is not meshed:
        zs, zm = (sliced.bbox_mm or (0, 0, 0))[2], (meshed.bbox_mm or (0, 0, 0))[2]
        if zs and zm and abs(zs - zm) / max(zs, zm) > 0.05:
            out.warnings.append(
                f"MISMATCH: the sliced export is {zs:.1f} mm tall but the project "
                f"mesh is {zm:.1f} mm ({zs / zm:.2f}x). These are different "
                f"versions or scales -- the price below is computed from the "
                f"export, the dimensions from the project. Re-export the plate "
                f"from this project before trusting either.")
            out.scale_mismatch = round(zs / zm, 3)

    if not sliced:
        out.warnings.append(
            "No file here carries slice results. Export the sliced plate from "
            "Bambu/Orca (it saves as *.gcode.3mf) and drop it in this folder "
            "next to the project -- that is where print time and weight live.")
    if not meshed:
        out.warnings.append(
            "No file here carries mesh geometry. Add the project .3mf "
            "(File > Save Project As) if you want exact dimensions or "
            "rendered color variants.")
    return out

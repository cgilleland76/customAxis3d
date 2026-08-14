# Generators

Turn a saved customer request into a printable 3MF plus a proof image, with no
re-typing of parameters. That is the whole point: the request already holds the
exact numbers, so nothing should be transcribed by hand.

## Status

| Piece | State |
|---|---|
| `g3mf.py` — 3MF writer + extruder | done, watertight |
| `text2poly.py` — font glyphs to polygons | done |
| `proof.py` — proof render | done |
| `topper.py` — cake toppers | done, matches the build notes |
| `sign.py` — initial + name signs | **not written yet** |
| `cardholder.py` — tap-to-pay holders | **not written yet** |
| `make.py` — request in, 3MF + proof out | **not written yet** |

## Setup

```bash
pip install fonttools shapely pillow numpy mapbox_earcut
python fetch_fonts.py          # the seven faces the site previews with
```

`fetch_fonts.py` pulls from the Google Fonts repo. It must succeed before the
generators will run: a missing face raises rather than substituting a lookalike,
because printing a name in the wrong typeface is exactly the failure this
toolchain exists to prevent. `AXIS3D_FONT_OVERRIDE` forces one file, for tests
only.

## Cake toppers

```python
import topper, g3mf, proof
part, polys, info = topper.build("Anna", cake_in=8, font="great-vibes")
g3mf.write("anna.3mf", [part])
proof.render([(polys, "#4db6ac", "topper")], "anna-proof.png")
```

Rules carried over from `docs/cake-topper-generator.md`:

- width = cake diameter x 0.60; lettering capped at 55% of width
- 4 mm plate, two 50 mm spikes tapering 4.0 -> 1.2 mm, tips level
- letters dilated individually, growth capped at 1.2% of lettering height
- gap closing capped at 0.3 mm
- warns below a 1.2 mm stroke
- a baseline rail is added only when the face leaves letters separated

Verified against the reference table:

| cake | notes say | generated |
|---|---|---|
| 6 in | 91 mm | 92.0 mm |
| 8 in | 122 mm | 122.5 mm |
| 10 in | 152 mm | 153.0 mm |
| 12 in | 183 mm | 183.5 mm |

The ~0.5 mm excess is the per-letter dilation widening the bounds. Worth
trimming to hit the target exactly.

## Why the extruder is built the way it is

Walls are derived from the cap triangulation's boundary edges, not from the
ring point lists. Ear clipping discards degenerate ears; if the walls were
built independently they would subdivide an edge the cap spans in one piece,
and the shell would not close. Deriving one from the other makes them agree by
construction. Three earlier approaches all failed this way — see the git
history before changing it.

`is_manifold()` on every part checks each edge is used exactly twice with
opposite winding. Nothing should ship without passing it.

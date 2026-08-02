# Product pipeline

Turn a sliced 3MF into a priced, written, image-ready product listing with one command.

## The idea

A 3MF that has been **sliced and then saved** already contains print time, per-color
filament grams, filament colors, and the slicer's own preview renders. That is most of
a product listing. This reads it straight out of the zip — no slicer CLI, no manual math.

## Setup

```bash
pip install pyyaml pillow
pip install rembg          # optional, much better background removal
```

## Per product

```
products/<slug>/
    model.3mf        # sliced, then File > Save Project As  (or a .gcode.3mf export)
    photos/          # optional: raw hero shots, straight off the camera
    product.yml      # optional: the few fields you actually decide
```

`product.yml`:

```yaml
name: "Hex Planter"
category: "Home"
tags: ["planter", "hexagon"]
notes: "One or two sentences in your own words."
# price: 34.99     # uncomment to override the computed price
```

## Run

```bash
python3 -m pipeline.build products/hex-planter      # one product
python3 -m pipeline.build --all                     # everything
python3 -m pipeline.build products/x --dry-run      # print, write nothing
```

## Output

Written to `products/<slug>/_generated/`:

| File | What it is |
|---|---|
| `spec.json` | machine-readable record: spec, price breakdown, tags, image names |
| `copy_draft.md` | a filled-in listing you edit down, never a blank page |
| `copy_prompt.txt` | paste into Claude for a stronger rewrite in your voice |
| `img/*.webp` | hero photos: background removed, squared, padded, multi-size |
| `slicer_*.png` | preview renders lifted out of the 3MF, free product images |

Plus `dist/products.json` — every product in one file, ready to feed your site.

## Orca / Bambu split the data across two files

This is the thing to know. Neither file has everything:

| File | How you make it | Has | Missing |
|---|---|---|---|
| `project.3mf` | File > Save Project As | mesh geometry, print profile | print time, filament weight |
| `*.gcode.3mf` | Export sliced plate | print time, grams per color, colors | mesh geometry |

Orca does **not** write slice results into a saved project, no matter how many
times you slice before saving. So put **both** files in the product folder:

```
products/mickey/
    project.3mf          <- geometry, for dimensions and future variant renders
    sliced.gcode.3mf     <- time and grams, for pricing
    photos/
    product.yml
```

The build reads every model file in the folder and stitches them into one record.
Names do not matter; it detects which file has what.

### It checks that the two files agree

Pairing a project with a stale export would silently produce a wrong price, so
the build compares them and refuses to be quiet about it:

- **Height mismatch** — compares the export's `max_z_height` against the project's
  mesh height. X/Y are not compared, since the sliced bbox includes brim and support.
- **Profile mismatch** — compares `print_settings_id`. A `0.16 High Quality` project
  paired with a `0.20 Standard` export is not the same product.

With only one file, you still get whatever it holds; the missing half is reported
rather than guessed. A project alone yields dimensions and **no price at all**.

## Pricing

All in `config.yml`. The formula:

```
material   = sum(grams_per_color / 1000 * cost_per_kg_for_that_material)
machine    = print_hours * machine_rate_per_hour
labor      = labor_flat + print_hours * labor_per_hour
cost       = material + machine + labor
price      = cost * (1 + failure_rate) * margin_multiplier   -> rounded to x.99
```

Change a rate once and every product reprices on the next `--all`.

## Not yet wired

`config.yml` has a `variants:` list of colors. Rendering those needs Blender headless
plus mesh geometry (so a project 3MF, not a `.gcode.3mf`). The slicer previews cover
the single-colorway case in the meantime.


## Automating it: drop a file, get a draft product

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_KEY="eyJ..."        # service_role key, never commit it

python3 -m pipeline.watch                   # watch inbox/, publish drafts
python3 -m pipeline.watch --dry-run         # build + map, touch nothing remote
python3 -m pipeline.watch --no-publish      # local only
```

Drop either a folder or a loose file into `inbox/`:

```
inbox/alliance-credits/
    Alliance Credits.gcode.3mf
    Alliance Credits.3mf
    photos/
    product.yml
```

What happens: the drop is watched until its size and mtime stop changing (so a
half-copied file is never parsed), staged into `products/<slug>/`, built,
images uploaded to Supabase Storage, and the row upserted on `slug` — so
re-dropping the same product updates it instead of creating a duplicate.
Finished drops move to `inbox/_done/`.

### Three things it refuses to do

- **Publish an unpriced product.** No slice data means no price; it tells you to
  add the `*.gcode.3mf` instead of inserting a row with a null or invented price.
- **Publish live.** `status` is forced to `draft` on every insert, regardless of
  what the mapping says.
- **Guess a column.** If `supabase.columns` references a field that does not
  exist, it errors and lists the valid ones rather than silently dropping data.

### Column mapping

`supabase.columns` in `config.yml` maps *your* column names onto pipeline
fields, so nothing about your existing table has to change:

```yaml
supabase:
  columns:
    slug: slug
    title: name
    price_cents: price_cents
    weight_grams: weight_g
    spec: spec_json
```

Available fields: `slug name category price price_cents cost margin_pct tags
description print_time_s print_time_human weight_g dimensions_mm
dimensions_human color_count materials filaments layer_height printer
print_profile images image_url spec_json price_breakdown_json status`.

No dependency on `supabase-py` — it speaks PostgREST and Storage over stdlib
HTTP, so there is nothing to install and nothing to keep in sync.

## Auto-slicing with Orca

Orca never stores slice results in a saved project, so a project alone cannot be
priced. Instead of hand-exporting every time, let the pipeline call Orca:

```yaml
slicer:
  enabled: true
  command: "C:/Program Files/Snapmaker Orca/snapmaker-orca.exe"
  plate: 1
```

When a drop has a project but no `*.gcode.3mf`, it runs:

```
orca-slicer --slice 1 --export-3mf <name>.gcode.3mf <project>.3mf
```

and reads the result. If Orca is missing or the slice fails, the run degrades to
"no price" and tells you why — it never guesses.

This must run on **your** machine, where Orca and your printer/filament presets
live.

## Filing models away

```yaml
archive:
  enabled: true
  model_dir: "D:/3D Models"     # *.3mf projects
  gcode_dir: "D:/Uploads"       # *.gcode.3mf exports
  subfolder_by_slug: true
  move: true
  on_conflict: rename           # rename | overwrite | skip
```

After a product publishes, each file goes to its home — projects to the model
library, sliced exports to the upload folder, each in a `<slug>/` subfolder.
Set `move: false` to copy instead. If a destination's parent does not exist the
file is left alone and the run says so, rather than creating stray directories.

## Axis3D mapping (live)

`config.yml` is already mapped to the real `public.products` table:

| Column | Field | | Column | Field |
|---|---|---|---|---|
| `id` (PK) | slug | | `dimensions_mm` | dimensions_human |
| `name` | name | | `color_count` | color_count |
| `category` | category | | `print_time_s` | print_time_s |
| `blurb` | description | | `layer_height` | layer_height |
| `price` | price | | `printer` | printer |
| `grams` | weight_g | | `print_profile` | print_profile |
| `hours` | hours | | `materials` | materials_text |
| `img` | hero_path | | `images` | image_paths |
| `tags` | tags_text | | `spec` | spec_json |
| `status` | forced to `draft` | | | |

The bucket `product-images` is **public**, so `img` holds a full URL that drops
straight into an `<img src>` with no signing code. Set
`supabase.public_bucket: false` if you ever switch the bucket to private; rows
then store bare object paths and the site signs them itself.

Reading published products needs no auth. Drafts are visible only to signed-in
users, which is why your admin sees them and your storefront does not.


## Re-dropping the same filename

Every model file is hashed on each run, so a repeat drop is compared rather than
silently overwritten:

```
new product                                  first time seen
identical to the last run -- nothing changed  same bytes; publish is skipped
REVISED - same name, different contents:      shows exactly what moved
    file  model.gcode.3mf (modified)
    Price        $17.99  ->  $57.99   (+40.00)
    Print time   2h 33m  ->  11h 9m
    Filament     58.52 g  ->  255.27 g
    Colors       2  ->  4
    Size         208 x 147 x 5 mm  ->  98 x 106 x 200 mm
    Profile      0.16 High Quality  ->  0.20 Standard
```

`watch` skips publishing an identical drop entirely; `--force` overrides. A
revision publishes as normal, but you see the price delta before it lands.

## Two things this pipeline deliberately does NOT do

- **Slice.** Use the tested script from the "3MF slicing to gcode" session; it
  handles three Bambu-authored failure modes a plain CLI call walks into.
- **File your model library.** Your nightly organizer already categorises models
  from embedded metadata. Leave `archive.model_dir` empty; keep `gcode_dir`.

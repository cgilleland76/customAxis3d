# Changelog

One entry per Cowork session. Newest first. Keep it to what changed and why.

## 2026-11-07 — Third Axis Customs rebrand, Apps / 3D Printing split

- New logo everywhere: the axis mark from the Oct 2026 logo kit in the header,
  footer and favicon (`assets/img/brand/`). Palette and type switched to the
  kit's graphite / off-white / filament orange with Space Grotesk + JetBrains Mono.
- Home page now filters between **Apps** and **3D Printing** (plus Everything).
  `/apps` and `/3d-printing` are Netlify rewrites to the home page, so each half
  has its own link. App visitors see no print content and vice versa.
- Header shows Apps | 3D Printing tabs; the print links and My List only appear
  on the print side. Print pages carry `<body data-side="print">`.
- Apps live in `config.js` → `apps` (name, url, tagline, points). App support
  email is `contact.appsEmail`.
- Fixed: hero blurb was picking up the catalog lead-time `.lead` box, and
  `.section`/`.hero` padding wiped the side gutters on phones.
- localStorage namespace stays `axis3d` so existing customer lists survive.

## 2026-08-14 (later) — Generator toolchain, part one

Rebuilding the model generators as standalone scripts so a request turns into a
printable file with nothing re-typed by hand.

- `tools/generators/` added: 3MF writer, font-to-polygon conversion, proof
  renderer, and the cake topper generator restored from the build notes (the
  original `make_topper.py` was lost with a cleared session folder).
- Toppers verified watertight across 4 cake sizes x 7 names including accents,
  hyphens, spaces and ampersands. Widths match the reference table to ~0.5 mm.
- The extruder derives walls from the cap triangulation's boundary rather than
  from ring point lists; three earlier approaches left seams. Documented in
  `tools/generators/README.md` so it does not get "simplified" back.
- Fonts are never substituted: a missing face raises.

Still to do: `sign.py`, `cardholder.py`, and `make.py` (request -> 3MF + proof
into the pipeline inbox). Trim the ~0.5 mm dilation overshoot on topper width.

## 2026-08-14 — Categories, cake toppers, tap-to-pay holders

- **Category manager** in Shop tools: ordered, renameable, blurb, show/hide,
  stored public in `settings`. Duplicate names refused because products match
  on the name. "Adopt unlisted" pulls in any category a `product.yml`
  introduced.
- **Catalog groups by category** under headings in the managed order when
  browsing everything; flat grid when filtering or searching. Categories no one
  listed still appear, grouped last and flagged `unlisted`, so a YAML typo can
  never hide stock.
- **Idea modeler** category picker now mirrors the same taxonomy.
- **Cake toppers** added to the configurator, using the rules from
  `cake-topper-generator.md`: width = cake diameter x 0.60, lettering ~47% of
  width, 50 mm spikes. Warns when a long name on a small cake drives the stroke
  under 1.2 mm. Food-safety note about spikes is always shown.
- **Tap-to-pay card holders** added, with in-browser image upload (downscaled
  to 720 px). Preview draws the 85.6 x 54 mm card cavity to scale against the
  chosen width; minimum 3.9 in so a card actually fits.
- Added `CLAUDE.md` and this file after a session mistook a stray empty clone
  for data loss.

## Earlier (see `git log`)

- Build version badge; colour dropdowns with swatches, plate-selection fixes,
  slot names, batch launchers
- Filament colour catalogue, stock tracking, per-slot pickers, card-manifest
  import
- Product visibility control
- Fixed a race that made the site show demo products; stopped faking a catalog
- Made `schema.sql` upgrade an existing database
- Public/private split: rates out of the public bundle, price bands in, job
  costing gated, quoted-vs-actual variance tracking
- Supabase persistence with RLS, outbox retry, setup wizard
- Initial site: catalog, configurator, idea modeler, order list, job costing

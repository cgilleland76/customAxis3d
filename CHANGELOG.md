# Changelog

One entry per Cowork session. Newest first. Keep it to what changed and why.

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

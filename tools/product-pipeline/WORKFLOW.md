# Axis3D — how to add a product

Everything lives in `Documents\customAxis3d`. Nothing in Downloads, nothing in
a zip, nothing in a Claude session folder.

```
Documents\customAxis3d\                 the site (this is a git clone)
  Push site.bat                         commit + push code changes
  tools\product-pipeline\               the pipeline
    New product.bat                     <- the one you will use most
    Publish drafts.bat
    Add products.bat
    Preview products.bat
    Update filament colours.bat
    Watch for products.bat
    .env                                your Supabase key (never committed)
    inbox\                              drops waiting to be processed
    products\                           working files, regenerated
```

---

## One-time setup

Only needed once per machine.

1. Open PowerShell in `Documents\customAxis3d\tools\product-pipeline`
2. `Copy-Item .env.example .env`
3. `notepad .env` — paste your `service_role` key from
   Supabase → Project Settings → API. Save, close.
   Check the file is named exactly `.env`, not `.env.txt`.
4. `py -m pip install pyyaml pillow`

The key bypasses all row-level security. Terminal and `.env` only — never in
the website, never committed.

---

## Adding a product

**1. Slice and export in Orca.** One export is one product. If parts are
sold separately, export them separately.

**2. Double-click `New product.bat`.**

**3. Pick the sliced file** in the picker that opens.

**4. Answer the prompts.** It reads the file first, so you will see the print
time, weight and colours before it asks anything:

```
  2h 49m · 68.24 g · 3 colour(s) · 124 x 162 x 3 mm

  Product name [7 Brew Tap to Pay]:
  Category [Gifts]:
  One sentence for the shop card:
```

**5. Name the colour slots.** Each prompt shows the colour and weight, which
is how you tell them apart — the heaviest is almost always the body:

```
  slot 1  #000000    16.40 g  ->  Cup lid
  slot 2  #FFFFFF    49.58 g  ->  Cup body
  slot 4  #FF0000     2.26 g  ->  Straw
```

Slot numbers can skip. `1, 2, 4` means four filaments were loaded and three
were used.

**6. Assembled size.** Leave blank to accept the estimate. The pipeline only
sees how parts were laid out on the plate, not how they go together, so for a
multi-part model it is a guess. Measure the finished item if it matters.

**7. Say yes to build.** It prices the product, uploads the slicer previews,
and creates the row as a **draft**.

Nothing appears on the site yet.

---

## Publishing

**Double-click `Publish drafts.bat`.** It lists every draft:

```
   1. 7 Brew Tap-to-Pay        $19    Gifts    photo
   2. Winnie the Pooh Wand     $24    Gifts    NO IMAGE
```

Type the numbers to publish, `all` for everything, Enter to cancel. It warns
before publishing anything marked `NO IMAGE`.

You can also flip Visibility in Shop tools → Catalog, which is the place to
go if you want to edit the wording at the same time.

---

## Changing prices

Prices come from **Shop tools → Pricing**, not from any file. Change a rate
there and it applies to the quote calculator and the pipeline both.

Current model: `filament + electricity + flat fee + (hours x hourly rate)`,
with `flatFee $15` and `hourlyRate $1`. The flat fee is your handling time —
it is what stops a 20-minute print pricing at $2.

A product's price is recalculated every time you re-run it. To pin one, add
`price: 24` to its `product.yml`.

---

## Adding filament colours

**When you make a sample card:** run `Update filament colours.bat`. It looks
up the real, colorimeter-measured hex from filamentcolors.xyz for anything it
can match exactly by brand and colour name, and leaves the rest alone.

**When you run out of a colour:** Shop tools → Filament, untick it. Customers
can still choose it; the product page shows the 2–5 day lead time instead of
hiding the colour.

**A card means you can source it. `in_stock` means it is on the shelf today.**

---

## Pushing site changes

Only needed when the site *code* changes — not for products, which are data
and appear immediately.

**Double-click `Push site.bat`.** It stamps a build time into the footer,
shows what is about to be committed, asks for a message, and pushes. Netlify
rebuilds in a minute or two.

Then **Ctrl+Shift+R** on the site. Assets cache for seven days, so a normal
refresh shows you the old JavaScript.

Confirm the deploy landed by checking the build time in the footer matches
what the batch file printed.

---

## When something goes wrong

**`no Supabase credentials`** — `.env` missing or misnamed. Check for `.env.txt`.

**`PermissionError` on a file in `products\`** — a stale folder from an earlier
run. `Remove-Item -Recurse -Force products\<slug>` and run again.

**`Unable to create .git/index.lock`** — a stale lock, nothing is running.
`Remove-Item .git\index.lock`.

**`not priced: no slice data`** — you exported the project instead of the
sliced plate. Slice, then export the plate.

**Price looks wrong** — Shop tools → Pricing, not the code.

**Product not on the site** — it is a draft. That is the default, by design.

**Wrong image** — re-run that product; the pipeline picks the plate that was
actually sliced, and an older run may have grabbed a stale one.

**Colour swatch looks wrong** — check `hex_source` in Shop tools → Filament.
`guess` means it came from a name lookup and may be off; `measured` came from
a colorimeter reading.

# AXIS3D — 3D print shop site

A static, no-build website for taking 3D-print orders **in person**. There is no
checkout, no payment processor, and no card fields anywhere in the codebase.
Its whole job is to get you and the customer looking at the same object, with
the same numbers, before anything goes on the printer.

Stack: plain HTML/CSS/JS → **GitHub → Netlify**, with **Supabase** as the optional
database. No framework, no npm install, no build step.

---

## Pages

| Page | What it does |
|---|---|
| `index.html` | Landing page — four entry points, how ordering works |
| `shop.html` | **Ready-made catalog.** Photo grid, category filters, search, sort, lightbox, add-to-list |
| `custom.html` | **Custom configurator.** Live SVG preview for initial-with-name signs, name plates, keychains, door signs, word art. Ballpark price from your real rates |
| `idea.html` | **AI idea modeler.** Free-text description → structured build spec sheet + reference images + the exact generation prompt. Printable, emailable |
| `quote.html` | **Instant quote.** Drop a sliced `.3mf` or `.gcode`, get filament / time / power / price. Same math as your `print-cost-calculator.html` |
| `list.html` | The order list. Not a cart — it prints, emails, or gets shown on a phone |
| `admin.html` | Owner tools: incoming requests, catalog editor, rates, quote history, backup |

---

## Run it right now

No build step, but browsers block `file://` pages from loading sibling scripts in
some configurations, so serve it:

```bash
cd print-shop-site
python3 -m http.server 8080
# open http://localhost:8080
```

Out of the box it runs entirely on browser localStorage — every page works,
nothing to configure. Admin PIN is **4242** (change it in `assets/js/config.js`).

---

## Make it yours

Everything brandable lives in **`assets/js/config.js`**:

```js
brand:   'AXIS3D',            // header name
tagline: '…',
blurb:   '…',                 // hero paragraph
contact: { phone, email, location, hours },
showPrices: true,             // false hides all dollar figures from the public catalog
adminPin: '4242',
rates:   { filamentPerKg, watts, kwhPrice, markup, hourlyRate, flatFee }
```

Colors are CSS variables at the top of `assets/css/style.css` (`--accent`,
`--accent2`, `--bg`, …). The teal/amber pair matches your calculator.

Add products in **admin → Catalog**. Products without a photo get a generated
geometric placeholder so the grid never looks broken.

---

## Deploy to Netlify

1. Push this folder to a GitHub repo.
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Build command: *(leave empty)*. Publish directory: `.`
4. Deploy.

`netlify.toml` is already set up with pretty URLs (`/shop`, `/quote`, …), security
headers, and cache rules.

**Protect the admin page.** The PIN in `config.js` is obscurity, not security —
anyone can read it in the page source. Either:

- Netlify → Site configuration → **Access control → Password protection**
  (paid feature, protects the whole site), or
- rely on Supabase auth + RLS (below), which is what actually keeps customer
  contact details private.

---

## Storing your data so you can get it back

**Open `setup.html` and follow the seven steps.** It walks the whole thing and
tests itself as it goes — you never edit code.

### Why this matters

Without a database, a request a customer builds on *their* phone is saved in
*their* browser. You never see it. That's the single most important thing to fix
before the site goes in front of anyone.

The footer of every page tells you which mode you're in: `storage: local` or
`storage: supabase`.

### What the wizard does

1. Points you at supabase.com to create a free project.
2. Gives you the SQL to paste — one button, copies `supabase/schema.sql`.
3. Takes your Project URL and anon key, connects, and **checks each table
   actually exists** instead of failing quietly later.
4. Writes a throwaway request exactly the way a customer's phone would, then
   deletes it. If that passes, orders will reach you.
5. Prints the snippet to paste into `assets/js/config.js` so the *live* site
   connects too, not just your browser.
6. Walks you through creating your login (Authentication → Users → Add user).
7. Uploads anything already sitting in your browser to the cloud, or pulls the
   cloud down onto a new device.

The anon key is safe to publish. The policies in `schema.sql` are what protect
the data — that's the whole design. Never put the `service_role` key in this
repo.

### Nothing gets silently lost

Every cloud write reports back. If one fails — phone offline in a parking lot,
project asleep, policy misconfigured — the row is kept in an **outbox** and
retried automatically on the next page load. Meanwhile:

- The customer is told plainly: *"Saved on this device — it will upload
  automatically. Show me this list either way."* Not a fake success.
- Shop tools lists queued items alongside real ones, flagged `not uploaded yet`,
  with a retry button.
- The footer shows an amber `N unsent` chip whenever the queue isn't empty.

### Who can read what

| Data | Table | Readable by |
|---|---|---|
| Requests: custom configs, idea sheets, order lists | `requests` | Your login only |
| Saved quotes from sliced files | `quotes` | Your login only |
| Product catalog | `products` | Everyone — it's your storefront |
| Shop rates, admin unlock | This browser | You, on this device |

Customers can **submit** requests without an account and cannot read anyone's,
including their own. That's enforced by Postgres row level security, not by
hiding a page.

One deliberate exception: the anon role may delete rows whose id starts with
`probe-`, so the setup wizard can clean up its own connection test while you're
still signed out. Nothing else creates such an id.

### Backups

Shop tools → Setup → **Download backup (JSON)** dumps products, requests, quotes
and rates to a file, and restores from one. Worth doing before you clear history
or switch computers. Supabase also takes its own daily backups on paid plans.

## Phase 2: real AI image generation

`idea.html` currently captures the request and shows the exact prompt it would
send. To turn on image generation, add a Netlify Function so your API key stays
server-side:

```
netlify/functions/generate-image.js
```

```js
export default async (req) => {
  const { prompt } = await req.json();
  const r = await fetch('https://api.your-image-provider.com/v1/images', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.IMAGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, size: '1024x1024' })
  });
  const d = await r.json();
  return Response.json({ image: d.data[0].url });   // or { b64: … }
};
```

Set `IMAGE_API_KEY` in Netlify → Site configuration → Environment variables,
then in `config.js`:

```js
imageGenEndpoint: '/.netlify/functions/generate-image'
```

The **Generate concept image** button appears on its own. The front end already
accepts `{ image }`, `{ url }`, or `{ b64 }`.

Two things worth knowing before you flip it on: generated images are *concept
art*, not printable geometry — always say so to the customer, or they'll expect
the picture. And rate-limit it, or one bored visitor can run up your bill.

---

## Quote tool details

Ported from `print-cost-calculator.html`, so numbers match. Reads:

- **Orca / Bambu `.3mf`** — `Metadata/slice_info.config` (per-plate weight,
  prediction, per-filament grams/meters/color), falling back to the embedded
  plate G-code.
- **Raw `.gcode`** from Orca, Bambu, PrusaSlicer, SuperSlicer, Cura. Only the
  first and last 200 KB are read, so a 400 MB G-code file still loads instantly.
- When a slicer reports length but not weight (Cura), grams are derived at
  1.75 mm / 1.24 g·cm⁻³ ≈ 2.98 g per metre.

Pricing, unchanged from your calculator:

```
filament  = grams / 1000 × $/kg
power     = watts / 1000 × hours × $/kWh
cost      = filament + power + flat fee
price A   = round(cost × markup)
price B   = round(cost + hourly × hours)
```

An unsliced `.3mf` (a model, not a project) has no time or filament data in it —
the tool says so and lets you type grams and hours by hand.

---

## Ideas worth adding next

Roughly in order of payoff for a one-person shop:

1. **QR code on the site → your list page.** Print it on a card for your booth.
   Someone scans, builds a list while standing there, shows you the screen.
2. **"Pick a color" page with photos of your actual spools.** Colour names mean
   nothing; a photo of the real filament ends every argument about "orange".
3. **Turnaround / queue status.** One line: "currently ~4 days out". Kills the
   most common question before it's asked.
4. **Batch sheet in admin.** Group all `new` requests by filament colour so you
   can plate a whole day's work in one go.
5. **Reprint / repeat-order link.** Requests already carry the full config —
   a "print this again" button saves re-typing.
6. **Size reference photo.** A hand or a quarter next to each product. Most
   returns in this business are "I thought it was bigger".
7. **Materials explainer page.** PLA vs PETG vs TPU in plain language, so the
   configurator's suggestions have something to link to.
8. **Deposit tracking (offline).** A field in admin for "paid $10 cash" — keeps
   money *records* on the site without money *movement*.
9. **Print failure log.** Track failures per product; your markup should reflect
   which items actually fail.
10. **Nameplate / sign font pack.** More fonts is the single most requested thing
    on custom lettering work.

---

## File map

```
print-shop-site/
├─ index.html shop.html custom.html idea.html quote.html list.html
├─ admin.html            # owner tools
├─ setup.html            # storage setup wizard
├─ netlify.toml            # publish dir, headers, pretty URLs
├─ assets/
│  ├─ css/style.css        # all styling; CSS variables at the top
│  └─ js/
│     ├─ config.js         # ← edit this to rebrand
│     ├─ app.js            # helpers, data layer, auth, header/footer, order list
│     ├─ shop.js custom.js idea.js quote.js list.js admin.js setup.js
└─ supabase/schema.sql     # tables + row level security
```

`app.js` exposes one global, `APP`, with the same async API whether it's talking
to Supabase or localStorage — so pages never branch on which mode they're in.

## Tests

There is no test runner wired into the repo, but the build was verified with:

- every page loaded in a headless DOM, checking for script errors
- G-code parsing against Orca/Bambu, PrusaSlicer, SuperSlicer and Cura headers
- pricing compared against an independent reimplementation of the original
  calculator's formulas across three rate scenarios
- `schema.sql` executed on a real Postgres, twice (it must be re-runnable), with
  the exact insert payloads each page sends, and every RLS policy asserted —
  including the negative ones: anon *cannot* read requests or quotes
- the outbox: writes queued on failure, drained on reconnect, never duplicated,
  never dropped

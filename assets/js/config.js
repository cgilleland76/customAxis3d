/* =============================================================
   SITE CONFIG  —  edit this file, nothing else, to rebrand.
   ============================================================= */
window.SITE = {
  /* ---- Branding ---------------------------------------------- */
  brand:      'Third Axis Customs',
  legalName:  'Third Axis Customs LLC',
  tagline:    'Shopify apps & custom 3D printing',
  blurb:      'Third Axis Customs builds Shopify apps for e-commerce teams and prints custom parts and gifts in Bowling Green, KY.',
  printBlurb: 'Functional prints, custom signage, and one-off parts. Built on demand, priced from real slicer data.',
  appsBlurb:  'Tools for Shopify merchants, built by someone who runs e-commerce operations every day. Each one fixes a problem I hit at work first.',
  contact: {
    phone: '',                     // e.g. '(555) 010-2030'  (leave '' to hide)
    email: 'cgilleland76@gmail.com',          // 3D-print orders
    appsEmail: 'support@thirdaxiscustoms.com', // app support
    location: '',                  // e.g. 'Booth 14 — Saturday Market'
    hours: ''
  },

  /* ---- Apps --------------------------------------------------
     Shown in the Apps section of the home page and the footer.
     Add, remove or reorder freely. `url` is the app's own site.  */
  apps: [
    {
      name: 'SKU Doctor',
      url: 'https://skudoctor.thirdaxiscustoms.com',
      platform: 'Shopify app',
      tagline: 'Find and fix catalog problems before they cost you money.',
      points: [
        'Flags prices below cost, missing weights, duplicate SKUs and thin margins',
        'Checks weights, costs and barcodes against ShipHero, Veeqo or Cin7 Core',
        'Builds wholesale line sheets as a print-ready PDF or spreadsheet'
      ]
    },
    {
      name: 'Third Axis Wholesale Sync',
      url: 'https://app.thirdaxiscustoms.com',
      platform: 'Shopify app',
      tagline: 'Keep a wholesale store in step with your main Shopify store.',
      points: [
        'Copies products, prices and inventory one way, from the catalogs you pick',
        'Sets wholesale prices by rule or by SKU',
        'Previews every change before it is written'
      ]
    },
    {
      name: 'KitForge',
      url: 'https://kitforge.thirdaxiscustoms.com',
      platform: 'Branded merch',
      tagline: 'Turn a company logo into products that sell, with a commission on each sale.',
      points: [
        'Pick a blank product, upload a logo and name the design',
        'Builds the listing with images, sizes, prices and ShipHero kits',
        'Each company gets its own page and earns on every sale'
      ]
    }
  ],

  /* ---- Ordering ---------------------------------------------
     This site takes NO money. It builds a request list the
     customer shows you (or emails) so you can take the order
     in person. Keep showPrices=false to hide dollar figures
     from the public catalog entirely.                          */
  showPrices: true,                // show list prices on the catalog
  currency:   '$',
  orderNote:  'Orders are arranged in person — nothing is charged on this site.',

  /* ---- Admin ------------------------------------------------
     Client-side PIN. This only hides the panel from casual
     visitors; it is NOT real security. Anything truly private
     must be protected by Supabase RLS (see supabase/schema.sql)
     or Netlify password protection.                            */
  adminPin: '4242',

  /* ---- Supabase --------------------------------------------
     Leave url/anonKey blank and the whole site runs on browser
     localStorage — fully clickable with zero setup. Fill them
     in and every request, quote and product syncs to Supabase. */
  supabase: {
    url:     'https://prhbndgywhfpavwjauva.supabase.co',
    // Public anon key. Safe to publish ONLY because row level security is on —
    // see supabase/schema.sql. Never put the service_role key here.
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByaGJuZGd5d2hmcGF2d2phdXZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDgwNjIsImV4cCI6MjEwMTEyNDA2Mn0.yG5vCXuk6xWR9gW7yjNN2aPSW1lXPBG5IA-4XWw1BQ0'
  },

  /* ---- Public price bands -----------------------------------
     These are PRICES you have already marked up, not costs.
     Safe to publish. The configurator quotes a range from them.
     Your filament cost, markup multiplier and hourly rate are
     deliberately NOT in this file — they live in the private
     half of the Supabase settings table and are only readable
     once you sign in. Edit both in Shop tools -> Pricing.       */
  priceBands: [
    { maxIn: 4,   label: 'Up to 4 in',  low: 10, high: 16 },
    { maxIn: 6,   label: '4 to 6 in',   low: 16, high: 26 },
    { maxIn: 9,   label: '6 to 9 in',   low: 26, high: 45 },
    { maxIn: 12,  label: '9 to 12 in',  low: 45, high: 75 },
    { maxIn: 999, label: 'Over 12 in',  low: 75, high: 140 }
  ],
  /* ---- Categories --------------------------------------------
     Canonical public taxonomy. Products carry the category NAME
     (the pipeline writes it from product.yml), so these names and
     the ones in your product.yml files must match. Edit the live
     list in Shop tools -> Catalog -> Categories; this block is
     only the fallback before the database answers.               */
  categories: [
    { id: 'games',   name: 'Games',                 blurb: 'Trackers, dice towers, tabletop bits.',      visible: true },
    { id: 'gifts',   name: 'Gifts',                 blurb: 'Keepsakes, toppers, one-off presents.',      visible: true },
    { id: 'props',   name: 'Props',                 blurb: 'Wands, replicas, costume pieces.',           visible: true },
    { id: 'signs',   name: 'Signs & Lettering',     blurb: 'Names, initials, door signs, word art.',     visible: true },
    { id: 'cards',   name: 'Cards & Wallets',       blurb: 'Tap-to-pay holders and card caddies.',       visible: true },
    { id: 'toys',    name: 'Toys, Figures & Art',   blurb: 'Fidgets, articulated prints, desk pieces.',  visible: true },
    { id: 'storage', name: 'Storage & Organization',blurb: 'Bins, drawer inserts, gridfinity, trays.',   visible: true },
    { id: 'desk',    name: 'Desk & Organizer',      blurb: 'Stands, hooks, cable management.',           visible: true },
    { id: 'home',    name: 'Home & Decor',          blurb: 'Planters, hooks, things around the house.',  visible: true },
    { id: 'kitchen', name: 'Kitchen',               blurb: 'Food-safe PETG cutters and gadgets.',        visible: true },
    { id: 'printer', name: '3D Printer Gear',       blurb: 'Toolbox inserts, spool clips, printer mods.',visible: true },
    { id: 'tools',   name: 'Shop & Tools',          blurb: 'Jigs, trays, workshop fixtures.',            visible: true }
  ],

  bandNote: 'Estimate only — the exact price is set in person once we agree on size, colour and finish.',

  /* ---- Phase 2 hook ----------------------------------------
     When you're ready for real AI image generation, point this
     at a Netlify Function (see README) — the idea modeler will
     automatically switch from spec-card mode to image mode.     */
  imageGenEndpoint: ''             // e.g. '/.netlify/functions/generate-image'
};

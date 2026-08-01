/* =========================================================
   app.js — shared runtime: helpers, data layer, chrome
   Loaded on every page (after config.js).
   ========================================================= */
(function (global) {
  'use strict';

  var CFG = global.SITE || {};
  var NS = 'axis3d';

  /* ---------------- tiny helpers ---------------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(v) { return (CFG.currency || '$') + (Math.round(v * 100) / 100).toFixed(2); }
  function money0(v) { return (CFG.currency || '$') + Math.round(v); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function stamp() { return new Date().toISOString(); }
  function fmtTime(sec) {
    var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 200); };
  }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  /* localStorage that never throws */
  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(NS + '.' + key); return v == null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(NS + '.' + key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  /* ---------------- toast ---------------- */
  var toastTimer;
  function toast(msg, kind) {
    var t = $('#toast');
    if (!t) { t = el('div', { id: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg;
    t.className = (kind === 'err' ? 'err ' : '') + 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = t.className.replace('show', '').trim(); }, 3000);
  }

  /* ---------------- procedural placeholder thumbnails ----------------
     Keeps the catalog looking populated before real photos exist,
     while staying obviously a placeholder.                            */
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; } return Math.abs(h); }
  function placeholderSVG(name) {
    var h = hash(name || 'x');
    var hue = h % 360;
    var a = 'hsl(' + hue + ',38%,26%)', b = 'hsl(' + ((hue + 40) % 360) + ',34%,15%)';
    var shape = h % 4, s = '';
    if (shape === 0) s = '<circle cx="200" cy="150" r="62" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="10"/><circle cx="200" cy="150" r="30" fill="rgba(255,255,255,.07)"/>';
    else if (shape === 1) s = '<rect x="140" y="90" width="120" height="120" rx="16" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="10"/><rect x="172" y="122" width="56" height="56" rx="8" fill="rgba(255,255,255,.07)"/>';
    else if (shape === 2) s = '<path d="M200 84 L268 200 L132 200 Z" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="10" stroke-linejoin="round"/>';
    else s = '<path d="M200 86 L258 120 L258 180 L200 214 L142 180 L142 120 Z" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="10" stroke-linejoin="round"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>' +
      '<pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0 L0 0 0 20" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="1"/></pattern></defs>' +
      '<rect width="400" height="300" fill="url(#g)"/><rect width="400" height="300" fill="url(#p)"/>' + s + '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /* =========================================================
     DATA LAYER
     Uses Supabase when configured, otherwise localStorage.
     Same async API either way so pages don't care which.
     ========================================================= */
  var sb = null;
  var MODE = 'local';
  var LAST_ERROR = '';

  /* Credentials come from (1) this browser's saved setup, (2) config.js.
     The setup wizard writes (1) so you never have to edit code, and it
     also prints the snippet to paste into config.js for the live site. */
  function creds() {
    var saved = lsGet('supabase', null);
    if (saved && saved.url && saved.anonKey) return saved;
    var c = CFG.supabase || {};
    return (c.url && c.anonKey) ? c : null;
  }

  /* A <script> tag that never loads also never fires onerror — a blocked or
     slow CDN would leave this promise pending forever and every page that
     waits on APP.ready would hang. Always settle. */
  function loadScript(src, timeoutMs) {
    return new Promise(function (res, rej) {
      if (global.supabase && global.supabase.createClient) return res();
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        rej(new Error('timed out after ' + (timeoutMs || 8000) + 'ms loading ' + src));
      }, timeoutMs || 8000);
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { if (!settled) { settled = true; clearTimeout(timer); res(); } };
      s.onerror = function () { if (!settled) { settled = true; clearTimeout(timer); rej(new Error('load failed: ' + src)); } };
      document.head.appendChild(s);
    });
  }

  var SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

  function connect() {
    var c = creds();
    if (!c) { MODE = 'local'; return Promise.resolve('local'); }
    return loadScript(SB_CDN)
      .then(function () {
        sb = global.supabase.createClient(c.url, c.anonKey);
        MODE = 'supabase';
        return Outbox.flush().then(function () { return 'supabase'; });
      })
      .catch(function (e) {
        LAST_ERROR = e.message;
        console.warn('[axis3d] Supabase unavailable — using this browser only.', e);
        MODE = 'local';
        return 'local';
      });
  }

  /* =========================================================
     OUTBOX
     Every cloud write that fails — offline, bad key, RLS
     rejection — is queued here and retried on the next page
     load instead of being silently dropped. This is what makes
     "I will get this order" true rather than hopeful.
     ========================================================= */
  var Outbox = {
    all: function () { return lsGet('outbox', []) || []; },
    count: function () { return Outbox.all().length; },
    push: function (job) {
      var q = Outbox.all();
      q.push(job);
      lsSet('outbox', q.slice(-200));
      updateOutboxBadges();
    },
    clear: function () { lsSet('outbox', []); updateOutboxBadges(); },
    flush: function () {
      if (MODE !== 'supabase') return Promise.resolve({ sent: 0, left: Outbox.count() });
      var q = Outbox.all();
      if (!q.length) { updateOutboxBadges(); return Promise.resolve({ sent: 0, left: 0 }); }
      var still = [], sent = 0;
      return q.reduce(function (chain, job) {
        return chain.then(function () {
          return runWrite(job).then(function (r) {
            if (r.error) still.push(job); else sent++;
          });
        });
      }, Promise.resolve()).then(function () {
        lsSet('outbox', still);
        updateOutboxBadges();
        return { sent: sent, left: still.length };
      });
    }
  };

  function updateOutboxBadges() {
    var n = Outbox.count();
    $$('[data-outbox-count]').forEach(function (e) {
      e.textContent = n + ' unsent';
      e.classList.toggle('hide', n === 0);
    });
  }

  /* raw write, no queueing — returns { error } */
  function runWrite(job) {
    var t = sb.from(job.table), q;
    if (job.op === 'insert') q = t.insert(job.rows);
    else if (job.op === 'upsert') q = t.upsert(job.rows);
    else if (job.op === 'update') q = t.update(job.patch).eq('id', job.id);
    else if (job.op === 'delete') q = t.delete().eq('id', job.id);
    else return Promise.resolve({ error: { message: 'unknown op ' + job.op } });
    return q.then(function (r) { return { error: r.error }; },
                  function (e) { return { error: e }; });
  }

  /* queueing write — this is what the app calls */
  function cloudWrite(job) {
    if (MODE !== 'supabase') return Promise.resolve({ synced: false, reason: 'local' });
    return runWrite(job).then(function (r) {
      if (!r.error) return { synced: true, reason: '' };
      var msg = r.error.message || String(r.error);
      // A permission error on a page the public uses is a config problem,
      // not a transient one — queue it anyway so nothing is lost.
      Outbox.push({ table: job.table, op: job.op, rows: job.rows, patch: job.patch, id: job.id, at: stamp(), err: msg });
      console.warn('[axis3d] queued failed write to ' + job.table + ': ' + msg);
      return { synced: false, reason: msg };
    });
  }

  function cloudRead(table, order, asc) {
    if (MODE !== 'supabase') return Promise.resolve(null);
    return sb.from(table).select('*').order(order, { ascending: !!asc })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; })
      .catch(function (e) { console.warn('[axis3d] read ' + table + ': ' + e.message); return null; });
  }

  /* ---- generic local table ops ---- */
  function localList(table) { return lsGet(table, null); }
  function localSave(table, rows) { lsSet(table, rows); return rows; }

  /* Connect only after the outbox helpers above exist — connect()
     flushes the queue as its last step. */
  var readyPromise = connect();

  /* ---- seed catalog (used until you add your own) ---- */
  var SEED_PRODUCTS = [
    { id: 'p-articulated-dragon', name: 'Articulated Dragon', category: 'Toys & Fidget', price: 18, blurb: 'Print-in-place, 40+ moving segments. No assembly.', img: '', batch: true, grams: 46, hours: 3.2, tags: 'bestseller' },
    { id: 'p-fidget-slug', name: 'Fidget Slug', category: 'Toys & Fidget', price: 8, blurb: 'Flexible print-in-place slug. Pocket sized.', img: '', batch: true, grams: 14, hours: 0.9, tags: 'quick' },
    { id: 'p-cable-clips', name: 'Cable Clips (set of 6)', category: 'Desk & Organizer', price: 6, blurb: 'Adhesive-backed cord management, 3 sizes.', img: '', batch: true, grams: 12, hours: 0.7, tags: 'quick' },
    { id: 'p-headphone-hook', name: 'Under-Desk Headphone Hook', category: 'Desk & Organizer', price: 9, blurb: 'Screw or tape mount. Holds heavy cans.', img: '', batch: true, grams: 22, hours: 1.1, tags: '' },
    { id: 'p-phone-stand', name: 'Adjustable Phone Stand', category: 'Desk & Organizer', price: 12, blurb: 'Two viewing angles, cable pass-through.', img: '', batch: true, grams: 34, hours: 1.8, tags: 'bestseller' },
    { id: 'p-planter-hex', name: 'Hex Planter + Drip Tray', category: 'Home & Decor', price: 16, blurb: 'Watertight vase-mode planter, 4 in.', img: '', batch: true, grams: 58, hours: 2.4, tags: '' },
    { id: 'p-cookie-cutters', name: 'Cookie Cutter Set', category: 'Kitchen', price: 14, blurb: 'Food-safe PETG, 4 shapes. Custom shapes available.', img: '', batch: true, grams: 30, hours: 1.6, tags: '' },
    { id: 'p-keychain-blank', name: 'Keychain Blanks (10-pack)', category: 'Gifts', price: 10, blurb: 'Mixed colors. Add a name for +$2 each.', img: '', batch: true, grams: 18, hours: 1.0, tags: 'quick' },
    { id: 'p-dice-tower', name: 'Collapsible Dice Tower', category: 'Games', price: 22, blurb: 'Folds flat for the game bag. Two-tone.', img: '', batch: false, grams: 96, hours: 5.0, tags: '' },
    { id: 'p-wall-hook', name: 'Heavy-Duty Wall Hooks (pair)', category: 'Home & Decor', price: 7, blurb: '15 lb rated. Countersunk screw holes.', img: '', batch: true, grams: 20, hours: 1.0, tags: '' },
    { id: 'p-tool-tray', name: 'Magnetic Parts Tray', category: 'Shop & Tools', price: 13, blurb: 'Embedded magnet pockets for screws and bits.', img: '', batch: true, grams: 40, hours: 2.0, tags: '' },
    { id: 'p-filament-clip', name: 'Filament Spool Clips (5)', category: 'Shop & Tools', price: 5, blurb: 'Keeps loose ends from tangling.', img: '', batch: true, grams: 8, hours: 0.4, tags: 'quick' }
  ];

  /* ---- products ---- */
  var Products = {
    list: function () {
      return (MODE === 'supabase' ? cloudRead('products', 'name', true) : Promise.resolve(null))
        .then(function (cloud) {
          if (cloud && cloud.length) { localSave('products', cloud); return cloud; }
          var rows = localList('products');
          return rows && rows.length ? rows : SEED_PRODUCTS;
        });
    },
    save: function (rows) {
      localSave('products', rows);
      return cloudWrite({ table: 'products', op: 'upsert', rows: rows }).then(function (r) {
        return { rows: rows, synced: r.synced, reason: r.reason };
      });
    },
    remove: function (id) {
      var rows = (localList('products') || SEED_PRODUCTS).filter(function (p) { return p.id !== id; });
      localSave('products', rows);
      return cloudWrite({ table: 'products', op: 'delete', id: id }).then(function () { return rows; });
    },
    seed: function () { localSave('products', SEED_PRODUCTS.slice()); return SEED_PRODUCTS.slice(); }
  };

  /* ---- requests (custom designs, idea modeler, order lists) ---- */
  var Requests = {
    create: function (rec) {
      rec.id = rec.id || uid();
      rec.created_at = rec.created_at || stamp();
      rec.status = rec.status || 'new';
      var rows = localList('requests') || [];
      rows.unshift(rec);
      localSave('requests', rows);
      return cloudWrite({ table: 'requests', op: 'insert', rows: [rec] }).then(function (r) {
        rec._synced = r.synced;
        rec._syncError = r.reason;
        return rec;
      });
    },
    list: function () {
      return (MODE === 'supabase' ? cloudRead('requests', 'created_at', false) : Promise.resolve(null))
        .then(function (cloud) {
          if (cloud) {
            // merge anything still sitting in the outbox so the admin page
            // shows it too, flagged as not yet uploaded
            var pending = Outbox.all()
              .filter(function (j) { return j.table === 'requests' && j.op === 'insert'; })
              .reduce(function (acc, j) { return acc.concat(j.rows || []); }, [])
              .map(function (r) { r._pending = true; return r; });
            return pending.concat(cloud);
          }
          return localList('requests') || [];
        });
    },
    setStatus: function (id, status) {
      var rows = (localList('requests') || []).map(function (r) { if (r.id === id) r.status = status; return r; });
      localSave('requests', rows);
      return cloudWrite({ table: 'requests', op: 'update', id: id, patch: { status: status } })
        .then(function () { return rows; });
    },
    remove: function (id) {
      var rows = (localList('requests') || []).filter(function (r) { return r.id !== id; });
      localSave('requests', rows);
      return cloudWrite({ table: 'requests', op: 'delete', id: id }).then(function () { return rows; });
    }
  };

  /* ---- quotes ---- */
  var Quotes = {
    create: function (rec) {
      rec.id = rec.id || uid();
      rec.created_at = rec.created_at || stamp();
      var rows = localList('quotes') || [];
      rows.unshift(rec);
      localSave('quotes', rows);
      return cloudWrite({ table: 'quotes', op: 'insert', rows: [rec] }).then(function (r) {
        rec._synced = r.synced; rec._syncError = r.reason;
        return rec;
      });
    },
    list: function () {
      return (MODE === 'supabase' ? cloudRead('quotes', 'created_at', false) : Promise.resolve(null))
        .then(function (cloud) { return cloud || localList('quotes') || []; });
    },
    update: function (id, patch) {
      var rows = (localList('quotes') || []).map(function (r) {
        if (r.id === id) Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
        return r;
      });
      localSave('quotes', rows);
      return cloudWrite({ table: 'quotes', op: 'update', id: id, patch: patch })
        .then(function (res) { return { rows: rows, synced: res.synced, reason: res.reason }; });
    },
    remove: function (id) {
      var rows = (localList('quotes') || []).filter(function (r) { return r.id !== id; });
      localSave('quotes', rows);
      return cloudWrite({ table: 'quotes', op: 'delete', id: id }).then(function () { return rows; });
    },
    clear: function () {
      var rows = localList('quotes') || [];
      localSave('quotes', []);
      if (MODE !== 'supabase') return Promise.resolve([]);
      return rows.reduce(function (chain, r) {
        return chain.then(function () { return cloudWrite({ table: 'quotes', op: 'delete', id: r.id }); });
      }, Promise.resolve()).then(function () { return []; });
    }
  };

  /* =========================================================
     SETTINGS
     One Supabase table, one visibility flag per key.
     is_public = true  -> price bands, readable by the public site
     is_public = false -> shop rates, readable only when signed in
     ========================================================= */
  var Settings = {
    get: function (key) {
      if (MODE !== 'supabase') return Promise.resolve(null);
      return sb.from('settings').select('value').eq('key', key).maybeSingle()
        .then(function (r) {
          if (r.error) throw r.error;
          return r.data ? r.data.value : null;
        })
        .catch(function () { return null; });   // RLS hiding a private key is expected, not an error
    },
    set: function (key, value, isPublic) {
      return cloudWrite({
        table: 'settings', op: 'upsert',
        rows: [{ key: key, value: value, is_public: !!isPublic, updated_at: stamp() }]
      });
    }
  };

  /* =========================================================
     RATES  —  PRIVATE. Never shipped in config.js.
     Resolution order: this browser -> Supabase (signed in).
     If neither has them, they are simply absent; owner-only
     pages ask you to sign in rather than inventing numbers.
     ========================================================= */
  var RATE_KEYS = ['filamentPerKg', 'watts', 'kwhPrice', 'markup', 'hourlyRate', 'flatFee'];

  var Rates = {
    /* Synchronous, browser-local. null when this device has never had them. */
    cached: function () {
      var saved = lsGet('rates', null);
      if (!saved) return null;
      var out = {}, any = false;
      RATE_KEYS.forEach(function (k) {
        var v = parseFloat(saved[k]);
        out[k] = isNaN(v) ? 0 : v;
        if (!isNaN(v)) any = true;
      });
      return any ? out : null;
    },
    loaded: function () { return !!Rates.cached(); },

    /* Pull from the cloud if this device does not have them yet. */
    load: function () {
      var local = Rates.cached();
      if (local) return Promise.resolve(local);
      return Settings.get('rates').then(function (v) {
        if (!v) return null;
        lsSet('rates', v);
        return Rates.cached();
      });
    },

    save: function (r) {
      var clean = {};
      RATE_KEYS.forEach(function (k) { var v = parseFloat(r[k]); clean[k] = isNaN(v) ? 0 : v; });
      lsSet('rates', clean);
      return Settings.set('rates', clean, false).then(function (res) {
        return { rates: clean, synced: res.synced, reason: res.reason };
      });
    },

    forget: function () { lsSet('rates', null); }
  };

  /* =========================================================
     PRICE BANDS  —  PUBLIC.
     Already-marked-up prices. Nothing here reveals cost.
     ========================================================= */
  var Bands = {
    load: function () {
      return Settings.get('priceBands').then(function (v) {
        return (v && v.length) ? v : (CFG.priceBands || []);
      });
    },
    save: function (bands) { return Settings.set('priceBands', bands, true); },
    /* Longest dimension in inches -> { low, high, label } */
    forSize: function (bands, inches) {
      var list = (bands || []).slice().sort(function (a, b) { return a.maxIn - b.maxIn; });
      for (var i = 0; i < list.length; i++) if (inches <= list[i].maxIn) return list[i];
      return list[list.length - 1] || null;
    }
  };

  /* =========================================================
     SETUP / SYNC / DIAGNOSTICS  (used by setup.html)
     ========================================================= */
  var TABLES = ['products', 'requests', 'quotes'];

  var Setup = {
    creds: creds,
    saved: function () { return lsGet('supabase', null); },

    /* Save keys in this browser and reconnect immediately. */
    connect: function (url, anonKey) {
      url = String(url || '').trim().replace(/\/+$/, '');
      anonKey = String(anonKey || '').trim();
      if (!/^https:\/\/[^ ]+\.supabase\.(co|in)$/i.test(url)) {
        return Promise.reject(new Error('That does not look like a project URL. It should look like https://abcdefgh.supabase.co'));
      }
      if (anonKey.length < 40) {
        return Promise.reject(new Error('That key looks too short. Copy the full anon / publishable key.'));
      }
      lsSet('supabase', { url: url, anonKey: anonKey });
      return connect().then(function (mode) {
        if (mode !== 'supabase') throw new Error(LAST_ERROR || 'Could not load the Supabase library.');
        return mode;
      });
    },

    forget: function () { lsSet('supabase', null); return connect(); },

    /* Per-table probe: does it exist, can anon read, can anon write. */
    diagnose: function () {
      if (MODE !== 'supabase') return Promise.resolve({ connected: false, tables: [] });
      return Promise.all(TABLES.map(function (t) {
        return sb.from(t).select('id', { count: 'exact', head: true })
          .then(function (r) {
            if (r.error) {
              var m = r.error.message || '';
              var missing = /does not exist|schema cache|not find the table/i.test(m);
              return { table: t, exists: !missing, readable: false, rows: null, note: missing ? 'table not created yet' : m };
            }
            return { table: t, exists: true, readable: true, rows: r.count, note: '' };
          }, function (e) {
            return { table: t, exists: false, readable: false, rows: null, note: e.message };
          });
      })).then(function (tables) {
        return Auth.user().then(function (u) {
          return { connected: true, tables: tables, user: u ? u.email : null, outbox: Outbox.count() };
        });
      });
    },

    /* Prove a customer can actually submit: insert then delete a probe row. */
    testWrite: function () {
      if (MODE !== 'supabase') return Promise.reject(new Error('Not connected.'));
      var probe = {
        id: 'probe-' + uid(), created_at: stamp(), status: 'done',
        kind: 'Connection test', source: 'setup', name: 'setup probe',
        notes: 'Safe to delete — written by the setup wizard.'
      };
      return sb.from('requests').insert([probe]).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        return sb.from('requests').delete().eq('id', probe.id).then(function (d) {
          return { wrote: true, cleanedUp: !d.error,
                   note: d.error ? 'Written fine. Could not delete the probe row — sign in on Shop tools and delete "Connection test".' : '' };
        });
      });
    },

    /* Push everything already sitting in this browser up to the cloud. */
    pushAll: function () {
      if (MODE !== 'supabase') return Promise.reject(new Error('Not connected.'));
      var out = { products: 0, requests: 0, quotes: 0, errors: [] };
      var jobs = [
        { table: 'products', rows: localList('products') || [] },
        { table: 'requests', rows: localList('requests') || [] },
        { table: 'quotes',   rows: localList('quotes') || [] }
      ];
      return jobs.reduce(function (chain, j) {
        return chain.then(function () {
          if (!j.rows.length) return;
          var clean = j.rows.map(function (r) {
            var c = {};
            Object.keys(r).forEach(function (k) { if (k.charAt(0) !== '_') c[k] = r[k]; });
            return c;
          });
          return sb.from(j.table).upsert(clean).then(function (r) {
            if (r.error) out.errors.push(j.table + ': ' + r.error.message);
            else out[j.table] = clean.length;
          });
        });
      }, Promise.resolve()).then(function () { return out; });
    },

    /* Pull the cloud back down into this browser (new device, or restore). */
    pullAll: function () {
      if (MODE !== 'supabase') return Promise.reject(new Error('Not connected.'));
      return Promise.all([
        cloudRead('products', 'name', true),
        cloudRead('requests', 'created_at', false),
        cloudRead('quotes', 'created_at', false)
      ]).then(function (r) {
        var got = { products: 0, requests: 0, quotes: 0 };
        if (r[0]) { localSave('products', r[0]); got.products = r[0].length; }
        if (r[1]) { localSave('requests', r[1]); got.requests = r[1].length; }
        if (r[2]) { localSave('quotes', r[2]); got.quotes = r[2].length; }
        return got;
      });
    },

    Outbox: Outbox,
    schemaPath: 'supabase/schema.sql'
  };

  /* =========================================================
     ORDER LIST  (the "cart" that never takes money)
     ========================================================= */
  var List = {
    all: function () { return lsGet('list', []) || []; },
    count: function () { return List.all().reduce(function (n, i) { return n + (i.qty || 1); }, 0); },
    add: function (item) {
      var rows = List.all();
      var match = rows.filter(function (r) { return r.key === item.key; })[0];
      if (match) { match.qty = (match.qty || 1) + (item.qty || 1); }
      else { item.qty = item.qty || 1; item.lineId = uid(); rows.push(item); }
      lsSet('list', rows);
      List.refresh();
      return rows;
    },
    setQty: function (lineId, qty) {
      var rows = List.all().map(function (r) { if (r.lineId === lineId) r.qty = Math.max(1, qty | 0); return r; });
      lsSet('list', rows); List.refresh(); return rows;
    },
    remove: function (lineId) {
      var rows = List.all().filter(function (r) { return r.lineId !== lineId; });
      lsSet('list', rows); List.refresh(); return rows;
    },
    clear: function () { lsSet('list', []); List.refresh(); return []; },
    refresh: function () {
      var n = List.count();
      $$('[data-list-count]').forEach(function (e) {
        e.textContent = n;
        e.parentNode && e.parentNode.classList && e.parentNode.classList.toggle('has-items', n > 0);
      });
    }
  };

  /* =========================================================
     PAGE CHROME  (header + footer injected on every page)
     ========================================================= */
  /* Public navigation. The quote tool is deliberately absent — it exposes
     cost, markup and profit, so it lives inside Shop tools instead. */
  var NAVLINKS = [
    { href: 'shop.html', label: 'Ready-Made' },
    { href: 'custom.html', label: 'Custom Designs' },
    { href: 'idea.html', label: 'Idea Modeler' }
  ];

  /* First few words of the tagline for the logo lockup, without leaving a
     dangling conjunction ("Additive Manufacturing &"). */
  function shortTagline(t) {
    var words = String(t || '3D Printing').split(/\s+/).filter(Boolean).slice(0, 3);
    while (words.length > 1 && /^(&|and|or|of|for|the|with|\+|·|—|-)$/i.test(words[words.length - 1])) words.pop();
    return words.join(' ');
  }

  function renderChrome() {
    var here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    var head = $('header.site');
    if (head) {
      head.innerHTML =
        '<div class="nav">' +
          '<a class="logo" href="index.html"><span class="mark">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="#08191a" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round">' +
            '<path d="M12 2.6 21 7.4v9.2L12 21.4 3 16.6V7.4z"/><path d="M3 7.4l9 4.8 9-4.8"/><path d="M12 12.2v9.2"/></svg>' +
          '</span><span>' + esc(CFG.brand || 'AXIS3D') + '<small>' + esc(shortTagline(CFG.tagline)) + '</small></span></a>' +
          '<button class="burger" id="burger" aria-label="Menu">☰</button>' +
          '<nav class="links" id="navlinks">' +
            NAVLINKS.map(function (l) {
              return '<a href="' + l.href + '"' + (here === l.href ? ' class="active"' : '') + '>' + esc(l.label) + '</a>';
            }).join('') +
            '<a class="pill" href="list.html">My List <span class="count" data-list-count>0</span></a>' +
          '</nav>' +
        '</div>';
      var b = $('#burger');
      if (b) b.addEventListener('click', function () { $('#navlinks').classList.toggle('open'); });
    }

    var foot = $('footer.site');
    if (foot) {
      var c = CFG.contact || {};
      foot.innerHTML =
        '<div class="wrap"><div class="cols">' +
          '<div><h4>' + esc(CFG.brand || 'AXIS3D') + '</h4>' +
            '<p style="max-width:44ch">' + esc(CFG.blurb || '') + '</p>' +
            '<p class="mono dim" style="margin-top:10px;font-size:11.5px">' + esc(CFG.orderNote || '') + '</p></div>' +
          '<div><h4>Browse</h4>' +
            NAVLINKS.map(function (l) { return '<a href="' + l.href + '">' + esc(l.label) + '</a>'; }).join('') +
            '<a href="list.html">My List</a></div>' +
          '<div><h4>Contact</h4>' +
            (c.phone ? '<a href="tel:' + esc(c.phone.replace(/[^\d+]/g, '')) + '">' + esc(c.phone) + '</a>' : '') +
            (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
            (c.location ? '<p>' + esc(c.location) + '</p>' : '') +
            (c.hours ? '<p>' + esc(c.hours) + '</p>' : '') +
          '</div>' +
        '</div><div class="legal">' +
          '<span>© ' + new Date().getFullYear() + ' ' + esc(CFG.brand || 'AXIS3D') + '</span>' +
          '<span id="dbmode" class="badge-live off"><i></i>storage: local</span>' +
          '<span class="chip amber hide" data-outbox-count title="Items saved here but not yet uploaded. They retry automatically.">0</span>' +
          '<a href="admin.html" class="dim">Shop tools</a>' +
        '</div></div>';
    }

    List.refresh();
    updateOutboxBadges();
    readyPromise.then(function (mode) {
      updateOutboxBadges();
      var m = $('#dbmode');
      if (m) {
        m.className = 'badge-live' + (mode === 'supabase' ? '' : ' off');
        m.innerHTML = '<i></i>storage: ' + mode;
        m.title = mode === 'supabase'
          ? 'Connected to Supabase — requests sync across devices.'
          : 'No Supabase keys in config.js — data is saved in this browser only.';
      }
    });
  }

  /* =========================================================
     OWNER GATE
     Hides a page's contents until you are signed in (Supabase)
     or have entered the PIN (local mode). The PIN is a speed
     bump; the real protection is that shop rates live behind
     RLS, so an unlocked page still cannot compute a cost.
     ========================================================= */
  function gate(protectedSel, onUnlock) {
    var prot = $(protectedSel);
    if (!prot) return;
    prot.classList.add('hide');

    var box = el('div', { class: 'panel', id: 'apGate', style: 'max-width:360px;margin:56px auto' });
    prot.parentNode.insertBefore(box, prot);

    function unlock() {
      box.classList.add('hide');
      prot.classList.remove('hide');
      if (onUnlock) onUnlock();
    }
    function err(m) {
      var e = $('#apGateErr', box);
      if (!m) { e.classList.add('hide'); return; }
      e.innerHTML = '<span>⚠</span><div>' + esc(m) + '</div>';
      e.classList.remove('hide');
    }

    readyPromise.then(function (mode) {
      if (mode === 'supabase') {
        return Auth.user().then(function (u) {
          if (u) return unlock();
          box.innerHTML =
            '<h2>Shop tools</h2>' +
            '<p class="hint" style="margin-top:0">Sign in with your Supabase user.</p>' +
            '<label for="apEmail">Email</label><input id="apEmail" type="email" autocomplete="username">' +
            '<label for="apPw">Password</label><input id="apPw" type="password" autocomplete="current-password">' +
            '<button class="btn block" id="apGo" style="margin-top:12px">Sign in</button>' +
            '<div id="apGateErr" class="notice err hide" style="margin-top:12px"></div>';
          $('#apGo', box).addEventListener('click', function () {
            err('');
            var b = this; b.disabled = true;
            Auth.signIn($('#apEmail', box).value.trim(), $('#apPw', box).value)
              .then(unlock)
              .catch(function (e) { err(e.message || 'Sign-in failed.'); b.disabled = false; });
          });
          $('#apPw', box).addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#apGo', box).click(); });
        });
      }
      box.innerHTML =
        '<h2>Shop tools</h2>' +
        '<p class="hint" style="margin-top:0">Enter your PIN.</p>' +
        '<label for="apPin">PIN</label><input id="apPin" type="password" inputmode="numeric" autocomplete="off">' +
        '<button class="btn block" id="apGo" style="margin-top:12px">Unlock</button>' +
        '<div id="apGateErr" class="notice err hide" style="margin-top:12px"></div>';
      $('#apGo', box).addEventListener('click', function () {
        if ($('#apPin', box).value === String(CFG.adminPin)) { lsSet('unlocked', 1); unlock(); }
        else err('Wrong PIN.');
      });
      $('#apPin', box).addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#apGo', box).click(); });
      if (lsGet('unlocked', 0) === 1) unlock();
    });
  }

  /* ---------------- lightbox ---------------- */
  function lightbox(src, cap) {
    var lb = $('#lightbox');
    if (!lb) {
      lb = el('div', { id: 'lightbox', class: 'lightbox' },
        '<button class="x" aria-label="Close">✕</button><div><img alt=""><div class="cap"></div></div>');
      document.body.appendChild(lb);
      lb.addEventListener('click', function (e) {
        if (e.target === lb || e.target.classList.contains('x')) lb.classList.remove('open');
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('open'); });
    }
    $('img', lb).src = src;
    $('.cap', lb).textContent = cap || '';
    lb.classList.add('open');
  }

  /* ---------------- export ---------------- */
  function downloadCSV(filename, header, rows) {
    var lines = [header].concat(rows.map(function (r) {
      return r.map(function (v) {
        var s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = el('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }


  /* =========================================================
     AUTH (only used when Supabase is configured)
     Sign in as yourself so RLS lets the admin page read
     customer requests. Without this, anon visitors can still
     SUBMIT requests but nobody can READ them back.
     ========================================================= */
  var Auth = {
    enabled: function () { return MODE === 'supabase'; },
    user: function () {
      if (MODE !== 'supabase') return Promise.resolve(null);
      return sb.auth.getSession().then(function (r) { return (r.data && r.data.session && r.data.session.user) || null; });
    },
    signIn: function (email, password) {
      if (MODE !== 'supabase') return Promise.reject(new Error('Supabase not configured'));
      return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) throw r.error;
        return r.data.user;
      });
    },
    signOut: function () {
      if (MODE !== 'supabase') return Promise.resolve();
      return sb.auth.signOut();
    }
  };

  global.APP = {
    cfg: CFG, ready: readyPromise, mode: function () { return MODE; },
    $: $, $$: $$, el: el, esc: esc, money: money, money0: money0, uid: uid,
    today: today, stamp: stamp, fmtTime: fmtTime, debounce: debounce, qs: qs,
    lsGet: lsGet, lsSet: lsSet, toast: toast, placeholderSVG: placeholderSVG,
    Products: Products, Requests: Requests, Quotes: Quotes, Rates: Rates, List: List, Auth: Auth,
    Settings: Settings, Bands: Bands,
    Setup: Setup, Outbox: Outbox, lastError: function () { return LAST_ERROR; },
    lightbox: lightbox, downloadCSV: downloadCSV, renderChrome: renderChrome, gate: gate,
    SEED_PRODUCTS: SEED_PRODUCTS
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderChrome);
  else renderChrome();

})(window);

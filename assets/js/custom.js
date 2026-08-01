/* =========================================================
   custom.js — customizable product configurator
   Schema-driven: add a product by adding one entry to TYPES.
   ========================================================= */
(function () {
  'use strict';
  var A = window.APP;

  var FONT_IMPORT = "https://fonts.googleapis.com/css2?family=Inter:wght@700;800&family=Bebas+Neue&family=Playfair+Display:wght@900&family=Dancing+Script:wght@700&family=Pacifico&family=Righteous&family=Great+Vibes&display=swap";

  var BLOCK_FONTS = [
    { id: "'Playfair Display',serif", label: 'Serif' },
    { id: "'Inter',sans-serif", label: 'Modern' },
    { id: "'Bebas Neue',sans-serif", label: 'Condensed' },
    { id: "'Righteous',sans-serif", label: 'Rounded' }
  ];
  var SCRIPT_FONTS = [
    { id: "'Dancing Script',cursive", label: 'Script' },
    { id: "'Great Vibes',cursive", label: 'Formal' },
    { id: "'Pacifico',cursive", label: 'Casual' },
    { id: "'Inter',sans-serif", label: 'Block' }
  ];
  var PALETTE = ['#1f2933', '#e8edf2', '#4db6ac', '#ffb74d', '#ef5350', '#42a5f5',
                 '#ab47bc', '#66bb6a', '#ff7043', '#f06292', '#8d6e63', '#ffd54f'];
  var MATERIALS = [
    { id: 'PLA', label: 'PLA — indoor, most colors' },
    { id: 'PETG', label: 'PETG — outdoor / tougher' },
    { id: 'PLA Silk', label: 'Silk PLA — glossy' },
    { id: 'ABS', label: 'ABS — heat resistant' }
  ];

  /* ---------- product definitions ---------- */
  var TYPES = {
    'initial-name': {
      icon: 'M', label: 'Initial + Name Sign',
      title: 'Initial with name through it',
      coverage: 0.34, ratio: 1.25,
      fields: [
        { id: 'initial', label: 'Initial', type: 'text', value: 'M', max: 2, req: true },
        { id: 'name', label: 'Name through it', type: 'text', value: 'Martin', max: 18, req: true },
        { id: 'blockFont', label: 'Letter style', type: 'choices', opts: BLOCK_FONTS, value: "'Playfair Display',serif" },
        { id: 'scriptFont', label: 'Name style', type: 'choices', opts: SCRIPT_FONTS, value: "'Dancing Script',cursive" },
        { id: 'height', label: 'Height (inches)', type: 'range', min: 3, max: 12, step: 0.5, value: 6 },
        { id: 'thickness', label: 'Thickness (inches)', type: 'range', min: 0.12, max: 0.75, step: 0.02, value: 0.25 },
        { id: 'stand', label: 'Add a stand foot', type: 'check', value: true },
        { id: 'twoPiece', label: 'Two-piece press fit (2 colors)', type: 'check', value: true }
      ],
      render: function (s) {
        var W = 500, H = 400;
        var initial = (s.initial || 'A').slice(0, 2).toUpperCase();
        var name = s.name || '';
        var nameSize = Math.max(30, Math.min(96, 430 / Math.max(4, name.length) * 1.55));
        var out = '';
        out += '<text x="250" y="210" text-anchor="middle" dominant-baseline="middle" ' +
               'font-family="' + s.blockFont + '" font-weight="900" font-size="' + (initial.length > 1 ? 250 : 320) + '" fill="' + s.c1 + '">' +
               A.esc(initial) + '</text>';
        if (name) {
          out += '<g transform="rotate(-7 250 232)">' +
                 '<text x="250" y="232" text-anchor="middle" dominant-baseline="middle" ' +
                 'font-family="' + s.scriptFont + '" font-weight="700" font-size="' + nameSize + '" ' +
                 'fill="' + s.c2 + '" stroke="' + s.c1 + '" stroke-width="' + (nameSize * 0.13).toFixed(1) + '" ' +
                 'stroke-linejoin="round" paint-order="stroke">' + A.esc(name) + '</text></g>';
        }
        if (s.stand) {
          out += '<rect x="140" y="352" width="220" height="20" rx="7" fill="' + s.c1 + '" opacity=".92"/>' +
                 '<rect x="140" y="352" width="220" height="6" rx="3" fill="#fff" opacity=".08"/>';
        }
        return wrap(W, H, out);
      }
    },

    'nameplate': {
      icon: '▭', label: 'Name Plate / Desk Sign',
      title: 'Name plate',
      coverage: 0.72, ratio: 3.2,
      fields: [
        { id: 'name', label: 'Main line', type: 'text', value: 'C. GILLELAND', max: 24, req: true },
        { id: 'sub', label: 'Second line (optional)', type: 'text', value: 'Shop Foreman', max: 28 },
        { id: 'blockFont', label: 'Font', type: 'choices', opts: BLOCK_FONTS, value: "'Inter',sans-serif" },
        { id: 'height', label: 'Length (inches)', type: 'range', min: 4, max: 14, step: 0.5, value: 9 },
        { id: 'thickness', label: 'Thickness (inches)', type: 'range', min: 0.16, max: 0.8, step: 0.02, value: 0.3 },
        { id: 'bevel', label: 'Beveled edge', type: 'check', value: true },
        { id: 'stand', label: 'Wedge desk stand', type: 'check', value: true }
      ],
      render: function (s) {
        var W = 640, H = 200;
        var name = s.name || '', sub = s.sub || '';
        var fs = Math.max(26, Math.min(74, 560 / Math.max(6, name.length) * 1.5));
        var out = '<rect x="16" y="28" width="608" height="' + (s.stand ? 118 : 144) + '" rx="' + (s.bevel ? 14 : 5) + '" fill="' + s.c1 + '"/>';
        if (s.bevel) out += '<rect x="26" y="38" width="588" height="' + ((s.stand ? 118 : 144) - 20) + '" rx="9" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="3"/>';
        out += '<text x="320" y="' + (sub ? 80 : 96) + '" text-anchor="middle" dominant-baseline="middle" ' +
               'font-family="' + s.blockFont + '" font-weight="800" font-size="' + fs + '" letter-spacing="2" fill="' + s.c2 + '">' + A.esc(name) + '</text>';
        if (sub) out += '<text x="320" y="' + (s.stand ? 120 : 130) + '" text-anchor="middle" dominant-baseline="middle" ' +
               'font-family="' + s.blockFont + '" font-weight="700" font-size="' + (fs * 0.42).toFixed(0) + '" letter-spacing="3" fill="' + s.c2 + '" opacity=".72">' + A.esc(sub) + '</text>';
        if (s.stand) out += '<path d="M60 146 L580 146 L520 178 L120 178 Z" fill="' + s.c1 + '" opacity=".8"/>';
        return wrap(W, H, out);
      }
    },

    'keychain': {
      icon: '⚿', label: 'Name Keychain',
      title: 'Keychain',
      coverage: 0.6, ratio: 2.6,
      fields: [
        { id: 'name', label: 'Text', type: 'text', value: 'CHAD', max: 14, req: true },
        { id: 'blockFont', label: 'Font', type: 'choices', opts: BLOCK_FONTS.concat(SCRIPT_FONTS.slice(0, 2)), value: "'Bebas Neue',sans-serif" },
        { id: 'height', label: 'Length (inches)', type: 'range', min: 1.5, max: 4, step: 0.25, value: 2.5 },
        { id: 'thickness', label: 'Thickness (inches)', type: 'range', min: 0.08, max: 0.3, step: 0.02, value: 0.16 },
        { id: 'inset', label: 'Recessed (inlaid) text', type: 'check', value: true },
        { id: 'ring', label: 'Include split ring', type: 'check', value: true }
      ],
      render: function (s) {
        var W = 560, H = 220;
        var name = s.name || '';
        var fs = Math.max(30, Math.min(96, 400 / Math.max(3, name.length) * 1.7));
        var out = '<rect x="60" y="55" width="450" height="110" rx="55" fill="' + s.c1 + '"/>' +
          '<circle cx="104" cy="110" r="20" fill="var(--bg)" stroke="' + s.c1 + '" stroke-width="0"/>';
        if (s.ring) out += '<circle cx="104" cy="110" r="31" fill="none" stroke="#9aa7b3" stroke-width="7" stroke-dasharray="150 24"/>';
        out += '<text x="322" y="112" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="' + s.blockFont + '" font-weight="800" font-size="' + fs + '" letter-spacing="1.5" ' +
          'fill="' + s.c2 + '"' + (s.inset ? ' opacity=".95"' : '') + '>' + A.esc(name) + '</text>';
        return wrap(W, H, out);
      }
    },

    'doorsign': {
      icon: '⌂', label: 'Door / Room Sign',
      title: 'Door sign',
      coverage: 0.7, ratio: 1.8,
      fields: [
        { id: 'name', label: 'Line 1', type: 'text', value: "EMMA'S ROOM", max: 22, req: true },
        { id: 'sub', label: 'Line 2 (optional)', type: 'text', value: 'Knock First', max: 24 },
        { id: 'blockFont', label: 'Font', type: 'choices', opts: BLOCK_FONTS, value: "'Righteous',sans-serif" },
        { id: 'height', label: 'Width (inches)', type: 'range', min: 4, max: 12, step: 0.5, value: 8 },
        { id: 'thickness', label: 'Thickness (inches)', type: 'range', min: 0.12, max: 0.5, step: 0.02, value: 0.2 },
        { id: 'holes', label: 'Hanging holes', type: 'check', value: true },
        { id: 'border', label: 'Raised border', type: 'check', value: true }
      ],
      render: function (s) {
        var W = 560, H = 320;
        var n = s.name || '', sub = s.sub || '';
        var fs = Math.max(26, Math.min(66, 470 / Math.max(6, n.length) * 1.55));
        var out = '<rect x="30" y="40" width="500" height="240" rx="22" fill="' + s.c1 + '"/>';
        if (s.border) out += '<rect x="48" y="58" width="464" height="204" rx="14" fill="none" stroke="' + s.c2 + '" stroke-width="8" opacity=".85"/>';
        if (s.holes) out += '<circle cx="88" cy="72" r="9" fill="var(--bg2)"/><circle cx="472" cy="72" r="9" fill="var(--bg2)"/>';
        out += '<text x="280" y="' + (sub ? 148 : 162) + '" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="' + s.blockFont + '" font-weight="800" font-size="' + fs + '" fill="' + s.c2 + '">' + A.esc(n) + '</text>';
        if (sub) out += '<text x="280" y="205" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="' + s.blockFont + '" font-weight="700" font-size="' + (fs * 0.5).toFixed(0) + '" fill="' + s.c2 + '" opacity=".7">' + A.esc(sub) + '</text>';
        return wrap(W, H, out);
      }
    },

    'wordart': {
      icon: '✒', label: 'Word / Monogram Art',
      title: 'Word art',
      coverage: 0.22, ratio: 2.4,
      fields: [
        { id: 'name', label: 'Word or phrase', type: 'text', value: 'Gather', max: 22, req: true },
        { id: 'scriptFont', label: 'Style', type: 'choices', opts: SCRIPT_FONTS.concat(BLOCK_FONTS.slice(0, 2)), value: "'Great Vibes',cursive" },
        { id: 'height', label: 'Width (inches)', type: 'range', min: 4, max: 18, step: 0.5, value: 10 },
        { id: 'thickness', label: 'Thickness (inches)', type: 'range', min: 0.12, max: 0.6, step: 0.02, value: 0.22 },
        { id: 'stand', label: 'Freestanding base', type: 'check', value: false },
        { id: 'connect', label: 'Add connecting rail (needed for cursive)', type: 'check', value: true }
      ],
      render: function (s) {
        var W = 620, H = 260;
        var t = s.name || '';
        var fs = Math.max(40, Math.min(150, 540 / Math.max(4, t.length) * 1.9));
        var out = '';
        if (s.connect) out += '<rect x="60" y="176" width="500" height="11" rx="5" fill="' + s.c1 + '" opacity=".9"/>';
        out += '<text x="310" y="135" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="' + s.scriptFont + '" font-weight="700" font-size="' + fs + '" fill="' + s.c2 + '" ' +
          'stroke="' + s.c1 + '" stroke-width="' + (fs * 0.05).toFixed(1) + '" paint-order="stroke">' + A.esc(t) + '</text>';
        if (s.stand) out += '<rect x="180" y="196" width="260" height="22" rx="8" fill="' + s.c1 + '"/>';
        return wrap(W, H, out);
      }
    }
  };

  function wrap(W, H, inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
      '<style>@import url("' + FONT_IMPORT + '");</style>' + inner + '</svg>';
  }

  /* ---------- state ---------- */
  var typeKey = A.qs('type') && TYPES[A.qs('type')] ? A.qs('type') : 'initial-name';
  var S = {};

  function defaults(key) {
    var s = { c1: '#1f2933', c2: '#4db6ac', material: 'PLA' };
    TYPES[key].fields.forEach(function (f) { s[f.id] = f.value; });
    return s;
  }

  /* ---------- option UI ---------- */
  function renderTypes() {
    A.$('#types').innerHTML = Object.keys(TYPES).map(function (k) {
      return '<button data-k="' + k + '"' + (k === typeKey ? ' class="on"' : '') + '>' +
        '<span class="big">' + TYPES[k].icon + '</span>' + A.esc(TYPES[k].label) + '</button>';
    }).join('');
    A.$$('#types button').forEach(function (b) {
      b.addEventListener('click', function () {
        typeKey = b.dataset.k;
        S = defaults(typeKey);
        renderTypes(); renderOpts(); draw();
      });
    });
  }

  function renderOpts() {
    var t = TYPES[typeKey];
    A.$('#optTitle').textContent = t.title;
    A.$('#opts').innerHTML = t.fields.map(function (f) {
      var v = S[f.id];
      if (f.type === 'text') {
        return '<label class="' + (f.req ? 'req' : '') + '" for="f_' + f.id + '">' + A.esc(f.label) + '</label>' +
          '<input id="f_' + f.id + '" data-f="' + f.id + '" type="text" maxlength="' + (f.max || 30) + '" value="' + A.esc(v) + '">';
      }
      if (f.type === 'range') {
        return '<label for="f_' + f.id + '">' + A.esc(f.label) + ' — <span class="mono" style="color:var(--accent)" id="v_' + f.id + '">' + v + '"</span></label>' +
          '<input id="f_' + f.id + '" data-f="' + f.id + '" type="range" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="' + v + '">';
      }
      if (f.type === 'check') {
        return '<label class="inline" style="margin-top:11px"><input type="checkbox" data-f="' + f.id + '"' + (v ? ' checked' : '') + '> ' + A.esc(f.label) + '</label>';
      }
      if (f.type === 'choices') {
        return '<label>' + A.esc(f.label) + '</label><div class="choices">' + f.opts.map(function (o, i) {
          var id = 'ch_' + f.id + '_' + i;
          return '<input type="radio" name="' + f.id + '" id="' + id + '" data-f="' + f.id + '" value="' + A.esc(o.id) + '"' + (o.id === v ? ' checked' : '') + '>' +
            '<label for="' + id + '" style="font-family:' + o.id + '">' + A.esc(o.label) + '</label>';
        }).join('') + '</div>';
      }
      return '';
    }).join('');

    A.$$('#opts [data-f]').forEach(function (inp) {
      var ev = inp.type === 'checkbox' || inp.type === 'radio' ? 'change' : 'input';
      inp.addEventListener(ev, function () {
        var f = inp.dataset.f;
        if (inp.type === 'checkbox') S[f] = inp.checked;
        else if (inp.type === 'range') { S[f] = parseFloat(inp.value); var lab = A.$('#v_' + f); if (lab) lab.textContent = inp.value + '"'; }
        else S[f] = inp.value;
        draw();
      });
    });
  }

  function renderColors() {
    ['sw1', 'sw2'].forEach(function (id, idx) {
      A.$('#' + id).innerHTML = PALETTE.map(function (c, i) {
        var rid = id + '_' + i;
        return '<input type="radio" name="' + id + '" id="' + rid + '" value="' + c + '">' +
          '<label for="' + rid + '" style="background:' + c + '" title="' + c + '"></label>';
      }).join('');
      A.$$('#' + id + ' input').forEach(function (r) {
        r.addEventListener('change', function () {
          S[idx === 0 ? 'c1' : 'c2'] = r.value;
          A.$(idx === 0 ? '#c1' : '#c2').value = r.value;
          draw();
        });
      });
    });
    A.$('#c1').addEventListener('input', function () { S.c1 = this.value; draw(); });
    A.$('#c2').addEventListener('input', function () { S.c2 = this.value; draw(); });

    A.$('#material').innerHTML = MATERIALS.map(function (m, i) {
      return '<input type="radio" name="mat" id="mat_' + i + '" value="' + m.id + '"' + (m.id === S.material ? ' checked' : '') + '>' +
        '<label for="mat_' + i + '">' + A.esc(m.label) + '</label>';
    }).join('');
    A.$$('#material input').forEach(function (r) {
      r.addEventListener('change', function () { S.material = r.value; draw(); });
    });
  }

  /* ---------- estimate ----------
     Grams and hours are geometry, not money — safe to show.
     The PRICE comes from the public, already-marked-up bands.
     No filament cost, markup or hourly rate is reachable here. */
  var BANDS = (A.cfg.priceBands || []).slice();
  A.ready.then(function () { A.Bands.load().then(function (b) { BANDS = b; draw(); }); });

  function estimate() {
    var t = TYPES[typeKey];
    var h = parseFloat(S.height) || 6;
    var th = parseFloat(S.thickness) || 0.2;
    // long dimension is `height` for signs, width for plates — ratio maps the other side
    var longSide = h, shortSide = h / t.ratio;
    if (typeKey === 'initial-name') { longSide = h; shortSide = h / 1.0; } // roughly square
    var area = longSide * shortSide * t.coverage;              // in^2 of actual material footprint
    var volIn3 = area * th;
    var volCm3 = volIn3 * 16.387;
    var solid = th < 0.2 ? 0.92 : 0.78;                        // thin parts are nearly all wall
    var grams = volCm3 * 1.24 * solid;
    if (S.twoPiece) grams *= 1.06;
    if (S.stand) grams += 4;
    var hours = grams / 13 + 0.2;
    var band = A.Bands.forSize(BANDS, Math.max(longSide, shortSide));
    return {
      grams: grams, hours: hours,
      band: band,
      w: longSide, hh: shortSide, th: th
    };
  }

  /* ---------- draw ---------- */
  var lastSVG = '';
  function draw() {
    var t = TYPES[typeKey];
    lastSVG = t.render(S);
    A.$('#preview').innerHTML = lastSVG;

    var e = estimate();
    A.$('#dims').textContent = e.w.toFixed(1) + '" × ' + e.hh.toFixed(1) + '" × ' + e.th.toFixed(2) + '"';
    A.$('#eGrams').textContent = Math.round(e.grams) + ' g';
    A.$('#eHours').textContent = e.hours.toFixed(1) + ' h';
    if (e.band) {
      A.$('#ePrice').textContent = e.band.low === e.band.high
        ? A.money0(e.band.low)
        : A.money0(e.band.low) + '–' + Math.round(e.band.high);
      A.$('#ePrice').title = e.band.label;
      var bl = A.$('#bandLabel'); if (bl) bl.textContent = e.band.label;
    } else {
      A.$('#ePrice').textContent = '—';
    }

    var warn = A.$('#warn'), msg = '';
    var name = String(S.name || '');
    if (/wordart|initial-name/.test(typeKey) && /['"]/.test(name)) msg = 'Quotes and apostrophes print fragile';
    if (typeKey === 'wordart' && !S.connect && /Vibes|Dancing|Pacifico/.test(S.scriptFont || '')) msg = 'Cursive needs the connecting rail or letters fall apart';
    if (parseFloat(S.thickness) < 0.14) msg = 'Under 0.15" may flex or crack';
    if (name.length > 16) msg = 'Long text shrinks letters — consider going bigger';
    warn.textContent = '⚠ ' + msg;
    warn.classList.toggle('hide', !msg);
  }

  /* ---------- actions ---------- */
  function summary() {
    var t = TYPES[typeKey];
    return t.fields.map(function (f) {
      var v = S[f.id];
      if (f.type === 'check') return v ? f.label : null;
      if (f.type === 'choices') {
        var o = f.opts.filter(function (x) { return x.id === v; })[0];
        return f.label + ': ' + (o ? o.label : v);
      }
      if (f.type === 'range') return f.label + ': ' + v + '"';
      return f.label + ': ' + v;
    }).filter(Boolean).join(' · ');
  }

  A.$('#addBtn').addEventListener('click', function () {
    var t = TYPES[typeKey];
    var missing = t.fields.filter(function (f) { return f.req && !String(S[f.id] || '').trim(); });
    if (missing.length) { A.toast('Fill in: ' + missing.map(function (f) { return f.label; }).join(', '), 'err'); return; }
    var e = estimate();
    var qty = Math.max(1, parseInt(A.$('#qty').value, 10) || 1);
    var rec = {
      kind: 'Custom design', type: typeKey, typeLabel: t.label,
      config: JSON.parse(JSON.stringify(S)),
      summary: summary(), material: S.material,
      colors: [S.c1, S.c2],
      estGrams: Math.round(e.grams), estHours: +e.hours.toFixed(2),
      estPrice: e.band ? e.band.low : 0,
      estPriceHigh: e.band ? e.band.high : 0,
      priceBand: e.band ? e.band.label : '',
      notes: A.$('#notes').value.trim(),
      due: A.$('#due').value || '', qty: qty, svg: lastSVG
    };
    A.Requests.create(Object.assign({ source: 'configurator' }, rec)).then(function (saved) {
      if (A.mode() === 'supabase' && !saved._synced) {
        A.toast('Saved here — it will upload automatically.', 'err');
      }
    });
    A.List.add({
      key: 'custom:' + A.uid(), kind: 'Custom design',
      title: t.label + ' — "' + (S.name || S.initial || '') + '"',
      detail: rec.summary, price: e.band ? e.band.low : 0, qty: qty, svg: lastSVG,
      notes: rec.notes, due: rec.due
    });
    A.toast('Configuration added to your list');
  });

  A.$('#pngBtn').addEventListener('click', function () {
    var blob = new Blob([lastSVG], { type: 'image/svg+xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (typeKey + '-' + (S.name || S.initial || 'preview')).replace(/[^a-z0-9-]+/gi, '-').toLowerCase() + '.svg';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  A.$('#resetBtn').addEventListener('click', function () {
    S = defaults(typeKey); renderOpts(); draw();
    A.$('#notes').value = ''; A.$('#qty').value = 1; A.$('#due').value = '';
  });

  /* ---------- boot ---------- */
  S = defaults(typeKey);
  A.$('#orderNote').textContent = A.cfg.orderNote || '';
  A.$('#bandNote').textContent = A.cfg.bandNote || '';
  renderTypes(); renderOpts(); renderColors(); draw();
})();

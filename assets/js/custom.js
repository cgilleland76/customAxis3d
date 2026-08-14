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

    'cake-topper': {
      icon: '🎂', label: 'Cake Topper',
      title: 'Cake topper',
      coverage: 0.20, ratio: 1.0,
      note: 'Spikes go into the cake. Wash before use or sleeve them in a cut straw — printed layer lines trap bacteria and are not dishwasher safe.',
      fields: [
        { id: 'name', label: 'Name or word', type: 'text', value: 'Anna', max: 20, req: true },
        { id: 'cake', label: 'Cake size', type: 'choices', value: '8', opts: [
            { id: '6',  label: '6 inch' }, { id: '8',  label: '8 inch' },
            { id: '10', label: '10 inch' }, { id: '12', label: '12 inch' } ] },
        { id: 'scriptFont', label: 'Lettering', type: 'choices', opts: SCRIPT_FONTS, value: "'Great Vibes',cursive" },
        { id: 'spikes', label: 'Two 50 mm spikes', type: 'check', value: true }
      ],
      /* From the generator notes: topper width = cake diameter x 0.60,
         lettering capped so short names do not tower, spikes add ~49 mm. */
      sizeFor: function (S) {
        var cakeIn = parseFloat(S.cake) || 8;
        var widthIn = cakeIn * 0.60;
        var letterIn = widthIn * 0.47;
        var totalIn = letterIn + (S.spikes ? 49 / 25.4 : 0);
        return { long: widthIn, short: totalIn, th: 4 / 25.4, letterIn: letterIn };
      },
      render: function (s) {
        var W = 560, H = 420;
        var t = s.name || '';
        var fs = Math.max(34, Math.min(150, 470 / Math.max(3, t.length) * 1.85));
        var out = '<text x="280" y="150" text-anchor="middle" dominant-baseline="middle" ' +
          'font-family="' + s.scriptFont + '" font-weight="700" font-size="' + fs + '" ' +
          'fill="' + s.c2 + '" stroke="' + s.c1 + '" stroke-width="' + (fs * 0.05).toFixed(1) +
          '" paint-order="stroke">' + A.esc(t) + '</text>';
        if (s.spikes) {
          [200, 360].forEach(function (x) {
            out += '<path d="M' + (x - 11) + ' 210 L' + (x + 11) + ' 210 L' + (x + 3) + ' 380 L' + (x - 3) + ' 380 Z" fill="' + s.c1 + '"/>';
          });
          out += '<line x1="120" y1="380" x2="440" y2="380" stroke="' + s.c2 +
                 '" stroke-width="2" stroke-dasharray="6 6" opacity=".45"/>' +
                 '<text x="280" y="400" text-anchor="middle" font-family="ui-monospace,monospace" ' +
                 'font-size="13" fill="' + s.c2 + '" opacity=".55">cake surface</text>';
        }
        return wrap(W, H, out);
      }
    },

    'tap-to-pay': {
      icon: '▤', label: 'Tap-to-Pay Card Holder',
      title: 'Tap-to-pay holder',
      coverage: 0.78, ratio: 1.55,
      needsImage: true,
      note: 'Snaps together with barbed clips — no glue. Your contactless card drops in and still reads through the shell.',
      fields: [
        { id: 'art', label: 'Logo or photo to shape it from', type: 'image', req: true },
        { id: 'holderW', label: 'Overall width (inches)', type: 'range', min: 3.9, max: 7, step: 0.1, value: 4.4 },
        { id: 'badge', label: 'Small text on the front (optional)', type: 'text', value: '', max: 14 },
        { id: 'keyring', label: 'Add a key-ring loop', type: 'check', value: false }
      ],
      sizeFor: function (S) {
        var w = Math.max(3.9, parseFloat(S.holderW) || 4.4);
        return { long: w, short: w / 1.55, th: 4 / 25.4 };
      },
      render: function (s) {
        var W = 600, H = 400;
        var out = '<rect x="40" y="40" width="520" height="320" rx="26" fill="' + s.c1 + '"/>';
        if (s.art) {
          out += '<clipPath id="cp"><rect x="52" y="52" width="496" height="296" rx="20"/></clipPath>' +
                 '<image href="' + s.art + '" x="52" y="52" width="496" height="296" ' +
                 'preserveAspectRatio="xMidYMid meet" clip-path="url(#cp)"/>';
        } else {
          out += '<text x="300" y="190" text-anchor="middle" font-family="ui-monospace,monospace" ' +
                 'font-size="15" fill="' + s.c2 + '" opacity=".7">upload a logo or photo</text>' +
                 '<text x="300" y="214" text-anchor="middle" font-family="ui-monospace,monospace" ' +
                 'font-size="12" fill="' + s.c2 + '" opacity=".45">the outline gets traced from it</text>';
        }
        /* contactless card, 85.6 x 54 mm, to scale against the holder width */
        var wIn = Math.max(3.9, parseFloat(s.holderW) || 4.4);
        var cardW = 520 * (3.370 / wIn), cardH = cardW * (54 / 85.6);
        out += '<rect x="' + (300 - cardW / 2).toFixed(0) + '" y="' + (200 - cardH / 2).toFixed(0) + '" ' +
               'width="' + cardW.toFixed(0) + '" height="' + cardH.toFixed(0) + '" rx="10" fill="none" ' +
               'stroke="' + s.c2 + '" stroke-width="3" stroke-dasharray="9 7" opacity=".9"/>' +
               '<text x="300" y="' + (200 + cardH / 2 + 20).toFixed(0) + '" text-anchor="middle" ' +
               'font-family="ui-monospace,monospace" font-size="12" fill="' + s.c2 + '" opacity=".75">card cavity</text>';
        if (s.badge) {
          out += '<text x="300" y="336" text-anchor="middle" font-family="\'Inter\',sans-serif" ' +
                 'font-weight="800" font-size="22" fill="' + s.c2 + '">' + A.esc(s.badge) + '</text>';
        }
        if (s.keyring) out += '<circle cx="66" cy="66" r="13" fill="none" stroke="' + s.c2 + '" stroke-width="5"/>';
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

  /* Downscale in the browser so a 12 MP phone photo does not become a 12 MB
     request row. 720 px is plenty to trace an outline from. */
  function shrinkImage(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = rej;
      fr.onload = function () {
        var img = new Image();
        img.onerror = rej;
        img.onload = function () {
          var max = 720, sc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * sc);
          c.height = Math.round(img.height * sc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/png'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
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
      if (f.type === 'image') {
        return '<label class="' + (f.req ? 'req' : '') + '">' + A.esc(f.label) + '</label>' +
          '<div class="rowflex"><input type="file" id="f_' + f.id + '" data-f="' + f.id + '" accept="image/*" class="hide">' +
          '<button class="btn ghost sm" type="button" id="pick_' + f.id + '">Choose image</button>' +
          '<span class="hint" style="margin:0" id="nm_' + f.id + '">' + (S[f.id] ? 'image loaded' : 'no image yet') + '</span></div>' +
          '<p class="hint">Resized in your browser. A clean shape with a clear outline traces best — busy photos need more work.</p>';
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

    /* image pickers */
    t.fields.filter(function (f) { return f.type === 'image'; }).forEach(function (f) {
      var btn = A.$('#pick_' + f.id), inp = A.$('#f_' + f.id);
      if (!btn || !inp) return;
      btn.addEventListener('click', function () { inp.click(); });
      inp.addEventListener('change', function () {
        var file = inp.files && inp.files[0];
        if (!file) return;
        shrinkImage(file).then(function (src) {
          S[f.id] = src;
          var nm = A.$('#nm_' + f.id);
          if (nm) nm.textContent = file.name.slice(0, 28);
          draw();
        }).catch(function () { A.toast('Could not read that image', 'err'); });
        inp.value = '';
      });
    });

    A.$$('#opts [data-f]').forEach(function (inp) {
      if (inp.type === 'file') return;
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
    if (t.sizeFor) {                       // types with a real dimensional rule
      var sz = t.sizeFor(S);
      longSide = sz.long; shortSide = sz.short; th = sz.th;
    }
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
    var noteEl = A.$('#typeNote');
    if (noteEl) {
      noteEl.textContent = t.note || '';
      noteEl.classList.toggle('hide', !t.note);
    }
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
    if (typeKey === 'cake-topper') {
      var sz = t.sizeFor(S);
      /* the generator warns under a 1.2 mm stroke; lettering shrinks as the
         name gets longer because the width is fixed by the cake size */
      var nameLen = Math.max(3, String(S.name || '').length);
      /* Width is fixed by the cake, so a longer name is rendered smaller.
         Effective glyph height, not the nominal lettering height, is what
         decides whether the strokes survive printing. */
      var effIn = Math.min(sz.letterIn, sz.long / (0.55 * nameLen));
      var strokeMm = effIn * 25.4 * 0.085;
      if (strokeMm < 1.2) msg = 'Letters get thin at this length — go up a cake size or shorten the word';
    }
    if (typeKey === 'tap-to-pay') {
      if (!S.art) msg = 'Upload a logo or photo — the outline is traced from it';
      else if ((parseFloat(S.holderW) || 0) < 4.0) msg = 'Under 4 in leaves almost no shell around the card';
    }
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
      art: S.art || '',
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

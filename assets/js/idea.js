/* =========================================================
   idea.js — AI Idea Modeler (prompt capture + spec sheet)
   Phase 2: set SITE.imageGenEndpoint and the Generate button
   turns on automatically. See README.
   ========================================================= */
(function () {
  'use strict';
  var A = window.APP;

  var ENV = ['Indoors', 'Outdoors / weather', 'Garage or shop', 'Kitchen (food contact)', 'Car', 'Handled a lot / kid-proof'];
  var FEAT = ['Move or flex', 'Hold weight', 'Screw to something', 'Snap together', 'Stack or nest',
              'Hold a magnet', 'Be watertight', 'Have text on it', 'Match a color exactly', 'Be lightweight'];

  var refs = [];                 // {src, name}
  var specId = 'IDEA-' + A.uid().slice(-6).toUpperCase();
  var genImage = null;

  /* Category picker mirrors how you actually file things, so a customer's
     wording lines up with your taxonomy instead of inventing new buckets. */
  A.Categories.load().then(function (cats) {
    var sel = A.$('#cat');
    if (!sel) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">— pick one —</option>' +
      A.Categories.visible(cats).map(function (c) { return '<option>' + A.esc(c.name) + '</option>'; }).join('') +
      '<option>Something else</option>';
    if (keep) sel.value = keep;
  });

  /* ---------- chips ---------- */
  function chips(hostId, items, name) {
    A.$('#' + hostId).innerHTML = items.map(function (t, i) {
      var id = name + '_' + i;
      return '<input type="checkbox" id="' + id + '" value="' + A.esc(t) + '">' +
             '<label for="' + id + '">' + A.esc(t) + '</label>';
    }).join('');
    A.$$('#' + hostId + ' input').forEach(function (c) { c.addEventListener('change', update); });
  }
  function picked(hostId) {
    return A.$$('#' + hostId + ' input:checked').map(function (c) { return c.value; });
  }

  /* ---------- references ---------- */
  function drawRefs() {
    var html = refs.map(function (r, i) {
      return '<div class="r"><img src="' + A.esc(r.src) + '" alt=""><button data-i="' + i + '" title="Remove">✕</button></div>';
    }).join('');
    if (refs.length < 4) html += '<div class="addbox" id="addRef" title="Add image">+</div>';
    A.$('#refs').innerHTML = html;
    A.$$('#refs .r button').forEach(function (b) {
      b.addEventListener('click', function () { refs.splice(+b.dataset.i, 1); drawRefs(); update(); });
    });
    var add = A.$('#addRef');
    if (add) add.addEventListener('click', function () { A.$('#refFile').click(); });
  }

  function shrink(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = rej;
      fr.onload = function () {
        var img = new Image();
        img.onerror = rej;
        img.onload = function () {
          var max = 640, sc = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.72));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  A.$('#refFile').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files).slice(0, 4 - refs.length);
    Promise.all(files.map(shrink)).then(function (srcs) {
      srcs.forEach(function (s, i) { refs.push({ src: s, name: files[i].name }); });
      drawRefs(); update();
    }).catch(function () { A.toast('Could not read that image', 'err'); });
    this.value = '';
  });

  A.$('#refAdd').addEventListener('click', function () {
    var u = A.$('#refUrl').value.trim();
    if (!/^https?:\/\//i.test(u)) { A.toast('Paste a full https:// image link', 'err'); return; }
    if (refs.length >= 4) { A.toast('Four references is the max', 'err'); return; }
    refs.push({ src: u, name: 'link' });
    A.$('#refUrl').value = '';
    drawRefs(); update();
  });

  /* ---------- gather ---------- */
  function gather() {
    return {
      id: specId,
      desc: A.$('#desc').value.trim(),
      cat: A.$('#cat').value,
      purpose: A.$('#purpose').value.trim(),
      dims: { w: A.$('#dw').value, d: A.$('#dd').value, h: A.$('#dh').value },
      env: picked('env'),
      feat: picked('feat'),
      qty: parseInt(A.$('#qty').value, 10) || 1,
      due: A.$('#due').value,
      budget: A.$('#budget').value,
      mustfit: A.$('#mustfit').value.trim(),
      name: A.$('#cname').value.trim(),
      contact: A.$('#cphone').value.trim(),
      refs: refs.map(function (r) { return r.src; })
    };
  }

  function dimText(d) {
    var p = [d.w, d.d, d.h].map(function (v) { return v ? parseFloat(v) + '"' : '—'; });
    return (d.w || d.d || d.h) ? p.join(' × ') + '  (W×D×H max)' : '';
  }

  /* ---------- material suggestion (transparent rules, not magic) ---------- */
  function suggestMaterial(g) {
    var e = g.env.join(' '), f = g.feat.join(' ');
    if (/Kitchen/.test(e)) return 'PETG — food-contact safe, dishwasher tolerant';
    if (/Outdoors|Car/.test(e)) return 'PETG or ASA — UV and heat resistant';
    if (/Move or flex/.test(f) && /kid-proof|Handled/.test(e)) return 'TPU — flexible and won’t snap';
    if (/Hold weight|Screw to something/.test(f)) return 'PETG — better layer adhesion under load';
    if (/Garage/.test(e)) return 'PETG — shop temperatures cook PLA';
    return 'PLA — cheapest, sharpest detail, plenty strong indoors';
  }
  function suggestStrength(g) {
    var f = g.feat.join(' ');
    if (/Hold weight/.test(f)) return '4 walls, 40% infill, print flat to load direction';
    if (/Move or flex/.test(f)) return '2 walls, 15% infill, thin living hinges';
    if (/Be watertight/.test(f)) return 'Vase mode or 5 walls + 0.28 layers, no top infill gaps';
    return '3 walls, 15% infill — standard';
  }

  /* ---------- prompt ---------- */
  function buildPrompt(g) {
    var bits = [];
    bits.push('A single 3D-printable object: ' + (g.desc || '(describe the object above)'));
    if (g.purpose) bits.push('Its job: ' + g.purpose + '.');
    if (g.cat) bits.push('Category: ' + g.cat + '.');
    if (g.mustfit) bits.push('Must fit/attach to: ' + g.mustfit + '.');
    var dt = dimText(g.dims);
    if (dt) bits.push('Fits inside ' + dt.replace('  (W×D×H max)', '') + '.');
    if (g.feat.length) bits.push('Requirements: ' + g.feat.join(', ').toLowerCase() + '.');
    if (g.env.length) bits.push('Used: ' + g.env.join(', ').toLowerCase() + '.');
    bits.push('Render as a clean product photo on a neutral seamless background, three-quarter view, ' +
              'soft studio lighting, matte 3D-printed plastic with faint visible layer lines, ' +
              'no text or watermarks, no human hands, single object centered.');
    return bits.join(' ');
  }

  /* ---------- spec sheet ---------- */
  function update() {
    var g = gather();
    A.$('#specId').textContent = g.id;

    var rows = [
      ['Object', g.desc],
      ['Purpose', g.purpose],
      ['Category', g.cat],
      ['Max size', dimText(g.dims)],
      ['Must fit', g.mustfit],
      ['Environment', g.env.join(', ')],
      ['Must do', g.feat.join(', ')],
      ['Quantity', g.qty > 1 ? g.qty + ' pieces' : '1 piece'],
      ['Needed by', g.due],
      ['Budget', g.budget],
      ['Suggested', suggestMaterial(g)],
      ['Print setup', suggestStrength(g)],
      ['References', refs.length ? refs.length + ' image' + (refs.length > 1 ? 's' : '') + ' attached' : ''],
      ['Requested by', [g.name, g.contact].filter(Boolean).join(' · ')]
    ];
    A.$('#specList').innerHTML = rows.map(function (r) {
      return '<dt>' + A.esc(r[0]) + '</dt><dd' + (r[1] ? '' : ' class="empty"') + '>' + A.esc(r[1] || 'not specified') + '</dd>';
    }).join('');

    A.$('#prompt').textContent = buildPrompt(g);

    // step highlighting
    var done = [!!g.desc, !!(g.dims.w || g.dims.h || g.env.length || g.feat.length), refs.length > 0, !!(g.desc && g.name)];
    A.$$('#steps div').forEach(function (d, i) { d.classList.toggle('on', done[i]); });
    A.$('#specState').textContent = g.desc && g.name ? 'ready to send' : 'draft';
    A.$('#specState').className = 'chip' + (g.desc && g.name ? ' on' : '');
  }

  /* ---------- plain text version ---------- */
  function asText() {
    var g = gather();
    var L = ['BUILD REQUEST ' + g.id, new Date().toLocaleString(), ''];
    L.push('OBJECT: ' + (g.desc || '-'));
    if (g.purpose) L.push('PURPOSE: ' + g.purpose);
    if (g.cat) L.push('CATEGORY: ' + g.cat);
    var dt = dimText(g.dims); if (dt) L.push('MAX SIZE: ' + dt);
    if (g.mustfit) L.push('MUST FIT: ' + g.mustfit);
    if (g.env.length) L.push('ENVIRONMENT: ' + g.env.join(', '));
    if (g.feat.length) L.push('MUST DO: ' + g.feat.join(', '));
    L.push('QUANTITY: ' + g.qty);
    if (g.due) L.push('NEEDED BY: ' + g.due);
    if (g.budget) L.push('BUDGET: ' + g.budget);
    L.push('SUGGESTED MATERIAL: ' + suggestMaterial(g));
    L.push('PRINT SETUP: ' + suggestStrength(g));
    if (refs.length) L.push('REFERENCES: ' + refs.length + ' attached');
    L.push('');
    L.push('FROM: ' + [g.name, g.contact].filter(Boolean).join(' / '));
    L.push('');
    L.push('--- generation prompt ---');
    L.push(buildPrompt(g));
    return L.join('\n');
  }

  /* ---------- actions ---------- */
  A.$$('.chip[data-ex]').forEach(function (c) {
    c.style.cursor = 'pointer';
    c.addEventListener('click', function () { A.$('#desc').value = c.dataset.ex; update(); A.$('#desc').focus(); });
  });

  A.$('#submitBtn').addEventListener('click', function () {
    var g = gather();
    if (!g.desc) { A.toast('Describe the object first', 'err'); A.$('#desc').focus(); return; }
    if (!g.name) { A.toast('Add your name so I know whose request this is', 'err'); A.$('#cname').focus(); return; }
    var rec = Object.assign({}, g, {
      kind: 'Idea request', source: 'idea-modeler',
      prompt: buildPrompt(g),
      suggestedMaterial: suggestMaterial(g),
      printSetup: suggestStrength(g),
      concept: genImage || ''
    });
    A.Requests.create(rec).then(function (saved) {
      A.List.add({
        key: 'idea:' + g.id, kind: 'Idea request',
        title: (g.purpose || g.desc).slice(0, 60) + ((g.purpose || g.desc).length > 60 ? '…' : ''),
        detail: g.id + (g.cat ? ' · ' + g.cat : ''), price: 0, qty: g.qty,
        notes: g.desc, due: g.due
      });
      if (A.mode() === 'supabase' && !saved._synced) {
        A.toast('Saved here (ref ' + g.id + ') — it will upload automatically.', 'err');
        A.$('#specState').textContent = 'saved · upload pending';
        A.$('#specState').className = 'chip amber';
      } else {
        A.toast('Sent — reference ' + g.id);
        A.$('#specState').textContent = 'sent ✓';
        A.$('#specState').className = 'chip on';
      }
      specId = 'IDEA-' + A.uid().slice(-6).toUpperCase();
    });
  });

  A.$('#copyBtn').addEventListener('click', function () {
    var t = asText();
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { A.toast('Spec copied'); },
      function () { A.toast('Copy failed — use Print instead', 'err'); });
    else A.toast('Copy not supported here', 'err');
  });

  A.$('#mailBtn').addEventListener('click', function () {
    var to = (A.cfg.contact && A.cfg.contact.email) || '';
    var g = gather();
    location.href = 'mailto:' + encodeURIComponent(to) +
      '?subject=' + encodeURIComponent('Build request ' + g.id) +
      '&body=' + encodeURIComponent(asText());
  });

  A.$('#printBtn').addEventListener('click', function () {
    var g = gather();
    A.$('#printsheet').innerHTML =
      '<h2 style="text-align:center;margin-bottom:2px">Build Request</h2>' +
      '<div style="text-align:center;font-size:12px;color:#555;margin-bottom:16px">' + A.esc(g.id) + ' · ' + new Date().toLocaleDateString() + '</div>' +
      '<pre style="white-space:pre-wrap;font-size:12px;line-height:1.6">' + A.esc(asText()) + '</pre>' +
      (refs.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
        refs.map(function (r) { return '<img src="' + A.esc(r.src) + '" style="width:150px;border:1px solid #ccc">'; }).join('') + '</div>' : '');
    window.print();
  });

  /* ---------- optional phase-2 image generation ---------- */
  (function wireGen() {
    var ep = A.cfg.imageGenEndpoint;
    if (!ep) return;
    var btn = A.$('#genBtn');
    A.$('#genMsg').textContent = 'Turn your description into a concept image.';
    btn.classList.remove('hide');
    btn.addEventListener('click', function () {
      var g = gather();
      if (!g.desc) { A.toast('Describe the object first', 'err'); return; }
      btn.disabled = true;
      A.$('#genMsg').textContent = 'Generating…';
      fetch(ep, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildPrompt(g) })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var src = d.image || d.url || (d.b64 ? 'data:image/png;base64,' + d.b64 : '');
          if (!src) throw new Error('no image in response');
          genImage = src;
          A.$('#genslot').innerHTML = '<img src="' + A.esc(src) + '" alt="concept">';
        })
        .catch(function (e) {
          A.$('#genMsg').textContent = 'Generation failed — the spec sheet still works. (' + e.message + ')';
          btn.disabled = false;
        });
    });
  })();

  /* ---------- boot ---------- */
  chips('env', ENV, 'env');
  chips('feat', FEAT, 'feat');
  drawRefs();
  A.$('#orderNote').textContent = A.cfg.orderNote || '';
  ['desc', 'cat', 'purpose', 'dw', 'dd', 'dh', 'qty', 'due', 'budget', 'mustfit', 'cname', 'cphone']
    .forEach(function (id) { A.$('#' + id).addEventListener('input', A.debounce(update, 120)); });
  A.$('#cat').addEventListener('change', update);
  A.$('#budget').addEventListener('change', update);
  update();
})();

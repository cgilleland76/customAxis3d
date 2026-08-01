/* =========================================================
   admin.js — owner tools: incoming requests, catalog, rates,
   quotes, backup. PIN-gated (obscurity, not security).
   ========================================================= */
(function () {
  'use strict';
  var A = window.APP;
  var products = [], editingId = null, statusFilter = 'all';

  /* ---------------- gate ---------------- */
  function unlock() {
    A.$('#gate').classList.add('hide');
    A.$('#panel').classList.remove('hide');
    boot();
  }
  function gateErr(msg) {
    var e = A.$('#gateErr');
    if (!msg) { e.classList.add('hide'); return; }
    e.innerHTML = '<span>⚠</span><div>' + A.esc(msg) + '</div>';
    e.classList.remove('hide');
  }

  A.$('#unlock').addEventListener('click', function () {
    gateErr('');
    if (A.Auth.enabled()) {
      var em = A.$('#email').value.trim(), pw = A.$('#pw').value;
      if (!em || !pw) { gateErr('Enter the email and password of your Supabase user.'); return; }
      A.$('#unlock').disabled = true;
      A.Auth.signIn(em, pw)
        .then(function () { A.lsSet('unlocked', 1); unlock(); })
        .catch(function (err) { gateErr(err.message || 'Sign-in failed.'); A.$('#unlock').disabled = false; });
      return;
    }
    if (A.$('#pin').value === String(A.cfg.adminPin)) { A.lsSet('unlocked', 1); unlock(); }
    else gateErr('Wrong PIN.');
  });

  ['#pin', '#pw'].forEach(function (sel) {
    var n = A.$(sel);
    if (n) n.addEventListener('keydown', function (e) { if (e.key === 'Enter') A.$('#unlock').click(); });
  });

  A.$('#lock').addEventListener('click', function () {
    A.lsSet('unlocked', 0);
    A.Rates.forget();          // do not leave cost data cached on a shared machine
    A.Auth.signOut().then(function () { location.reload(); }, function () { location.reload(); });
  });

  /* ---------------- tabs ---------------- */
  A.$$('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      A.$$('.tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      A.$$('[data-p]').forEach(function (s) { s.classList.toggle('hide', s.dataset.p !== b.dataset.t); });
    });
  });

  /* ---------------- stats ---------------- */
  function drawStats() {
    Promise.all([A.Requests.list(), A.Quotes.list(), A.Products.list()]).then(function (r) {
      var reqs = r[0], quotes = r[1], prods = r[2];
      var newCount = reqs.filter(function (x) { return (x.status || 'new') === 'new'; }).length;
      var revenue = quotes.reduce(function (s, q) { return s + (q.priceMarkup || 0); }, 0);
      A.$('#stats').innerHTML =
        box('New requests', newCount, newCount ? 'var(--accent2)' : '') +
        box('All requests', reqs.length) +
        box('Products', prods.length) +
        box('Saved quotes', quotes.length) +
        box('Quoted value', '$' + revenue, 'var(--accent)');
      function box(h, v, c) {
        return '<div class="b"><h5>' + h + '</h5><div class="v"' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</div></div>';
      }
    });
  }

  /* ---------------- incoming requests ---------------- */
  function reqTitle(r) {
    if (r.kind === 'Order list') return 'Order list — ' + (r.name || 'anonymous') + ' (' + (r.items || []).length + ' items)';
    if (r.kind === 'Idea request') return 'Idea — ' + (r.purpose || (r.desc || '').slice(0, 50));
    if (r.kind === 'Custom design') return (r.typeLabel || 'Custom') + ' — "' + ((r.config && (r.config.name || r.config.initial)) || '') + '"';
    return r.kind || 'Request';
  }

  function reqBody(r) {
    var L = [];
    if (r.kind === 'Order list') {
      (r.items || []).forEach(function (i, n) {
        L.push((n + 1) + '. ' + i.title + ' ×' + (i.qty || 1) + (i.detail ? '  [' + i.detail + ']' : ''));
        if (i.notes) L.push('    note: ' + i.notes);
      });
      if (r.estTotal) L.push('', 'Ballpark total: ' + A.money0(r.estTotal));
    } else if (r.kind === 'Idea request') {
      L.push('OBJECT: ' + (r.desc || ''));
      if (r.mustfit) L.push('MUST FIT: ' + r.mustfit);
      if (r.dims && (r.dims.w || r.dims.d || r.dims.h)) L.push('MAX SIZE: ' + [r.dims.w, r.dims.d, r.dims.h].join(' x ') + ' in');
      if (r.env && r.env.length) L.push('ENV: ' + r.env.join(', '));
      if (r.feat && r.feat.length) L.push('MUST DO: ' + r.feat.join(', '));
      if (r.budget) L.push('BUDGET: ' + r.budget);
      L.push('SUGGESTED: ' + (r.suggestedMaterial || '-'));
      L.push('SETUP: ' + (r.printSetup || '-'));
      L.push('', 'PROMPT: ' + (r.prompt || ''));
    } else if (r.kind === 'Custom design') {
      L.push(r.summary || '');
      L.push('Material: ' + (r.material || '-') + '   Colors: ' + (r.colors || []).join(' + '));
      L.push('Estimate: ' + r.estGrams + ' g · ' + r.estHours + ' h · ' + A.money0(r.estPrice || 0));
    }
    if (r.notes) L.push('', 'NOTES: ' + r.notes);
    return L.join('\n');
  }

  function drawReqs() {
    A.Requests.list().then(function (rows) {
      var view = rows.filter(function (r) { return statusFilter === 'all' || (r.status || 'new') === statusFilter; });
      A.$('#reqEmpty').classList.toggle('hide', view.length > 0);
      A.$('#reqs').innerHTML = view.map(function (r) {
        var st = r.status || 'new';
        return '<div class="req">' +
          '<div class="top">' +
            (r.svg ? '<div class="prev">' + r.svg + '</div>' : '') +
            '<div style="flex:1;min-width:200px">' +
              '<h4>' + A.esc(reqTitle(r)) + '</h4>' +
              '<div class="muted" style="font-size:12px">' +
                '<span class="chip mono" style="margin-right:6px">' + A.esc(r.kind || '') + '</span>' +
                (r._pending ? '<span class="chip amber" style="margin-right:6px">not uploaded yet</span>' : '') +
                new Date(r.created_at).toLocaleString() +
                (r.name ? ' · ' + A.esc(r.name) : '') +
                (r.contact ? ' · ' + A.esc(r.contact) : '') +
                (r.due ? ' · needed ' + A.esc(r.due) : '') +
                (r.qty > 1 ? ' · ×' + r.qty : '') +
              '</div>' +
            '</div>' +
            '<div class="rowflex">' +
              '<select data-st="' + A.esc(r.id) + '" style="width:auto">' +
                ['new', 'working', 'done'].map(function (s) {
                  return '<option value="' + s + '"' + (s === st ? ' selected' : '') + '>' + s + '</option>';
                }).join('') +
              '</select>' +
              '<button class="btn ghost sm" data-del="' + A.esc(r.id) + '">✕</button>' +
            '</div>' +
          '</div>' +
          (reqBody(r) ? '<pre>' + A.esc(reqBody(r)) + '</pre>' : '') +
          ((r.refs && r.refs.length) ? '<div class="thumbs">' + r.refs.map(function (s) {
            return '<img src="' + A.esc(s) + '" alt="reference">';
          }).join('') + '</div>' : '') +
          (r.concept ? '<div class="thumbs"><img src="' + A.esc(r.concept) + '" alt="concept"></div>' : '') +
        '</div>';
      }).join('');

      A.$$('#reqs [data-st]').forEach(function (s) {
        s.addEventListener('change', function () { A.Requests.setStatus(s.dataset.st, s.value).then(function () { drawStats(); drawReqs(); }); });
      });
      A.$$('#reqs [data-del]').forEach(function (b) {
        b.addEventListener('click', function () {
          if (confirm('Delete this request?')) A.Requests.remove(b.dataset.del).then(function () { drawStats(); drawReqs(); });
        });
      });
      A.$$('#reqs .thumbs img').forEach(function (i) {
        i.addEventListener('click', function () { A.lightbox(i.src, ''); });
      });
    });
  }

  A.$$('#statusFilter button').forEach(function (b) {
    b.addEventListener('click', function () {
      statusFilter = b.dataset.s;
      A.$$('#statusFilter button').forEach(function (x) { x.classList.toggle('on', x === b); });
      drawReqs();
    });
  });

  A.$('#reqCsv').addEventListener('click', function () {
    A.Requests.list().then(function (rows) {
      if (!rows.length) { A.toast('Nothing to export', 'err'); return; }
      A.downloadCSV('requests-' + A.today() + '.csv',
        'Created,Kind,Status,Name,Contact,Needed by,Qty,Summary,Notes',
        rows.map(function (r) {
          return [r.created_at, r.kind, r.status || 'new', r.name || '', r.contact || '', r.due || '',
                  r.qty || 1, reqTitle(r), (reqBody(r) || '').replace(/\n/g, ' | ')];
        }));
    });
  });

  /* ---------------- catalog ---------------- */
  function pForm(p) {
    editingId = p ? p.id : null;
    A.$('#pfTitle').textContent = p ? 'Edit: ' + p.name : 'Add a product';
    A.$('#p_name').value = p ? p.name : '';
    A.$('#p_cat').value = p ? (p.category || '') : '';
    A.$('#p_blurb').value = p ? (p.blurb || '') : '';
    A.$('#p_price').value = p ? (p.price || '') : '';
    A.$('#p_grams').value = p ? (p.grams || '') : '';
    A.$('#p_hours').value = p ? (p.hours || '') : '';
    A.$('#p_img').value = p && p.img && p.img.indexOf('data:') !== 0 ? p.img : '';
    A.$('#p_batch').checked = p ? !!p.batch : true;
    A.$('#p_best').checked = p ? /bestseller/.test(p.tags || '') : false;
    A.$('#p_quick').checked = p ? /quick/.test(p.tags || '') : false;
    uploaded = p && p.img && p.img.indexOf('data:') === 0 ? p.img : '';
    drawPPreview();
  }

  var uploaded = '';
  function drawPPreview() {
    var src = uploaded || A.$('#p_img').value.trim() || A.placeholderSVG(A.$('#p_name').value || 'new');
    A.$('#p_preview').innerHTML = '<img src="' + A.esc(src) + '" style="width:150px;border-radius:8px;border:1px solid var(--border)">';
  }
  A.$('#p_img').addEventListener('input', drawPPreview);
  A.$('#p_name').addEventListener('input', drawPPreview);
  A.$('#p_upload').addEventListener('click', function () { A.$('#p_file').click(); });
  A.$('#p_file').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 800, sc = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        uploaded = c.toDataURL('image/jpeg', 0.78);
        drawPPreview();
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
    this.value = '';
  });

  A.$('#p_save').addEventListener('click', function () {
    var name = A.$('#p_name').value.trim();
    if (!name) { A.toast('Name is required', 'err'); return; }
    var tags = [A.$('#p_best').checked ? 'bestseller' : '', A.$('#p_quick').checked ? 'quick' : ''].filter(Boolean).join(' ');
    var rec = {
      id: editingId || ('p-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')),
      name: name, category: A.$('#p_cat').value.trim(), blurb: A.$('#p_blurb').value.trim(),
      price: parseFloat(A.$('#p_price').value) || 0,
      grams: parseFloat(A.$('#p_grams').value) || 0,
      hours: parseFloat(A.$('#p_hours').value) || 0,
      img: uploaded || A.$('#p_img').value.trim(),
      batch: A.$('#p_batch').checked, tags: tags
    };
    products = products.filter(function (p) { return p.id !== rec.id; }).concat([rec]);
    A.Products.save(products).then(function () {
      A.toast(editingId ? 'Updated' : 'Added');
      pForm(null); drawProducts(); drawStats();
    });
  });

  A.$('#p_cancel').addEventListener('click', function () { pForm(null); });
  A.$('#p_seed').addEventListener('click', function () {
    if (!confirm('Replace the catalog with the sample products?')) return;
    products = A.Products.seed();
    A.Products.save(products).then(function () { drawProducts(); drawStats(); A.toast('Sample catalog restored'); });
  });
  A.$('#p_export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(products, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'products.json'; a.click();
  });

  function drawProducts() {
    var cats = {};
    products.forEach(function (p) { if (p.category) cats[p.category] = 1; });
    A.$('#catlist').innerHTML = Object.keys(cats).map(function (c) { return '<option value="' + A.esc(c) + '">'; }).join('');
    A.$('#plist').innerHTML = '<table><thead><tr><th></th><th>Name</th><th>Category</th>' +
      '<th class="num">$</th><th class="num">g</th><th class="num">h</th><th>Tags</th><th></th></tr></thead><tbody>' +
      products.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); }).map(function (p) {
        return '<tr><td><img src="' + A.esc(p.img || A.placeholderSVG(p.name)) + '" style="width:42px;height:34px;object-fit:cover;border-radius:5px"></td>' +
          '<td>' + A.esc(p.name) + '<div class="dim" style="font-size:11px">' + A.esc(p.blurb || '') + '</div></td>' +
          '<td>' + A.esc(p.category || '') + '</td><td class="num">' + (p.price || 0) + '</td>' +
          '<td class="num">' + (p.grams || '') + '</td><td class="num">' + (p.hours || '') + '</td>' +
          '<td class="mono dim" style="font-size:11px">' + A.esc(p.tags || '') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn ghost sm" data-edit="' + A.esc(p.id) + '">Edit</button> ' +
          '<button class="btn ghost sm" data-pdel="' + A.esc(p.id) + '">✕</button></td></tr>';
      }).join('') + '</tbody></table>';

    A.$$('#plist [data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        pForm(products.filter(function (p) { return p.id === b.dataset.edit; })[0]);
        window.scrollTo({ top: 200, behavior: 'smooth' });
      });
    });
    A.$$('#plist [data-pdel]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Remove this product?')) return;
        A.Products.remove(b.dataset.pdel).then(function (rows) { products = rows; drawProducts(); drawStats(); });
      });
    });
  }

  /* ---------------- rates ---------------- */
  var RM = { r_fil: 'filamentPerKg', r_watts: 'watts', r_kwh: 'kwhPrice', r_markup: 'markup', r_hourly: 'hourlyRate', r_flat: 'flatFee' };
  function loadRates() {
    return A.Rates.load().then(function (r) {
      if (r) Object.keys(RM).forEach(function (id) { A.$('#' + id).value = r[RM[id]]; });
      demo();
      return r;
    });
  }
  function demo() {
    var r = {}; Object.keys(RM).forEach(function (id) { r[RM[id]] = parseFloat(A.$('#' + id).value) || 0; });
    var g = 50, h = 3;
    var fil = g / 1000 * r.filamentPerKg, el = r.watts / 1000 * h * r.kwhPrice;
    var cost = fil + el + r.flatFee;
    A.$('#r_demo').innerHTML =
      '<div><span>Filament 50 g</span><span>' + A.money(fil) + '</span></div>' +
      '<div><span>Power 3 h</span><span>' + A.money(el) + '</span></div>' +
      (r.flatFee ? '<div><span>Flat fee</span><span>' + A.money(r.flatFee) + '</span></div>' : '') +
      '<div class="big"><span>Cost</span><span>' + A.money(cost) + '</span></div>' +
      '<div><span>Markup ×' + r.markup + '</span><span>' + A.money0(cost * r.markup) + '</span></div>' +
      '<div><span>Cost + hourly</span><span>' + A.money0(cost + r.hourlyRate * h) + '</span></div>';
  }
  Object.keys(RM).forEach(function (id) { A.$('#' + id).addEventListener('input', demo); });
  A.$('#r_save').addEventListener('click', function () {
    var r = {}; Object.keys(RM).forEach(function (id) { r[RM[id]] = parseFloat(A.$('#' + id).value) || 0; });
    A.Rates.save(r).then(function (res) {
      A.toast(res.synced === false && A.mode() === 'supabase'
        ? 'Saved on this device — will sync when reconnected'
        : 'Rates saved privately');
    });
  });

  /* ---------------- public price bands ---------------- */
  var bands = [];
  function drawBands() {
    A.$('#bandRows').innerHTML = '<table><thead><tr><th>Label</th><th class="num">Up to (in)</th>' +
      '<th class="num">Low $</th><th class="num">High $</th><th></th></tr></thead><tbody>' +
      bands.map(function (b, i) {
        return '<tr>' +
          '<td><input data-b="label" data-i="' + i + '" type="text" value="' + A.esc(b.label || '') + '"></td>' +
          '<td class="num"><input data-b="maxIn" data-i="' + i + '" type="number" step="0.5" value="' + (b.maxIn || 0) + '" style="width:82px"></td>' +
          '<td class="num"><input data-b="low" data-i="' + i + '" type="number" step="1" value="' + (b.low || 0) + '" style="width:82px"></td>' +
          '<td class="num"><input data-b="high" data-i="' + i + '" type="number" step="1" value="' + (b.high || 0) + '" style="width:82px"></td>' +
          '<td><button class="btn ghost sm" data-bdel="' + i + '">✕</button></td></tr>';
      }).join('') + '</tbody></table>';

    A.$$('#bandRows [data-b]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var b = bands[+inp.dataset.i], k = inp.dataset.b;
        b[k] = k === 'label' ? inp.value : (parseFloat(inp.value) || 0);
      });
    });
    A.$$('#bandRows [data-bdel]').forEach(function (btn) {
      btn.addEventListener('click', function () { bands.splice(+btn.dataset.bdel, 1); drawBands(); });
    });
  }
  A.$('#b_add').addEventListener('click', function () {
    bands.push({ label: 'New band', maxIn: 99, low: 0, high: 0 });
    drawBands();
  });
  A.$('#b_save').addEventListener('click', function () {
    var bad = bands.filter(function (b) { return b.high < b.low; });
    if (bad.length) {
      A.$('#b_msg').innerHTML = '<div class="notice err"><span>⚠</span><div>A band has its high price below its low price.</div></div>';
      return;
    }
    bands.sort(function (a, b) { return a.maxIn - b.maxIn; });
    A.Bands.save(bands).then(function (res) {
      A.$('#b_msg').innerHTML = '<div class="notice ' + (res.synced ? 'info' : '') + '"><span>' +
        (res.synced ? '✓' : '⚠') + '</span><div>' +
        (res.synced ? 'Bands published — the configurator uses them immediately.'
                    : 'Saved on this device. They publish once the connection is back.') + '</div></div>';
      drawBands();
    });
  });

  /* ---------------- quotes ---------------- */
  function drawQuotes() {
    A.Quotes.list().then(function (h) {
      A.$('#qEmpty').classList.toggle('hide', h.length > 0);
      A.$('#qlist').innerHTML = !h.length ? '' :
        '<table><thead><tr><th>Date</th><th>Name</th><th>File</th><th class="num">g</th><th class="num">h</th>' +
        '<th class="num">Cost</th><th class="num">Markup</th><th class="num">Hourly</th><th></th></tr></thead><tbody>' +
        h.map(function (r) {
          return '<tr><td class="mono">' + A.esc(r.date) + '</td><td>' + A.esc(r.name || '') + '</td>' +
            '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">' + A.esc(r.file || '') + '</td>' +
            '<td class="num">' + r.grams + '</td><td class="num">' + r.hours + '</td>' +
            '<td class="num">' + A.money(r.cost) + '</td><td class="num">$' + r.priceMarkup + '</td>' +
            '<td class="num">$' + r.priceHourly + '</td>' +
            '<td><button class="btn ghost sm" data-qdel="' + A.esc(r.id) + '">✕</button></td></tr>';
        }).join('') + '</tbody></table>';
      A.$$('#qlist [data-qdel]').forEach(function (b) {
        b.addEventListener('click', function () { A.Quotes.remove(b.dataset.qdel).then(function () { drawQuotes(); drawStats(); }); });
      });
    });
  }
  A.$('#q_csv').addEventListener('click', function () {
    A.Quotes.list().then(function (h) {
      if (!h.length) { A.toast('Nothing to export', 'err'); return; }
      A.downloadCSV('quotes-' + A.today() + '.csv',
        'Date,Name,File,Filament (g),Hours,Filament $,Electric $,Cost $,Markup $,Hourly $',
        h.map(function (r) { return [r.date, r.name, r.file, r.grams, r.hours, r.filCost, r.elecCost, r.cost, r.priceMarkup, r.priceHourly]; }));
    });
  });

  /* ---------------- setup / backup ---------------- */
  function drawSetup() {
    var mode = A.mode();
    var ob = A.Outbox.count();
    A.$('#obCount').textContent = ob;
    A.$('#retryBtn').disabled = ob === 0;
    A.$('#setupState').innerHTML = (mode === 'supabase'
      ? '<div class="notice info"><span>✓</span><div><strong>Supabase connected.</strong> Requests, quotes and products live in your project, so anything a customer sends from their own phone shows up here.</div></div>'
      : '<div class="notice"><span>⚠</span><div><strong>This browser only.</strong> Nothing is saved off this device, so a request a customer sends from their phone will never reach you. Run the storage setup to fix it — about ten minutes, one time.</div></div>')
      + (ob ? '<div class="notice" style="margin-top:10px"><span>⚠</span><div><strong>' + ob +
             ' item(s) not uploaded.</strong> They are safe in this browser and retry automatically. Hit retry if you have just fixed the connection.</div></div>' : '');
  }
  A.$('#retryBtn').addEventListener('click', function () {
    var b = this; b.disabled = true;
    A.Outbox.flush().then(function (r) {
      A.toast(r.left ? 'Sent ' + r.sent + ', ' + r.left + ' still queued' : 'All caught up');
      drawSetup(); drawReqs(); drawStats();
    });
  });
  A.$('#dumpBtn').addEventListener('click', function () {
    var dump = {};
    ['products', 'requests', 'quotes', 'rates', 'list'].forEach(function (k) { dump[k] = A.lsGet(k, null); });
    var blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'axis3d-backup-' + A.today() + '.json'; a.click();
  });
  A.$('#restoreBtn').addEventListener('click', function () { A.$('#restoreFile').click(); });
  A.$('#restoreFile').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var d = JSON.parse(fr.result);
        Object.keys(d).forEach(function (k) { if (d[k] != null) A.lsSet(k, d[k]); });
        A.toast('Restored — reloading');
        setTimeout(function () { location.reload(); }, 700);
      } catch (e) { A.toast('That is not a valid backup file', 'err'); }
    };
    fr.readAsText(f);
  });

  /* ---------------- boot ---------------- */
  function boot() {
    A.ready.then(function () {
      drawStats(); drawReqs(); loadRates(); drawQuotes(); drawSetup();
      A.Bands.load().then(function (b) { bands = (b || []).slice(); drawBands(); });
      A.Products.list().then(function (rows) { products = rows.slice(); drawProducts(); pForm(null); });
    });
  }
  A.ready.then(function (mode) {
    if (mode === 'supabase') {
      A.$('#pinBlock').classList.add('hide');
      A.$('#authBlock').classList.remove('hide');
      A.Auth.user().then(function (u) { if (u) unlock(); });
      return;
    }
    if (A.lsGet('unlocked', 0) === 1) unlock();
  });
})();

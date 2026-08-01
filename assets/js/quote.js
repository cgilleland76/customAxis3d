/* =========================================================
   quote.js — sliced-file quoting
   Parsing + pricing math ported from print-cost-calculator.html
   so the numbers here match the tool you already use.
   Adds: raw .gcode support, Cura/PrusaSlicer headers,
         shared rates, Supabase-backed history.
   ========================================================= */
(function () {
  'use strict';
  var A = window.APP;
  var $ = A.$;

  var state = { grams: 0, seconds: 0, plates: [], filaments: [], loaded: false };
  var lastCalc = null;
  var recordingFor = null;   // quote id we are recording the real print for
  var RATE_IDS = { s_fil: 'filamentPerKg', s_watts: 'watts', s_kwh: 'kwhPrice', s_markup: 'markup', s_hourly: 'hourlyRate', s_flat: 'flatFee' };

  /* ---------------- helpers ---------------- */
  function num(id, fallback) { var v = parseFloat($('#' + id).value); return isNaN(v) ? (fallback || 0) : v; }
  function money(v) { return '$' + v.toFixed(2); }
  function showError(msg) { var e = $('#err'); e.innerHTML = '<span>⚠</span><div>' + A.esc(msg) + '</div>'; e.classList.remove('hide'); }
  function clearError() { $('#err').classList.add('hide'); }

  /* ---------------- rates (private — never in the public bundle) ------------- */
  function loadRates() {
    return A.Rates.load().then(function (r) {
      if (!r) {
        showError('No shop rates on this device yet. Set them in Shop tools → Pricing; they are stored privately and never ship with the public site.');
        return null;
      }
      Object.keys(RATE_IDS).forEach(function (id) { $('#' + id).value = r[RATE_IDS[id]]; });
      render();
      return r;
    });
  }
  function saveRates() {
    var r = {};
    Object.keys(RATE_IDS).forEach(function (id) { r[RATE_IDS[id]] = num(id); });
    A.Rates.save(r);
  }

  /* ---------------- 3MF: slice_info.config (Orca / Bambu) ---------------- */
  function parseSliceInfo(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    var plates = doc.querySelectorAll('plate');
    var result = { plates: [], filaments: [], grams: 0, seconds: 0 };
    Array.prototype.forEach.call(plates, function (plate) {
      var p = { index: '?', grams: 0, seconds: 0 };
      Array.prototype.forEach.call(plate.querySelectorAll(':scope > metadata'), function (md) {
        var k = md.getAttribute('key'), v = md.getAttribute('value');
        if (k === 'index') p.index = v;
        if (k === 'weight') p.grams = parseFloat(v) || 0;
        if (k === 'prediction') p.seconds = parseFloat(v) || 0;
      });
      Array.prototype.forEach.call(plate.querySelectorAll('filament'), function (f) {
        var g = parseFloat(f.getAttribute('used_g')) || 0;
        result.filaments.push({
          type: f.getAttribute('type') || '?',
          color: f.getAttribute('color') || '#888',
          grams: g,
          meters: parseFloat(f.getAttribute('used_m')) || 0
        });
        if (!p.grams) p.grams += g;
      });
      result.plates.push(p);
      result.grams += p.grams;
      result.seconds += p.seconds;
    });
    return result;
  }

  /* ---------------- G-code header parsing ---------------- */
  function parseDuration(t) {
    var sec = 0, m;
    if ((m = t.match(/(\d+)\s*d/))) sec += parseInt(m[1], 10) * 86400;
    if ((m = t.match(/(\d+)\s*h/))) sec += parseInt(m[1], 10) * 3600;
    if ((m = t.match(/(\d+)\s*m(?!m)/))) sec += parseInt(m[1], 10) * 60;
    if ((m = t.match(/(\d+)\s*s/))) sec += parseInt(m[1], 10);
    if (!sec) { // hh:mm:ss form
      var c = t.match(/(\d+):(\d{2})(?::(\d{2}))?/);
      if (c) sec = (+c[1]) * 3600 + (+c[2]) * 60 + (+(c[3] || 0));
    }
    return sec;
  }

  function parseGcodeFallback(text) {
    var out = { grams: 0, seconds: 0, filaments: [] }, m;

    /* --- weight: Orca / Bambu --- */
    m = text.match(/total filament weight\s*\[g\]\s*:\s*([\d.,\s]+)/i);
    if (m) m[1].split(',').forEach(function (s) { out.grams += parseFloat(s) || 0; });

    /* --- weight: PrusaSlicer / SuperSlicer --- */
    if (!out.grams) {
      m = text.match(/total filament used \[g\]\s*=\s*([\d.,\s]+)/i);
      if (m) m[1].split(',').forEach(function (s) { out.grams += parseFloat(s) || 0; });
    }
    if (!out.grams) {
      m = text.match(/filament used \[g\]\s*=\s*([\d.,\s]+)/i);
      if (m) m[1].split(',').forEach(function (s) { out.grams += parseFloat(s) || 0; });
    }

    /* --- weight from length (Cura, or anything that only reports mm/m) --- */
    if (!out.grams) {
      var meters = 0;
      m = text.match(/;\s*Filament used\s*:\s*([\d.,\sm]+)/i);
      if (m) m[1].split(',').forEach(function (s) { meters += parseFloat(s) || 0; });
      if (!meters) {
        m = text.match(/filament used \[mm\]\s*=\s*([\d.,\s]+)/i);
        if (m) m[1].split(',').forEach(function (s) { meters += (parseFloat(s) || 0) / 1000; });
      }
      // 1.75 mm filament, 1.24 g/cm3 -> 2.98 g per meter
      if (meters) out.grams = meters * 2.98;
    }

    /* --- time --- */
    m = text.match(/(?:total estimated time|estimated printing time \(normal mode\)|estimated printing time|model printing time)\s*[:=]\s*([^\n;]+)/i);
    if (m) out.seconds = parseDuration(m[1]);
    if (!out.seconds) {
      m = text.match(/^;TIME:\s*(\d+)/mi);              // Cura
      if (m) out.seconds = parseInt(m[1], 10);
    }
    if (!out.seconds) {
      m = text.match(/;\s*PRINT\.TIME\s*[:=]\s*(\d+)/i);
      if (m) out.seconds = parseInt(m[1], 10);
    }

    /* --- filament types / colors, if declared --- */
    var t = text.match(/filament_type\s*=\s*([^\n;]+)/i);
    var col = text.match(/filament_colour\s*=\s*([^\n;]+)/i);
    if (t) {
      var types = t[1].split(/[;,]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var cols = col ? col[1].split(/[;,]/).map(function (s) { return s.trim(); }) : [];
      var per = types.length ? out.grams / types.length : 0;
      types.forEach(function (ty, i) {
        out.filaments.push({ type: ty, color: cols[i] || '#888', grams: per, meters: 0 });
      });
    }
    return out;
  }

  /* ---------------- file intake ---------------- */
  function handleFile(file) {
    clearError();
    var name = file.name.toLowerCase();
    if (/\.3mf$/.test(name)) return read3mf(file);
    if (/\.(gcode|gco|g|txt)$/.test(name)) {
      // only the header matters — read the first and last chunk, not the whole file
      var head = file.slice(0, 200 * 1024);
      var tail = file.slice(Math.max(0, file.size - 200 * 1024));
      return Promise.all([head.text(), tail.text()]).then(function (parts) {
        var r = parseGcodeFallback(parts.join('\n'));
        if (!r.grams && !r.seconds) {
          showError('No slicer summary found in that G-code. Enter grams and hours manually on the left.');
        }
        applyResult(file.name, { grams: r.grams, seconds: r.seconds, filaments: r.filaments, plates: [] });
      });
    }
    showError('Use a .3mf project or a .gcode file.');
  }

  function read3mf(file) {
    if (typeof JSZip === 'undefined') { showError('ZIP reader failed to load — check your connection and reload.'); return; }
    return JSZip.loadAsync(file).then(function (zip) {
      var sliceInfo = zip.file(/Metadata\/slice_info\.config$/i)[0];
      if (sliceInfo) {
        return sliceInfo.async('string').then(function (txt) {
          var r = parseSliceInfo(txt);
          if (r.grams > 0 || r.seconds > 0) { applyResult(file.name, r); return; }
          return tryGcode(zip, file.name);
        });
      }
      return tryGcode(zip, file.name);
    }).catch(function (e) { showError('Could not read file: ' + e.message); });
  }

  function tryGcode(zip, name) {
    var gfiles = zip.file(/\.gcode$/i);
    if (!gfiles.length) {
      showError('This 3MF has no slicing data — it is a model, not a sliced project. In Orca use "Export plate sliced file", or enter grams and hours manually.');
      applyResult(name, { grams: 0, seconds: 0, plates: [], filaments: [] });
      return;
    }
    var total = { grams: 0, seconds: 0, plates: [], filaments: [] };
    return Promise.all(gfiles.map(function (f) { return f.async('string'); })).then(function (texts) {
      texts.forEach(function (t, i) {
        var r = parseGcodeFallback(t);
        total.grams += r.grams; total.seconds += r.seconds;
        total.filaments = total.filaments.concat(r.filaments || []);
        total.plates.push({ index: String(i + 1), grams: r.grams, seconds: r.seconds });
      });
      applyResult(name, total);
    });
  }

  function applyResult(name, r) {
    state = { grams: r.grams || 0, seconds: r.seconds || 0, plates: r.plates || [], filaments: r.filaments || [], loaded: true };
    $('#fname').textContent = name;
    render();
    if (recordingFor) recordActual(name);
  }

  /* ---------------- record what the print actually took ---------------- */
  function recordActual(filename) {
    if (!lastCalc) return;
    var id = recordingFor;
    A.Quotes.update(id, {
      actualFile:  filename,
      actualGrams: lastCalc.grams,
      actualHours: lastCalc.hours,
      actualCost:  lastCalc.cost,
      actualPrice: lastCalc.priceMarkup,
      actualAt:    A.stamp()
    }).then(function (res) {
      stopRecording();
      A.toast(res.synced === false && A.mode() === 'supabase'
        ? 'Actual recorded here — it will upload automatically'
        : 'Actual recorded');
      renderHistory();
    });
  }

  function startRecording(id, label) {
    recordingFor = id;
    $('#recName').textContent = label || id;
    $('#recBanner').classList.remove('hide');
    $('#drop').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function stopRecording() {
    recordingFor = null;
    $('#recBanner').classList.add('hide');
  }
  $('#recCancel').addEventListener('click', stopRecording);

  /* ---------------- link a quote to an open request ---------------- */
  function loadRequests() {
    A.Requests.list().then(function (rows) {
      var open = rows.filter(function (r) { return (r.status || 'new') !== 'done'; }).slice(0, 40);
      $('#q_request').innerHTML = '<option value="">Not linked to a request</option>' +
        open.map(function (r) {
          var label = (r.name ? r.name + ' — ' : '') +
            (r.kind === 'Order list' ? 'order list'
              : r.kind === 'Idea request' ? (r.purpose || (r.desc || '')).slice(0, 34)
              : (r.typeLabel || r.kind || 'request'));
          return '<option value="' + A.esc(r.id) + '">' + A.esc(label) + '</option>';
        }).join('');
    });
  }

  /* ---------------- calculate + render ---------------- */
  function render() {
    if (!state.loaded && !$('#m_grams').value && !$('#m_hours').value) return;
    $('#empty').classList.add('hide');
    $('#results').classList.remove('hide');

    var grams = $('#m_grams').value !== '' ? num('m_grams') : state.grams;
    var hours = $('#m_hours').value !== '' ? num('m_hours') : state.seconds / 3600;

    $('#filaments').innerHTML = state.filaments.filter(function (f) { return f.grams > 0; }).map(function (f) {
      return '<span class="chip"><span class="swatch-dot" style="background:' + A.esc(f.color) + '"></span>' +
        A.esc(f.type) + ' — ' + f.grams.toFixed(1) + ' g' + (f.meters ? ' (' + f.meters.toFixed(1) + ' m)' : '') + '</span>';
    }).join('');

    var phtml = '';
    if (state.plates.length > 1) {
      phtml = '<table><thead><tr><th>Plate</th><th class="num">Filament (g)</th><th class="num">Time</th></tr></thead><tbody>' +
        state.plates.map(function (p) {
          return '<tr><td>' + A.esc(p.index) + '</td><td class="num">' + p.grams.toFixed(1) +
            '</td><td class="num">' + A.fmtTime(p.seconds) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    $('#platesWrap').innerHTML = phtml;

    var filCost = grams / 1000 * num('s_fil');
    var elecCost = num('s_watts') / 1000 * hours * num('s_kwh');
    var flat = num('s_flat');
    var cost = filCost + elecCost + flat;

    $('#totals').innerHTML =
      '<div><span>Filament</span><span>' + grams.toFixed(1) + ' g → ' + money(filCost) + '</span></div>' +
      '<div><span>Electricity</span><span>' + hours.toFixed(2) + ' h × ' + num('s_watts') + ' W → ' + money(elecCost) + '</span></div>' +
      (flat ? '<div><span>Flat fee</span><span>' + money(flat) + '</span></div>' : '') +
      '<div class="big"><span>Total cost</span><span>' + money(cost) + '</span></div>';

    var markup = num('s_markup', 1);
    var pMarkup = Math.round(cost * markup);
    $('#p_markup').textContent = '$' + pMarkup;
    $('#p_markup_d').innerHTML = money(cost) + ' cost × ' + markup + ' — profit ' + money(pMarkup - cost);

    var hourly = num('s_hourly');
    var pHourly = Math.round(cost + hourly * hours);
    $('#p_hourly').textContent = '$' + pHourly;
    $('#p_hourly_d').innerHTML = money(cost) + ' cost + ' + hours.toFixed(2) + ' h × ' + money(hourly) + '/h — profit ' + money(pHourly - cost);

    lastCalc = {
      date: A.today(),
      file: $('#fname').textContent || '',
      grams: +grams.toFixed(1),
      hours: +hours.toFixed(2),
      filCost: +filCost.toFixed(2),
      elecCost: +elecCost.toFixed(2),
      flat: flat,
      cost: +cost.toFixed(2),
      priceMarkup: pMarkup,
      priceHourly: pHourly,
      rates: { fil: num('s_fil'), watts: num('s_watts'), kwh: num('s_kwh'), markup: markup, hourly: hourly }
    };
  }

  /* ---------------- printable receipt ---------------- */
  function printQuote() {
    if (!lastCalc) { A.toast('Load a file or enter values first', 'err'); return; }
    printRecord(Object.assign({ name: $('#q_name').value.trim() }, lastCalc));
  }

  function printRecord(c) {
    var r = c.rates || { fil: num('s_fil'), watts: num('s_watts'), kwh: num('s_kwh'), markup: num('s_markup', 1), hourly: num('s_hourly') };
    var model = $('#r_model').value;
    var itemized = $('#r_detail').value === 'itemized';
    var withMarkup = $('#r_markup').checked;
    var timeCost = model === 'hourly' ? r.hourly * c.hours : 0;
    var subtotal = c.cost + timeCost;
    var total = withMarkup ? Math.round(subtotal * r.markup) : Math.round(subtotal);
    var kWhUsed = r.watts / 1000 * c.hours;

    var html = '<h2>' + A.esc(A.cfg.brand || '3D Print') + ' Quote</h2>' +
      '<div class="r-sub">' + A.esc(c.date) + '</div>' +
      '<div class="r-meta">' +
      (c.name ? '<div><span>Job</span><span>' + A.esc(c.name) + '</span></div>' : '') +
      '<div><span>File</span><span>' + A.esc(c.file || '—') + '</span></div>' +
      '<div><span>Print time</span><span>' + c.hours.toFixed(2) + ' h</span></div>' +
      '<div><span>Filament used</span><span>' + c.grams + ' g</span></div>' +
      '</div><div class="r-lines">';

    if (itemized) {
      html += '<div><span>Filament</span><span>' + money(c.filCost) + '</span></div>' +
        '<span class="r-note">' + c.grams + ' g @ ' + money(r.fil) + '/kg</span>' +
        '<div><span>Power</span><span>' + money(c.elecCost) + '</span></div>' +
        '<span class="r-note">' + kWhUsed.toFixed(2) + ' kWh @ ' + money(r.kwh) + '/kWh</span>';
      if (model === 'hourly') {
        html += '<div><span>Machine time</span><span>' + money(timeCost) + '</span></div>' +
          '<span class="r-note">' + c.hours.toFixed(2) + ' h @ ' + money(r.hourly) + '/h</span>';
      }
      if (c.flat) html += '<div><span>Service fee</span><span>' + money(c.flat) + '</span></div>';
      html += '<div class="r-sep"></div><div><span>Subtotal</span><span>' + money(subtotal) + '</span></div>';
      if (withMarkup) html += '<div><span>Markup ×' + r.markup + '</span><span>' + money(total - subtotal) + '</span></div>';
    } else {
      html += '<div><span>Production cost</span><span>' + money(subtotal) + '</span></div>';
      if (withMarkup) html += '<div><span>Markup ×' + r.markup + '</span><span>' + money(total - subtotal) + '</span></div>';
    }

    html += '</div><div class="r-total"><span>Total</span><span>$' + total + '</span></div>' +
      '<div class="r-foot">' + A.esc(A.cfg.orderNote || 'Thank you!') + '</div>';

    $('#receipt').innerHTML = html;
    window.print();
  }

  /* ---------------- jobs: quoted vs actual ---------------- */
  function pct(actual, quoted) {
    if (!quoted) return null;
    return (actual - quoted) / quoted * 100;
  }
  function varCell(actual, quoted, fmt) {
    if (actual == null || actual === '') return '<td class="num dim">—</td>';
    var d = pct(actual, quoted);
    var colour = d == null ? 'var(--muted)'
      : d > 15 ? 'var(--danger)'
      : d < -15 ? 'var(--accent2)'
      : 'var(--ok)';
    return '<td class="num">' + fmt(actual) +
      (d == null ? '' : '<div style="font-size:10.5px;color:' + colour + '">' +
        (d >= 0 ? '+' : '') + d.toFixed(0) + '%</div>') + '</td>';
  }

  function renderHistory() {
    A.Quotes.list().then(function (h) {
      $('#histEmpty').classList.toggle('hide', h.length > 0);

      var done = h.filter(function (r) { return r.actualCost != null; });
      if (done.length) {
        var avg = done.reduce(function (a, r) { return a + pct(r.actualCost, r.cost); }, 0) / done.length;
        var over = done.filter(function (r) { return r.actualCost > r.cost; }).length;
        $('#varSummary').innerHTML =
          '<div class="b"><h5>Jobs tracked</h5><div class="v">' + done.length + ' / ' + h.length + '</div></div>' +
          '<div class="b"><h5>Average variance</h5><div class="v" style="color:' +
            (Math.abs(avg) > 15 ? 'var(--danger)' : 'var(--ok)') + '">' +
            (avg >= 0 ? '+' : '') + avg.toFixed(0) + '%</div></div>' +
          '<div class="b"><h5>Came in over</h5><div class="v">' + over + '</div></div>';
      } else {
        $('#varSummary').innerHTML = '';
      }

      if (!h.length) { $('#histWrap').innerHTML = ''; return; }
      $('#histWrap').innerHTML = '<table><thead><tr>' +
        '<th>Date</th><th>Job</th>' +
        '<th class="num">Quoted g</th><th class="num">Actual g</th>' +
        '<th class="num">Quoted h</th><th class="num">Actual h</th>' +
        '<th class="num">Quoted cost</th><th class="num">Actual cost</th>' +
        '<th class="num">Price</th><th></th></tr></thead><tbody>' +
        h.map(function (r) {
          var label = r.name || r.file || 'job';
          return '<tr><td class="mono">' + A.esc(r.date) + '</td>' +
            '<td>' + A.esc(label) +
              (r.requestId ? '<div class="dim" style="font-size:10.5px">linked to a request</div>' : '') +
              (r.actualFile ? '<div class="dim" style="font-size:10.5px">actual: ' + A.esc(r.actualFile) + '</div>' : '') +
            '</td>' +
            '<td class="num">' + r.grams + '</td>' +
            varCell(r.actualGrams, r.grams, function (v) { return (+v).toFixed(1); }) +
            '<td class="num">' + r.hours + '</td>' +
            varCell(r.actualHours, r.hours, function (v) { return (+v).toFixed(2); }) +
            '<td class="num">' + money(r.cost) + '</td>' +
            varCell(r.actualCost, r.cost, money) +
            '<td class="num">$' + r.priceMarkup + '</td>' +
            '<td style="white-space:nowrap">' +
              (r.actualCost == null
                ? '<button class="btn sm recrow" data-id="' + A.esc(r.id) + '" data-label="' + A.esc(label) + '">Record actual</button> '
                : '') +
              '<button class="btn ghost sm printrow" data-id="' + A.esc(r.id) + '" title="Print">🖨</button> ' +
              '<button class="btn ghost sm delrow" data-id="' + A.esc(r.id) + '" title="Delete">✕</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table>';

      A.$$('#histWrap .recrow').forEach(function (b) {
        b.addEventListener('click', function () { startRecording(b.dataset.id, b.dataset.label); });
      });
      A.$$('#histWrap .printrow').forEach(function (b) {
        b.addEventListener('click', function () {
          var rec = h.filter(function (x) { return x.id === b.dataset.id; })[0];
          if (rec) printRecord(rec);
        });
      });
      A.$$('#histWrap .delrow').forEach(function (b) {
        b.addEventListener('click', function () { A.Quotes.remove(b.dataset.id).then(renderHistory); });
      });
    });
  }

  /* ---------------- wiring ---------------- */
  var drop = $('#drop'), fileInput = $('#fileInput');
  drop.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
  ['dragover', 'dragenter'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

  Object.keys(RATE_IDS).concat(['m_grams', 'm_hours']).forEach(function (id) {
    $('#' + id).addEventListener('input', function () { saveRates(); render(); });
  });

  $('#saveBtn').addEventListener('click', function () {
    if (!lastCalc) return;
    A.Quotes.create(Object.assign({
      name: $('#q_name').value.trim(),
      requestId: $('#q_request').value || null
    }, lastCalc)).then(function () {
      $('#q_name').value = '';
      A.toast('Quote saved as a job');
      renderHistory();
    });
  });

  $('#printBtn').addEventListener('click', printQuote);
  $('#exportBtn').addEventListener('click', function () {
    A.Quotes.list().then(function (h) {
      if (!h.length) { A.toast('Nothing to export', 'err'); return; }
      A.downloadCSV('jobs-' + A.today() + '.csv',
        'Date,Job,File,Quoted g,Quoted h,Quoted cost,Price markup,Price hourly,Actual file,Actual g,Actual h,Actual cost,Cost variance %',
        h.map(function (r) {
          var v = (r.actualCost != null && r.cost) ? ((r.actualCost - r.cost) / r.cost * 100).toFixed(1) : '';
          return [r.date, r.name, r.file, r.grams, r.hours, r.cost, r.priceMarkup, r.priceHourly,
                  r.actualFile || '', r.actualGrams == null ? '' : r.actualGrams,
                  r.actualHours == null ? '' : r.actualHours,
                  r.actualCost == null ? '' : r.actualCost, v];
        }));
    });
  });
  $('#clearBtn').addEventListener('click', function () {
    if (confirm('Delete all saved quotes?')) A.Quotes.clear().then(renderHistory);
  });

  /* Nothing on this page runs until the owner gate opens. */
  A.gate('#tool', function () {
    loadRates();
    renderHistory();
    loadRequests();
  });
})();

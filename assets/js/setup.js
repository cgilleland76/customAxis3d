/* =========================================================
   setup.js — Supabase connection wizard
   Everything here is owner-facing. No customer ever sees it.
   ========================================================= */
(function () {
  'use strict';
  var A = window.APP;
  var S = A.Setup;

  function msg(host, kind, html) {
    A.$(host).innerHTML = '<div class="notice ' + kind + '"><span>' +
      (kind === 'err' ? '⚠' : kind === 'info' ? 'ⓘ' : '✓') + '</span><div>' + html + '</div></div>';
  }
  function markDone(id, done) { A.$('#' + id).classList.toggle('done', !!done); }

  /* ---------- schema SQL ---------- */
  fetch('supabase/schema.sql')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (t) { A.$('#sqlBox').textContent = t; })
    .catch(function () {
      A.$('#sqlBox').textContent =
        'Could not load supabase/schema.sql over file:// — open the site through a web server\n' +
        '(or just open supabase/schema.sql in a text editor and copy it from there).';
    });

  A.$('#toggleSql').addEventListener('click', function () {
    var b = A.$('#sqlBox'), hidden = b.classList.toggle('hide');
    this.textContent = hidden ? 'Show it' : 'Hide it';
  });
  A.$('#copySql').addEventListener('click', function () {
    var t = A.$('#sqlBox').textContent;
    if (!navigator.clipboard) { A.$('#sqlBox').classList.remove('hide'); A.toast('Select and copy it manually', 'err'); return; }
    navigator.clipboard.writeText(t).then(function () { A.toast('SQL copied — paste it into the Supabase SQL editor'); markDone('s2', true); });
  });

  /* ---------- connection ---------- */
  function paintTables(d) {
    if (!d.connected) { A.$('#tables').innerHTML = ''; return; }
    A.$('#tables').innerHTML = d.tables.map(function (t) {
      var good = t.exists && t.readable;
      var colour = good ? 'var(--ok)' : (t.exists ? 'var(--accent2)' : 'var(--danger)');
      var note = t.note ? t.note
        : (t.rows === 0 ? 'empty — that is fine' : t.rows + ' row' + (t.rows === 1 ? '' : 's'));
      // requests/quotes being unreadable while signed out is CORRECT
      if (!t.readable && t.exists && /requests|quotes/.test(t.table) && !d.user) {
        colour = 'var(--ok)';
        note = 'exists · hidden until you sign in (correct)';
      }
      return '<div class="row"><span class="dot" style="background:' + colour + '"></span>' +
        '<span class="nm">' + t.table + '</span>' +
        '<span class="msg">' + A.esc(note) + '</span></div>';
    }).join('') +
      (d.user ? '<div class="row"><span class="dot" style="background:var(--ok)"></span>' +
        '<span class="nm">signed in</span><span class="msg">' + A.esc(d.user) + '</span></div>' : '');
  }

  function refresh() {
    var connected = A.mode() === 'supabase';
    var saved = S.saved() || (A.cfg.supabase && A.cfg.supabase.url ? A.cfg.supabase : null);
    if (saved) { A.$('#url').value = saved.url || ''; A.$('#key').value = saved.anonKey || ''; }

    markDone('s3', connected);
    A.$('#statusBar').className = 'notice ' + (connected ? 'info' : '');
    A.$('#statusText').innerHTML = connected
      ? '<strong>Connected.</strong> Requests are being saved to your Supabase project and will be waiting for you in Shop tools.'
      : '<strong>Not connected yet.</strong> Everything still works, but data is saved in whichever browser it was typed into — a request sent from a customer\'s phone will never reach you.';

    A.$('#snippet').textContent = saved
      ? "  supabase: {\n    url:     '" + (saved.url || '') + "',\n    anonKey: '" + (saved.anonKey || '') + "'\n  },"
      : 'Connect first and the snippet appears here.';

    var ob = A.Outbox.count();
    A.$('#obCount').textContent = ob;
    A.$('#retryBtn').disabled = ob === 0;

    var counts = {
      products: (A.lsGet('products', []) || []).length,
      requests: (A.lsGet('requests', []) || []).length,
      quotes: (A.lsGet('quotes', []) || []).length
    };
    A.$('#localCounts').innerHTML = Object.keys(counts).map(function (k) {
      return '<div class="b"><h5>' + k + ' in this browser</h5><div class="v">' + counts[k] + '</div></div>';
    }).join('');

    if (connected) S.diagnose().then(function (d) {
      paintTables(d);
      markDone('s2', d.tables.every(function (t) { return t.exists; }));
      markDone('s6', !!d.user);
    });
  }

  A.$('#connectBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    msg('#connectMsg', 'info', 'Connecting…');
    S.connect(A.$('#url').value, A.$('#key').value)
      .then(function () { return S.diagnose(); })
      .then(function (d) {
        paintTables(d);
        var missing = d.tables.filter(function (t) { return !t.exists; });
        if (missing.length) {
          msg('#connectMsg', 'err', 'Connected to the project, but these tables are missing: <strong>' +
            missing.map(function (t) { return t.table; }).join(', ') +
            '</strong>. Go back to step 2 and run the SQL.');
        } else {
          msg('#connectMsg', '', 'Connected. Tables are there. Now run the write test in step 4.');
          markDone('s1', true); markDone('s2', true);
        }
        refresh();
      })
      .catch(function (e) { msg('#connectMsg', 'err', A.esc(e.message)); })
      .then(function () { btn.disabled = false; });
  });

  A.$('#forgetBtn').addEventListener('click', function () {
    if (!confirm('Disconnect this browser from Supabase? Data already in the cloud stays there.')) return;
    S.forget().then(function () {
      A.$('#url').value = ''; A.$('#key').value = '';
      msg('#connectMsg', 'info', 'Disconnected. Back to browser-only storage.');
      refresh();
    });
  });

  /* ---------- write probe ---------- */
  A.$('#probeBtn').addEventListener('click', function () {
    var btn = this;
    if (A.mode() !== 'supabase') { msg('#probeMsg', 'err', 'Connect in step 3 first.'); return; }
    btn.disabled = true;
    msg('#probeMsg', 'info', 'Writing a test request…');
    S.testWrite()
      .then(function (r) {
        msg('#probeMsg', '', '<strong>It works.</strong> A customer on their own phone can submit a request and you will see it in Shop tools. ' + A.esc(r.note || ''));
        markDone('s4', true);
      })
      .catch(function (e) {
        var m = e.message || String(e);
        var hint = /row-level security|policy/i.test(m)
          ? ' — the insert policy did not get created. Re-run the SQL from step 2; it is safe to run again.'
          : /does not exist|schema cache/i.test(m)
          ? ' — the requests table is missing. Run the SQL from step 2.'
          : '';
        msg('#probeMsg', 'err', 'Test failed: ' + A.esc(m) + A.esc(hint));
      })
      .then(function () { btn.disabled = false; });
  });

  /* ---------- sync ---------- */
  A.$('#pushBtn').addEventListener('click', function () {
    var btn = this; btn.disabled = true;
    msg('#syncMsg', 'info', 'Uploading…');
    S.pushAll().then(function (r) {
      var parts = ['products', 'requests', 'quotes'].filter(function (k) { return r[k]; })
        .map(function (k) { return r[k] + ' ' + k; });
      if (r.errors.length) {
        msg('#syncMsg', 'err', 'Partly uploaded' + (parts.length ? ' (' + parts.join(', ') + ')' : '') +
          '. Problems: ' + A.esc(r.errors.join('; ')) +
          '<br><span class="hint">Products and quotes need you signed in — do step 6, then sign in on Shop tools and come back.</span>');
      } else {
        msg('#syncMsg', '', parts.length ? 'Uploaded ' + parts.join(', ') + '.' : 'Nothing local to upload.');
        markDone('s7', true);
      }
      refresh();
    }).catch(function (e) { msg('#syncMsg', 'err', A.esc(e.message)); })
      .then(function () { btn.disabled = false; });
  });

  A.$('#pullBtn').addEventListener('click', function () {
    if (!confirm('Replace this browser\'s copy with what is in the cloud?')) return;
    var btn = this; btn.disabled = true;
    msg('#syncMsg', 'info', 'Downloading…');
    S.pullAll().then(function (g) {
      msg('#syncMsg', '', 'Pulled down ' + g.products + ' products, ' + g.requests + ' requests, ' + g.quotes + ' quotes.');
      refresh();
    }).catch(function (e) { msg('#syncMsg', 'err', A.esc(e.message)); })
      .then(function () { btn.disabled = false; });
  });

  A.$('#retryBtn').addEventListener('click', function () {
    var btn = this; btn.disabled = true;
    A.Outbox.flush().then(function (r) {
      msg('#syncMsg', r.left ? 'err' : '', 'Sent ' + r.sent + '. ' +
        (r.left ? r.left + ' still queued — check the table state above.' : 'Queue is empty.'));
      refresh();
    }).then(function () { btn.disabled = false; });
  });

  A.$('#copySnippet').addEventListener('click', function () {
    if (!navigator.clipboard) { A.toast('Select and copy it manually', 'err'); return; }
    navigator.clipboard.writeText(A.$('#snippet').textContent).then(function () { A.toast('Snippet copied'); });
  });

  A.ready.then(refresh);
})();

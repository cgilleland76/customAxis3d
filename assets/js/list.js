/* list.js — the order list (no payment, ever) */
(function () {
  'use strict';
  var A = window.APP;

  function total(rows) {
    return rows.reduce(function (s, r) { return s + (r.price || 0) * (r.qty || 1); }, 0);
  }

  function draw() {
    var rows = A.List.all();
    A.$('#none').classList.toggle('hide', rows.length > 0);
    A.$('#items').innerHTML = rows.map(function (r) {
      var thumb = r.svg ? r.svg : (r.img ? '<img src="' + A.esc(r.img) + '" alt="">' : '<span class="dim mono" style="font-size:9px">' + A.esc((r.kind || '?').slice(0, 6)) + '</span>');
      return '<div class="li">' +
        '<div class="th">' + thumb + '</div>' +
        '<div class="body">' +
          '<h4>' + A.esc(r.title) + '</h4>' +
          '<div class="d"><span class="chip mono" style="margin-right:6px">' + A.esc(r.kind || '') + '</span>' + A.esc(r.detail || '') + '</div>' +
          (r.notes ? '<div class="n">✎ ' + A.esc(r.notes) + '</div>' : '') +
          (r.due ? '<div class="n">◷ needed by ' + A.esc(r.due) + '</div>' : '') +
        '</div>' +
        '<div class="ctrl">' +
          '<input type="number" min="1" value="' + (r.qty || 1) + '" data-q="' + A.esc(r.lineId) + '">' +
          (A.cfg.showPrices ? '<span class="mono" style="min-width:52px;text-align:right;color:var(--accent2)">' + A.money0((r.price || 0) * (r.qty || 1)) + '</span>' : '') +
          '<button class="btn ghost sm" data-x="' + A.esc(r.lineId) + '" title="Remove">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    A.$('#total').textContent = A.money0(total(rows));
    A.$('#lead').textContent = rows.length
      ? rows.length + ' item' + (rows.length > 1 ? 's' : '') + ' ready to send. ' + (A.cfg.orderNote || '')
      : 'Add items and this becomes the sheet we work from when we meet.';

    A.$$('#items [data-q]').forEach(function (i) {
      i.addEventListener('change', function () { A.List.setQty(i.dataset.q, parseInt(i.value, 10) || 1); draw(); });
    });
    A.$$('#items [data-x]').forEach(function (b) {
      b.addEventListener('click', function () { A.List.remove(b.dataset.x); draw(); });
    });
  }

  function asText() {
    var rows = A.List.all();
    var L = ['ORDER REQUEST — ' + (A.cfg.brand || ''), new Date().toLocaleString(), ''];
    L.push('FROM: ' + [A.$('#cname').value.trim(), A.$('#cphone').value.trim()].filter(Boolean).join(' / '));
    if (A.$('#when').value) L.push('NEEDED BY: ' + A.$('#when').value);
    L.push('');
    rows.forEach(function (r, i) {
      L.push((i + 1) + '. ' + r.title + '  ×' + (r.qty || 1) + (A.cfg.showPrices ? '   ~' + A.money0((r.price || 0) * (r.qty || 1)) : ''));
      if (r.detail) L.push('   ' + r.detail);
      if (r.notes) L.push('   note: ' + r.notes);
      if (r.due) L.push('   needed by: ' + r.due);
    });
    L.push('');
    if (A.cfg.showPrices) L.push('BALLPARK TOTAL: ' + A.money0(total(rows)));
    var n = A.$('#notes').value.trim();
    if (n) { L.push(''); L.push('NOTES: ' + n); }
    L.push('');
    L.push(A.cfg.orderNote || '');
    return L.join('\n');
  }

  A.$('#sendBtn').addEventListener('click', function () {
    var rows = A.List.all();
    if (!rows.length) { A.toast('Your list is empty', 'err'); return; }
    var name = A.$('#cname').value.trim();
    if (!name) { A.toast('Add your name so I know whose list this is', 'err'); A.$('#cname').focus(); return; }
    A.Requests.create({
      kind: 'Order list', source: 'list',
      name: name, contact: A.$('#cphone').value.trim(),
      due: A.$('#when').value, notes: A.$('#notes').value.trim(),
      items: rows, estTotal: total(rows), text: asText()
    }).then(function (rec) {
      var ref = rec.id.slice(-6).toUpperCase();
      if (A.mode() === 'supabase' && !rec._synced) {
        A.toast('Saved on this device (ref ' + ref + ') — it will upload automatically. Show me this list either way.', 'err');
        A.$('#sendBtn').textContent = 'Saved — will upload when reconnected';
      } else {
        A.toast('Sent — reference ' + ref);
        A.$('#sendBtn').textContent = 'Sent ✓ — show me this on pickup';
      }
      A.$('#sendBtn').disabled = true;
    });
  });

  A.$('#printBtn').addEventListener('click', function () {
    A.$('#printsheet').innerHTML =
      '<h2 style="text-align:center;margin-bottom:2px">Order Request</h2>' +
      '<div style="text-align:center;font-size:12px;color:#555;margin-bottom:16px">' + A.esc(A.cfg.brand || '') + ' · ' + new Date().toLocaleDateString() + '</div>' +
      '<pre style="white-space:pre-wrap;font-size:12px;line-height:1.6">' + A.esc(asText()) + '</pre>';
    window.print();
  });

  A.$('#mailBtn').addEventListener('click', function () {
    var to = (A.cfg.contact && A.cfg.contact.email) || '';
    location.href = 'mailto:' + encodeURIComponent(to) +
      '?subject=' + encodeURIComponent('Order request — ' + (A.$('#cname').value.trim() || 'website')) +
      '&body=' + encodeURIComponent(asText());
  });

  A.$('#copyBtn').addEventListener('click', function () {
    if (!navigator.clipboard) { A.toast('Copy not supported here', 'err'); return; }
    navigator.clipboard.writeText(asText()).then(function () { A.toast('List copied'); });
  });

  A.$('#clearBtn').addEventListener('click', function () {
    if (confirm('Clear your whole list?')) { A.List.clear(); draw(); }
  });

  A.$('#orderNote').textContent = A.cfg.orderNote || '';
  draw();
})();

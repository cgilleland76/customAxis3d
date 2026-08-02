/* shop.js — ready-made catalog: filter, sort, search, lightbox, add-to-list */
(function () {
  'use strict';
  var A = window.APP;
  var ALL = [], cat = 'All';

  function matches(p) {
    var q = A.$('#q').value.trim().toLowerCase();
    if (cat !== 'All' && (p.category || '') !== cat) return false;
    if (A.$('#onlyQuick').checked && !/quick/.test(p.tags || '')) return false;
    if (!q) return true;
    return (p.name + ' ' + (p.blurb || '') + ' ' + (p.category || '') + ' ' + (p.tags || '')).toLowerCase().indexOf(q) > -1;
  }

  function sorted(rows) {
    var s = A.$('#sort').value;
    return rows.slice().sort(function (a, b) {
      if (s === 'price-asc') return (a.price || 0) - (b.price || 0);
      if (s === 'price-desc') return (b.price || 0) - (a.price || 0);
      if (s === 'fast') return (a.hours || 99) - (b.hours || 99);
      return String(a.name).localeCompare(String(b.name));
    });
  }

  var FILS = [], PICKED = {};

  function fil(id) { return FILS.filter(function (f) { return f.id === id; })[0]; }

  function pickedFor(p) {
    var slots = A.Filaments.slotsFor(p);
    return slots.map(function (s) {
      var chosen = (PICKED[p.id] || {})[s.index] || s.default;
      return fil(chosen) || FILS.filter(function (f) { return f.in_stock; })[0] || null;
    });
  }

  function swatches(p) {
    if (!FILS.length) return '';
    var slots = A.Filaments.slotsFor(p);
    return '<div class="colours">' + slots.map(function (s) {
      var cur = (PICKED[p.id] || {})[s.index] || s.default;
      return '<div class="slot"><span class="slot-label">' + A.esc(s.label) + '</span>' +
        FILS.map(function (f) {
          var on = f.id === cur;
          return '<button class="sw' + (on ? ' on' : '') + (f.in_stock ? '' : ' oos') + '"' +
            ' data-pid="' + A.esc(p.id) + '" data-slot="' + s.index + '" data-fil="' + A.esc(f.id) + '"' +
            ' title="' + A.esc(f.name) + (f.in_stock ? '' : ' — made to order') + '"' +
            ' aria-label="' + A.esc(f.name) + (f.in_stock ? '' : ', made to order') + '"' +
            ' style="background:' + A.esc(f.hex) + '"></button>';
        }).join('') + '</div>';
    }).join('') + '</div>';
  }

  function leadNote(p) {
    var lead = A.Filaments.leadTime(pickedFor(p));
    return lead ? '<div class="lead">' + A.esc(lead.text) + '</div>' : '';
  }

  function card(p) {
    var img = p.img || A.placeholderSVG(p.name);
    var badge = /bestseller/.test(p.tags || '') ? 'Bestseller'
              : /quick/.test(p.tags || '') ? 'Quick print'
              : (p.batch ? 'In stock' : 'Made to order');
    return '<article class="card" id="' + A.esc(p.id) + '">' +
      '<div class="thumb" data-img="' + A.esc(img) + '" data-cap="' + A.esc(p.name) + '">' +
        '<img src="' + A.esc(img) + '" alt="' + A.esc(p.name) + '" loading="lazy">' +
        '<span class="badge">' + badge + '</span>' +
      '</div>' +
      '<div class="body">' +
        '<h3>' + A.esc(p.name) + '</h3>' +
        '<p>' + A.esc(p.blurb || '') + '</p>' +
        '<div class="meta">' +
          (A.cfg.showPrices ? '<span class="price">' + A.money0(p.price || 0) + '</span>'
                            : '<span class="chip">Ask for price</span>') +
          '<span class="chip mono" title="Approx. filament and print time">' +
            (p.grams ? p.grams + 'g' : '—') + ' · ' + (p.hours ? p.hours + 'h' : '—') +
          '</span>' +
        '</div>' +
        swatches(p) + leadNote(p) +
      '</div>' +
      '<div class="foot"><button class="btn sm block add" data-id="' + A.esc(p.id) + '">+ Add to list</button></div>' +
    '</article>';
  }

  function render() {
    var rows = sorted(ALL.filter(matches));
    A.$('#grid').innerHTML = rows.map(card).join('');
    var nothingAtAll = ALL.length === 0;
    A.$('#noresults').classList.toggle('hide', rows.length > 0);
    A.$('#noresults').textContent = nothingAtAll
      ? 'The catalog is still being set up — get in touch and I will tell you what I have on hand.'
      : 'No items match that.';

    A.$$('#grid .thumb').forEach(function (t) {
      t.addEventListener('click', function () { A.lightbox(t.dataset.img, t.dataset.cap); });
    });
    A.$$('#grid .sw').forEach(function (b) {
      b.addEventListener('click', function () {
        var pid = b.dataset.pid;
        PICKED[pid] = PICKED[pid] || {};
        PICKED[pid][b.dataset.slot] = b.dataset.fil;
        render();
        var card = document.getElementById(pid);
        if (card) card.scrollIntoView({ block: 'nearest' });
      });
    });

    A.$$('#grid .add').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = ALL.filter(function (x) { return x.id === b.dataset.id; })[0];
        if (!p) return;
        var chosen = pickedFor(p).filter(Boolean);
        var lead = A.Filaments.leadTime(chosen);
        A.List.add({
          key: 'product:' + p.id, kind: 'Ready-made', title: p.name,
          detail: (p.category || '') + (p.grams ? ' · ~' + p.grams + 'g' : '') +
                  (chosen.length ? ' · ' + chosen.map(function (f) { return f.name; }).join(' + ') : '') +
                  (lead ? ' · made to order (' + lead.min + '–' + lead.max + ' days)' : ''),
          price: p.price || 0, img: p.img || A.placeholderSVG(p.name)
        });
        A.toast('Added "' + p.name + '" to your list');
        b.textContent = '✓ Added'; b.classList.add('ghost');
        setTimeout(function () { b.textContent = '+ Add to list'; b.classList.remove('ghost'); }, 1400);
      });
    });

    if (location.hash) {
      var target = document.getElementById(location.hash.slice(1));
      if (target) { target.scrollIntoView({ block: 'center' }); target.style.borderColor = 'var(--accent)'; }
    }
  }

  function buildCats() {
    var seen = {}, list = ['All'];
    ALL.forEach(function (p) { if (p.category && !seen[p.category]) { seen[p.category] = 1; list.push(p.category); } });
    A.$('#cats').innerHTML = list.map(function (c) {
      return '<button data-cat="' + A.esc(c) + '"' + (c === cat ? ' class="on"' : '') + '>' + A.esc(c) + '</button>';
    }).join('');
    A.$$('#cats button').forEach(function (b) {
      b.addEventListener('click', function () {
        cat = b.dataset.cat;
        A.$$('#cats button').forEach(function (x) { x.classList.toggle('on', x === b); });
        render();
      });
    });
  }

  A.Filaments.list().then(function (f) { FILS = f || []; render(); });

  A.Products.list().then(function (rows) {
    /* Row level security already hides drafts from anonymous visitors, but two
       paths get round it: browsing your own site while signed in, and the
       localStorage cache that admin fills with draft rows. Filter here too. */
    rows = rows.filter(function (p) { return (p.status || 'published') === 'published'; });
    ALL = rows;
    buildCats();
    render();
    // Hide the filter panel entirely when there is nothing to filter.
    if (!rows.length) {
      var panel = A.$('#q').closest('.panel');
      if (panel) panel.classList.add('hide');
    }
  });

  A.$('#q').addEventListener('input', A.debounce(render, 140));
  A.$('#sort').addEventListener('change', render);
  A.$('#onlyQuick').addEventListener('change', render);
})();

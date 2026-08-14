/* shop.js — ready-made catalog: filter, sort, search, lightbox, add-to-list */
(function () {
  'use strict';
  var A = window.APP;
  var ALL = [], CATS = [], cat = 'All';

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

    function row(f, cur) {
      return '<li role="option" tabindex="-1" data-fil="' + A.esc(f.id) + '"' +
        (f.id === cur ? ' aria-selected="true" class="on"' : ' aria-selected="false"') + '>' +
        '<span class="sw" style="background:' + A.esc(f.hex) + '"></span>' +
        '<span class="cname">' + A.esc(f.name) + '</span>' +
        '<span class="cbrand">' + A.esc(f.brand || '') + '</span>' +
        (f.in_stock ? '' : '<span class="cflag">to order</span>') +
      '</li>';
    }

    return '<div class="colours">' + A.Filaments.slotsFor(p).map(function (s) {
      var cur = (PICKED[p.id] || {})[s.index] || s.default;
      var f = fil(cur) || FILS.filter(function (x) { return x.in_stock; })[0] || FILS[0];
      var id = 'c-' + p.id + '-' + s.index;
      var inStock = FILS.filter(function (x) { return x.in_stock; });
      var toOrder = FILS.filter(function (x) { return !x.in_stock; });

      return '<div class="slot" data-pid="' + A.esc(p.id) + '" data-slot="' + s.index + '">' +
        '<span class="slot-label">' + A.esc(s.label) + '</span>' +
        '<button type="button" class="cbtn" id="' + A.esc(id) + '"' +
          ' aria-haspopup="listbox" aria-expanded="false"' +
          ' title="' + A.esc(f ? (f.name + (f.brand ? ' — ' + f.brand : '')) : '') + '">' +
          '<span class="sw" style="background:' + A.esc(f ? f.hex : '#888') + '"></span>' +
          '<span class="cname">' + A.esc(f ? f.name : 'Pick a colour') + '</span>' +
          '<span class="carr" aria-hidden="true">&#9662;</span>' +
        '</button>' +
        '<ul class="clist hide" role="listbox" aria-labelledby="' + A.esc(id) + '">' +
          (inStock.length ? '<li class="chead" role="presentation">On the shelf</li>' : '') +
          inStock.map(function (x) { return row(x, cur); }).join('') +
          (toOrder.length ? '<li class="chead" role="presentation">Made to order</li>' : '') +
          toOrder.map(function (x) { return row(x, cur); }).join('') +
        '</ul>' +
      '</div>';
    }).join('') + '</div>';
  }

  function closeLists(except) {
    A.$$('#grid .clist').forEach(function (l) {
      if (l === except) return;
      l.classList.add('hide');
      var b = l.parentNode.querySelector('.cbtn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.slot')) closeLists(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLists(null);
  });

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
        '</div>' +
        swatches(p) + leadNote(p) +
      '</div>' +
      '<div class="foot"><button class="btn sm block add" data-id="' + A.esc(p.id) + '">+ Add to list</button></div>' +
    '</article>';
  }

  function render() {
    var rows = sorted(ALL.filter(matches));

    /* Browsing everything: group under category headings, in the order set in
       Shop tools. Filtering or searching: one flat grid. Groups render INSIDE
       #grid so all the colour-picker handlers below still find their targets. */
    var searching = A.$('#q').value.trim() !== '';
    var grouped = cat === 'All' && !searching && rows.length > 0;
    A.$('#grid').classList.toggle('asgroups', grouped);
    A.$('#grid').innerHTML = grouped
      ? A.Categories.group(CATS, rows).map(function (g) {
          return '<section class="catgroup" id="cat-' + A.esc(g.cat.id) + '">' +
            '<div class="cathead">' +
              '<h3>' + A.esc(g.cat.name) +
                (g.cat.unlisted ? ' <span class="chip amber">unlisted</span>' : '') + '</h3>' +
              (g.cat.blurb ? '<p>' + A.esc(g.cat.blurb) + '</p>' : '') +
              '<span class="count mono">' + g.rows.length + '</span>' +
            '</div>' +
            '<div class="products">' + g.rows.map(card).join('') + '</div>' +
          '</section>';
        }).join('')
      : rows.map(card).join('');
    var nothingAtAll = ALL.length === 0;
    A.$('#noresults').classList.toggle('hide', rows.length > 0);
    A.$('#noresults').textContent = nothingAtAll
      ? 'The catalog is still being set up — get in touch and I will tell you what I have on hand.'
      : 'No items match that.';

    A.$$('#grid .thumb').forEach(function (t) {
      t.addEventListener('click', function () { A.lightbox(t.dataset.img, t.dataset.cap); });
    });
    A.$$('#grid .cbtn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var list = btn.parentNode.querySelector('.clist');
        var opening = list.classList.contains('hide');
        closeLists(opening ? list : null);
        list.classList.toggle('hide', !opening);
        btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      });
    });

    A.$$('#grid .clist [data-fil]').forEach(function (li) {
      li.addEventListener('click', function (e) {
        e.stopPropagation();
        var slot = li.closest('.slot');
        var pid = slot.dataset.pid;
        PICKED[pid] = PICKED[pid] || {};
        PICKED[pid][slot.dataset.slot] = li.dataset.fil;

        var f = fil(li.dataset.fil);
        var btn = slot.querySelector('.cbtn');
        btn.querySelector('.sw').style.background = f.hex;
        btn.querySelector('.cname').textContent = f.name;
        btn.title = f.name + (f.brand ? ' — ' + f.brand : '');
        slot.querySelectorAll('[data-fil]').forEach(function (o) {
          var on = o === li;
          o.classList.toggle('on', on);
          o.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        closeLists(null);

        var card = document.getElementById(pid);
        var note = card && card.querySelector('.lead');
        if (note) note.remove();
        var lead = A.Filaments.leadTime(pickedFor(
          ALL.filter(function (x) { return x.id === pid; })[0]));
        if (lead && card) {
          var d = document.createElement('div');
          d.className = 'lead';
          d.textContent = lead.text;
          card.querySelector('.colours').insertAdjacentElement('afterend', d);
        }
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
    /* managed categories first, in your order; then anything a product uses
       that is not in the list, so a YAML typo never hides stock */
    A.Categories.visible(CATS).forEach(function (c) {
      var used = ALL.some(function (p) { return (p.category || '') === c.name; });
      if (used && !seen[c.name]) { seen[c.name] = 1; list.push(c.name); }
    });
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

  A.Categories.load().then(function (c) { CATS = c || []; buildCats(); render(); });

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

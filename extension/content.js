// Inbox blocks: draws 5 blocks over the Gmail inbox page.
// Only on the inbox home (#inbox). Opening a mail, a label or a search shows Gmail as usual.
(() => {
  if (window.top !== window || window.__inboxBlocks) return;
  window.__inboxBlocks = true;

  const ICON = {
    people: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5',
    codes: 'M8 20a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M11.2 12.3L20 3.5 M17 6.5l2.5 2.5 M14.5 9l2 2',
    account: 'M12 3.5l7 2.8v5.4c0 4.2-3 7.6-7 8.8-4-1.2-7-4.6-7-8.8V6.3z M9.5 12l2 2 3.5-4',
    google: 'M5 5h5v5H5z M14 5h5v5h-5z M5 14h5v5H5z M14 14h5v5h-5z',
    other: 'M4 13l2.5-8h11L20 13v6H4z M4 13h4.5l1.5 2.5h4l1.5-2.5H20',
    open: 'M14 4h6v6 M20 4l-8.5 8.5 M18 14v6H4V6h6',
    refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v4h-4',
    list: 'M4 6h16 M4 12h16 M4 18h16',
    grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
    copy: 'M9 9h10v11H9z M15 9V4H5v11h4',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    chevron: 'M6 9l6 6 6-6',
    clear: 'M5 12.5l4.5 4.5L19 7.5'
  };
  // [light, dark]: chosen to read well on Gmail's own backgrounds.
  const COLOR = {
    people: ['#0b57d0', '#a8c7fa'],
    codes: ['#a15c00', '#fdd663'],
    account: ['#b3261e', '#f2b8b5'],
    google: ['#146c2e', '#6dd58c'],
    other: ['#5e5e5e', '#a8a8a8']
  };
  const EMPTY = {
    people: 'No new mail from people',
    codes: 'No codes right now',
    account: 'Nothing needs your attention',
    google: 'No news from Google',
    other: 'Nothing else'
  };
  const OTHER_ROWS = 4;
  const STALE_MS = 60 * 1000;
  const CODE_FRESH_MS = 15 * 60 * 1000;   // a code is "live" this long
  const CODE_EARLIER_MS = 24 * 3600 * 1000; // older codes fold into "Earlier"

  const state = {
    data: null, mode: 'grid', note: null, loading: false,
    open: { other: false, earlier: false }, copied: '', read: {}
  };
  let host = null;
  let shadow = null;
  let lastFetch = 0;
  let pending = false;
  let introDone = false;
  let known = null;          // conversation ids already shown, to spot new ones
  let fresh = new Set();     // conversations that arrived with the last update
  let lastCounts = {};
  const pip = globalThis.__inboxPip ? globalThis.__inboxPip() : null; // the mascot, from pip.js

  // ------------------------------------------------------------------ start
  const style = document.createElement('style');
  style.textContent = 'div[role="main"][data-ib="grid"] > :not(#ib-grid-host){display:none !important}';
  (document.head || document.documentElement).appendChild(style);

  chrome.storage.sync.get('motion').then((v) => { setMotion(v.motion); });
  chrome.storage.onChanged.addListener((changes) => { if (changes.motion) setMotion(changes.motion.newValue); });

  function setMotion(value) {
    state.motion = value === 'on' ? 'on' : 'system';
    if (pip) pip.setMotion(state.motion === 'on');
    if (host) render();
  }

  chrome.storage.local.get(['blocks', 'mode']).then((v) => {
    if (v.blocks && v.blocks.ok) take(v.blocks, false);
    state.mode = v.mode === 'list' ? 'list' : 'grid';
    schedule();
    refresh(false);
  });

  window.addEventListener('hashchange', () => { schedule(); if (onInbox()) refresh(false); });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && onInbox()) refresh(false); });
  setInterval(() => { if (!document.hidden && onInbox()) refresh(false); }, 2 * 60 * 1000);
  setInterval(() => { if (host && !document.hidden) render(); }, 60 * 1000); // keeps times and code ages right

  // ------------------------------------------------------------------ place
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; place(); }, 200);
  }

  function onInbox() {
    const h = (location.hash || '#inbox').split('?')[0];
    return h === '#inbox' || h === '';
  }

  function mainEl() {
    for (const el of document.querySelectorAll('div[role="main"]')) if (el.getClientRects().length) return el;
    return null;
  }

  function pageEmail() {
    const m = document.title.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
    return m ? m[0].toLowerCase() : '';
  }

  function sameAccount() {
    const me = state.data && state.data.me;
    const page = pageEmail();
    return !me || !page || me.toLowerCase() === page;
  }

  function hasData() {
    return !!(state.data && state.data.ok && state.data.blocks);
  }

  function place() {
    const main = mainEl();
    const show = !!main && onInbox() && sameAccount();
    document.querySelectorAll('div[role="main"][data-ib]').forEach((el) => {
      if (!show || el !== main) el.removeAttribute('data-ib');
    });
    if (!show) {
      if (host) { host.remove(); host = null; shadow = null; introDone = false; }
      return;
    }
    if (!host || host.parentNode !== main) {
      if (host) host.remove();
      host = document.createElement('div');
      host.id = 'ib-grid-host';
      shadow = host.attachShadow({ mode: 'open' });
      shadow.addEventListener('click', onClick);
      main.prepend(host);
      render();
    } else if (main.firstChild !== host) {
      main.prepend(host);
    }
    const want = state.mode === 'grid' && (hasData() || state.loading) ? 'grid' : 'list';
    if (main.getAttribute('data-ib') !== want) main.setAttribute('data-ib', want);
  }

  // ------------------------------------------------------------------ data
  function take(data, live) {
    const ids = new Set();
    data.blocks.forEach((b) => b.items.forEach((it) => ids.add(it.th)));
    fresh = new Set();
    if (known && live) ids.forEach((th) => { if (!known.has(th)) fresh.add(th); });
    known = ids;
    state.data = data;
  }

  async function refresh(force) {
    if (state.loading) return;
    if (!force && Date.now() - lastFetch < STALE_MS) return;
    state.loading = true;
    lastFetch = Date.now();
    if (pip) pip.loading(true);
    place();
    if (host) render();
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: 'blocks', fresh: force });
    } catch (e) {
      res = { ok: false, error: 'The extension was updated. Reload Gmail.' };
    }
    state.loading = false;
    if (pip) pip.loading(false);
    let arrived = [];
    if (res && res.ok) {
      take(res, true);
      arrived = res.blocks.flatMap((b) => b.items).filter((it) => fresh.has(it.th));
      state.note = null;
      state.read = {};
      if (pip) pip.ok();
    } else if (res && res.setup) {
      state.note = { text: 'Connect Inbox blocks to your Gmail to see your mail sorted into blocks.', action: 'options', label: 'Connect' };
    } else if (res && res.signin) {
      state.note = { text: 'Google needs your OK once.', action: 'signin', label: 'Open and allow', url: res.url };
    } else {
      state.note = { text: "Couldn't update: " + ((res && res.error) || 'unknown error'), action: 'refresh', label: 'Try again' };
      if (pip) pip.failed();
    }
    place();
    if (host) render();
    if (pip && res && res.ok) {
      if (arrived.length) pip.delivered(arrived.length, arrived[0].from);
      else pip.greet();
    }
  }

  // What Pip needs to know: unread from people, fresh codes, account alerts.
  function pipInfo() {
    if (!hasData()) return { people: 0, account: 0, codes: 0 };
    const blk = (k) => state.data.blocks.find((b) => b.key === k) || { items: [], unread: 0 };
    const unread = (k) => {
      const b = blk(k);
      const shown = b.items.filter((it) => it.unread);
      return shown.filter((it) => !state.read[it.th]).length + Math.max(0, b.unread - shown.length);
    };
    const codes = blk('codes').items.filter((it) => it.code && Date.now() - it.ts < CODE_FRESH_MS).length;
    return { people: unread('people'), account: unread('account'), codes };
  }

  // ------------------------------------------------------------------ actions
  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'open') {
      state.read[el.dataset.th] = true;
      location.hash = '#inbox/' + el.dataset.th;
    } else if (act === 'search') {
      location.hash = '#search/' + encodeURIComponent(el.dataset.q).replace(/%20/g, '+');
    } else if (act === 'copy') {
      copyCode(el);
    } else if (act === 'refresh') {
      refresh(true);
    } else if (act === 'mode') {
      state.mode = el.dataset.mode;
      chrome.storage.local.set({ mode: state.mode });
      place();
      render();
    } else if (act === 'fold') {
      const key = el.dataset.key;
      state.open[key] = !state.open[key];
      const box = shadow.querySelector('[data-fold="' + key + '"]');
      if (box) box.classList.toggle('open', state.open[key]);
      el.setAttribute('aria-expanded', String(state.open[key]));
      const label = el.querySelector('.fold-label');
      if (label) label.textContent = state.open[key] ? el.dataset.less : el.dataset.more;
    } else if (act === 'options') {
      chrome.runtime.sendMessage({ type: 'options' });
    } else if (act === 'signin') {
      window.open(el.dataset.url, '_blank');
    } else if (act === 'pip' && pip) {
      pip.poke();
    }
  }

  function copyCode(el) {
    const code = el.dataset.code;
    navigator.clipboard.writeText(code).catch(() => {});
    state.copied = el.dataset.th;
    // Update in place: no re-render, so the flash plays once.
    el.classList.add('ok');
    el.innerHTML = svg(ICON.check, 16) + '<span>Copied</span>';
    const digits = el.closest('.coderow') && el.closest('.coderow').querySelector('.code');
    if (digits) { digits.classList.remove('flash'); void digits.offsetWidth; digits.classList.add('flash'); }
    if (pip) pip.copied();
    setTimeout(() => {
      if (state.copied !== el.dataset.th) return;
      state.copied = '';
      el.classList.remove('ok');
      el.innerHTML = svg(ICON.copy, 16) + '<span>Copy</span>';
    }, 1800);
  }

  // ------------------------------------------------------------------ draw
  function render() {
    if (!shadow) return;
    const scroll = {};
    shadow.querySelectorAll('[data-scroll]').forEach((el) => { scroll[el.dataset.scroll] = el.scrollTop; });

    const dark = isDark(host.parentNode || document.body);
    const grid = state.mode === 'grid' && hasData();
    const skeleton = state.mode === 'grid' && !hasData() && state.loading;
    const intro = (grid || skeleton) && !introDone;
    // The shell (styles, Pip) is built once per page so Pip keeps moving between updates.
    if (!shadow.querySelector('.wrap')) {
      shadow.innerHTML = '<style>' + CSS + (pip ? pip.css : '') + '</style>' +
        '<div class="wrap' + (pip ? ' with-pip' : '') + '">' + (pip ? '<div class="pip-slot"></div>' : '') + '<div class="view"></div></div>';
      if (pip) pip.mount(shadow.querySelector('.pip-slot'));
    }
    shadow.querySelector('.wrap').className = 'wrap' + (pip ? ' with-pip' : '') + (dark ? ' dark' : '') + (intro ? ' intro' : '') +
      (state.motion === 'on' ? ' motion-on' : '');
    shadow.querySelector('.view').innerHTML = bar(grid) + (grid ? blocks(dark) : skeleton ? skeletonGrid() : '');
    if (grid) introDone = true;
    if (pip) pip.update(pipInfo());

    shadow.querySelectorAll('[data-scroll]').forEach((el) => {
      if (scroll[el.dataset.scroll]) el.scrollTop = scroll[el.dataset.scroll];
    });
    fresh = new Set(); // the glow plays once
  }

  function bar(grid) {
    const n = state.note;
    let left;
    if (n) {
      left = '<span class="note">' + esc(n.text) + '</span>' +
        '<button class="btn primary" data-act="' + n.action + '"' + (n.url ? ' data-url="' + esc(n.url) + '"' : '') + '>' + esc(n.label) + '</button>';
    } else if (hasData()) {
      const live = Date.now() - state.data.at < 5 * 60 * 1000;
      left = '<span class="status"><span class="live' + (live ? ' on' : '') + '"></span>' +
        (state.loading ? 'Updating…' : 'Updated ' + ago(state.data.at)) + '</span>';
    } else {
      left = '<span class="status"><span class="live"></span>Loading your inbox…</span>';
    }
    const right = !hasData() ? '' :
      '<button class="icon' + (state.loading ? ' spin' : '') + '" data-act="refresh" title="Refresh" aria-label="Refresh">' + svg(ICON.refresh, 18) + '</button>' +
      (grid
        ? '<button class="btn ghost" data-act="mode" data-mode="list">' + svg(ICON.list, 16) + '<span>List view</span></button>'
        : '<button class="btn ghost" data-act="mode" data-mode="grid">' + svg(ICON.grid, 16) + '<span>Block view</span></button>');
    return '<div class="bar' + (grid ? '' : ' slim') + '">' + left + '<span class="grow"></span>' + right + '</div>';
  }

  function blocks(dark) {
    const list = state.data.blocks;
    const main = list.filter((b) => b.key !== 'other').map((b, i) => block(b, dark, i)).join('');
    const other = list.find((b) => b.key === 'other');
    return '<div class="grid">' + main + (other ? block(other, dark, 4) : '') + '</div>';
  }

  function block(b, dark, index) {
    const color = (COLOR[b.key] || COLOR.other)[dark ? 1 : 0];
    const wide = b.key === 'other';
    const items = b.items.map((it) => Object.assign({}, it, { unread: it.unread && !state.read[it.th] }));
    const unread = items.filter((it) => it.unread).length + Math.max(0, b.unread - b.items.filter((it) => it.unread).length);
    const bump = lastCounts[b.key] !== undefined && unread > lastCounts[b.key];
    lastCounts[b.key] = unread;

    let body;
    if (!items.length) {
      body = '<div class="empty">' + svg(ICON.clear, 18) + '<span>' + EMPTY[b.key] + '</span></div>';
    } else if (b.key === 'codes') {
      body = codeRows(items);
    } else if (wide) {
      const first = items.slice(0, OTHER_ROWS).map(lineRow).join('');
      const rest = items.slice(OTHER_ROWS);
      body = first + (rest.length ? fold('other', rest.map(lineRow).join(''), 'Show ' + rest.length + ' more', 'Show less') : '');
    } else {
      body = items.map(row).join('');
    }

    return '<section class="blk' + (wide ? ' wide' : '') + '" style="--c:' + color + ';--i:' + index + '" aria-label="' + esc(b.title) + '">' +
      '<header>' +
        '<span class="ico">' + svg(ICON[b.key] || ICON.other, 18) + '</span>' +
        '<h2>' + esc(b.title) + '</h2>' +
        (unread ? '<span class="count' + (bump ? ' bump' : '') + '" aria-label="' + unread + ' unread">' + unread + '</span>' : '') +
        '<span class="grow"></span>' +
        '<button class="icon open-all" data-act="search" data-q="' + esc(b.search) + '" title="Open all in Gmail" aria-label="Open all ' + esc(b.title) + ' mail in Gmail">' + svg(ICON.open, 16) + '</button>' +
      '</header>' +
      '<div class="rows" data-scroll="' + b.key + '">' + body + '</div>' +
      '</section>';
  }

  function fold(key, inner, more, less) {
    const open = !!state.open[key];
    return '<div class="fold' + (open ? ' open' : '') + '" data-fold="' + key + '"><div class="fold-in">' + inner + '</div></div>' +
      '<button class="more" data-act="fold" data-key="' + key + '" data-more="' + esc(more) + '" data-less="' + esc(less) + '" aria-expanded="' + open + '">' +
      '<span class="fold-label">' + esc(open ? less : more) + '</span>' + svg(ICON.chevron, 16) + '</button>';
  }

  function cls(it) {
    return (it.unread ? ' unread' : '') + (fresh.has(it.th) ? ' fresh' : '');
  }

  function row(it) {
    return '<button class="row' + cls(it) + '" data-act="open" data-th="' + esc(it.th) + '">' +
      '<span class="dot"></span>' +
      '<span class="body"><span class="line"><span class="from">' + esc(it.from) + '</span><span class="time">' + when(it.ts) + '</span></span>' +
      '<span class="sub"><span class="subj">' + esc(it.subj) + '</span>' + (it.snip ? '<span class="snip"> – ' + esc(it.snip) + '</span>' : '') + '</span></span>' +
      '</button>';
  }

  function lineRow(it) {
    return '<button class="row one' + cls(it) + '" data-act="open" data-th="' + esc(it.th) + '">' +
      '<span class="dot"></span><span class="from">' + esc(it.from) + '</span>' +
      '<span class="sub"><span class="subj">' + esc(it.subj) + '</span>' + (it.snip ? '<span class="snip"> – ' + esc(it.snip) + '</span>' : '') + '</span>' +
      '<span class="time">' + when(it.ts) + '</span></button>';
  }

  function codeRows(items) {
    const now = Date.now();
    const recent = items.filter((it) => now - it.ts < CODE_EARLIER_MS);
    const earlier = items.filter((it) => now - it.ts >= CODE_EARLIER_MS);
    let html = recent.map(codeRow).join('');
    if (!recent.length) html = '<div class="empty small">' + svg(ICON.clear, 18) + '<span>No codes in the last 24 hours</span></div>';
    if (earlier.length) html += fold('earlier', earlier.map(codeRow).join(''), 'Earlier · ' + earlier.length, 'Hide earlier');
    return html;
  }

  function codeRow(it) {
    if (!it.code) return row(it);
    const age = Date.now() - it.ts;
    const live = age < CODE_FRESH_MS;
    const left = Math.max(0, CODE_FRESH_MS - age);
    const copied = state.copied === it.th;
    return '<div class="coderow' + cls(it) + (live ? ' ticking' : ' stale') + '">' +
      '<button class="row" data-act="open" data-th="' + esc(it.th) + '">' +
        '<span class="dot"></span>' +
        '<span class="body"><span class="line"><span class="from">' + esc(it.from) + '</span><span class="time">' + when(it.ts) + '</span></span>' +
        '<span class="code">' + esc(spaced(it.code)) + '</span>' +
        (live ? '<span class="life" style="--w0:' + (left / CODE_FRESH_MS * 100).toFixed(1) + '%;--left:' + Math.round(left / 1000) + 's"></span>' : '') +
        '</span>' +
      '</button>' +
      '<button class="copy' + (copied ? ' ok' : '') + '" data-act="copy" data-th="' + esc(it.th) + '" data-code="' + esc(it.code) + '" aria-label="Copy code ' + esc(it.code) + '">' +
        svg(copied ? ICON.check : ICON.copy, 16) + '<span>' + (copied ? 'Copied' : 'Copy') + '</span>' +
      '</button></div>';
  }

  function skeletonGrid() {
    const card = (i, wide) => '<section class="blk skel' + (wide ? ' wide' : '') + '" style="--i:' + i + '"><header><span class="ico sk"></span><span class="sk w30"></span></header>' +
      '<div class="rows">' + [70, 55, 80, 60].map((w) => '<div class="sk-row"><span class="sk w' + w + '"></span><span class="sk w' + (w - 20) + ' thin"></span></div>').join('') + '</div></section>';
    return '<div class="grid">' + [0, 1, 2, 3].map((i) => card(i)).join('') + card(4, true) + '</div>';
  }

  // ------------------------------------------------------------------ helpers
  function svg(d, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function spaced(code) {
    if (/^\d{6}$/.test(code)) return code.slice(0, 3) + ' ' + code.slice(3);
    if (/^\d{8}$/.test(code)) return code.slice(0, 4) + ' ' + code.slice(4);
    return code;
  }

  function when(ts) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function ago(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min ago';
    const h = Math.round(min / 60);
    return h + (h === 1 ? ' hour ago' : ' hours ago');
  }

  function isDark(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
        return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 < 0.45;
      }
    }
    return false;
  }

  const CSS = `
:host{all:initial;display:block}
.wrap{--card:#ffffff;--card-2:#f8fafd;--line:rgba(31,31,31,.08);--line-2:rgba(31,31,31,.14);--hover:rgba(31,31,31,.045);
  --t1:#1f1f1f;--t2:#444746;--t3:#5e5e5e;--btn:#0b57d0;--btn-t:#fff;--ok:#146c2e;--sk:rgba(31,31,31,.07);
  --shadow:0 1px 2px rgba(60,64,67,.06),0 1px 3px rgba(60,64,67,.06);
  --shadow-up:0 2px 6px rgba(60,64,67,.08),0 12px 28px -10px rgba(60,64,67,.18);
  --ease:cubic-bezier(.2,.8,.2,1);
  font:14px/20px "Google Sans","Google Sans Text",Roboto,Arial,sans-serif;color:var(--t1);
  padding:6px 16px 20px;box-sizing:border-box;-webkit-font-smoothing:antialiased}
.wrap.dark{--card:#1e1f20;--card-2:#232425;--line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.16);--hover:rgba(255,255,255,.055);
  --t1:#e3e3e3;--t2:#c4c7c5;--t3:#9aa0a6;--btn:#a8c7fa;--btn-t:#062e6f;--ok:#6dd58c;--sk:rgba(255,255,255,.07);
  --shadow:0 1px 2px rgba(0,0,0,.3);--shadow-up:0 2px 6px rgba(0,0,0,.35),0 14px 30px -12px rgba(0,0,0,.6)}
*{box-sizing:border-box}
button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer;text-align:left}
button:focus-visible{outline:2px solid var(--btn);outline-offset:2px;border-radius:10px}
svg{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.grow{flex:1}

/* top bar */
.wrap{position:relative}
.bar{display:flex;align-items:center;gap:8px;min-height:48px;padding:0 2px 10px}
.bar.slim{padding:4px 2px}
.with-pip .bar{padding-left:58px}
.status{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--t3);letter-spacing:.1px}
.live{width:7px;height:7px;border-radius:50%;background:var(--t3);opacity:.5}
.live.on{background:#1e8e3e;opacity:1;box-shadow:0 0 0 0 rgba(30,142,62,.45);animation:beat 2.4s var(--ease) infinite}
.dark .live.on{background:#6dd58c;box-shadow:0 0 0 0 rgba(109,213,140,.4)}
@keyframes beat{0%{box-shadow:0 0 0 0 rgba(30,142,62,.4)}70%,100%{box-shadow:0 0 0 7px rgba(30,142,62,0)}}
.note{font-size:13px;color:var(--t2)}
.icon{width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:var(--t2);transition:background .2s,color .2s,transform .2s var(--ease)}
.icon:hover{background:var(--hover);color:var(--t1)}
.icon:active{transform:scale(.92)}
.spin svg{animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.btn{height:34px;padding:0 14px;border-radius:17px;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;transition:background .2s,box-shadow .2s,transform .15s}
.btn.primary{background:var(--btn);color:var(--btn-t)}
.btn.primary:hover{box-shadow:0 1px 3px rgba(0,0,0,.2)}
.btn.ghost{color:var(--t2);border:1px solid var(--line-2)}
.btn.ghost:hover{background:var(--hover)}
.btn:active{transform:scale(.97)}

/* grid and cards */
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media (max-width:900px){.grid{grid-template-columns:minmax(0,1fr)}}
.blk{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;display:flex;flex-direction:column;height:316px;overflow:hidden;
  box-shadow:var(--shadow);transition:box-shadow .3s var(--ease),border-color .3s var(--ease),transform .3s var(--ease)}
.blk::before{content:"";position:absolute;inset:0 0 auto 0;height:72px;pointer-events:none;
  background:linear-gradient(180deg,color-mix(in srgb,var(--c) 7%,transparent),transparent);opacity:.9}
.blk:hover{box-shadow:var(--shadow-up);border-color:color-mix(in srgb,var(--c) 28%,var(--line))}
.blk.wide{grid-column:1/-1;height:auto}
.intro .blk{animation:rise .55s var(--ease) both;animation-delay:calc(var(--i) * 70ms)}
@keyframes rise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
header{position:relative;display:flex;align-items:center;gap:10px;padding:12px 10px 8px 16px;flex-shrink:0}
.ico{width:32px;height:32px;border-radius:11px;display:flex;align-items:center;justify-content:center;color:var(--c);
  background:color-mix(in srgb,var(--c) 13%,transparent);transition:transform .3s var(--ease)}
.blk:hover .ico{transform:rotate(-6deg) scale(1.05)}
h2{margin:0;font-size:15px;line-height:20px;font-weight:500;color:var(--t1);letter-spacing:.1px}
.count{min-width:22px;height:20px;padding:0 7px;border-radius:10px;font-size:12px;line-height:20px;font-weight:600;text-align:center;
  font-variant-numeric:tabular-nums;color:#fff;background:var(--c)}
.dark .count{color:#1f1f1f}
.count.bump{animation:bump .6s var(--ease)}
@keyframes bump{0%{transform:scale(1)}35%{transform:scale(1.28)}100%{transform:scale(1)}}
.open-all{opacity:.55}
.blk:hover .open-all,.open-all:focus-visible{opacity:1}

/* rows */
.rows{position:relative;flex:1;min-height:0;overflow-y:auto;padding:0 8px 10px;scrollbar-width:thin;scrollbar-color:var(--line-2) transparent}
.row{position:relative;width:100%;display:flex;align-items:flex-start;gap:10px;padding:8px 8px;border-radius:12px;
  transition:background .18s,transform .18s var(--ease)}
.row:hover{background:var(--hover)}
.row:active{transform:scale(.995)}
.dot{width:8px;height:8px;margin-top:6px;border-radius:50%;flex-shrink:0;background:transparent;transition:background .2s}
.unread .dot,.unread>.row .dot{background:var(--c)}
.body{flex:1;min-width:0;display:flex;flex-direction:column}
.line{display:flex;align-items:baseline;gap:8px;min-width:0}
.from{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--t2)}
.time{margin-left:auto;flex-shrink:0;font-size:12px;color:var(--t3);font-variant-numeric:tabular-nums}
.sub{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;color:var(--t3)}
.subj{color:var(--t2)}
.unread .from,.unread>.row .from,.unread .subj{font-weight:600;color:var(--t1)}
.unread .time,.unread>.row .time{color:var(--t1);font-weight:500}
.row.one{align-items:center;padding:7px 8px}
.row.one .dot{margin-top:0}
.row.one .from{width:200px;flex-shrink:0}
.row.one .sub{flex:1;min-width:0}
.row.one .time{margin-left:12px}
.fresh{animation:arrive 2.6s var(--ease)}
.fresh .dot,.fresh>.row .dot{animation:ping 1.4s var(--ease) 2}
@keyframes arrive{0%{background:color-mix(in srgb,var(--c) 22%,transparent);transform:translateY(-6px);opacity:.3}
  12%{opacity:1;transform:none}100%{background:transparent}}
@keyframes ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--c) 55%,transparent)}100%{box-shadow:0 0 0 8px transparent}}

/* codes */
.coderow{display:flex;align-items:center;gap:6px;border-radius:12px}
.coderow .row{flex:1;min-width:0}
.code{margin-top:2px;font:600 21px/28px "Roboto Mono","Google Sans Mono",ui-monospace,SFMono-Regular,monospace;letter-spacing:2.5px;
  color:var(--t1);font-variant-numeric:tabular-nums;border-radius:6px;align-self:flex-start;padding:0 2px;margin-left:-2px}
.stale .code{color:var(--t3);font-size:17px;letter-spacing:1.5px}
.code.flash{animation:flash .9s var(--ease)}
@keyframes flash{0%{background:color-mix(in srgb,var(--c) 30%,transparent)}100%{background:transparent}}
.life{display:block;height:3px;margin-top:6px;border-radius:2px;background:var(--line);overflow:hidden;position:relative;max-width:180px}
.life::after{content:"";position:absolute;inset:0 auto 0 0;width:var(--w0);border-radius:2px;background:var(--c);animation:drain var(--left) linear forwards}
@keyframes drain{to{width:0}}
.copy{height:34px;padding:0 13px;margin-right:6px;border-radius:17px;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;
  border:1px solid var(--line-2);color:var(--t2);background:var(--card);transition:background .2s,color .2s,border-color .2s,transform .15s}
.copy:hover{background:var(--hover);color:var(--t1)}
.copy:active{transform:scale(.95)}
.copy.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 60%,transparent)}
.copy.ok svg{animation:pop .35s var(--ease)}
@keyframes pop{0%{transform:scale(.4)}100%{transform:scale(1)}}

/* folds: "Show more", "Earlier" */
.fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .35s var(--ease),opacity .3s;opacity:0}
.fold.open{grid-template-rows:1fr;opacity:1}
.fold-in{overflow:hidden;min-height:0}
.more{display:inline-flex;align-items:center;gap:4px;margin:4px 6px 0;padding:6px 10px;border-radius:10px;font-size:13px;font-weight:500;color:var(--btn);transition:background .2s}
.more:hover{background:var(--hover)}
.more svg{transition:transform .3s var(--ease)}
.more[aria-expanded="true"] svg{transform:rotate(180deg)}

/* empty and loading */
.empty{height:100%;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:13px;color:var(--t3)}
.empty svg{width:28px;height:28px;padding:6px;border-radius:50%;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
.empty.small{min-height:80px;height:auto}
.skel::before{display:none}
.sk{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--sk) 0%,color-mix(in srgb,var(--sk) 40%,transparent) 50%,var(--sk) 100%);
  background-size:200% 100%;animation:shimmer 1.3s linear infinite}
.ico.sk{border-radius:11px;height:32px}
.sk.thin{height:9px;margin-top:8px}
.sk-row{padding:12px 10px}
.w30{width:30%}.w35{width:35%}.w40{width:40%}.w50{width:50%}.w55{width:55%}.w60{width:60%}.w70{width:70%}.w80{width:80%}
@keyframes shimmer{to{background-position:-200% 0}}

/* Follows the system "reduce motion" setting unless "Always animate" is on in the settings. */
@media (prefers-reduced-motion:reduce){.wrap:not(.motion-on) *,.wrap:not(.motion-on) *::before,.wrap:not(.motion-on) *::after{animation:none !important;transition:none !important}}
`;
})();

/**
 * Inbox blocks — the web app.
 *
 * Deploy it once (Deploy → New deployment → Web app, "Execute as: Me",
 * "Who has access: Only myself"). Its URL serves:
 *   - the phone page            …/exec
 *   - data for the extension    …/exec?format=json
 *   - settings (POST, JSON)     { "action": "settings", "autoClean": true }
 *
 * After changing this file, publish a new version: Deploy → Manage deployments →
 * ✏️ → Version: New version → Deploy. The URL stays the same.
 */

var BLOCKS = [
  { key: 'people',  title: 'People',   bundles: ['people', 'apply'] },
  { key: 'codes',   title: 'Codes',    bundles: ['codes'] },
  { key: 'account', title: 'Accounts', bundles: ['security'] },
  { key: 'google',  title: 'Google',   bundles: ['google'] },
  { key: 'other',   title: 'Other',    bundles: ['jobs', 'money', 'shopping', 'updates'] }
];

var BLOCK_SCAN = 200;        // newest inbox messages looked at
var BLOCK_ITEMS = 15;        // conversations sent per block
var BLOCK_CACHE_SEC = 60;
var CODE_BODY_READS = 3;     // newest codes whose mail body is read when the preview has no code
var CODE_BODY_MAX_AGE = DAY_MS;

// ===========================================================================
// HTTP entry points
// ===========================================================================

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.format === 'json') {
    return json_(safely_(function () { return blocksData_(p.fresh === '1'); }));
  }
  var t = HtmlService.createTemplateFromFile('Phone');
  t.payload = JSON.stringify(safely_(function () { return blocksData_(false); })).replace(/</g, '\\u003c');
  return t.evaluate()
    .setTitle('Inbox blocks')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

function doPost(e) {
  return json_(safely_(function () {
    // Only JSON bodies: a web page cannot send these to your web app on its own.
    if (!e || !e.postData || !/^application\/json/i.test(e.postData.type || '')) throw new Error('Send JSON.');
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'settings') return saveSettings_(body);
    throw new Error('Unknown action.');
  }));
}

/** Called by the phone page (google.script.run). */
function blocksForPage(fresh) {
  return safely_(function () { return blocksData_(!!fresh); });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safely_(fn) {
  try {
    return fn();
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

// ===========================================================================
// Settings
// ===========================================================================

function settings_() {
  var p = props_();
  var stats = {};
  try { stats = JSON.parse(p.getProperty('LAST_STATS') || '{}'); } catch (e) { stats = {}; }
  return {
    autoClean: p.getProperty('AUTO_CLEAN') === 'on',
    lastSync: Number(p.getProperty('LAST_SYNC') || 0),
    stillSorting: !!stats.remaining
  };
}

function saveSettings_(body) {
  var cleaned = 0;
  if (typeof body.autoClean === 'boolean') {
    props_().setProperty('AUTO_CLEAN', body.autoClean ? 'on' : 'off');
    if (body.autoClean) {
      var r = runLocked_(function () { return autoClean_(ctx_(25 * 1000, true)); }, 3000);
      cleaned = typeof r === 'number' ? r : 0; // busy: the next sync does it
    }
    CacheService.getScriptCache().remove('BLOCKS');
  }
  return { ok: true, settings: settings_(), cleaned: cleaned };
}

// ===========================================================================
// Blocks
// ===========================================================================

function blocksData_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var hit = cache.get('BLOCKS');
    if (hit) return JSON.parse(hit);
  }

  var c = ctx_(60 * 1000, true);
  var bundleToBlock = {};
  BLOCKS.forEach(function (b) { b.bundles.forEach(function (k) { bundleToBlock[k] = b.key; }); });

  var ids = listIds_({ q: 'in:inbox ' + BASE_Q }, BLOCK_SCAN).map(function (m) { return m.id; });
  var metas = fetchMeta_(ids);

  var threads = {};   // newest message per conversation, newest first
  var order = [];
  metas.forEach(function (meta) {
    if (!meta) return;
    var unread = (meta.labelIds || []).indexOf('UNREAD') >= 0;
    var t = threads[meta.threadId];
    if (t) { if (unread) t.item.unread = true; return; }
    var msg = normalizeMessage(meta);
    var bundle = sortedKeyOf_(c, msg.labelIds) ||
      classify(msg, { rules: c.rules, inMyThread: c.inMyThread(msg.threadId), applyDomains: c.applyDomains }).bundle;
    threads[meta.threadId] = {
      block: bundleToBlock[bundle] || 'other',
      item: {
        id: msg.id,
        th: msg.threadId,
        from: msg.fromName || msg.fromEmail,
        email: msg.fromEmail,
        subj: msg.subject || '(no subject)',
        snip: msg.snippet || '',
        ts: msg.ts,
        unread: unread,
        code: bundle === 'codes' ? otpCode_(msg.subject, msg.snippet) : ''
      }
    };
    order.push(meta.threadId);
  });

  var blocks = BLOCKS.map(function (b) {
    var items = order.map(function (th) { return threads[th]; })
      .filter(function (t) { return t.block === b.key; })
      .map(function (t) { return t.item; });
    return {
      key: b.key,
      title: b.title,
      count: items.length,
      unread: items.filter(function (it) { return it.unread; }).length,
      search: 'in:inbox (' + b.bundles.map(function (k) {
        return 'label:' + bundleByKey(k).label.toLowerCase().replace(/[\s\/]+/g, '-');
      }).join(' OR ') + ')',
      items: items.slice(0, BLOCK_ITEMS)
    };
  });

  fillCodesFromBody_(blocks.filter(function (b) { return b.key === 'codes'; })[0]);

  var out = { ok: true, me: c.me, at: Date.now(), scanned: ids.length, settings: settings_(), blocks: blocks };
  try { cache.put('BLOCKS', JSON.stringify(out), BLOCK_CACHE_SEC); } catch (e) { /* too big to cache */ }
  return out;
}

// ===========================================================================
// One-time codes
// ===========================================================================

/** "Your code is 482913" → "482913". Looks in the subject, then the preview text. */
function otpCode_(subject, snippet) {
  return codeNearKeyword_(subject) || codeNearKeyword_(snippet) || plainCode_(subject) || '';
}

/** When the preview has no code, read the body of the newest few code mails. */
function fillCodesFromBody_(block) {
  if (!block) return;
  var need = block.items.filter(function (it) {
    return !it.code && Date.now() - it.ts < CODE_BODY_MAX_AGE;
  }).slice(0, CODE_BODY_READS);
  if (!need.length) return;
  var res = getAll_(need.map(function (it) {
    return 'messages/' + it.id + '?format=full&fields=' + encodeURIComponent('payload');
  }));
  need.forEach(function (it, i) {
    var text = res[i] ? bodyText_(res[i].payload) : '';
    it.code = codeNearKeyword_(text) || '';
  });
}

var CODE_KEYWORD_RE = /\b(code|codes|otp|passcode|pin|verification|verify|one[- ]time|mã)\b/gi;
var CODE_TOKEN_RE = /(?:^|[^\w-])((?:[A-Z]{1,3}-)?(?=[A-Z0-9]*\d)[A-Z0-9]{4,10})(?![\w-])/g;

/** First code-looking token within 80 characters after a word like "code" or "OTP". */
function codeNearKeyword_(text) {
  text = String(text || '');
  CODE_KEYWORD_RE.lastIndex = 0;
  var m;
  while ((m = CODE_KEYWORD_RE.exec(text))) {
    var after = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
    var found = firstToken_(after);
    if (found) return found;
  }
  return '';
}

/** A subject that is only a code, or starts with one ("482913 is your code"). */
function plainCode_(subject) {
  var m = /^\s*(\d{4,8})\b/.exec(String(subject || ''));
  return m && !isYear_(m[1]) ? m[1] : '';
}

function firstToken_(text) {
  CODE_TOKEN_RE.lastIndex = 0;
  var m;
  while ((m = CODE_TOKEN_RE.exec(text))) {
    var tok = m[1];
    var digits = tok.replace(/\D/g, '').length;
    if (isYear_(tok) || digits < 3 && tok.length < 6) continue;
    if (/^\d+$/.test(tok) && /^[:.\/]\d/.test(text.slice(m.index + m[0].length))) continue; // a time or date
    return tok;
  }
  return '';
}

function isYear_(s) { return /^(19|20)\d\d$/.test(s); }

/** Plain text of a message: the text/plain part, or the HTML part without tags. */
function bodyText_(payload) {
  var parts = [];
  (function walk(p) {
    if (!p) return;
    if (p.body && p.body.data && /^text\/(plain|html)/i.test(p.mimeType || '')) parts.push(p);
    (p.parts || []).forEach(walk);
  })(payload);
  var part = parts.filter(function (p) { return /^text\/plain/i.test(p.mimeType); })[0] || parts[0];
  if (!part) return '';
  var text = Utilities.newBlob(Utilities.base64DecodeWebSafe(part.body.data)).getDataAsString('UTF-8');
  if (/html/i.test(part.mimeType)) {
    text = text.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
  }
  return text.replace(/\s+/g, ' ').slice(0, 6000);
}

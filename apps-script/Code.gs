/**
 * Inbox sorter — background sorting (runs every 10 minutes).
 *
 *   1. learns from mail you moved to another Sorted/… label in Gmail
 *   2. labels new mail (and, the first days, the old mail still in your inbox)
 *   3. if auto-clean is on, takes automated mail out of the inbox (archive, never delete)
 *
 * The Chrome extension and the phone page read their data from WebApp.gs.
 * Everything is read live from Gmail: the only things stored are your settings
 * and rules (Script properties).
 */

var CONFIG = {
  SORT_DAYS: 30,             // mail from the last N days is sorted, plus all old mail still in the inbox
  SYNC_MINUTES: 10,          // 1, 5, 10, 15 or 30
  RUN_BUDGET_MS: 270 * 1000, // Apps Script stops a run at 6 minutes
  BATCH: 10,                 // Gmail requests sent in parallel (more makes Gmail say "slow down")
  CHUNK: 100,                // messages classified before their labels are written
  APPLY_DOMAIN_DAYS: 120     // how long a company that answered your application is remembered
};

var DAY_MS = 24 * 3600 * 1000;
var GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/';
var BASE_Q = '-in:sent -in:drafts -in:chats -from:me';

// ===========================================================================
// Entry points
// ===========================================================================

/** Run once from the editor. Creates the labels and the 10-minute timer. */
function setup() {
  var me = profile_().emailAddress;
  var p = props_();
  p.setProperty('ME', me);
  ensureLabels_();
  if (!p.getProperty('AUTO_CLEAN')) p.setProperty('AUTO_CLEAN', 'off');

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(CONFIG.SYNC_MINUTES).create();

  var stats = sync();
  Logger.log('Setup done for ' + me + '. Sorted ' + String(stats.sorted) + ' messages' +
    (stats.remaining ? ' so far — the rest keeps sorting by itself every ' + CONFIG.SYNC_MINUTES + ' minutes.' : '.'));
  Logger.log('Next: Deploy → New deployment → Web app, then paste its URL into the Chrome extension.');
}

/** Stops the timer. Labels and mail stay as they are. */
function uninstall() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
  Logger.log('Stopped. Your labels and mail are untouched.');
}

/** Timer entry point. */
function sync() {
  var res = runLocked_(function () { return syncCore_(CONFIG.RUN_BUDGET_MS); }, 5000);
  return res.busy ? { sorted: 0, busy: true } : res;
}

// ===========================================================================
// Sync
// ===========================================================================

function syncCore_(budget) {
  var c = ctx_(budget);
  var stats = { sorted: 0, learned: 0, cleaned: 0, remaining: false, slowedDown: false, at: Date.now() };
  var learnedAll = false;

  try {
    stats.learned = learnFromMoves_(c);
    learnedAll = true;
    sortQuery_(c, 'newer_than:' + CONFIG.SORT_DAYS + 'd');
    if (timeLeft_(c)) sortQuery_(c, 'in:inbox'); // older mail still sitting in the inbox
    if (props_().getProperty('AUTO_CLEAN') === 'on' && timeLeft_(c)) stats.cleaned = autoClean_(c);
  } catch (e) {
    if (!e.rateLimited) throw e;
    stats.slowedDown = true; // Gmail asked to slow down: keep what is done, the next run continues
  }
  stats.sorted = c.sorted;
  stats.remaining = !!c.outOfTime || stats.slowedDown;

  var p = props_();
  // Only move the history mark once your own label moves have been read,
  // otherwise they would be skipped.
  if (learnedAll) p.setProperty('HISTORY_ID', String(profile_().historyId));
  p.setProperty('LAST_SYNC', String(Date.now()));
  p.setProperty('LAST_STATS', JSON.stringify(stats));

  return stats;
}

/** Sorts every message matching `extra` that has no Sorted/… label yet. */
function sortQuery_(c, extra) {
  var q = BASE_Q + ' ' + unsortedQuery_() + ' ' + extra;
  var total = 0;
  var pageToken = null;
  do {
    if (!timeLeft_(c)) break;
    var page = api_('get', 'messages?maxResults=500&q=' + encodeURIComponent(q) +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
    var ids = (page.messages || []).map(function (m) { return m.id; })
      .filter(function (id) { return !c.seen[id] && !c.skip[id]; });
    ids.forEach(function (id) { c.seen[id] = 1; });
    total += processIds_(c, ids);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return total;
}

function processIds_(c, ids) {
  var total = 0;
  for (var i = 0; i < ids.length; i += CONFIG.CHUNK) {
    if (!timeLeft_(c)) break;
    var add = {};
    var done = 0;
    var skipped = [];
    try {
      var end = Math.min(ids.length, i + CONFIG.CHUNK);
      for (var j = i; j < end; j += CONFIG.BATCH) {
        var slice = ids.slice(j, Math.min(end, j + CONFIG.BATCH));
        fetchMeta_(slice).forEach(function (meta, k) {
          if (!meta) { skipped.push(slice[k]); return; }
          if (sortedKeyOf_(c, meta.labelIds)) return;
          var msg = normalizeMessage(meta);
          if (!msg.fromEmail || msg.fromEmail === c.me) return;
          var res = classify(msg, { rules: c.rules, inMyThread: c.inMyThread(msg.threadId), applyDomains: c.applyDomains });
          if (res.bundle === 'apply' && res.why !== 'Company you applied to') rememberApplyDomain_(c, msg.domain);
          (add[res.bundle] = add[res.bundle] || []).push(msg.id);
          done++;
        });
      }
    } finally {
      // Even when Gmail stops us half way, label what was already read.
      rememberSkipped_(c, skipped);
      applyLabels_(c, add);
      c.sorted += done;
      total += done;
    }
  }
  return total;
}

/** Adds the group label and removes the other group labels. */
function applyLabels_(c, idsByBundle) {
  var all = BUNDLES.map(function (b) { return c.labels[b.key]; });
  Object.keys(idsByBundle).forEach(function (key) {
    var ids = idsByBundle[key];
    if (!ids || !ids.length) return;
    var b = bundleByKey(key);
    var labelId = c.labels[key];
    var addIds = [labelId];
    if (b && b.star) addIds.push('STARRED');
    modify_(ids, addIds, all.filter(function (id) { return id !== labelId; }));
  });
}

/** Takes automated mail out of the inbox according to each group's `clean` setting. */
function autoClean_(c) {
  var n = 0;
  var nowSec = Math.floor(Date.now() / 1000);
  BUNDLES.forEach(function (b) {
    if (!b.clean || b.pinned || !timeLeft_(c)) return;
    var q = '-is:starred';
    if (b.clean.afterHours > 0) q += ' before:' + (nowSec - Math.round(b.clean.afterHours * 3600));
    var ids = listIds_({ q: q, labelIds: [c.labels[b.key], 'INBOX'] }, 5000).map(function (m) { return m.id; });
    if (!ids.length) return;
    modify_(ids, [], b.clean.markRead ? ['INBOX', 'UNREAD'] : ['INBOX']);
    n += ids.length;
  });
  return n;
}

/**
 * When you move a mail to another Sorted/… label in Gmail (phone or web),
 * future mail from that sender goes to the same group.
 * HISTORY_ID is saved after every change this script makes, so any Sorted/…
 * label added since then was added by you.
 */
function learnFromMoves_(c) {
  var start = props_().getProperty('HISTORY_ID');
  if (!start) return 0;
  var moves = {};
  var pageToken = null;
  var pages = 0;
  try {
    do {
      var r = api_('get', 'history?historyTypes=labelAdded&maxResults=500&startHistoryId=' + start +
        (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
      (r.history || []).forEach(function (h) {
        (h.labelsAdded || []).forEach(function (la) {
          var keys = (la.labelIds || []).map(function (id) { return c.byLabel[id]; }).filter(Boolean);
          if (keys.length && la.message) moves[la.message.id] = keys[keys.length - 1];
        });
      });
      pageToken = r.nextPageToken;
    } while (pageToken && ++pages < 5);
  } catch (e) {
    if (/\b404\b|notFound|historyId/i.test(String(e))) return 0; // history expired: start again
    throw e;
  }

  var ids = Object.keys(moves);
  if (!ids.length) return 0;
  var relabel = {};
  var learned = 0;
  fetchMeta_(ids).forEach(function (meta) {
    if (!meta) return;
    var msg = normalizeMessage(meta);
    var key = moves[msg.id];
    if (!key || !msg.fromEmail || msg.fromEmail === c.me) return;
    setRule_(c, msg.fromEmail, key, 'learned');
    (relabel[key] = relabel[key] || []).push(msg.id);
    learned++;
  });
  applyLabels_(c, relabel);
  return learned;
}

// ===========================================================================
// Context, settings, rules, labels
// ===========================================================================

function ctx_(budget, cachedLabels) {
  var labels = cachedLabels ? cachedLabels_() : ensureLabels_();
  var byLabel = {};
  Object.keys(labels).forEach(function (k) { byLabel[labels[k]] = k; });
  var myThreads = null;
  var p = props_();
  var me = p.getProperty('ME');
  if (!me) { me = profile_().emailAddress; p.setProperty('ME', me); }
  return {
    started: Date.now(),
    budget: budget,
    me: String(me).toLowerCase(),
    labels: labels,
    byLabel: byLabel,
    rules: getRules_(),
    applyDomains: getApplyDomains_(),
    seen: {},
    skip: skippedIds_(),
    sorted: 0,
    inMyThread: function (threadId) {
      if (!myThreads) myThreads = myThreads_();
      return !!myThreads[threadId];
    }
  };
}

function timeLeft_(c) {
  var margin = Math.min(20000, c.budget * 0.3);
  var ok = Date.now() - c.started < c.budget - margin;
  if (!ok) c.outOfTime = true;
  return ok;
}

function runLocked_(fn, waitMs) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(waitMs)) return { busy: true };
  try { return fn(); } finally { lock.releaseLock(); }
}

function props_() { return PropertiesService.getScriptProperties(); }

function profile_() {
  if (typeof Gmail === 'undefined') {
    throw new Error('Add the Gmail API service first: in the editor, Services (+) → Gmail API → Add.');
  }
  return Gmail.Users.getProfile('me');
}

/** Rules are kept in Script properties, split in chunks (each value is limited to 9 KB). */
function getRules_() {
  var p = props_();
  var n = Number(p.getProperty('RULES_N') || 0);
  var s = '';
  for (var i = 0; i < n; i++) s += p.getProperty('RULES_' + i) || '';
  try { return s ? JSON.parse(s) : []; } catch (e) { return []; }
}

function saveRules_(rules) {
  var p = props_();
  var oldN = Number(p.getProperty('RULES_N') || 0);
  var s = JSON.stringify(rules.slice(0, 1500));
  var parts = [];
  for (var i = 0; i < s.length; i += 4000) parts.push(s.slice(i, i + 4000));
  var values = { RULES_N: String(parts.length) };
  parts.forEach(function (part, k) { values['RULES_' + k] = part; });
  p.setProperties(values);
  for (var j = parts.length; j < oldN; j++) p.deleteProperty('RULES_' + j);
}

function setRule_(c, pattern, bundle, source) {
  pattern = String(pattern || '').toLowerCase().trim();
  if (!pattern) return;
  c.rules = c.rules.filter(function (r) { return r.pattern !== pattern; });
  c.rules.unshift({ pattern: pattern, bundle: bundle, source: source, at: Date.now() });
  saveRules_(c.rules);
}

/** Companies that answered one of your applications: their later mail goes to Applications. */
function getApplyDomains_() {
  var list = [];
  try { list = JSON.parse(props_().getProperty('APPLY_DOMAINS') || '[]'); } catch (e) { list = []; }
  var cutoff = Date.now() - CONFIG.APPLY_DOMAIN_DAYS * DAY_MS;
  return list.filter(function (x) { return x.at >= cutoff; }).map(function (x) { return x.d; });
}

function rememberApplyDomain_(c, domain) {
  var d = baseDomain_(domain);
  if (!d || c.applyDomains.indexOf(d) >= 0) return;
  var skip = PERSONAL_DOMAINS.concat(JOB_DOMAINS, ATS_DOMAINS, GOOGLE_DOMAINS, ['linkedin.com', 'upwork.com']);
  if (skip.indexOf(d) >= 0) return;
  c.applyDomains.push(d);
  var list = [];
  try { list = JSON.parse(props_().getProperty('APPLY_DOMAINS') || '[]'); } catch (e) { list = []; }
  list = list.filter(function (x) { return x.d !== d; });
  list.unshift({ d: d, at: Date.now() });
  props_().setProperty('APPLY_DOMAINS', JSON.stringify(list.slice(0, 150)));
}

/** mail.northwindlabs.com → northwindlabs.com, email.mybank.co.uk → mybank.co.uk */
function baseDomain_(domain) {
  var parts = String(domain || '').toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2) return '';
  var two = parts.slice(-2).join('.');
  var keep = /^(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(two) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

/** Threads you have written in during the last 180 days (cached 6 hours). */
function myThreads_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('MY_THREADS');
  if (hit) return JSON.parse(hit);
  var set = {};
  listIds_({ q: 'in:sent newer_than:180d' }, 3000).forEach(function (m) { set[m.threadId] = 1; });
  try { cache.put('MY_THREADS', JSON.stringify(set), 6 * 3600); } catch (e) { /* too big to cache */ }
  return set;
}

/** Creates the Sorted/… labels if needed and returns { bundleKey: labelId }. */
function ensureLabels_() {
  var list = api_('get', 'labels').labels || [];
  var byName = {};
  list.forEach(function (l) { byName[String(l.name).toLowerCase()] = l.id; });
  var parent = BUNDLES[0].label.split('/')[0];
  if (!byName[parent.toLowerCase()]) createLabel_(parent, null);
  var out = {};
  BUNDLES.forEach(function (b) {
    out[b.key] = byName[b.label.toLowerCase()] || createLabel_(b.label, b.color).id;
  });
  props_().setProperty('LABELS', JSON.stringify(out));
  return out;
}

function cachedLabels_() {
  var raw = props_().getProperty('LABELS');
  var labels = raw ? JSON.parse(raw) : null;
  if (!labels || BUNDLES.some(function (b) { return !labels[b.key]; })) labels = ensureLabels_();
  return labels;
}

function createLabel_(name, color) {
  var body = { name: name, labelListVisibility: 'labelShow', messageListVisibility: 'show' };
  if (color) {
    try {
      return api_('post', 'labels', Object.assign({}, body, { color: { backgroundColor: color.bg, textColor: color.text } }));
    } catch (e) { /* colour not in Gmail's palette: create it without colour */ }
  }
  return api_('post', 'labels', body);
}


function sortedKeyOf_(c, labelIds) {
  var ids = labelIds || [];
  for (var i = 0; i < ids.length; i++) if (c.byLabel[ids[i]]) return c.byLabel[ids[i]];
  return null;
}

/** Gmail search that excludes everything already sorted. */
function unsortedQuery_() {
  return BUNDLES.map(function (b) {
    return '-label:' + b.label.toLowerCase().replace(/[\s\/]+/g, '-');
  }).join(' ');
}

// ===========================================================================
// Gmail REST helpers
// ===========================================================================

function metaPath_(id, headers) {
  return 'messages/' + id + '?format=metadata&' + (headers || CLASSIFIER_HEADERS).map(function (h) {
    return 'metadataHeaders=' + encodeURIComponent(h);
  }).join('&') + '&fields=' + encodeURIComponent('id,threadId,labelIds,snippet,internalDate,payload/headers');
}

function fetchMeta_(ids, headers) {
  var out = [];
  for (var i = 0; i < ids.length; i += CONFIG.BATCH) {
    out = out.concat(getAll_(ids.slice(i, i + CONFIG.BATCH).map(function (id) { return metaPath_(id, headers); })));
  }
  return out;
}

function listPath_(req, pageToken) {
  var qs = ['maxResults=' + (req.max || 500)];
  if (req.q) qs.push('q=' + encodeURIComponent(req.q));
  (req.labelIds || []).forEach(function (l) { qs.push('labelIds=' + encodeURIComponent(l)); });
  if (pageToken) qs.push('pageToken=' + encodeURIComponent(pageToken));
  return 'messages?' + qs.join('&');
}

function listIds_(req, cap) {
  return listMany_([req], cap)[0];
}

/** Lists several queries in parallel, following page tokens. Returns [{id, threadId}] per query. */
function listMany_(reqs, cap) {
  var out = reqs.map(function () { return []; });
  var tokens = reqs.map(function () { return null; });
  var active = reqs.map(function (_, i) { return i; });
  while (active.length) {
    var pages = getAll_(active.map(function (i) {
      return listPath_({ q: reqs[i].q, labelIds: reqs[i].labelIds, max: Math.min(500, cap) }, tokens[i]);
    }));
    var next = [];
    pages.forEach(function (page, k) {
      var i = active[k];
      if (!page) return;
      (page.messages || []).forEach(function (m) { out[i].push(m); });
      tokens[i] = page.nextPageToken;
      if (tokens[i] && out[i].length < cap) next.push(i);
    });
    active = next;
  }
  return out.map(function (list) { return list.slice(0, cap); });
}

/** Parallel GETs with retry on rate limits. A missing message (404) comes back as null. */
function getAll_(paths) {
  var token = ScriptApp.getOAuthToken();
  var results = new Array(paths.length);
  var pending = paths.map(function (_, i) { return i; });
  var slowBody = '';
  for (var attempt = 0; pending.length && attempt < 6; attempt++) {
    if (attempt) waitBeforeRetry_(attempt, slowBody);
    var resps = UrlFetchApp.fetchAll(pending.map(function (i) {
      return { url: GMAIL_API + paths[i], headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
    }));
    var retry = [];
    resps.forEach(function (r, k) {
      var i = pending[k];
      var code = r.getResponseCode();
      var body = r.getContentText();
      if (code < 300) results[i] = JSON.parse(body);
      else if (code === 404) results[i] = null;
      else if (isUnreadableMessage_(paths[i], code, body)) results[i] = null;
      else if (isRetryable_(code, body)) { retry.push(i); slowBody = body; }
      else throw apiError_(code, body);
    });
    pending = retry;
  }
  if (pending.length) throw rateLimitError_();
  return results;
}

/**
 * Waits before trying again: 2, 4, 8, 16 then 30 seconds, or until the time Gmail names
 * ("Retry after …"). If Gmail wants a longer pause, stop now: the next run continues.
 */
function waitBeforeRetry_(attempt, body) {
  var wait = Math.min(30000, 1000 * Math.pow(2, attempt));
  var m = /Retry after (\d{4}-\d\d-\d\dT[\d:.]+Z)/i.exec(String(body || ''));
  if (m) {
    var until = Date.parse(m[1]) - Date.now() + 500;
    if (until > 30000) throw rateLimitError_();
    wait = Math.max(wait, until);
  }
  Utilities.sleep(wait);
}

function rateLimitError_() {
  var e = new Error('Gmail asked this script to slow down. It carries on by itself on the next run (every ' +
    CONFIG.SYNC_MINUTES + ' minutes).');
  e.rateLimited = true;
  return e;
}

function api_(method, path, payload) {
  var opts = {
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (payload) {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(payload);
  }
  var slowBody = '';
  for (var attempt = 0; attempt < 6; attempt++) {
    if (attempt) waitBeforeRetry_(attempt, slowBody);
    var r = UrlFetchApp.fetch(GMAIL_API + path, opts);
    var code = r.getResponseCode();
    var body = r.getContentText();
    if (code < 300) return body ? JSON.parse(body) : {};
    if (!isRetryable_(code, body)) throw apiError_(code, body);
    slowBody = body;
  }
  throw rateLimitError_();
}

function modify_(ids, add, remove) {
  for (var i = 0; i < ids.length; i += 1000) {
    api_('post', 'messages/batchModify', {
      ids: ids.slice(i, i + 1000), addLabelIds: add || [], removeLabelIds: remove || []
    });
  }
}

/**
 * Gmail refuses to open some single messages (400 "Precondition check failed"),
 * for example some very old or special mail. Skip that one message, not the whole run.
 */
function isUnreadableMessage_(path, code, body) {
  return code === 400 && /^messages\/[^?\/]+\?/.test(path) && /failedPrecondition|Precondition check failed/i.test(body);
}

/** Messages Gmail would not open are not asked for again for 6 hours. */
function skippedIds_() {
  var hit = CacheService.getScriptCache().get('SKIP_IDS');
  var set = {};
  try { (hit ? JSON.parse(hit) : []).forEach(function (id) { set[id] = 1; }); } catch (e) { /* start empty */ }
  return set;
}

function rememberSkipped_(c, ids) {
  if (!ids.length) return;
  ids.forEach(function (id) { c.skip[id] = 1; });
  try {
    CacheService.getScriptCache().put('SKIP_IDS', JSON.stringify(Object.keys(c.skip).slice(-4000)), 6 * 3600);
  } catch (e) { /* too big to cache: they are skipped again next time anyway */ }
}

function isRetryable_(code, body) {
  return code === 429 || code >= 500 || (code === 403 && /rateLimitExceeded/i.test(body));
}

function apiError_(code, body) {
  if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(body)) {
    return new Error('The Gmail API is off for this script. In the editor: Services (+) → Gmail API → Add, then run setup again.');
  }
  return new Error('Gmail API error ' + code + ': ' + String(body).slice(0, 300));
}


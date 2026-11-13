// Run: node test/sim.js            (checks only)
//      node test/sim.js --preview  (also writes preview/blocks-data.json and preview/phone.html)
//
// Runs the Apps Script files (Classifier.gs, Code.gs, WebApp.gs) against a fake
// Gmail and a fake Apps Script runtime. All people, addresses and mail are made up.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ME = 'alex.doe@example.com';
const NOW = Date.now();
const MIN = 60 * 1000, H = 60 * MIN, D = 24 * H;

// ---------------------------------------------------------------- fake Gmail
const SYSTEM = ['INBOX', 'UNREAD', 'STARRED', 'SENT', 'DRAFT', 'SPAM', 'TRASH', 'IMPORTANT',
  'CATEGORY_PERSONAL', 'CATEGORY_UPDATES', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'];
const labels = SYSTEM.map((id) => ({ id, name: id, type: 'system' }));
let labelSeq = 1, historyId = 1000, msgSeq = 1;
const history = [], messages = [];
const throttle = { fail: 0, after: null, hits: 0 };
const unreadable = new Set(), unreadableHits = {};

function addMsg(from, subject, { age = 0, labels: ls = ['INBOX', 'UNREAD'], headers = {}, snippet = '', body = '', html = false, thread } = {}) {
  const id = 'm' + (msgSeq++).toString(16).padStart(6, '0');
  messages.push({ id, threadId: thread || 't' + id, internalDate: String(NOW - age), snippet, body, html,
    labelIds: new Set(ls), headers: Object.assign({ From: from, Subject: subject }, headers) });
  return id;
}
const byId = (id) => messages.find((m) => m.id === id);
const emailOf = (m) => { const x = m.headers.From.match(/<([^>]+)>/); return (x ? x[1] : m.headers.From).toLowerCase(); };
const labelName = (id) => (labels.find((l) => l.id === id) || {}).name;
const searchName = (n) => n.toLowerCase().replace(/[\s/]+/g, '-');

function matches(m, q, labelIds) {
  for (const l of labelIds) if (!m.labelIds.has(l)) return false;
  if (m.labelIds.has('SPAM') || m.labelIds.has('TRASH')) return false;
  const tokens = (q || '').match(/-?[a-z_]+:\([^)]*\)|\S+/gi) || [];
  for (let t of tokens) {
    const neg = t.startsWith('-'); if (neg) t = t.slice(1);
    const [k, ...rest] = t.split(':'); const v = rest.join(':').replace(/^\(|\)$/g, '');
    let ok;
    if (k === 'in') ok = v === 'chats' ? false : m.labelIds.has({ inbox: 'INBOX', sent: 'SENT', drafts: 'DRAFT' }[v]);
    else if (k === 'is') ok = m.labelIds.has({ unread: 'UNREAD', starred: 'STARRED' }[v]);
    else if (k === 'from') ok = v === 'me' ? emailOf(m) === ME : (emailOf(m) === v || emailOf(m).endsWith('@' + v) || emailOf(m).endsWith('.' + v));
    else if (k === 'label') ok = [...m.labelIds].some((id) => searchName(labelName(id) || '') === v);
    else if (k === 'newer_than') ok = Number(m.internalDate) > NOW - parseInt(v) * D;
    else if (k === 'before') ok = Number(m.internalDate) < Number(v) * 1000;
    else throw new Error('fake gmail: unsupported query token ' + t);
    if (neg ? ok : !ok) return false;
  }
  return true;
}
const json = (code, obj) => ({ getResponseCode: () => code, getContentText: () => (obj == null ? '' : JSON.stringify(obj)) });
const b64url = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function handle(url, opts = {}) {
  const u = new URL(url);
  const p = u.pathname.replace('/gmail/v1/users/me/', '');
  const method = (opts.method || 'get').toLowerCase();
  const body = opts.payload ? JSON.parse(opts.payload) : null;
  if (p === 'labels' && method === 'get') return json(200, { labels });
  if (p === 'labels' && method === 'post') {
    if (labels.some((l) => l.name.toLowerCase() === body.name.toLowerCase())) return json(409, { error: 'exists' });
    const l = { id: 'Label_' + labelSeq++, name: body.name, type: 'user', color: body.color };
    labels.push(l); return json(200, l);
  }
  if (p.startsWith('labels/')) {
    const l = labels.find((x) => x.id === p.split('/')[1]); if (!l) return json(404, {});
    const ms = messages.filter((m) => m.labelIds.has(l.id));
    return json(200, Object.assign({}, l, { messagesTotal: ms.length, messagesUnread: ms.filter((m) => m.labelIds.has('UNREAD')).length }));
  }
  if (p === 'messages' && method === 'get') {
    const all = messages.filter((m) => matches(m, u.searchParams.get('q'), u.searchParams.getAll('labelIds')))
      .sort((a, b) => b.internalDate - a.internalDate);
    const max = Number(u.searchParams.get('maxResults') || 100), start = Number(u.searchParams.get('pageToken') || 0);
    return json(200, { messages: all.slice(start, start + max).map((m) => ({ id: m.id, threadId: m.threadId })),
      nextPageToken: start + max < all.length ? String(start + max) : undefined });
  }
  if (p === 'messages/batchModify') { body.ids.forEach((id) => userModify(id, body.addLabelIds, body.removeLabelIds)); return json(204, null); }
  if (p.startsWith('messages/') && method === 'get') {
    const id = p.split('/')[1];
    if (unreadable.has(id)) {
      unreadableHits[id] = (unreadableHits[id] || 0) + 1;
      return json(400, { error: { code: 400, message: 'Precondition check failed.', errors: [{ reason: 'failedPrecondition' }], status: 'FAILED_PRECONDITION' } });
    }
    if (throttle.fail > 0) { throttle.fail--; throttle.hits++; return json(429, { error: { message: 'Too many concurrent requests for user' } }); }
    if (throttle.after !== null) {
      if (throttle.after <= 0) { throttle.hits++; return json(429, { error: { message: 'User-rate limit exceeded.  Retry after ' + new Date(Date.now() + 15 * 60000).toISOString() } }); }
      throttle.after--;
    }
    const m = byId(id); if (!m) return json(404, {});
    if (u.searchParams.get('format') === 'full') {
      const type = m.html ? 'text/html' : 'text/plain';
      return json(200, { payload: { mimeType: 'multipart/alternative', parts: [{ mimeType: type, body: { data: b64url(m.body) } }] } });
    }
    const want = u.searchParams.getAll('metadataHeaders');
    return json(200, { id: m.id, threadId: m.threadId, labelIds: [...m.labelIds], snippet: m.snippet, internalDate: m.internalDate,
      payload: { headers: Object.entries(m.headers).filter(([k]) => want.includes(k)).map(([name, value]) => ({ name, value })) } });
  }
  if (p === 'history') return json(200, { history: history.filter((h) => h.id > Number(u.searchParams.get('startHistoryId'))) });
  throw new Error('fake gmail: no route ' + method + ' ' + p);
}

function userModify(id, add = [], remove = []) {
  const m = byId(id); if (!m) return;
  const added = add.filter((l) => !m.labelIds.has(l));
  remove.forEach((l) => m.labelIds.delete(l)); add.forEach((l) => m.labelIds.add(l));
  historyId++;
  if (added.length) history.push({ id: historyId, labelsAdded: [{ message: { id: m.id, threadId: m.threadId }, labelIds: added }] });
}

// ---------------------------------------------------------- fake Apps Script
const props = {}, cache = {};
let fetchCount = 0;
const output = (text) => ({ text, setMimeType() { return this; }, getContent() { return this.text; } });
const page = (html) => ({ html, setTitle() { return this; }, addMetaTag() { return this; }, getContent() { return this.html; } });
const sandbox = {
  console,
  UrlFetchApp: { fetch: (url, o) => { fetchCount++; return handle(url, o); }, fetchAll: (rs) => rs.map((r) => { fetchCount++; return handle(r.url, r); }) },
  ScriptApp: { getOAuthToken: () => 'token', getProjectTriggers: () => [], deleteTrigger: () => {},
    newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => ({}) }) }) }) },
  Gmail: { Users: { getProfile: () => ({ emailAddress: ME, historyId: String(historyId) }) } },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); },
    setProperties: (o) => Object.entries(o).forEach(([k, v]) => { props[k] = String(v); }), deleteProperty: (k) => { delete props[k]; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
  Utilities: {
    sleep: () => {},
    base64DecodeWebSafe: (s) => [...Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') })
  },
  Session: { getScriptTimeZone: () => 'Europe/London' },
  Logger: { log: (...a) => console.log('  [log]', ...a) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: output },
  HtmlService: {
    createTemplateFromFile: (name) => {
      const src = fs.readFileSync(path.join(ROOT, 'apps-script', name + '.html'), 'utf8');
      const t = { evaluate: () => page(src.replace(/<\?!=\s*payload\s*\?>/g, () => t.payload)) };
      return t;
    }
  }
};
vm.createContext(sandbox);
for (const f of ['Classifier.gs', 'Code.gs', 'WebApp.gs']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), sandbox, { filename: f });
}

// ------------------------------------------------------------------ inbox
const LIST = { 'List-Unsubscribe': '<mailto:u@x.com>, <https://unsub.example.com/u?id=1>' };
const ids = {
  applied: addMsg('Nova Health Hiring <no-reply@ashbyhq.com>', 'Thank you for applying to Nova Health', { age: 26 * H }),
  tasks: addMsg('Northwind Labs <no-reply@northwindlabs.com>', 'Alex Doe & Northwind Labs: invitation to take on a few tasks',
    { age: 2 * H, snippet: 'Hi Alex, congratulations on making it through the screening phase!' }),
  code: addMsg('Northwind Labs <no-reply@northwindlabs.com>', 'Your login code', { age: 3 * MIN, snippet: 'Use the following code to sign in: 48291305' }),
  codeInBody: addMsg('Fable Studio <no-reply@fable.example>', 'Sign-in code for Fable Studio', { age: 5 * MIN,
    snippet: 'Hi Alex, someone is trying to sign in to your account.', html: true,
    body: '<html><body><p>Hi Alex,</p><p>Your verification code is</p><h1 style="letter-spacing:4px">731 902</h1><p>It expires in 10 minutes. Sent 12:45, 13 Nov 2026.</p></body></html>'.replace('731 902', '731902') }),
  codeOld: addMsg('Northwind Labs <no-reply@northwindlabs.com>', 'Your login code', { age: 2 * H }),
  jobs1: addMsg('ITviec Job Robot <jobrobot@itviec.com>', 'Data Engineer and 2 more jobs for you', { age: 2 * H, headers: LIST }),
  jobs2: addMsg('Totaljobs <jobalerts@totaljobs.com>', 'We found 10 new job matches for you', { age: 6 * H, headers: LIST }),
  jobs3: addMsg('Indeed <alert@indeed.com>', 'Junior analyst @ Contoso', { age: 10 * H }),
  bank: addMsg('Barclays <news@email.barclays.co.uk>', 'Your savings rate has increased', { age: 1 * H, headers: LIST }),
  shared: addMsg('Google <no-reply@accounts.google.com>', 'You shared some Google Account data with accountstore.example', { age: 1 * H }),
  created: addMsg('Account Store <no-reply@accountstore.example>', 'Your account has been created', { age: 1 * H }),
  permissions: addMsg('GitHub <noreply@github.com>', '[GitHub] An app is requesting updated permissions', { age: 40 * MIN }),
  newsletter: addMsg('Promptly AI <hello@promptly.example>', "Alex, there's a new project waiting for you", { age: 50 * MIN, headers: LIST }),
  adsense: addMsg('Google AdSense <adsense-noreply@google.com>', 'Action needed: your AdSense application', { age: 3 * D }),
  parcel: addMsg('Amazon Shipping UK <shipment-tracking@amazon.co.uk>', 'Your package was delivered', { age: 4 * D }),
  friend: addMsg('Sam Lee <sam.lee@gmail.com>', 'Coffee this weekend?', { age: 30 * MIN, labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'] }),
  coach: addMsg('Career Coach <hello@coachly.example>', 'Notes from our call', { age: 5 * H, headers: LIST }),
  oldJob: addMsg('Indeed <alert@indeed.com>', 'Developer @ Example Ltd', { age: 40 * D }),
  oldFriend: addMsg('Jo Park <jo.park@gmail.com>', 'Holiday photos', { age: 45 * D, labels: ['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'] }),
  starredJob: addMsg('Totaljobs <jobalerts@totaljobs.com>', 'Saved search: 3 new jobs', { age: 3 * H, headers: LIST, labels: ['INBOX', 'UNREAD', 'STARRED'] }),
  mySent: addMsg(`Alex Doe <${ME}>`, 'refund', { age: 4 * H, labels: ['SENT'] })
};

// ------------------------------------------------------------------ checks
let fails = 0;
const check = (name, cond, extra) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? '  → ' + extra : ''}`); if (!cond) fails++; };
const group = (id) => [...byId(id).labelIds].map(labelName).find((n) => n && n.startsWith('Sorted/'));
const has = (id, l) => byId(id).labelIds.has(l);
const L = (n) => labels.find((l) => l.name === n).id;
const getJson = (fresh) => JSON.parse(sandbox.doGet({ parameter: { format: 'json', fresh: fresh ? '1' : '0' } }).getContent());
const post = (body, type = 'application/json') => JSON.parse(sandbox.doPost({ postData: { type, contents: JSON.stringify(body) } }).getContent());

console.log('\n== setup()');
sandbox.setup();
check('9 group labels + parent', labels.filter((l) => l.name.startsWith('Sorted')).length === 10);
check('"take on a few tasks" → Applications', group(ids.tasks) === 'Sorted/Applications', group(ids.tasks));
check('login codes → Codes', group(ids.code) === 'Sorted/Codes' && group(ids.codeInBody) === 'Sorted/Codes');
check('account data shared, account created, app permissions → Security',
  ['shared', 'created', 'permissions'].every((k) => group(ids[k]) === 'Sorted/Security'), ['shared', 'created', 'permissions'].map((k) => group(ids[k])).join());
check('bank → Money', group(ids.bank) === 'Sorted/Money');
check('job boards → Job alerts', ['jobs1', 'jobs2', 'jobs3'].every((k) => group(ids[k]) === 'Sorted/Job alerts'));
check('friend → People', group(ids.friend) === 'Sorted/People');
check('old inbox mail (40-45 days) sorted', group(ids.oldJob) === 'Sorted/Job alerts' && group(ids.oldFriend) === 'Sorted/People');
check('own mail untouched', group(ids.mySent) === undefined);
check('northwindlabs.com remembered as a company you applied to', JSON.parse(props.APPLY_DOMAINS || '[]').some((x) => x.d === 'northwindlabs.com'));
const later = addMsg('Northwind Labs <careers@mail.northwindlabs.com>', 'A quick update on your process', { age: 1 * MIN, headers: LIST });
sandbox.sync();
check('later mail from that company → Applications', group(later) === 'Sorted/Applications', group(later));
const before = fetchCount; const idle = sandbox.sync();
check('idle sync sorts nothing', idle.sorted === 0, JSON.stringify(idle));
console.log(`  (idle sync: ${fetchCount - before} Gmail calls)`);

console.log('\n== data for the Chrome extension');
const res = getJson(true);
const blk = (r, k) => r.blocks.find((b) => b.key === k);
const inBlock = (r, k, id) => blk(r, k).items.some((it) => it.th === byId(id).threadId);
const item = (r, k, id) => blk(r, k).items.find((it) => it.th === byId(id).threadId);
check('5 blocks, English titles, in order', res.ok && res.blocks.map((b) => b.title).join() === 'People,Codes,Accounts,Google,Other', JSON.stringify(res).slice(0, 200));
check('says whose mail it is', res.me === ME);
check('settings come along (auto-clean off)', res.settings && res.settings.autoClean === false && res.settings.lastSync > 0, JSON.stringify(res.settings));
check('People: friend + company reply', inBlock(res, 'people', ids.friend) && inBlock(res, 'people', ids.tasks));
check('Codes: code taken from the preview text', item(res, 'codes', ids.code).code === '48291305', item(res, 'codes', ids.code).code);
check('Codes: code read from the mail body when the preview has none', item(res, 'codes', ids.codeInBody).code === '731902', item(res, 'codes', ids.codeInBody).code);
check('Accounts: data sharing, new account, app permissions', ['shared', 'created', 'permissions'].every((k) => inBlock(res, 'account', ids[k])));
check('Google: AdSense', inBlock(res, 'google', ids.adsense));
check('Other: job alerts, bank, parcel', inBlock(res, 'other', ids.jobs1) && inBlock(res, 'other', ids.bank) && inBlock(res, 'other', ids.parcel));
check('sent mail never shows', !res.blocks.some((b) => b.items.some((it) => it.th === byId(ids.mySent).threadId)));
check('newest first in each block', res.blocks.every((b) => b.items.every((it, i) => !i || b.items[i - 1].ts >= it.ts)));
check('unread counted', blk(res, 'people').unread >= 2, blk(res, 'people').unread);
check('block search opens the right labels', /label:sorted-people OR label:sorted-applications/.test(blk(res, 'people').search));
check('second call within a minute comes from cache', (() => { const n = fetchCount; getJson(false); return fetchCount === n; })());
const unsorted = addMsg('Lee Wong <lee.wong@gmail.com>', 'See you tomorrow', { age: 30 * 1000 });
const res2 = getJson(true);
check('mail not sorted yet still lands in the right block', inBlock(res2, 'people', unsorted));

console.log('\n== code finder');
const code = (s, snip) => sandbox.otpCode_(s, snip);
check('"Your code is G-123456"', code('Sign in', 'Your code is G-123456. Do not share it.') === 'G-123456', code('Sign in', 'Your code is G-123456.'));
check('"482913 is your code" in the subject', code('482913 is your Instagram code', '') === '482913');
check('skips a year and a time', sandbox.codeNearKeyword_('Your code, sent 2026 at 12:45: 553311') === '553311', sandbox.codeNearKeyword_('Your code, sent 2026 at 12:45: 553311'));
check('no code, no guess', code('Your order has shipped', 'Order 2026 is on its way') === '');

console.log('\n== phone page');
const html = sandbox.doGet({ parameter: {} }).getContent();
check('page is HTML with the data inside', /<html/i.test(html) && html.includes('"me":"' + ME + '"') && !/<\?/.test(html));
check('data cannot break out of the script tag', !/<\/script>[^]*"blocks"/.test(html.split('var PAYLOAD = ')[1].split('</script>')[0]));
check('page can refresh itself', sandbox.blocksForPage(true).ok === true);

console.log('\n== you move a mail in Gmail (Updates → People)');
check('coach mail was in Updates', group(ids.coach) === 'Sorted/Updates', group(ids.coach));
userModify(ids.coach, [L('Sorted/People')], [L('Sorted/Updates')]);
const s3 = sandbox.sync();
check('learned from the move', s3.learned === 1 && sandbox.getRules_().some((r) => r.pattern === 'hello@coachly.example'), JSON.stringify(s3));
const coach2 = addMsg('Career Coach <hello@coachly.example>', 'Next session', { age: 1 * MIN, headers: LIST });
sandbox.sync();
check('next mail from that sender → People', group(coach2) === 'Sorted/People', group(coach2));

console.log('\n== auto-clean (switched on from the extension settings)');
const bad = post({ action: 'settings', autoClean: true }, 'text/plain');
check('a plain form post is refused', bad.ok === false && has(ids.jobs1, 'INBOX'), JSON.stringify(bad));
const on = post({ action: 'settings', autoClean: true });
check('turning on answers with the count', on.ok && on.settings.autoClean === true && on.cleaned > 0, JSON.stringify(on));
check('job alerts left the inbox, still unread', !has(ids.jobs1, 'INBOX') && has(ids.jobs1, 'UNREAD'));
check('People / Applications / Security stay', has(ids.friend, 'INBOX') && has(ids.tasks, 'INBOX') && has(ids.shared, 'INBOX'));
check('fresh code (3 min) stays, old one (2 h) cleaned and read', has(ids.code, 'INBOX') && !has(ids.codeOld, 'INBOX') && !has(ids.codeOld, 'UNREAD'));
check('bank mail (1 h) stays: Money waits 3 days', has(ids.bank, 'INBOX'));
check('starred mail always stays', has(ids.starredJob, 'INBOX'));
check('nothing deleted', messages.every((m) => !m.labelIds.has('TRASH')));
check('blocks reflect the new setting', getJson(false).settings.autoClean === true);
const off = post({ action: 'settings', autoClean: false });
check('turning off', off.ok && off.settings.autoClean === false && props.AUTO_CLEAN === 'off');

console.log('\n== Gmail says "slow down"');
const burst = Array.from({ length: 30 }, (_, i) => addMsg('Shop ' + i + ' <news@shop' + i + '.example.com>', 'Sale ' + i, { age: (i + 1) * MIN, headers: LIST }));
let slow, threw = null;
throttle.after = 12;
try { slow = sandbox.sync(); } catch (e) { threw = e; }
check('a long pause from Gmail does not crash the run', !threw, threw && threw.message);
check('what was done is kept and reported as unfinished', slow && slow.slowedDown && slow.remaining && slow.sorted === 10, JSON.stringify(slow));
throttle.after = null;
const resumed = sandbox.sync();
check('next run finishes the rest', burst.every((id) => group(id) === 'Sorted/Updates') && !resumed.slowedDown, JSON.stringify(resumed));
const burst2 = Array.from({ length: 5 }, (_, i) => addMsg('Club ' + i + ' <hi@club' + i + '.example.com>', 'News ' + i, { age: (i + 1) * MIN, headers: LIST }));
throttle.fail = 3; throttle.hits = 0;
const brief = sandbox.sync();
check('a short "slow down" is waited out in the same run', throttle.hits === 3 && burst2.every((id) => group(id)) && !brief.slowedDown, JSON.stringify(brief));
throttle.after = 0;
const slowJson = getJson(true);
throttle.after = null;
check('extension gets a readable message instead of a crash', slowJson.ok === false && /slow down/.test(slowJson.error), JSON.stringify(slowJson));

console.log('\n== Gmail refuses to open one old mail ("Precondition check failed")');
const odd = addMsg('Old System <legacy@old.example.com>', 'Archived thing', { age: 400 * D });
const fine = [addMsg('Mai Do <mai.do@gmail.com>', 'Hello', { age: 2 * MIN }), addMsg('Shop X <news@shopx.example.com>', 'Deal', { age: 3 * MIN, headers: LIST })];
unreadable.add(odd);
let oddErr = null;
try { sandbox.sync(); } catch (e) { oddErr = e; }
check('run does not stop on that mail', !oddErr, oddErr && oddErr.message);
check('the other new mail is sorted', fine.every((id) => group(id)), fine.map(group).join());
sandbox.sync();
check('that mail is not asked for again on the next run', unreadableHits[odd] === 1, unreadableHits[odd]);
check('blocks still load', getJson(true).ok === true);

console.log(`\n${fails ? fails + ' FAILED' : 'all passed'}  (${fetchCount} fake Gmail calls)`);

if (process.argv.includes('--preview')) {
  const out = path.join(ROOT, 'preview');
  fs.mkdirSync(out, { recursive: true });
  const data = res2;
  fs.writeFileSync(path.join(out, 'blocks-data.json'), JSON.stringify(data, null, 1));
  // Apps Script adds the viewport tag itself (addMetaTag); the local copy needs it in the page.
  const phone = html.replace(/var PAYLOAD = [^\n]*;/, () => 'var PAYLOAD = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';')
    .replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
  fs.writeFileSync(path.join(out, 'phone.html'), phone);
  console.log('preview data written to preview/');
}
process.exit(fails ? 1 : 0);

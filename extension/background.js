// Talks to your Apps Script web app. Runs here (not in the Gmail page) so the
// request carries your Google sign-in and is not blocked by CORS.

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const answer = (p) => p.then(reply, (e) => reply({ ok: false, error: String((e && e.message) || e) }));
  if (!msg) return false;
  if (msg.type === 'blocks') { answer(withUrl((url) => getBlocks(url, !!msg.fresh))); return true; }
  if (msg.type === 'test') { answer(getBlocks(msg.url, true)); return true; }
  if (msg.type === 'settings') { answer(withUrl((url) => postJson(url, { action: 'settings', autoClean: msg.autoClean }))); return true; }
  if (msg.type === 'options') chrome.runtime.openOptionsPage();
  return false;
});

async function withUrl(fn) {
  const { url } = await chrome.storage.sync.get('url');
  if (!url) return { ok: false, setup: true };
  return fn(url);
}

function withParam(url, key, value) {
  return url + (url.includes('?') ? '&' : '?') + key + '=' + encodeURIComponent(value);
}

async function getBlocks(url, fresh) {
  const res = await fetch(withParam(withParam(url, 'format', 'json'), 'fresh', fresh ? 1 : 0),
    { credentials: 'include', redirect: 'follow', cache: 'no-store' });
  const data = await readJson(res, url);
  if (data && data.ok) await chrome.storage.local.set({ blocks: data });
  return data;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return readJson(res, url);
}

async function readJson(res, url) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    // Google sent a sign-in or permission page instead of data.
    return { ok: false, signin: true, url };
  }
}

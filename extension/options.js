const $ = (id) => document.getElementById(id);
let saved = '';

function say(el, text, kind) {
  $(el).textContent = text;
  $(el).className = 'msg' + (kind ? ' ' + kind : '');
}

function showConnected(me) {
  $('badge').hidden = !me;
  $('badge').textContent = me ? 'Connected · ' + me : '';
  $('clear').hidden = !me;
  $('toggle').disabled = !me;
  $('copy-link').disabled = !me;
}

function showAutoClean(on) {
  $('toggle').setAttribute('aria-checked', String(!!on));
}

(async () => {
  const { url } = await chrome.storage.sync.get('url');
  const { blocks } = await chrome.storage.local.get('blocks');
  if (url) {
    saved = url;
    $('url').value = url;
  }
  if (url && blocks && blocks.ok) {
    showConnected(blocks.me);
    showAutoClean(blocks.settings && blocks.settings.autoClean);
  }
})();

$('save').addEventListener('click', async () => {
  const url = $('url').value.trim();
  if (!/^https:\/\/script\.google\.com\/.+\/exec(\?.*)?$/.test(url)) {
    say('msg', 'That is not a web app URL. It looks like https://script.google.com/macros/s/…/exec', 'bad');
    return;
  }
  $('save').disabled = true;
  say('msg', 'Testing…');
  const res = await chrome.runtime.sendMessage({ type: 'test', url });
  $('save').disabled = false;
  if (res && res.ok) {
    await chrome.storage.sync.set({ url });
    saved = url;
    const n = res.blocks.reduce((a, b) => a + b.count, 0);
    showConnected(res.me);
    showAutoClean(res.settings && res.settings.autoClean);
    say('msg', 'Connected. ' + n + ' conversations in your inbox are sorted. Reload Gmail to see the blocks.', 'ok');
  } else if (res && res.signin) {
    await chrome.storage.sync.set({ url });
    saved = url;
    say('msg', 'Google needs your OK once. In the tab that just opened, allow access, then press Save and test again.', 'bad');
    window.open(url, '_blank');
  } else {
    say('msg', "Couldn't connect: " + ((res && res.error) || 'unknown error'), 'bad');
  }
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.sync.remove('url');
  await chrome.storage.local.remove('blocks');
  $('url').value = '';
  saved = '';
  showConnected('');
  showAutoClean(false);
  say('msg', 'Disconnected. Gmail looks as usual again.');
});

$('toggle').addEventListener('click', () => {
  const on = $('toggle').getAttribute('aria-checked') === 'true';
  if (on) setAutoClean(false);
  else { $('confirm').hidden = false; say('auto-msg', ''); }
});
$('confirm-no').addEventListener('click', () => { $('confirm').hidden = true; });
$('confirm-yes').addEventListener('click', () => { $('confirm').hidden = true; setAutoClean(true); });

async function setAutoClean(on) {
  $('toggle').disabled = true;
  showAutoClean(on);
  say('auto-msg', on ? 'Cleaning…' : 'Saving…');
  const res = await chrome.runtime.sendMessage({ type: 'settings', autoClean: on });
  $('toggle').disabled = false;
  if (res && res.ok) {
    showAutoClean(res.settings.autoClean);
    say('auto-msg', on
      ? 'On. ' + res.cleaned + ' messages left your inbox. New automated mail follows within 10 minutes.'
      : 'Off. Mail stays in your inbox; it is still labelled.', 'ok');
  } else {
    showAutoClean(!on);
    say('auto-msg', "Couldn't save: " + ((res && (res.error || (res.signin && 'Google needs your OK, press Save and test above.'))) || 'unknown error'), 'bad');
  }
}

// Animations: follow the system setting, or always on.
$('motion-note').hidden = !matchMedia('(prefers-reduced-motion: reduce)').matches;
chrome.storage.sync.get('motion').then(({ motion }) => {
  $('motion').setAttribute('aria-checked', String(motion === 'on'));
});
$('motion').addEventListener('click', async () => {
  const on = $('motion').getAttribute('aria-checked') !== 'true';
  $('motion').setAttribute('aria-checked', String(on));
  await chrome.storage.sync.set({ motion: on ? 'on' : 'system' });
});

$('copy-link').addEventListener('click', async () => {
  if (!saved) return;
  await navigator.clipboard.writeText(saved);
  $('copy-link').textContent = 'Copied: open it on your phone';
  setTimeout(() => { $('copy-link').textContent = 'Copy phone link'; }, 2200);
});

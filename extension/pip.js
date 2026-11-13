// Pip, the inbox buddy: a cute take on the Gmail "M" that sits in the corner of
// the blocks and reacts to what happens (new mail, loading, alerts, copied codes)
// and, now and then, to nothing at all. Loaded before content.js.
// Note: the Gmail logo is a Google trademark; this drawing is a fan-made riff on it.
(() => {
  if (globalThis.__inboxPip) return;

  const MARKUP = `
<button class="pip-btn" data-act="pip" aria-label="Pip, your inbox buddy. Click for a summary.">
<svg class="pip" viewBox="0 0 48 46" width="42" height="40" aria-hidden="true" data-mood="idle">
  <g class="p-all">
    <ellipse class="p-shadow" cx="24" cy="43.2" rx="12" ry="1.8"/>
    <g class="p-spark">
      <path d="M7 9l.9 2.2 2.2.9-2.2.9-.9 2.2-.9-2.2-2.2-.9 2.2-.9z"/>
      <path d="M42 5l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z"/>
      <path d="M44 20l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>
    </g>
    <g class="p-zz"><text x="37" y="12">z</text><text x="42" y="6">z</text></g>
    <g class="p-dots"><circle cx="35" cy="9" r="1.4"/><circle cx="39.5" cy="9" r="1.4"/><circle cx="44" cy="9" r="1.4"/></g>
    <g class="p-body">
      <g class="p-letter"><rect x="13" y="7" width="22" height="16" rx="2"/><path d="M17 12h14 M17 16h9"/></g>
      <rect class="p-env" x="4.5" y="10" width="39" height="31" rx="9"/>
      <path class="p-leg l" d="M10.5 15.5 V35.5"/>
      <path class="p-leg r" d="M37.5 15.5 V35.5"/>
      <g class="p-flap">
        <path class="p-v" d="M10.5 15.5 L24 25 L37.5 15.5"/>
        <path class="p-v-dark" d="M10.5 15.5 L15.5 19"/>
        <path class="p-v-gold" d="M32.5 19 L37.5 15.5"/>
      </g>
      <circle class="p-stamp" cx="41.5" cy="10.5" r="3.4"/>
      <g class="p-face">
        <g class="p-eyes">
          <ellipse class="p-eye l" cx="19.6" cy="31.6" rx="1.9" ry="2.4"/>
          <ellipse class="p-eye r" cx="28.4" cy="31.6" rx="1.9" ry="2.4"/>
        </g>
        <path class="p-happy" d="M17.6 32.4 q2 -2.8 4 0 M26.4 32.4 q2 -2.8 4 0"/>
        <path class="p-closed" d="M17.8 31.9 h3.6 M26.6 31.9 h3.6"/>
        <path class="p-wink" d="M26.4 32.2 q2 -2.3 4 0"/>
        <path class="p-brows" d="M17.6 28.6 l3.4 1 M30.4 28.6 l-3.4 1"/>
        <circle class="p-cheek" cx="16.6" cy="35" r="1.8"/><circle class="p-cheek" cx="31.4" cy="35" r="1.8"/>
        <path class="p-mouth smile" d="M22.2 35.4 q1.8 1.9 3.6 0"/>
        <path class="p-mouth frown" d="M22.2 36.6 q1.8 -1.6 3.6 0"/>
        <ellipse class="p-mouth oh" cx="24" cy="36" rx="1.3" ry="1.6"/>
        <path class="p-mouth flat" d="M22.6 36 h2.8"/>
      </g>
    </g>
  </g>
</svg>
</button>
<div class="pip-bubble" role="status" aria-live="polite"></div>`;

  const CSS = `
.pip-slot{position:absolute;left:12px;top:3px;z-index:4}
.pip-btn{display:block;width:46px;height:44px;padding:2px;margin:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer;border-radius:14px;transition:background .2s}
.pip-btn:hover{background:var(--hover)}
.pip{display:block;overflow:visible;
  --pip-body:#ffffff;--pip-edge:rgba(60,64,67,.16);--pip-line:#5f6368;--pip-eye:#202124;--pip-letter:#ffffff;--pip-ink:#4285f4;
  --g-blue:#4285f4;--g-red:#ea4335;--g-red-dark:#c5221f;--g-yellow:#fbbc04;--g-green:#34a853;
  --pip-red:#ea4335;--pip-amber:#fbbc04;--pip-blue:#4285f4;--pip-cheek:#f28b82}
.dark .pip{--pip-body:#f8f9fa;--pip-edge:rgba(0,0,0,.4);--pip-line:#c4c7c5;--pip-letter:#e8eaed}
.pip *{transform-box:view-box}
.pip .p-all{transform-origin:24px 42px}
.pip .p-body{transform-origin:24px 41px;animation:p-breathe 3.6s ease-in-out infinite}
.p-shadow{fill:currentColor;color:var(--pip-line);opacity:.16}
.p-env{fill:var(--pip-body);stroke:var(--pip-edge);stroke-width:1}
.p-leg,.p-flap path{fill:none;stroke-width:6.2;stroke-linecap:round;stroke-linejoin:round}
.p-leg.l{stroke:var(--g-blue)}
.p-leg.r{stroke:var(--g-green)}
.p-v{stroke:var(--g-red)}
.p-v-dark{stroke:var(--g-red-dark)}
.p-v-gold{stroke:var(--g-yellow)}
.p-flap{transform-origin:24px 15.5px;transition:transform .4s cubic-bezier(.3,1.6,.5,1)}
.p-letter rect{fill:var(--pip-letter);stroke:var(--pip-edge);stroke-width:1}
.p-letter path{fill:none;stroke:var(--pip-ink);stroke-width:1.5;stroke-linecap:round}
.p-letter{transform:translateY(10px);transition:transform .45s cubic-bezier(.3,1.5,.5,1) .1s}
.p-stamp{fill:var(--stamp,transparent);transform-box:fill-box;transform-origin:center;transition:fill .4s}
.p-eye{fill:var(--pip-eye);transform-box:fill-box;transform-origin:center;transition:transform .09s}
.p-eyes{transform:translate(var(--ex,0px),var(--ey,0px));transition:transform .22s ease-out}
.p-happy,.p-closed,.p-wink,.p-brows,.p-mouth{fill:none;stroke:var(--pip-eye);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.p-mouth.oh{fill:var(--pip-eye);stroke:none}
.p-cheek{fill:var(--pip-cheek);opacity:.35}
.p-eye,.p-cheek,.p-stamp,.p-shadow,.p-spark path,.p-dots circle,.p-zz text{stroke:none}
.p-happy,.p-closed,.p-wink,.p-brows,.p-mouth.frown,.p-mouth.oh,.p-mouth.flat,.p-zz,.p-dots,.p-spark{display:none}
.p-zz text{font:700 7px "Google Sans",Arial,sans-serif;fill:var(--pip-line)}
.p-dots circle{fill:var(--pip-line)}
.p-spark path{fill:var(--pip-amber)}

/* moods */
.pip[data-mood="happy"] .p-eyes{display:none}
.pip[data-mood="happy"] .p-happy{display:inline}
.pip[data-mood="happy"] .p-cheek{opacity:.6}
.pip[data-mood="sleep"] .p-eyes,.pip[data-mood="sleep"] .p-mouth.smile{display:none}
.pip[data-mood="sleep"] .p-closed,.pip[data-mood="sleep"] .p-mouth.flat,.pip[data-mood="sleep"] .p-zz{display:inline}
.pip[data-mood="sleep"] .p-body{animation-duration:5.5s}
.pip[data-mood="sleep"] .p-zz text{animation:p-z 2.8s ease-in infinite}
.pip[data-mood="sleep"] .p-zz text+text{animation-delay:1.4s}
.pip[data-mood="wink"] .p-eye.r{display:none}
.pip[data-mood="wink"] .p-wink{display:inline}
.pip[data-mood="thinking"] .p-eyes{--ey:-1.4px;--ex:1.2px}
.pip[data-mood="thinking"] .p-mouth.smile{display:none}
.pip[data-mood="thinking"] .p-mouth.flat,.pip[data-mood="thinking"] .p-dots{display:inline}
.pip[data-mood="thinking"] .p-dots circle{animation:p-dot 1s ease-in-out infinite}
.pip[data-mood="thinking"] .p-dots circle:nth-child(2){animation-delay:.15s}
.pip[data-mood="thinking"] .p-dots circle:nth-child(3){animation-delay:.3s}
.pip[data-mood="alert"] .p-eye{transform:scale(1.18)}
.pip[data-mood="alert"] .p-mouth.smile{display:none}
.pip[data-mood="alert"] .p-mouth.oh{display:inline}
.pip[data-mood="alert"] .p-stamp{animation:p-pulse 1.6s ease-in-out infinite}
.pip[data-mood="sad"] .p-eye{transform:scale(.85)}
.pip[data-mood="sad"] .p-brows,.pip[data-mood="sad"] .p-mouth.frown{display:inline}
.pip[data-mood="sad"] .p-mouth.smile,.pip[data-mood="sad"] .p-cheek{display:none}

/* one-off moves */
.pip.blink .p-eye{transform:scaleY(.1)}
.pip.open .p-flap{transform:translateY(-6px) scaleY(.45)}
.pip.open .p-letter{transform:translateY(-3px)}
.pip.hop .p-all{animation:p-hop .65s cubic-bezier(.3,.7,.4,1)}
.pip.wiggle .p-all{animation:p-wiggle .7s ease-in-out}
.pip.spin .p-all{transform-origin:24px 28px;animation:p-spin .8s cubic-bezier(.5,0,.3,1)}
.pip.shake .p-all{animation:p-shake .5s ease-in-out}
.pip.stretch .p-all{animation:p-stretch .7s cubic-bezier(.3,.7,.4,1)}
.pip.sparkle .p-spark{display:inline}
.pip.sparkle .p-spark path{transform-box:fill-box;transform-origin:center;animation:p-spark .9s ease-out both}
.pip.sparkle .p-spark path:nth-child(2){animation-delay:.12s}
.pip.sparkle .p-spark path:nth-child(3){animation-delay:.24s}
@keyframes p-breathe{50%{transform:scale(1.015,1.03)}}
@keyframes p-hop{0%{transform:none}30%{transform:translateY(-7px) scale(.97,1.05)}55%{transform:translateY(0) scale(1.06,.93)}75%{transform:translateY(-2px)}100%{transform:none}}
@keyframes p-wiggle{20%{transform:rotate(-9deg)}45%{transform:rotate(8deg)}70%{transform:rotate(-4deg)}100%{transform:none}}
@keyframes p-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes p-shake{20%,60%{transform:translateX(-2px)}40%,80%{transform:translateX(2px)}100%{transform:none}}
@keyframes p-stretch{40%{transform:scale(.93,1.12)}70%{transform:scale(1.04,.96)}100%{transform:none}}
@keyframes p-spark{0%{opacity:0;transform:scale(.2)}40%{opacity:1;transform:scale(1.2)}100%{opacity:0;transform:scale(.6) rotate(45deg)}}
@keyframes p-z{0%{opacity:0;transform:translate(0,4px)}30%{opacity:1}100%{opacity:0;transform:translate(3px,-6px)}}
@keyframes p-dot{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-2.5px);opacity:1}}
@keyframes p-pulse{50%{transform:scale(1.35)}}

/* speech bubble */
.pip-bubble{position:absolute;left:52px;top:7px;white-space:nowrap;padding:6px 12px;border-radius:14px;border-top-left-radius:4px;
  background:var(--card);border:1px solid var(--line-2);box-shadow:var(--shadow-up);font-size:13px;line-height:18px;color:var(--t1);
  opacity:0;transform:translateX(-6px) scale(.96);transform-origin:left center;pointer-events:none;
  transition:opacity .2s,transform .3s var(--ease)}
.pip-bubble.show{opacity:1;transform:none}
/* Reduced motion: no hops or spins, but Pip still blinks and changes face. "Always animate" (.motion-on) overrides. */
@media (prefers-reduced-motion:reduce){.wrap:not(.motion-on) .pip *{animation:none !important}}
`;

  globalThis.__inboxPip = function createPip() {
    let svg = null;
    let bubble = null;
    let base = 'idle';
    let temp = '';
    let tempTimer = 0;
    let bubbleTimer = 0;
    let loading = false;
    let asleep = false;
    let lastActive = Date.now();
    let alertKey = '';
    let greeted = false;
    let info = { people: 0, account: 0, codes: 0 };
    let raf = 0;

    let forceMotion = false;
    const reduce = () => !forceMotion && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const alive = () => !!(svg && svg.isConnected);
    const rand = (a, b) => a + Math.random() * (b - a);

    function mount(slot) {
      slot.innerHTML = MARKUP;
      svg = slot.querySelector('.pip');
      bubble = slot.querySelector('.pip-bubble');
      paint();
    }

    function paint() {
      if (!alive()) return;
      svg.dataset.mood = temp || (asleep ? 'sleep' : loading ? 'thinking' : base);
      svg.style.setProperty('--stamp', info.account ? 'var(--pip-red)' : info.codes ? 'var(--pip-amber)' : info.people ? 'var(--pip-blue)' : 'transparent');
    }

    function mood(m, ms) {
      temp = m;
      clearTimeout(tempTimer);
      if (ms) tempTimer = setTimeout(() => { temp = ''; paint(); }, ms);
      paint();
    }

    function act(name, ms, always) {
      if (!alive() || (reduce() && !always)) return;
      svg.classList.remove(name);
      void svg.getBoundingClientRect(); // restart the animation
      svg.classList.add(name);
      setTimeout(() => { if (svg) svg.classList.remove(name); }, ms);
    }

    function say(text, ms) {
      if (!bubble) return;
      bubble.textContent = text;
      bubble.classList.add('show');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => bubble && bubble.classList.remove('show'), ms || 2800);
    }

    function summary() {
      const parts = [];
      if (info.people) parts.push(info.people + ' from people');
      if (info.codes) parts.push(info.codes + (info.codes === 1 ? ' fresh code' : ' fresh codes'));
      if (info.account) parts.push(info.account + (info.account === 1 ? ' account alert' : ' account alerts'));
      return parts.length ? parts.join(' · ') : 'All calm. Nothing needs you.';
    }

    function wake() {
      lastActive = Date.now();
      if (!asleep) return;
      asleep = false;
      act('stretch', 700);
      mood('happy', 900);
    }

    // ---- life: blinking, idle moves, sleep, eyes that follow the pointer
    (function blinkLoop() {
      setTimeout(() => {
        if (alive() && !asleep && !document.hidden) {
          act('blink', 130, true);
          if (Math.random() < 0.2) setTimeout(() => act('blink', 120, true), 260);
        }
        blinkLoop();
      }, rand(2400, 6000));
    })();

    (function idleLoop() {
      setTimeout(() => {
        if (alive() && !asleep && !loading && !temp && !document.hidden && !reduce()) {
          if (base === 'alert') {
            act('shake', 500);
          } else {
            const r = Math.random();
            if (r < 0.32) look(Math.random() < 0.5 ? -1 : 1);
            else if (r < 0.47) peek();
            else if (r < 0.62) act('hop', 650);
            else if (r < 0.77) act('wiggle', 700);
            else if (r < 0.92) act('stretch', 700);
            else { act('spin', 800); mood('happy', 900); }
          }
        }
        idleLoop();
      }, rand(8000, 17000));
    })();

    setInterval(() => {
      if (!asleep && !loading && base !== 'alert' && Date.now() - lastActive > 90 * 1000) {
        asleep = true;
        paint();
      }
    }, 10 * 1000);

    function look(dir) {
      if (!alive()) return;
      svg.style.setProperty('--ex', dir * 1.8 + 'px');
      setTimeout(() => { if (svg) svg.style.setProperty('--ex', '0px'); }, 1100);
    }

    function peek() {
      act('open', 1000);
    }

    ['keydown', 'mousedown', 'wheel'].forEach((t) => document.addEventListener(t, wake, { passive: true, capture: true }));
    document.addEventListener('mousemove', (e) => {
      lastActive = Date.now();
      if (asleep) wake();
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!alive() || temp === 'thinking' || loading) return;
        const r = svg.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const far = Math.hypot(dx, dy) > 700;
        svg.style.setProperty('--ex', far ? '0px' : Math.max(-1.8, Math.min(1.8, dx / 60)).toFixed(2) + 'px');
        svg.style.setProperty('--ey', far ? '0px' : Math.max(-1.2, Math.min(1.4, dy / 80)).toFixed(2) + 'px');
      });
    }, { passive: true });

    // ---- what the blocks tell Pip
    return {
      css: CSS,
      mount,

      setMotion(on) {
        forceMotion = !!on;
      },

      update(next) {
        info = next;
        const key = info.account ? String(info.account) : '';
        if (key && key !== alertKey) {
          base = 'alert';
          wake();
          act('shake', 500);
          if (greeted) say(info.account === 1 ? 'An account alert needs a look' : info.account + ' account alerts need a look', 3200);
        } else if (!key && base === 'alert') {
          base = 'idle';
        }
        alertKey = key;
        paint();
      },

      loading(on) {
        loading = on;
        paint();
      },

      delivered(n, from) {
        wake();
        mood('happy', 2000);
        act('open', 1900);
        act('sparkle', 1300);
        setTimeout(() => act('hop', 650), 150);
        say(n === 1 ? 'New: ' + from : n + ' new messages', 2800);
      },

      greet() {
        if (greeted) return;
        greeted = true;
        act('hop', 650);
        mood('happy', 1200);
        if (info.people || info.account || info.codes) say(summary(), 3200);
      },

      failed() {
        base = 'sad';
        act('shake', 500);
        paint();
      },

      ok() {
        if (base === 'sad') base = info.account ? 'alert' : 'idle';
        paint();
      },

      copied() {
        wake();
        mood('wink', 1200);
        act('hop', 650);
      },

      poke() {
        wake();
        const moves = ['spin', 'hop', 'wiggle', 'stretch'];
        const m = moves[Math.floor(Math.random() * moves.length)];
        act(m, 800);
        if (m === 'hop') act('open', 900);
        mood(info.account ? 'alert' : 'happy', 1300);
        say(summary(), 3000);
      }
    };
  };
})();

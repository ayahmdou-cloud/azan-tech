/* شريط "عم يشتغل هلأ" — إيقاف + علّي + وطّي. بيشتغل بكل الصفحات */
(function () {
  'use strict';
  const bar = document.createElement('div');
  bar.className = 'playing';
  bar.hidden = true;
  bar.innerHTML =
    '<span class="ttl"></span>' +
    '<button class="round" data-d="-0.1" aria-label="وطّي">−</button>' +
    '<span class="vol"></span>' +
    '<button class="round" data-d="0.1" aria-label="علّي">+</button>' +
    '<button class="round stop" aria-label="إيقاف">■</button>';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(bar));
  if (document.readyState !== 'loading') document.body.appendChild(bar);

  const ttl = bar.querySelector('.ttl');
  const vol = bar.querySelector('.vol');
  const btns = bar.querySelectorAll('[data-d]');
  const stop = bar.querySelector('.stop');
  let polling = null;

  const post = async (url, body) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json();
  const pct = (v) => (v == null ? '' : Math.round(v * 100) + '%');

  function show(np, level) {
    bar.hidden = !np;
    document.body.classList.toggle('has-player', !!np);
    if (!np) { stopPoll(); return; }
    ttl.textContent = np.title + (np.screenOnly ? '' : '  🔊');
    vol.textContent = pct(level != null ? level : np.volume);
    btns.forEach((b) => { b.hidden = !!np.screenOnly; });
    vol.hidden = !!np.screenOnly;
    startPoll();
  }

  btns.forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await post('/api/volume', { delta: Number(b.dataset.d) });
        if (r.level != null) { vol.textContent = pct(r.level); vol.classList.remove('flash'); void vol.offsetWidth; vol.classList.add('flash'); }
      } catch (e) { /* */ }
      b.disabled = false;
    };
  });
  stop.onclick = async () => {
    stop.disabled = true;
    ttl.textContent = 'عم وقّف…';
    try { await post('/api/stop'); } catch (e) { /* */ }
    stop.disabled = false;
    show(null);
    if (window.onPlayerStopped) window.onPlayerStopped();
  };

  async function poll() {
    try { const s = await (await fetch('/api/state', { cache: 'no-store' })).json(); show(s.nowPlaying, s.activeVolume); } catch (e) { /* */ }
  }
  function startPoll() { if (!polling) polling = setInterval(poll, 2000); }
  function stopPoll() { clearInterval(polling); polling = null; }

  window.Player = { show, poll };
})();

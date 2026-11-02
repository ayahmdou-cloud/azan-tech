/* أذان تيك — البطاقات (أول تشغيل) والإعدادات: نفس الأقسام بشكلين */
(function () {
  'use strict';
  const A = window.AzanTech;
  const MODE = document.body.dataset.mode; // 'setup' | 'settings'
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = (t) => { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2800); };
  const hm = (d) => d ? new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
  const NAMES = A.NAMES, ALL6 = ['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
  const MODES = ['أذان كامل', 'تكبيرة', 'إشعار', 'صامت'];
  const st = () => A.S;
  const save = () => A.save();
  const ui = { mosques: [], mosqueSrc: '', openP: null, openO: null, checks: null, locating: false };

  const fmtKm = (m) => m < 1000 ? Math.round(m) + ' م' : (m / 1000).toFixed(1).replace('.', ',') + ' كم';
  const fmtMin = (s) => { const m = Math.round(s / 60); return m < 60 ? m + ' د' : Math.floor(m / 60) + ' س ' + (m % 60) + ' د'; };
  const libOpts = (kinds, sel, none) => (none ? `<option value="" ${!sel ? 'selected' : ''}>${none}</option>` : '') +
    A.lib().filter((a) => kinds.includes(a.kind)).map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} · ${a.src}</option>`).join('') +
    `<option value="__up:${kinds[0]}">⬆ أرفع ملفاً من جهازي…</option>`;
  const sw = (attr, on) => `<label class="sw"><input type="checkbox" ${attr} ${on ? 'checked' : ''}><span></span></label>`;

  // اختيار ملف صوتي ← المكتبة
  function pickFile(kind, then) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try { const id = await A.putAudio(f, kind); toast('انحفظ بالمكتبة ✓'); then && then(id); redo(); }
      catch (e) { toast('ما قدرت احفظ الملف'); }
    };
    inp.click();
  }

  // ---------------- الموقع ----------------
  function locate() {
    return new Promise((res) => {
      if (!navigator.geolocation) return res({ error: 'هالجهاز ما بيعطي الموقع' });
      let best = null, done = false;
      const finish = () => { if (done) return; done = true; navigator.geolocation.clearWatch(w); res(best || { error: 'ما وصل الموقع — اسمح بالموقع للمتصفح وجرّب مرة تانية' }); };
      // منستنى شوي حتى تتحسّن الدقّة (GPS)
      const w = navigator.geolocation.watchPosition((p) => {
        if (!best || p.coords.accuracy < best.accuracy) best = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
        if (best.accuracy <= 25) finish();
      }, (e) => { if (!best) { done = true; res({ error: e.code === 1 ? 'رفضت إذن الموقع — فعّله من إعدادات المتصفح' : 'ما وصل الموقع' }); } },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      setTimeout(finish, 12000);
    });
  }
  async function setPlace(p, how) {
    const S = st();
    S.pos = { lat: p.lat, lng: p.lng }; S.accuracy = p.accuracy || null; S.how = how;
    ui.mosques = []; ui.mosqueSrc = '';
    if (p.city) { S.city = p.city; S.country = p.country || ''; }
    else { const r = await A.reverse(S.pos); if (r) { S.city = r.city; S.country = r.country; } }
    save(); redo();
  }

  // ---------------- المساجد ----------------
  async function loadMosques() {
    const S = st(); if (!S.pos) return;
    ui.mosqueSrc = 'loading'; redo();
    const r = await A.findMosques(S.pos);
    const list = r.list.map((m) => ({ ...m, km: PT.km(S.pos.lat, S.pos.lng, m.lat, m.lng) })).sort((a, b) => a.km - b.km).slice(0, 15);
    ui.mosques = list; ui.mosqueSrc = r.src; redo();
    if (list.length) {
      ui.roadLoading = true; redo();
      await A.roadTimes(S.pos, list);
      list.sort((a, b) => (a.road ?? a.km * 1000) - (b.road ?? b.km * 1000));
      ui.roadLoading = false; redo();
    }
  }
  function pickMosque(i) {
    const S = st(), m = ui.mosques[i];
    S.mosque = { name: m.name, addr: m.addr, lat: m.lat, lng: m.lng, slug: m.slug || '', src: m.src, jumua: m.jumua || '', times: m.times || null, iqama: m.iqama || null, timesDate: m.times ? A.ymd(new Date()) : '' };
    S.calc = null; save();
    toast(m.src === 'osm' ? 'هالمسجد مش على Mawaqit — المواقيت بتنحسب لموقعه' : 'تم: ' + m.name);
    redo();
  }
  const gmaps = (m) => `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
  const geoUri = (m) => `geo:${m.lat},${m.lng}?q=${m.lat},${m.lng}(${encodeURIComponent(m.name)})`;

  let map = null;
  function drawMap() {
    const el = $('map'); const S = st();
    if (!el || !S.pos) return;
    if (map) { map.remove(); map = null; }
    if (typeof L === 'undefined') { el.innerHTML = '<div class="fallback">الخريطة ما تحمّلت</div>'; return; }
    map = L.map(el, { zoomControl: true, attributionControl: true }).setView([S.pos.lat, S.pos.lng], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap © CARTO' }).addTo(map);
    if (S.accuracy) L.circle([S.pos.lat, S.pos.lng], { radius: S.accuracy, color: '#4a90e2', weight: 1, fillOpacity: .12 }).addTo(map);
    L.marker([S.pos.lat, S.pos.lng], { icon: L.divIcon({ className: 'me-pin', iconSize: [16, 16] }) }).addTo(map).bindTooltip('أنت');
    const pts = [[S.pos.lat, S.pos.lng]];
    ui.mosques.forEach((m, i) => {
      const on = S.mosque && S.mosque.lat === m.lat && S.mosque.lng === m.lng;
      const d = m.road != null ? fmtKm(m.road) + (m.drive != null ? ' · 🚗 ' + fmtMin(m.drive) : '') : m.km.toFixed(1) + ' كم';
      L.marker([m.lat, m.lng], { icon: L.divIcon({ className: 'mq-pin' + (on ? ' on' : ''), iconSize: on ? [20, 20] : [14, 14] }) }).addTo(map)
        .bindPopup(`<b>${esc(m.name)}</b><br>${d}<br><a href="${gmaps(m)}" target="_blank" rel="noopener">🧭 خذني</a>`).on('click', () => {});
      if (i < 8) pts.push([m.lat, m.lng]);
    });
    if (pts.length > 1) map.fitBounds(pts, { padding: [28, 28], maxZoom: 15 });
  }

  // ---------------- صفحة حساب المواقيت ----------------
  function openCalc() {
    const S = st();
    const base = S.calc || { method: PT.BY_COUNTRY[S.country] || 'mwl', asr: S.asr || 1, high: 'angle', offsets: [0, 0, 0, 0, 0], hijri: 0, lat: (S.pos || {}).lat || 48.6921, lng: (S.pos || {}).lng || 6.1844, city: S.city };
    const c = JSON.parse(JSON.stringify(base));
    const s = $('sheet');
    s.innerHTML = `<div class="panel" role="dialog" aria-label="حساب المواقيت">
      <div class="row"><h2 class="grow">حساب المواقيت</h2><button class="ghost sm" data-x>✕</button></div>
      <p class="lead">إذا مسجدك مش موجود، منحسب المواقيت لموقعك بالطريقة المعتمدة ببلدك.</p>
      <label class="field">المدينة<div class="row"><input type="text" id="cCity" value="${esc(c.city)}" class="grow"><button class="sm" id="cFind">🔎</button><button class="sm" id="cGps">📍</button></div></label>
      <div class="row"><label class="field grow">خط العرض<input type="number" step="0.0001" id="cLat" value="${(+c.lat).toFixed(4)}"></label><label class="field grow">خط الطول<input type="number" step="0.0001" id="cLng" value="${(+c.lng).toFixed(4)}"></label></div>
      <label class="field">طريقة الحساب<select id="cMethod">${Object.entries(PT.METHODS).map(([k, v]) => `<option value="${k}" ${k === c.method ? 'selected' : ''}>${v.name}${k === (PT.BY_COUNTRY[S.country] || 'mwl') ? ' — المقترحة لبلدك' : ''}</option>`).join('')}</select></label>
      <div class="field">وقت العصر<div class="chips"><button class="chip ${c.asr === 1 ? 'on' : ''}" data-asr="1">الجمهور (الشافعي والمالكي والحنبلي)</button><button class="chip ${c.asr === 2 ? 'on' : ''}" data-asr="2">الحنفي</button></div></div>
      <label class="field">خطوط العرض العالية (مهمّة بأوروبا بالصيف)<select id="cHigh">${Object.entries(PT.HIGH).map(([k, v]) => `<option value="${k}" ${k === c.high ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="field">تعديل يدوي بالدقائق<div class="grid5">${NAMES.map((n, i) => `<label style="display:grid;gap:2px;text-align:center">${n}<input type="number" step="1" data-off="${i}" value="${c.offsets[i]}"></label>`).join('')}</div></div>
      <label class="field">تعديل التاريخ الهجري<select id="cHij">${[-2, -1, 0, 1, 2].map((v) => `<option value="${v}" ${v === c.hijri ? 'selected' : ''}>${v > 0 ? '+' + v : v} يوم</option>`).join('')}</select></label>
      <div class="field">مواقيت اليوم بهالإعدادات<div class="tgrid" id="cPrev"></div></div>
      <button class="primary" data-ok>اعتمد الحساب</button>
    </div>`;
    s.hidden = false;
    const prev = () => {
      const t = PT.compute(new Date(), c);
      $('cPrev').innerHTML = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k, i) => `<div>${ALL6[i]}<b>${hm(t[k])}</b></div>`).join('');
    };
    prev();
    s.querySelector('[data-x]').onclick = () => { s.hidden = true; };
    s.onclick = (e) => { if (e.target === s) s.hidden = true; };
    $('cMethod').onchange = () => { c.method = $('cMethod').value; prev(); };
    $('cHigh').onchange = () => { c.high = $('cHigh').value; prev(); };
    $('cHij').onchange = () => { c.hijri = +$('cHij').value; };
    $('cLat').onchange = () => { c.lat = +$('cLat').value; prev(); };
    $('cLng').onchange = () => { c.lng = +$('cLng').value; prev(); };
    s.querySelectorAll('[data-asr]').forEach((b) => b.onclick = () => { c.asr = +b.dataset.asr; s.querySelectorAll('[data-asr]').forEach((x) => x.classList.toggle('on', x === b)); prev(); });
    s.querySelectorAll('[data-off]').forEach((inp) => inp.onchange = () => { c.offsets[+inp.dataset.off] = parseInt(inp.value || '0', 10) || 0; prev(); });
    $('cFind').onclick = async () => {
      const g = await A.geocode($('cCity').value.trim());
      if (!g) return toast('ما لقيت المدينة — اكتب الإحداثيات');
      Object.assign(c, { lat: g.lat, lng: g.lng, city: g.city, method: PT.BY_COUNTRY[g.country] || c.method });
      $('cLat').value = g.lat.toFixed(4); $('cLng').value = g.lng.toFixed(4); $('cMethod').value = c.method; prev();
    };
    $('cGps').onclick = async () => {
      toast('عم حدّد موقعك…'); const p = await locate(); if (p.error) return toast(p.error);
      c.lat = p.lat; c.lng = p.lng; $('cLat').value = p.lat.toFixed(4); $('cLng').value = p.lng.toFixed(4); prev();
    };
    s.querySelector('[data-ok]').onclick = () => { c.city = $('cCity').value.trim(); S.calc = c; S.asr = c.asr; save(); s.hidden = true; redo(); toast('صارت المواقيت محسوبة لـ ' + (c.city || 'موقعك')); };
  }

  // ---------------- فحص الجهاز ----------------
  const CHECKS = [
    { k: 'sound', t: 'الصوت مفعّل على هالصفحة', why: 'المتصفح ما بيسمح بالصوت قبل ما تكبس على الصفحة مرة.', how: 'اكبس «فعّل الصوت»، وخلّي الشاشة مفتوحة.', web: true },
    { k: 'notif', t: 'الإشعارات', why: 'بدونها ما بيطلع تنبيه وقت الأذان إذا كنت بصفحة تانية.', how: 'اكبس «صلّحها» واسمح بالإشعارات.', web: true },
    { k: 'wake', t: 'الشاشة ما بتنطفي', why: 'بالويب الأذان بيشتغل طالما الصفحة مفتوحة والشاشة شغّالة.', how: 'الشاشة الرئيسية بتطلب هالشي لحالها. بالتطبيق ما بتحتاجه.', web: true },
    { k: 'loc', t: 'إذن الموقع', why: 'منحتاجه للمسجد الأقرب، وللسفر، وللقبلة.', how: 'إعدادات المتصفح ← الموقع ← اسمح لهالصفحة.', web: true },
    { k: 'alarm', t: 'المنبّهات الدقيقة (بالتطبيق)', why: 'بدونها أندرويد بيأخّر الأذان دقائق ليوفّر بطارية.', how: 'الإعدادات ← التطبيقات ← أذان تيك ← «المنبّهات والتذكيرات» ← اسمح.' },
    { k: 'battery', t: 'توفير البطارية (بالتطبيق)', why: 'إذا كان مفعّل، أندرويد ممكن يوقف التطبيق بالليل.', how: 'الإعدادات ← التطبيقات ← أذان تيك ← البطارية ← «غير مقيّد».' },
    { k: 'sleep', t: 'سامسونج: التطبيقات النائمة (بالتطبيق)', why: 'سامسونج بتنيّم التطبيقات اللي ما بتنفتح كتير.', how: 'العناية بالجهاز ← البطارية ← حدود الاستخدام بالخلفية ← «تطبيقات لا تنام أبداً» ← ضيف أذان تيك.' },
    { k: 'dnd', t: 'وضع عدم الإزعاج (بالتطبيق)', why: 'إذا الجهاز على «عدم الإزعاج»، الأذان من الجهاز ممكن يطلع ساكت.', how: 'اسمح لأذان تيك يتخطّى «عدم الإزعاج».' },
    { k: 'speaker', t: 'السماعة على الشبكة (بالتطبيق)', why: 'السماعة لازم تكون على نفس الواي فاي.', how: 'إذا تغيّر عنوانها، التطبيق بيدوّر عليها بالاسم لحاله.' },
    { k: 'time', t: 'الساعة والمنطقة الزمنية', why: 'إذا الساعة غلط، المواقيت بتغلط.', how: 'الإعدادات ← التاريخ والوقت ← «تلقائي».', web: true },
  ];
  async function runChecks() {
    const r = {};
    r.sound = A.unlocked;
    r.notif = 'Notification' in window && Notification.permission === 'granted';
    r.wake = 'wakeLock' in navigator;
    try { r.loc = (await navigator.permissions.query({ name: 'geolocation' })).state === 'granted'; } catch (e) { r.loc = !!st().pos; }
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; r.time = !!tz; } catch (e) { r.time = true; }
    ['alarm', 'battery', 'sleep', 'dnd', 'speaker'].forEach((k) => { r[k] = 'app'; });
    ui.checks = r; redo();
  }
  async function fix(k) {
    if (k === 'sound') { A.unlock(); toast('الصوت تفعّل ✓'); }
    if (k === 'notif' && 'Notification' in window) { await Notification.requestPermission(); }
    if (k === 'loc') { const p = await locate(); if (!p.error) setPlace(p, 'gps'); else toast(p.error); }
    runChecks();
  }

  // ---------------- رابط الشاشة الخاص ----------------
  const rnd = (n, abc) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => abc[b % abc.length]).join('');
  function ensureLink() {
    const S = st();
    if (!S.link) {
      const slug = (S.city || 'home').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 10) || 'home';
      S.link = { name: 'azan-' + slug + '-' + rnd(4, 'abcdefghjkmnpqrstuvwxyz23456789'), key: rnd(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') + '-' + rnd(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') };
      save();
    }
    return S.link;
  }
  function qrSvg(text) {
    try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { return ''; }
  }

  // ---------------- الأقسام ----------------
  const SECTIONS = [
    { key: 'hello', setupOnly: true, title: '', body: () => `
      <div class="splash">
        <svg class="logo" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="56" fill="none" stroke="var(--accent)" stroke-opacity=".35" stroke-width="2"/>
          <path d="M60 22c0 0-24 15-24 34v30h48V56c0-19-24-34-24-34z" fill="var(--accent)"/>
          <path d="M90 42l4-7 4 7v44h-8z" fill="var(--accent)"/><circle cx="60" cy="16" r="4" fill="var(--accent)"/>
          <path d="M53 86v-14a7 7 0 0114 0v14z" fill="var(--surface)"/>
        </svg>
        <p class="brand">أذان تيك</p>
        <div class="bism">بسم الله الرحمن الرحيم</div>
        <p class="lead" style="max-width:30ch">مواقيت مسجدك والأذان في بيتك، أينما كنت.</p>
        <button class="primary big" type="button" data-next>ابدأ</button>
        <button class="ghost" type="button" data-import>📲 عندي إعدادات من جهاز تاني</button>
        <div class="sig">Hayat Tech · Ayman AHMADOU</div>
      </div>` },

    { key: 'lang', setupOnly: true, title: 'اللغة', eyebrow: 'اللغة', h: 'لغة التطبيق', body: () => `
      <div class="list">
        <button type="button" class="opt on"><span class="rd"></span><span class="t"><b>العربية</b></span></button>
        <button type="button" class="opt" disabled style="opacity:.5"><span class="rd"></span><span class="t"><b>Français · English</b><span class="muted">قريباً</span></span></button>
      </div>` },

    { key: 'loc', tab: 'azan', title: '📍 الموقع والسفر', eyebrow: 'الموقع', h: 'أين أنت الآن؟', lead: 'لنعرض المساجد حولك ونضبط المواقيت والتاريخ والطقس.', body: () => { const S = st(); return `
      <div class="list">
        <button type="button" class="opt ${S.how === 'gps' ? 'on' : ''}" data-gps><span class="rd"></span><span class="t"><b>📍 تحديد موقعي بدقّة (GPS)</b><span class="muted">${ui.locating ? 'عم حدّد موقعك… (حتى 12 ثانية)' : S.how === 'gps' && S.city ? '✓ ' + esc(S.city) + (S.accuracy ? ' · الدقّة ±' + Math.round(S.accuracy) + ' م' : '') : 'يطلب الإذن مرة واحدة'}</span></span></button>
        <div class="opt ${S.how === 'city' ? 'on' : ''}"><span class="rd"></span><span class="t"><b>🏙️ اختيار مدينة</b>
          <span class="row" style="margin-top:6px"><input type="text" id="cityIn" class="grow" placeholder="Nancy، Lyon، Berlin، Istanbul…" value="${S.how === 'city' ? esc(S.city) : ''}"><button class="sm" type="button" data-city>بحث</button></span></span></div>
      </div>
      <div class="srow"><span class="grow">✈️ عند السفر: اسألني إن كنت أريد مسجد المدينة الجديدة<br><span class="muted">ويبقى مسجد البيت محفوظاً في المفضّلة</span></span>${sw('data-g="travel"', S.travel)}</div>`; } },

    { key: 'mosque', tab: 'azan', title: '🕌 المسجد والمواقيت', eyebrow: 'المسجد', h: 'اختر مسجدك', body: () => {
      const S = st();
      if (!S.pos) return '<p class="muted">حدّد موقعك أول (قسم الموقع).</p>';
      const note = { loading: 'عم دوّر على المساجد حولك…', mawaqit: 'من Mawaqit — بالاسم المسجّل ومع مواقيته', osm: 'من الخريطة (OpenStreetMap) بالاسم والعنوان. المسجد اللي مش على Mawaqit، مواقيته بتنحسب لموقعه.', none: 'ما قدرت جيب المساجد — تأكّد من الإنترنت', '': '' }[ui.mosqueSrc] || '';
      const cur = S.mosque;
      const curNote = S.calc ? '✓ حساب: ' + PT.METHODS[S.calc.method].name + ' · العصر ' + (S.calc.asr === 2 ? 'الحنفي' : 'الجمهور')
        : cur ? '✓ مسجدك: ' + esc(cur.name) + (cur.src === 'mawaqit' ? (A.timesSource() === 'mosque' ? ' · مواقيت المسجد' : ' · المواقيت محسوبة (Mawaqit ما ردّ من المتصفح — بالتطبيق بتجي من المسجد)') : ' · المواقيت محسوبة لموقعه') : '';
      return `
        ${curNote ? `<div class="note">${curNote}</div>` : ''}
        <div class="map" id="map"></div>
        <p class="muted" style="margin:0">${note}${ui.roadLoading ? ' · عم احسب المسافة بالطريق…' : ''}</p>
        <div class="list">${ui.mosques.map((m, i) => { const on = cur && cur.lat === m.lat && cur.lng === m.lng; return `
          <div class="mitem ${on ? 'on' : ''}" data-m="${i}" role="button" tabindex="0">
            <span class="rd"></span>
            <span><b>${esc(m.name)}</b> ${m.src === 'mawaqit' ? '<span class="tag ok">Mawaqit</span>' : '<span class="tag">خريطة</span>'}</span>
            <button class="fav ${S.favs.some((f) => f.name === m.name) ? 'on' : ''}" data-fav="${i}" aria-label="مفضّلة">${S.favs.some((f) => f.name === m.name) ? '★' : '☆'}</button>
            <span class="addr">${esc(m.addr || '')}${m.jumua ? ' · الجمعة ' + esc(m.jumua) : ''}</span>
            <span class="dist">${m.road != null ? `<b>${fmtKm(m.road)}</b>${m.drive != null ? ' · 🚗 ' + fmtMin(m.drive) : ''}${m.walk != null ? ' · 🚶 ' + fmtMin(m.walk) : ''}` : `<b>${m.km < 1 ? Math.round(m.km * 1000) + ' م' : m.km.toFixed(1) + ' كم'}</b> <span class="muted">بخط مستقيم</span>`}</span>
            <span class="acts"><a class="btn sm" href="${gmaps(m)}" target="_blank" rel="noopener" data-stop>🧭 خذني · Google Maps</a><a class="btn sm" href="${geoUri(m)}" data-stop>📍 Waze أو غيره</a></span>
          </div>`; }).join('')}
          <button type="button" class="opt ${S.calc ? 'on' : ''}" data-calc><span class="rd"></span><span class="t"><b>مسجدي غير موجود — احسب المواقيت</b><span class="muted">صفحة لحالها: طريقة الحساب، العصر، خطوط العرض العالية، التعديل اليدوي</span></span></button>
        </div>
        ${S.favs.length ? `<div class="field">★ المفضّلة<div class="chips">${S.favs.map((f, i) => `<button class="chip ${cur && cur.name === f.name ? 'on' : ''}" data-favgo="${i}">${esc(f.name)}</button>`).join('')}</div></div>` : ''}`; } },

    { key: 'lib', tab: 'lib', title: '🎵 مكتبة الأذان', eyebrow: 'مكتبة الأذان', h: 'اختر صوت الأذان', lead: 'ارفع أذاناتك من جهازك، وبتنحفظ بالمكتبة. ▶ للاستماع.', body: () => { const S = st(); const az = A.lib().filter((a) => a.kind === 'azan'); return `
      <div class="list">${az.map((a) => `
        <div class="opt ${S.azan === a.id || S.fajr === a.id ? 'on' : ''}">
          <button type="button" class="ghost sm" data-play="${a.id}" aria-label="استمع">▶</button>
          <span class="t"><b>${esc(a.name)}</b><span class="tag ${a.src === 'ملفاتي' ? 'gold' : ''}">${a.src}</span></span>
          <span class="chips"><button type="button" class="chip ${S.azan === a.id ? 'on' : ''}" data-azan="${a.id}">للصلوات</button><button type="button" class="chip ${S.fajr === a.id ? 'on' : ''}" data-fajr="${a.id}">للفجر</button>${a.src === 'ملفاتي' ? `<button type="button" class="chip" data-del="${a.id}" aria-label="حذف">🗑</button>` : ''}</span>
        </div>`).join('')}</div>
      <button type="button" class="primary" data-add="azan">＋ أضف أذاناً من ملفاتك</button>
      <div class="sub"><span>🤲 الدعاء بعد الأذان<br><span class="muted">إذا ما اخترت ملف، بيطلع الدعاء مكتوب على الشاشة بس</span></span><select data-dua>${libOpts(['dua', 'adhkar'], S.duaSrc, 'مكتوب على الشاشة بس')}</select></div>
      <details class="acc ${S.adhkarOn ? '' : 'off'}" ${S.adhkarOn ? 'open' : ''}>
        <summary><b class="grow">أذكار الصباح والمساء</b><span class="tag">${S.adhkarOn ? 'مفعّلة' : 'غير مفعّلة'}</span></summary>
        <div class="b">
          <div class="srow"><span class="grow">تشغيل الأذكار بالصوت</span>${sw('data-g="adhkarOn"', S.adhkarOn)}</div>
          <div class="sub"><span>☀️ أذكار الصباح<br><span class="muted">بعد الشروق بـ ${S.am.after} دقيقة</span></span><select data-src="am" ${S.adhkarOn ? '' : 'disabled'}>${libOpts(['adhkar', 'dua', 'tone'], S.am.src)}</select></div>
          <div class="sub"><span>🌆 أذكار المساء<br><span class="muted">بعد العصر بـ ${S.pm.after} دقيقة</span></span><select data-src="pm" ${S.adhkarOn ? '' : 'disabled'}>${libOpts(['adhkar', 'dua', 'tone'], S.pm.src)}</select></div>
        </div>
      </details>`; } },

    { key: 'alerts', tab: 'azan', title: '🔔 الصلوات والتنبيهات', eyebrow: 'التنبيه لكل صلاة', h: 'كيف يُرفع الأذان؟', body: () => { const S = st(); return `
      <div class="field">السماعات
        <div class="chips">
          <button type="button" class="chip on" disabled>📱 هالجهاز</button>
          <button type="button" class="chip" data-info="bt">🎧 بلوتوث / Alexa</button>
          <button type="button" class="chip" data-info="nest">🔊 Google Nest — بالتطبيق</button>
        </div></div>
      <p class="muted" style="margin:0">اضغط على أي صلاة لتفتح تنبيهاتها. كل تنبيهات الصلاة بنفس درجة صوتها.</p>
      <div class="list">${NAMES.map((n, i) => { const p = S.prayers[i], loud = p.mode < 2; return `
        <details class="acc ${p.mode === 3 ? 'off' : ''}" data-pi="${i}" ${ui.openP === i ? 'open' : ''}>
          <summary><b class="grow">${n}</b><span class="tag">${MODES[p.mode]}</span><span class="pct">${loud ? '🔊 ' + p.vol + '%' : ''}</span></summary>
          <div class="b">
            <div class="chips">${MODES.map((m, k) => `<button type="button" class="chip ${p.mode === k ? 'on' : ''}" data-mode="${i}:${k}">${m}</button>`).join('')}</div>
            ${loud ? `<div class="row"><span class="muted">الصوت</span><input class="grow" type="range" min="0" max="100" value="${p.vol}" data-vol="${i}" aria-label="صوت ${n}"><span class="pct" data-volv="${i}">${p.vol}%</span><button class="sm" data-tryp="${i}">▶</button></div>` : ''}
            <div class="sub"><span>⏰ تذكير قبل الأذان</span><span class="row">${p.remind ? `<select data-before="${i}">${[5, 10, 15, 20, 30].map((v) => `<option value="${v}" ${p.before === v ? 'selected' : ''}>${v} د</option>`).join('')}</select>` : ''}${sw(`data-pt="${i}:remind"`, p.remind)}</span></div>
            <div class="sub"><span>🤲 الدعاء بعد الأذان</span>${sw(`data-pt="${i}:dua"`, p.dua)}</div>
            <div class="sub"><span>🕌 العدّ للإقامة<br><span class="muted">من مواقيت المسجد</span></span>${sw(`data-pt="${i}:iqama"`, p.iqama)}</div>
            <div class="sub"><span>📿 الأذكار بعد الصلاة<br><span class="muted">بعد الأذان بـ 10 دقائق</span></span><span class="row">${p.after ? `<select data-asrc="${i}">${libOpts(['adhkar', 'dua', 'tone'], p.afterSrc)}</select>` : ''}${sw(`data-pt="${i}:after"`, p.after)}</span></div>
            ${loud ? `<p class="muted" style="margin:0">كل هالتنبيهات بتطلع على ${p.vol}% متل أذان ${n}.</p>` : ''}
          </div>
        </details>`; }).join('')}</div>`; } },

    { key: 'occ', tab: 'occ', title: '🌙 المناسبات', eyebrow: 'المناسبات', h: 'الجمعة ورمضان والأيام المباركة', lead: 'كل مناسبة إلها روتين وملفات خاصة. التطبيق بيعرف التاريخ الهجري، فبيشغّلها لحاله بوقتها، وبصوت الصلاة الأقرب.', body: () => {
      const O = st().occ;
      const item = (occ, k, label, extra) => { const it = O[occ].items[k]; return `
        <div class="sub"><span>${label}${extra ? '<br><span class="muted">' + extra + '</span>' : ''}</span>${sw(`data-oi="${occ}:${k}"`, it.on)}
        ${it.on && 'src' in it ? `<select class="full" data-osrc="${occ}:${k}">${libOpts(['occ', 'adhkar', 'dua', 'tone'], it.src, 'اختر ملفاً…')}</select>` : ''}</div>`; };
      const block = (occ, title, when, body) => `
        <details class="acc ${O[occ].on ? '' : 'off'}" ${ui.openO === occ ? 'open' : ''} data-oo="${occ}">
          <summary><b class="grow">${title}</b><span class="muted">${when}</span></summary>
          <div class="b"><div class="srow"><span class="grow">مفعّل</span>${sw(`data-on="${occ}"`, O[occ].on)}</div>${O[occ].on ? body : ''}</div>
        </details>`;
      return `<div class="list">
        ${block('jumua', '🕌 يوم الجمعة', 'كل أسبوع', item('jumua', 'kahf', 'سورة الكهف', 'الساعة ' + O.jumua.items.kahf.at) + item('jumua', 'salawat', 'الصلاة على النبي', 'الساعة ' + O.jumua.items.salawat.at) + item('jumua', 'before', 'تذكير قبل صلاة الجمعة', 'قبل بـ ' + O.jumua.items.before.min + ' دقيقة'))}
        ${block('ramadan', '🌙 رمضان', 'لحاله بالشهر', item('ramadan', 'suhoor', 'تنبيه السحور', 'قبل الفجر بـ ' + O.ramadan.items.suhoor.min + ' دقيقة') + item('ramadan', 'imsak', 'الإمساك', 'قبل الفجر بـ ' + O.ramadan.items.imsak.min + ' دقائق') + item('ramadan', 'iftar', 'دعاء الإفطار', 'بعد أذان المغرب') + item('ramadan', 'taraweeh', 'تذكير التراويح', 'بعد العشاء بـ ' + O.ramadan.items.taraweeh.min + ' دقيقة'))}
        ${block('qadr', '✨ العشر الأواخر', 'ليالي الوتر', item('qadr', 'remind', 'تذكير قيام الليل وليلة القدر'))}
        ${block('dhul', '🕋 عشر ذي الحجة وعرفة', '1–9 ذو الحجة', item('dhul', 'takbir', 'التكبير', 'بعد الفجر') + item('dhul', 'arafa', 'تذكير صيام يوم عرفة', 'الليلة قبل'))}
        ${block('eid', '🎉 العيدين', 'الفطر والأضحى', item('eid', 'takbir', 'تكبيرات العيد', 'من الفجر لصلاة العيد'))}
        ${block('ashura', '📅 عاشوراء', '9 و10 محرّم', item('ashura', 'fast', 'تذكير الصيام', 'الليلة قبل'))}
        ${block('white', '🤍 صيام السنّة', 'الأيام البيض', item('white', 'fast', 'الأيام البيض (13–15)', 'الليلة قبل') + item('white', 'monthu', 'الاثنين والخميس', 'الليلة قبل'))}
      </div>`; } },

    { key: 'general', tab: 'sys', title: '⚙️ عام', eyebrow: 'عام', h: 'كل يوم، لحاله', body: () => { const S = st(); return `
      <div>
        <div class="srow"><span class="grow">🌙 ساعات الهدوء<br><span class="muted">صوت أوطى (${S.quiet.vol}%) من ${S.quiet.from} لـ ${S.quiet.to}</span></span>${sw('data-g="quiet.on"', S.quiet.on)}</div>
        <div class="srow"><span class="grow">✅ سجل الصلوات<br><span class="muted">«صلّيت؟» بعد كل أذان، وإحصائية أسبوعية</span></span>${sw('data-g="log"', S.log)}</div>
        <div class="srow"><span class="grow">🔄 تحديث مواقيت المسجد يومياً</span>${sw('data-g="autoRefresh"', S.autoRefresh)}</div>
      </div>`; } },

    { key: 'tg', tab: 'sys', title: '✈️ تلغرام', eyebrow: 'تلغرام · اختياري', h: 'بوتك الخاص', lead: 'كل جهاز إله بوته. بيبعتلك إذا ما انرفع الأذان، وبالتطبيق بتتحكّم فيه من برّا البيت.', body: () => { const T = st().tg; return T.chatId ? `
      <div class="note">✓ مربوط مع ${esc(T.name)} (@${esc(T.bot)})</div>
      <div class="row"><button data-tgtest>رسالة تجربة</button><button class="ghost" data-tgoff>افصل</button></div>` : `
      <ol class="muted" style="margin:0;padding-inline-start:18px">
        <li>افتح <b>@BotFather</b> بتلغرام واكتب <span dir="ltr">/newbot</span>، وانسخ التوكن.</li>
        <li>افتح البوت الجديد واكبس <b>Start</b>.</li>
        <li>الصق التوكن هون واكبس «ربط».</li></ol>
      <div class="row"><input type="text" id="tok" class="grow" placeholder="توكن البوت" style="direction:ltr;text-align:left" autocomplete="off"><button type="button" data-tg>ربط</button></div>
      <p class="muted" style="margin:0">أخوك بيعمل بوت تاني لجهازه بنفس الطريقة، فما بيتعارضوا.</p>`; } },

    { key: 'link', tab: 'sys', settingsOnly: true, title: '🖥️ رابط الشاشة', body: () => { const l = ensureLink(); const host = l.name + '.local:8787'; return `
      <p class="muted" style="margin:0">بالتطبيق: بتفتح الشاشة على التلفزيون أو أي جهاز بالبيت بهالرابط. الاسم خاص بجهازك وما بيتغيّر لو تغيّر الـ IP، والمفتاح بيحمي الإعدادات.</p>
      <div class="qrs">
        <div class="qr"><div class="qrimg">${qrSvg('http://' + host + '/')}</div><b>الشاشة</b><code dir="ltr">http://${host}/</code></div>
        <div class="qr"><div class="qrimg">${qrSvg('http://' + host + '/settings?k=' + l.key)}</div><b>الإعدادات</b><code dir="ltr">…/settings?k=${l.key}</code></div>
      </div>
      <div class="row"><button data-newkey>🔑 غيّر المفتاح</button><span class="muted grow">إذا غيّرته، الروابط القديمة للإعدادات بتوقف.</span></div>`; } },

    { key: 'share', tab: 'sys', settingsOnly: true, title: '📲 نقل الإعدادات', body: () => `
      <p class="muted" style="margin:0">بتبعت إعداداتك لجهاز تاني (متل أخوك). هو بيختار مسجده بس، والباقي بيجي متل ما هو. الملفات الصوتية ما بتنتقل.</p>
      <div class="row"><button data-export>⬇ احفظ ملف الإعدادات</button><button data-importf>⬆ افتح ملف إعدادات</button></div>` },

    { key: 'check', tab: 'sys', title: '🩺 فحص الجهاز', eyebrow: 'فحص الجهاز', h: 'منتأكّد إنو الأذان ما بيوقف', body: () => {
      if (!ui.checks) return `<p class="lead">بنفحص الأشياء اللي بتوقّف الأذان عادةً، وبنقلك كيف تصلّح كل وحدة.</p><button class="primary" data-run>افحص الآن</button>`;
      const bad = CHECKS.filter((c) => ui.checks[c.k] === false);
      return `
        <h3>${bad.length ? (bad.length === 1 ? 'شغلة وحدة' : bad.length === 2 ? 'شغلتين' : bad.length + ' أشياء') + ' لازم تتصلّح' : 'كل شي تمام ✅'}</h3>
        <div class="list">${CHECKS.map((c) => { const v = ui.checks[c.k]; const ok = v === true, app = v === 'app'; return `
          <div class="chk ${v === false ? 'bad' : ''}">
            <div class="row"><span>${ok ? '✅' : app ? '📱' : '⚠️'}</span><b class="grow" style="font-weight:600">${c.t}</b>${ok ? '<span class="tag ok">تمام</span>' : app ? '<span class="tag">بالتطبيق</span>' : `<button class="primary sm" data-fix="${c.k}">صلّحها</button>`}</div>
            ${ok ? '' : `<div class="why">${c.why}</div><div class="how">🛠️ ${c.how}</div>`}
          </div>`; }).join('')}</div>
        <div class="row"><button data-run>↻ افحص مرة تانية</button><button class="grow" data-test>▶ جرّب الأذان الآن</button></div>`; } },

    { key: 'done', setupOnly: true, eyebrow: 'جاهز', h: 'كل شيء مضبوط ✅', body: () => { const S = st();
      const az = A.libItem(S.azan), fj = A.libItem(S.fajr), t = A.times(new Date());
      const occOn = Object.entries({ jumua: 'الجمعة', ramadan: 'رمضان', qadr: 'العشر الأواخر', dhul: 'ذو الحجة', eid: 'العيدين', ashura: 'عاشوراء', white: 'صيام السنّة' }).filter(([k]) => S.occ[k].on).map(([, v]) => v);
      return `
        <ul style="margin:0;padding-inline-start:18px;display:grid;gap:4px">
          <li>🕌 ${S.calc ? 'حساب: ' + PT.METHODS[S.calc.method].name : S.mosque ? esc(S.mosque.name) : '—'}${S.city ? ' — ' + esc(S.city) : ''}</li>
          <li>🕰️ اليوم: ${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((k, i) => NAMES[i] + ' ' + hm(t[k])).join(' · ')}</li>
          <li>🎵 ${az ? esc(az.name) : '—'} · الفجر: ${fj ? esc(fj.name) : 'نفس الأذان'}</li>
          <li>🔊 ${NAMES.map((n, i) => n + ' ' + (S.prayers[i].mode < 2 ? S.prayers[i].vol + '%' : MODES[S.prayers[i].mode])).join(' · ')}</li>
          <li>🌙 ${occOn.join('، ') || 'بدون مناسبات'}</li>
          <li>✈️ ${S.tg.chatId ? 'تلغرام مربوط' : 'تلغرام غير مربوط'}${S.travel ? ' · يسألك عند السفر' : ''}</li>
        </ul>
        <div class="note">بالويب الأذان بيطلع من هالجهاز طالما الشاشة مفتوحة. بالتطبيق بيشتغل دايماً، وعلى سماعة Google.</div>`; } },
  ];

  // ---------------- العرض ----------------
  const root = $('root');
  let idx = 0;
  const list = () => SECTIONS.filter((s) => (MODE === 'setup' ? !s.settingsOnly : !s.setupOnly));
  function sectionHTML(s, asCard) {
    if (s.key === 'hello') return `<div class="card splashcard">${s.body()}</div>`;
    const head = asCard ? `${s.eyebrow ? `<div class="eyebrow">${s.eyebrow}</div>` : ''}${s.h ? `<h2>${s.h}</h2>` : ''}${s.lead ? `<p class="lead">${s.lead}</p>` : ''}` : (s.lead ? `<p class="lead">${s.lead}</p>` : '');
    return asCard ? `<div class="card">${head}${s.body()}</div>` : head + s.body();
  }
  let tab = 'azan';
  try { tab = localStorage.getItem('azantech.tab') || 'azan'; } catch (e) { /* */ }
  function render(anim) {
    const L = list();
    if (MODE === 'setup') {
      const s = L[idx];
      root.innerHTML = sectionHTML(s, true);
      if (!anim) root.firstElementChild.style.animation = 'none';
      $('dots').innerHTML = L.map((_, k) => `<i class="${k === idx ? 'on' : k < idx ? 'done' : ''}"></i>`).join('');
      $('back').style.visibility = idx ? 'visible' : 'hidden';
      $('next').style.visibility = idx === 0 ? 'hidden' : 'visible';
      $('next').textContent = idx === L.length - 1 ? 'افتح الشاشة' : (s.key === 'tg' && !st().tg.chatId ? 'تخطّي' : 'التالي');
    } else {
      const open = root.querySelector('details.sec[open]');
      const openKey = open ? open.dataset.sec : (ui.openSec || null);
      root.innerHTML = L.filter((s) => s.tab === tab).map((s) => `<details class="acc sec" data-sec="${s.key}" ${openKey === s.key ? 'open' : ''}><summary><b class="grow">${s.title}</b></summary><div class="b">${sectionHTML(s, false)}</div></details>`).join('');
      document.querySelectorAll('.bnav [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      root.querySelectorAll('details.sec').forEach((d) => d.addEventListener('toggle', () => {
        if (d.open) { ui.openSec = d.dataset.sec; root.querySelectorAll('details.sec').forEach((x) => { if (x !== d) x.open = false; }); if (d.dataset.sec === 'mosque') { if (!ui.mosques.length && st().pos && ui.mosqueSrc !== 'loading') loadMosques(); else drawMap(); } }
      }));
    }
    bind();
    if ($('map')) drawMap();
  }
  function redo() { const sc = MODE === 'setup' ? root.firstElementChild : document.scrollingElement; const y = sc ? sc.scrollTop : 0; render(false); const sc2 = MODE === 'setup' ? root.firstElementChild : document.scrollingElement; if (sc2) sc2.scrollTop = y; }
  function go(i) {
    const L = list(); idx = Math.max(0, Math.min(L.length - 1, i)); render(true);
    if (L[idx].key === 'mosque' && st().pos && !ui.mosques.length && ui.mosqueSrc !== 'loading') loadMosques();
    if (L[idx].key === 'check' && !ui.checks) runChecks();
  }

  // ---------------- الأحداث ----------------
  function setPath(o, path, v) { const p = path.split('.'); const last = p.pop(); p.reduce((a, k) => a[k], o)[last] = v; }
  function bind() {
    const q = (s) => root.querySelectorAll(s), S = st();
    q('[data-next]').forEach((b) => b.onclick = () => { A.unlock(); go(idx + 1); });
    q('[data-import], [data-importf]').forEach((b) => b.onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => {
        try {
          const j = JSON.parse(await inp.files[0].text());
          if (!j || j.app !== 'azan-tech' || !j.settings) throw new Error();
          const keep = { library: S.library, link: S.link, tg: S.tg };
          Object.assign(S, A.DEFAULTS(), j.settings, keep, { setupDone: false, mosque: null, calc: null, pos: null });
          save(); toast('انتقلت الإعدادات ✓ — اختار موقعك ومسجدك');
          if (MODE === 'setup') go(SECTIONS.findIndex((s) => s.key === 'loc') - 0); else redo();
        } catch (e) { toast('هالملف مش ملف إعدادات أذان تيك'); }
      };
      inp.click();
    });
    q('[data-export]').forEach((b) => b.onclick = () => {
      const out = JSON.parse(JSON.stringify(S));
      ['library', 'link', 'tg', 'pos', 'accuracy', 'prayLog'].forEach((k) => delete out[k]);
      const blob = new Blob([JSON.stringify({ app: 'azan-tech', v: 1, date: new Date().toISOString(), settings: out }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'azan-tech-settings.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    // الموقع
    q('[data-gps]').forEach((b) => b.onclick = async () => {
      if (ui.locating) return;
      ui.locating = true; redo();
      const p = await locate(); ui.locating = false;
      if (p.error) { toast(p.error); redo(); return; }
      await setPlace(p, 'gps');
      toast('الدقّة ±' + Math.round(p.accuracy) + ' م');
      if (MODE === 'settings') loadMosques();
    });
    q('[data-city]').forEach((b) => b.onclick = async () => {
      const v = $('cityIn').value.trim(); if (!v) return;
      toast('عم دوّر…');
      const g = await A.geocode(v);
      if (g) { await setPlace(g, 'city'); if (MODE === 'settings') loadMosques(); } else toast('ما لقيت هالمدينة');
    });
    const ci = $('cityIn'); if (ci) ci.onkeydown = (e) => { if (e.key === 'Enter') root.querySelector('[data-city]').click(); };
    q('[data-g]').forEach((c) => c.onchange = () => { setPath(S, c.dataset.g, c.checked); save(); if (c.dataset.g === 'adhkarOn') redo(); });
    // المساجد
    q('[data-m]').forEach((b) => b.onclick = (e) => { if (e.target.closest('[data-stop], [data-fav]')) return; pickMosque(+b.dataset.m); });
    q('[data-fav]').forEach((f) => f.onclick = (e) => {
      e.stopPropagation(); const m = ui.mosques[+f.dataset.fav];
      const had = S.favs.some((x) => x.name === m.name);
      S.favs = had ? S.favs.filter((x) => x.name !== m.name) : [...S.favs, { name: m.name, addr: m.addr, lat: m.lat, lng: m.lng, slug: m.slug || '', src: m.src, jumua: m.jumua || '' }];
      save(); redo(); toast(had ? 'انشال من المفضّلة' : 'انحفظ بالمفضّلة ★');
    });
    q('[data-favgo]').forEach((b) => b.onclick = () => { const f = S.favs[+b.dataset.favgo]; S.mosque = { ...f, times: null, iqama: null, timesDate: '' }; S.calc = null; save(); A.refreshMosque().then(redo); redo(); toast('صار مسجدك: ' + f.name); });
    q('[data-calc]').forEach((b) => b.onclick = () => openCalc());
    // المكتبة
    q('[data-azan]').forEach((b) => b.onclick = () => { S.azan = b.dataset.azan; save(); redo(); });
    q('[data-fajr]').forEach((b) => b.onclick = () => { S.fajr = S.fajr === b.dataset.fajr ? '' : b.dataset.fajr; save(); redo(); });
    q('[data-del]').forEach((b) => b.onclick = async () => { const id = b.dataset.del; await A.delAudio(id); if (S.azan === id) S.azan = 'takbir'; if (S.fajr === id) S.fajr = ''; save(); redo(); });
    q('[data-play]').forEach((b) => b.onclick = () => { A.unlock(); A.stop(); A.play({ src: b.dataset.play, kind: 'azan', vol: .7, title: 'استماع' }); toast('▶ عم يشتغل — اكبس مرة تانية ▶ لتوقف'); b.dataset.play && (b.onclick = () => { A.stop(); redo(); }); });
    q('[data-add]').forEach((b) => b.onclick = () => pickFile(b.dataset.add, (id) => { if (b.dataset.add === 'azan' && (S.azan === 'takbir' || !S.azan)) { S.azan = id; save(); } }));
    const onSrc = (s, setter) => { if (s.value.startsWith('__up:')) { pickFile(s.value.slice(5), (id) => { setter(id); save(); }); return; } setter(s.value); save(); };
    q('[data-dua]').forEach((s) => s.onchange = () => onSrc(s, (v) => { S.duaSrc = v; }));
    q('[data-src]').forEach((s) => s.onchange = () => onSrc(s, (v) => { S[s.dataset.src].src = v; }));
    // التنبيهات
    q('details[data-pi]').forEach((d) => d.addEventListener('toggle', () => { if (d.open) { ui.openP = +d.dataset.pi; q('details[data-pi]').forEach((x) => { if (x !== d) x.open = false; }); } else if (ui.openP === +d.dataset.pi) ui.openP = null; }));
    q('[data-info]').forEach((b) => b.onclick = () => toast(b.dataset.info === 'bt' ? 'إذا الجهاز موصول بسماعة بلوتوث (أو Alexa كسماعة بلوتوث)، الأذان بيطلع عليها لحاله' : 'سماعات Google Nest بتشتغل من التطبيق مباشرة على الواي فاي'));
    q('[data-mode]').forEach((b) => b.onclick = () => { const [i, k] = b.dataset.mode.split(':').map(Number); S.prayers[i].mode = k; save(); redo(); });
    q('[data-vol]').forEach((r) => { r.oninput = () => { const i = +r.dataset.vol; S.prayers[i].vol = +r.value; root.querySelector(`[data-volv="${i}"]`).textContent = r.value + '%'; }; r.onchange = () => { save(); redo(); }; });
    q('[data-tryp]').forEach((b) => b.onclick = () => { A.unlock(); A.stop(); const i = +b.dataset.tryp, p = S.prayers[i]; A.play({ src: p.mode === 1 ? 'takbir' : (i === 0 && S.fajr ? S.fajr : S.azan), kind: 'azan', vol: p.vol / 100, title: 'تجربة أذان ' + NAMES[i] }); toast('تجربة أذان ' + NAMES[i] + ' على ' + p.vol + '%'); });
    q('[data-pt]').forEach((c) => c.onchange = () => { const [i, k] = c.dataset.pt.split(':'); S.prayers[+i][k] = c.checked; save(); redo(); });
    q('[data-before]').forEach((s) => s.onchange = () => { S.prayers[+s.dataset.before].before = +s.value; save(); });
    q('[data-asrc]').forEach((s) => s.onchange = () => onSrc(s, (v) => { S.prayers[+s.dataset.asrc].afterSrc = v; }));
    // المناسبات
    q('details[data-oo]').forEach((d) => d.addEventListener('toggle', () => { if (d.open) { ui.openO = d.dataset.oo; q('details[data-oo]').forEach((x) => { if (x !== d) x.open = false; }); } else if (ui.openO === d.dataset.oo) ui.openO = null; }));
    q('[data-on]').forEach((c) => c.onchange = () => { S.occ[c.dataset.on].on = c.checked; save(); redo(); });
    q('[data-oi]').forEach((c) => c.onchange = () => { const [o, k] = c.dataset.oi.split(':'); S.occ[o].items[k].on = c.checked; save(); redo(); });
    q('[data-osrc]').forEach((s) => s.onchange = () => { const [o, k] = s.dataset.osrc.split(':'); onSrc(s, (v) => { S.occ[o].items[k].src = v; }); });
    // تلغرام
    q('[data-tg]').forEach((b) => b.onclick = async () => {
      const tok = $('tok').value.trim(); if (!/^\d+:[\w-]{20,}$/.test(tok)) return toast('التوكن مش مزبوط — انسخه كامل من BotFather');
      b.disabled = true; b.textContent = '…';
      try {
        const api = async (m, body) => { const r = await fetch('https://api.telegram.org/bot' + tok + '/' + m, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); const j = await r.json(); if (!j.ok) throw new Error(j.description); return j.result; };
        const me = await api('getMe');
        const ups = await api('getUpdates', { limit: 50 });
        const msg = [...ups].reverse().map((u) => u.message).find((m) => m && m.chat && m.chat.type === 'private');
        if (!msg) throw new Error('التوكن صح (@' + me.username + ') — افتح البوت بتلغرام واكبس Start، وبعدين «ربط»');
        S.tg = { token: tok, chatId: String(msg.chat.id), name: [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(' '), bot: me.username };
        save();
        await api('sendMessage', { chat_id: S.tg.chatId, text: '✅ انربط أذان تيك بهالبوت. رح ابعتلك إذا ما انرفع الأذان.' });
        toast('انربط ✓ — وصلتك رسالة؟'); redo();
      } catch (e) { toast(e.message || 'ما زبط الربط'); b.disabled = false; b.textContent = 'ربط'; }
    });
    q('[data-tgtest]').forEach((b) => b.onclick = async () => {
      try { const r = await fetch('https://api.telegram.org/bot' + S.tg.token + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: S.tg.chatId, text: '🔔 رسالة تجربة من أذان تيك ✅' }) }); toast((await r.json()).ok ? 'انبعتت ✓' : 'ما انبعتت'); }
      catch (e) { toast('ما انبعتت'); }
    });
    q('[data-tgoff]').forEach((b) => b.onclick = () => { S.tg = { token: '', chatId: '', name: '', bot: '' }; save(); redo(); });
    // الرابط
    q('[data-newkey]').forEach((b) => b.onclick = () => { S.link = null; ensureLink(); redo(); toast('صار في مفتاح جديد'); });
    // الفحص
    q('[data-run]').forEach((b) => b.onclick = () => runChecks());
    q('[data-fix]').forEach((b) => b.onclick = () => fix(b.dataset.fix));
    q('[data-test]').forEach((b) => b.onclick = () => { A.unlock(); A.stop(); const p = S.prayers[1]; A.play({ src: S.azan, kind: 'azan', vol: p.vol / 100, title: 'تجربة الأذان' }); toast('عم يشتغل الأذان على ' + p.vol + '%'); });
  }

  if (MODE === 'setup') {
    $('next').onclick = () => {
      const L = list(), k = L[idx].key, S = st();
      if (k === 'loc' && !S.pos) return toast('حدّد موقعك أو اختار مدينة');
      if (k === 'mosque' && !S.mosque && !S.calc) return toast('اختر مسجداً أو «احسب المواقيت»');
      if (idx === L.length - 1) { S.setupDone = true; save(); location.href = 'screen.html'; return; }
      go(idx + 1);
    };
    $('back').onclick = () => go(idx - 1);
    let x0 = null;
    root.addEventListener('touchstart', (e) => { x0 = e.target.closest('.map, input, select, .leaflet-container') ? null : e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) < 70) return; if (dx > 0) $('next').click(); else if (idx) go(idx - 1); });
    render(true);
  } else {
    document.querySelectorAll('.bnav [data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; try { localStorage.setItem('azantech.tab', tab); } catch (e) { /* */ } ui.openSec = null; render(true); window.scrollTo(0, 0); });
    $('resetAll').onclick = () => { if ($('resetAll').dataset.sure) { A.reset(); location.href = 'setup.html'; } else { $('resetAll').dataset.sure = '1'; $('resetAll').textContent = 'متأكد؟ اكبس مرة تانية'; } };
    render(true);
  }
})();

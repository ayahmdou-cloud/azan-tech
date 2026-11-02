/* أذان تيك — المحرّك: الإعدادات، المواقيت، المكتبة، الأذان، و«السيرفر» المحلي للشاشة
   بالويب: كل شي بيشتغل بالمتصفح وبينحفظ بهالجهاز. بالتطبيق: نفس الملفات جوّا أندرويد. */
(function () {
  'use strict';
  const KEY = 'azantech.v1';
  const VERSION = '0.9-web';
  const NAMES = ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
  const KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

  // ---------------- الإعدادات ----------------
  const DEFAULTS = () => ({
    v: 1, setupDone: false,
    pos: null, accuracy: null, city: '', country: '', how: '', travel: true,
    mosque: null,          // {name, addr, lat, lng, slug, src, jumua, times:[6], iqama:[5], timesDate}
    favs: [], calc: null,  // {method, asr, high, offsets, hijri, lat, lng, city}
    asr: 1,
    azan: 'takbir', fajr: '', duaSrc: '',
    adhkarOn: false, am: { src: 'tone', after: 15 }, pm: { src: 'tone', after: 15 },
    speakers: ['device'],
    prayers: NAMES.map((_, i) => ({ mode: 0, vol: [40, 50, 55, 50, 40][i], spk: null, remind: i > 0, before: 10, dua: true, iqama: true, after: false, afterSrc: 'tone' })),
    occ: {
      jumua: { on: true, items: { kahf: { on: true, src: '', at: '09:00' }, salawat: { on: false, src: '', at: '17:00' }, before: { on: true, min: 30, src: 'tone' } } },
      ramadan: { on: true, items: { suhoor: { on: true, min: 45, src: 'tone' }, imsak: { on: true, min: 10, src: 'tone' }, iftar: { on: true, src: '' }, taraweeh: { on: false, min: 30, src: 'tone' } } },
      qadr: { on: true, items: { remind: { on: true, src: 'tone' } } },
      dhul: { on: true, items: { takbir: { on: true, src: '' }, arafa: { on: true } } },
      eid: { on: true, items: { takbir: { on: true, src: '' } } },
      ashura: { on: true, items: { fast: { on: true } } },
      white: { on: false, items: { fast: { on: true }, monthu: { on: false } } },
    },
    quiet: { on: true, from: '21:00', to: '07:00', vol: 15 }, log: true, autoRefresh: true,
    tg: { token: '', chatId: '', name: '', bot: '' },
    link: null,            // {name, key} — الرابط الخاص بالشاشة (بالتطبيق)
    library: [],           // ملفات المستخدم: {id, name, kind}
    prayLog: {},           // 'YYYY-MM-DD': [true,false,…]
    display: { nightDim: true, sky: true, sunArc: true, preAlert: true, forecast: true, fasting: true, moon: true, rotate: 60, duhaAfter: 20, duhaAlert: true, hijriAdj: 0, content: { adhkar: true, ayah: true, hadith: true, dua: true, names: true } },
  });
  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over.map((v, i) => (i < base.length ? merge(base[i], v) : v)) : base;
    if (base && typeof base === 'object') {
      const out = { ...base };
      if (over && typeof over === 'object') for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
      return out;
    }
    return over === undefined ? base : over;
  }
  function load() {
    try { const raw = JSON.parse(localStorage.getItem(KEY) || 'null'); return raw ? merge(DEFAULTS(), raw) : DEFAULTS(); }
    catch (e) { return DEFAULTS(); }
  }
  let S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* */ } }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* */ } S = DEFAULTS(); }

  // ---------------- المكتبة (الملفات بـ IndexedDB) ----------------
  const BUILTIN = [
    { id: 'takbir', kind: 'azan', name: 'تكبيرة قصيرة', src: 'مع التطبيق', synth: 'takbir' },
    { id: 'tone', kind: 'tone', name: 'نغمة تنبيه هادئة', src: 'مع التطبيق', synth: 'tone' },
  ];
  const lib = () => [...S.library.map((x) => ({ ...x, src: 'ملفاتي' })), ...BUILTIN];
  const libItem = (id) => lib().find((x) => x.id === id) || null;
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('azantech', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('audio');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function putAudio(file, kind) {
    const id = 'u' + Date.now().toString(36);
    const db = await idb();
    await new Promise((res, rej) => { const tx = db.transaction('audio', 'readwrite'); tx.objectStore('audio').put(file, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    S.library.push({ id, name: (file.name || 'ملف').replace(/\.[a-z0-9]+$/i, ''), kind: kind || 'azan' });
    save();
    return id;
  }
  async function getAudio(id) {
    try {
      const db = await idb();
      return await new Promise((res) => { const g = db.transaction('audio').objectStore('audio').get(id); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); });
    } catch (e) { return null; }
  }
  async function delAudio(id) {
    try { const db = await idb(); db.transaction('audio', 'readwrite').objectStore('audio').delete(id); } catch (e) { /* */ }
    S.library = S.library.filter((x) => x.id !== id); save();
  }

  // ---------------- المواقيت ----------------
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function calcOpts() {
    if (S.calc) return S.calc;
    const m = S.mosque, p = m || S.pos || { lat: 48.6921, lng: 6.1844 };
    return { method: PT.BY_COUNTRY[S.country] || 'mwl', asr: S.asr || 1, high: 'angle', offsets: [0, 0, 0, 0, 0], lat: p.lat, lng: p.lng };
  }
  /** {fajr,sunrise,dhuhr,asr,maghrib,isha} لتاريخ معيّن */
  function times(date) {
    const m = S.mosque;
    if (!S.calc && m && m.times && m.times.length >= 6 && m.timesDate === ymd(date)) {
      const out = {};
      ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach((k, i) => {
        const [h, mi] = String(m.times[i]).split(':').map(Number);
        const d = new Date(date); d.setHours(h, mi, 0, 0); out[k] = d;
      });
      return out;
    }
    return PT.compute(date, calcOpts());
  }
  function iqama(date, t) {
    const m = S.mosque;
    if (S.calc || !m || !m.iqama || m.timesDate !== ymd(date)) return null;
    const out = {};
    KEYS.forEach((k, i) => {
      const v = String(m.iqama[i] || '').trim();
      const plus = v.match(/^\+?(\d{1,3})$/);
      if (plus && t[k]) out[k] = new Date(+t[k] + +plus[1] * 60000);
      else { const x = v.match(/^(\d{1,2}):(\d{2})/); if (x) { const d = new Date(date); d.setHours(+x[1], +x[2], 0, 0); out[k] = d; } }
    });
    return out;
  }
  const timesSource = () => (!S.calc && S.mosque && S.mosque.src === 'mawaqit' && S.mosque.timesDate === ymd(new Date()) ? 'mosque' : 'calc');

  // ---------------- الشبكة ----------------
  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
  async function mawaqitSearch(params) {
    const u = 'https://mawaqit.net/api/2.0/mosque/search?' + new URLSearchParams(params);
    const r = await fetch(u, { signal: timeout(8000) });
    const j = await r.json();
    return (Array.isArray(j) ? j : j.mosques || []).filter((m) => m.latitude && m.longitude);
  }
  /** بيحدّث مواقيت اليوم للمسجد المختار من Mawaqit (إذا المتصفح سمح) */
  async function refreshMosque() {
    const m = S.mosque;
    if (!m || m.src !== 'mawaqit' || !m.slug) return false;
    if (m.timesDate === ymd(new Date())) return true;
    try {
      const list = await mawaqitSearch({ lat: m.lat, lon: m.lng });
      const hit = list.find((x) => x.slug === m.slug);
      if (hit && Array.isArray(hit.times)) {
        m.times = hit.times.slice(0, 6); m.iqama = hit.iqama || null; m.jumua = hit.jumua || m.jumua; m.timesDate = ymd(new Date()); save();
        return true;
      }
    } catch (e) { /* */ }
    return false;
  }
  async function reverse(pos) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&accept-language=ar,fr&lat=${pos.lat}&lon=${pos.lng}`, { signal: timeout(8000) });
      const a = (await r.json()).address || {};
      return { city: a.city || a.town || a.village || a.municipality || a.county || '', country: (a.country_code || '').toUpperCase() };
    } catch (e) { return null; }
  }
  async function geocode(q) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=ar,fr&q=${encodeURIComponent(q)}`, { signal: timeout(8000) });
      const j = await r.json();
      if (!j[0]) return null;
      const a = j[0].address || {};
      return { lat: +j[0].lat, lng: +j[0].lon, city: a.city || a.town || a.village || q, country: (a.country_code || '').toUpperCase() };
    } catch (e) { return null; }
  }
  /** المساجد حولك: Mawaqit أولاً، وإلا OpenStreetMap */
  async function findMosques(pos) {
    // Mawaqit والخريطة بنفس الوقت؛ إذا Mawaqit ردّ منفضّله (فيه المواقيت)، وإلا أول سيرفر خريطة بيردّ
    const maw = mawaqitSearch({ lat: pos.lat, lon: pos.lng }).then((arr) => (arr.length ? arr.slice(0, 20).map((m) => ({ name: m.label || m.name, addr: m.localisation || '', lat: +m.latitude, lng: +m.longitude, slug: m.slug, jumua: m.jumua || '', times: m.times, iqama: m.iqama, src: 'mawaqit' })) : null)).catch(() => null);
    const q = `[out:json][timeout:25];(node["amenity"="place_of_worship"]["religion"="muslim"](around:10000,${pos.lat},${pos.lng});way["amenity"="place_of_worship"]["religion"="muslim"](around:10000,${pos.lat},${pos.lng});relation["amenity"="place_of_worship"]["religion"="muslim"](around:10000,${pos.lat},${pos.lng}););out center 60;`;
    const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    const one = async (url) => {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: timeout(25000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j || !Array.isArray(j.elements)) throw new Error('رد غريب');
      return j.elements.map((e) => {
        const t = e.tags || {}, lat = e.lat || (e.center && e.center.lat), lng = e.lon || (e.center && e.center.lon);
        const addr = [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:postcode'], t['addr:city']].filter(Boolean).join('، ');
        return { name: t['name:ar'] || t.name || t['name:fr'] || 'مسجد / مصلّى', addr, lat, lng, src: 'osm' };
      }).filter((m) => m.lat);
    };
    const osm = Promise.any(servers.map(one)).catch((e) => ({ error: (e.errors && e.errors[0] && e.errors[0].message) || 'السيرفرات ما ردّت' }));
    const m = await Promise.race([maw, new Promise((r) => setTimeout(() => r(undefined), 6000))]);
    if (m) return { src: 'mawaqit', list: m };
    const o = await osm;
    if (Array.isArray(o)) return { src: 'osm', list: o };
    const m2 = await maw; if (m2) return { src: 'mawaqit', list: m2 };
    return { src: 'none', list: [], error: o.error };
  }
  /** المسافة والوقت بالطريق (سيارة ومشي) لكل مسجد — OSRM */
  async function roadTimes(pos, list) {
    if (!list.length) return;
    const coords = [pos, ...list].map((p) => p.lng.toFixed(6) + ',' + p.lat.toFixed(6)).join(';');
    const dest = list.map((_, i) => i + 1).join(';');
    const get = async (prof, base) => {
      try {
        const r = await fetch(`${base}/table/v1/${prof}/${coords}?sources=0&destinations=${dest}&annotations=duration,distance`, { signal: timeout(12000) });
        const j = await r.json();
        return j.code === 'Ok' ? j : null;
      } catch (e) { return null; }
    };
    let [car, foot] = await Promise.all([get('driving', 'https://routing.openstreetmap.de/routed-car'), get('foot', 'https://routing.openstreetmap.de/routed-foot')]);
    if (!car) car = await get('driving', 'https://router.project-osrm.org');
    list.forEach((m, i) => {
      if (car && car.distances) { m.road = car.distances[0][i]; m.drive = car.durations[0][i]; }
      if (foot && foot.durations) { m.walk = foot.durations[0][i]; if (m.road == null) m.road = foot.distances[0][i]; }
    });
  }
  async function weather() {
    const p = S.mosque || S.calc || S.pos || { lat: 48.6921, lng: 6.1844 };
    const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lng +
      '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m' +
      '&hourly=temperature_2m,weather_code,is_day,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=6';
    const w = await (await fetch(u, { signal: timeout(10000) })).json();
    let i0 = w.hourly.time.findIndex((t) => new Date(t).getTime() >= Date.now() - 30 * 60000); if (i0 < 0) i0 = 0;
    const hours = [];
    for (let i = i0 + 1; i < w.hourly.time.length && hours.length < 5; i += 2) hours.push({ time: w.hourly.time[i], temp: w.hourly.temperature_2m[i], code: w.hourly.weather_code[i], day: w.hourly.is_day[i], rain: w.hourly.precipitation_probability ? w.hourly.precipitation_probability[i] : null });
    return {
      temp: w.current.temperature_2m, feels: w.current.apparent_temperature, code: w.current.weather_code, day: w.current.is_day, wind: w.current.wind_speed_10m, humidity: w.current.relative_humidity_2m,
      min: w.daily.temperature_2m_min[0], max: w.daily.temperature_2m_max[0], hours, updated: Date.now(), city: S.city,
      days: w.daily.time.slice(1, 6).map((d, i) => ({ date: d, code: w.daily.weather_code[i + 1], max: w.daily.temperature_2m_max[i + 1], min: w.daily.temperature_2m_min[i + 1] })),
    };
  }

  // ---------------- الصوت ----------------
  let actx = null, unlocked = false;
  const audio = new Audio(); audio.preload = 'auto';
  let current = null, queue = [], synthStop = null;
  function ctx() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
  function unlock() {
    if (unlocked) return true;
    try {
      ctx().resume();
      audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
      audio.play().catch(() => {});
      unlocked = true;
    } catch (e) { /* */ }
    return unlocked;
  }
  /** نغمات مولّدة: تكبيرة (نغمة صاعدة) أو تنبيه هادئ */
  function synth(kind, vol, onEnd) {
    const c = ctx(); c.resume();
    const g = c.createGain(); g.gain.value = Math.max(0.0001, vol); g.connect(c.destination);
    const notes = kind === 'takbir' ? [[392, 0, .7], [440, .75, .7], [494, 1.5, .7], [523, 2.25, 1.6]] : [[660, 0, .5], [880, .55, .9]];
    const oscs = notes.map(([f, at, dur]) => {
      const o = c.createOscillator(), e = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      e.gain.setValueAtTime(0, c.currentTime + at); e.gain.linearRampToValueAtTime(1, c.currentTime + at + .05);
      e.gain.exponentialRampToValueAtTime(0.001, c.currentTime + at + dur);
      o.connect(e); e.connect(g); o.start(c.currentTime + at); o.stop(c.currentTime + at + dur + .05);
      return o;
    });
    const total = Math.max(...notes.map(([, at, dur]) => at + dur)) * 1000 + 100;
    const t = setTimeout(() => { synthStop = null; onEnd && onEnd(); }, total);
    synthStop = () => { clearTimeout(t); oscs.forEach((o) => { try { o.stop(); } catch (e) { /* */ } }); synthStop = null; };
  }
  function quietFactor(d) {
    const q = S.quiet; if (!q.on) return 1;
    const m = d.getHours() * 60 + d.getMinutes(), mm = (s) => { const [h, x] = s.split(':').map(Number); return h * 60 + x; };
    const a = mm(q.from), b = mm(q.to), inside = a <= b ? m >= a && m < b : m >= a || m < b;
    return inside ? null : 1;
  }
  /** يشغّل عنصراً من المكتبة. item: {src, vol(0..1), title, kind} */
  async function play(item) {
    if (current) { queue.push(item); return; }
    current = { kind: item.kind, title: item.title, volume: item.vol };
    const it = libItem(item.src) || BUILTIN[item.kind === 'azan' ? 0 : 1];
    const done = () => { current = null; const n = queue.shift(); if (n) play(n); };
    if (it.synth) { synth(it.synth, item.vol, done); return; }
    const blob = await getAudio(it.id);
    if (!blob) { synth(item.kind === 'azan' ? 'takbir' : 'tone', item.vol, done); return; }
    const url = URL.createObjectURL(blob);
    audio.src = url; audio.volume = Math.max(0, Math.min(1, item.vol));
    audio.onended = () => { URL.revokeObjectURL(url); done(); };
    audio.onerror = () => { URL.revokeObjectURL(url); synth('tone', item.vol, done); };
    try { await audio.play(); } catch (e) { audio.onerror(); }
  }
  function stop() { queue = []; try { audio.pause(); } catch (e) { /* */ } if (synthStop) synthStop(); current = null; }
  function setVolume(v) { v = Math.max(0, Math.min(1, v)); audio.volume = v; if (current) current.volume = v; return v; }

  // ---------------- المنبّه (وقت الصفحة مفتوحة) ----------------
  const fired = new Set();
  function events(date) {
    const t = times(date), out = [], day = ymd(date), qf = quietFactor;
    S.prayers.forEach((p, i) => {
      const k = KEYS[i], at = t[k]; if (!at || p.mode === 3) return;
      const vol = p.vol / 100;
      if (p.remind && p.before) out.push({ id: day + 'rem' + i, at: new Date(+at - p.before * 60000), item: { src: 'tone', kind: 'reminder', vol, title: 'باقي ' + p.before + ' دقيقة على ' + NAMES[i] } });
      const src = p.mode === 1 ? 'takbir' : (i === 0 && S.fajr ? S.fajr : S.azan);
      out.push({ id: day + 'azan' + i, at, prayer: i, item: { src: p.mode === 2 ? 'tone' : src, kind: 'azan', vol, title: 'أذان ' + NAMES[i] }, dua: p.dua && p.mode === 0, after: p.after ? p.afterSrc : null });
    });
    if (S.adhkarOn) {
      out.push({ id: day + 'am', at: new Date(+t.sunrise + S.am.after * 60000), item: { src: S.am.src, kind: 'adhkar', vol: S.prayers[0].vol / 100, title: 'أذكار الصباح' } });
      out.push({ id: day + 'pm', at: new Date(+t.asr + S.pm.after * 60000), item: { src: S.pm.src, kind: 'adhkar', vol: S.prayers[2].vol / 100, title: 'أذكار المساء' } });
    }
    const J = S.occ.jumua;
    if (J.on && date.getDay() === 5) {
      const hm = (s) => { const [h, m] = s.split(':').map(Number); const d = new Date(date); d.setHours(h, m, 0, 0); return d; };
      if (J.items.kahf.on && J.items.kahf.src) out.push({ id: day + 'kahf', at: hm(J.items.kahf.at), item: { src: J.items.kahf.src, kind: 'occ', vol: S.prayers[1].vol / 100, title: 'سورة الكهف' } });
      if (J.items.before.on) out.push({ id: day + 'jb', at: new Date(+t.dhuhr - J.items.before.min * 60000), item: { src: 'tone', kind: 'reminder', vol: S.prayers[1].vol / 100, title: 'صلاة الجمعة بعد ' + J.items.before.min + ' دقيقة' } });
    }
    return out;
  }
  function tick() {
    if (!S.setupDone) return;
    const now = Date.now();
    for (const d of [new Date()]) {
      for (const e of events(d)) {
        if (fired.has(e.id) || +e.at > now || now - +e.at > 90000) continue;
        fired.add(e.id);
        const q = quietFactor(new Date());
        const vol = q === null ? Math.min(e.item.vol, S.quiet.vol / 100) : e.item.vol;
        play({ ...e.item, vol });
        if (e.dua && S.duaSrc) play({ src: S.duaSrc, kind: 'dua', vol, title: 'الدعاء بعد الأذان' });
        if (e.after) setTimeout(() => play({ src: e.after, kind: 'adhkar', vol, title: 'أذكار بعد الصلاة' }), 10 * 60000);
        notify(e.item.title);
      }
    }
  }
  function notify(title) {
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('أذان تيك', { body: title, tag: 'azantech', silent: true }); } catch (e) { /* */ }
  }
  setInterval(tick, 1000);

  // ---------------- حالة الشاشة (نفس شكل /api/state بأذان البيت) ----------------
  function hijriMonth(d) {
    try { return +new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric' }).format(new Date(+d + (S.calc ? S.calc.hijri : 0) * 864e5)); } catch (e) { return 0; }
  }
  function state() {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    const tm = new Date(d); tm.setDate(d.getDate() + 1);
    const t = times(d), t2 = times(tm);
    const iso = (o) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v && v.toISOString ? v.toISOString() : v]));
    return {
      settings: {
        display: S.display,
        prayers: S.prayers.map((p) => ({ enabled: p.mode !== 3, volume: p.vol / 100, dua: p.dua, remind: p.remind, before: p.before })),
        ramadan: { auto: S.occ.ramadan.on, iftarDua: S.occ.ramadan.items.iftar.on, wird: true, juzPerDay: 1, qiyam: S.occ.qadr.on },
      },
      today: iso(t), tomorrow: iso(t2),
      iqamaToday: iso(iqama(d, t)), iqamaTomorrow: iso(iqama(tm, t2)),
      mosque: S.mosque && !S.calc ? { name: S.mosque.name, jumua: S.mosque.jumua } : (S.calc ? { name: (S.calc.city || S.city || 'موقعك') + ' · مواقيت محسوبة', jumua: '' } : null),
      hijriAdjTotal: S.calc ? S.calc.hijri || 0 : 0,
      ramadan: hijriMonth(new Date()) === 9,
      imsakMin: S.occ.ramadan.items.imsak.min || 10,
      nowPlaying: current ? { kind: current.kind, title: current.title, volume: current.volume } : null,
      activeVolume: current ? current.volume : null,
      memos: [],
    };
  }

  // ---------------- «السيرفر» المحلي: الشاشة بتطلب /api/... وهون منجاوب ----------------
  const realFetch = window.fetch.bind(window);
  const J = (o, code) => new Response(JSON.stringify(o), { status: code || 200, headers: { 'Content-Type': 'application/json' } });
  let wcache = null;
  window.fetch = async function (input, opt) {
    const url = typeof input === 'string' ? input : input.url;
    const u = new URL(url, location.href);
    // بس طلبات الشاشة لنفس الموقع (/api/...) — مش Mawaqit ولا خرائط ولا غيرها
    if (u.origin !== location.origin) return realFetch(input, opt);
    const p = u.pathname.replace(/^.*\/api\//, '/api/');
    if (!/\/api\//.test(u.pathname)) return realFetch(input, opt);
    let body = {}; try { body = opt && opt.body ? JSON.parse(opt.body) : {}; } catch (e) { /* */ }
    if (p === '/api/state') return J(state());
    if (p === '/api/weather') {
      try { if (!wcache || Date.now() - wcache.at > 10 * 60000) wcache = { at: Date.now(), data: await weather() }; return J(wcache.data); }
      catch (e) { return J({ error: 'ما في طقس هلّق' }, 503); }
    }
    if (p === '/api/update/info') return J({ version: VERSION });
    if (p === '/api/stop') { stop(); return J({ ok: true }); }
    if (p === '/api/volume') { const v = setVolume(typeof body.level === 'number' ? body.level : (current ? current.volume : .5) + (+body.delta || 0)); return J({ level: v }); }
    return J({ ok: true });
  };

  window.AzanTech = {
    get S() { return S; }, save, reset, DEFAULTS, NAMES, KEYS, VERSION,
    lib, libItem, putAudio, delAudio, getAudio, play, stop, unlock, get unlocked() { return unlocked; },
    times, iqama, timesSource, refreshMosque, findMosques, roadTimes, reverse, geocode, ymd,
  };

  // تحديث مواقيت المسجد مرة باليوم
  if (S.setupDone && S.autoRefresh) refreshMosque();
})();

// حساب مواقيت الصلاة (نفس خوارزمية PrayerCalc.java) — كل الطرق المعروفة
const PT = (function () {
  const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
  const sin = (d) => Math.sin(rad(d)), cos = (d) => Math.cos(rad(d)), tan = (d) => Math.tan(rad(d));
  const asin = (x) => deg(Math.asin(x)), acos = (x) => deg(Math.acos(x)), atan2 = (y, x) => deg(Math.atan2(y, x)), acot = (x) => deg(Math.atan(1 / x));
  const fixA = (a) => { a -= 360 * Math.floor(a / 360); return a < 0 ? a + 360 : a; };
  const fixH = (a) => { a -= 24 * Math.floor(a / 24); return a < 0 ? a + 24 : a; };
  const METHODS = {
    mwl: { name: 'رابطة العالم الإسلامي', fajr: 18, isha: 17 },
    uoif: { name: 'اتحاد مسلمي فرنسا (12°)', fajr: 12, isha: 12 },
    isna: { name: 'أمريكا الشمالية (ISNA)', fajr: 15, isha: 15 },
    egypt: { name: 'الهيئة المصرية العامة للمساحة', fajr: 19.5, isha: 17.5 },
    umm: { name: 'أم القرى (السعودية)', fajr: 18.5, ishaMin: 90 },
    karachi: { name: 'جامعة العلوم الإسلامية — كراتشي', fajr: 18, isha: 18 },
    diyanet: { name: 'رئاسة الشؤون الدينية — تركيا', fajr: 18, isha: 17 },
    gulf: { name: 'منطقة الخليج', fajr: 19.5, ishaMin: 90 },
    kuwait: { name: 'الكويت', fajr: 18, isha: 17.5 },
    qatar: { name: 'قطر', fajr: 18, ishaMin: 90 },
    singapore: { name: 'سنغافورة وماليزيا وإندونيسيا', fajr: 20, isha: 18 },
    tehran: { name: 'معهد الجيوفيزياء — طهران', fajr: 17.7, isha: 14, maghrib: 4.5 },
  };
  const BY_COUNTRY = { FR: 'uoif', SA: 'umm', AE: 'gulf', OM: 'gulf', BH: 'gulf', KW: 'kuwait', QA: 'qatar', EG: 'egypt', SY: 'egypt', LB: 'egypt', JO: 'egypt', IQ: 'egypt', PS: 'egypt', SD: 'egypt', LY: 'egypt', TR: 'diyanet', PK: 'karachi', IN: 'karachi', BD: 'karachi', AF: 'karachi', IR: 'tehran', US: 'isna', CA: 'isna', SG: 'singapore', MY: 'singapore', ID: 'singapore', BN: 'singapore' };
  const HIGH = { angle: 'نسبة الزاوية (الأدق لأوروبا)', mid: 'منتصف الليل', seventh: 'سُبع الليل', none: 'بدون تعديل' };

  function julian(y, m, d) { if (m <= 2) { y--; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
  function sunPos(jd) {
    const D = jd - 2451545.0, g = fixA(357.529 + 0.98560028 * D), q = fixA(280.459 + 0.98564736 * D);
    const L = fixA(q + 1.915 * sin(g) + 0.020 * sin(2 * g)), e = 23.439 - 0.00000036 * D;
    const RA = atan2(cos(e) * sin(L), cos(L)) / 15;
    return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fixH(RA) };
  }
  const midDay = (jd, t) => fixH(12 - sunPos(jd + t).eqt);
  function angleTime(jd, angle, t, ccw, lat) {
    const decl = sunPos(jd + t).decl, noon = midDay(jd, t);
    const v = (-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
    if (v > 1 || v < -1) return NaN;
    const T = acos(v) / 15;
    return noon + (ccw ? -T : T);
  }
  function asrTime(jd, f, t, lat) { const decl = sunPos(jd + t).decl; return angleTime(jd, -acot(f + tan(Math.abs(lat - decl))), t, false, lat); }

  /** @returns {fajr,sunrise,dhuhr,asr,maghrib,isha} كتواريخ JS */
  function compute(date, o) {
    const m = METHODS[o.method] || METHODS.mwl, lat = +o.lat, lng = +o.lng, asrF = +o.asr || 1, high = o.high || 'angle';
    const y = date.getFullYear(), mo = date.getMonth() + 1, d = date.getDate();
    const jd = julian(y, mo, d) - lng / (15 * 24);
    let t = [5, 6, 12, 13, 18, 18, 18];
    for (let i = 0; i < 2; i++) {
      const p = t.map((x) => x / 24);
      t = [angleTime(jd, m.fajr, p[0], true, lat), angleTime(jd, 0.833, p[1], true, lat), midDay(jd, p[2]), asrTime(jd, asrF, p[3], lat),
        angleTime(jd, 0.833, p[4], false, lat), m.maghrib ? angleTime(jd, m.maghrib, p[5], false, lat) : NaN,
        m.ishaMin ? NaN : angleTime(jd, m.isha, p[6], false, lat)];
      if (!m.maghrib) t[5] = t[4];
    }
    t = t.map((x) => x - lng / 15);
    if (m.ishaMin) t[6] = t[5] + m.ishaMin / 60;
    const night = 24 + t[1] - t[4];
    const portion = (a) => high === 'mid' ? night / 2 : high === 'seventh' ? night / 7 : a / 60 * night;
    if (high !== 'none') {
      const fp = portion(m.fajr); if (isNaN(t[0]) || t[1] - t[0] > fp) t[0] = t[1] - fp;
      if (!m.ishaMin) { const ip = portion(m.isha); if (isNaN(t[6]) || t[6] - t[4] > ip) t[6] = t[4] + ip; }
    }
    const off = o.offsets || [0, 0, 0, 0, 0], map = [0, -1, 1, 2, 3, 4], keys = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const base = Date.UTC(y, mo - 1, d), out = {};
    [t[0], t[1], t[2], t[3], t[5], t[6]].forEach((h, k) => {
      if (map[k] >= 0) h += (+off[map[k]] || 0) / 60;
      out[keys[k]] = isNaN(h) ? null : new Date(Math.round((base + h * 3600e3) / 60000) * 60000);
    });
    return out;
  }
  // القبلة: أقصر طريق على الكرة الأرضية (نفس طريقة Google)
  const KAABA = [21.4224779, 39.8251832];
  function qibla(lat, lng) {
    const b = atan2(sin(KAABA[1] - lng), cos(lat) * tan(KAABA[0]) - sin(lat) * cos(KAABA[1] - lng));
    return fixA(b);
  }
  function km(a1, o1, a2, o2) { const dA = rad(a2 - a1), dO = rad(o2 - o1); const h = Math.sin(dA / 2) ** 2 + Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(dO / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); }
  return { compute, METHODS, BY_COUNTRY, HIGH, qibla, km, KAABA };
})();
if (typeof module !== 'undefined') module.exports = PT;

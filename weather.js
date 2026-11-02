/* أيقونات طقس متحركة (SVG + CSS) — بدون مكتبات */
(function () {
  'use strict';

  const DESC = {
    0: 'صافي', 1: 'صافي غالباً', 2: 'غيوم متفرقة', 3: 'غائم', 45: 'ضباب', 48: 'ضباب متجمّد',
    51: 'رذاذ خفيف', 53: 'رذاذ', 55: 'رذاذ كثيف', 56: 'رذاذ متجمّد', 57: 'رذاذ متجمّد',
    61: 'مطر خفيف', 63: 'مطر', 65: 'مطر غزير', 66: 'مطر متجمّد', 67: 'مطر متجمّد',
    71: 'تلج خفيف', 73: 'تلج', 75: 'تلج كتير', 77: 'حبيبات تلج',
    80: 'زخات خفيفة', 81: 'زخات مطر', 82: 'زخات قوية', 85: 'زخات تلج', 86: 'زخات تلج قوية',
    95: 'عاصفة رعدية', 96: 'عاصفة مع برد', 99: 'عاصفة مع برد',
  };

  function kind(code) {
    if (code === 0) return 'clear';
    if (code === 1 || code === 2) return 'partly';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 95) return 'storm';
    return 'cloudy';
  }

  const sun = (cx, cy, r) =>
    `<g class="wx-sun"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#f5c451"/>` +
    `<g class="wx-rays" style="transform-origin:${cx}px ${cy}px">` +
    Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4, r1 = r + 5, r2 = r + 11;
      return `<line x1="${cx + r1 * Math.cos(a)}" y1="${cy + r1 * Math.sin(a)}" x2="${cx + r2 * Math.cos(a)}" y2="${cy + r2 * Math.sin(a)}" stroke="#f5c451" stroke-width="3.2" stroke-linecap="round"/>`;
    }).join('') + '</g></g>';

  const moon = (cx, cy, r) =>
    `<g class="wx-moon"><path d="M${cx + r * 0.35} ${cy - r} a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55} a${r * 0.82} ${r * 0.82} 0 1 1 ${-r * 0.65} ${-r * 1.55}z" fill="#e9e3c8"/></g>` +
    `<circle class="wx-star" cx="${cx - r - 6}" cy="${cy - r + 2}" r="1.6" fill="#e9e3c8"/>` +
    `<circle class="wx-star s2" cx="${cx + r + 8}" cy="${cy + 4}" r="1.3" fill="#e9e3c8"/>`;

  const cloud = (x, y, s, fill, cls) =>
    `<g class="${cls || 'wx-cloud'}"><path transform="translate(${x} ${y}) scale(${s})" fill="${fill}" d="M14 34h34a12 12 0 0 0 0-24a17 17 0 0 0-32-3A13 13 0 0 0 14 34z"/></g>`;

  const drops = (n, color, cls) =>
    Array.from({ length: n }, (_, i) => `<line class="${cls}" style="animation-delay:${(i * 0.27).toFixed(2)}s" x1="${26 + i * 11}" y1="58" x2="${23 + i * 11}" y2="66" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`).join('');

  const flakes = (n) =>
    Array.from({ length: n }, (_, i) => `<circle class="wx-flake" style="animation-delay:${(i * 0.5).toFixed(2)}s" cx="${26 + i * 12}" cy="60" r="2.6" fill="#ffffff"/>`).join('');

  function icon(code, isDay) {
    const k = kind(code);
    const day = isDay !== 0;
    let body = '';
    if (k === 'clear') body = day ? sun(40, 40, 15) : moon(38, 40, 16);
    else if (k === 'partly') body = (day ? sun(30, 28, 11) : moon(30, 28, 11)) + cloud(16, 26, 0.95, '#d7dde0');
    else if (k === 'cloudy') body = cloud(2, 12, 0.8, '#8f9aa0', 'wx-cloud slow') + cloud(16, 24, 0.95, '#d7dde0');
    else if (k === 'fog') body = cloud(14, 8, 0.9, '#aab4b9') +
      '<g class="wx-fog"><line x1="12" y1="52" x2="62" y2="52"/><line x1="20" y1="60" x2="70" y2="60"/><line x1="10" y1="68" x2="56" y2="68"/></g>';
    else if (k === 'drizzle') body = cloud(14, 8, 0.95, '#b9c3c8') + drops(4, '#7fc1ec', 'wx-drop slow');
    else if (k === 'rain') body = cloud(14, 8, 0.95, '#9aa6ac') + drops(5, '#5fb0ea', 'wx-drop');
    else if (k === 'snow') body = cloud(14, 8, 0.95, '#c9d2d6') + flakes(4);
    else if (k === 'storm') body = cloud(14, 8, 0.95, '#6f7a80') +
      '<path class="wx-bolt" d="M44 46 L34 62 h9 l-5 14 l14-19 h-9 l6-11z" fill="#f5c451"/>' + drops(3, '#5fb0ea', 'wx-drop');
    return `<svg class="wx wx-${k}" viewBox="0 0 80 80" aria-hidden="true">${body}</svg>`;
  }

  window.WX = { icon, kind, desc: (c) => DESC[c] || '' };
})();

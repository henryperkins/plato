/** Shared branding utilities — used by BrandingContext and public auth pages. */

/**
 * Normalize a CSS color to `#rrggbb`, or return null when it cannot be parsed.
 * Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, bare hex, and
 * `rgb()`/`rgba()` — legacy or API-set themes are not always six-digit hex,
 * and dropping them silently loses all classroom branding.
 */
export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const rgb = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+%?)?\s*\)$/i);
  if (rgb) {
    return '#' + rgb.slice(1, 4).map(c => Math.min(255, Number(c)).toString(16).padStart(2, '0')).join('');
  }
  const hex = trimmed.match(/^#?([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!hex) return null;
  const digits = hex[1].toLowerCase();
  if (digits.length === 3) return '#' + [...digits].map(c => c + c).join('');
  if (digits.length === 4) return '#' + [...digits.slice(0, 3)].map(c => c + c).join('');
  return '#' + digits.slice(0, 6);
}

function channelsOf(hex) {
  const normalized = normalizeHex(hex) || '#000000';
  return [1, 3, 5].map(index => parseInt(normalized.slice(index, index + 2), 16));
}

/** Relative luminance (0=black, 1=white). */
export function luminance(hex) {
  const [r255, g255, b255] = channelsOf(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Keep the familiar near-black when possible; pure black closes its contrast gap. */
export function contrastText(bgHex) {
  const white = contrastRatio('#ffffff', bgHex);
  const dark = contrastRatio('#1a1a1a', bgHex);
  if (white >= 4.5 && white >= dark) return '#ffffff';
  return dark >= 4.5 ? '#1a1a1a' : '#000000';
}

/** Adjust only failing colors toward a readable endpoint, retaining their hue. */
export function readableColor(hex, background, minimum = 4.6) {
  const normalized = normalizeHex(hex);
  if (!normalized) return hex;
  if (contrastRatio(normalized, background) >= minimum) return normalized;
  const endpoint = contrastText(background) === '#ffffff' ? 255 : 0;
  const channels = channelsOf(normalized);
  for (let step = 1; step <= 100; step++) {
    const adjusted = '#' + channels.map(channel =>
      Math.round(channel + (endpoint - channel) * step / 100).toString(16).padStart(2, '0')
    ).join('');
    if (contrastRatio(adjusted, background) >= minimum) return adjusted;
  }
  return endpoint === 255 ? '#ffffff' : '#000000';
}

/** Convert hex to oklch string. */
export function hexToOklch(hex) {
  const [r255, g255, b255] = channelsOf(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = lin(r), lg = lin(g), lb = lin(b);
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l = Math.cbrt(l_), m = Math.cbrt(m_), s = Math.cbrt(s_);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bOk = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.sqrt(a * a + bOk * bOk);
  const h = (Math.atan2(bOk, a) * 180 / Math.PI + 360) % 360;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)})`;
}

/** Build CSS var overrides from theme primary/accent. */
export function buildThemeVars(theme) {
  const vars = {};
  if (!theme) return vars;
  const primary = normalizeHex(theme.primary);
  const accent = normalizeHex(theme.accent) || primary;
  if (primary) {
    vars['--classroom-header-bg'] = primary;
    vars['--classroom-header-text'] = contrastText(primary);
    vars['--primary'] = hexToOklch(primary);
    vars['--primary-foreground'] = hexToOklch(contrastText(primary));
    vars['--classroom-primary-text-light'] = hexToOklch(readableColor(primary, '#f5f5f5'));
    vars['--classroom-primary-text-dark'] = hexToOklch(readableColor(primary, '#303030'));
  }
  if (accent) {
    vars['--classroom-link-light'] = hexToOklch(readableColor(accent, '#f5f5f5'));
    vars['--classroom-link-dark'] = hexToOklch(readableColor(accent, '#303030'));
    vars['--classroom-ring-light'] = vars['--classroom-link-light'];
    vars['--classroom-ring-dark'] = vars['--classroom-link-dark'];
    // Restore the pre-rework contract: consumers that apply these vars
    // without `.classroom-theme` still get a themed focus ring instead of
    // silently falling back to the default purple. The dark rule in
    // index.css overrides this inline (light) value with !important.
    vars['--ring'] = vars['--classroom-ring-light'];
  }
  return vars;
}

/**
 * Generate a favicon: classroom logo (or text initial) on a rounded-rect background.
 * Returns a data URL suitable for <link rel="icon">.
 * @param {string|null} logoBase64 - logo image data URL, or null for text-based
 * @param {string} primaryColor - background color
 * @param {string} classroomName - used for text initial when no logo image
 */
export function generateFavicon(logoBase64, primaryColor, classroomName = '') {
  return new Promise((resolve) => {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Rounded rect background
    const radius = 6;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fillStyle = primaryColor;
    ctx.fill();

    if (logoBase64) {
      // Draw logo image centered with padding
      const img = new Image();
      img.onload = () => {
        const pad = 4;
        const area = size - pad * 2;
        const scale = Math.min(area / img.width, area / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = logoBase64;
    } else {
      // Draw text initial
      const initial = (classroomName || 'P').charAt(0).toUpperCase();
      const textColor = contrastText(primaryColor);
      ctx.fillStyle = textColor;
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial, size / 2, size / 2 + 1);
      resolve(canvas.toDataURL('image/png'));
    }
  });
}

/** Set (or restore) the favicon link element. Returns a cleanup function. */
export function setFavicon(dataUrl) {
  const link = document.querySelector("link[rel='icon']") || document.createElement('link');
  const original = link.href;
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = dataUrl;
  document.head.appendChild(link);
  return () => { link.href = original; };
}

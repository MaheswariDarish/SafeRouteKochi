// Map marker icons — a teardrop pin with an emoji glyph, built as an inline
// SVG data: URI (no external assets, CSP-safe). Used by every map layer so a
// marker's meaning is readable at a glance instead of "which colour was that".

const pinSvg = (color, glyph) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">` +
  `<path d="M15 0C6.7 0 0 6.7 0 15c0 10.4 12.6 22.8 14.1 24.2a1.3 1.3 0 0 0 1.8 0` +
  `C17.4 37.8 30 25.4 30 15 30 6.7 23.3 0 15 0z" fill="${color}"/>` +
  `<circle cx="15" cy="15" r="10.5" fill="#fff"/>` +
  `<text x="15" y="15" font-size="13" text-anchor="middle" dominant-baseline="central">${glyph}</text>` +
  `</svg>`;

/** google.maps Marker `icon` config for a glyph pin. Returns undefined until
 *  the Maps SDK is on `window` (so callers can spread it safely). */
export function pinIcon(color, glyph) {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  const g = window.google.maps;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(pinSvg(color, glyph))}`,
    scaledSize: new g.Size(30, 40),
    anchor: new g.Point(15, 40),
    labelOrigin: new g.Point(15, 15),
  };
}

/** A flat dot (for aggregates like rating spots where a count sits on top). */
export function dotIcon(color, scale = 11) {
  if (typeof window === 'undefined' || !window.google?.maps) return undefined;
  const g = window.google.maps;
  return {
    path: g.SymbolPath.CIRCLE,
    scale,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 2,
  };
}

export const FEATURE_GLYPH = {
  streetlight_ok: '💡',
  streetlight_broken: '💡',
  streetlight_missing: '💡',
  pothole: '🕳️',
  police_station: '🚔',
  dark_area: '🌑',
  cctv: '📹',
  police_aid: '🚑',
  unsafe_spot: '⚠️',
  other: '📍',
};

export const LIVE_GLYPH = {
  flooding: '🌊',
  accident: '💥',
  road_blocked: '🚧',
  protest_crowd: '📢',
  police_activity: '🚔',
  harassment: '🚨',
  hazard: '⚠️',
  power_cut: '🔌',
  street_food: '🍜',
  live_music: '🎵',
  festival: '🎉',
  market: '🛍️',
  good_view: '🌅',
  screening: '📺',
  other: '📣',
};

export const EVENT_GLYPH = '📅';
export const POLICE_GLYPH = '🚔';
export const LIT_GLYPH = '💡';

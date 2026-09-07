// Shared visual + label metadata for community map features (streetlights, etc.)
export const FEATURE_STYLE = {
  streetlight_ok: { color: '#f9ab00', label: 'Streetlight — working' },
  streetlight_broken: { color: '#d93025', label: 'Streetlight — broken' },
  streetlight_missing: { color: '#80868b', label: 'Streetlight — missing' },
  pothole: { color: '#f57c00', label: 'Pothole' },
  police_station: { color: '#1a73e8', label: 'Police station' },
  dark_area: { color: '#3c4043', label: 'Dark area' },
  cctv: { color: '#1a73e8', label: 'CCTV camera' },
  police_aid: { color: '#1e8e3e', label: 'Police aid post' },
  unsafe_spot: { color: '#d93025', label: 'Unsafe spot' },
  other: { color: '#5f6368', label: 'Note' },
};

export const FEATURE_TYPE_ORDER = [
  'streetlight_ok',
  'streetlight_broken',
  'streetlight_missing',
  'pothole',
  'police_station',
  'dark_area',
  'cctv',
  'police_aid',
  'unsafe_spot',
  'other',
];

// Fixed vocabulary of "what's wrong here" tags for a subjective safety rating.
// Keys must match backend schemas.SafetyTag.
export const SAFETY_TAG_LABELS = {
  poor_lighting: 'Poor lighting',
  isolated: 'Isolated / lonely',
  no_footfall: 'No one around',
  harassment_risk: 'Harassment risk',
  recent_incident: 'Recent incident',
  stray_dogs: 'Stray dogs',
  bad_footpath: 'Bad footpath',
  traffic_risk: 'Traffic danger',
  flooding: 'Floods / waterlogging',
};

// Types that describe a problem which can later be fixed — these get a
// "Mark as repaired" action wherever features are listed. Informational
// types (a working streetlight, a CCTV camera, a police post) don't.
export const RESOLVABLE_FEATURE_TYPES = new Set([
  'streetlight_broken',
  'streetlight_missing',
  'pothole',
  'dark_area',
  'unsafe_spot',
]);

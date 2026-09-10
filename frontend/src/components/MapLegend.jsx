import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

// Rows keyed to the layer toggles — only the active layers are listed, so the
// legend always matches what's actually on the map.
export default function MapLegend({
  showFeatures,
  showRatings,
  showLive,
  showEvents,
  showPolice,
  showLighting,
  hasRoutes,
}) {
  const [open, setOpen] = useState(true);

  const rows = [];
  if (showPolice) rows.push(['🚔', 'Police station']);
  if (showFeatures) {
    rows.push(['💡', 'Streetlight']);
    rows.push(['🕳️', 'Pothole']);
    rows.push(['⚠️', 'Unsafe spot / hazard']);
  }
  if (showLive || hasRoutes) {
    rows.push(['🌊', 'Live alert (flooding, accident…)']);
    rows.push(['🎉', 'Live vibe (music, market…)']);
  }
  if (showEvents) rows.push(['📅', 'Event']);
  if (showRatings) rows.push(['②', 'Safety-rating spot (count · red→green)']);
  if (showLighting) rows.push(['🟡', 'Well-lit road']);
  rows.push(['🔵', 'You']);

  return (
    <div className={`gm-legend ${open ? '' : 'collapsed'}`}>
      <button className="gm-legend-head" onClick={() => setOpen((o) => !o)}>
        <span>Map key</span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <ul>
          {rows.map(([g, label], i) => (
            <li key={i}>
              <span className="gm-legend-glyph">{g}</span>
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

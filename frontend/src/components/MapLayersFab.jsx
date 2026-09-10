import React from 'react';
import {
  Shield,
  Lightbulb,
  Siren,
  MapPin,
  FileText,
  CalendarDays,
  TriangleAlert,
  Users,
  Radio,
} from 'lucide-react';

export default function MapLayersFab({
  showSafety,
  onToggleSafety,
  showPolice,
  onTogglePolice,
  showLighting,
  onToggleLighting,
  showFeatures,
  onToggleFeatures,
  showEvents,
  onToggleEvents,
  showPotholeZones,
  onTogglePotholeZones,
  showRatings,
  onToggleRatings,
  showLive,
  onToggleLive,
  onOpenLive,
  onOpenEvents,
  onOpenReport,
}) {
  return (
    <div className="gm-floating-layers">
      <button
        className={`gm-layer-btn ${showSafety ? 'active' : ''}`}
        onClick={onToggleSafety}
        title="Toggle safety score markers"
      >
        <Shield size={16} />
        <span>Safety score</span>
      </button>
      <button
        className={`gm-layer-btn ${showPolice ? 'active' : ''}`}
        onClick={onTogglePolice}
        title="Toggle police station markers"
      >
        <Siren size={16} />
        <span>Police stations</span>
      </button>
      <button
        className={`gm-layer-btn ${showFeatures ? 'active' : ''}`}
        onClick={onToggleFeatures}
        title="Toggle community streetlight, pothole & note pins (fixed ones hidden)"
      >
        <MapPin size={16} />
        <span>Streetlights &amp; notes</span>
      </button>
      <button
        className={`gm-layer-btn ${showLighting ? 'active' : ''}`}
        onClick={onToggleLighting}
        title="Toggle well-lit corridors"
      >
        <Lightbulb size={16} />
        <span>Street lighting</span>
      </button>
      <button
        className={`gm-layer-btn ${showPotholeZones ? 'active' : ''}`}
        onClick={onTogglePotholeZones}
        title="Toggle pothole-prone areas heatmap"
      >
        <TriangleAlert size={16} />
        <span>Pothole-prone areas</span>
      </button>
      <button
        className={`gm-layer-btn ${showRatings ? 'active' : ''}`}
        onClick={onToggleRatings}
        title="Toggle community safety-rating spots"
      >
        <Users size={16} />
        <span>Safety ratings</span>
      </button>
      <button
        className={`gm-layer-btn ${showLive ? 'active' : ''}`}
        onClick={onToggleLive}
        title="Toggle live 'happening now' reports"
      >
        <Radio size={16} />
        <span>Live reports</span>
      </button>
      <button
        className={`gm-layer-btn ${showEvents ? 'active' : ''}`}
        onClick={onToggleEvents}
        title="Toggle event pins on the map"
      >
        <CalendarDays size={16} />
        <span>Event pins</span>
      </button>
      <div className="gm-layer-divider" />
      <button className="gm-layer-btn" onClick={onOpenLive} title="Live reports feed">
        <Radio size={16} />
        <span>Happening now</span>
      </button>
      <button className="gm-layer-btn" onClick={onOpenEvents} title="Upcoming events in Kochi">
        <CalendarDays size={16} />
        <span>Events in Kochi</span>
      </button>
      <button className="gm-layer-btn" onClick={onOpenReport} title="Generate municipality report">
        <FileText size={16} />
        <span>Municipality report</span>
      </button>
    </div>
  );
}

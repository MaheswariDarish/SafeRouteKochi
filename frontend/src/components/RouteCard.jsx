import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  Lightbulb,
  Eye,
  Navigation,
  Clock,
  List,
  TriangleAlert,
} from 'lucide-react';

export default function RouteCard({
  route,
  label,
  isRecommended,
  isSelected,
  onSelect,
  onStart,
  onSteps,
  estimatedTime,
  estimatedDistance,
}) {
  const score = route.safety_score;
  const isHigh = score >= 75;
  const isMed = score >= 50 && score < 75;
  const badgeClass = isHigh ? 'safe' : isMed ? 'mod' : 'risky';

  return (
    <div
      className={`gm-route-card ${isRecommended ? 'recommended-route' : ''} ${
        route.smoother_alt ? 'smoother-route' : ''
      } ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="gm-route-top">
        <div className="gm-route-time">
          <span>{estimatedTime || '—'}</span>
          <span className="gm-route-distance">{estimatedDistance || ''}</span>
        </div>
        <div className={`gm-safety-badge ${badgeClass}`}>
          {isHigh ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
          <span>{score}/100</span>
        </div>
      </div>

      <div className="gm-route-title">
        {route.smoother_alt ? 'Smoother route' : label}
      </div>
      {route.summary && <div className="gm-route-via">via {route.summary}</div>}
      {route.smoother_alt && route.smoother_note && (
        <div className="gm-smoother-note">{route.smoother_note}</div>
      )}

      {route.duration_in_traffic_text && (
        <div className="gm-traffic-note">
          <Clock size={12} /> {route.duration_in_traffic_text} with current traffic
          {route.duration_typical_text && route.duration_typical_text !== route.duration_in_traffic_text && (
            <span className="gm-muted"> · usually {route.duration_typical_text}</span>
          )}
        </div>
      )}

      {route.pothole_count > 0 && (
        <div className="gm-pothole-note">
          <TriangleAlert size={12} /> {route.pothole_count} pothole
          {route.pothole_count > 1 ? 's' : ''} reported on this route
        </div>
      )}

      {route.worst_segment && (
        <div style={{ fontSize: '0.76rem', color: '#d93025', marginTop: '2px' }}>
          Lowest safety: {route.worst_segment.road_name} ({route.worst_segment.score}/100)
        </div>
      )}

      <div className="gm-factors-chips">
        <span className="gm-chip">
          <Lightbulb size={12} /> Avg {route.average_segment_score}/100
        </span>
        <span className="gm-chip">
          <Eye size={12} /> {route.segment_breakdown.length} waypoints
        </span>
        {isRecommended && (
          <span
            className="gm-chip"
            style={{ background: '#e6f4ea', color: '#1e8e3e', fontWeight: 600 }}
          >
            Safest
          </span>
        )}
      </div>

      {isSelected && (
        <div className="gm-route-actions">
          <button
            className="gm-route-start-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (onStart) onStart();
            }}
          >
            <Navigation size={14} /> Start in Google Maps
          </button>
          {route.steps?.length > 0 && (
            <button
              className="gm-route-steps-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onSteps) onSteps();
              }}
            >
              <List size={14} /> Steps
            </button>
          )}
        </div>
      )}
    </div>
  );
}

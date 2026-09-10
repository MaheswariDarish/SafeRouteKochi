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
  Users,
  MessageSquare,
  Radio,
} from 'lucide-react';

const liveAgo = (m) =>
  m == null ? '' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
import { SAFETY_TAG_LABELS } from '../lib/featureStyles';

const feelWord = (m) =>
  m == null ? '' : m < 2.5 ? 'feels unsafe' : m < 3.5 ? 'mixed' : 'feels ok';

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

      {route.live_alert_count > 0 && (
        <div className="gm-route-feedback-note warn">
          <Radio size={12} /> {route.live_alerts[0].category_label} reported on this route
          {route.live_alerts[0].age_min != null && <> · {liveAgo(route.live_alerts[0].age_min)}</>}
          {route.live_alert_count > 1 && <> · +{route.live_alert_count - 1} more</>}
        </div>
      )}

      {route.rating_spot_count > 0 && (
        <div className={`gm-route-feedback-note ${route.rating_low_count > 0 ? 'warn' : ''}`}>
          <Users size={12} /> {route.rating_spot_count} spot
          {route.rating_spot_count > 1 ? 's' : ''} people rated along this route
          {route.rating_mean != null && <> · avg {route.rating_mean}/5</>}
          {route.rating_low_count > 0 && (
            <> · {route.rating_low_count} feel{route.rating_low_count > 1 ? '' : 's'} unsafe</>
          )}
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

      {isSelected && route.live_alerts?.length > 0 && (
        <div className="gm-route-feedback" onClick={(e) => e.stopPropagation()}>
          <div className="gm-route-feedback-head">
            <Radio size={13} /> Happening now on this route
          </div>
          {route.live_alerts.map((a) => (
            <div key={a.report_id} className="gm-route-spot">
              <div className="gm-route-spot-head">
                <span className="gm-feel-dot bad" />
                <strong>{a.category_label}</strong>
                <span className="gm-muted"> · {liveAgo(a.age_min)} · {a.by}</span>
              </div>
              {a.note && <div className="gm-route-spot-comment"><div>{a.note}</div></div>}
            </div>
          ))}
        </div>
      )}

      {isSelected && route.rating_spots?.length > 0 && (
        <div className="gm-route-feedback" onClick={(e) => e.stopPropagation()}>
          <div className="gm-route-feedback-head">
            <Users size={13} /> What people say along this route
          </div>
          {route.rating_spots.map((s) => (
            <div key={s.spot_id} className="gm-route-spot">
              <div className="gm-route-spot-head">
                <span className={`gm-feel-dot ${s.mean == null ? '' : s.mean < 2.5 ? 'bad' : s.mean < 3.5 ? 'mid' : 'good'}`} />
                <strong>{s.mean != null ? `${s.mean}/5` : 'unrated'}</strong>
                <span className="gm-muted">
                  {' '}· {s.sample} rating{s.sample > 1 ? 's' : ''}
                  {feelWord(s.mean) && ` · ${feelWord(s.mean)}`}
                  {s.dominant_time && ` · mostly ${s.dominant_time === 'night' ? 'after dark' : 'daytime'}`}
                </span>
              </div>
              {Object.keys(s.tags || {}).length > 0 && (
                <div className="gm-route-spot-tags">
                  {Object.entries(s.tags).map(([t, n]) => (
                    <span key={t} className="gm-community-tag">
                      {SAFETY_TAG_LABELS[t] || t} ×{n}
                    </span>
                  ))}
                </div>
              )}
              {(s.comments || []).map((c, ci) => (
                <div key={ci} className="gm-route-spot-comment">
                  <MessageSquare size={11} />
                  <div>
                    <span className="gm-muted">{c.by} · {c.score}/5</span>
                    {c.comment && <div>{c.comment}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

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

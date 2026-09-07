import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Lightbulb,
  Shield,
  Droplets,
  AlertTriangle,
  Building2,
  Navigation,
  Plus,
  ClipboardList,
  CheckCircle2,
  Wrench,
  Users,
  MessageSquare,
} from 'lucide-react';
import {
  FEATURE_STYLE,
  RESOLVABLE_FEATURE_TYPES,
  SAFETY_TAG_LABELS,
} from '../lib/featureStyles';
import { apiFetch } from '../lib/api';
import SafetyRatingWidget from './SafetyRatingWidget';

function metresBetween(a, b) {
  const R = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function fmtDist(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export default function PlacePanel({
  place,
  placesService,
  onBack,
  onContribute,
  onDetailedAssessment,
  onConfirmFeature,
  contributorName,
}) {
  const [details, setDetails] = useState(null);
  const [context, setContext] = useState(null);
  const [nearby, setNearby] = useState({ police: null, hospital: null });
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [ratingReload, setRatingReload] = useState(0);

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setNearby({ police: null, hospital: null });

    fetch(`/api/places/context?lat=${place.lat}&lng=${place.lng}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setContext(data))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));

    if (placesService && place.placeId) {
      placesService.getDetails(
        {
          placeId: place.placeId,
          fields: ['name', 'formatted_address', 'types', 'rating', 'user_ratings_total', 'geometry'],
        },
        (res, status) => {
          if (!cancelled && status === 'OK') setDetails(res);
        }
      );
    }

    if (placesService && window.google?.maps?.places) {
      const loc = new window.google.maps.LatLng(place.lat, place.lng);
      // Police comes from our own verified station list (see the "Police
      // jurisdiction" section) — only hospitals need a Places lookup.
      ['hospital'].forEach((type) => {
        placesService.nearbySearch(
          { location: loc, rankBy: window.google.maps.places.RankBy.DISTANCE, type },
          (results, status) => {
            if (cancelled || status !== 'OK' || !results?.length) return;
            const top = results[0];
            const entry = {
              name: top.name,
              vicinity: top.vicinity,
              lat: top.geometry.location.lat(),
              lng: top.geometry.location.lng(),
            };
            entry.distance = metresBetween(place, entry);
            setNearby((prev) => ({ ...prev, [type]: entry }));
          }
        );
      });
    }

    return () => {
      cancelled = true;
    };
  }, [place, placesService, ratingReload]);

  if (!place) return null;

  const title =
    details?.name || context?.road || context?.address?.split(',')[0] || 'Dropped pin';
  const subtitle = details?.formatted_address || context?.address || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  const primaryType = details?.types?.[0]?.replace(/_/g, ' ');
  const seg = context?.nearest_segment;
  const hasLocal = context?.has_local_data && seg;
  const tally = context?.feature_tally || {};
  const ps = context?.jurisdiction_station || context?.nearest_police_station;
  const nearerPs =
    context?.nearest_police_station &&
    !context?.nearest_is_jurisdiction &&
    context.nearest_police_station.feature_id !== ps?.feature_id
      ? context.nearest_police_station
      : null;

  // Subjective community feedback for this spot.
  const comm = context?.community;
  const commSample = comm?.sample || 0;
  const commTags = Object.entries(comm?.tags || {}).sort((a, b) => b[1] - a[1]);
  const commComments = comm?.comments || [];
  // How far the ratings moved the computed score (only when there's a segment).
  const delta = seg ? Math.round((seg.safety_score - seg.computed_score) * 10) / 10 : 0;

  const confirmFeature = async (fid) => {
    setConfirming(fid);
    try {
      await apiFetch(`/api/features/${fid}/confirm`, { method: 'POST', body: '{}' });
      if (onConfirmFeature) onConfirmFeature();
    } finally {
      setConfirming(null);
    }
  };

  const resolveFeature = async (fid) => {
    setResolving(fid);
    try {
      await apiFetch(`/api/features/${fid}/resolve`, { method: 'POST', body: '{}' });
      if (onConfirmFeature) onConfirmFeature();
    } finally {
      setResolving(null);
    }
  };

  const gmapsDir = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;

  return (
    <div className="gm-panel-view">
      <div className="gm-panel-head">
        <button className="gm-icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="gm-panel-head-text">
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {primaryType && <span className="gm-type-chip">{primaryType}</span>}
        </div>
      </div>

      <div className="gm-panel-scroll">
        <section className="gm-panel-section">
          <h3>Safety at this spot</h3>
          {loading && <div className="gm-muted">Checking…</div>}
          {!loading && hasLocal && (
            <div className="gm-safety-grid">
              <div className="gm-metric">
                <Shield size={15} />
                <span>{seg.safety_score}/100</span>
                <label>
                  Safety score
                  {delta !== 0 && (
                    <em className={delta < 0 ? 'gm-delta-down' : 'gm-delta-up'}>
                      {delta > 0 ? '+' : ''}{delta} community
                    </em>
                  )}
                </label>
              </div>
              <div className="gm-metric">
                <Lightbulb size={15} />
                <span>{seg.lighting_score}/10</span>
                <label>Lighting</label>
              </div>
              <div className="gm-metric">
                <Building2 size={15} />
                <span>{fmtDist(seg.police_station_distance_m)}</span>
                <label>To police</label>
              </div>
              <div className="gm-metric">
                <AlertTriangle size={15} />
                <span>{seg.past_incident_count_90d}</span>
                <label>Incidents / 90d</label>
              </div>
              {seg.flood_risk && (
                <div className="gm-metric gm-metric-warn">
                  <Droplets size={15} />
                  <span>Yes</span>
                  <label>Flood-prone</label>
                </div>
              )}
              <div className="gm-metric-note">
                Nearest recorded road: {seg.road_name} · {fmtDist(seg.distance_m)} away
                {seg.status !== 'verified' && ' · unverified'}
              </div>
            </div>
          )}
          {!loading && !hasLocal && (
            <div className="gm-empty-state">
              No community safety data here yet.
              {seg && ` Closest record is ${seg.road_name}, ${fmtDist(seg.distance_m)} away.`}
            </div>
          )}

          {!loading && (
            <div className="gm-community">
              {commSample > 0 ? (
                <>
                  <div className="gm-community-head">
                    <Users size={14} />
                    <span>
                      This spot feels <strong>{comm.mean}/5</strong> · {commSample}{' '}
                      rating{commSample === 1 ? '' : 's'}
                      {comm.dominant_time && (
                        <span className="gm-muted">
                          {' '}· mostly {comm.dominant_time === 'night' ? 'after dark' : 'daytime'}
                        </span>
                      )}
                      {delta !== 0 && (
                        <span className="gm-muted">
                          {' '}· {delta > 0 ? 'raised' : 'lowered'} the score {Math.abs(delta)}
                        </span>
                      )}
                    </span>
                  </div>
                  {commSample < 3 && (
                    <div className="gm-muted gm-community-note">
                      Needs a few more ratings before it moves the safety score.
                    </div>
                  )}
                  {commTags.length > 0 && (
                    <div className="gm-community-tags">
                      {commTags.map(([t, n]) => (
                        <span key={t} className="gm-community-tag">
                          {SAFETY_TAG_LABELS[t] || t} ×{n}
                        </span>
                      ))}
                    </div>
                  )}
                  {commComments.length > 0 && (
                    <ul className="gm-community-comments">
                      {commComments.map((c, i) => (
                        <li key={i}>
                          <MessageSquare size={12} />
                          <div>
                            <span className="gm-muted">
                              {c.by} · {c.score}/5
                            </span>
                            {c.comment && <div>{c.comment}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <div className="gm-community-head">
                  <Users size={14} />
                  <span className="gm-muted">
                    No safety ratings within ~{comm?.join_radius_m || 75} m yet — be the first.
                  </span>
                </div>
              )}

              <SafetyRatingWidget
                coord={{ lat: place.lat, lng: place.lng }}
                segmentId={seg?.segment_id}
                contributorName={contributorName}
                onSubmitted={() => {
                  setRatingReload((n) => n + 1);
                  if (onConfirmFeature) onConfirmFeature();
                }}
              />
            </div>
          )}
        </section>

        {ps && (
          <section className="gm-panel-section">
            <h3>Police jurisdiction</h3>
            <div className="gm-help-row">
              <Building2 size={16} />
              <div>
                <strong>{ps.note}</strong>
                {!ps.location_approx && (
                  <span className="gm-muted"> · {fmtDist(ps.distance_m)}</span>
                )}
                {ps.jurisdiction && (
                  <div className="gm-muted">{ps.jurisdiction}</div>
                )}
                {ps.taluk && (
                  <div className="gm-muted">{ps.taluk} Taluk</div>
                )}
                {[ps.circle, ps.police_range, ps.zone].filter(Boolean).length > 0 && (
                  <div className="gm-muted" style={{ marginTop: 2 }}>
                    {[ps.circle, ps.police_range, ps.zone].filter(Boolean).join(' › ')}
                  </div>
                )}
                {ps.primary_jurisdiction?.length > 0 && (
                  <div className="gm-muted" style={{ marginTop: 2 }}>
                    Covers: {ps.primary_jurisdiction.join(' · ')}
                  </div>
                )}
                {ps.key_areas?.length > 0 && (
                  <div className="gm-muted" style={{ marginTop: 2 }}>
                    Areas: {ps.key_areas.slice(0, 8).join(' · ')}
                    {ps.key_areas.length > 8 ? ' …' : ''}
                  </div>
                )}
                {nearerPs && (
                  <div className="gm-muted" style={{ marginTop: 4 }}>
                    Nearest station: {nearerPs.note} · {fmtDist(nearerPs.distance_m)}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {(context?.nearby_features?.length > 0 || Object.keys(tally).length > 0) && (
          <section className="gm-panel-section">
            <h3>Reported nearby</h3>
            <div className="gm-tally-chips">
              {Object.entries(tally).map(([type, n]) => (
                <span key={type} className="gm-tally-chip">
                  <i style={{ background: (FEATURE_STYLE[type] || FEATURE_STYLE.other).color }} />
                  {(FEATURE_STYLE[type] || FEATURE_STYLE.other).label} · {n}
                </span>
              ))}
            </div>
            <ul className="gm-feature-list">
              {(context.nearby_features || []).map((f) => (
                <li key={f.feature_id}>
                  <div>
                    <strong>{(FEATURE_STYLE[f.type] || FEATURE_STYLE.other).label}</strong>
                    <span className="gm-muted"> · {fmtDist(f.distance_m)} · {f.status}</span>
                    {f.recurrence_count > 0 && (
                      <span className="gm-badge gm-badge-chronic">
                        recurring ×{f.recurrence_count}
                      </span>
                    )}
                    {f.note && <div className="gm-feature-note">{f.note}</div>}
                  </div>
                  {f.status !== 'resolved' && (
                    <div className="gm-feature-list-actions">
                      <button
                        className="gm-text-btn gm-text-btn-sm"
                        disabled={confirming === f.feature_id}
                        onClick={() => confirmFeature(f.feature_id)}
                      >
                        <CheckCircle2 size={13} /> Confirm
                      </button>
                      {RESOLVABLE_FEATURE_TYPES.has(f.type) && (
                        <button
                          className="gm-text-btn gm-text-btn-sm"
                          disabled={resolving === f.feature_id}
                          onClick={() => resolveFeature(f.feature_id)}
                          title="Say this has been fixed"
                        >
                          <Wrench size={13} /> Mark repaired
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {nearby.hospital && (
          <section className="gm-panel-section">
            <h3>Nearby help</h3>
            {nearby.hospital && (
              <div className="gm-help-row">
                <Plus size={15} />
                <div>
                  <strong>{nearby.hospital.name}</strong>
                  <span className="gm-muted"> · {fmtDist(nearby.hospital.distance)}</span>
                  <div className="gm-muted">{nearby.hospital.vicinity}</div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="gm-panel-actions">
        <button className="gm-primary-button" onClick={onContribute}>
          <Plus size={16} /> Add a streetlight, pothole or note here
        </button>
        <div className="gm-panel-actions-row">
          <button className="gm-secondary-button" onClick={onDetailedAssessment}>
            <ClipboardList size={15} /> Road assessment
          </button>
          <a className="gm-secondary-button" href={gmapsDir} target="_blank" rel="noreferrer">
            <Navigation size={15} /> Directions
          </a>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
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
  Pencil,
  RotateCcw,
  X,
  Radio,
  Users,
  MessageSquare,
  Phone,
  Globe,
  Clock,
  Star,
  Fuel,
  Car,
  Landmark,
  Cross,
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

// Google's `type: 'hospital'` also returns dental/eye/physio clinics, labs and
// pharmacies. Keep only places that actually read as a hospital.
const NOT_HOSPITAL =
  /\b(dental|dentist|clinic|poly\s?clinic|diagnostic|scan(ning)?|laborator|patholog|physio|ayurved|homoeo|homeo|pharmac|medical (store|shop|agenc)|optical|eye care|skin|cosmetic|dermatolog|fertility|ivf|veterinar|animal)\b/i;
const IS_HOSPITAL =
  /\b(hospital|medical college|medical (centre|center)|multi\s?spec|super\s?spec|nursing home|general hospital|govt)\b/i;

function safeOpenNow(r) {
  try {
    if (r.opening_hours?.isOpen) {
      const v = r.opening_hours.isOpen();
      if (typeof v === 'boolean') return v;
    }
    if (typeof r.opening_hours?.open_now === 'boolean') return r.opening_hours.open_now;
  } catch {
    /* isOpen() can throw without full details — treat as unknown */
  }
  return null;
}

function toEntry(r, origin) {
  const loc = r.geometry.location;
  const e = {
    name: r.name || 'Place',
    vicinity: r.vicinity || '',
    lat: loc.lat(),
    lng: loc.lng(),
    rating: r.rating,
    ratings: r.user_ratings_total,
    openNow: safeOpenNow(r),
  };
  e.distance = metresBetween(origin, e);
  return e;
}

function pickHospitals(results, origin) {
  const scored = [];
  for (const r of results) {
    if (r.business_status === 'CLOSED_PERMANENTLY' || !r.geometry?.location) continue;
    const name = r.name || '';
    const types = r.types || [];
    const good = IS_HOSPITAL.test(name);
    const bad =
      NOT_HOSPITAL.test(name) ||
      types.includes('dentist') ||
      types.includes('veterinary_care') ||
      types.includes('pharmacy');
    if (bad && !good) continue;
    if (!good && !types.includes('hospital')) continue;
    let score = 0;
    if (good) score += 3;
    if (types.includes('hospital')) score += 2;
    if ((r.user_ratings_total || 0) >= 150) score += 1;
    if (bad) score -= 4;
    scored.push({ entry: toEntry(r, origin), score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.distance - b.entry.distance);
  return scored.slice(0, 2).map((s) => s.entry);
}

function pickNearest(results, origin, max) {
  return results
    .filter((r) => r.business_status !== 'CLOSED_PERMANENTLY' && r.geometry?.location)
    .map((r) => toEntry(r, origin))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, max);
}

// [key, label, lucide icon, Places type, keyword, max results, picker]
const HELP_CATS = [
  ['hospitals', 'Hospitals', Cross, 'hospital', 'hospital', 2, pickHospitals],
  ['fuel', 'Petrol pumps', Fuel, 'gas_station', '', 2, null],
  ['repair', 'Vehicle repair', Car, 'car_repair', '', 2, null],
  ['atm', 'ATM', Landmark, 'atm', '', 1, null],
];

const STREETLIGHT_STATES = [
  ['streetlight_ok', 'Working'],
  ['streetlight_broken', 'Broken'],
  ['streetlight_missing', 'Missing'],
];
const isStreetlight = (t) => t?.startsWith('streetlight_');

const dirUrl = (name, area, lat, lng) => {
  const dest = name
    ? encodeURIComponent(
        [name, (area || '').split(/[,(]/)[0].trim(), 'Kochi', 'Kerala']
          .filter(Boolean)
          .join(', ')
      )
    : `${lat},${lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
};

function HelpRow({ icon: Icon, name, distance, sub, openNow, rating, ratings, dir }) {
  return (
    <div className="gm-help-row">
      <Icon size={16} />
      <div style={{ flex: 1 }}>
        <strong>{name}</strong>
        {distance != null && <span className="gm-muted"> · {fmtDist(distance)}</span>}
        {typeof openNow === 'boolean' && (
          <span className={openNow ? 'gm-open' : 'gm-closed'}>
            {' '}· {openNow ? 'Open' : 'Closed'}
          </span>
        )}
        {rating != null && (
          <span className="gm-muted">
            {' '}· <Star size={11} style={{ verticalAlign: '-1px' }} /> {rating}
            {ratings ? ` (${ratings})` : ''}
          </span>
        )}
        {sub && <div className="gm-muted">{sub}</div>}
      </div>
      {dir && (
        <a className="gm-text-btn gm-text-btn-sm" href={dir} target="_blank" rel="noreferrer">
          <Navigation size={13} /> Directions
        </a>
      )}
    </div>
  );
}

export default function PlacePanel({
  place,
  placesService,
  onBack,
  onContribute,
  onDetailedAssessment,
  onConfirmFeature,
  onReportLive,
  contributorName,
}) {
  const [details, setDetails] = useState(null);
  const [context, setContext] = useState(null);
  const [nearby, setNearby] = useState({});
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [resolving, setResolving] = useState(null);
  const [ratingReload, setRatingReload] = useState(0);
  const [tab, setTab] = useState('help');
  const [editing, setEditing] = useState(null); // { id, type, note, severity }
  const [savingEdit, setSavingEdit] = useState(false);
  const focusRef = useRef(null);

  const reloadAll = () => {
    setRatingReload((n) => n + 1);
    if (onConfirmFeature) onConfirmFeature();
  };

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setNearby({});
    setEditing(null);
    // Clicking a map pin should land on the tab where that report lives.
    setTab(place.fromFeature ? 'spot' : 'help');

    fetch(`/api/places/context?lat=${place.lat}&lng=${place.lng}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setContext(data))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));

    if (placesService && place.placeId) {
      placesService.getDetails(
        {
          placeId: place.placeId,
          fields: [
            'name',
            'formatted_address',
            'types',
            'rating',
            'user_ratings_total',
            'geometry',
            'opening_hours',
            'utc_offset_minutes',
            'formatted_phone_number',
            'website',
            'photos',
            'business_status',
          ],
        },
        (res, status) => {
          if (!cancelled && status === 'OK') setDetails(res);
        }
      );
    }

    if (placesService && window.google?.maps?.places) {
      const loc = new window.google.maps.LatLng(place.lat, place.lng);
      HELP_CATS.forEach(([key, , , type, keyword, max, picker]) => {
        const req = {
          location: loc,
          rankBy: window.google.maps.places.RankBy.DISTANCE,
          type,
        };
        if (keyword) req.keyword = keyword;
        placesService.nearbySearch(req, (results, status) => {
          if (cancelled || status !== 'OK' || !results?.length) return;
          const list = picker ? picker(results, place) : pickNearest(results, place, max);
          setNearby((prev) => ({ ...prev, [key]: list }));
        });
      });
    }

    return () => {
      cancelled = true;
    };
  }, [place, placesService, ratingReload]);

  useEffect(() => {
    if (place?.featureId && tab === 'spot' && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center' });
    }
  }, [context, tab, place]);

  if (!place) return null;

  const title =
    details?.name || context?.road || context?.address?.split(',')[0] || 'Dropped pin';
  const subtitle =
    details?.formatted_address ||
    context?.address ||
    `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  const typeChips = (details?.types || [])
    .filter((t) => !['point_of_interest', 'establishment', 'premise'].includes(t))
    .slice(0, 2)
    .map((t) => t.replace(/_/g, ' '));
  const photoUrl = (() => {
    try {
      return details?.photos?.[0]?.getUrl?.({ maxWidth: 640, maxHeight: 220 });
    } catch {
      return null;
    }
  })();
  const openState = (() => {
    try {
      return details?.opening_hours?.isOpen?.();
    } catch {
      return undefined;
    }
  })();
  const todayHours =
    details?.opening_hours?.weekday_text?.[(new Date().getDay() + 6) % 7];

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

  const comm = context?.community;
  const commSample = comm?.sample || 0;
  const commTags = Object.entries(comm?.tags || {}).sort((a, b) => b[1] - a[1]);
  const commComments = comm?.comments || [];
  const delta = seg ? Math.round((seg.safety_score - seg.computed_score) * 10) / 10 : 0;

  const confirmFeature = async (fid) => {
    setConfirming(fid);
    try {
      await apiFetch(`/api/features/${fid}/confirm`, { method: 'POST', body: '{}' });
      reloadAll();
    } finally {
      setConfirming(null);
    }
  };

  const resolveFeature = async (fid) => {
    setResolving(fid);
    try {
      await apiFetch(`/api/features/${fid}/resolve`, { method: 'POST', body: '{}' });
      reloadAll();
    } finally {
      setResolving(null);
    }
  };

  const reopenFeature = async (fid) => {
    setResolving(fid);
    try {
      await apiFetch(`/api/features/${fid}/reopen`, { method: 'POST', body: '{}' });
      reloadAll();
    } finally {
      setResolving(null);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const body = { note: editing.note.trim() };
      if (isStreetlight(editing.type)) body.type = editing.type;
      if (RESOLVABLE_FEATURE_TYPES.has(editing.type) || isStreetlight(editing.type)) {
        body.severity = editing.severity;
      }
      await apiFetch(`/api/features/${editing.id}/update`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setEditing(null);
      reloadAll();
    } finally {
      setSavingEdit(false);
    }
  };

  const gmapsDir = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  const helpCount =
    (ps ? 1 : 0) + HELP_CATS.reduce((n, [k]) => n + (nearby[k]?.length || 0), 0);

  return (
    <div className="gm-panel-view">
      <div className="gm-panel-head">
        <button className="gm-icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="gm-panel-head-text">
          <h2>{title}</h2>
          <p>{subtitle}</p>
          <div className="gm-place-meta">
            {details?.rating != null && (
              <span>
                <Star size={12} style={{ verticalAlign: '-1px' }} /> {details.rating}
                {details.user_ratings_total ? ` (${details.user_ratings_total})` : ''}
              </span>
            )}
            {typeChips.map((c) => (
              <span key={c} className="gm-type-chip">
                {c}
              </span>
            ))}
            {typeof openState === 'boolean' && (
              <span className={openState ? 'gm-open' : 'gm-closed'}>
                {openState ? 'Open now' : 'Closed'}
              </span>
            )}
          </div>
        </div>
      </div>

      {photoUrl && <img className="gm-place-photo" src={photoUrl} alt="" />}

      <div className="gm-place-actions">
        {details?.formatted_phone_number && (
          <a
            className="gm-place-act"
            href={`tel:${details.formatted_phone_number.replace(/\s/g, '')}`}
          >
            <Phone size={15} /> Call
          </a>
        )}
        {details?.website && (
          <a className="gm-place-act" href={details.website} target="_blank" rel="noreferrer">
            <Globe size={15} /> Website
          </a>
        )}
        <a
          className="gm-place-act primary"
          href={gmapsDir}
          target="_blank"
          rel="noreferrer"
        >
          <Navigation size={15} /> Directions
        </a>
      </div>
      {todayHours && (
        <div className="gm-muted gm-place-hours">
          <Clock size={12} /> {todayHours}
        </div>
      )}

      <div className="gm-tabs">
        <button
          className={`gm-tab ${tab === 'help' ? 'active' : ''}`}
          onClick={() => setTab('help')}
        >
          Nearby help {helpCount > 0 && <span className="gm-tab-count">{helpCount}</span>}
        </button>
        <button
          className={`gm-tab ${tab === 'spot' ? 'active' : ''}`}
          onClick={() => setTab('spot')}
        >
          This spot
        </button>
      </div>

      <div className="gm-panel-scroll">
        {tab === 'help' && (
          <>
            {ps && (
              <section className="gm-panel-section">
                <h3>Police jurisdiction</h3>
                <div className="gm-help-row">
                  <Shield size={16} />
                  <div style={{ flex: 1 }}>
                    <strong>{ps.note}</strong>
                    {!ps.location_approx && (
                      <span className="gm-muted"> · {fmtDist(ps.distance_m)}</span>
                    )}
                    {ps.jurisdiction && <div className="gm-muted">{ps.jurisdiction}</div>}
                    {ps.taluk && <div className="gm-muted">{ps.taluk} Taluk</div>}
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
                  </div>
                  <a
                    className="gm-text-btn gm-text-btn-sm"
                    href={dirUrl(ps.note, ps.area, ps.lat, ps.lng)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation size={13} /> Directions
                  </a>
                </div>
                {nearerPs && (
                  <HelpRow
                    icon={Building2}
                    name={nearerPs.note}
                    distance={nearerPs.distance_m}
                    sub="Nearest station to you"
                    dir={dirUrl(nearerPs.note, nearerPs.area, nearerPs.lat, nearerPs.lng)}
                  />
                )}
              </section>
            )}

            {HELP_CATS.map(([key, label, icon]) => {
              const list = nearby[key];
              if (!list?.length) return null;
              return (
                <section key={key} className="gm-panel-section">
                  <h3>{label}</h3>
                  {list.map((h, i) => (
                    <HelpRow
                      key={i}
                      icon={icon}
                      name={h.name}
                      distance={h.distance}
                      sub={h.vicinity}
                      openNow={h.openNow}
                      rating={h.rating}
                      ratings={h.ratings}
                      dir={dirUrl(h.name, h.vicinity, h.lat, h.lng)}
                    />
                  ))}
                </section>
              );
            })}

            {loading && helpCount === 0 && <div className="gm-muted">Looking around…</div>}
            {!loading && helpCount === 0 && (
              <div className="gm-empty-state">Nothing found nearby.</div>
            )}
          </>
        )}

        {tab === 'spot' && (
          <>
            {onReportLive && (
              <button
                className="gm-live-cta"
                onClick={() => onReportLive({ lat: place.lat, lng: place.lng })}
              >
                <Radio size={15} /> Something happening here right now? Report it
              </button>
            )}

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
                          {delta > 0 ? '+' : ''}
                          {delta} community
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
                              {' '}
                              · mostly{' '}
                              {comm.dominant_time === 'night' ? 'after dark' : 'daytime'}
                            </span>
                          )}
                          {delta !== 0 && (
                            <span className="gm-muted">
                              {' '}· {delta > 0 ? 'raised' : 'lowered'} the score{' '}
                              {Math.abs(delta)}
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
                        No safety ratings within ~{comm?.join_radius_m || 75} m yet — be the
                        first.
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

            {(context?.nearby_features?.length > 0 || Object.keys(tally).length > 0) && (
              <section className="gm-panel-section">
                <h3>Reported nearby</h3>
                <div className="gm-tally-chips">
                  {Object.entries(tally).map(([type, n]) => (
                    <span key={type} className="gm-tally-chip">
                      <i
                        style={{
                          background: (FEATURE_STYLE[type] || FEATURE_STYLE.other).color,
                        }}
                      />
                      {(FEATURE_STYLE[type] || FEATURE_STYLE.other).label} · {n}
                    </span>
                  ))}
                </div>
                <ul className="gm-feature-list">
                  {(context.nearby_features || []).map((f) => {
                    const label = (FEATURE_STYLE[f.type] || FEATURE_STYLE.other).label;
                    const isFocus = place.featureId === f.feature_id;
                    const editable =
                      isStreetlight(f.type) ||
                      RESOLVABLE_FEATURE_TYPES.has(f.type) ||
                      f.type === 'other';
                    const canReopen =
                      f.status === 'resolved' && RESOLVABLE_FEATURE_TYPES.has(f.type);

                    if (editing?.id === f.feature_id) {
                      return (
                        <li
                          key={f.feature_id}
                          ref={isFocus ? focusRef : null}
                          className="gm-feature-edit"
                        >
                          {isStreetlight(editing.type) && (
                            <div className="gm-severity-row">
                              {STREETLIGHT_STATES.map(([val, name]) => (
                                <button
                                  key={val}
                                  className={`gm-severity-btn ${
                                    editing.type === val ? 'active' : ''
                                  }`}
                                  onClick={() => setEditing((e) => ({ ...e, type: val }))}
                                >
                                  {name}
                                </button>
                              ))}
                            </div>
                          )}
                          {(RESOLVABLE_FEATURE_TYPES.has(editing.type) ||
                            isStreetlight(editing.type)) && (
                            <div className="gm-severity-row">
                              {[1, 2, 3].map((s) => (
                                <button
                                  key={s}
                                  className={`gm-severity-btn sev-${s} ${
                                    editing.severity === s ? 'active' : ''
                                  }`}
                                  onClick={() =>
                                    setEditing((e) => ({ ...e, severity: s }))
                                  }
                                >
                                  {['Minor', 'Moderate', 'Severe'][s - 1]}
                                </button>
                              ))}
                            </div>
                          )}
                          <textarea
                            className="gm-textarea"
                            rows={2}
                            placeholder="Note"
                            value={editing.note}
                            onChange={(e) =>
                              setEditing((cur) => ({ ...cur, note: e.target.value }))
                            }
                          />
                          <div className="gm-feature-list-actions">
                            <button
                              className="gm-text-btn gm-text-btn-sm"
                              disabled={savingEdit}
                              onClick={saveEdit}
                            >
                              <CheckCircle2 size={13} /> {savingEdit ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              className="gm-text-btn gm-text-btn-sm"
                              onClick={() => setEditing(null)}
                            >
                              <X size={13} /> Cancel
                            </button>
                          </div>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={f.feature_id}
                        ref={isFocus ? focusRef : null}
                        className={isFocus ? 'gm-feature-focus' : undefined}
                      >
                        <div>
                          <strong>{label}</strong>
                          <span className="gm-muted">
                            {' '}· {fmtDist(f.distance_m)} · {f.status}
                          </span>
                          {f.recurrence_count > 0 && (
                            <span className="gm-badge gm-badge-chronic">
                              recurring ×{f.recurrence_count}
                            </span>
                          )}
                          {f.note && <div className="gm-feature-note">{f.note}</div>}
                        </div>
                        <div className="gm-feature-list-actions">
                          {f.status !== 'resolved' && (
                            <>
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
                              {editable && (
                                <button
                                  className="gm-text-btn gm-text-btn-sm"
                                  onClick={() =>
                                    setEditing({
                                      id: f.feature_id,
                                      type: f.type,
                                      note: f.note || '',
                                      severity: f.severity || 2,
                                    })
                                  }
                                >
                                  <Pencil size={13} /> Edit
                                </button>
                              )}
                            </>
                          )}
                          {canReopen && (
                            <button
                              className="gm-text-btn gm-text-btn-sm"
                              disabled={resolving === f.feature_id}
                              onClick={() => reopenFeature(f.feature_id)}
                              title="This has failed again"
                            >
                              <RotateCcw size={13} /> Report it's back
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
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

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Phone,
  Navigation,
  Copy,
  Check,
  LocateFixed,
  ShieldAlert,
} from 'lucide-react';

const EMERGENCY_NUMBERS = [
  ['112', 'All-in-one emergency'],
  ['100', 'Police'],
  ['108', 'Ambulance'],
  ['101', 'Fire & rescue'],
  ['1091', 'Women helpline'],
  ['1098', 'Child helpline'],
  ['1077', 'Disaster / flood control'],
];

function metresBetween(a, b) {
  const R = 6371000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const fmtDist = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export default function SosPanel({ location, placesService, onBack, onLocate }) {
  const [address, setAddress] = useState('');
  const [police, setPolice] = useState(null);
  const [communityPolice, setCommunityPolice] = useState(null);
  const [nearestStation, setNearestStation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!location) return;
    let cancelled = false;
    setLoading(true);
    setPolice(null);
    setCommunityPolice(null);
    setNearestStation(null);

    const mapStation = (p) => ({
      featureId: p.feature_id,
      name: p.note || 'Police station',
      area: p.area || '',
      vicinity: p.jurisdiction || p.area || '',
      jurisdiction: p.jurisdiction,
      covers: p.primary_jurisdiction || [],
      keyAreas: p.key_areas || [],
      taluk: p.taluk || '',
      chain: [p.circle, p.police_range, p.zone].filter(Boolean),
      areaSqKm: p.area_sq_km,
      nearbyStations: p.nearby_stations || null,
      lat: p.lat,
      lng: p.lng,
      locationApprox: !!p.location_approx,
      distance: p.distance_m,
      community: p.source && !['seed', 'google_places', 'official_kerala_police_registry'].includes(p.source),
    });

    fetch(`/api/places/context?lat=${location.lat}&lng=${location.lng}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setAddress(d.address || '');
        // The station whose mapped area you're standing in — not always the closest.
        const juris = d.jurisdiction_station || d.nearest_police_station;
        if (juris) setCommunityPolice(mapStation(juris));
        // A physically-closer station, when it's a different one.
        if (d.nearest_police_station && !d.nearest_is_jurisdiction) {
          setNearestStation(mapStation(d.nearest_police_station));
        }
      })
      .catch(() => {});

    if (placesService && window.google?.maps?.places) {
      const loc = new window.google.maps.LatLng(location.lat, location.lng);
      placesService.nearbySearch(
        { location: loc, rankBy: window.google.maps.places.RankBy.DISTANCE, type: 'police' },
        (results, status) => {
          if (cancelled) return;
          setLoading(false);
          if (status !== 'OK' || !results?.length) return;
          const top = results[0];
          const entry = {
            name: top.name,
            vicinity: top.vicinity,
            lat: top.geometry.location.lat(),
            lng: top.geometry.location.lng(),
          };
          entry.distance = metresBetween(location, entry);
          setPolice(entry);
          placesService.getDetails(
            { placeId: top.place_id, fields: ['formatted_phone_number', 'formatted_address'] },
            (det, dStatus) => {
              if (cancelled || dStatus !== 'OK') return;
              setPolice((p) => ({
                ...p,
                phone: det.formatted_phone_number,
                vicinity: det.formatted_address || p.vicinity,
              }));
            }
          );
        }
      );
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [location, placesService]);

  const copyLocation = async () => {
    if (!location) return;
    try {
      await navigator.clipboard.writeText(`${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  // Prefer our verified station list — it's the one that carries a jurisdiction.
  // Fall back to Google's nearest result only when we have no seeded station at all.
  const best = communityPolice || police;
  // Does Google's nearest "police" result look like the same station as `best`?
  // (share a name word, and be within ~2.5 km) — if so its pin is the real building.
  const sameStation = (a, b) => {
    if (!a || !b) return false;
    if (metresBetween(a, b) > 2500) return false;
    const words = (a.name || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !['police', 'station'].includes(w));
    const other = (b.name || '').toLowerCase();
    return words.some((w) => other.includes(w));
  };

  // Google may know the station's phone number even though our record doesn't —
  // borrow it only when it's clearly the same station.
  const bestPhone =
    best?.phone || (police && sameStation(police, best) ? police.phone : null);

  // Directions link. For our own records, address the station by NAME so Google
  // opens the actual "<X> Police Station" place page (not a bare coordinate pin);
  // for a Google Places fallback result, its coordinates already are a real pin.
  const destOf = (s) => {
    const area = (s.area || '').split(/[/,(]/)[0].trim();
    return encodeURIComponent([s.name, area, 'Kochi', 'Kerala'].filter(Boolean).join(', '));
  };
  const dirTo = (s) => {
    if (!s || !location) return null;
    const dest = s === police ? `${s.lat},${s.lng}` : destOf(s);
    return (
      `https://www.google.com/maps/dir/?api=1` +
      `&origin=${location.lat},${location.lng}&destination=${dest}`
    );
  };

  const policeDir = dirTo(best);

  // A physically-closer station than the one whose area you're in.
  const nearer =
    nearestStation && best && nearestStation.featureId !== best.featureId
      ? nearestStation
      : null;
  const nearerDir = dirTo(nearer);

  return (
    <div className="gm-panel-view">
      <div className="gm-panel-head">
        <button className="gm-icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="gm-panel-head-text">
          <h2>Emergency &amp; police jurisdiction</h2>
          <p>Who covers where you are now, and the numbers to call.</p>
        </div>
      </div>

      <div className="gm-panel-scroll">
        {!location && (
          <section className="gm-panel-section">
            <div className="gm-empty-state">Turn on location to see your nearest police station.</div>
            <button className="gm-secondary-button" style={{ marginTop: 10 }} onClick={onLocate}>
              <LocateFixed size={15} /> Use my location
            </button>
          </section>
        )}

        {location && (
          <>
            <section className="gm-panel-section">
              <h3>You are here</h3>
              <div className="gm-muted">{address || 'Getting address…'}</div>
              <div className="gm-sos-coord">
                <span>
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </span>
                <button className="gm-text-btn gm-text-btn-sm" onClick={copyLocation}>
                  {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              {location.accuracy != null && (
                <div className="gm-muted" style={{ marginTop: 4 }}>
                  Approximate — accurate to about {Math.round(location.accuracy)} m.{' '}
                  <button className="gm-link-btn" onClick={onLocate}>recheck</button>
                </div>
              )}
            </section>

            <section className="gm-panel-section">
              <h3>Police station for this area</h3>
              {loading && !best && <div className="gm-muted">Finding the nearest station…</div>}
              {best && (
                <div className="gm-help-row">
                  <Building2 size={16} />
                  <div style={{ flex: 1 }}>
                    <strong>{best.name}</strong>
                    {nearer && <span className="gm-badge">Your area</span>}
                    {!best.locationApprox && !nearer && (
                      <span className="gm-muted"> · {fmtDist(best.distance)}</span>
                    )}
                    {best.locationApprox && (
                      <span className="gm-muted"> · exact location not mapped</span>
                    )}
                    {best.community && <span className="gm-badge gm-badge-community">Community</span>}
                    {best.jurisdiction && (
                      <div className="gm-muted">Jurisdiction: {best.jurisdiction}</div>
                    )}
                    {!best.jurisdiction && best.vicinity && (
                      <div className="gm-muted">{best.vicinity}</div>
                    )}
                    {best.chain?.length > 0 && (
                      <div className="gm-muted" style={{ marginTop: 2 }}>
                        {best.chain.join(' › ')}
                        {best.areaSqKm ? ` · ${best.areaSqKm} sq.km` : ''}
                      </div>
                    )}
                    {best.taluk && (
                      <div className="gm-muted" style={{ marginTop: 2 }}>
                        {best.taluk} Taluk
                      </div>
                    )}
                    {best.covers?.length > 0 && (
                      <div className="gm-muted" style={{ marginTop: 2 }}>
                        Covers: {best.covers.join(' · ')}
                      </div>
                    )}
                    {best.keyAreas?.length > 0 && (
                      <div className="gm-muted" style={{ marginTop: 2 }}>
                        Areas: {best.keyAreas.slice(0, 8).join(' · ')}
                        {best.keyAreas.length > 8 ? ' …' : ''}
                      </div>
                    )}
                    {best.nearbyStations && (
                      <div className="gm-muted" style={{ marginTop: 2 }}>
                        Bordering stations:{' '}
                        {[...new Set(Object.values(best.nearbyStations))]
                          .map((s) => s.replace(/ Police Station$/, ''))
                          .join(' · ')}
                      </div>
                    )}
                    <div className="gm-sos-actions">
                      {bestPhone && (
                        <a className="gm-text-btn gm-text-btn-sm" href={`tel:${bestPhone.replace(/\s/g, '')}`}>
                          <Phone size={13} /> {bestPhone}
                        </a>
                      )}
                      {policeDir && (
                        <a
                          className="gm-text-btn gm-text-btn-sm"
                          href={policeDir}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation size={13} /> Directions
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {nearer && (
                <div className="gm-help-row" style={{ marginTop: 10 }}>
                  <Navigation size={16} />
                  <div style={{ flex: 1 }}>
                    <strong>{nearer.name}</strong>
                    <span className="gm-muted"> · {fmtDist(nearer.distance)} · nearest to you</span>
                    {nearer.jurisdiction && (
                      <div className="gm-muted">{nearer.jurisdiction}</div>
                    )}
                    {nearerDir && (
                      <div className="gm-sos-actions">
                        <a
                          className="gm-text-btn gm-text-btn-sm"
                          href={nearerDir}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation size={13} /> Directions
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!loading && !best && (
                <div className="gm-muted">Couldn't find a nearby station — use the numbers below.</div>
              )}
            </section>

            <section className="gm-panel-section">
              <h3>Emergency numbers</h3>
              <div className="gm-sos-numbers">
                {EMERGENCY_NUMBERS.map(([num, label]) => (
                  <a key={num} className="gm-sos-number" href={`tel:${num}`}>
                    <span className="gm-sos-num">{num}</span>
                    <span className="gm-sos-num-label">{label}</span>
                  </a>
                ))}
              </div>
              <div className="gm-sos-disclaimer">
                <ShieldAlert size={14} /> In a real emergency call <strong>112</strong>. SafeRoute
                can't place the call for you.
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

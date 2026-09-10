import React, { useEffect, useRef, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { FEATURE_STYLE } from '../lib/featureStyles';

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 9.9816, lng: 76.2999 };
const libraries = ['places', 'visualization'];

function decodePolyline(encoded) {
  if (!encoded) return [];
  const poly = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;
    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return poly;
}

export default function GoogleMapView({
  apiKey,
  segments,
  features = [],
  showFeatures = true,
  events = [],
  routesData,
  selectedRouteIdx = 0,
  showSafety,
  showPolice,
  showLighting,
  hour,
  userLocation,
  showPotholeZones = false,
  showRatings = false,
  ratingsReloadKey = 0,
  showLive = false,
  liveReloadKey = 0,
  onMapClick,
  onFeatureClick,
  onSpotClick,
  onLiveClick,
  onEventClick,
  onRouteSelect,
  markerLocation,
  pickMode = false,
  flyTo,
  onPlacesServiceReady,
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  const [map, setMap] = useState(null);
  const routeObjectsRef = useRef([]);
  const heatmapRef = useRef(null);
  const zoneCirclesRef = useRef([]);
  const spotObjectsRef = useRef([]);
  const liveObjectsRef = useRef([]);
  const onSpotClickRef = useRef(onSpotClick);
  const onLiveClickRef = useRef(onLiveClick);
  useEffect(() => {
    onSpotClickRef.current = onSpotClick;
    onLiveClickRef.current = onLiveClick;
  }, [onSpotClick, onLiveClick]);

  useEffect(() => {
    if (map && window.google?.maps?.places && onPlacesServiceReady) {
      onPlacesServiceReady(new window.google.maps.places.PlacesService(map));
    }
  }, [map, onPlacesServiceReady]);

  // Pothole-prone heatmap + zone circles (Google Maps visualization library).
  useEffect(() => {
    const g = window.google?.maps;
    if (!map || !g?.visualization) return;

    const teardown = () => {
      if (heatmapRef.current) heatmapRef.current.setMap(null);
      heatmapRef.current = null;
      zoneCirclesRef.current.forEach((c) => c.setMap(null));
      zoneCirclesRef.current = [];
    };
    teardown();
    if (!showPotholeZones) return () => teardown();

    let cancelled = false;
    fetch('/api/features/pothole-zones')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.points?.length) return;
        heatmapRef.current = new g.visualization.HeatmapLayer({
          map,
          radius: 42,
          opacity: 0.7,
          data: data.points.map((p) => ({
            location: new g.LatLng(p.lat, p.lng),
            weight: p.weight || 1,
          })),
        });
        zoneCirclesRef.current = (data.zones || []).map(
          (z) =>
            new g.Circle({
              map,
              center: { lat: z.lat, lng: z.lng },
              radius: z.radius_m,
              strokeColor: '#f57c00',
              strokeOpacity: 0.5,
              strokeWeight: 1,
              fillColor: '#f57c00',
              fillOpacity: z.severity === 'high' ? 0.18 : 0.1,
              clickable: false,
            })
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      teardown();
    };
  }, [map, showPotholeZones]);

  // Community safety-rating spots (clusters of subjective 1-5 ratings).
  useEffect(() => {
    const g = window.google?.maps;
    if (!map) return undefined;

    const teardown = () => {
      spotObjectsRef.current.forEach((o) => o.setMap(null));
      spotObjectsRef.current = [];
    };
    teardown();
    if (!showRatings) return teardown;

    // red -> amber -> green by felt-safety mean (null = unrated-ish, treat neutral)
    const colourFor = (mean) => {
      if (mean == null) return '#9aa0a6';
      if (mean < 2.5) return '#d93025';
      if (mean < 3.5) return '#f9ab00';
      return '#1e8e3e';
    };

    let cancelled = false;
    fetch('/api/safety-spots')
      .then((r) => r.json())
      .then((spots) => {
        if (cancelled || !Array.isArray(spots)) return;
        const objs = [];
        spots.forEach((s) => {
          const colour = colourFor(s.mean);
          const circle = new g.Circle({
            map,
            center: { lat: s.lat, lng: s.lng },
            radius: Math.max(s.radius_m || 60, 50),
            strokeColor: colour,
            strokeOpacity: 0.7,
            strokeWeight: 1.5,
            fillColor: colour,
            fillOpacity: 0.16,
            clickable: true,
            zIndex: 30,
          });
          circle.addListener('click', () => onSpotClickRef.current && onSpotClickRef.current(s));
          const marker = new g.Marker({
            map,
            position: { lat: s.lat, lng: s.lng },
            zIndex: 31,
            label: {
              text: String(s.sample),
              color: '#fff',
              fontSize: '11px',
              fontWeight: '700',
            },
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 11,
              fillColor: colour,
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
            },
            title: `${s.mean ? `${s.mean}/5` : 'unrated'} · ${s.sample} rating${
              s.sample === 1 ? '' : 's'
            }`,
          });
          marker.addListener('click', () => onSpotClickRef.current && onSpotClickRef.current(s));
          objs.push(circle, marker);
        });
        spotObjectsRef.current = objs;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      teardown();
    };
    // onSpotClick intentionally omitted — an inline parent callback would
    // otherwise re-fetch the layer on every render.
  }, [map, showRatings, ratingsReloadKey]);

  // Live "happening now" reports — polled every 30s while the layer is on
  // (or a route is active, so alerts on the way show up).
  useEffect(() => {
    const g = window.google?.maps;
    if (!map) return undefined;

    const teardown = () => {
      liveObjectsRef.current.forEach((o) => o.setMap(null));
      liveObjectsRef.current = [];
    };
    teardown();
    if (!showLive) return teardown;

    let cancelled = false;
    const draw = (reports) => {
      teardown();
      if (cancelled || !Array.isArray(reports)) return;
      liveObjectsRef.current = reports.map((r) => {
        const alert = r.group === 'alert';
        const colour = alert ? '#d93025' : '#1e8e3e';
        const life = (r.minutes_left ?? 0) + (r.age_min ?? 0) || 1;
        const fresh = Math.max(0, Math.min(1, (r.minutes_left ?? 0) / life));
        const marker = new g.Marker({
          map,
          position: { lat: r.lat, lng: r.lng },
          zIndex: 40,
          opacity: 0.45 + 0.55 * fresh,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: alert ? 9 : 7,
            fillColor: colour,
            fillOpacity: 1,
            strokeColor: '#fff',
            strokeWeight: 2,
          },
          title: `${r.category_label} · ${
            r.age_min < 1 ? 'just now' : `${r.age_min} min ago`
          }${r.note ? ` — ${r.note}` : ''}`,
        });
        marker.addListener('click', () => onLiveClickRef.current && onLiveClickRef.current(r));
        return marker;
      });
    };

    const poll = () =>
      fetch('/api/live')
        .then((res) => res.json())
        .then((d) => draw(d.reports))
        .catch(() => {});
    poll();
    const t = setInterval(poll, 30000);

    return () => {
      cancelled = true;
      clearInterval(t);
      teardown();
    };
  }, [map, showLive, liveReloadKey]);

  // Route polylines + origin/destination markers are managed imperatively —
  // @react-google-maps/api's <Polyline> is unreliable about removing itself
  // from the map when it unmounts, which left ghost lines behind after
  // clearing or changing the search. This clears and redraws every time.
  useEffect(() => {
    if (!map || !window.google) return;
    const g = window.google.maps;

    routeObjectsRef.current.forEach((o) => o.setMap(null));
    routeObjectsRef.current = [];
    if (!routesData) return;

    const created = [];
    if (routesData.origin) {
      created.push(
        new g.Marker({
          map,
          position: { lat: routesData.origin[0], lng: routesData.origin[1] },
          zIndex: 60,
          icon: {
            path: g.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: '#1a73e8',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
          },
        })
      );
    }
    if (routesData.destination) {
      created.push(
        new g.Marker({
          map,
          position: { lat: routesData.destination[0], lng: routesData.destination[1] },
          zIndex: 60,
        })
      );
    }
    (routesData.routes || []).forEach((r, idx) => {
      const path = r.polyline ? decodePolyline(r.polyline) : [];
      if (!path.length) return;
      const isSelected = idx === selectedRouteIdx;
      const isSafeRoute = idx === 0 || r.safety_score >= 75;
      const pl = new g.Polyline({
        map,
        path,
        strokeColor: isSelected ? (isSafeRoute ? '#1e8e3e' : '#d93025') : '#9aa0a6',
        strokeOpacity: isSelected ? 0.95 : 0.5,
        strokeWeight: isSelected ? 6 : 4,
        zIndex: isSelected ? 100 : 10,
      });
      pl.addListener('click', () => onRouteSelect && onRouteSelect(idx));
      created.push(pl);
    });

    routeObjectsRef.current = created;
    return () => {
      created.forEach((o) => o.setMap(null));
      routeObjectsRef.current = [];
    };
  }, [map, routesData, selectedRouteIdx, onRouteSelect]);

  useEffect(() => {
    if (map && flyTo) {
      map.panTo({ lat: flyTo.lat, lng: flyTo.lng });
      if (flyTo.zoom) map.setZoom(flyTo.zoom);
    }
  }, [map, flyTo]);

  useEffect(() => {
    if (map && routesData && window.google) {
      const bounds = new window.google.maps.LatLngBounds();
      bounds.extend({ lat: routesData.origin[0], lng: routesData.origin[1] });
      bounds.extend({ lat: routesData.destination[0], lng: routesData.destination[1] });
      const allRoutes = routesData.routes || [routesData.route_a, routesData.route_b];
      allRoutes.forEach((r) => {
        if (r.polyline) decodePolyline(r.polyline).forEach((pt) => bounds.extend(pt));
      });
      map.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 440 });
    }
  }, [map, routesData]);

  if (loadError || !apiKey) {
    return (
      <div className="gm-map-fallback">
        <p>
          Google Maps needs a valid <code>GOOGLE_MAPS_API_KEY</code> in <code>backend/.env</code>.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="gm-map-fallback">Loading map…</div>;
  }

  const isNight = hour >= 20 || hour < 5;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={defaultCenter}
      zoom={12}
      onLoad={(m) => setMap(m)}
      onClick={(e) => {
        if (!onMapClick || !e.latLng) return;
        const payload = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        if (e.placeId) {
          e.stop();
          payload.placeId = e.placeId;
        }
        onMapClick(payload);
      }}
      options={{
        zoomControl: true,
        streetViewControl: true,
        mapTypeControl: true,
        fullscreenControl: true,
        clickableIcons: true,
        draggableCursor: pickMode ? 'crosshair' : undefined,
      }}
    >
      {markerLocation && (
        <Marker
          position={markerLocation}
          draggable={pickMode}
          onDragEnd={(e) =>
            pickMode && onMapClick && onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() })
          }
          icon={
            pickMode
              ? {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 9,
                  fillColor: '#1a73e8',
                  fillOpacity: 0.9,
                  strokeColor: '#ffffff',
                  strokeWeight: 3,
                }
              : undefined
          }
        />
      )}

      {showFeatures &&
        features.map((f) => {
          const style = FEATURE_STYLE[f.type] || FEATURE_STYLE.other;
          const resolved = f.status === 'resolved';
          const isPolice = f.type === 'police_station';
          const title = isPolice
            ? `${f.note || 'Police station'}${f.jurisdiction ? `\n${f.jurisdiction}` : ''}`
            : `${style.label}${f.note ? ` — ${f.note}` : ''}${resolved ? ' (resolved)' : ''}`;
          return (
            <Marker
              key={f.feature_id}
              position={{ lat: f.lat, lng: f.lng }}
              onClick={() => onFeatureClick && onFeatureClick(f)}
              title={title}
              zIndex={isPolice ? 40 : undefined}
              icon={{
                path: isPolice
                  ? window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW
                  : window.google.maps.SymbolPath.CIRCLE,
                scale: isPolice ? 5 : 6,
                fillColor: style.color,
                fillOpacity: resolved ? 0.3 : 0.95,
                strokeColor: '#ffffff',
                strokeWeight: isPolice ? 2 : 1.5,
              }}
            />
          );
        })}

      {events.map((e) => (
        <Marker
          key={e.id}
          position={{ lat: e.lat, lng: e.lng }}
          onClick={() => onEventClick && onEventClick(e)}
          title={`${e.title} — ${e.venue}`}
          icon={{
            path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            scale: 5,
            fillColor: '#9334e6',
            fillOpacity: 0.95,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
          }}
        />
      ))}

      {userLocation && (
        <Marker
          position={{ lat: userLocation.lat, lng: userLocation.lng }}
          title="Your location"
          zIndex={999}
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: '#1a73e8',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          }}
        />
      )}

      {showPolice &&
        segments
          .filter((s) => s.police_station_distance_m <= 500)
          .map((seg) => (
            <Marker
              key={`pol-${seg.segment_id}`}
              position={{ lat: seg.lat + 0.0004, lng: seg.lng + 0.0004 }}
              title={`Police help point near ${seg.road_name}`}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 7,
                fillColor: '#1a73e8',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              }}
            />
          ))}

      {showLighting &&
        segments
          .filter((s) => s.lighting_score >= 8)
          .map((seg) => (
            <Marker
              key={`lit-${seg.segment_id}`}
              position={{ lat: seg.lat - 0.0004, lng: seg.lng - 0.0004 }}
              title={`Well-lit corridor — ${seg.lighting_score}/10`}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: '#fdd663',
                fillOpacity: 0.9,
                strokeColor: '#b06000',
                strokeWeight: 1,
              }}
            />
          ))}

      {showSafety &&
        segments.map((seg) => {
          const effectiveTraffic =
            seg.foot_traffic_base * (isNight ? seg.foot_traffic_night_multiplier : 1.0);
          const score =
            (seg.lighting_score * 2.5 +
              effectiveTraffic * 2.0 +
              seg.open_shops_density * 1.5 +
              (10 - Math.min(seg.past_incident_count_90d, 5) * 2)) *
            1.4;
          const fillColor = score >= 75 ? '#1e8e3e' : score >= 50 ? '#f9ab00' : '#d93025';
          return (
            <Marker
              key={seg.segment_id}
              position={{ lat: seg.lat, lng: seg.lng }}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 5,
                fillColor,
                fillOpacity: 0.85,
                strokeColor: '#ffffff',
                strokeWeight: 1,
              }}
              title={`${seg.road_name} (Safety: ${Math.round(score)}/100)`}
            />
          );
        })}
    </GoogleMap>
  );
}

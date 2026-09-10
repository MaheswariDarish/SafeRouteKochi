import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const FEATURE_COLORS = {
  streetlight_ok: '#f9ab00',
  streetlight_broken: '#d93025',
  streetlight_missing: '#80868b',
  dark_area: '#3c4043',
  cctv: '#1a73e8',
  police_aid: '#1e8e3e',
  unsafe_spot: '#d93025',
  other: '#5f6368',
};

export default function MapView({
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
  onMapClick,
  markerLocation,
  flyTo,
}) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const segmentsLayerRef = useRef(null);
  const featuresLayerRef = useRef(null);
  const routesLayerRef = useRef(null);
  const pinLayerRef = useRef(null);
  const extrasLayerRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    if (!leafletMapRef.current && mapRef.current) {
      const map = L.map(mapRef.current, { zoomControl: false }).setView([9.9816, 76.2999], 12);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      segmentsLayerRef.current = L.layerGroup().addTo(map);
      featuresLayerRef.current = L.layerGroup().addTo(map);
      routesLayerRef.current = L.layerGroup().addTo(map);
      pinLayerRef.current = L.layerGroup().addTo(map);
      extrasLayerRef.current = L.layerGroup().addTo(map);
      map.on('click', (e) => {
        onMapClickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      leafletMapRef.current = map;
    }
  }, []);

  useEffect(() => {
    if (leafletMapRef.current && flyTo) {
      leafletMapRef.current.setView([flyTo.lat, flyTo.lng], flyTo.zoom || 16);
    }
  }, [flyTo]);

  useEffect(() => {
    if (!pinLayerRef.current) return;
    pinLayerRef.current.clearLayers();
    if (markerLocation) {
      const icon = L.divIcon({
        className: 'gm-leaflet-marker',
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
        iconSize: [16, 16],
      });
      pinLayerRef.current.addLayer(L.marker([markerLocation.lat, markerLocation.lng], { icon }));
    }
  }, [markerLocation]);

  useEffect(() => {
    if (!extrasLayerRef.current) return;
    extrasLayerRef.current.clearLayers();
    events.forEach((e) => {
      const m = L.circleMarker([e.lat, e.lng], {
        radius: 7,
        fillColor: '#9334e6',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.95,
      });
      m.bindPopup(`<strong>${e.title}</strong><br>${e.venue}`);
      extrasLayerRef.current.addLayer(m);
    });
    if (userLocation) {
      const icon = L.divIcon({
        className: 'gm-leaflet-marker',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,115,232,0.2);"></div>`,
        iconSize: [14, 14],
      });
      extrasLayerRef.current.addLayer(L.marker([userLocation.lat, userLocation.lng], { icon }));
    }
  }, [events, userLocation]);

  useEffect(() => {
    if (!featuresLayerRef.current) return;
    featuresLayerRef.current.clearLayers();
    features.forEach((f) => {
      const isPolice = f.type === 'police_station';
      // Police stations = their own layer; fixed reports are hidden.
      if (isPolice ? !showPolice : !showFeatures || f.status === 'resolved') return;
      const color = isPolice ? '#1a73e8' : FEATURE_COLORS[f.type] || FEATURE_COLORS.other;
      const marker = L.circleMarker([f.lat, f.lng], {
        radius: isPolice ? 7 : 6,
        fillColor: color,
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.95,
      });
      marker.bindPopup(
        isPolice
          ? `<strong>${f.note || 'Police station'}</strong><br>${f.jurisdiction || ''}`
          : `<strong>${(f.type || '').replace(/_/g, ' ')}</strong><br>${f.note || ''}`
      );
      featuresLayerRef.current.addLayer(marker);
    });
  }, [features, showFeatures, showPolice]);

  useEffect(() => {
    if (!segmentsLayerRef.current) return;
    segmentsLayerRef.current.clearLayers();
    const isNight = hour >= 20 || hour < 5;

    segments.forEach((seg) => {
      const effectiveTraffic =
        seg.foot_traffic_base * (isNight ? seg.foot_traffic_night_multiplier : 1.0);
      const score =
        (seg.lighting_score * 2.5 +
          effectiveTraffic * 2.0 +
          seg.open_shops_density * 1.5 +
          (10 - Math.min(seg.past_incident_count_90d, 5) * 2)) *
        1.4;
      let color = '#1e8e3e';
      if (score < 50) color = '#d93025';
      else if (score < 75) color = '#f9ab00';

      if (showSafety) {
        const marker = L.circleMarker([seg.lat, seg.lng], {
          radius: 6,
          fillColor: color,
          color: '#ffffff',
          weight: 1.5,
          opacity: 0.9,
          fillOpacity: 0.85,
        });
        marker.bindPopup(`
          <div style="font-family: Roboto, sans-serif; min-width: 180px;">
            <strong style="font-size:14px;">${seg.road_name}</strong>
            <div style="font-size:12px;color:#5f6368;margin-bottom:6px;">${seg.area} (${seg.status})</div>
            <div style="font-size:12px;display:grid;grid-template-columns:1fr 1fr;gap:4px;">
              <div>Light: <strong>${seg.lighting_score}/10</strong></div>
              <div>Police: <strong>${seg.police_station_distance_m}m</strong></div>
            </div>
          </div>
        `);
        segmentsLayerRef.current.addLayer(marker);
      }

      if (showLighting && seg.lighting_score >= 8.0) {
        const lightIcon = L.divIcon({
          className: 'gm-leaflet-marker',
          html: `<div style="background:#fef7e0;border:1px solid #f9ab00;border-radius:50%;width:18px;height:18px;"></div>`,
          iconSize: [18, 18],
        });
        const lm = L.marker([seg.lat - 0.0004, seg.lng - 0.0004], { icon: lightIcon });
        lm.bindPopup(`<b>Well-lit corridor</b><br>Lighting score: ${seg.lighting_score}/10`);
        segmentsLayerRef.current.addLayer(lm);
      }
    });
  }, [segments, showSafety, showLighting, hour]);

  useEffect(() => {
    if (!routesLayerRef.current) return;
    routesLayerRef.current.clearLayers();
    if (!routesData) return;
    const segMap = new Map(segments.map((s) => [s.segment_id, s]));

    const originIcon = L.divIcon({
      className: 'gm-leaflet-marker',
      html: `<div style="background:#1a73e8;border:3px solid #fff;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [18, 18],
    });
    routesLayerRef.current.addLayer(L.marker(routesData.origin, { icon: originIcon }));

    const destIcon = L.divIcon({
      className: 'gm-leaflet-marker',
      html: `<div style="width:14px;height:14px;background:#d93025;border:3px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [14, 14],
    });
    routesLayerRef.current.addLayer(L.marker(routesData.destination, { icon: destIcon }));

    const build = (route) => {
      const coords = [routesData.origin];
      (route.segment_breakdown || []).forEach((b) => {
        const s = segMap.get(b.segment_id);
        if (s) coords.push([s.lat, s.lng]);
      });
      coords.push(routesData.destination);
      return coords;
    };

    const list = routesData.routes || [routesData.route_b, routesData.route_a].filter(Boolean);
    const allCoords = [];
    list.forEach((route, idx) => {
      const coords = build(route);
      allCoords.push(...coords);
      const selected = idx === selectedRouteIdx;
      routesLayerRef.current.addLayer(
        L.polyline(coords, {
          color: selected ? (idx === 0 ? '#1e8e3e' : '#d93025') : '#9aa0a6',
          weight: selected ? 7 : 4,
          opacity: selected ? 0.95 : 0.55,
        })
      );
    });

    if (leafletMapRef.current && allCoords.length) {
      leafletMapRef.current.fitBounds(L.latLngBounds(allCoords), { padding: [80, 80] });
    }
  }, [routesData, selectedRouteIdx, segments]);

  return <div ref={mapRef} className="map-canvas" />;
}

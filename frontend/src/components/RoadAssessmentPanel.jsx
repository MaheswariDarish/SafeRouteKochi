import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lightbulb, Store, Building2, Droplets } from 'lucide-react';
import { apiFetch } from '../lib/api';

export default function RoadAssessmentPanel({ coord, contributorName, onCancel, onSaved }) {
  const [form, setForm] = useState({
    road_name: '',
    area: '',
    lighting_score: 5,
    open_shops_density: 5,
    police_station_distance_m: 800,
    flood_risk: false,
  });
  const [loadingAddr, setLoadingAddr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!coord) return;
    setLoadingAddr(true);
    fetch(`/api/places/context?lat=${coord.lat}&lng=${coord.lng}`)
      .then((r) => r.json())
      .then((d) => {
        setForm((prev) => ({
          ...prev,
          road_name: prev.road_name || d.road || d.address?.split(',')[0] || 'Unnamed road',
          area: prev.area || d.area || d.address?.split(',')[1]?.trim() || '',
          police_station_distance_m:
            d.nearest_segment?.police_station_distance_m || prev.police_station_distance_m,
        }));
      })
      .catch(() => {})
      .finally(() => setLoadingAddr(false));
  }, [coord]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!coord) {
      setError('No location selected.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/segments', {
        method: 'POST',
        body: JSON.stringify({
          road_name: form.road_name,
          area: form.area,
          lat: coord.lat,
          lng: coord.lng,
          lighting_score: Number(form.lighting_score),
          open_shops_density: Number(form.open_shops_density),
          police_station_distance_m: Number(form.police_station_distance_m),
          hospital_distance_m: 1500,
          foot_traffic_base: 5.0,
          foot_traffic_night_multiplier: 0.5,
          past_incident_count_90d: 0,
          flood_risk: form.flood_risk,
          road_condition_score: 6.0,
        }),
      });
      if (res.status === 401) throw new Error('Please sign in to contribute.');
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gm-panel-view">
      <div className="gm-panel-head">
        <button className="gm-icon-btn" onClick={onCancel} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="gm-panel-head-text">
          <h2>Road assessment</h2>
          <p>A fuller safety record for this stretch of road.</p>
        </div>
      </div>

      <form className="gm-panel-scroll" onSubmit={save}>
        <section className="gm-panel-section">
          <div className="gm-field">
            <label>Road / street name</label>
            <input
              className="gm-text-input"
              required
              value={loadingAddr ? 'Finding address…' : form.road_name}
              onChange={(e) => set('road_name', e.target.value)}
            />
          </div>
          <div className="gm-field">
            <label>Area / locality</label>
            <input
              className="gm-text-input"
              required
              value={form.area}
              onChange={(e) => set('area', e.target.value)}
            />
          </div>
        </section>

        <section className="gm-panel-section">
          <label className="gm-slider-label">
            <Lightbulb size={14} /> Lighting quality — {form.lighting_score}/10
          </label>
          <input
            type="range"
            min="0"
            max="10"
            value={form.lighting_score}
            onChange={(e) => set('lighting_score', e.target.value)}
            className="gm-range-input"
          />

          <label className="gm-slider-label">
            <Store size={14} /> Shops open / commercial activity — {form.open_shops_density}/10
          </label>
          <input
            type="range"
            min="0"
            max="10"
            value={form.open_shops_density}
            onChange={(e) => set('open_shops_density', e.target.value)}
            className="gm-range-input"
          />

          <div className="gm-field">
            <label>
              <Building2 size={13} /> Distance to nearest police (m)
            </label>
            <input
              type="number"
              className="gm-text-input"
              min="50"
              max="10000"
              value={form.police_station_distance_m}
              onChange={(e) => set('police_station_distance_m', e.target.value)}
            />
          </div>

          <label className="gm-switch-label">
            <input
              type="checkbox"
              checked={form.flood_risk}
              onChange={(e) => set('flood_risk', e.target.checked)}
              style={{ accentColor: '#1a73e8' }}
            />
            <Droplets size={14} /> Floods during monsoon
          </label>
        </section>

        {contributorName && (
          <div className="gm-posting-as">Posting as <strong>{contributorName}</strong></div>
        )}
        {error && <div className="gm-inline-warning">{error}</div>}

        <div className="gm-panel-actions gm-panel-actions-instatic">
          <button type="submit" className="gm-primary-button" disabled={saving || loadingAddr}>
            {saving ? 'Saving…' : 'Save assessment'}
          </button>
          <button type="button" className="gm-text-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

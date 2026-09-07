import React, { useState } from 'react';
import { ArrowLeft, Crosshair, Paperclip, X } from 'lucide-react';
import { apiFetch } from '../lib/api';

const CATEGORIES = [
  'Festival',
  'Food',
  'Sports',
  'Art',
  'Music',
  'Temple festival',
  'Expo',
  'Community',
  'Other',
];

const today = new Date().toISOString().slice(0, 10);

export default function AddEventPanel({ coord, contributorName, onCancel, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    category: 'Community',
    venue: '',
    area: '',
    start_date: today,
    end_date: '',
    url: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [brochureFile, setBrochureFile] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!coord) {
      setError('Click the map where the event happens first.');
      return;
    }
    if (form.title.trim().length < 2) {
      setError('Give the event a title.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          title: form.title.trim(),
          end_date: form.end_date || form.start_date,
          lat: coord.lat,
          lng: coord.lng,
        }),
      });
      if (res.status === 401) throw new Error('Please sign in to post an event.');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.detail;
        const msg = Array.isArray(detail) ? detail[0]?.msg : detail;
        throw new Error(msg || `Save failed (${res.status})`);
      }
      const created = await res.json();

      if (brochureFile) {
        const fd = new FormData();
        fd.append('file', brochureFile);
        await apiFetch(`/api/events/${created.id}/brochure`, { method: 'POST', body: fd }).catch(() => {});
      }

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
          <h2>Add an event</h2>
          <p>Community events start as “pending” until a couple of people confirm them.</p>
        </div>
      </div>

      <form className="gm-panel-scroll" onSubmit={save}>
        <section className="gm-panel-section">
          <h3>Where</h3>
          <div className={`gm-coord-box ${coord ? '' : 'gm-coord-box-empty'}`}>
            <Crosshair size={16} />
            {coord ? (
              <span>
                {coord.lat.toFixed(5)}, {coord.lng.toFixed(5)}
              </span>
            ) : (
              <span>Click the map where the event is</span>
            )}
          </div>
        </section>

        <section className="gm-panel-section">
          {contributorName && (
            <div className="gm-posting-as">Posting as <strong>{contributorName}</strong></div>
          )}
          <div className="gm-field">
            <label>Event name</label>
            <input
              className="gm-text-input"
              required
              placeholder="e.g. Kaloor Night Market"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
          <div className="gm-field">
            <label>Category</label>
            <select
              className="gm-text-input"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="gm-field">
            <label>Venue</label>
            <input
              className="gm-text-input"
              placeholder="e.g. JLN Stadium car park"
              value={form.venue}
              onChange={(e) => set('venue', e.target.value)}
            />
          </div>
          <div className="gm-field">
            <label>Area</label>
            <input
              className="gm-text-input"
              placeholder="e.g. Kaloor"
              value={form.area}
              onChange={(e) => set('area', e.target.value)}
            />
          </div>
        </section>

        <section className="gm-panel-section">
          <div className="gm-form-grid">
            <div className="gm-field">
              <label>Starts</label>
              <input
                type="date"
                className="gm-text-input"
                value={form.start_date}
                onChange={(e) => set('start_date', e.target.value)}
              />
            </div>
            <div className="gm-field">
              <label>Ends (optional)</label>
              <input
                type="date"
                className="gm-text-input"
                value={form.end_date}
                min={form.start_date}
                onChange={(e) => set('end_date', e.target.value)}
              />
            </div>
          </div>
        </section>

        <section className="gm-panel-section">
          <div className="gm-field">
            <label>Link (optional)</label>
            <input
              className="gm-text-input"
              placeholder="https://…"
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
            />
          </div>
          <div className="gm-field">
            <label>Note — anything travellers should know (optional)</label>
            <textarea
              className="gm-textarea"
              rows={2}
              placeholder="e.g. road closures on Banerji Rd from 6pm"
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
            />
          </div>
          <div className="gm-field">
            <label>Brochure / poster (optional)</label>
            {brochureFile ? (
              <div className="gm-coord-box">
                <Paperclip size={15} />
                <span style={{ flex: 1 }}>{brochureFile.name}</span>
                <button
                  type="button"
                  className="gm-icon-btn"
                  style={{ width: 24, height: 24 }}
                  onClick={() => setBrochureFile(null)}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="gm-secondary-button" style={{ cursor: 'pointer' }}>
                <Paperclip size={15} /> Choose file
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setBrochureFile(e.target.files?.[0] || null)}
                />
              </label>
            )}
          </div>
        </section>

        {error && <div className="gm-inline-warning">{error}</div>}

        <div className="gm-panel-actions gm-panel-actions-instatic">
          <button type="submit" className="gm-primary-button" disabled={saving || !coord}>
            {saving ? 'Saving…' : 'Add event'}
          </button>
          <button type="button" className="gm-text-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

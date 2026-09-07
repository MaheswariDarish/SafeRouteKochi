import React, { useState } from 'react';
import { ArrowLeft, Crosshair, Check } from 'lucide-react';
import {
  FEATURE_STYLE,
  FEATURE_TYPE_ORDER as TYPE_ORDER,
  RESOLVABLE_FEATURE_TYPES,
} from '../lib/featureStyles';
import { apiFetch } from '../lib/api';

const SEVERITY = [
  [1, 'Minor'],
  [2, 'Moderate'],
  [3, 'Severe'],
];

export default function AddFeaturePanel({ coord, contributorName, onCancel, onSaved }) {
  const [type, setType] = useState('streetlight_broken');
  const [note, setNote] = useState('');
  const [severity, setSeverity] = useState(2);
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [merged, setMerged] = useState(null);

  // Severity only makes sense for a problem you'd want fixed.
  const showSeverity = RESOLVABLE_FEATURE_TYPES.has(type);
  // Only worth offering "post anonymously" when there's a real name to hide.
  const canHideName = contributorName && contributorName !== 'Anonymous';

  const save = async () => {
    if (!coord) {
      setError('Click the exact spot on the map first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/features', {
        method: 'POST',
        body: JSON.stringify({
          lat: coord.lat,
          lng: coord.lng,
          type,
          note: note.trim(),
          severity: showSeverity ? severity : 2,
          visibility: canHideName && anonymous ? 'anonymous' : 'public',
        }),
      });
      if (res.status === 401) throw new Error('Please sign in to contribute.');
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      const data = await res.json().catch(() => ({}));
      if (data._merged_into) {
        // We folded this into a nearby existing report instead of a duplicate.
        setMerged(data._merge_kind === 'reappeared'
          ? `A fixed report here was reopened — it's now recurred ${data.recurrence_count}×.`
          : 'Added your confirmation to an existing report at this spot.');
        setTimeout(onSaved, 1400);
        return;
      }
      onSaved();
    } catch (e) {
      setError(e.message);
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
          <h2>Add a point</h2>
          <p>One marker per real spot — a single streetlight, pothole, camera or note.</p>
        </div>
      </div>

      <div className="gm-panel-scroll">
        <section className="gm-panel-section">
          <h3>Location</h3>
          <div className={`gm-coord-box ${coord ? '' : 'gm-coord-box-empty'}`}>
            <Crosshair size={16} />
            {coord ? (
              <span>
                {coord.lat.toFixed(6)}, {coord.lng.toFixed(6)}
              </span>
            ) : (
              <span>Click the map on the exact spot</span>
            )}
          </div>
          {coord && <div className="gm-muted">Drag the blue dot on the map to fine-tune.</div>}
        </section>

        <section className="gm-panel-section">
          <h3>What's here?</h3>
          <div className="gm-type-grid">
            {TYPE_ORDER.map((t) => {
              const s = FEATURE_STYLE[t];
              return (
                <button
                  key={t}
                  className={`gm-type-btn ${type === t ? 'active' : ''}`}
                  onClick={() => setType(t)}
                >
                  <i style={{ background: s.color }} />
                  {s.label}
                  {type === t && <Check size={13} className="gm-type-check" />}
                </button>
              );
            })}
          </div>
        </section>

        {showSeverity && (
          <section className="gm-panel-section">
            <h3>How bad is it?</h3>
            <div className="gm-severity-row">
              {SEVERITY.map(([val, label]) => (
                <button
                  key={val}
                  className={`gm-severity-btn ${severity === val ? 'active' : ''} sev-${val}`}
                  onClick={() => setSeverity(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="gm-panel-section">
          <h3>Note (optional)</h3>
          <textarea
            className="gm-textarea"
            rows={2}
            placeholder="e.g. pole no. 12, dark since last week"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </section>

        {canHideName && (
          <label className="gm-check-row">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            <span>Post anonymously — hide my name on the map and report</span>
          </label>
        )}

        {contributorName && (
          <div className="gm-posting-as">
            Posting as <strong>{canHideName && anonymous ? 'Anonymous' : contributorName}</strong>
            {canHideName && anonymous && <span className="gm-muted"> · your account still records the report</span>}
          </div>
        )}
        {merged && <div className="gm-inline-note">{merged}</div>}
        {error && <div className="gm-inline-warning">{error}</div>}
      </div>

      <div className="gm-panel-actions">
        <button className="gm-primary-button" onClick={save} disabled={saving || !coord || !!merged}>
          {saving ? 'Saving…' : 'Save point'}
        </button>
        <button className="gm-text-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

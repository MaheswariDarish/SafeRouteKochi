import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

const SCALE = [1, 2, 3, 4, 5];

function Rating({ label, value, onChange, lowLabel, highLabel }) {
  return (
    <div className="gm-survey-q">
      <div className="gm-survey-label">{label}</div>
      <div className="gm-scale">
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            className={`gm-scale-dot ${value === n ? 'active' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="gm-scale-ends">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </div>
  );
}

export default function SurveyPanel({ context, contributorName, ensureIdentity, onDone }) {
  const [form, setForm] = useState({
    road_condition: 3,
    lighting: 3,
    felt_safe: 3,
    hazard_note: '',
    would_repeat: true,
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (ensureIdentity && !(await ensureIdentity())) return;
    setSaving(true);
    try {
      await apiFetch('/api/surveys', {
        method: 'POST',
        body: JSON.stringify({
          origin: context?.origin || null,
          destination: context?.destination || null,
          route_label: context?.route_label || null,
          ...form,
        }),
      });
      setDone(true);
      setTimeout(onDone, 1200);
    } catch {
      setDone(true);
      setTimeout(onDone, 800);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="gm-panel-view">
        <div className="gm-survey-thanks">
          <CheckCircle2 size={40} color="#1e8e3e" />
          <h2>Thanks for the feedback</h2>
          <p>It helps improve safety scores for everyone on this route.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="gm-panel-view">
      <div className="gm-panel-head">
        <div className="gm-panel-head-text">
          <h2>How was this route?</h2>
          <p>
            {context?.destination
              ? `Quick survey for your trip to ${context.destination}.`
              : 'A quick 30-second survey.'}
          </p>
        </div>
      </div>

      <form className="gm-panel-scroll" onSubmit={submit}>
        <section className="gm-panel-section">
          <Rating
            label="Road condition"
            value={form.road_condition}
            onChange={(v) => set('road_condition', v)}
            lowLabel="Broken / potholed"
            highLabel="Smooth"
          />
          <Rating
            label="Lighting & visibility"
            value={form.lighting}
            onChange={(v) => set('lighting', v)}
            lowLabel="Very dark"
            highLabel="Well lit"
          />
          <Rating
            label="How safe did you feel?"
            value={form.felt_safe}
            onChange={(v) => set('felt_safe', v)}
            lowLabel="Unsafe"
            highLabel="Very safe"
          />
        </section>

        <section className="gm-panel-section">
          <div className="gm-field">
            <label>Any hazard or incident you saw? (optional)</label>
            <textarea
              className="gm-textarea"
              rows={2}
              placeholder="e.g. flooding near the underpass, no streetlights past the junction"
              value={form.hazard_note}
              onChange={(e) => set('hazard_note', e.target.value)}
            />
          </div>
          <label className="gm-switch-label">
            <input
              type="checkbox"
              checked={form.would_repeat}
              onChange={(e) => set('would_repeat', e.target.checked)}
              style={{ accentColor: '#1a73e8' }}
            />
            I'd take this route again
          </label>
        </section>

        {contributorName && (
          <div className="gm-posting-as">Submitting as <strong>{contributorName}</strong></div>
        )}

        <div className="gm-panel-actions gm-panel-actions-instatic">
          <button type="submit" className="gm-primary-button" disabled={saving}>
            {saving ? 'Sending…' : 'Submit feedback'}
          </button>
          <button type="button" className="gm-text-btn" onClick={onDone}>
            Skip
          </button>
        </div>
      </form>
    </div>
  );
}

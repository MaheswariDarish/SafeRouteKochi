import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Plus,
  Check,
  X,
  MessageSquare,
  ThumbsUp,
  LocateFixed,
  Radio,
  Crosshair,
  MapPin,
  ImagePlus,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

const POLL_MS = 30000;

const RADII = [
  [1000, '1 km'],
  [3000, '3 km'],
  [10000, '10 km'],
  [0, 'Everywhere'],
];

const ago = (min) => {
  if (min == null) return '';
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
};

const dist = (m) => {
  if (m == null) return '';
  return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
};

export default function LivePanel({
  location,
  focusId,
  pickedCoord,
  picking,
  autoCompose,
  onAutoComposeConsumed,
  onStartPick,
  onStopPick,
  onBack,
  contributorName,
  onChanged,
  onLocate,
}) {
  const [reports, setReports] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState(3000);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ category: 'flooding', note: '', anonymous: false });
  const [photoFile, setPhotoFile] = useState(null);
  const [locMode, setLocMode] = useState('me'); // 'me' | 'pick'
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [commentFor, setCommentFor] = useState(null);
  const [commentText, setCommentText] = useState('');
  const focusRef = useRef(null);

  const canHideName = contributorName && contributorName !== 'Anonymous';
  const useRadius = radius > 0 && Boolean(location);

  const load = useCallback(() => {
    const qs = useRadius
      ? `?lat=${location.lat}&lng=${location.lng}&radius_m=${radius}`
      : '';
    fetch(`/api/live${qs}`)
      .then((r) => r.json())
      .then((d) => setReports(d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location, radius, useRadius]);

  useEffect(() => {
    fetch('/api/live/categories')
      .then((r) => r.json())
      .then(setCats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Opened from a pinned place → jump straight into the compose form with that
  // spot pre-selected.
  useEffect(() => {
    if (autoCompose && pickedCoord) {
      setComposing(true);
      setLocMode('pick');
      if (onAutoComposeConsumed) onAutoComposeConsumed();
    }
  }, [autoCompose, pickedCoord, onAutoComposeConsumed]);

  useEffect(() => {
    if (focusId && focusRef.current) focusRef.current.scrollIntoView({ block: 'center' });
  }, [focusId, reports]);

  const refresh = () => {
    load();
    if (onChanged) onChanged();
  };

  const startCompose = () => {
    setComposing(true);
    setLocMode(location ? 'me' : 'pick');
  };
  const closeCompose = () => {
    setComposing(false);
    setPhotoFile(null);
    setError('');
    if (onStopPick) onStopPick();
  };
  const chooseLocMode = (m) => {
    setLocMode(m);
    if (m === 'pick' && onStartPick) onStartPick();
    if (m === 'me' && onStopPick) onStopPick();
  };

  const composeCoord = locMode === 'pick' ? pickedCoord : location;

  const submit = async () => {
    if (!composeCoord) {
      setError('Pick where it’s happening first.');
      return;
    }
    setError('');
    setBusyId('new');
    try {
      const res = await apiFetch('/api/live', {
        method: 'POST',
        body: JSON.stringify({
          lat: composeCoord.lat,
          lng: composeCoord.lng,
          category: form.category,
          note: form.note.trim(),
          visibility: canHideName && form.anonymous ? 'anonymous' : 'public',
        }),
      });
      if (!res.ok) throw new Error(`Couldn’t post (${res.status})`);
      const created = await res.json().catch(() => ({}));
      if (photoFile && created.report_id) {
        const fd = new FormData();
        fd.append('file', photoFile);
        await apiFetch(`/api/live/${created.report_id}/photo`, { method: 'POST', body: fd }).catch(
          () => {}
        );
      }
      setForm({ category: 'flooding', note: '', anonymous: false });
      setPhotoFile(null);
      closeCompose();
      refresh();
    } catch (e) {
      setError(e.message || 'Couldn’t post — try again.');
    } finally {
      setBusyId(null);
    }
  };

  const act = async (id, path) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/live/${id}/${path}`, { method: 'POST', body: '{}' });
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const sendComment = async (id) => {
    if (!commentText.trim()) return;
    setBusyId(id);
    try {
      await apiFetch(`/api/live/${id}/comment`, {
        method: 'POST',
        body: JSON.stringify({
          text: commentText.trim(),
          visibility: canHideName && form.anonymous ? 'anonymous' : 'public',
        }),
      });
      setCommentText('');
      setCommentFor(null);
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const alerts = cats.filter((c) => c.group === 'alert');
  const vibes = cats.filter((c) => c.group === 'vibe');

  return (
    <div className="gm-panel-view">
      <div className="gm-panel-head">
        <button className="gm-icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="gm-panel-head-text">
          <h2>
            <Radio size={16} style={{ verticalAlign: '-2px' }} /> Happening now
          </h2>
          <p>Live, location-tagged reports. They fade out on their own.</p>
        </div>
        <button className="gm-icon-btn" onClick={refresh} aria-label="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="gm-panel-scroll">
        <div className="gm-live-radius">
          <span className="gm-muted">Show:</span>
          {RADII.map(([m, lbl]) => (
            <button
              key={m}
              className={`gm-live-radius-btn ${radius === m ? 'active' : ''}`}
              onClick={() => setRadius(m)}
              disabled={m > 0 && !location}
              title={m > 0 && !location ? 'Turn on location first' : ''}
            >
              {lbl}
            </button>
          ))}
        </div>
        {radius > 0 && !location && (
          <div className="gm-muted" style={{ margin: '4px 0 8px' }}>
            No location — showing everything.{' '}
            <button className="gm-link-btn" onClick={onLocate}>use my location</button>
          </div>
        )}

        {!composing && (
          <button className="gm-primary-button" onClick={startCompose} style={{ marginBottom: 12 }}>
            <Plus size={16} /> Report something
          </button>
        )}

        {composing && (
          <section className="gm-panel-section gm-live-compose">
            <h3>What's happening?</h3>

            <div className="gm-live-locmode">
              <button
                className={locMode === 'me' ? 'active' : ''}
                onClick={() => chooseLocMode('me')}
                disabled={!location}
              >
                <LocateFixed size={13} /> My location
              </button>
              <button
                className={locMode === 'pick' ? 'active' : ''}
                onClick={() => chooseLocMode('pick')}
              >
                <Crosshair size={13} /> Pick on map
              </button>
            </div>

            {locMode === 'me' && !location && (
              <div className="gm-empty-state">
                Turn on location, or switch to “Pick on map”.
                <button className="gm-secondary-button" style={{ marginTop: 8 }} onClick={onLocate}>
                  <LocateFixed size={14} /> Use my location
                </button>
              </div>
            )}
            {locMode === 'pick' && (
              <div className={`gm-coord-box ${pickedCoord ? '' : 'gm-coord-box-empty'}`}>
                <MapPin size={15} />
                {pickedCoord
                  ? `${pickedCoord.lat.toFixed(5)}, ${pickedCoord.lng.toFixed(5)}`
                  : picking
                  ? 'Tap the map where it’s happening'
                  : 'Tap “Pick on map” then tap the map'}
              </div>
            )}

            {composeCoord && (
              <>
                <div className="gm-live-catgroup">Alerts</div>
                <div className="gm-live-cats">
                  {alerts.map((c) => (
                    <button
                      key={c.key}
                      className={`gm-live-cat alert ${form.category === c.key ? 'active' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, category: c.key }))}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="gm-live-catgroup">Vibes</div>
                <div className="gm-live-cats">
                  {vibes.map((c) => (
                    <button
                      key={c.key}
                      className={`gm-live-cat vibe ${form.category === c.key ? 'active' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, category: c.key }))}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="gm-textarea"
                  rows={2}
                  placeholder="Quick detail (optional) — where exactly, how bad…"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
                <label className="gm-live-photo-pick">
                  <ImagePlus size={14} />
                  {photoFile ? photoFile.name : 'Add a photo (optional)'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                  />
                </label>
                {photoFile && (
                  <div className="gm-live-photo-preview">
                    <img src={URL.createObjectURL(photoFile)} alt="" />
                    <button className="gm-text-btn gm-text-btn-sm" onClick={() => setPhotoFile(null)}>
                      <X size={13} /> Remove
                    </button>
                  </div>
                )}
                {canHideName && (
                  <label className="gm-check-row">
                    <input
                      type="checkbox"
                      checked={form.anonymous}
                      onChange={(e) => setForm((f) => ({ ...f, anonymous: e.target.checked }))}
                    />
                    <span>Post anonymously</span>
                  </label>
                )}
              </>
            )}

            {error && <div className="gm-inline-warning">{error}</div>}
            <div className="gm-panel-actions-row" style={{ marginTop: 8 }}>
              <button
                className="gm-primary-button"
                onClick={submit}
                disabled={busyId === 'new' || !composeCoord}
              >
                {busyId === 'new' ? 'Posting…' : 'Post'}
              </button>
              <button className="gm-text-btn" onClick={closeCompose}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {loading && <div className="gm-muted">Loading…</div>}
        {!loading && reports.length === 0 && (
          <div className="gm-empty-state">
            {useRadius ? 'Nothing reported within this range.' : 'Nothing reported right now.'}
          </div>
        )}

        {reports.map((r) => (
          <div
            key={r.report_id}
            ref={focusId === r.report_id ? focusRef : null}
            className={`gm-live-card ${r.group} ${focusId === r.report_id ? 'focused' : ''}`}
          >
            <div className="gm-live-card-top">
              <span className={`gm-live-tag ${r.group}`}>{r.category_label}</span>
              <span className="gm-muted">
                {r.distance_m != null && `${dist(r.distance_m)} · `}
                {ago(r.age_min)}
              </span>
            </div>
            {r.note && <div className="gm-live-note">{r.note}</div>}
            {r.photo_url && (
              <a href={r.photo_url} target="_blank" rel="noreferrer" className="gm-live-photo">
                <img src={r.photo_url} alt="" loading="lazy" />
              </a>
            )}
            <div className="gm-muted gm-live-meta">
              {r.by}
              {r.minutes_left != null && ` · fades in ${ago(r.minutes_left).replace(' ago', '')}`}
              {r.still_there > 0 && ` · ${r.still_there} confirmed`}
            </div>

            {r.comments?.length > 0 && (
              <ul className="gm-live-comments">
                {r.comments.map((c, i) => (
                  <li key={i}>
                    <MessageSquare size={11} />
                    <span>
                      <span className="gm-muted">{c.by}: </span>
                      {c.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {commentFor === r.report_id ? (
              <div className="gm-live-commentbox">
                <input
                  className="gm-text-input"
                  placeholder="Add an update…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendComment(r.report_id)}
                />
                <button className="gm-text-btn gm-text-btn-sm" onClick={() => sendComment(r.report_id)}>
                  Send
                </button>
                <button
                  className="gm-text-btn gm-text-btn-sm"
                  onClick={() => {
                    setCommentFor(null);
                    setCommentText('');
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="gm-live-actions">
                <button
                  className="gm-text-btn gm-text-btn-sm"
                  disabled={busyId === r.report_id}
                  onClick={() => act(r.report_id, 'still-here')}
                >
                  <ThumbsUp size={13} /> Still here
                </button>
                <button
                  className="gm-text-btn gm-text-btn-sm"
                  disabled={busyId === r.report_id}
                  onClick={() => act(r.report_id, 'clear')}
                >
                  <Check size={13} /> Not anymore
                </button>
                <button
                  className="gm-text-btn gm-text-btn-sm"
                  onClick={() => {
                    setCommentFor(r.report_id);
                    setCommentText('');
                  }}
                >
                  <MessageSquare size={13} /> Comment
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

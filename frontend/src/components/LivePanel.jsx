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
} from 'lucide-react';
import { apiFetch } from '../lib/api';

const POLL_MS = 30000;

const ago = (min) => {
  if (min == null) return '';
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
};

export default function LivePanel({ location, focusId, onBack, contributorName, onChanged, onLocate }) {
  const [reports, setReports] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ category: 'flooding', note: '', anonymous: false });
  const [busyId, setBusyId] = useState(null);
  const [commentFor, setCommentFor] = useState(null);
  const [commentText, setCommentText] = useState('');
  const focusRef = useRef(null);

  const canHideName = contributorName && contributorName !== 'Anonymous';

  const load = useCallback(() => {
    fetch('/api/live')
      .then((r) => r.json())
      .then((d) => setReports(d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  useEffect(() => {
    if (focusId && focusRef.current) focusRef.current.scrollIntoView({ block: 'center' });
  }, [focusId, reports]);

  const refresh = () => {
    load();
    if (onChanged) onChanged();
  };

  const submit = async () => {
    if (!location || !form.note.trim()) return;
    setBusyId('new');
    try {
      const res = await apiFetch('/api/live', {
        method: 'POST',
        body: JSON.stringify({
          lat: location.lat,
          lng: location.lng,
          category: form.category,
          note: form.note.trim(),
          visibility: canHideName && form.anonymous ? 'anonymous' : 'public',
        }),
      });
      if (!res.ok) throw new Error();
      setComposing(false);
      setForm({ category: 'flooding', note: '', anonymous: false });
      refresh();
    } catch {
      /* keep the form open on failure */
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
        {!composing && (
          <button className="gm-primary-button" onClick={() => setComposing(true)} style={{ marginBottom: 12 }}>
            <Plus size={16} /> Report something
          </button>
        )}

        {composing && (
          <section className="gm-panel-section gm-live-compose">
            <h3>What's happening?</h3>
            {!location ? (
              <div className="gm-empty-state">
                Turn on location to report near you.
                <button className="gm-secondary-button" style={{ marginTop: 8 }} onClick={onLocate}>
                  <LocateFixed size={14} /> Use my location
                </button>
              </div>
            ) : (
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
                  placeholder="Quick detail — where exactly, how bad, etc."
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
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
                <div className="gm-panel-actions-row" style={{ marginTop: 8 }}>
                  <button
                    className="gm-primary-button"
                    onClick={submit}
                    disabled={busyId === 'new' || !form.note.trim()}
                  >
                    {busyId === 'new' ? 'Posting…' : 'Post'}
                  </button>
                  <button className="gm-text-btn" onClick={() => setComposing(false)}>
                    Cancel
                  </button>
                </div>
                <div className="gm-muted" style={{ marginTop: 6 }}>
                  Pinned to your current location.
                </div>
              </>
            )}
          </section>
        )}

        {loading && <div className="gm-muted">Loading…</div>}
        {!loading && reports.length === 0 && (
          <div className="gm-empty-state">Nothing reported right now.</div>
        )}

        {reports.map((r) => (
          <div
            key={r.report_id}
            ref={focusId === r.report_id ? focusRef : null}
            className={`gm-live-card ${r.group} ${focusId === r.report_id ? 'focused' : ''}`}
          >
            <div className="gm-live-card-top">
              <span className={`gm-live-tag ${r.group}`}>{r.category_label}</span>
              <span className="gm-muted">{ago(r.age_min)}</span>
            </div>
            {r.note && <div className="gm-live-note">{r.note}</div>}
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

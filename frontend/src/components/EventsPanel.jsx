import React, { useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  ExternalLink,
  Plus,
  Flag,
  CheckCircle2,
  Sparkles,
  Paperclip,
  FileText,
} from 'lucide-react';

const fmt = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const dateRange = (a, b) => (a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`);

const REPORT_REASONS = [
  ['wrong_info', 'Wrong details'],
  ['cancelled', 'Cancelled'],
  ['already_over', 'Already over'],
  ['duplicate', 'Duplicate'],
  ['spam', 'Spam / not an event'],
  ['other', 'Something else'],
];

const CONFIDENCE_LABEL = {
  confirmed: 'AI · confirmed',
  likely: 'AI · likely',
  speculative: 'AI · possible',
};

function BrochureUpload({ eventId, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch(`/api/events/${eventId}/brochure`, { method: 'POST', body: fd });
      if (res.ok && onUploaded) onUploaded();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
        style={{ display: 'none' }}
        onChange={pick}
      />
      <button
        className="gm-text-btn gm-text-btn-sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={13} /> {busy ? 'Uploading…' : 'Add brochure'}
      </button>
    </>
  );
}

function EventCard({ e, onShowOnMap, onChanged }) {
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('wrong_info');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [brochureBroken, setBrochureBroken] = useState(false);

  const community = e.source === 'community';
  const aiSourced = e.source === 'ai_discovered';
  const pending = e.status === 'pending';
  const isPdf = e.brochure_content_type === 'application/pdf';

  const submitReport = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/events/${e.id}/report`, {
        method: 'POST',
        body: JSON.stringify({ reason, detail: detail.trim() }),
      });
      setDone('Reported — thanks.');
      setReporting(false);
      if (onChanged) onChanged();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      await apiFetch(`/api/events/${e.id}/confirm`, { method: 'POST', body: '{}' });
      setDone('Confirmed.');
      if (onChanged) onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gm-event-card">
      <div className="gm-event-top">
        <span className="gm-event-date">
          <CalendarDays size={13} /> {dateRange(e.start_date, e.end_date)}
        </span>
        <span className="gm-event-cat">{e.category}</span>
      </div>
      <div className="gm-event-title">
        {e.title}
        {pending && <span className="gm-badge gm-badge-pending">Pending</span>}
        {aiSourced && (
          <span className="gm-badge gm-badge-ai">
            {CONFIDENCE_LABEL[e.confidence] || 'AI · unverified'}
          </span>
        )}
        {community && !pending && <span className="gm-badge gm-badge-community">Community</span>}
      </div>
      {e.venue && (
        <div className="gm-muted">
          {e.venue}
          {e.area ? `, ${e.area}` : ''}
        </div>
      )}
      {e.note && <div className="gm-event-note">{e.note}</div>}

      {aiSourced && (
        <div className="gm-event-ai-note">
          Sourced from the web by AI search — this is a {e.confidence || 'possible'} match, not a
          confirmed listing. Double-check before relying on it.
          {e.sources?.length > 0 && (
            <div className="gm-event-sources">
              Sources:{' '}
              {e.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer">
                  {s.title || new URL(s.url).hostname}
                  {i < e.sources.length - 1 ? ', ' : ''}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {e.brochure_url && !brochureBroken && (
        <div className="gm-brochure-preview">
          {isPdf ? (
            <a href={e.brochure_url} target="_blank" rel="noreferrer" className="gm-brochure-pdf">
              <FileText size={15} /> View brochure (PDF)
            </a>
          ) : (
            <a href={e.brochure_url} target="_blank" rel="noreferrer">
              <img src={e.brochure_url} alt="Event brochure" onError={() => setBrochureBroken(true)} />
            </a>
          )}
        </div>
      )}

      {done && <div className="gm-muted" style={{ marginTop: 6 }}>{done}</div>}

      {reporting ? (
        <div className="gm-report-box">
          <select className="gm-text-input" value={reason} onChange={(ev) => setReason(ev.target.value)}>
            {REPORT_REASONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <input
            className="gm-text-input"
            placeholder="Details (optional)"
            value={detail}
            onChange={(ev) => setDetail(ev.target.value)}
          />
          <div className="gm-report-actions">
            <button className="gm-text-btn gm-text-btn-sm" onClick={() => setReporting(false)}>
              Cancel
            </button>
            <button className="gm-text-btn gm-text-btn-sm" disabled={busy} onClick={submitReport}>
              Send report
            </button>
          </div>
        </div>
      ) : (
        <div className="gm-event-actions">
          <button className="gm-text-btn gm-text-btn-sm" onClick={() => onShowOnMap(e.lat, e.lng)}>
            <MapPin size={13} /> Show on map
          </button>
          {e.url && (
            <a className="gm-text-btn gm-text-btn-sm" href={e.url} target="_blank" rel="noreferrer">
              <ExternalLink size={13} /> Details
            </a>
          )}
          {pending && (
            <button className="gm-text-btn gm-text-btn-sm" disabled={busy} onClick={confirm}>
              <CheckCircle2 size={13} /> Confirm
            </button>
          )}
          {!e.brochure_url && <BrochureUpload eventId={e.id} onUploaded={onChanged} />}
          <button className="gm-text-btn gm-text-btn-sm" onClick={() => setReporting(true)}>
            <Flag size={13} /> Report
          </button>
        </div>
      )}
    </div>
  );
}

export default function EventsPanel({ events, onBack, onShowOnMap, onAddEvent, onChanged }) {
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');

  const searchWeb = async () => {
    setSearching(true);
    setSearchMsg('');
    try {
      const res = await fetch('/api/events/discover', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setSearchMsg(
          data.error.includes('RESOURCE_EXHAUSTED') || data.error.includes('429')
            ? 'AI search is out of quota right now — try again later.'
            : "Couldn't reach the AI search right now."
        );
      } else if ((data.events || []).length === 0) {
        setSearchMsg('No additional events found for the next 45 days.');
      } else {
        setSearchMsg(`Found ${data.events.length} possible event${data.events.length === 1 ? '' : 's'}.`);
      }
      if (onChanged) onChanged();
    } catch {
      setSearchMsg("Couldn't reach the AI search right now.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="gm-panel-view">
      <div className="gm-panel-head">
        <button className="gm-icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="gm-panel-head-text">
          <h2>Events in &amp; around Kochi</h2>
          <p>Curated + community-added. Anyone can add, attach a brochure, or report one.</p>
        </div>
        <button className="gm-icon-btn" onClick={onAddEvent} title="Add an event">
          <Plus size={20} />
        </button>
      </div>

      <div className="gm-panel-scroll">
        <div className="gm-events-toolbar">
          <button className="gm-secondary-button" onClick={onAddEvent}>
            <Plus size={15} /> Add an event
          </button>
          <button className="gm-secondary-button" onClick={searchWeb} disabled={searching}>
            <Sparkles size={15} /> {searching ? 'Searching…' : 'Search the web (AI)'}
          </button>
        </div>
        {searchMsg && <div className="gm-muted" style={{ marginBottom: 10 }}>{searchMsg}</div>}

        {events.length === 0 && <div className="gm-muted">No upcoming events listed.</div>}
        {events.map((e) => (
          <EventCard key={e.id} e={e} onShowOnMap={onShowOnMap} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

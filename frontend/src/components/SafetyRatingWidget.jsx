import React, { useState } from 'react';
import { Shield, Moon, Sun, Check } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { SAFETY_TAG_LABELS } from '../lib/featureStyles';

const SCORES = [
  [1, 'Very unsafe'],
  [2, 'Unsafe'],
  [3, 'Okay'],
  [4, 'Safe'],
  [5, 'Very safe'],
];

const guessTimeOfDay = () => {
  const h = new Date().getHours();
  return h < 6 || h >= 20 ? 'night' : 'day';
};

export default function SafetyRatingWidget({ coord, segmentId, contributorName, onSubmitted }) {
  const [score, setScore] = useState(0);
  const [timeOfDay, setTimeOfDay] = useState(guessTimeOfDay);
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const canHideName = contributorName && contributorName !== 'Anonymous';
  const toggleTag = (t) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const submit = async () => {
    if (!score || !coord) return;
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/api/ratings', {
        method: 'POST',
        body: JSON.stringify({
          lat: coord.lat,
          lng: coord.lng,
          segment_id: segmentId || null,
          score,
          time_of_day: timeOfDay,
          tags,
          comment: comment.trim(),
          visibility: canHideName && anonymous ? 'anonymous' : 'public',
        }),
      });
      if (!res.ok) throw new Error(`Couldn't save (${res.status})`);
      const data = await res.json().catch(() => ({}));
      setDone(data.spot || {});
      if (onSubmitted) onSubmitted();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    const n = done.sample || 1;
    let msg;
    if (done.updated) {
      msg = `Your earlier rating for this spot was updated — ${n} rating${n === 1 ? '' : 's'} here.`;
    } else if (done.created) {
      msg = 'Thanks — you started a new safety spot here.';
    } else {
      msg = `Added to this spot — now ${n} rating${n === 1 ? '' : 's'}${
        done.mean ? `, avg ${done.mean}/5` : ''
      }.`;
    }
    return (
      <div className="gm-rate-done">
        <Check size={15} /> {msg}
      </div>
    );
  }

  return (
    <div className="gm-rate">
      <div className="gm-rate-head">
        <Shield size={14} /> How safe does this spot feel?
      </div>

      <div className="gm-rate-scale">
        {SCORES.map(([v, label]) => (
          <button
            key={v}
            className={`gm-rate-dot ${score === v ? 'active' : ''} rate-${v}`}
            onClick={() => setScore(v)}
            title={label}
          >
            {v}
          </button>
        ))}
      </div>
      {score > 0 && (
        <div className="gm-muted gm-rate-scorelabel">{SCORES[score - 1][1]}</div>
      )}

      <div className="gm-rate-tod">
        <button
          className={timeOfDay === 'day' ? 'active' : ''}
          onClick={() => setTimeOfDay('day')}
        >
          <Sun size={13} /> Daytime
        </button>
        <button
          className={timeOfDay === 'night' ? 'active' : ''}
          onClick={() => setTimeOfDay('night')}
        >
          <Moon size={13} /> After dark
        </button>
      </div>

      <div className="gm-rate-tags">
        {Object.entries(SAFETY_TAG_LABELS).map(([t, label]) => (
          <button
            key={t}
            className={`gm-rate-tag ${tags.includes(t) ? 'active' : ''}`}
            onClick={() => toggleTag(t)}
          >
            {label}
          </button>
        ))}
      </div>

      <textarea
        className="gm-textarea"
        rows={2}
        placeholder="Add a note for others (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {canHideName && (
        <label className="gm-check-row">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          <span>Post anonymously</span>
        </label>
      )}

      {error && <div className="gm-inline-warning">{error}</div>}

      <button
        className="gm-primary-button gm-rate-submit"
        onClick={submit}
        disabled={!score || saving}
      >
        {saving ? 'Saving…' : 'Submit rating'}
      </button>
    </div>
  );
}

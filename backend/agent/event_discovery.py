"""
AI-assisted event discovery — the "we already have an agent" answer to
scraping Instagram directly.

Instead of scraping Instagram/event sites ourselves (fragile, ToS-grey),
this asks Gemini with Google Search grounding to look across the public web
(news, temple/church notices, listing sites, whatever's indexed — including
things that started life as an Instagram post) for real events in a given
date window, INCLUDING inferred/likely ones — e.g. "there is probably a
procession for Sree Krishna Jayanthi" when that festival date falls in the
window, even if no single page confirms Kochi specifically.

These results are never treated as confirmed: every item keeps its
`confidence` ("confirmed" | "likely" | "speculative"), is tagged
`source: "ai_discovered"` / `status: "unverified"`, and carries the grounding
citation URLs so a person can check before trusting it. Only run on demand
(`POST /api/events/discover`) — not on every page load — and cached for a
few hours to bound cost/latency.
"""

import hashlib
import json
import re
import time
from datetime import datetime, timedelta
from typing import Optional

from agent.gemini_client import generate_grounded

_CACHE_TTL = 6 * 3600  # 6 hours
_cache = {"at": 0.0, "events": [], "error": None}


def _extract_json_array(text: str) -> list:
    text = (text or "").strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        pass
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def _build_prompt(today: str, until: str) -> str:
    return f"""Search the web for real public events happening in and around Kochi,
Kerala, India, between {today} and {until} inclusive.

Include festivals, temple/church processions and utsavams, concerts, sports
events, marathons, expos and markets. Specifically check whether any major
Hindu/Christian/Muslim festival dates (e.g. Sree Krishna Jayanthi /
Janmashtami, Onam-related events, church feasts) fall in this window, and
whether well-known Kochi temples or churches (Ernakulathappan Temple,
Thrikkakara Temple, Santa Cruz Basilica, etc.) are likely holding a
procession or celebration for it — even if you can't find a page confirming
it specifically for this year, say so via "confidence".

Return ONLY a JSON array (no prose, no markdown fences). Each item:
{{"title": str, "category": str, "venue": str, "area": str,
  "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD",
  "note": "one sentence: road/crowd impact, or why you believe this is happening",
  "confidence": "confirmed" | "likely" | "speculative"}}

Every start_date must fall within {today}..{until}. Only "confirmed" if a
search result actually names Kochi/the venue for this date; use "likely" for
a well-established recurring event you're inferring the date for, and
"speculative" for anything else. Return at most 12 items, best first."""


def discover_kochi_events(days_ahead: int = 45, force: bool = False) -> dict:
    """Returns {"events": [...], "cached_at": iso|None, "error": str|None}.
    Uses an in-process cache so repeated page loads don't re-trigger Gemini;
    pass force=True (from the explicit "Search the web" action) to refresh."""
    now = time.time()
    if not force and now - _cache["at"] < _CACHE_TTL:
        return {
            "events": _cache["events"],
            "cached_at": _cache.get("cached_at"),
            "error": _cache.get("error"),
        }

    today = datetime.now().date()
    until = today + timedelta(days=days_ahead)

    try:
        result = generate_grounded(_build_prompt(today.isoformat(), until.isoformat()))
        items = _extract_json_array(result["text"])
        sources = result.get("sources", [])
    except Exception as e:  # noqa: BLE001
        print("[event_discovery] Gemini grounding call failed:", e)
        _cache["error"] = str(e)
        _cache["at"] = now  # still bound retries
        return {"events": _cache["events"], "cached_at": _cache.get("cached_at"), "error": str(e)}

    events = []
    for it in items:
        title = (it.get("title") or "").strip()
        start_date = (it.get("start_date") or "").strip()
        if not title or not re.match(r"^\d{4}-\d{2}-\d{2}$", start_date):
            continue
        if not (today.isoformat() <= start_date <= until.isoformat()):
            continue
        eid = "evt_ai_" + hashlib.md5(f"{title}|{start_date}".encode()).hexdigest()[:10]
        events.append({
            "id": eid,
            "title": title[:140],
            "category": it.get("category") or "AI-sourced",
            "venue": it.get("venue") or "",
            "area": it.get("area") or "Kochi",
            "start_date": start_date,
            "end_date": it.get("end_date") or start_date,
            "note": (it.get("note") or "").strip(),
            "confidence": it.get("confidence") if it.get("confidence") in
                ("confirmed", "likely", "speculative") else "speculative",
            "url": sources[0]["url"] if sources else "",
            "sources": sources[:5],
            "source": "ai_discovered",
            "status": "unverified",
            # geocoded later by the route handler, which has _geocode()
            "lat": None,
            "lng": None,
        })

    _cache["at"] = now
    _cache["cached_at"] = datetime.now().isoformat()
    _cache["events"] = events
    _cache["error"] = None
    return {"events": events, "cached_at": _cache["cached_at"], "error": None}


def get_cached_events() -> list:
    """Read-only accessor for GET /api/events — never triggers a Gemini call."""
    return _cache["events"]

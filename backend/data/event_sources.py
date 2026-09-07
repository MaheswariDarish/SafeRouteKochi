"""
Pluggable LIVE event sources (opt-in, off by default).

Why it's off by default
-----------------------
There is no reliable, ToS-friendly API for "events near a place":
  * Instagram has no such API and scraping it violates their terms and gets
    IP-blocked quickly — do not.
  * General event sites (Insider/District, AllEvents.in, BookMyShow) can be
    scraped but the markup changes often and it's a grey area.
So SafeRoute treats live sources as an optional augmentation on top of the
curated list (``kochi_events.py``) and community submissions (``/api/events``).

Enabling
--------
Set ``SAFEROUTE_EVENT_SOURCES`` to a comma-separated list, e.g.::

    SAFEROUTE_EVENT_SOURCES=reddit

Each fetcher returns a list of dicts shaped like ``KOCHI_EVENTS`` entries
(id, title, category, venue, area, lat, lng, start_date, end_date, url, note)
plus ``source`` and ``status`` ("unverified"). Results are cached in-process
for ``_CACHE_TTL`` seconds and every fetcher failure is swallowed so the
endpoint never breaks.

To add a real source, write ``_fetch_<name>()`` and register it in
``_FETCHERS``.
"""

import os
import time
import hashlib
from datetime import datetime

KOCHI_CENTROID = (9.9816, 76.2999)

_CACHE_TTL = 1800  # 30 min
_cache = {"at": 0.0, "events": []}


def _today_iso() -> str:
    return datetime.now().date().isoformat()


def _fetch_reddit() -> list:
    """Recent event-ish posts from r/Kochi. Public JSON, no auth. Best-effort:
    returns [] on any hiccup (Reddit often 403s datacenter IPs). Posts have no
    real location, so they're pinned to the city centre and clearly flagged."""
    try:
        import requests
        url = (
            "https://www.reddit.com/r/Kochi/search.json"
            "?q=event OR fest OR concert OR marathon&restrict_sr=on&sort=new&t=month&limit=25"
        )
        resp = requests.get(url, headers={"User-Agent": "SafeRoute/1.0 (events widget)"}, timeout=6)
        if resp.status_code != 200:
            return []
        out = []
        for child in resp.json().get("data", {}).get("children", []):
            d = child.get("data", {})
            title = (d.get("title") or "").strip()
            if not title:
                continue
            out.append({
                "id": "evt_reddit_" + hashlib.md5(d.get("permalink", title).encode()).hexdigest()[:8],
                "title": title[:140],
                "category": "Community buzz",
                "venue": "See r/Kochi thread",
                "area": "Kochi",
                "lat": KOCHI_CENTROID[0],
                "lng": KOCHI_CENTROID[1],
                "start_date": _today_iso(),
                "end_date": _today_iso(),
                "url": "https://www.reddit.com" + d.get("permalink", ""),
                "note": "From r/Kochi — unverified, exact date & location not parsed.",
                "source": "reddit",
                "status": "unverified",
            })
        return out
    except Exception as e:  # noqa: BLE001
        print("[event_sources] reddit fetch failed:", e)
        return []


_FETCHERS = {
    "reddit": _fetch_reddit,
}


def fetch_live_events() -> list:
    """Returns live events from every enabled source, cached in-process."""
    enabled = [s.strip() for s in os.environ.get("SAFEROUTE_EVENT_SOURCES", "").split(",") if s.strip()]
    if not enabled:
        return []

    now = time.time()
    if now - _cache["at"] < _CACHE_TTL:
        return _cache["events"]

    events = []
    for name in enabled:
        fetcher = _FETCHERS.get(name)
        if fetcher:
            events.extend(fetcher())
        else:
            print(f"[event_sources] unknown source '{name}' (known: {list(_FETCHERS)})")

    _cache["at"] = now
    _cache["events"] = events
    return events

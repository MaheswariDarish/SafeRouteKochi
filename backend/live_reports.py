"""
Live reports — "something is happening here right now".

Short-lived, geo-tagged posts. Each has a category, a `created_at`, and an
`expires_at` (now + the category's TTL). A report auto-hides once it expires or
is explicitly cleared; a "still here" vote pushes `expires_at` back out, capped
so nothing lives forever.

`alert` categories are routing-relevant and shown in red/amber; `vibe`
categories are social only and never touch a safety score.
"""

import math
from datetime import datetime, timedelta, timezone

# key: (label, group, ttl_hours)
LIVE_CATEGORIES = {
    "flooding":        ("Flooding / waterlogging", "alert", 6),
    "accident":        ("Accident", "alert", 2),
    "road_blocked":    ("Road blocked", "alert", 4),
    "protest_crowd":   ("Protest / large crowd", "alert", 4),
    "police_activity": ("Police activity / check", "alert", 3),
    "harassment":      ("Harassment / unsafe situation", "alert", 3),
    "hazard":          ("Hazard / debris on road", "alert", 6),
    "power_cut":       ("Power outage", "alert", 4),
    "street_food":     ("Street food / stall", "vibe", 5),
    "live_music":      ("Live music / performance", "vibe", 4),
    "festival":        ("Festival / procession", "vibe", 8),
    "market":          ("Market / pop-up", "vibe", 6),
    "good_view":       ("Good view / sunset", "vibe", 3),
    "screening":       ("Match screening", "vibe", 5),
    "other":           ("Something else", "alert", 3),
}
_DEFAULT = ("Something else", "alert", 3)

# a "still here" vote can extend a report to at most this multiple of its TTL
_MAX_LIFE_MULTIPLE = 4
# metres from a route polyline for a report to count as "on the route"
_ON_ROUTE_M = 55.0


def _cat(category):
    return LIVE_CATEGORIES.get(category, _DEFAULT)


def ttl_hours(category) -> int:
    return _cat(category)[2]


def _parse(ts):
    try:
        dt = datetime.fromisoformat((ts or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def initial_expiry(category, created_at=None) -> str:
    base = _parse(created_at) or datetime.now(timezone.utc)
    return (base + timedelta(hours=ttl_hours(category))).isoformat()


def bumped_expiry(report) -> str:
    """New `expires_at` after a 'still here' vote: full TTL from now, but never
    past created_at + _MAX_LIFE_MULTIPLE * TTL."""
    now = datetime.now(timezone.utc)
    hrs = ttl_hours(report.get("category"))
    created = _parse(report.get("created_at")) or now
    hard_cap = created + timedelta(hours=hrs * _MAX_LIFE_MULTIPLE)
    return min(now + timedelta(hours=hrs), hard_cap).isoformat()


def is_active(report, now=None) -> bool:
    if report.get("cleared"):
        return False
    now = now or datetime.now(timezone.utc)
    exp = _parse(report.get("expires_at"))
    return exp is None or now < exp


def decorate(report, now=None) -> dict:
    now = now or datetime.now(timezone.utc)
    label, group, _ = _cat(report.get("category"))
    created = _parse(report.get("created_at"))
    exp = _parse(report.get("expires_at"))
    age_min = int((now - created).total_seconds() // 60) if created else None
    mins_left = max(0, int((exp - now).total_seconds() // 60)) if exp else None
    by = ("Anonymous" if report.get("visibility") == "anonymous"
          else (report.get("contributor") or {}).get("name")
          or report.get("contributed_by") or "Anonymous")
    return {
        "report_id": report.get("report_id"),
        "lat": report.get("lat"),
        "lng": report.get("lng"),
        "category": report.get("category"),
        "category_label": label,
        "group": group,
        "routing_alert": group == "alert",
        "note": report.get("note", ""),
        "by": by,
        "still_there": report.get("still_there", 0),
        "age_min": age_min,
        "minutes_left": mins_left,
        "photo_url": f"/api/live/{report.get('report_id')}/photo" if report.get("photo") else None,
        "created_at": report.get("created_at"),
        "updated_at": report.get("updated_at"),
        "comments": [_comment_view(c) for c in report.get("comments", [])],
    }


def _comment_view(c) -> dict:
    return {
        "text": c.get("text", ""),
        "by": ("Anonymous" if c.get("visibility") == "anonymous"
               else (c.get("contributor") or {}).get("name") or "Anonymous"),
        "at": c.get("at"),
    }


def active_decorated(reports, now=None) -> list:
    now = now or datetime.now(timezone.utc)
    out = [decorate(r, now) for r in reports if is_active(r, now)]
    out.sort(key=lambda r: r.get("updated_at") or "", reverse=True)
    return out


def in_bbox(reports, bbox) -> list:
    """bbox = (min_lng, min_lat, max_lng, max_lat)."""
    mnlng, mnlat, mxlng, mxlat = bbox
    return [r for r in reports
            if mnlat <= r.get("lat", 999) <= mxlat and mnlng <= r.get("lng", 999) <= mxlng]


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def alerts_along_route(encoded_polyline, reports, now=None, radius_m=_ON_ROUTE_M) -> list:
    """Active, routing-relevant reports that sit on a route's path — newest first."""
    from agent.scoring_engine import _decode_polyline

    path = _decode_polyline(encoded_polyline)
    if not path:
        return []
    step = max(1, len(path) // 400)
    thinned = path[::step]
    now = now or datetime.now(timezone.utc)

    out = []
    for r in reports:
        if not is_active(r, now) or _cat(r.get("category"))[1] != "alert":
            continue
        rlat, rlng = r.get("lat"), r.get("lng")
        if rlat is None or rlng is None:
            continue
        if any(abs(p[0] - rlat) < 0.002 and abs(p[1] - rlng) < 0.002 for p in thinned):
            if min(_haversine_m(rlat, rlng, p[0], p[1]) for p in thinned) <= radius_m:
                out.append(decorate(r, now))
    out.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return out

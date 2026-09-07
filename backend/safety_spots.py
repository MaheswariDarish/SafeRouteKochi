"""
Safety spots — subjective safety ratings clustered into stable places.

The `safety_ratings` collection is the source of truth. A "spot" is derived on
read by greedy clustering: ratings are visited oldest-first and each one joins
the nearest existing spot whose running centroid is within SPOT_JOIN_RADIUS_M,
otherwise it founds a new spot. A spot's id is its founding rating's id, so it
stays stable for as long as that rating exists.

Everything here is pure over a list of rating dicts — no I/O — so the caller
passes the ratings in and decides the scoring hour.
"""

import math

SPOT_JOIN_RADIUS_M = 75.0   # a rating within this of a spot's centre joins it
SPOT_MIN_RADIUS_M = 40.0    # floor for the drawn catchment circle


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _centroid(members: list) -> tuple:
    n = len(members) or 1
    return (sum(m["lat"] for m in members) / n, sum(m["lng"] for m in members) / n)


def cluster_spots(ratings: list) -> list:
    """Greedy, oldest-first. Returns [{spot_id, members[]}]."""
    ordered = sorted(ratings, key=lambda r: r.get("created_at") or "")
    spots: list = []
    for r in ordered:
        if "lat" not in r or "lng" not in r:
            continue
        best, best_d = None, SPOT_JOIN_RADIUS_M
        for sp in spots:
            cx, cy = _centroid(sp["members"])
            d = _haversine_m(r["lat"], r["lng"], cx, cy)
            if d <= best_d:
                best, best_d = sp, d
        if best is None:
            best = {"spot_id": r.get("rating_id") or f"spot_{len(spots)}", "members": []}
            spots.append(best)
        best["members"].append(r)
    return spots


def summarize_spot(spot: dict, hour: int = 22) -> dict:
    """Plain display stats for a spot — straight mean and tag tally over its
    members (no min-sample gate, no decay). The *score nudge* is a separate,
    gated calculation in scoring_engine.community_adjustment; this is just "what
    people said here"."""
    members = spot["members"]
    n = len(members)
    cx, cy = _centroid(members)
    scores = [m["score"] for m in members if isinstance(m.get("score"), (int, float))]
    tags: dict = {}
    for m in members:
        for t in (m.get("tags") or []):
            tags[t] = tags.get(t, 0) + 1
    spread = max((_haversine_m(cx, cy, m["lat"], m["lng"]) for m in members), default=0.0)
    nights = sum(1 for m in members if m.get("time_of_day") == "night")
    days = sum(1 for m in members if m.get("time_of_day") == "day")
    return {
        "spot_id": spot["spot_id"],
        "lat": round(cx, 6),
        "lng": round(cy, 6),
        "sample": n,
        "mean": round(sum(scores) / len(scores), 1) if scores else None,
        "tags": dict(sorted(tags.items(), key=lambda kv: -kv[1])),
        "dominant_time": "night" if nights > days else ("day" if days > nights else None),
        "radius_m": round(max(SPOT_MIN_RADIUS_M, min(spread, SPOT_JOIN_RADIUS_M))),
    }


def _nearest_spot(lat: float, lng: float, spots: list):
    best, best_d = None, SPOT_JOIN_RADIUS_M
    for sp in spots:
        cx, cy = _centroid(sp["members"])
        d = _haversine_m(lat, lng, cx, cy)
        if d <= best_d:
            best, best_d = sp, d
    return best


def _recent_comments(members: list) -> list:
    comments = sorted(
        (m for m in members if (m.get("comment") or "").strip()),
        key=lambda m: m.get("created_at") or "", reverse=True,
    )[:3]
    return [{
        "score": m["score"],
        "comment": m["comment"],
        "tags": m.get("tags", []),
        "by": "Anonymous" if m.get("visibility") == "anonymous"
              else (m.get("contributor") or {}).get("name") or m.get("contributed_by") or "Anonymous",
        "at": m.get("created_at"),
    } for m in comments]


def resolve_spot(lat: float, lng: float, ratings: list, hour: int) -> dict:
    """The spot whose catchment contains (lat,lng): {summary, members}. `summary`
    is None and `members` is [] when the point isn't inside any spot."""
    sp = _nearest_spot(lat, lng, cluster_spots(ratings))
    if not sp:
        return {"summary": None, "members": []}
    summary = summarize_spot(sp, hour)
    summary["in_spot"] = True
    summary["join_radius_m"] = SPOT_JOIN_RADIUS_M
    summary["comments"] = _recent_comments(sp["members"])
    return {"summary": summary, "members": sp["members"]}


def spot_containing_rating(rating_id: str, ratings: list, hour: int):
    for sp in cluster_spots(ratings):
        if any(m.get("rating_id") == rating_id for m in sp["members"]):
            out = summarize_spot(sp, hour)
            out["comments"] = _recent_comments(sp["members"])
            return out
    return None


def all_spots(ratings: list, hour: int) -> list:
    return [summarize_spot(sp, hour) for sp in cluster_spots(ratings)]

"""
Safety Scoring Engine
----------------------
Computes a 0-100 safety score for a road segment, adjusted for time of day.
Weights are exposed as constants for transparency/explainability.

Verification-aware: 'verified' segments count fully. 'pending' segments
(new crowd contributions not yet corroborated) are shown on the map but
contribute at reduced confidence until verified, similar in spirit to how
Google Maps treats unconfirmed edits — visible, but not fully trusted yet.
"""

import math
from datetime import datetime, timezone
from typing import List, Dict
from data.data_access import get_all_segments, get_segment

WEIGHTS = {
    "lighting": 0.25,
    "foot_traffic": 0.20,
    "police_proximity": 0.15,
    "shops": 0.10,
    "incident_history": 0.15,
    "road_condition": 0.10,
    "flood_risk": 0.05,
}

NIGHT_START_HOUR = 20
NIGHT_END_HOUR = 5

PENDING_CONFIDENCE_DISCOUNT = 0.85  # pending segments' scores are pulled 15% toward neutral (50)


def is_night(hour: int) -> bool:
    return hour >= NIGHT_START_HOUR or hour < NIGHT_END_HOUR


def _normalize_distance(distance_m: int, cap_m: int = 3000) -> float:
    capped = min(distance_m, cap_m)
    return round(10 * (1 - capped / cap_m), 2)


def _normalize_incidents(count: int, cap: int = 8) -> float:
    capped = min(count, cap)
    return round(10 * (1 - capped / cap), 2)


def score_segment(segment: dict, hour: int, is_raining: bool = False) -> dict:
    night = is_night(hour)
    effective_traffic = segment["foot_traffic_base"] * (
        segment["foot_traffic_night_multiplier"] if night else 1.0
    )

    police_score = _normalize_distance(segment["police_station_distance_m"])
    incident_score = _normalize_incidents(segment["past_incident_count_90d"])
    flood_penalty_active = segment["flood_risk"] and is_raining
    flood_score = 0.0 if flood_penalty_active else 10.0

    factors = {
        "lighting": segment["lighting_score"],
        "foot_traffic": round(effective_traffic, 2),
        "police_proximity": police_score,
        "shops": segment["open_shops_density"],
        "incident_history": incident_score,
        "road_condition": segment["road_condition_score"],
        "flood_risk": flood_score,
    }

    weighted_sum = sum(factors[k] * WEIGHTS[k] for k in WEIGHTS)
    raw_score = round(weighted_sum * 10, 1)

    is_pending = segment.get("status") == "pending"
    if is_pending:
        # Pull toward neutral 50 so unverified data can't swing a route's
        # score as confidently as corroborated data.
        final_score = round(
            raw_score * PENDING_CONFIDENCE_DISCOUNT + 50 * (1 - PENDING_CONFIDENCE_DISCOUNT), 1
        )
    else:
        final_score = raw_score

    return {
        "segment_id": segment["segment_id"],
        "road_name": segment["road_name"],
        "score": final_score,
        "raw_score": raw_score,
        "factors": factors,
        "is_night": night,
        "flood_penalty_active": flood_penalty_active,
        "status": segment.get("status", "verified"),
        "confidence_adjusted": is_pending,
    }


# --- Contribution-aware route condition penalty ---------------------------------

# metres a feature must be from the route polyline to count as "on the route"
_ON_ROUTE_M = 45

_CONDITION_WEIGHTS = {
    # type: (per-hit penalty, cap)
    "pothole": (2.0, 15.0),
    "streetlight_broken": (1.5, 10.0),
    "streetlight_missing": (1.5, 10.0),
    "dark_area": (2.0, 10.0),
    "unsafe_spot": (3.0, 12.0),
}


def _decode_polyline(encoded: str) -> List[tuple]:
    if not encoded:
        return []
    points, index, lat, lng = [], 0, 0, 0
    length = len(encoded)
    while index < length:
        for _ in range(2):
            shift, result = 0, 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            d = ~(result >> 1) if result & 1 else (result >> 1)
            if _ == 0:
                lat += d
            else:
                lng += d
        points.append((lat / 1e5, lng / 1e5))
    return points


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def route_condition_penalty(encoded_polyline: str, features: List[dict]) -> dict:
    """Given a route's encoded polyline and a list of verified community
    features, returns how much to knock off the route's safety score plus the
    per-type hit counts. A feature counts once, for the closest point on the
    route within ~45 m."""
    path = _decode_polyline(encoded_polyline)
    counts = {k: 0 for k in _CONDITION_WEIGHTS}
    if not path:
        return {"penalty": 0.0, "pothole_count": 0, "notes": [], "counts": counts}

    # thin the path a little for speed on long routes
    step = max(1, len(path) // 400)
    thinned = path[::step]

    for f in features:
        w = _CONDITION_WEIGHTS.get(f.get("type"))
        if not w:
            continue
        flat, flng = f["lat"], f["lng"]
        # cheap bounding pre-filter
        if any(abs(p[0] - flat) < 0.002 and abs(p[1] - flng) < 0.002 for p in thinned):
            if min(_haversine_m(flat, flng, p[0], p[1]) for p in thinned) <= _ON_ROUTE_M:
                counts[f["type"]] += 1

    penalty = 0.0
    notes = []
    for t, (per, cap) in _CONDITION_WEIGHTS.items():
        n = counts[t]
        if n:
            penalty += min(per * n, cap)
            label = t.replace("_", " ")
            notes.append(f"{n} {label}{'s' if n > 1 and not t.startswith('streetlight') else ''}")

    return {
        "penalty": round(penalty, 1),
        "pothole_count": counts["pothole"],
        "notes": notes,
        "counts": counts,
    }


# --- Community feel: bounded nudge from subjective 1-5 ratings ------------------
#
# The computed score above is the base. People's "how safe does this feel"
# ratings pull it toward their consensus, but only so far: capped at
# RATING_MAX_ADJUST points, decayed by age (older ratings count less), and ramped
# in by sample size so two ratings can't swing a street. Both numbers are always
# reported so the UI can show "computed 62 · community 49".

RATING_HALF_LIFE_DAYS = 120.0
RATING_MIN_SAMPLE = 2.5          # effective (decayed) count before any nudge
RATING_FULL_CONF_SAMPLE = 8.0    # effective count at which the full nudge applies
RATING_MAX_ADJUST = 15.0         # never move the computed score more than this


def _rating_age_weight(created_at: str, now: datetime) -> float:
    try:
        dt = datetime.fromisoformat((created_at or "").replace("Z", "+00:00"))
    except ValueError:
        return 1.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - dt).total_seconds() / 86400.0)
    return 0.5 ** (age_days / RATING_HALF_LIFE_DAYS)


def community_adjustment(computed_score: float, ratings: List[dict], hour: int) -> dict:
    """Nudge a computed 0-100 safety score toward how people say a spot feels.
    Returns both numbers plus the tag tally — never replaces the computed score."""
    now = datetime.now(timezone.utc)
    night = is_night(hour)
    wsum = vsum = 0.0
    tag_counts: Dict[str, int] = {}

    for r in ratings:
        try:
            s = float(r.get("score"))
        except (TypeError, ValueError):
            continue
        if not 1.0 <= s <= 5.0:
            continue
        w = _rating_age_weight(r.get("created_at", ""), now)
        tod = r.get("time_of_day")
        if tod in ("day", "night"):
            # a night rating is the better guide when scoring for night
            w *= 1.0 if (tod == "night") == night else 0.6
        wsum += w
        vsum += w * s
        for t in (r.get("tags") or []):
            tag_counts[t] = tag_counts.get(t, 0) + 1

    out = {
        "computed_score": round(computed_score, 1),
        "adjusted_score": round(computed_score, 1),
        "community_mean": None,
        "sample": len(ratings),
        "effective_sample": round(wsum, 2),
        "applied_delta": 0.0,
        "tag_counts": tag_counts,
    }
    if wsum < RATING_MIN_SAMPLE:
        return out

    mean = vsum / wsum                        # 1..5
    community_pct = (mean - 1.0) / 4.0 * 100  # 0..100
    delta = max(-RATING_MAX_ADJUST, min(RATING_MAX_ADJUST, community_pct - computed_score))
    conf = min(1.0, wsum / RATING_FULL_CONF_SAMPLE)
    applied = delta * conf

    out["community_mean"] = round(mean, 2)
    out["applied_delta"] = round(applied, 1)
    out["adjusted_score"] = round(max(0.0, min(100.0, computed_score + applied)), 1)
    return out


def score_route(segment_ids: List[str], hour: int, is_raining: bool = False) -> dict:
    breakdowns = []
    for sid in segment_ids:
        seg = get_segment(sid)
        if seg:
            breakdowns.append(score_segment(seg, hour, is_raining))

    if not breakdowns:
        raise ValueError("No valid segments found for route")

    avg_score = sum(b["score"] for b in breakdowns) / len(breakdowns)
    worst = min(breakdowns, key=lambda b: b["score"])
    final_score = round(0.7 * avg_score + 0.3 * worst["score"], 1)

    return {
        "safety_score": final_score,
        "average_segment_score": round(avg_score, 1),
        "worst_segment": worst,
        "segment_breakdown": breakdowns,
        "hour": hour,
        "is_night": is_night(hour),
        "is_raining": is_raining,
    }
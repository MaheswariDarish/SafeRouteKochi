import os
import re
import math
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Depends
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel, Field


from auth import get_current_user
from safety_spots import (
    resolve_spot,
    spot_containing_rating,
    all_spots,
    spots_along_route,
    SPOT_JOIN_RADIUS_M,
)
import live_reports as live
from agent.scoring_engine import (
    score_route,
    score_segment,
    route_condition_penalty,
    community_adjustment,
)
from agent.explanation_agent import explain_single_route, explain_route_comparison
from agent.event_discovery import discover_kochi_events, get_cached_events
from agent.gemini_client import is_gemini_configured
from data.data_access import (
    get_all_segments,
    get_segment,
    create_segment,
    update_segment,
    get_all_features,
    get_feature,
    create_feature,
    update_feature,
    get_all_surveys,
    create_survey,
    get_all_ratings,
    create_rating,
    update_rating,
    get_all_live_reports,
    get_live_report,
    create_live_report,
    update_live_report,
    get_all_community_events,
    get_community_event,
    create_community_event,
    update_community_event,
    get_brochure,
    set_brochure,
    get_contributor,
    upsert_contributor,
    is_using_firestore,
)
from data.kochi_events import KOCHI_EVENTS
from data.event_sources import fetch_live_events
from schemas.schemas import (
    NewSegmentInput,
    ConfirmInput,
    NewFeatureInput,
    NewSurveyInput,
    NewEventInput,
    EventReportInput,
    NewRatingInput,
    NewLiveReportInput,
    LiveCommentInput,
)

UPLOAD_DIR = Path(__file__).resolve().parent / "data" / "uploads" / "events"
BROCHURE_CONTENT_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
}
BROCHURE_MAX_BYTES = 6 * 1024 * 1024

router = APIRouter(prefix="/api", tags=["saferoute"])

# Rough geographic centre of Kochi — only used as a last resort when geocoding
# itself is unavailable, and always flagged back to the client as geocode_ok=False.
KOCHI_CENTROID = [9.9816, 76.2999]

# Bias all geocoding / autocomplete toward the Kochi metropolitan area so that
# "Indian Coffee House Kakkanad" resolves to Kochi and not a namesake elsewhere.
# Google Geocoding "bounds" format is "south,west|north,east".
KOCHI_BOUNDS = "9.75,76.10|10.30,76.65"

CONFIRM_THRESHOLD = 2  # confirmations needed to promote pending -> verified

_MODE_MAP = {"walk": "walking", "drive": "driving", "safe": "driving", "bike": "bicycling"}


def _record_contributor(user: dict) -> dict:
    """Upserts the contributor profile and returns the compact object stored
    on each contribution."""
    upsert_contributor(user["uid"], {
        "name": user.get("name"),
        "email": user.get("email"),
        "picture": user.get("picture"),
        "_count": True,
    })
    return {"uid": user["uid"], "name": user.get("name"), "email": user.get("email")}


def _departure_timestamp(hour: int) -> int:
    """Unix timestamp for the next occurrence of `hour`:00 local time (or now, if
    the slider is on the current hour). Google requires departure_time >= now."""
    now = datetime.now()
    if hour == now.hour:
        return int(now.timestamp())
    dep = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if dep <= now:
        dep += timedelta(days=1)
    return int(dep.timestamp())


# --- Request/Response Models ---

class ScoreRouteInput(BaseModel):
    segment_ids: List[str]
    hour: int = Field(22, ge=0, le=23)
    is_raining: bool = False
    label: Optional[str] = "Selected Route"
    explain: bool = False


class CompareRoutesInput(BaseModel):
    route_a_segment_ids: List[str]
    route_a_label: str = "Route A (Direct / Fast)"
    route_b_segment_ids: List[str]
    route_b_label: str = "Route B (Alternative / Main Roads)"
    hour: int = Field(22, ge=0, le=23)
    is_raining: bool = False


class WaypointRouteInput(BaseModel):
    origin: Any = Field(..., description="[lat, lng] or address string for origin")
    destination: Any = Field(..., description="[lat, lng] or address string for destination")
    hour: int = Field(22, ge=0, le=23)
    is_raining: bool = False
    explain: bool = True
    mode: str = Field("drive", description="walk | drive | safe | bike")


# --- Helpers ---

def _strip_html(text: str) -> str:
    """Strip HTML tags from Google Directions instruction text."""
    return re.sub(r'<[^>]+>', '', text or '').strip()


def _resolve_location_param(loc: Any) -> str:
    """Converts a [lat, lng] array, comma-separated string, or address string into a Google Directions origin/destination query."""
    if isinstance(loc, (list, tuple)) and len(loc) >= 2:
        return f"{loc[0]},{loc[1]}"
    if isinstance(loc, str):
        return loc.strip()
    return str(loc)


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres between two lat/lng points."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _geocode(query: str) -> Optional[List[float]]:
    """Resolves an address string (or 'lat,lng' string) to [lat, lng] via the
    Google Geocoding API. Returns None if it can't be resolved."""
    if not query:
        return None

    # Already a coordinate pair?
    m = re.match(r'^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$', query)
    if m:
        return [float(m.group(1)), float(m.group(2))]

    gmaps_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not gmaps_key:
        return None
    try:
        import requests
        import urllib.parse
        url = (
            f"https://maps.googleapis.com/maps/api/geocode/json"
            f"?address={urllib.parse.quote(query)}"
            f"&components=country:IN&region=in"
            f"&bounds={urllib.parse.quote(KOCHI_BOUNDS)}"
            f"&key={gmaps_key}"
        )
        data = requests.get(url, timeout=6).json()
        if data.get("status") == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            return [loc["lat"], loc["lng"]]
    except Exception as e:
        print("[geocode] Error:", e)
    return None


def _reverse_geocode(lat: float, lng: float) -> dict:
    """Reverse-geocodes a lat/lng to a formatted address + best-guess road/area."""
    gmaps_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    fallback = {"formatted_address": f"Location ({lat:.5f}, {lng:.5f})", "road": "", "area": ""}
    if not gmaps_key:
        return fallback
    try:
        import requests
        url = (
            f"https://maps.googleapis.com/maps/api/geocode/json"
            f"?latlng={lat},{lng}&key={gmaps_key}"
        )
        data = requests.get(url, timeout=5).json()
        if data.get("status") == "OK" and data.get("results"):
            first = data["results"][0]
            road = ""
            area = ""
            for comp in first.get("address_components", []):
                types = comp.get("types", [])
                if "route" in types and not road:
                    road = comp["long_name"]
                if ("sublocality" in types or "locality" in types) and not area:
                    area = comp["long_name"]
            return {
                "formatted_address": first.get("formatted_address", ""),
                "road": road,
                "area": area,
            }
    except Exception as e:
        print("[reverse_geocode] Error:", e)
    return fallback


def _nearest_segment(lat: float, lng: float, segments: List[dict]) -> Optional[dict]:
    if not segments:
        return None
    return min(segments, key=lambda s: _haversine_m(lat, lng, s["lat"], s["lng"]))


# --- Route finding ---

@router.post("/routes/find-safe-corridor")
def find_safe_corridor(input_data: WaypointRouteInput):
    """
    Geocodes the origin/destination, fetches route alternatives from the Google
    Directions API, scores each against the segment safety database, and returns
    comparative safety metrics + a Gemini explanation. Accepts coordinates or any
    typed address string.
    """
    try:
        return _find_safe_corridor(input_data)
    except HTTPException:
        raise
    except Exception as e:
        print("[routes] find_safe_corridor failed:", e)
        raise HTTPException(status_code=502, detail=f"Route computation failed: {e}")


def _find_safe_corridor(input_data: WaypointRouteInput):
    gmaps_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    segments = get_all_segments()
    if not segments:
        raise HTTPException(status_code=400, detail="No segments available in database.")

    origin_param = _resolve_location_param(input_data.origin)
    dest_param = _resolve_location_param(input_data.destination)

    # Definitive start/end coordinates come from geocoding the typed text.
    geo_origin = _geocode(origin_param)
    geo_dest = _geocode(dest_param)
    geocode_ok = bool(geo_origin and geo_dest)

    actual_origin = geo_origin or list(KOCHI_CENTROID)
    actual_dest = geo_dest or list(KOCHI_CENTROID)

    mode = _MODE_MAP.get(input_data.mode, "driving")
    departure_ts = _departure_timestamp(input_data.hour)

    routes_found = []

    if gmaps_key:
        try:
            import requests
            import urllib.parse
            url = (
                f"https://maps.googleapis.com/maps/api/directions/json"
                f"?origin={urllib.parse.quote(origin_param)}&destination={urllib.parse.quote(dest_param)}"
                f"&alternatives=true&mode={mode}&region=in"
                f"&key={gmaps_key}"
            )
            if mode == "driving":
                # Traffic-aware ETA for the selected departure time.
                url += f"&departure_time={departure_ts}&traffic_model=best_guess"
            resp = requests.get(url, timeout=8)
            g_data = resp.json()

            if g_data.get("status") == "OK" and g_data.get("routes"):
                # The routed leg's endpoints are the most accurate snap-to-road
                # coordinates — prefer them over the raw geocode.
                first_leg = g_data["routes"][0]["legs"][0]
                actual_origin = [first_leg["start_location"]["lat"], first_leg["start_location"]["lng"]]
                actual_dest = [first_leg["end_location"]["lat"], first_leg["end_location"]["lng"]]

                for idx, g_route in enumerate(g_data["routes"][:3]):
                    summary = g_route.get("summary", f"Route {idx+1}")
                    leg = g_route["legs"][0]
                    duration_text = leg.get("duration", {}).get("text", "20 mins")
                    traffic_text = leg.get("duration_in_traffic", {}).get("text")
                    duration_seconds = (
                        leg.get("duration_in_traffic", {}).get("value")
                        or leg.get("duration", {}).get("value")
                        or 0
                    )
                    distance_text = leg.get("distance", {}).get("text", "8 km")
                    overview_polyline = g_route.get("overview_polyline", {}).get("points", "")

                    matched_seg_ids = []
                    steps_data = []
                    for step in leg.get("steps", []):
                        s_lat = step["start_location"]["lat"]
                        s_lng = step["start_location"]["lng"]
                        closest = min(
                            segments,
                            key=lambda seg: math.hypot(seg["lat"] - s_lat, seg["lng"] - s_lng),
                        )
                        if closest["segment_id"] not in matched_seg_ids:
                            matched_seg_ids.append(closest["segment_id"])
                        steps_data.append({
                            "instruction": _strip_html(step.get("html_instructions", "")),
                            "distance": step.get("distance", {}).get("text", ""),
                            "duration": step.get("duration", {}).get("text", ""),
                            "maneuver": step.get("maneuver", "straight"),
                            "lat": s_lat,
                            "lng": s_lng,
                        })

                    if not matched_seg_ids:
                        matched_seg_ids = [segments[0]["segment_id"]]

                    score_res = score_route(matched_seg_ids, input_data.hour, input_data.is_raining)
                    routes_found.append({
                        **score_res,
                        "label": f"via {summary}" if summary else f"Route {chr(65+idx)}",
                        "summary": summary,
                        "duration_text": traffic_text or duration_text,
                        "duration_typical_text": duration_text,
                        "duration_in_traffic_text": traffic_text,
                        "duration_seconds": duration_seconds,
                        "distance_text": distance_text,
                        "polyline": overview_polyline,
                        "steps": steps_data,
                    })
            else:
                print("[routes] Directions API status:", g_data.get("status"), g_data.get("error_message", ""))
        except Exception as e:
            print("[routes] Google Directions API request failed:", e)

    # Fallback: geometric corridor computation over the local segment graph.
    if not routes_found:
        o_lat, o_lng = actual_origin[0], actual_origin[1]
        d_lat, d_lng = actual_dest[0], actual_dest[1]

        def dist_pt(seg, lat, lng):
            return math.hypot(seg["lat"] - lat, seg["lng"] - lng)

        start_seg = sorted(segments, key=lambda s: dist_pt(s, o_lat, o_lng))[0]
        end_seg = sorted(segments, key=lambda s: dist_pt(s, d_lat, d_lng))[0]

        min_lat, max_lat = min(o_lat, d_lat) - 0.02, max(o_lat, d_lat) + 0.02
        min_lng, max_lng = min(o_lng, d_lng) - 0.02, max(o_lng, d_lng) + 0.02
        in_box = [s for s in segments if min_lat <= s["lat"] <= max_lat and min_lng <= s["lng"] <= max_lng]
        if len(in_box) < 3:
            in_box = segments

        def perp_dist(seg):
            x0, y0 = seg["lng"], seg["lat"]
            x1, y1 = o_lng, o_lat
            x2, y2 = d_lng, d_lat
            denom = math.hypot(y2 - y1, x2 - x1) or 0.0001
            return abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) / denom

        route_a_segs = sorted(in_box, key=perp_dist)[:6]
        route_a_ids = list({start_seg["segment_id"], *[s["segment_id"] for s in route_a_segs], end_seg["segment_id"]})

        def safety_priority(seg):
            return -(
                seg.get("lighting_score", 5) * 3.0
                + (10.0 - min(seg.get("police_station_distance_m", 1000) / 300, 10)) * 2.0
                + seg.get("open_shops_density", 5) * 1.5
                - (seg.get("past_incident_count_90d", 0) * 2.0)
            )

        route_b_segs = sorted(in_box, key=safety_priority)[:6]
        route_b_ids = list({start_seg["segment_id"], *[s["segment_id"] for s in route_b_segs], end_seg["segment_id"]})

        score_a = score_route(route_a_ids, input_data.hour, input_data.is_raining)
        score_b = score_route(route_b_ids, input_data.hour, input_data.is_raining)

        routes_found = [
            {**score_b, "label": "Safer corridor (well-lit main roads)", "duration_text": "—", "distance_text": "—", "polyline": "", "steps": []},
            {**score_a, "label": "Most direct corridor", "duration_text": "—", "distance_text": "—", "polyline": "", "steps": []},
        ]

    # Fold in verified community reports (potholes, broken/missing lights, dark
    # areas, unsafe spots) that sit on each route's polyline.
    verified_features = [
        f for f in get_all_features()
        if f.get("status") == "verified" and f.get("type") != "police_station"
    ]
    all_ratings = get_all_ratings()
    all_live = get_all_live_reports()
    for r in routes_found:
        cond = route_condition_penalty(r.get("polyline", ""), verified_features)
        r["safety_score"] = round(max(0.0, r["safety_score"] - cond["penalty"]), 1)
        r["pothole_count"] = cond["pothole_count"]
        r["condition_penalty"] = cond["penalty"]
        r["condition_notes"] = cond["notes"]

        # Subjective rating spots that lie on this route (display only — they
        # don't move the score). Worst-felt spot first, with every comment.
        spots = spots_along_route(r.get("polyline", ""), all_ratings, input_data.hour)
        r["rating_spots"] = spots
        rated = [s for s in spots if s.get("mean") is not None]
        r["rating_spot_count"] = len(spots)
        r["rating_low_count"] = sum(1 for s in rated if s["mean"] < 2.5)
        r["rating_mean"] = (
            round(sum(s["mean"] for s in rated) / len(rated), 1) if rated else None
        )

        # Live "happening now" alerts on this route (display only, newest first).
        alerts = live.alerts_along_route(r.get("polyline", ""), all_live)
        r["live_alerts"] = alerts
        r["live_alert_count"] = len(alerts)

    routes_found.sort(key=lambda r: r["safety_score"], reverse=True)
    route_b = routes_found[0]
    route_a = routes_found[1] if len(routes_found) > 1 else routes_found[0]

    # "Smoother route": among routes within +5 min of the fastest, the one with
    # the fewest potholes — only surfaced if it's clearly better and isn't
    # already the recommendation. We only ever re-rank Google's own (main-road)
    # alternatives; we never route onto back-streets to dodge potholes.
    timed = [r for r in routes_found if r.get("duration_seconds")]
    if len(timed) > 1:
        fastest_s = min(r["duration_seconds"] for r in timed)
        band = [r for r in timed if r["duration_seconds"] <= fastest_s + 300]
        smoother = min(band, key=lambda r: (r.get("pothole_count", 0), r["duration_seconds"]))
        rec_potholes = route_b.get("pothole_count", 0)
        if smoother is not route_b and rec_potholes - smoother.get("pothole_count", 0) >= 2:
            extra_min = round((smoother["duration_seconds"] - fastest_s) / 60)
            fewer = rec_potholes - smoother.get("pothole_count", 0)
            smoother["smoother_alt"] = True
            smoother["smoother_note"] = (
                f"{fewer} fewer potholes"
                + (f", ~{extra_min} min longer" if extra_min >= 1 else ", same time")
            )

    explanation = None
    explanation_error = None
    if input_data.explain:
        try:
            explanation = explain_route_comparison(
                route_a, route_a["label"], route_b, route_b["label"]
            )
        except Exception as e:
            explanation_error = str(e)

    return {
        "origin": actual_origin,
        "destination": actual_dest,
        "geocode_ok": geocode_ok,
        "mode": mode,
        "departure_time": departure_ts,
        "traffic_aware": bool(routes_found and routes_found[0].get("duration_in_traffic_text")),
        "routes": routes_found,
        "route_a": route_a,
        "route_b": route_b,
        "explanation": explanation,
        "explanation_error": explanation_error,
    }


# --- Status ---

@router.get("/status")
def get_status():
    segments = get_all_segments()
    return {
        "database": "Firestore" if is_using_firestore() else "Local emulation",
        "segment_count": len(segments),
        "feature_count": len(get_all_features()),
        "survey_count": len(get_all_surveys()),
        "community_event_count": len([e for e in get_all_community_events() if e.get("category") != "Report"]),
        "has_gemini": is_gemini_configured(),
    }


# --- Events around Kochi ---

EVENT_REPORT_HIDE_THRESHOLD = 3
EVENT_CONFIRM_THRESHOLD = 2


def _upcoming(events, today):
    return sorted(
        (e for e in events if str(e.get("end_date") or e.get("start_date", "9999")) >= today),
        key=lambda e: e.get("start_date", ""),
    )


def _attach_brochures(events: list) -> list:
    for e in events:
        b = get_brochure(e["id"])
        if b:
            e["brochure_url"] = f"/api/events/{e['id']}/brochure"
            e["brochure_uploaded_by"] = b.get("uploaded_by")
            e["brochure_content_type"] = b.get("content_type")
    return events


@router.get("/events")
def list_events():
    """Upcoming events in/around Kochi, soonest first.

    Merges four sources, each item carrying `source` + `status`:
    - `curated` — the hand-maintained list (`kochi_events.py`)
    - `community` — submitted via `POST /api/events`
    - `live` — optional scrapers, only if `SAFEROUTE_EVENT_SOURCES` is set
    - `ai_discovered` — Gemini + Google Search results from the last
      `POST /api/events/discover` call (empty until that's been triggered
      at least once; never runs Gemini on its own).
    """
    today = datetime.now().date().isoformat()

    curated = [{**e, "source": "curated", "status": "verified"} for e in KOCHI_EVENTS]
    community = [e for e in get_all_community_events() if e.get("status") != "hidden"]
    live = fetch_live_events()
    ai_discovered = get_cached_events()

    merged = _upcoming(curated + community + live + ai_discovered, today)
    _attach_brochures(merged)
    return {
        "events": merged,
        "as_of": today,
        "counts": {
            "curated": len(curated),
            "community": len(community),
            "live": len(live),
            "ai_discovered": len(ai_discovered),
        },
    }


@router.post("/events/discover")
def discover_events():
    """Explicitly asks Gemini (with Google Search grounding) to look for
    events in Kochi over the next ~45 days, including inferred/likely ones
    (e.g. a temple procession for a festival whose date falls in range).
    On-demand only — never called automatically — and cached for a few
    hours. Geocodes each result's venue on first discovery."""
    result = discover_kochi_events(force=True)
    for ev in result["events"]:
        if ev.get("lat") is None:
            query_parts = [p for p in [ev.get("venue"), ev.get("area"), "Kochi, Kerala"] if p]
            geo = _geocode(", ".join(query_parts))
            if geo:
                ev["lat"], ev["lng"] = geo
            else:
                ev["lat"], ev["lng"] = KOCHI_CENTROID
                ev["note"] = (ev.get("note") or "") + " (approximate location)"
    return result


@router.post("/events")
def add_event(payload: NewEventInput, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    if not data.get("end_date"):
        data["end_date"] = data["start_date"]
    contributor = _record_contributor(user)
    data["contributor"] = contributor
    data["submitted_by"] = contributor["name"]
    return create_community_event(data)


@router.post("/events/{event_id}/confirm")
def confirm_event(event_id: str, user: dict = Depends(get_current_user)):
    evt = get_community_event(event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Community event not found")
    confirmed_by = list(evt.get("confirmed_by", []))
    if user["uid"] not in confirmed_by:
        confirmed_by.append(user["uid"])
    updates = {"confirmed_by": confirmed_by, "confirmations": len(confirmed_by)}
    if evt.get("status") == "pending" and len(confirmed_by) >= EVENT_CONFIRM_THRESHOLD:
        updates["status"] = "verified"
    return update_community_event(event_id, updates)


@router.post("/events/{event_id}/report")
def report_event(event_id: str, payload: EventReportInput, user: dict = Depends(get_current_user)):
    """Flag an event as wrong / cancelled / spam. Community events auto-hide
    after a few reports; curated events keep the report for a maintainer."""
    entry = {
        **payload.model_dump(),
        "event_id": event_id,
        "reported_by": user.get("name"),
        "reporter_uid": user["uid"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    evt = get_community_event(event_id)
    if evt:
        reports = list(evt.get("reports", [])) + [entry]
        updates = {"reports": reports, "report_count": len(reports)}
        if len(reports) >= EVENT_REPORT_HIDE_THRESHOLD:
            updates["status"] = "hidden"
        update_community_event(event_id, updates)
        return {"ok": True, "report_count": len(reports), "hidden": updates.get("status") == "hidden"}

    # Curated event — store the report against a lightweight community shadow doc.
    if any(e["id"] == event_id for e in KOCHI_EVENTS):
        shadow_id = f"report_{event_id}"
        shadow = get_community_event(shadow_id)
        if shadow:
            reports = list(shadow.get("reports", [])) + [entry]
            update_community_event(shadow_id, {"reports": reports, "report_count": len(reports)})
        else:
            create_community_event({
                "id": shadow_id,
                "title": f"[report shadow] {event_id}",
                "category": "Report",
                "lat": KOCHI_CENTROID[0],
                "lng": KOCHI_CENTROID[1],
                "start_date": entry["created_at"][:10],
                "status": "hidden",
                "reports": [entry],
                "report_count": 1,
            })
        return {"ok": True, "note": "Report recorded for a curated event."}

    raise HTTPException(status_code=404, detail="Event not found")


@router.get("/events/reports")
def list_event_reports():
    """All event reports, for a maintainer to triage."""
    out = []
    for e in get_all_community_events():
        for r in e.get("reports", []):
            out.append({**r, "event_title": e.get("title")})
    return sorted(out, key=lambda r: r.get("created_at", ""), reverse=True)


@router.post("/events/{event_id}/brochure")
async def upload_event_brochure(
    event_id: str,
    file: UploadFile = File(...),
    uploaded_by: str = Form("Anonymous"),
    user: dict = Depends(get_current_user),
):
    """Attaches a poster/flyer/brochure image (or PDF) to any event — curated,
    community, or AI-discovered. One brochure per event; re-uploading replaces it."""
    if file.content_type not in BROCHURE_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file.content_type}'. Use JPG, PNG, WEBP, GIF or PDF.",
        )
    body = await file.read()
    if len(body) > BROCHURE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 6 MB).")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    ext = BROCHURE_CONTENT_TYPES[file.content_type]
    # Randomised filename so an old cached copy can't be requested after replacement.
    stored_name = f"{event_id}__{uuid.uuid4().hex[:8]}{ext}"

    # Remove any previous file for this event before writing the new one.
    old = get_brochure(event_id)
    if old and old.get("stored_name"):
        old_path = UPLOAD_DIR / old["stored_name"]
        if old_path.exists():
            old_path.unlink()

    (UPLOAD_DIR / stored_name).write_bytes(body)
    record = set_brochure(event_id, {
        "stored_name": stored_name,
        "content_type": file.content_type,
        "uploaded_by": user.get("name") or uploaded_by,
        "uploader_uid": user["uid"],
    })
    return {"ok": True, "brochure_url": f"/api/events/{event_id}/brochure", **record}


@router.get("/events/{event_id}/brochure")
def get_event_brochure(event_id: str):
    record = get_brochure(event_id)
    if not record:
        raise HTTPException(status_code=404, detail="No brochure uploaded for this event.")
    path = UPLOAD_DIR / record["stored_name"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Brochure file missing.")
    return FileResponse(path, media_type=record.get("content_type", "application/octet-stream"))


# --- Trip surveys ---

@router.get("/surveys")
def list_surveys():
    return get_all_surveys()


@router.post("/surveys")
def add_survey(payload: NewSurveyInput, user: dict = Depends(get_current_user)):
    contributor = _record_contributor(user)
    return create_survey({
        **payload.model_dump(),
        "contributor": contributor,
        "submitted_by": contributor["name"],
    })


# --- Segments (detailed road assessments) ---

@router.get("/segments")
def list_segments(status: Optional[str] = Query(None)):
    return get_all_segments(status=status)


@router.post("/segments")
def add_segment(payload: NewSegmentInput, user: dict = Depends(get_current_user)):
    contributor = _record_contributor(user)
    return create_segment({
        **payload.model_dump(),
        "source": "user_contributed",
        "contributor": contributor,
        "contributed_by": contributor["name"],
    })


@router.post("/segments/{segment_id}/confirm")
def confirm_segment(segment_id: str, user: dict = Depends(get_current_user)):
    seg = get_segment(segment_id)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    confirmed_by = list(seg.get("confirmed_by", []))
    if user["uid"] not in confirmed_by:
        confirmed_by.append(user["uid"])
    confirmations = len(confirmed_by)
    updates = {"confirmed_by": confirmed_by, "confirmations": confirmations}
    if seg.get("status") == "pending" and confirmations >= CONFIRM_THRESHOLD:
        updates["status"] = "verified"
    return update_segment(segment_id, updates)


# --- Map features (point-based markers, e.g. broken streetlights) ---

@router.get("/features")
def list_features(type: Optional[str] = Query(None)):
    return get_all_features(feature_type=type)


def _cluster_pothole_zones(features: List[dict]) -> dict:
    """Grid-clusters live pothole (and unsafe-spot) reports into ~250 m cells.
    A cell with >= 2 reports is a prone 'zone'. Shared by the map heatmap and
    the municipality report."""
    cell = 0.00225  # ~250 m in degrees near Kochi
    counted: dict = {}
    points = []
    for f in features:
        if f.get("type") not in ("pothole", "unsafe_spot"):
            continue
        if f.get("status") == "resolved":
            continue
        # A pothole that has broken again after a fix weighs more heavily.
        weight = (1.0 if f["type"] == "pothole" else 0.6) + 0.3 * f.get("recurrence_count", 0)
        points.append({"lat": f["lat"], "lng": f["lng"], "weight": round(weight, 2)})
        key = (round(f["lat"] / cell), round(f["lng"] / cell))
        c = counted.setdefault(key, {"lat": 0.0, "lng": 0.0, "count": 0})
        c["lat"] += f["lat"]
        c["lng"] += f["lng"]
        c["count"] += 1

    zones = []
    for c in counted.values():
        if c["count"] >= 2:
            zones.append({
                "lat": round(c["lat"] / c["count"], 6),
                "lng": round(c["lng"] / c["count"], 6),
                "count": c["count"],
                "radius_m": 220,
                "severity": "high" if c["count"] >= 4 else "moderate",
            })
    return {"points": points, "zones": sorted(zones, key=lambda z: -z["count"])}


@router.get("/features/pothole-zones")
def pothole_zones():
    return _cluster_pothole_zones(get_all_features())


@router.get("/contributors/me")
def my_contributions(user: dict = Depends(get_current_user)):
    uid = user["uid"]
    profile = get_contributor(uid) or {"uid": uid, "name": user.get("name")}
    mine = {
        "features": [f for f in get_all_features() if (f.get("contributor") or {}).get("uid") == uid],
        "segments": [s for s in get_all_segments() if (s.get("contributor") or {}).get("uid") == uid],
        "events": [e for e in get_all_community_events() if (e.get("contributor") or {}).get("uid") == uid],
        "surveys": [s for s in get_all_surveys() if (s.get("contributor") or {}).get("uid") == uid],
    }
    return {"profile": profile, "contributions": mine, "mode": user.get("mode")}


# Problem features that share a real-world spot: re-adding one near an existing
# report should extend that report's history, not spawn a duplicate pin.
_MERGEABLE_FEATURE_TYPES = {
    "streetlight_broken", "streetlight_missing", "streetlight_ok",
    "pothole", "dark_area", "unsafe_spot",
}
_FEATURE_MERGE_RADIUS_M = 30

# A "working" report and a "broken" report about the same streetlight are the
# same physical object — treat the streetlight_* family as one for merging.
_STREETLIGHT_FAMILY = {"streetlight_ok", "streetlight_broken", "streetlight_missing"}


def _same_object(type_a: str, type_b: str) -> bool:
    if type_a == type_b:
        return True
    return type_a in _STREETLIGHT_FAMILY and type_b in _STREETLIGHT_FAMILY


def _nearby_feature(lat: float, lng: float, ftype: str):
    """Closest existing feature for the same real-world object within
    _FEATURE_MERGE_RADIUS_M — resolved ones included (that's the recurrence case)."""
    best, best_d = None, _FEATURE_MERGE_RADIUS_M
    for f in get_all_features():
        if not _same_object(f.get("type", ""), ftype):
            continue
        d = _haversine_m(lat, lng, f["lat"], f["lng"])
        if d <= best_d:
            best, best_d = f, d
    return best


def _feature_display_name(contributor: dict, visibility: str) -> str:
    return "Anonymous" if visibility == "anonymous" else (contributor.get("name") or "Anonymous")


def _append_feature_event(feat: dict, kind: str, contributor: dict, note: str = "",
                          severity: Optional[int] = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    event = {"at": now, "kind": kind, "by": {"uid": contributor.get("uid"), "name": contributor.get("name")}}
    if note:
        event["note"] = note
    if severity:
        event["severity"] = severity
    events = list(feat.get("events", [])) + [event]
    updates = {"events": events, "last_activity_at": now}
    if severity:
        updates["severity"] = severity

    if kind == "reappeared":
        updates["status"] = "verified"
        updates["recurrence_count"] = feat.get("recurrence_count", 0) + 1
        updates["resolved_by"] = None
        updates["resolved_at"] = None
    elif kind == "repaired":
        updates["status"] = "resolved"
        updates["resolved_by"] = contributor.get("name")
        updates["resolver_uid"] = contributor.get("uid")
        updates["resolved_at"] = now
    elif kind == "confirmed":
        cb = list(feat.get("confirmed_by", []))
        uid = contributor.get("uid")
        if uid and uid not in cb and uid != "anon":
            cb.append(uid)
        updates["confirmed_by"] = cb
        updates["confirmations"] = len(cb)
        if feat.get("status") == "pending" and len(cb) >= CONFIRM_THRESHOLD:
            updates["status"] = "verified"

    return update_feature(feat["feature_id"], updates)


@router.post("/features")
def add_feature(payload: NewFeatureInput, user: dict = Depends(get_current_user)):
    contributor = _record_contributor(user)
    data = payload.model_dump()

    if data["type"] in _MERGEABLE_FEATURE_TYPES:
        twin = _nearby_feature(data["lat"], data["lng"], data["type"])
        if twin:
            # Resolved twin -> the problem is back. Open twin -> another voice.
            kind = "reappeared" if twin.get("status") == "resolved" else "confirmed"
            updated = _append_feature_event(
                twin, kind, contributor, note=data.get("note", ""), severity=data.get("severity"),
            )
            return {**updated, "_merged_into": twin["feature_id"], "_merge_kind": kind}

    return create_feature({
        **data,
        "contributor": contributor,
        "contributed_by": _feature_display_name(contributor, data.get("visibility", "public")),
    })


@router.post("/features/{feature_id}/confirm")
def confirm_feature(feature_id: str, payload: ConfirmInput = ConfirmInput(),
                    user: dict = Depends(get_current_user)):
    feat = get_feature(feature_id)
    if not feat:
        raise HTTPException(status_code=404, detail="Feature not found")
    contributor = {"uid": user["uid"], "name": user.get("name")}
    return _append_feature_event(feat, "confirmed", contributor, note=payload.note)


@router.post("/features/{feature_id}/resolve")
def resolve_feature(feature_id: str, payload: ConfirmInput = ConfirmInput(),
                    user: dict = Depends(get_current_user)):
    feat = get_feature(feature_id)
    if not feat:
        raise HTTPException(status_code=404, detail="Feature not found")
    contributor = {"uid": user["uid"], "name": user.get("name")}
    return _append_feature_event(feat, "repaired", contributor, note=payload.note)


@router.post("/features/{feature_id}/reopen")
def reopen_feature(feature_id: str, payload: ConfirmInput = ConfirmInput(),
                   user: dict = Depends(get_current_user)):
    """'It's back' — a previously-fixed pothole / light has failed again.
    Bumps recurrence_count and returns the feature to verified."""
    feat = get_feature(feature_id)
    if not feat:
        raise HTTPException(status_code=404, detail="Feature not found")
    contributor = {"uid": user["uid"], "name": user.get("name")}
    return _append_feature_event(feat, "reappeared", contributor, note=payload.note)


# --- Community safety ratings (subjective "how safe does this feel") ---

_RATING_NEARBY_M = 120  # only for the flat GET /ratings list
_SPOT_HOUR = 22         # ratings are aggregated for a night trip (the cautious case)


@router.post("/ratings")
def add_rating(payload: NewRatingInput, user: dict = Depends(get_current_user)):
    contributor = _record_contributor(user)
    data = payload.model_dump()
    now = datetime.now(timezone.utc).isoformat()

    # One rating per person per spot: if this person already rated within a
    # spot's join radius, edit that rating in place (keeps its founding slot in
    # the cluster) rather than stacking a second one.
    replaced = None
    if contributor["uid"] != "anon":
        for r in get_all_ratings():
            if (r.get("contributor") or {}).get("uid") != contributor["uid"]:
                continue
            if _haversine_m(data["lat"], data["lng"], r["lat"], r["lng"]) <= SPOT_JOIN_RADIUS_M:
                replaced = update_rating(r["rating_id"], {
                    "score": data["score"],
                    "time_of_day": data["time_of_day"],
                    "tags": data["tags"],
                    "comment": data["comment"],
                    "visibility": data["visibility"],
                    "contributed_by": _feature_display_name(contributor, data["visibility"]),
                    "updated_at": now,
                })
                break

    rating = replaced or create_rating({
        **data,
        "contributor": contributor,
        "contributed_by": _feature_display_name(contributor, data.get("visibility", "public")),
    })

    spot = spot_containing_rating(rating["rating_id"], get_all_ratings(), _SPOT_HOUR)
    return {
        **rating,
        "spot": {
            **(spot or {}),
            "created": bool(spot and spot["sample"] == 1 and replaced is None),
            "updated": replaced is not None,
        },
    }


@router.get("/safety-spots")
def safety_spots():
    """All rating clusters, for the map layer. Score is for a night trip."""
    return all_spots(get_all_ratings(), _SPOT_HOUR)


def _nearby_ratings(lat: float, lng: float, radius_m: int = _RATING_NEARBY_M) -> list:
    return [
        r for r in get_all_ratings()
        if _haversine_m(lat, lng, r["lat"], r["lng"]) <= radius_m
    ]


@router.get("/ratings")
def list_ratings(lat: float = Query(...), lng: float = Query(...),
                 radius_m: int = Query(_RATING_NEARBY_M, ge=10, le=1000)):
    """Recent subjective ratings near a point, newest first, name hidden when the
    rater asked for it."""
    near = sorted(_nearby_ratings(lat, lng, radius_m),
                  key=lambda r: r.get("created_at", ""), reverse=True)
    return [{
        "rating_id": r["rating_id"],
        "score": r["score"],
        "tags": r.get("tags", []),
        "comment": r.get("comment", ""),
        "time_of_day": r.get("time_of_day"),
        "by": "Anonymous" if r.get("visibility") == "anonymous"
              else (r.get("contributor") or {}).get("name") or r.get("contributed_by") or "Anonymous",
        "at": r.get("created_at"),
    } for r in near]


# --- Live reports ("happening now") ---

@router.get("/live/categories")
def live_categories():
    return [
        {"key": k, "label": lbl, "group": grp, "ttl_hours": ttl}
        for k, (lbl, grp, ttl) in live.LIVE_CATEGORIES.items()
    ]


@router.get("/live")
def list_live(bbox: Optional[str] = Query(None, description="min_lng,min_lat,max_lng,max_lat"),
              since: Optional[str] = Query(None, description="ISO cursor — only reports updated after this")):
    """Active (non-expired, non-cleared) reports. Poll this; `cursor` in the
    response is the value to pass as `since` next time. SSE can layer on later
    without changing the shape."""
    reports = get_all_live_reports()
    if bbox:
        try:
            parts = [float(x) for x in bbox.split(",")]
            if len(parts) == 4:
                reports = live.in_bbox(reports, tuple(parts))
        except ValueError:
            pass
    out = live.active_decorated(reports)
    if since:
        out = [r for r in out if (r.get("updated_at") or "") > since]
    return {
        "reports": out,
        "cursor": datetime.now(timezone.utc).isoformat(),
        "count": len(out),
    }


@router.post("/live")
def add_live_report(payload: NewLiveReportInput, user: dict = Depends(get_current_user)):
    contributor = _record_contributor(user)
    data = payload.model_dump()
    report = create_live_report({
        **data,
        "expires_at": live.initial_expiry(data["category"]),
        "contributor": contributor,
        "contributed_by": _feature_display_name(contributor, data.get("visibility", "public")),
    })
    return live.decorate(report)


@router.post("/live/{report_id}/still-here")
def confirm_live_report(report_id: str, user: dict = Depends(get_current_user)):
    """'Still happening' — bumps the report's expiry back out (capped)."""
    r = get_live_report(report_id)
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    voters = list(r.get("still_there_by", []))
    uid = user["uid"]
    if uid and uid != "anon" and uid not in voters:
        voters.append(uid)
    updated = update_live_report(report_id, {
        "still_there": len(voters),
        "still_there_by": voters,
        "expires_at": live.bumped_expiry(r),
        "cleared": False,
    })
    return live.decorate(updated)


@router.post("/live/{report_id}/clear")
def clear_live_report(report_id: str, user: dict = Depends(get_current_user)):
    """'Not anymore' — hides the report immediately."""
    r = get_live_report(report_id)
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    updated = update_live_report(report_id, {
        "cleared": True,
        "cleared_by": user.get("name"),
        "cleared_uid": user["uid"],
    })
    return live.decorate(updated)


@router.post("/live/{report_id}/comment")
def comment_live_report(report_id: str, payload: LiveCommentInput,
                        user: dict = Depends(get_current_user)):
    r = get_live_report(report_id)
    if not r:
        raise HTTPException(status_code=404, detail="Report not found")
    contributor = _record_contributor(user)
    comment = {
        "text": payload.text.strip(),
        "visibility": payload.visibility,
        "contributor": contributor,
        "at": datetime.now(timezone.utc).isoformat(),
    }
    comments = list(r.get("comments", [])) + [comment]
    updated = update_live_report(report_id, {"comments": comments})
    return live.decorate(updated)


# --- Place context (hybrid: reverse geocode + local safety data) ---

@router.get("/places/context")
def place_context(lat: float = Query(...), lng: float = Query(...)):
    geo = _reverse_geocode(lat, lng)
    segments = get_all_segments()
    nearest = _nearest_segment(lat, lng, segments)

    _CONTEXT_HOUR = _SPOT_HOUR  # context is scored for a night trip (the cautious case)
    # Community feel comes from the rating *spot* the point falls inside (a
    # stable cluster), not a raw radius around the cursor.
    spot_res = resolve_spot(lat, lng, get_all_ratings(), _CONTEXT_HOUR)
    spot_members = spot_res["members"]

    nearest_out = None
    has_local_data = False
    if nearest:
        dist = _haversine_m(lat, lng, nearest["lat"], nearest["lng"])
        has_local_data = dist < 400
        scored = score_segment(nearest, hour=_CONTEXT_HOUR, is_raining=False)
        adj = community_adjustment(scored["score"], spot_members, hour=_CONTEXT_HOUR)
        nearest_out = {
            "segment_id": nearest["segment_id"],
            "road_name": nearest["road_name"],
            "area": nearest["area"],
            "distance_m": round(dist),
            "lighting_score": nearest["lighting_score"],
            "police_station_distance_m": nearest["police_station_distance_m"],
            "hospital_distance_m": nearest["hospital_distance_m"],
            "past_incident_count_90d": nearest["past_incident_count_90d"],
            "flood_risk": nearest["flood_risk"],
            "status": nearest.get("status", "verified"),
            # Headline = community-adjusted; `computed_score` keeps the raw
            # algorithm number so the UI can show both when they diverge.
            "safety_score": adj["adjusted_score"],
            "computed_score": adj["computed_score"],
            "community_score": adj["adjusted_score"],
            "community_mean": adj["community_mean"],
            "community_sample": adj["sample"],
            "community_delta": adj["applied_delta"],
            "community_tags": adj["tag_counts"],
        }

    nearby_features = []
    tally = {}
    police_candidates = []
    _SPECIALISED = ("women", "vanitha", "tourism", "coastal", "cyber", "traffic", "railway")
    for f in get_all_features():
        if f.get("status") == "resolved":
            continue
        d = _haversine_m(lat, lng, f["lat"], f["lng"])
        if f.get("type") == "police_station" and f.get("status") == "verified":
            specialised = (
                f.get("jurisdiction_scope") in ("city_wide", "railway")
                or any(w in (f.get("note") or "").lower() for w in _SPECIALISED)
            )
            police_candidates.append({**f, "distance_m": round(d), "_specialised": specialised})
        if d <= 150:
            nearby_features.append({**f, "distance_m": round(d)})
            tally[f["type"]] = tally.get(f["type"], 0) + 1

    general = [p for p in police_candidates if not p["_specialised"]]
    pool = general or police_candidates

    # "Nearest station" — closest pin, for getting help fast.
    nearest_police = min(pool, key=lambda p: p["distance_m"]) if pool else None

    # "Your jurisdiction" — the station whose mapped area actually contains this
    # point, which is NOT always the closest one. The mapped areas are axis-aligned
    # rectangles, so a point can sit inside several at once (they overlap along
    # shared borders). Pick the one the point sits *deepest* inside, measured as a
    # fraction of that box's half-extent: a point hugging Infopark's eastern edge
    # but well within Kunnathunad's box resolves to Kunnathunad.
    def _in_bbox(b):
        return (
            b
            and b["lat_min"] <= lat <= b["lat_max"]
            and b["lng_min"] <= lng <= b["lng_max"]
        )

    def _bbox_depth(p):
        b = p["bbox"]
        lat_half = (b["lat_max"] - b["lat_min"]) / 2 or 1e-9
        lng_half = (b["lng_max"] - b["lng_min"]) / 2 or 1e-9
        lat_c = (b["lat_max"] + b["lat_min"]) / 2
        lng_c = (b["lng_max"] + b["lng_min"]) / 2
        return min(1 - abs(lat - lat_c) / lat_half, 1 - abs(lng - lng_c) / lng_half)

    containing = [p for p in general if _in_bbox(p.get("bbox"))]
    jurisdiction_station = max(containing, key=_bbox_depth) if containing else nearest_police

    for p in (nearest_police, jurisdiction_station):
        if p:
            p.pop("_specialised", None)

    same = (
        nearest_police
        and jurisdiction_station
        and nearest_police.get("feature_id") == jurisdiction_station.get("feature_id")
    )

    return {
        "address": geo.get("formatted_address", ""),
        "road": geo.get("road", ""),
        "area": geo.get("area", ""),
        "has_local_data": has_local_data,
        "nearest_segment": nearest_out,
        "nearest_police_station": nearest_police,
        "jurisdiction_station": jurisdiction_station,
        "nearest_is_jurisdiction": bool(same),
        "nearby_features": sorted(nearby_features, key=lambda x: x["distance_m"]),
        "feature_tally": tally,
        "community": spot_res["summary"] or {
            "in_spot": False, "sample": 0, "mean": None, "tags": {}, "comments": [],
            "join_radius_m": SPOT_JOIN_RADIUS_M,
        },
    }


@router.get("/geocode/reverse")
def reverse_geocode(lat: float = Query(...), lng: float = Query(...)):
    """Kept for backwards compatibility with older clients."""
    geo = _reverse_geocode(lat, lng)
    return {"formatted_address": geo.get("formatted_address", ""), "road": geo.get("road", "")}


# --- Municipality report ---
#
# Three tabs, each answering an operational question for the city:
#   lighting  -> which poles / stretches need a repair crew
#   potholes  -> which spots need resurfacing (chronic ones first)
#   safety    -> where to step up patrolling
#
# A row is a segment or a feature normalised to the same shape so the report
# table and the CSV stay uniform.

_SEVERITY_LABEL = {1: "minor", 2: "moderate", 3: "severe"}


def _reported_by(f: dict) -> str:
    if f.get("visibility") == "anonymous":
        return "Anonymous"
    return f.get("contributed_by") or (f.get("contributor") or {}).get("name") or "Anonymous"


def _feature_row(f: dict, category: str, base_detail: str = "") -> dict:
    bits = []
    sev = f.get("severity")
    if sev:
        bits.append(_SEVERITY_LABEL.get(sev, str(sev)))
    rec = f.get("recurrence_count", 0)
    if rec:
        bits.append(f"recurred {rec}× after a fix")
    note = (f.get("note") or "").strip()
    if note:
        bits.append(note)
    detail = base_detail or " · ".join(bits) or "—"
    return {
        "id": f["feature_id"],
        "label": category,
        "area": f.get("area", "") or "",
        "lat": f["lat"],
        "lng": f["lng"],
        "category": category,
        "detail": detail,
        "status": f.get("status", "pending"),
        "severity": sev,
        "recurrence_count": rec,
        "reported_by": _reported_by(f),
    }


def _segment_row(s: dict, category: str, detail: str) -> dict:
    return {
        "id": s["segment_id"],
        "label": s["road_name"],
        "area": s.get("area", "") or "",
        "lat": s["lat"],
        "lng": s["lng"],
        "category": category,
        "detail": detail,
        "status": s.get("status", "verified"),
        "severity": None,
        "recurrence_count": 0,
        "reported_by": s.get("contributed_by") or s.get("source", ""),
    }


def _group(key: str, label: str, rows: list) -> Optional[dict]:
    return {"key": key, "label": label, "rows": rows} if rows else None


def _build_report() -> dict:
    segments = get_all_segments()
    features = [f for f in get_all_features() if f.get("status") != "resolved"]

    def feats(ftype):
        return [f for f in features if f.get("type") == ftype]

    def segs(pred):
        return [s for s in segments if pred(s)]

    # --- Lighting ---
    lighting_groups = [
        _group("streetlight_broken", "Broken streetlight",
               [_feature_row(f, "Broken streetlight") for f in feats("streetlight_broken")]),
        _group("streetlight_missing", "Missing / no streetlight",
               [_feature_row(f, "Missing streetlight") for f in feats("streetlight_missing")]),
        _group("dark_area", "Reported dark area",
               [_feature_row(f, "Dark area") for f in feats("dark_area")]),
        _group("critical_dark", "Critically dark road",
               [_segment_row(s, "Critically dark road", f"lighting {s.get('lighting_score')}/10")
                for s in segs(lambda s: s.get("lighting_score", 10) < 3)]),
        _group("poorly_lit", "Poorly lit road",
               [_segment_row(s, "Poorly lit road", f"lighting {s.get('lighting_score')}/10")
                for s in segs(lambda s: 3 <= s.get("lighting_score", 10) < 5)]),
    ]

    # --- Potholes (chronic first) ---
    potholes = sorted(
        feats("pothole"),
        key=lambda f: (f.get("recurrence_count", 0), f.get("severity", 0)),
        reverse=True,
    )
    pothole_groups = [
        _group("pothole", "Pothole", [_feature_row(f, "Pothole") for f in potholes]),
    ]
    zones = _cluster_pothole_zones(get_all_features())["zones"]

    # --- Safety / patrolling ---
    safety_groups = [
        _group("unsafe_spot", "Reported unsafe spot",
               [_feature_row(f, "Unsafe spot") for f in feats("unsafe_spot")]),
        _group("incident_hotspot", "Incident hotspot",
               [_segment_row(s, "Incident hotspot", f"{s.get('past_incident_count_90d')} incidents / 90d")
                for s in segs(lambda s: s.get("past_incident_count_90d", 0) >= 3)]),
        _group("far_from_police", "Far from a police station",
               [_segment_row(s, "Far from police", f"{s.get('police_station_distance_m')} m to police")
                for s in segs(lambda s: s.get("police_station_distance_m", 0) > 1500)]),
        _group("flood_prone", "Flood-prone stretch",
               [_segment_row(s, "Flood-prone", "monsoon flood risk")
                for s in segs(lambda s: bool(s.get("flood_risk")))]),
        _group("pending_review", "Community submission awaiting review",
               [_segment_row(s, "Awaiting review", "unverified contribution")
                for s in segs(lambda s: s.get("status") == "pending")]),
    ]

    def assemble(key, label, summary, groups, extra=None):
        groups = [g for g in groups if g]
        tab = {
            "key": key,
            "label": label,
            "summary": summary,
            "groups": groups,
            "count": sum(len(g["rows"]) for g in groups),
        }
        if extra:
            tab.update(extra)
        return tab

    chronic = sum(1 for f in potholes if f.get("recurrence_count", 0))
    tabs = [
        assemble("lighting", "Lighting",
                 "Poles and stretches that need a lighting crew.", lighting_groups),
        assemble("potholes", "Potholes",
                 (f"Spots to resurface. {chronic} have broken again after a previous fix."
                  if chronic else "Spots to resurface."),
                 pothole_groups, extra={"zones": zones}),
        assemble("safety", "Safety & patrolling",
                 "Areas to step up patrolling or review.", safety_groups),
    ]

    totals = {g["key"]: len(g["rows"]) for tab in tabs for g in tab["groups"]}
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tabs": tabs,
        "tab_totals": {tab["key"]: tab["count"] for tab in tabs},
        "totals": totals,
        "total_issues": sum(tab["count"] for tab in tabs),
    }


_REPORT_CSV_COLS = ["tab", "category", "label", "area", "lat", "lng",
                    "detail", "status", "severity", "recurrence_count", "reported_by"]


@router.get("/municipality/report")
def municipality_report(format: str = Query("json")):
    report = _build_report()
    if format == "csv":
        def esc(v):
            v = "" if v is None else str(v)
            v = v.replace('"', '""')
            return f'"{v}"' if ("," in v or '"' in v or "\n" in v) else v

        lines = [",".join(_REPORT_CSV_COLS)]
        for tab in report["tabs"]:
            for group in tab["groups"]:
                for r in group["rows"]:
                    row = {**r, "tab": tab["label"]}
                    lines.append(",".join(esc(row.get(k)) for k in _REPORT_CSV_COLS))
        csv_body = "\n".join(lines) + "\n"
        return Response(
            content=csv_body,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="saferoute-municipality-report.csv"'},
        )
    return report

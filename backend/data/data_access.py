"""
Firestore Data Access Layer
----------------------------
This is the real persistence layer for SafeRoute. Segments live in the
`segments` collection in Firestore.

For local development before you've wired up a GCP service account, this
falls back to an in-memory + local-JSON-backed emulation (clearly logged as
such) so the app is runnable end-to-end without credentials. The moment
GOOGLE_APPLICATION_CREDENTIALS is set to a valid service account key, all
reads/writes go to real Firestore with no code changes needed.
"""

import os
import json
import uuid
import threading
from datetime import datetime, timezone
from typing import List, Optional

_LOCAL_STORE_PATH = os.path.join(os.path.dirname(__file__), "_local_emulation_store.json")

# While the project is being tested inside a trusted group, new contributions are
# usable immediately. Set AUTO_VERIFY_CONTRIBUTIONS=false later and layer a
# peer-confirmation / review workflow on top — nothing here needs to change.
AUTO_VERIFY_CONTRIBUTIONS = os.environ.get("AUTO_VERIFY_CONTRIBUTIONS", "true").strip().lower() in (
    "1", "true", "yes", "on",
)
# Feature types the user curates by hand — always trusted on creation.
ALWAYS_VERIFIED_FEATURE_TYPES = {"police_station"}

_firestore_client = None
_firestore_enabled: Optional[bool] = None
_firebase_app_ready: Optional[bool] = None
# Lazy init runs on the first request; the frontend fires several at once, so
# guard it — otherwise racers hit "default app already exists" and poison the
# cached result.
_init_lock = threading.RLock()


def _ensure_firebase_app() -> bool:
    """Initialise the Firebase Admin SDK. Uses GOOGLE_APPLICATION_CREDENTIALS if
    it points at a key file (local dev); otherwise falls back to Application
    Default Credentials (Cloud Run / GCE run as the service's own account, no key
    file). Independent of whether Firestore is usable — this is what Auth needs."""
    global _firebase_app_ready
    if _firebase_app_ready is not None:
        return _firebase_app_ready

    with _init_lock:
        if _firebase_app_ready is not None:
            return _firebase_app_ready

        creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        has_key_file = bool(creds_path and os.path.exists(creds_path))
        # Local dev with neither a key file nor gcloud ADC → straight to the
        # local store, no noisy DefaultCredentialsError.
        if not has_key_file and not (
            os.environ.get("GOOGLE_CLOUD_PROJECT")
            or os.environ.get("K_SERVICE")  # set by Cloud Run
            or os.path.exists(os.path.expanduser("~/.config/gcloud/application_default_credentials.json"))
        ):
            _firebase_app_ready = False
            return False
        try:
            import firebase_admin
            from firebase_admin import credentials

            try:
                firebase_admin.get_app()  # already initialised by another caller?
            except ValueError:
                if has_key_file:
                    firebase_admin.initialize_app(credentials.Certificate(creds_path))
                else:
                    firebase_admin.initialize_app()  # Application Default Credentials
            _firebase_app_ready = True
            print("[data_access] Firebase Admin SDK initialised (Auth ready).")
        except Exception as e:  # noqa: BLE001
            print(f"[data_access] Firebase Admin init failed ({e}).")
            _firebase_app_ready = False
        return _firebase_app_ready


def firebase_app_ready() -> bool:
    return _ensure_firebase_app()


def _try_init_firestore() -> bool:
    global _firestore_client, _firestore_enabled
    if _firestore_enabled is not None:
        return _firestore_enabled

    with _init_lock:
        if _firestore_enabled is not None:
            return _firestore_enabled

        if not _ensure_firebase_app():
            print("[data_access] No Firebase credentials — LOCAL EMULATION store.")
            _firestore_enabled = False
            return False

        try:
            from firebase_admin import firestore

            client = firestore.client()
            # Health check: does the (default) database actually exist? A missing
            # DB raises NotFound here rather than on every later call.
            next(client.collection("_healthcheck").limit(1).stream(), None)
            _firestore_client = client
            _firestore_enabled = True
            print("[data_access] Connected to Firestore.")
        except Exception as e:  # noqa: BLE001
            print(f"[data_access] Firestore not usable ({e}) — using LOCAL EMULATION "
                  "store; Firebase Auth still works. Create the database and restart.")
            _firestore_enabled = False

        return _firestore_enabled


def is_using_firestore() -> bool:
    return _try_init_firestore()


# --- Local emulation helpers (dev-only, not the "real" data path) ---

def _local_load() -> dict:
    if not os.path.exists(_LOCAL_STORE_PATH):
        return {"segments": {}, "features": {}}
    with open(_LOCAL_STORE_PATH) as f:
        store = json.load(f)
    store.setdefault("segments", {})
    store.setdefault("features", {})
    store.setdefault("surveys", {})
    store.setdefault("events", {})
    store.setdefault("brochures", {})
    store.setdefault("contributors", {})
    store.setdefault("ratings", {})
    store.setdefault("live", {})
    return store


def _local_save(store: dict) -> None:
    with open(_LOCAL_STORE_PATH, "w") as f:
        json.dump(store, f, indent=2)


# --- Public API ---

def get_all_segments(status: Optional[str] = None) -> List[dict]:
    """Returns all segments, optionally filtered by verification status."""
    if _try_init_firestore():
        query = _firestore_client.collection("segments")
        if status:
            query = query.where("status", "==", status)
        return [doc.to_dict() for doc in query.stream()]

    store = _local_load()
    segments = list(store["segments"].values())
    if status:
        segments = [s for s in segments if s.get("status") == status]
    return segments


def get_segment(segment_id: str) -> Optional[dict]:
    if _try_init_firestore():
        doc = _firestore_client.collection("segments").document(segment_id).get()
        return doc.to_dict() if doc.exists else None

    store = _local_load()
    return store["segments"].get(segment_id)


def create_segment(segment: dict) -> dict:
    """Creates a new segment document with a generated ID, status='pending'."""
    segment_id = segment.get("segment_id") or f"seg_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    segment = {
        **segment,
        "segment_id": segment_id,
        "status": "verified" if AUTO_VERIFY_CONTRIBUTIONS else segment.get("status", "pending"),
        "confirmations": 0,
        "confirmed_by": [],
        "created_at": now,
        "updated_at": now,
    }

    if _try_init_firestore():
        _firestore_client.collection("segments").document(segment_id).set(segment)
        return segment

    store = _local_load()
    store["segments"][segment_id] = segment
    _local_save(store)
    return segment


def update_segment(segment_id: str, updates: dict) -> Optional[dict]:
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    if _try_init_firestore():
        ref = _firestore_client.collection("segments").document(segment_id)
        if not ref.get().exists:
            return None
        ref.update(updates)
        return ref.get().to_dict()

    store = _local_load()
    if segment_id not in store["segments"]:
        return None
    store["segments"][segment_id].update(updates)
    _local_save(store)
    return store["segments"][segment_id]


# --- Map features (point-based safety markers, e.g. broken streetlights) ---

def get_all_features(feature_type: Optional[str] = None) -> List[dict]:
    """Returns all point features, optionally filtered by type."""
    if _try_init_firestore():
        query = _firestore_client.collection("map_features")
        if feature_type:
            query = query.where("type", "==", feature_type)
        return [doc.to_dict() for doc in query.stream()]

    store = _local_load()
    features = list(store["features"].values())
    if feature_type:
        features = [f for f in features if f.get("type") == feature_type]
    return features


def get_feature(feature_id: str) -> Optional[dict]:
    if _try_init_firestore():
        doc = _firestore_client.collection("map_features").document(feature_id).get()
        return doc.to_dict() if doc.exists else None

    store = _local_load()
    return store["features"].get(feature_id)


def create_feature(feature: dict) -> dict:
    """Creates a new point feature. During trusted-group testing it's usable
    immediately (AUTO_VERIFY_CONTRIBUTIONS); police stations are always verified."""
    feature_id = feature.get("feature_id") or f"feat_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    if feature.get("type") in ALWAYS_VERIFIED_FEATURE_TYPES or AUTO_VERIFY_CONTRIBUTIONS:
        status = "verified"
    else:
        status = feature.get("status", "pending")
    seed_event = {
        "at": now,
        "kind": "reported",
        "by": feature.get("contributor") or {"uid": "anon", "name": feature.get("contributed_by", "Anonymous")},
        "note": feature.get("note", ""),
        "severity": feature.get("severity", 2),
    }
    feature = {
        "severity": 2,
        "visibility": "public",
        "recurrence_count": 0,
        **feature,
        "feature_id": feature_id,
        "status": status,
        "confirmations": 0,
        "confirmed_by": [],
        "events": [seed_event],
        "last_activity_at": now,
        "resolved_by": None,
        "resolved_at": None,
        "created_at": now,
        "updated_at": now,
    }

    if _try_init_firestore():
        _firestore_client.collection("map_features").document(feature_id).set(feature)
        return feature

    store = _local_load()
    store["features"][feature_id] = feature
    _local_save(store)
    return feature


def update_feature(feature_id: str, updates: dict) -> Optional[dict]:
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()

    if _try_init_firestore():
        ref = _firestore_client.collection("map_features").document(feature_id)
        if not ref.get().exists:
            return None
        ref.update(updates)
        return ref.get().to_dict()

    store = _local_load()
    if feature_id not in store["features"]:
        return None
    store["features"][feature_id].update(updates)
    _local_save(store)
    return store["features"][feature_id]


# --- Trip surveys (road/safety feedback submitted after starting navigation) ---

def get_all_surveys() -> List[dict]:
    if _try_init_firestore():
        return [doc.to_dict() for doc in _firestore_client.collection("trip_surveys").stream()]
    return list(_local_load()["surveys"].values())


def create_survey(survey: dict) -> dict:
    survey_id = survey.get("survey_id") or f"srv_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    survey = {**survey, "survey_id": survey_id, "created_at": now}

    if _try_init_firestore():
        _firestore_client.collection("trip_surveys").document(survey_id).set(survey)
        return survey

    store = _local_load()
    store["surveys"][survey_id] = survey
    _local_save(store)
    return survey


# --- Community-submitted events ---

def get_all_community_events() -> List[dict]:
    if _try_init_firestore():
        return [doc.to_dict() for doc in _firestore_client.collection("community_events").stream()]
    return list(_local_load()["events"].values())


def get_community_event(event_id: str) -> Optional[dict]:
    if _try_init_firestore():
        doc = _firestore_client.collection("community_events").document(event_id).get()
        return doc.to_dict() if doc.exists else None
    return _local_load()["events"].get(event_id)


def create_community_event(event: dict) -> dict:
    event_id = event.get("id") or f"evt_u_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    event = {
        **event,
        "id": event_id,
        "source": "community",
        "status": "verified" if AUTO_VERIFY_CONTRIBUTIONS else event.get("status", "pending"),
        "confirmations": 0,
        "confirmed_by": [],
        "reports": [],
        "report_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    if _try_init_firestore():
        _firestore_client.collection("community_events").document(event_id).set(event)
        return event
    store = _local_load()
    store["events"][event_id] = event
    _local_save(store)
    return event


def update_community_event(event_id: str, updates: dict) -> Optional[dict]:
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    if _try_init_firestore():
        ref = _firestore_client.collection("community_events").document(event_id)
        if not ref.get().exists:
            return None
        ref.update(updates)
        return ref.get().to_dict()
    store = _local_load()
    if event_id not in store["events"]:
        return None
    store["events"][event_id].update(updates)
    _local_save(store)
    return store["events"][event_id]


# --- Event brochures (poster/flyer file attached to any event, by event id) ---

def get_brochure(event_id: str) -> Optional[dict]:
    if _try_init_firestore():
        doc = _firestore_client.collection("event_brochures").document(event_id).get()
        return doc.to_dict() if doc.exists else None
    return _local_load()["brochures"].get(event_id)


def set_brochure(event_id: str, data: dict) -> dict:
    data = {**data, "event_id": event_id, "updated_at": datetime.now(timezone.utc).isoformat()}
    if _try_init_firestore():
        _firestore_client.collection("event_brochures").document(event_id).set(data)
        return data
    store = _local_load()
    store["brochures"][event_id] = data
    _local_save(store)
    return data


# --- Contributors (one record per signed-in person) ---

def get_contributor(uid: str) -> Optional[dict]:
    if _try_init_firestore():
        doc = _firestore_client.collection("contributors").document(uid).get()
        return doc.to_dict() if doc.exists else None
    return _local_load()["contributors"].get(uid)


def upsert_contributor(uid: str, profile: dict) -> dict:
    """Creates or refreshes a contributor record and bumps their count."""
    now = datetime.now(timezone.utc).isoformat()
    existing = get_contributor(uid) or {}
    record = {
        "uid": uid,
        "name": profile.get("name") or existing.get("name") or "SafeRoute user",
        "email": profile.get("email") or existing.get("email"),
        "picture": profile.get("picture") or existing.get("picture"),
        "first_seen": existing.get("first_seen", now),
        "last_seen": now,
        "contribution_count": existing.get("contribution_count", 0) + (1 if profile.get("_count") else 0),
    }
    if _try_init_firestore():
        _firestore_client.collection("contributors").document(uid).set(record)
    else:
        store = _local_load()
        store["contributors"][uid] = record
        _local_save(store)
    return record


# --- Community safety ratings (subjective "how safe does this feel", 1-5) ---

def get_all_ratings() -> List[dict]:
    if _try_init_firestore():
        return [doc.to_dict() for doc in _firestore_client.collection("safety_ratings").stream()]
    return list(_local_load()["ratings"].values())


def create_rating(rating: dict) -> dict:
    rating_id = rating.get("rating_id") or f"rate_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    rating = {**rating, "rating_id": rating_id, "created_at": now}

    if _try_init_firestore():
        _firestore_client.collection("safety_ratings").document(rating_id).set(rating)
        return rating

    store = _local_load()
    store["ratings"][rating_id] = rating
    _local_save(store)
    return rating


def update_rating(rating_id: str, updates: dict) -> Optional[dict]:
    """Used when someone re-rates a spot they've already rated — the earlier
    rating is edited in place so it keeps its founding position in a cluster."""
    if _try_init_firestore():
        ref = _firestore_client.collection("safety_ratings").document(rating_id)
        if not ref.get().exists:
            return None
        ref.update(updates)
        return ref.get().to_dict()

    store = _local_load()
    if rating_id not in store["ratings"]:
        return None
    store["ratings"][rating_id].update(updates)
    _local_save(store)
    return store["ratings"][rating_id]


# --- Live reports ("happening now" — short-lived, geo-tagged) ---

def get_all_live_reports() -> List[dict]:
    if _try_init_firestore():
        return [doc.to_dict() for doc in _firestore_client.collection("live_reports").stream()]
    return list(_local_load()["live"].values())


def get_live_report(report_id: str) -> Optional[dict]:
    if _try_init_firestore():
        doc = _firestore_client.collection("live_reports").document(report_id).get()
        return doc.to_dict() if doc.exists else None
    return _local_load()["live"].get(report_id)


def create_live_report(report: dict) -> dict:
    report_id = report.get("report_id") or f"live_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc).isoformat()
    report = {
        "still_there": 0,
        "still_there_by": [],
        "cleared": False,
        "comments": [],
        **report,
        "report_id": report_id,
        "created_at": now,
        "updated_at": now,
    }
    if _try_init_firestore():
        _firestore_client.collection("live_reports").document(report_id).set(report)
        return report
    store = _local_load()
    store["live"][report_id] = report
    _local_save(store)
    return report


def update_live_report(report_id: str, updates: dict) -> Optional[dict]:
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    if _try_init_firestore():
        ref = _firestore_client.collection("live_reports").document(report_id)
        if not ref.get().exists:
            return None
        ref.update(updates)
        return ref.get().to_dict()
    store = _local_load()
    if report_id not in store["live"]:
        return None
    store["live"][report_id].update(updates)
    _local_save(store)
    return store["live"][report_id]


def bulk_create_segments(segments: List[dict]) -> int:
    """Used for seeding the initial synthetic dataset. Marks them
    source='seed_synthetic', status='verified' since they represent our
    curated baseline, not unverified crowd submissions."""
    now = datetime.now(timezone.utc).isoformat()
    count = 0

    if _try_init_firestore():
        batch = _firestore_client.batch()
        for seg in segments:
            seg = {
                **seg,
                "status": "verified",
                "source": "seed_synthetic",
                "confirmations": 0,
                "confirmed_by": [],
                "created_at": now,
                "updated_at": now,
            }
            ref = _firestore_client.collection("segments").document(seg["segment_id"])
            batch.set(ref, seg)
            count += 1
            if count % 400 == 0:
                batch.commit()
                batch = _firestore_client.batch()
        batch.commit()
        return count

    store = _local_load()
    for seg in segments:
        seg = {
            **seg,
            "status": "verified",
            "source": "seed_synthetic",
            "confirmations": 0,
            "confirmed_by": [],
            "created_at": now,
            "updated_at": now,
        }
        store["segments"][seg["segment_id"]] = seg
        count += 1
    _local_save(store)
    return count
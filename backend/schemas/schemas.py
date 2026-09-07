from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime


VerificationStatus = Literal["pending", "verified", "conflict"]


class Segment(BaseModel):
    """A single road/area safety record. status tracks its trust level,
    Google-Maps-edit style: new contributions start 'pending' and are not
    fully trusted by the scoring engine until corroborated."""

    segment_id: str
    road_name: str
    area: str
    lat: float
    lng: float

    lighting_score: float = Field(ge=0, le=10)
    police_station_distance_m: int = Field(ge=0)
    hospital_distance_m: int = Field(ge=0)
    foot_traffic_base: float = Field(ge=0, le=10)
    foot_traffic_night_multiplier: float = Field(ge=0, le=1)
    open_shops_density: float = Field(ge=0, le=10)
    past_incident_count_90d: int = Field(ge=0)
    flood_risk: bool
    road_condition_score: float = Field(ge=0, le=10)

    status: VerificationStatus = "pending"
    confirmations: int = 0
    confirmed_by: List[str] = []          # contributor names/ids who confirmed
    contributed_by: Optional[str] = None  # original submitter
    source: Literal["seed_synthetic", "user_contributed"] = "user_contributed"
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class NewSegmentInput(BaseModel):
    """Payload from the contribution form / dropped pin."""
    road_name: str
    area: str
    lat: float
    lng: float
    lighting_score: float = Field(5.0, ge=0, le=10)
    police_station_distance_m: int = Field(1000, ge=0)
    hospital_distance_m: int = Field(1000, ge=0)
    foot_traffic_base: float = Field(5.0, ge=0, le=10)
    foot_traffic_night_multiplier: float = Field(0.5, ge=0, le=1)
    open_shops_density: float = Field(5.0, ge=0, le=10)
    past_incident_count_90d: int = Field(0, ge=0)
    flood_risk: bool = False
    road_condition_score: float = Field(5.0, ge=0, le=10)


class ConfirmInput(BaseModel):
    """Body for confirm/resolve/report actions. Identity comes from the auth
    token, not the payload; `note` is optional free text."""
    note: str = ""


FeatureType = Literal[
    "streetlight_ok",
    "streetlight_broken",
    "streetlight_missing",
    "pothole",
    "police_station",
    "dark_area",
    "cctv",
    "police_aid",
    "unsafe_spot",
    "other",
]

FeatureStatus = Literal["pending", "verified", "resolved"]


class MapFeature(BaseModel):
    """A single point-of-interest safety marker dropped on an exact coordinate —
    e.g. 'this streetlight is broken'. Lightweight compared to a full Segment;
    meant for quick field contributions."""

    feature_id: str
    lat: float
    lng: float
    type: FeatureType
    note: str = ""
    severity: int = Field(2, ge=1, le=3)      # 1 minor · 2 moderate · 3 severe
    visibility: Literal["public", "anonymous"] = "public"
    contributor: Optional[dict] = None
    contributed_by: str = "Anonymous"  # legacy display string
    status: FeatureStatus = "pending"
    confirmations: int = 0
    confirmed_by: List[str] = []
    # Append-only lifecycle log. Each entry: {at, kind, by:{uid,name}, note?, severity?}
    # kind ∈ reported | confirmed | repaired | reappeared
    events: List[dict] = []
    recurrence_count: int = 0          # times it came back after being marked fixed
    last_activity_at: Optional[str] = None
    resolved_by: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class NewFeatureInput(BaseModel):
    """Payload from the 'Add a point' panel. The contributor's identity comes
    from the signed-in Firebase user (or dev header), never the request body.
    `visibility='anonymous'` hides the name in the UI/report — the backend still
    records who submitted it."""
    lat: float
    lng: float
    type: FeatureType
    note: str = ""
    severity: int = Field(2, ge=1, le=3)
    visibility: Literal["public", "anonymous"] = "public"


# Short, fixed vocabulary of "what's wrong here" tags a rater can attach.
SafetyTag = Literal[
    "poor_lighting",
    "isolated",
    "no_footfall",
    "harassment_risk",
    "recent_incident",
    "stray_dogs",
    "bad_footpath",
    "traffic_risk",
    "flooding",
]


class SafetyRating(BaseModel):
    """One person's subjective 'how safe does this spot feel'. Kept apart from
    the computed segment score — it nudges the displayed number within a bound,
    it never replaces it."""

    rating_id: str
    lat: float
    lng: float
    segment_id: Optional[str] = None
    score: int = Field(..., ge=1, le=5)       # 1 very unsafe · 5 very safe
    time_of_day: Optional[Literal["day", "night"]] = None
    tags: List[SafetyTag] = []
    comment: str = ""
    visibility: Literal["public", "anonymous"] = "public"
    contributor: Optional[dict] = None
    contributed_by: str = "Anonymous"
    created_at: Optional[str] = None


class NewRatingInput(BaseModel):
    """Payload from the 'rate how safe this feels' control. Identity comes from
    the signed-in user / dev header, never the body."""
    lat: float
    lng: float
    segment_id: Optional[str] = None
    score: int = Field(..., ge=1, le=5)
    time_of_day: Optional[Literal["day", "night"]] = None
    tags: List[SafetyTag] = []
    comment: str = Field("", max_length=400)
    visibility: Literal["public", "anonymous"] = "public"


class NewSurveyInput(BaseModel):
    """Post-trip survey submitted after the traveller starts navigation."""
    origin: Optional[str] = None
    destination: Optional[str] = None
    route_label: Optional[str] = None
    road_condition: int = Field(3, ge=1, le=5)
    lighting: int = Field(3, ge=1, le=5)
    felt_safe: int = Field(3, ge=1, le=5)
    hazard_note: str = ""
    would_repeat: bool = True


class NewEventInput(BaseModel):
    """Payload from the 'Add an event' panel. The organiser's identity comes
    from the signed-in user — events are never anonymous."""
    title: str = Field(..., min_length=2)
    category: str = "Community"
    venue: str = ""
    area: str = ""
    lat: float
    lng: float
    start_date: str  # ISO date, e.g. 2026-10-05
    end_date: Optional[str] = None
    url: str = ""
    note: str = ""


class EventReportInput(BaseModel):
    reason: Literal["wrong_info", "cancelled", "already_over", "duplicate", "spam", "other"] = "wrong_info"
    detail: str = ""


class SegmentScoreBreakdown(BaseModel):
    segment_id: str
    road_name: str
    score: float
    factors: dict


class RouteScoreResult(BaseModel):
    safety_score: float
    average_segment_score: float
    worst_segment: SegmentScoreBreakdown
    segment_breakdown: List[SegmentScoreBreakdown]
    hour: int
    is_night: bool
    is_raining: bool
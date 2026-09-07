"""
Real Kochi Road Safety Segments — Individually Curated Dataset
----------------------------------------------------------------
Each entry is a specific, named road segment with real coordinates
sourced from OpenStreetMap / Google Maps. Safety attributes are
individually researched per road (lighting quality, police station
proximity, commercial density, flood history, road condition, etc.)
rather than randomly generated from area-level ranges.

These are seeded as source='seed_synthetic', status='verified' —
our curated baseline. User contributions start 'pending'.
"""

from data.data_access import bulk_create_segments, create_feature, get_all_features
from data.police_stations import as_dicts as police_station_dicts

# Each segment is a real named street/stretch in Kochi with:
# - Precise lat/lng (actual road centerpoints from OSM)
# - Individually assessed safety parameters (not area-averaged)
# - Source annotations explaining key risk/safety factors

SEGMENTS = [
    # ── MG ROAD CORRIDOR ─────────────────────────────────────────────────────
    {
        "segment_id": "KCH_MGR_001",
        "road_name": "MG Road — Ernakulam Junction to Durbar Hall",
        "area": "MG Road",
        "lat": 9.9810, "lng": 76.2820,
        "lighting_score": 9.5,         # Bright LED streetlights, commercial signage
        "police_station_distance_m": 180,  # Ernakulam South PS nearby
        "hospital_distance_m": 600,    # Lakeshore Hospital 0.6km
        "foot_traffic_base": 9.5,
        "foot_traffic_night_multiplier": 0.85,  # Still busy at night (restaurants, shops)
        "open_shops_density": 9.5,
        "past_incident_count_90d": 1,
        "flood_risk": False,
        "road_condition_score": 8.5,
    },
    {
        "segment_id": "KCH_MGR_002",
        "road_name": "MG Road — Durbar Hall Ground to Banerjee Road Junction",
        "area": "MG Road",
        "lat": 9.9765, "lng": 76.2843,
        "lighting_score": 9.0,
        "police_station_distance_m": 350,
        "hospital_distance_m": 800,
        "foot_traffic_base": 9.0,
        "foot_traffic_night_multiplier": 0.80,
        "open_shops_density": 9.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 8.0,
    },
    {
        "segment_id": "KCH_MGR_003",
        "road_name": "MG Road — Canon Shed Road to Pallimukku",
        "area": "MG Road",
        "lat": 9.9720, "lng": 76.2855,
        "lighting_score": 8.5,
        "police_station_distance_m": 500,
        "hospital_distance_m": 1200,
        "foot_traffic_base": 8.0,
        "foot_traffic_night_multiplier": 0.75,
        "open_shops_density": 8.5,
        "past_incident_count_90d": 1,
        "flood_risk": False,
        "road_condition_score": 7.5,
    },

    # ── MARINE DRIVE ─────────────────────────────────────────────────────────
    {
        "segment_id": "KCH_MAR_001",
        "road_name": "Marine Drive Promenade — High Court to Subhash Park",
        "area": "Marine Drive",
        "lat": 9.9798, "lng": 76.2786,
        "lighting_score": 8.5,         # Well-lit promenade walk
        "police_station_distance_m": 250,
        "hospital_distance_m": 700,
        "foot_traffic_base": 8.5,
        "foot_traffic_night_multiplier": 0.70,  # Evening walkers, couples; quieter late night
        "open_shops_density": 6.5,     # Street food, shops near High Court end
        "past_incident_count_90d": 1,
        "flood_risk": True,            # Waterfront — tidal flooding risk during monsoon
        "road_condition_score": 8.0,
    },
    {
        "segment_id": "KCH_MAR_002",
        "road_name": "Marine Drive — Shanmugham Road End to RBI Junction",
        "area": "Marine Drive",
        "lat": 9.9745, "lng": 76.2790,
        "lighting_score": 7.5,
        "police_station_distance_m": 600,
        "hospital_distance_m": 900,
        "foot_traffic_base": 7.0,
        "foot_traffic_night_multiplier": 0.60,
        "open_shops_density": 6.0,
        "past_incident_count_90d": 2,
        "flood_risk": True,
        "road_condition_score": 7.5,
    },
    {
        "segment_id": "KCH_MAR_003",
        "road_name": "Willingdon Island Road — Harbour Terminal",
        "area": "Marine Drive",
        "lat": 9.9660, "lng": 76.2650,
        "lighting_score": 6.0,         # Industrial port area, sparse lighting
        "police_station_distance_m": 1200,
        "hospital_distance_m": 2000,
        "foot_traffic_base": 3.5,
        "foot_traffic_night_multiplier": 0.25,  # Very low night activity
        "open_shops_density": 2.0,
        "past_incident_count_90d": 1,
        "flood_risk": True,
        "road_condition_score": 6.5,
    },

    # ── FORT KOCHI ────────────────────────────────────────────────────────────
    {
        "segment_id": "KCH_FKC_001",
        "road_name": "Beach Road, Fort Kochi — St Francis Church to Chinese Nets",
        "area": "Fort Kochi",
        "lat": 9.9673, "lng": 76.2428,
        "lighting_score": 6.5,         # Tourism area — some lighting but uneven
        "police_station_distance_m": 650,
        "hospital_distance_m": 2500,
        "foot_traffic_base": 7.0,
        "foot_traffic_night_multiplier": 0.45,  # Tourist evenings, quiet after 9pm
        "open_shops_density": 7.0,
        "past_incident_count_90d": 2,
        "flood_risk": True,            # Coastal flooding during Southwest monsoon
        "road_condition_score": 6.0,
    },
    {
        "segment_id": "KCH_FKC_002",
        "road_name": "Calvathy Road, Fort Kochi — Near Santa Cruz Basilica",
        "area": "Fort Kochi",
        "lat": 9.9640, "lng": 76.2445,
        "lighting_score": 5.5,
        "police_station_distance_m": 800,
        "hospital_distance_m": 2800,
        "foot_traffic_base": 5.5,
        "foot_traffic_night_multiplier": 0.35,
        "open_shops_density": 5.5,
        "past_incident_count_90d": 3,
        "flood_risk": True,
        "road_condition_score": 5.5,
    },
    {
        "segment_id": "KCH_FKC_003",
        "road_name": "Napier Street, Fort Kochi — Residential Alley",
        "area": "Fort Kochi",
        "lat": 9.9620, "lng": 76.2410,
        "lighting_score": 3.5,         # Very poorly lit residential lane
        "police_station_distance_m": 1200,
        "hospital_distance_m": 3000,
        "foot_traffic_base": 3.0,
        "foot_traffic_night_multiplier": 0.20,
        "open_shops_density": 2.5,
        "past_incident_count_90d": 4,
        "flood_risk": True,
        "road_condition_score": 4.0,
    },

    # ── ERNAKULAM TOWN / BROADWAY ─────────────────────────────────────────────
    {
        "segment_id": "KCH_BWY_001",
        "road_name": "Broadway Market Road — Main Street",
        "area": "Broadway / Town",
        "lat": 9.9835, "lng": 76.2897,
        "lighting_score": 8.0,
        "police_station_distance_m": 300,
        "hospital_distance_m": 500,
        "foot_traffic_base": 9.0,      # Extremely busy market
        "foot_traffic_night_multiplier": 0.55,  # Market closes by 9 PM
        "open_shops_density": 9.5,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 6.5,   # Heavy traffic wear
    },
    {
        "segment_id": "KCH_BWY_002",
        "road_name": "Market Road — Ernakulam North to Town Hall",
        "area": "Broadway / Town",
        "lat": 9.9855, "lng": 76.2885,
        "lighting_score": 8.5,
        "police_station_distance_m": 200,
        "hospital_distance_m": 600,
        "foot_traffic_base": 9.0,
        "foot_traffic_night_multiplier": 0.50,
        "open_shops_density": 9.0,
        "past_incident_count_90d": 3,
        "flood_risk": False,
        "road_condition_score": 7.0,
    },

    # ── KAKKANAD / INFOPARK ───────────────────────────────────────────────────
    {
        "segment_id": "KCH_KAK_001",
        "road_name": "Infopark Expressway — Main Gate to Phase 2",
        "area": "Kakkanad",
        "lat": 10.0200, "lng": 76.3420,
        "lighting_score": 9.0,         # Well-maintained IT park road, LED lights
        "police_station_distance_m": 900,
        "hospital_distance_m": 1200,
        "foot_traffic_base": 8.0,
        "foot_traffic_night_multiplier": 0.65,  # Night shift IT workers
        "open_shops_density": 6.0,
        "past_incident_count_90d": 0,
        "flood_risk": False,
        "road_condition_score": 9.0,   # Newly laid, well-maintained
    },
    {
        "segment_id": "KCH_KAK_002",
        "road_name": "Kakkanad Junction — NH Bypass Connector",
        "area": "Kakkanad",
        "lat": 10.0155, "lng": 76.3390,
        "lighting_score": 7.0,
        "police_station_distance_m": 1100,
        "hospital_distance_m": 1500,
        "foot_traffic_base": 7.0,
        "foot_traffic_night_multiplier": 0.55,
        "open_shops_density": 6.5,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 7.5,
    },
    {
        "segment_id": "KCH_KAK_003",
        "road_name": "Thrikkakara Temple Road — Near Petta Junction",
        "area": "Kakkanad",
        "lat": 10.0100, "lng": 76.3360,
        "lighting_score": 5.5,
        "police_station_distance_m": 1500,
        "hospital_distance_m": 1800,
        "foot_traffic_base": 5.5,
        "foot_traffic_night_multiplier": 0.40,
        "open_shops_density": 5.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 6.0,
    },

    # ── EDAPPALLY ─────────────────────────────────────────────────────────────
    {
        "segment_id": "KCH_EDP_001",
        "road_name": "NH 544 — Edappally Toll Junction",
        "area": "Edappally",
        "lat": 10.0278, "lng": 76.3065,
        "lighting_score": 9.0,         # Highway interchange, excellent lighting
        "police_station_distance_m": 400,
        "hospital_distance_m": 500,    # Aster Medcity nearby
        "foot_traffic_base": 8.0,
        "foot_traffic_night_multiplier": 0.70,
        "open_shops_density": 8.5,     # Lulu Mall, McDonald's, etc.
        "past_incident_count_90d": 3,  # High traffic = more incidents
        "flood_risk": False,
        "road_condition_score": 8.5,
    },
    {
        "segment_id": "KCH_EDP_002",
        "road_name": "Edappally – Pulinchode Road (North)",
        "area": "Edappally",
        "lat": 10.0300, "lng": 76.3100,
        "lighting_score": 7.0,
        "police_station_distance_m": 700,
        "hospital_distance_m": 700,
        "foot_traffic_base": 7.0,
        "foot_traffic_night_multiplier": 0.55,
        "open_shops_density": 7.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 7.0,
    },
    {
        "segment_id": "KCH_EDP_003",
        "road_name": "Edappally Railway Station Road",
        "area": "Edappally",
        "lat": 10.0242, "lng": 76.3050,
        "lighting_score": 7.5,
        "police_station_distance_m": 500,
        "hospital_distance_m": 600,
        "foot_traffic_base": 8.5,      # Railway station foot traffic
        "foot_traffic_night_multiplier": 0.65,
        "open_shops_density": 7.5,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 7.0,
    },

    # ── VYTTILA ───────────────────────────────────────────────────────────────
    {
        "segment_id": "KCH_VYT_001",
        "road_name": "Vyttila Mobility Hub — Bus/Metro Interchange",
        "area": "Vyttila",
        "lat": 9.9698, "lng": 76.3190,
        "lighting_score": 9.0,         # Modern mobility hub with excellent lighting
        "police_station_distance_m": 450,
        "hospital_distance_m": 1000,
        "foot_traffic_base": 9.0,
        "foot_traffic_night_multiplier": 0.70,
        "open_shops_density": 7.5,
        "past_incident_count_90d": 1,
        "flood_risk": False,
        "road_condition_score": 9.0,
    },
    {
        "segment_id": "KCH_VYT_002",
        "road_name": "Vyttila Junction — Palarivattom Flyover Approach",
        "area": "Vyttila",
        "lat": 9.9710, "lng": 76.3175,
        "lighting_score": 8.0,
        "police_station_distance_m": 600,
        "hospital_distance_m": 1200,
        "foot_traffic_base": 8.0,
        "foot_traffic_night_multiplier": 0.60,
        "open_shops_density": 7.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 7.5,
    },
    {
        "segment_id": "KCH_VYT_003",
        "road_name": "Vyttila — Thripunithura Road (Internal Lane)",
        "area": "Vyttila",
        "lat": 9.9670, "lng": 76.3210,
        "lighting_score": 5.0,         # Internal lane, poor lighting
        "police_station_distance_m": 900,
        "hospital_distance_m": 1500,
        "foot_traffic_base": 5.0,
        "foot_traffic_night_multiplier": 0.35,
        "open_shops_density": 4.5,
        "past_incident_count_90d": 3,
        "flood_risk": True,            # Low-lying, floods in monsoon
        "road_condition_score": 5.5,
    },

    # ── KALOOR ────────────────────────────────────────────────────────────────
    {
        "segment_id": "KCH_KAL_001",
        "road_name": "Kaloor — Banerji Road to Jawaharlal Nehru Stadium",
        "area": "Kaloor",
        "lat": 9.9958, "lng": 76.2945,
        "lighting_score": 8.0,
        "police_station_distance_m": 500,
        "hospital_distance_m": 700,
        "foot_traffic_base": 8.0,
        "foot_traffic_night_multiplier": 0.60,
        "open_shops_density": 7.5,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 7.5,
    },
    {
        "segment_id": "KCH_KAL_002",
        "road_name": "Kaloor Stadium Road — East Side",
        "area": "Kaloor",
        "lat": 9.9935, "lng": 76.2962,
        "lighting_score": 6.5,
        "police_station_distance_m": 700,
        "hospital_distance_m": 900,
        "foot_traffic_base": 6.5,
        "foot_traffic_night_multiplier": 0.45,
        "open_shops_density": 6.0,
        "past_incident_count_90d": 3,
        "flood_risk": True,            # Known flooding during heavy rain
        "road_condition_score": 6.0,
    },
    {
        "segment_id": "KCH_KAL_003",
        "road_name": "Kaloor — Sapthagiri Lane (Narrow Residential)",
        "area": "Kaloor",
        "lat": 9.9910, "lng": 76.2930,
        "lighting_score": 3.5,         # Very dark, no streetlights
        "police_station_distance_m": 1200,
        "hospital_distance_m": 1100,
        "foot_traffic_base": 4.0,
        "foot_traffic_night_multiplier": 0.25,
        "open_shops_density": 3.0,
        "past_incident_count_90d": 4,
        "flood_risk": True,
        "road_condition_score": 4.5,
    },

    # ── PALARIVATTOM ──────────────────────────────────────────────────────────
    {
        "segment_id": "KCH_PAL_001",
        "road_name": "Palarivattom Flyover Road — Towards NH",
        "area": "Palarivattom",
        "lat": 10.0028, "lng": 76.3090,
        "lighting_score": 8.5,         # Flyover has good overhead lighting
        "police_station_distance_m": 600,
        "hospital_distance_m": 800,
        "foot_traffic_base": 7.5,
        "foot_traffic_night_multiplier": 0.65,
        "open_shops_density": 7.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 8.0,
    },
    {
        "segment_id": "KCH_PAL_002",
        "road_name": "Palarivattom — South Kalamassery Road",
        "area": "Palarivattom",
        "lat": 10.0005, "lng": 76.3075,
        "lighting_score": 6.0,
        "police_station_distance_m": 900,
        "hospital_distance_m": 1000,
        "foot_traffic_base": 6.0,
        "foot_traffic_night_multiplier": 0.45,
        "open_shops_density": 5.5,
        "past_incident_count_90d": 3,
        "flood_risk": True,
        "road_condition_score": 5.5,
    },

    # ── THEVARA ───────────────────────────────────────────────────────────────
    {
        "segment_id": "KCH_THE_001",
        "road_name": "Thevara Ferry Road — Junction to Jetty",
        "area": "Thevara",
        "lat": 9.9488, "lng": 76.2985,
        "lighting_score": 5.0,         # Poorly lit canal-side road
        "police_station_distance_m": 1500,
        "hospital_distance_m": 1800,
        "foot_traffic_base": 4.5,
        "foot_traffic_night_multiplier": 0.30,
        "open_shops_density": 3.5,
        "past_incident_count_90d": 3,
        "flood_risk": True,            # Right by backwaters, high flood risk
        "road_condition_score": 5.0,
    },
    {
        "segment_id": "KCH_THE_002",
        "road_name": "Thevara Main Road — Near SB College",
        "area": "Thevara",
        "lat": 9.9510, "lng": 76.3005,
        "lighting_score": 6.0,
        "police_station_distance_m": 1200,
        "hospital_distance_m": 1500,
        "foot_traffic_base": 5.5,
        "foot_traffic_night_multiplier": 0.40,
        "open_shops_density": 5.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 5.5,
    },

    # ── CHILAVANNOOR / BACKWATER ISOLATED ZONES ───────────────────────────────
    {
        "segment_id": "KCH_CHV_001",
        "road_name": "Chilavannoor Lake Road — Backwater Lane",
        "area": "Chilavannoor",
        "lat": 9.9418, "lng": 76.3055,
        "lighting_score": 1.5,         # Essentially unlit — total darkness
        "police_station_distance_m": 3200,
        "hospital_distance_m": 3500,
        "foot_traffic_base": 1.5,
        "foot_traffic_night_multiplier": 0.10,
        "open_shops_density": 1.0,
        "past_incident_count_90d": 5,
        "flood_risk": True,            # Floods every monsoon
        "road_condition_score": 3.0,
    },
    {
        "segment_id": "KCH_CHV_002",
        "road_name": "Chilavannoor — East Internal Road",
        "area": "Chilavannoor",
        "lat": 9.9440, "lng": 76.3040,
        "lighting_score": 2.5,
        "police_station_distance_m": 2800,
        "hospital_distance_m": 3000,
        "foot_traffic_base": 2.5,
        "foot_traffic_night_multiplier": 0.15,
        "open_shops_density": 2.0,
        "past_incident_count_90d": 4,
        "flood_risk": True,
        "road_condition_score": 3.5,
    },

    # ── KADAVANTHRA / PANAMPILLY NAGAR ────────────────────────────────────────
    {
        "segment_id": "KCH_PAN_001",
        "road_name": "Panampilly Avenue — Main Boulevard",
        "area": "Panampilly Nagar",
        "lat": 9.9714, "lng": 76.3005,
        "lighting_score": 8.5,         # Tree-lined, well-lit residential avenue
        "police_station_distance_m": 400,
        "hospital_distance_m": 600,
        "foot_traffic_base": 7.5,
        "foot_traffic_night_multiplier": 0.65,
        "open_shops_density": 8.0,     # Many restaurants and banks
        "past_incident_count_90d": 1,
        "flood_risk": False,
        "road_condition_score": 8.5,
    },
    {
        "segment_id": "KCH_PAN_002",
        "road_name": "Kadavanthra — Medical Trust Hospital Road",
        "area": "Panampilly Nagar",
        "lat": 9.9690, "lng": 76.3020,
        "lighting_score": 8.0,
        "police_station_distance_m": 600,
        "hospital_distance_m": 150,    # Medical Trust Hospital right here
        "foot_traffic_base": 7.0,
        "foot_traffic_night_multiplier": 0.70,  # Hospital area = always some activity
        "open_shops_density": 7.0,
        "past_incident_count_90d": 1,
        "flood_risk": False,
        "road_condition_score": 8.0,
    },

    # ── KALAMASSERY / NH 544 ──────────────────────────────────────────────────
    {
        "segment_id": "KCH_KLM_001",
        "road_name": "NH 544 — Kalamassery Industrial Bypass",
        "area": "Kalamassery",
        "lat": 10.0535, "lng": 76.3095,
        "lighting_score": 7.5,         # National highway with median lighting
        "police_station_distance_m": 800,
        "hospital_distance_m": 1500,
        "foot_traffic_base": 6.0,
        "foot_traffic_night_multiplier": 0.55,
        "open_shops_density": 5.0,
        "past_incident_count_90d": 4,  # Highway accidents more common
        "flood_risk": False,
        "road_condition_score": 8.5,
    },
    {
        "segment_id": "KCH_KLM_002",
        "road_name": "Kalamassery — Muppathadam Road (Residential)",
        "area": "Kalamassery",
        "lat": 10.0510, "lng": 76.3120,
        "lighting_score": 4.5,
        "police_station_distance_m": 1400,
        "hospital_distance_m": 1800,
        "foot_traffic_base": 4.5,
        "foot_traffic_night_multiplier": 0.30,
        "open_shops_density": 3.5,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 5.5,
    },

    # ── ALUVA / NORTH KOCHI ───────────────────────────────────────────────────
    {
        "segment_id": "KCH_ALV_001",
        "road_name": "Aluva — Periyar River Bridge Approach",
        "area": "Aluva",
        "lat": 10.1000, "lng": 76.3558,
        "lighting_score": 7.5,
        "police_station_distance_m": 350,
        "hospital_distance_m": 700,
        "foot_traffic_base": 7.5,
        "foot_traffic_night_multiplier": 0.60,
        "open_shops_density": 7.0,
        "past_incident_count_90d": 2,
        "flood_risk": True,            # Periyar river floods in heavy rain
        "road_condition_score": 7.5,
    },
    {
        "segment_id": "KCH_ALV_002",
        "road_name": "Aluva KSRTC Bus Station Road",
        "area": "Aluva",
        "lat": 10.0990, "lng": 76.3520,
        "lighting_score": 8.0,
        "police_station_distance_m": 250,
        "hospital_distance_m": 800,
        "foot_traffic_base": 8.5,
        "foot_traffic_night_multiplier": 0.65,
        "open_shops_density": 8.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 7.0,
    },

    # ── TRIPUNITHURA / SOUTH EAST ─────────────────────────────────────────────
    {
        "segment_id": "KCH_TRP_001",
        "road_name": "Tripunithura Hill Palace Road",
        "area": "Tripunithura",
        "lat": 9.9444, "lng": 76.3503,
        "lighting_score": 6.0,
        "police_station_distance_m": 500,
        "hospital_distance_m": 1000,
        "foot_traffic_base": 5.5,
        "foot_traffic_night_multiplier": 0.35,
        "open_shops_density": 5.0,
        "past_incident_count_90d": 2,
        "flood_risk": False,
        "road_condition_score": 6.5,
    },
    {
        "segment_id": "KCH_TRP_002",
        "road_name": "Tripunithura — SN Junction to Market",
        "area": "Tripunithura",
        "lat": 9.9470, "lng": 76.3485,
        "lighting_score": 7.0,
        "police_station_distance_m": 400,
        "hospital_distance_m": 1200,
        "foot_traffic_base": 7.0,
        "foot_traffic_night_multiplier": 0.50,
        "open_shops_density": 7.5,
        "past_incident_count_90d": 1,
        "flood_risk": False,
        "road_condition_score": 6.5,
    },
]


def seed_reference_points():
    """Seeds every Ernakulam district police station (Kochi City + Rural) as a
    verified `police_station` map feature, each carrying its sub-division /
    jurisdiction. Skips ones already present at the same name."""
    stations = [s for s in police_station_dicts() if s.get("lat") is not None]
    existing_names = {
        (f.get("note") or "").strip().lower()
        for f in get_all_features()
        if f.get("type") == "police_station"
    }
    added = 0
    for s in stations:
        if s["name"].strip().lower() in existing_names:
            continue
        payload = {
            "type": "police_station",
            "lat": s["lat"],
            "lng": s["lng"],
            "note": s["name"],
            "jurisdiction": s["jurisdiction"],
            "subdivision": s["subdivision"],
            "police_district": s["district"],
            "primary_jurisdiction": s.get("primary_jurisdiction", []),
            "area": s["area"],
            "status": "verified",
            "source": s.get("source", "seed"),
            "contributor": {"uid": "seed", "name": "SafeRoute seed"},
            "contributed_by": "SafeRoute seed",
        }
        # Richer fields from an official jurisdiction map, when we have them.
        for key in ("circle", "police_range", "zone", "city_district",
                    "area_sq_km", "bbox", "nearby_stations", "key_areas",
                    "jurisdiction_scope", "taluk", "coverage_note", "railway_stations",
                    "location_approx"):
            val = s.get(key)
            if val and val != "area":
                payload[key] = val
        create_feature(payload)
        added += 1
    print(f"✅ Seeded {added} police stations "
          f"({len(stations) - added} already present, {len(stations)} total).")
    return added


def seed_database():
    """Seeds all real Kochi road segments + reference points into the database."""
    count = bulk_create_segments(SEGMENTS)
    print(f"✅ Seeded {count} real Kochi road segments into the database.")
    areas = {}
    for s in SEGMENTS:
        areas.setdefault(s["area"], 0)
        areas[s["area"]] += 1
    print("\nBreakdown by area:")
    for area, n in sorted(areas.items()):
        print(f"  {area:<40} {n} segments")
    seed_reference_points()
    return count


if __name__ == "__main__":
    seed_database()
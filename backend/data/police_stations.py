"""
Police stations covering the Ernakulam district — Kochi City Police (urban) and
Ernakulam Rural Police.

Two layers, merged by `as_dicts()`:

1. `ernakulam_police_stations.json` — a hand-curated set (15 major stations) with
   a real `primary_jurisdiction` list (the villages / corporation wards each
   station covers). This is the authoritative layer for "which jurisdiction am I
   in".
2. `_PLACES_STATIONS` below — the rest of the district's stations, verified
   against Google Places `type=police` (name + coordinates), carrying only their
   sub-division. Fills in coverage where the curated file is silent.

A station present in both is taken from the JSON (its coordinates + jurisdiction
list win).
"""

import json
import os

_JSON_PATH = os.path.join(os.path.dirname(__file__), "ernakulam_police_stations.json")

# district, sub_division, name, area, lat, lng  — Google-Places-verified
_PLACES_STATIONS = [
    # ---- Kochi City Police ----
    ("Kochi City Police", "Thrikkakara", "Eloor Police Station", "Eloor", 10.074091, 76.300187),
    ("Kochi City Police", "Thrikkakara", "Udayamperoor Police Station", "Udayamperoor", 9.913877, 76.364666),
    ("Kochi City Police", "Ernakulam Central", "Cheranelloor Police Station", "Cheranelloor", 10.056753, 76.287548),
    ("Kochi City Police", "Ernakulam Central", "Mulavukad Police Station", "Mulavukad", 10.014202, 76.256189),
    ("Kochi City Police", "Ernakulam", "Harbour Police Station", "Willingdon Island", 9.960399, 76.268634),
    ("Kochi City Police", "Ernakulam", "Panangad Police Station", "Panangad", 9.907991, 76.316559),
    ("Kochi City Police", "Ernakulam", "Maradu Police Station", "Maradu", 9.93647, 76.32811),
    ("Kochi City Police", "Ernakulam", "Kochi Metro Police Station", "South Kalamassery", 10.047111, 76.318624),
    ("Kochi City Police", "Mattancherry", "Palluruthy Police Station", "Palluruthy", 9.927548, 76.271498),
    ("Kochi City Police", "Mattancherry", "Thoppumpady Police Station", "Thoppumpady", 9.937503, 76.261882),
    ("Kochi City Police", "Mattancherry", "Fort Kochi Tourism Police Station", "Fort Kochi", 9.967034, 76.244061),
    ("Kochi City Police", "City Range", "Cyber Police Station, Kochi Range", "Kacheripady", 9.988848, 76.283869),
    ("Kochi City Police", "City Range", "Cyber Crime Police Station", "Infopark, Kakkanad", 10.007098, 76.361595),
    # ---- Ernakulam Rural Police ----
    ("Ernakulam Rural Police", "Aluva", "Edathala Police Station", "Edathala", 10.089707, 76.394353),
    ("Ernakulam Rural Police", "Aluva", "Aluva West Police Station", "Kottapuram, Aluva", 10.127681, 76.300384),
    ("Ernakulam Rural Police", "Perumbavoor", "Perumbavoor Traffic Police Station", "Perumbavoor", 10.117433, 76.479882),
    ("Ernakulam Rural Police", "Perumbavoor", "Kodanad Police Station", "Kodanad", 10.175862, 76.503625),
    ("Ernakulam Rural Police", "Perumbavoor", "Kalady Police Station", "Kalady", 10.170838, 76.44715),
    ("Ernakulam Rural Police", "Perumbavoor", "Ayyampuzha Police Station", "Ayyampuzha", 10.251102, 76.471903),
    ("Ernakulam Rural Police", "Perumbavoor", "Kuruppampady Police Station", "Kuruppampady", 10.110676, 76.518423),
    ("Ernakulam Rural Police", "Perumbavoor", "Thadiyittaparambu Police Station", "Vazhakulam", 10.086842, 76.429768),
    ("Ernakulam Rural Police", "Muvattupuzha", "Kuttampuzha Police Station", "Kuttampuzha", 10.151121, 76.737112),
    ("Ernakulam Rural Police", "Puthencruz", "Puthencruz Police Station", "Choondi", 9.970199, 76.436132),
    ("Ernakulam Rural Police", "Puthencruz", "Piravom Police Station", "Piravom", 9.865601, 76.489509),
    ("Ernakulam Rural Police", "Puthencruz", "Koothattukulam Police Station", "Koothattukulam", 9.862196, 76.595444),
    ("Ernakulam Rural Police", "Puthencruz", "Mulanthuruthy Police Station", "Mulanthuruthy", 9.901522, 76.392083),
    ("Ernakulam Rural Police", "Puthencruz", "Chottanikkara Police Station", "Chottanikkara", 9.932604, 76.390693),
    ("Ernakulam Rural Police", "Munambam", "Munambam Police Station", "Munambam, Vypin", 10.169578, 76.181363),
    ("Ernakulam Rural Police", "Munambam", "Varapuzha Police Station", "Varapuzha", 10.071045, 76.272283),
    ("Ernakulam Rural Police", "Munambam", "Vadakkekara Police Station", "Vadakkekara", 10.179334, 76.210182),
    ("Ernakulam Rural Police", "Munambam", "Puthenvelikara Police Station", "Puthenvelikara", 10.180971, 76.244701),
    ("Ernakulam Rural Police", "Munambam", "Chengamanad Police Station", "Chengamanad", 10.151999, 76.33847),
    ("Ernakulam Rural Police", "Munambam", "Binanipuram Police Station", "Binanipuram", 10.096153, 76.320737),
    ("Ernakulam Rural Police", "Munambam", "Nedumbassery Police Station", "Nedumbassery", 10.160012, 76.392703),
]


def _norm(name: str) -> str:
    return "".join(c for c in name.lower() if c.isalnum())


def _load_curated() -> list:
    try:
        with open(_JSON_PATH) as f:
            raw = json.load(f).get("police_stations", {})
    except (OSError, ValueError):
        return []
    out = []
    for v in raw.values():
        _jt = v.get("jurisdiction_type")
        if _jt == "City":
            district = "Kochi City Police"
        elif _jt == "Railway":
            district = "Kerala Railway Police"
        else:
            district = "Ernakulam Rural Police"
        subdiv = (v.get("district_division") or "").replace(" Subdivision", "").replace(" SDPO", "").strip()
        out.append({
            "name": v["station_name"],
            "district": district,
            "subdivision": subdiv,
            "jurisdiction": v.get("district_division") or f"{subdiv}, {district}",
            "primary_jurisdiction": v.get("primary_jurisdiction", []),
            "area": v.get("area", ""),
            "lat": v.get("lat"),
            "lng": v.get("lng"),
            "source": v.get("source", "curated"),
            # Optional richer fields from a station's official jurisdiction map.
            "circle": v.get("circle", ""),
            "police_range": v.get("police_range", ""),
            "zone": v.get("zone", ""),
            "city_district": v.get("city_district", ""),
            "area_sq_km": v.get("area_sq_km"),
            "bbox": v.get("bbox"),
            "nearby_stations": v.get("nearby_stations") or {},
            "key_areas": v.get("key_areas", []),
            # Jurisdiction shape: "area" (geographic, default), "city_wide", "railway".
            "jurisdiction_scope": v.get("jurisdiction_scope", "area"),
            "taluk": v.get("taluk", ""),
            "coverage_note": v.get("coverage_note", ""),
            "railway_stations": v.get("railway_stations", []),
            "location_pending": bool(v.get("location_pending")),
            "location_approx": bool(v.get("location_approx")),
        })
    return out


def as_dicts() -> list:
    curated = _load_curated()
    seen = {_norm(s["name"]) for s in curated}
    merged = list(curated)
    for district, subdiv, name, area, lat, lng in _PLACES_STATIONS:
        if _norm(name) in seen:
            continue
        merged.append({
            "name": name,
            "district": district,
            "subdivision": subdiv,
            "jurisdiction": f"{subdiv} sub-division, {district}",
            "primary_jurisdiction": [],
            "area": area,
            "lat": lat,
            "lng": lng,
            "source": "google_places",
            "circle": "",
            "police_range": "",
            "zone": "",
            "city_district": "",
            "area_sq_km": None,
            "bbox": None,
            "nearby_stations": {},
            "key_areas": [],
            "jurisdiction_scope": "area",
            "taluk": "",
            "coverage_note": "",
            "railway_stations": [],
            "location_pending": False,
            "location_approx": False,
        })
    return merged

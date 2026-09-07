"""
Curated list of recurring / annual public events in and around Kochi.

This is a hand-maintained reference list (not a live feed). Dates are the
usual window each event runs; the /api/events endpoint filters to whatever
is still upcoming relative to the current date and is safe to refresh here
each season.
"""

KOCHI_EVENTS = [
    {
        "id": "evt_onam_broadway",
        "title": "Onam Week Shopping Festival",
        "category": "Festival",
        "venue": "Broadway Market & MG Road",
        "area": "Ernakulam",
        "lat": 9.9835, "lng": 76.2897,
        "start_date": "2026-09-05", "end_date": "2026-09-14",
        "url": "https://www.keralatourism.org/onam/",
        "note": "Heavy pedestrian crowds in the evenings; expect diversions near Broadway.",
    },
    {
        "id": "evt_spice_marathon",
        "title": "Spice Coast Marathon",
        "category": "Sports",
        "venue": "Fort Kochi Parade Ground",
        "area": "Fort Kochi",
        "lat": 9.9663, "lng": 76.2422,
        "start_date": "2026-11-08", "end_date": "2026-11-08",
        "url": "https://spicecoastmarathon.com/",
        "note": "Road closures across Fort Kochi and Mattancherry from 4am to noon.",
    },
    {
        "id": "evt_cochin_carnival",
        "title": "Cochin Carnival",
        "category": "Festival",
        "venue": "Fort Kochi Beach & Parade Ground",
        "area": "Fort Kochi",
        "lat": 9.9667, "lng": 76.2410,
        "start_date": "2026-12-24", "end_date": "2027-01-01",
        "url": "https://cochincarnival.com/",
        "note": "New Year procession on Jan 1 draws large crowds; parking near the beach is closed.",
    },
    {
        "id": "evt_biennale",
        "title": "Kochi-Muziris Biennale",
        "category": "Art",
        "venue": "Aspinwall House & venues across Fort Kochi",
        "area": "Fort Kochi",
        "lat": 9.9635, "lng": 76.2430,
        "start_date": "2026-12-12", "end_date": "2027-04-10",
        "url": "https://www.kochimuzirisbiennale.org/",
        "note": "Contemporary art across multiple heritage venues; busiest on weekends.",
    },
    {
        "id": "evt_marine_drive_food",
        "title": "Marine Drive Food & Craft Fest",
        "category": "Food",
        "venue": "Marine Drive Walkway",
        "area": "Marine Drive",
        "lat": 9.9790, "lng": 76.2780,
        "start_date": "2026-10-17", "end_date": "2026-10-26",
        "url": "",
        "note": "Waterfront stalls; well-lit and patrolled through late evening.",
    },
    {
        "id": "evt_ernakulathappan_utsavam",
        "title": "Ernakulathappan Utsavam",
        "category": "Temple festival",
        "venue": "Ernakulathappan Temple, Durbar Hall Road",
        "area": "Ernakulam",
        "lat": 9.9788, "lng": 76.2855,
        "start_date": "2027-01-20", "end_date": "2027-01-27",
        "url": "",
        "note": "Caparisoned elephant processions; MG Road traffic restrictions on the final two days.",
    },
    {
        "id": "evt_lulu_expo",
        "title": "Kerala Shopping Festival @ Lulu Mall",
        "category": "Expo",
        "venue": "Lulu Mall, Edappally",
        "area": "Edappally",
        "lat": 10.0274, "lng": 76.3084,
        "start_date": "2026-12-01", "end_date": "2027-01-15",
        "url": "https://www.lulumall.in/",
        "note": "Expect NH 544 congestion around Edappally junction on weekends.",
    },
    {
        "id": "evt_kochi_metro_mela",
        "title": "Kochi Water Metro Boat Mela",
        "category": "Community",
        "venue": "Vyttila Water Metro Terminal",
        "area": "Vyttila",
        "lat": 9.9680, "lng": 76.3190,
        "start_date": "2026-09-27", "end_date": "2026-09-28",
        "url": "",
        "note": "Family event at the terminal; extra shuttle services from Vyttila Hub.",
    },
]

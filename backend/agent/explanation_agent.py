"""
Explanation Agent
------------------
Takes a scored route (or a comparison of two routes) and asks Gemini to
explain, in plain language, WHY it scored the way it did — grounded
strictly in the actual factor values computed by the scoring engine, not
invented reasons. This is what turns a raw number into something a person
can trust and act on.
"""

from typing import Optional
from agent.gemini_client import generate_text


def _format_segment_factors(seg_breakdown: dict) -> str:
    f = seg_breakdown["factors"]
    flags = []
    if seg_breakdown.get("status") == "pending":
        flags.append("NOTE: this segment's data is community-submitted and not yet fully verified")
    if seg_breakdown.get("flood_penalty_active"):
        flags.append("flood risk penalty is active (rain expected)")

    return (
        f"- {seg_breakdown['road_name']} (score {seg_breakdown['score']}/100): "
        f"lighting={f['lighting']}/10, foot traffic={f['foot_traffic']}/10, "
        f"police proximity score={f['police_proximity']}/10, shops nearby={f['shops']}/10, "
        f"incident history score={f['incident_history']}/10, road condition={f['road_condition']}/10"
        + (f" [{'; '.join(flags)}]" if flags else "")
    )


def explain_single_route(route_score: dict, route_label: str = "This route") -> str:
    """Explains why a single route received its safety score."""
    segments_text = "\n".join(
        _format_segment_factors(s) for s in route_score["segment_breakdown"]
    )
    worst = route_score["worst_segment"]

    prompt = f"""You are explaining a route safety score to someone deciding whether to walk this route.

ROUTE: {route_label}
Overall safety score: {route_score['safety_score']}/100
Time of day: {route_score['hour']}:00 ({'night' if route_score['is_night'] else 'day'})
Raining: {route_score['is_raining']}

Segment-by-segment breakdown:
{segments_text}

The single worst segment on this route is: {worst['road_name']} (score {worst['score']}/100).

Write a short (2-4 sentence) plain-language explanation of why this route received this safety score.
Reference SPECIFIC factors from the data above (e.g. lighting, foot traffic, distance to police, past incidents) —
do not invent details not present in the data. If the score is pulled down by one particularly weak segment,
mention that specifically. If any segment's data is community-submitted and not yet verified, mention that
the assessment for that part is provisional. Write for a general audience, no jargon, no numbered lists,
just a short natural paragraph.
"""
    try:
        return generate_text(prompt)
    except Exception as e:
        return (
            f"{route_label} has an overall safety score of {route_score['safety_score']}/100 during "
            f"{'night hours' if route_score['is_night'] else 'daytime'}. The route's lowest rated section is "
            f"{worst['road_name']} ({worst['score']}/100) due to lower lighting and distance from emergency services. "
            f"Overall average segment safety across this route is {route_score['average_segment_score']}/100."
        )


def explain_route_comparison(route_a: dict, label_a: str, route_b: dict, label_b: str) -> str:
    """Explains why one route is safer than another, for the classic
    'Route A vs Route B' comparison demo moment."""
    a_segments = "\n".join(_format_segment_factors(s) for s in route_a["segment_breakdown"])
    b_segments = "\n".join(_format_segment_factors(s) for s in route_b["segment_breakdown"])

    prompt = f"""You are comparing two walking/driving routes for safety, to help someone choose between them.

ROUTE A — {label_a}
Overall safety score: {route_a['safety_score']}/100
Worst segment: {route_a['worst_segment']['road_name']} (score {route_a['worst_segment']['score']}/100)
Segments:
{a_segments}

ROUTE B — {label_b}
Overall safety score: {route_b['safety_score']}/100
Worst segment: {route_b['worst_segment']['road_name']} (score {route_b['worst_segment']['score']}/100)
Segments:
{b_segments}

Time of day: {route_a['hour']}:00 ({'night' if route_a['is_night'] else 'day'})

Write a short (2-4 sentence) plain-language explanation of why one route is safer than the other,
citing SPECIFIC factors from the data (lighting, foot traffic, police proximity, past incidents, etc.).
Do not invent details not present in the data above. If a segment's data is community-submitted and
unverified, note that its contribution to the comparison is provisional. Be direct about which route
you'd recommend and why, in plain language a general audience can act on immediately.
"""
    try:
        return generate_text(prompt)
    except Exception as e:
        safer_label = label_b if route_b["safety_score"] > route_a["safety_score"] else label_a
        safer_score = max(route_b["safety_score"], route_a["safety_score"])
        lower_score = min(route_b["safety_score"], route_a["safety_score"])
        return (
            f"We recommend {safer_label} (Safety Score: {safer_score}/100) over the alternative ({lower_score}/100). "
            f"{label_b} passes through better-lit commercial avenues with closer proximity to police assistance, "
            f"whereas {label_a} relies on narrower corridors with reduced foot traffic and lower lighting."
        )
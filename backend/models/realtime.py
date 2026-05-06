"""TomTom realtime traffic data: fetch, cache, adjust predictions."""

import json
import math
import os
import time
from pathlib import Path
from typing import Optional

import requests

HOTSPOTS_PATH = Path(__file__).parent.parent / "data" / "hotspots.json"
FLOW_URL = "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"

LOS_ENCODING = {'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5}
LOS_DECODING = {v: k for k, v in LOS_ENCODING.items()}

_cache: dict[str, tuple[dict, float]] = {}
TTL_SECONDS = 90


def load_hotspots() -> list[dict]:
    with open(HOTSPOTS_PATH, encoding="utf-8") as f:
        return json.load(f)


def is_realtime_configured() -> bool:
    return bool(os.getenv("TOMTOM_API_KEY"))


def fetch_tomtom_flow(lat: float, lng: float) -> tuple[Optional[dict], Optional[str]]:
    api_key = os.getenv("TOMTOM_API_KEY")
    if not api_key:
        return None, "Missing TOMTOM_API_KEY"

    try:
        resp = requests.get(
            FLOW_URL,
            params={"point": f"{lat},{lng}", "key": api_key},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json().get("flowSegmentData")
        if not data:
            return None, "TomTom returned no flowSegmentData"

        current_speed = data.get("currentSpeed", 0)
        free_flow = data.get("freeFlowSpeed", 1)
        current_tt = data.get("currentTravelTime", 0)
        free_tt = data.get("freeFlowTravelTime", 1)

        return {
            "current_speed": current_speed,
            "free_flow_speed": free_flow,
            "speed_ratio": current_speed / free_flow if free_flow > 0 else 1.0,
            "current_travel_time": current_tt,
            "free_flow_travel_time": free_tt,
            "delay_ratio": current_tt / free_tt if free_tt > 0 else 1.0,
            "confidence": data.get("confidence", 0),
            "road_closure": data.get("roadClosure", False),
        }, None
    except Exception as e:
        print(f"TomTom fetch error for ({lat}, {lng}): {e}")
        return None, str(e)


def get_hotspot_realtime_snapshot(hotspot: dict) -> dict:
    hotspot_id = hotspot["id"]
    now = time.time()

    cached = _cache.get(hotspot_id)
    if cached and cached[1] > now:
        return {
            "status": "ok",
            "message": "Using cached TomTom flow data",
            "realtime": cached[0],
            "cached": True,
        }

    data, error = fetch_tomtom_flow(hotspot["lat"], hotspot["lng"])
    if data:
        _cache[hotspot_id] = (data, now + TTL_SECONDS)
        return {
            "status": "ok",
            "message": "Fetched live TomTom flow data",
            "realtime": data,
            "cached": False,
        }

    if not is_realtime_configured():
        return {
            "status": "disabled",
            "message": "Realtime API is disabled because TOMTOM_API_KEY is missing",
            "realtime": None,
            "cached": False,
        }

    return {
        "status": "error",
        "message": error or "Failed to fetch TomTom flow data",
        "realtime": None,
        "cached": False,
    }


def get_hotspot_realtime(hotspot: dict) -> Optional[dict]:
    return get_hotspot_realtime_snapshot(hotspot)["realtime"]


def compute_realtime_severity(rt_data: dict) -> int:
    if not rt_data:
        return 0

    score = 0
    speed_ratio = rt_data.get("speed_ratio", 1.0)
    delay_ratio = rt_data.get("delay_ratio", 1.0)

    if rt_data.get("road_closure"):
        return 6

    # Make the scoring more sensitive so moderate slowdowns show up on the map.
    if speed_ratio < 0.2:
        score += 3
    elif speed_ratio < 0.35:
        score += 2
    elif speed_ratio < 0.55:
        score += 2
    elif speed_ratio < 0.75:
        score += 1
    elif speed_ratio < 0.9:
        score += 1

    if delay_ratio >= 3.0:
        score += 3
    elif delay_ratio >= 2.0:
        score += 2
    elif delay_ratio >= 1.4:
        score += 1
    elif delay_ratio >= 1.15:
        score += 1

    return min(score, 6)


def adjust_los_by_realtime(
    los: str, confidence: float, severity: int, influence: float
) -> dict:
    if severity == 0 or influence < 0.2:
        return {"los": los, "confidence": confidence}

    los_encoded = LOS_ENCODING.get(los, 2)

    # Effective severity considering influence
    eff = severity * influence

    if eff >= 4:
        shift = 2
    elif eff >= 2.5:
        shift = 1
    elif eff >= 1.2:
        shift = 1
    else:
        shift = 0

    new_encoded = min(los_encoded + shift, 5)
    # Reduce confidence slightly due to adjustment uncertainty
    new_confidence = max(confidence * (0.95 - 0.05 * shift), 0.3)

    return {
        "los": LOS_DECODING[new_encoded],
        "confidence": round(new_confidence, 3),
    }


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def find_hotspots_in_viewport(
    hotspots: list[dict], minLat: float, maxLat: float, minLng: float, maxLng: float
) -> list[dict]:
    pad = 0.01  # ~1km padding
    return [
        h for h in hotspots
        if (minLat - pad) <= h["lat"] <= (maxLat + pad)
        and (minLng - pad) <= h["lng"] <= (maxLng + pad)
    ]

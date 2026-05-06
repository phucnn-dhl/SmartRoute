from fastapi import APIRouter

from models.realtime import (
    load_hotspots,
    get_hotspot_realtime_snapshot,
    compute_realtime_severity,
    is_realtime_configured,
)

router = APIRouter()

_hotspots = load_hotspots()


@router.get("/hotspots")
def get_hotspots():
    result = []
    for h in _hotspots:
        entry = {**h}
        snapshot = get_hotspot_realtime_snapshot(h)
        rt = snapshot["realtime"]
        if rt:
            rt["severity"] = compute_realtime_severity(rt)
        entry["realtime"] = rt
        entry["realtime_status"] = snapshot["status"]
        entry["realtime_message"] = snapshot["message"]
        result.append(entry)
    return {
        "hotspots": result,
        "total": len(result),
        "realtime_enabled": is_realtime_configured(),
    }


@router.get("/hotspots/realtime")
def get_hotspots_realtime():
    result = []
    for h in _hotspots:
        snapshot = get_hotspot_realtime_snapshot(h)
        rt = snapshot["realtime"]
        entry = {
            "id": h["id"],
            "name": h["name"],
            "realtime": rt,
            "realtime_status": snapshot["status"],
            "realtime_message": snapshot["message"],
        }
        if rt:
            entry["severity"] = compute_realtime_severity(rt)
        result.append(entry)
    return {"hotspots": result, "realtime_enabled": is_realtime_configured()}

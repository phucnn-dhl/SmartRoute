from datetime import datetime
from fastapi import APIRouter, Query, Depends
from typing import Optional

from db.database import get_db
from models.xgboost_model import TrafficModel
from models.realtime import (
    load_hotspots, find_hotspots_in_viewport,
    get_hotspot_realtime, compute_realtime_severity,
    adjust_los_by_realtime, haversine_meters,
)
from schemas.responses import SegmentsResponse, SegmentResponse

router = APIRouter()

_hotspots = load_hotspots()


def get_model():
    from main import model
    return model


@router.get("/segments", response_model=SegmentsResponse)
def get_segments(
    minLat: float = Query(...),
    minLng: float = Query(...),
    maxLat: float = Query(...),
    maxLng: float = Query(...),
    streetLevelMax: Optional[int] = Query(None),
    hour: Optional[int] = Query(None),
    minute: int = Query(0),
    weekday: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    day_of_month: Optional[int] = Query(None),
    includePrediction: bool = Query(True),
    model: TrafficModel = Depends(get_model),
):
    now = datetime.now()
    hour = hour if hour is not None else now.hour
    weekday = weekday if weekday is not None else now.weekday()
    ds_weekday = (weekday + 1) % 7

    month = month or now.month
    day_of_month = day_of_month or now.day

    with get_db() as conn:
        query = """
            SELECT * FROM segments
            WHERE (
                (lat_snode BETWEEN ? AND ? AND long_snode BETWEEN ? AND ?)
                OR
                (lat_enode BETWEEN ? AND ? AND long_enode BETWEEN ? AND ?)
            )
        """
        params = [minLat, maxLat, minLng, maxLng, minLat, maxLat, minLng, maxLng]

        if streetLevelMax is not None:
            query += " AND street_level <= ?"
            params.append(streetLevelMax)

        rows = conn.execute(query, params).fetchall()

        # Batch predict all segments at once
        predictions = {}
        if includePrediction and model.model is not None and rows:
            try:
                predictions = model.predict_viewport(
                    conn, rows, hour, minute, ds_weekday,
                    month, day_of_month, "2021-04-20",
                )
            except Exception:
                predictions = {}

        # Realtime adjustment for segments near hotspots
        hotspots_in_view = find_hotspots_in_viewport(
            _hotspots, minLat, maxLat, minLng, maxLng,
        )
        realtime_data = {}
        for h in hotspots_in_view:
            rt = get_hotspot_realtime(h)
            if rt:
                rt["severity"] = compute_realtime_severity(rt)
                realtime_data[h["id"]] = (h, rt)

        segments = []
        for row in rows:
            seg = SegmentResponse(
                segment_id=row['segment_id'],
                s_lat=row['lat_snode'],
                s_lng=row['long_snode'],
                e_lat=row['lat_enode'],
                e_lng=row['long_enode'],
                street_name=row['street_name'] or '',
                street_level=row['street_level'],
                max_velocity=row['max_velocity'],
                length=row['length'],
            )

            if includePrediction:
                pred = predictions.get(row['segment_id'])
                if pred:
                    seg.los = pred.get('los', 'C')
                    seg.confidence = pred.get('confidence', 0.0)
                    has_xgb = row['has_xgboost_data'] if 'has_xgboost_data' in row.keys() else False
                    seg.prediction_source = "xgboost" if has_xgb else "heuristic"
                else:
                    seg.los = 'C'
                    seg.confidence = 0.0
                    seg.prediction_source = "heuristic"

                # Apply realtime adjustment
                if realtime_data and seg.los:
                    seg_mid_lat = (row['lat_snode'] + row['lat_enode']) / 2
                    seg_mid_lng = (row['long_snode'] + row['long_enode']) / 2

                    best_influence = 0
                    best_adjustment = None
                    best_info = None

                    for hid, (h, rt) in realtime_data.items():
                        dist = haversine_meters(
                            seg_mid_lat, seg_mid_lng,
                            h["lat"], h["lng"],
                        )
                        if dist < h["radius_meters"]:
                            influence = max(0, 1 - dist / h["radius_meters"])
                            if influence > best_influence and rt["severity"] >= 1:
                                best_influence = influence
                                best_adjustment = adjust_los_by_realtime(
                                    seg.los, seg.confidence or 0.5,
                                    rt["severity"], influence,
                                )
                                best_info = {
                                    "hotspot_id": h["id"],
                                    "hotspot_name": h["name"],
                                    "severity": rt["severity"],
                                    "speed_ratio": round(rt.get("speed_ratio", 1), 2),
                                    "delay_ratio": round(rt.get("delay_ratio", 1), 2),
                                    "influence": round(influence, 2),
                                    "distance_meters": round(dist),
                                }

                    if best_info:
                        seg.prediction_source = "xgboost_realtime"
                        seg.realtime_info = best_info
                    if best_adjustment and best_adjustment["los"] != seg.los:
                        seg.los = best_adjustment["los"]
                        seg.confidence = best_adjustment["confidence"]

            segments.append(seg)

    return SegmentsResponse(
        segments=segments,
        total=len(segments),
        prediction_time={'hour': hour, 'minute': minute, 'weekday': weekday},
    )

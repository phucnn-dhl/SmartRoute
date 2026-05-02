from datetime import datetime
from fastapi import APIRouter, Query, Depends
from typing import Optional

from db.database import get_db
from models.xgboost_model import TrafficModel
from models.preprocessor import heuristic_predict
from schemas.responses import SegmentsResponse, SegmentResponse

router = APIRouter()


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
                else:
                    seg.los = 'C'
                    seg.confidence = 0.0

            segments.append(seg)

    return SegmentsResponse(
        segments=segments,
        total=len(segments),
        prediction_time={'hour': hour, 'minute': minute, 'weekday': weekday},
    )

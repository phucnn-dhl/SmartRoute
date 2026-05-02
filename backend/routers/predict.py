from datetime import datetime
from fastapi import APIRouter, Depends

from db.database import get_db
from models.xgboost_model import TrafficModel
from schemas.requests import PredictRequest
from schemas.responses import PredictResponse, PredictionResult

router = APIRouter()


def get_model():
    from main import model
    return model


@router.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest, model: TrafficModel = Depends(get_model)):
    now = datetime.now()
    month = req.month or now.month
    day_of_month = req.day_of_month or now.day
    # Use a representative date for lag lookups from historical data
    date = "2021-04-20"

    with get_db() as conn:
        results = model.predict_batch(
            conn, req.segment_ids,
            req.hour, req.minute, req.weekday,
            month, day_of_month, date,
        )

    return PredictResponse(
        predictions=[PredictionResult(**r) for r in results],
        model_version="xgboost_full_v1",
        feature_count=23,
    )
